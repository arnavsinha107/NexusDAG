from app.clock import duration_ms
from app.models import Run
from app.schemas import NodeRunRead, RunRead, RunSummary


def run_summary(run: Run, workflow_name: str) -> RunSummary:
    return RunSummary.model_validate(
        {
            "id": run.id,
            "workflow_id": run.workflow_id,
            "workflow_name": workflow_name,
            "status": run.status,
            "error": run.error,
            "created_at": run.created_at,
            "started_at": run.started_at,
            "finished_at": run.finished_at,
            "duration_ms": duration_ms(run.started_at, run.finished_at),
        }
    )


def run_detail(run: Run, workflow_name: str) -> RunRead:
    return RunRead.model_validate(
        {
            **run_summary(run, workflow_name).model_dump(),
            "inputs": run.inputs,
            "outputs": run.outputs,
            "graph": run.graph,
            "node_runs": [NodeRunRead.model_validate(node_run) for node_run in run.node_runs],
        }
    )
