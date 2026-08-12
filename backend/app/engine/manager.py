import asyncio
import logging
import uuid
from functools import partial

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.clock import utcnow
from app.config import Settings
from app.engine.broker import RunBroker
from app.engine.executor import DAGExecutor, NodeState
from app.models import NodeRun, Run
from app.schemas import Graph, RunStatus
from app.services.container import Services

logger = logging.getLogger(__name__)


class RunManager:
    """Owns the lifecycle of background runs: admission, execution, cancellation, persistence."""

    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        services: Services,
        broker: RunBroker,
        settings: Settings,
    ) -> None:
        self._sessionmaker = sessionmaker
        self._services = services
        self._broker = broker
        self._settings = settings
        self._slots = asyncio.Semaphore(settings.max_concurrent_runs)
        self._tasks: dict[uuid.UUID, tuple[uuid.UUID, asyncio.Task[None]]] = {}

    @property
    def active_count(self) -> int:
        return len(self._tasks)

    def start(
        self, run_id: uuid.UUID, workflow_id: uuid.UUID, graph: Graph, inputs: dict[str, str]
    ) -> None:
        self._broker.open(run_id)
        task = asyncio.create_task(self._execute(run_id, graph, inputs), name=f"run-{run_id}")
        self._tasks[run_id] = (workflow_id, task)
        task.add_done_callback(lambda _: self._tasks.pop(run_id, None))

    def cancel(self, run_id: uuid.UUID) -> bool:
        entry = self._tasks.get(run_id)
        if entry is None:
            return False
        entry[1].cancel()
        return True

    def cancel_workflow(self, workflow_id: uuid.UUID) -> None:
        for owner, task in list(self._tasks.values()):
            if owner == workflow_id:
                task.cancel()

    async def shutdown(self) -> None:
        tasks = [task for _, task in self._tasks.values()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

    async def recover_interrupted(self) -> None:
        async with self._sessionmaker() as session:
            result = await session.execute(
                update(Run)
                .where(Run.status.in_(("queued", "running")))
                .values(
                    status="failed",
                    error="Interrupted by a server restart.",
                    finished_at=utcnow(),
                )
            )
            await session.commit()
        if result.rowcount:
            logger.warning("Marked %d interrupted run(s) as failed", result.rowcount)

    async def _execute(self, run_id: uuid.UUID, graph: Graph, inputs: dict[str, str]) -> None:
        publish = partial(self._broker.publish, run_id)
        executor = DAGExecutor(graph, self._services, publish, self._settings.node_timeout_seconds)
        status: RunStatus = "failed"
        outputs: dict[str, str] = {}
        error: str | None = None
        try:
            async with self._slots:
                await self._mark_started(run_id)
                await publish("run.started", None, {"node_ids": list(executor.states)})
                outcome = await executor.run(inputs)
            status = "succeeded" if outcome.succeeded else "failed"
            outputs, error = outcome.outputs, outcome.error
        except asyncio.CancelledError:
            status, error = "cancelled", "Cancelled before completion."
        except Exception as exc:
            logger.exception("Run %s crashed", run_id)
            error = f"Internal error: {exc}"

        try:
            await self._persist(run_id, status, outputs, error, executor.states)
        except Exception:
            logger.exception("Failed to persist run %s", run_id)
        await publish("run.finished", None, {"status": status, "outputs": outputs, "error": error})
        self._broker.close(run_id)

    async def _mark_started(self, run_id: uuid.UUID) -> None:
        async with self._sessionmaker() as session:
            await session.execute(
                update(Run).where(Run.id == run_id).values(status="running", started_at=utcnow())
            )
            await session.commit()

    async def _persist(
        self,
        run_id: uuid.UUID,
        status: RunStatus,
        outputs: dict[str, str],
        error: str | None,
        states: dict[str, NodeState],
    ) -> None:
        async with self._sessionmaker() as session:
            run = await session.get(Run, run_id)
            if run is None:
                return
            run.status = status
            run.outputs = outputs
            run.error = error
            run.finished_at = utcnow()
            session.add_all(
                NodeRun(
                    run_id=run_id,
                    node_id=state.node.id,
                    node_type=state.node.type,
                    status="skipped" if state.status in ("pending", "running") else state.status,
                    started_at=state.started_at,
                    finished_at=state.finished_at,
                    output_text=state.result.text if state.result else "",
                    output_data=state.result.data if state.result else {},
                    error=state.error,
                    logs=state.logs,
                )
                for state in states.values()
            )
            await session.commit()
