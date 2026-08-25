import asyncio
import logging
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.clock import duration_ms, utcnow
from app.engine.nodes import NodeContext, NodeResult, execute_node
from app.schemas import Graph, GraphEdge, GraphNode, NodeStatus, OutputNode
from app.services.container import Services

logger = logging.getLogger(__name__)

Emit = Callable[[str, str | None, dict[str, Any]], Awaitable[None]]


@dataclass
class NodeState:
    node: GraphNode
    status: NodeStatus = "pending"
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: NodeResult | None = None
    error: str | None = None
    logs: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ExecutionOutcome:
    succeeded: bool
    outputs: dict[str, str]
    error: str | None = None


class DAGExecutor:
    """Executes a validated graph with maximal parallelism.

    Scheduling is Kahn's algorithm driven by completion events: a node becomes ready when
    every incoming edge has resolved, and all ready nodes run concurrently. An edge is
    *active* only if its source succeeded and, for routers, the chosen route matches the
    edge's handle. A ready node with no active incoming edge is skipped, and skips cascade
    so untaken router branches never execute. The first node failure cancels in-flight
    siblings and fails the run.
    """

    def __init__(
        self, graph: Graph, services: Services, emit: Emit, node_timeout: float
    ) -> None:
        self._services = services
        self._emit = emit
        self._timeout = node_timeout
        self._incoming: defaultdict[str, list[GraphEdge]] = defaultdict(list)
        self._outgoing: defaultdict[str, list[GraphEdge]] = defaultdict(list)
        for edge in graph.edges:
            self._incoming[edge.target].append(edge)
            self._outgoing[edge.source].append(edge)
        self.states: dict[str, NodeState] = {node.id: NodeState(node) for node in graph.nodes}

    async def run(self, inputs: Mapping[str, str]) -> ExecutionOutcome:
        unresolved = {node_id: len(self._incoming[node_id]) for node_id in self.states}
        ready = deque(node_id for node_id, count in unresolved.items() if count == 0)
        running: dict[asyncio.Task[None], str] = {}

        def resolve_outgoing(node_id: str) -> None:
            for edge in self._outgoing[node_id]:
                unresolved[edge.target] -= 1
                if unresolved[edge.target] == 0:
                    ready.append(edge.target)

        try:
            while ready or running:
                while ready:
                    node_id = ready.popleft()
                    incoming = self._incoming[node_id]
                    if incoming and not any(self._is_active(edge) for edge in incoming):
                        await self._finish_unrun(node_id, "No active upstream branch.")
                        resolve_outgoing(node_id)
                        continue
                    task = asyncio.create_task(self._execute(node_id, inputs))
                    running[task] = node_id

                if not running:
                    break
                done, _ = await asyncio.wait(running, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    node_id = running.pop(task)
                    state = self.states[node_id]
                    if state.status == "failed":
                        await self._abort(running, "Run stopped after an upstream failure.")
                        return ExecutionOutcome(
                            succeeded=False,
                            outputs=self._outputs(),
                            error=f"{state.node.display_name}: {state.error}",
                        )
                    resolve_outgoing(node_id)
        except asyncio.CancelledError:
            await self._abort(running, "Run cancelled.")
            raise

        return ExecutionOutcome(succeeded=True, outputs=self._outputs())

    def _is_active(self, edge: GraphEdge) -> bool:
        source = self.states[edge.source]
        if source.status != "succeeded" or source.result is None:
            return False
        route = source.result.route
        return route is None or edge.source_handle == route

    def _scope(self, inputs: Mapping[str, str], upstream: str) -> dict[str, Any]:
        return {
            "inputs": dict(inputs),
            "upstream": upstream,
            "nodes": {
                node_id: {"text": state.result.text, "data": state.result.data}
                for node_id, state in self.states.items()
                if state.result is not None
            },
        }

    async def _execute(self, node_id: str, inputs: Mapping[str, str]) -> None:
        state = self.states[node_id]
        state.status = "running"
        state.started_at = utcnow()
        await self._emit("node.started", node_id, {"node_type": state.node.type})

        parents = {
            edge.source: self.states[edge.source]
            for edge in self._incoming[node_id]
            if self._is_active(edge)
        }
        upstream = "\n\n".join(
            parent.result.text for parent in parents.values() if parent.result and parent.result.text
        )

        async def emit(event_type: str, data: dict[str, Any]) -> None:
            await self._emit(event_type, node_id, data)

        ctx = NodeContext(
            node=state.node,
            inputs=inputs,
            upstream=upstream,
            scope=self._scope(inputs, upstream),
            services=self._services,
            emit=emit,
            logs=state.logs,
        )
        try:
            result = await asyncio.wait_for(execute_node(ctx), timeout=self._timeout)
        except TimeoutError:
            await self._fail(state, f"Timed out after {self._timeout:.0f}s.")
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("Node %s failed: %s", node_id, exc, exc_info=True)
            await self._fail(state, str(exc) or exc.__class__.__name__)
        else:
            state.status = "succeeded"
            state.result = result
            state.finished_at = utcnow()
            await self._emit(
                "node.completed",
                node_id,
                {
                    "text": result.text,
                    "data": result.data,
                    "route": result.route,
                    "duration_ms": duration_ms(state.started_at, state.finished_at),
                },
            )

    async def _fail(self, state: NodeState, error: str) -> None:
        state.status = "failed"
        state.error = error
        state.finished_at = utcnow()
        await self._emit("node.failed", state.node.id, {"error": error})

    async def _finish_unrun(self, node_id: str, reason: str) -> None:
        state = self.states[node_id]
        state.status = "skipped"
        state.finished_at = utcnow() if state.started_at else None
        state.logs.append(reason)
        await self._emit("node.skipped", node_id, {"reason": reason})

    async def _abort(self, running: dict[asyncio.Task[None], str], reason: str) -> None:
        for task in running:
            task.cancel()
        await asyncio.gather(*running, return_exceptions=True)
        running.clear()
        for node_id, state in self.states.items():
            if state.status in ("pending", "running"):
                await self._finish_unrun(node_id, reason)

    def _outputs(self) -> dict[str, str]:
        return {
            state.node.config.key: state.result.text
            for state in self.states.values()
            if isinstance(state.node, OutputNode) and state.result is not None
        }
