import json
import uuid

from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import ManagerDep, SessionDep
from app.api.serializers import run_detail, run_summary
from app.engine.broker import RunBroker
from app.models import Run, Workflow
from app.schemas import RunPage, RunRead, RunStatus, RunSummary

router = APIRouter(prefix="/runs", tags=["runs"])


async def _get_run_with_workflow(session: AsyncSession, run_id: uuid.UUID) -> tuple[Run, str]:
    stmt = (
        select(Run, Workflow.name)
        .join(Workflow, Workflow.id == Run.workflow_id)
        .options(selectinload(Run.node_runs))
        .where(Run.id == run_id)
    )
    result = (await session.execute(stmt)).first()
    if result is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found.")
    run, workflow_name = result
    return run, workflow_name


@router.get("", response_model=RunPage)
async def list_runs(
    session: SessionDep,
    workflow_id: uuid.UUID | None = None,
    status_filter: RunStatus | None = Query(None, alias="status"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> RunPage:
    base_query = select(Run, Workflow.name).join(Workflow, Workflow.id == Run.workflow_id)
    count_query = select(func.count(Run.id))

    if workflow_id:
        base_query = base_query.where(Run.workflow_id == workflow_id)
        count_query = count_query.where(Run.workflow_id == workflow_id)
    if status_filter:
        base_query = base_query.where(Run.status == status_filter)
        count_query = count_query.where(Run.status == status_filter)

    total = (await session.execute(count_query)).scalar_one()

    stmt = (
        base_query.order_by(Run.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await session.execute(stmt)).all()
    items = [run_summary(run, wf_name) for run, wf_name in rows]

    return RunPage(items=items, total=total)


@router.get("/{run_id}", response_model=RunRead)
async def get_run(run_id: uuid.UUID, session: SessionDep) -> RunRead:
    run, workflow_name = await _get_run_with_workflow(session, run_id)
    return run_detail(run, workflow_name)


@router.post("/{run_id}/cancel", response_model=RunSummary)
async def cancel_run(run_id: uuid.UUID, session: SessionDep, manager: ManagerDep) -> RunSummary:
    run, workflow_name = await _get_run_with_workflow(session, run_id)
    if run.status in ("succeeded", "failed", "cancelled"):
        return run_summary(run, workflow_name)

    cancelled = manager.cancel(run_id)
    if not cancelled:
        # Mark as cancelled directly if task was not actively held
        run.status = "cancelled"
        run.error = "Cancelled by user."
        await session.commit()

    return run_summary(run, workflow_name)


@router.websocket("/ws/{run_id}")
async def stream_run_websocket(websocket: WebSocket, run_id: uuid.UUID):
    await websocket.accept()
    broker: RunBroker = websocket.app.state.broker

    async with broker.subscribe(run_id) as subscriber:
        if subscriber is None:
            # Channel is no longer open in broker (or never existed); fetch static state from DB
            from app.db import SessionLocal
            async with SessionLocal() as session:
                try:
                    run, _ = await _get_run_with_workflow(session, run_id)
                    await websocket.send_text(json.dumps({
                        "seq": 0,
                        "type": "run.snapshot",
                        "run_id": str(run.id),
                        "node_id": None,
                        "ts": run.created_at.isoformat(),
                        "data": {
                            "status": run.status,
                            "outputs": run.outputs,
                            "error": run.error,
                            "nodes": [
                                {
                                    "node_id": nr.node_id,
                                    "status": nr.status,
                                    "output_text": nr.output_text,
                                    "output_data": nr.output_data,
                                    "error": nr.error,
                                    "logs": nr.logs,
                                }
                                for nr in run.node_runs
                            ]
                        }
                    }))
                except Exception:
                    await websocket.send_text(json.dumps({
                        "seq": 0,
                        "type": "error",
                        "run_id": str(run_id),
                        "node_id": None,
                        "ts": "",
                        "data": {"message": "Run not found"}
                    }))
            await websocket.close()
            return

        history, queue = subscriber

        try:
            # Replay historical events first
            for event in history:
                await websocket.send_text(json.dumps(event))

            # Stream live events until queue signals completion (None)
            while True:
                event = await queue.get()
                if event is None:
                    break
                await websocket.send_text(json.dumps(event))
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            try:
                await websocket.close()
            except Exception:
                pass
