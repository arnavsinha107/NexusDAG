import uuid

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ManagerDep, SessionDep
from app.api.serializers import run_summary
from app.engine.graph import GraphIssue, validate_graph
from app.models import Run, Workflow
from app.schemas import (
    Graph,
    InputNode,
    RunCreate,
    RunSummary,
    ValidationReport,
    WorkflowCreate,
    WorkflowRead,
    WorkflowSummary,
    WorkflowUpdate,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


async def _get_workflow(session: AsyncSession, workflow_id: uuid.UUID) -> Workflow:
    workflow = await session.get(Workflow, workflow_id)
    if workflow is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workflow not found.")
    return workflow


@router.get("", response_model=list[WorkflowSummary])
async def list_workflows(session: SessionDep) -> list[WorkflowSummary]:
    ranked = select(
        Run.workflow_id,
        Run.status,
        Run.created_at,
        func.row_number()
        .over(partition_by=Run.workflow_id, order_by=Run.created_at.desc())
        .label("rank"),
    ).subquery()
    stmt = (
        select(Workflow, ranked.c.status, ranked.c.created_at)
        .outerjoin(ranked, and_(ranked.c.workflow_id == Workflow.id, ranked.c.rank == 1))
        .order_by(Workflow.updated_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [
        WorkflowSummary(
            id=workflow.id,
            name=workflow.name,
            description=workflow.description,
            node_count=len(workflow.graph.get("nodes", [])),
            created_at=workflow.created_at,
            updated_at=workflow.updated_at,
            last_run_status=last_status,
            last_run_at=last_at,
        )
        for workflow, last_status, last_at in rows
    ]


@router.post("", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(body: WorkflowCreate, session: SessionDep) -> Workflow:
    workflow = Workflow(
        name=body.name.strip(),
        description=body.description.strip(),
        graph=body.graph.model_dump(mode="json"),
    )
    session.add(workflow)
    await session.commit()
    return workflow


@router.get("/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(workflow_id: uuid.UUID, session: SessionDep) -> Workflow:
    return await _get_workflow(session, workflow_id)


@router.put("/{workflow_id}", response_model=WorkflowRead)
async def update_workflow(
    workflow_id: uuid.UUID, body: WorkflowUpdate, session: SessionDep
) -> Workflow:
    workflow = await _get_workflow(session, workflow_id)
    if body.name is not None:
        workflow.name = body.name.strip()
    if body.description is not None:
        workflow.description = body.description.strip()
    if body.graph is not None:
        workflow.graph = body.graph.model_dump(mode="json")
    await session.commit()
    return workflow


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: uuid.UUID, session: SessionDep, manager: ManagerDep
) -> Response:
    workflow = await _get_workflow(session, workflow_id)
    manager.cancel_workflow(workflow.id)
    await session.delete(workflow)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{workflow_id}/validate", response_model=ValidationReport)
async def validate_workflow(workflow_id: uuid.UUID, session: SessionDep) -> ValidationReport:
    workflow = await _get_workflow(session, workflow_id)
    issues = validate_graph(Graph.model_validate(workflow.graph))
    return ValidationReport.model_validate(
        {"valid": not issues, "issues": [issue.as_dict() for issue in issues]}
    )


@router.post(
    "/{workflow_id}/runs", response_model=RunSummary, status_code=status.HTTP_202_ACCEPTED
)
async def start_run(
    workflow_id: uuid.UUID, body: RunCreate, session: SessionDep, manager: ManagerDep
) -> RunSummary:
    workflow = await _get_workflow(session, workflow_id)
    graph = Graph.model_validate(workflow.graph)
    issues = validate_graph(graph)
    issues.extend(
        GraphIssue(f"Provide a value for input '{node.config.key}'.", node.id)
        for node in graph.nodes
        if isinstance(node, InputNode) and not body.inputs.get(node.config.key, "").strip()
    )
    if issues:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            {"message": "Workflow cannot run.", "issues": [i.as_dict() for i in issues]},
        )

    run = Run(
        workflow_id=workflow.id,
        status="queued",
        inputs=body.inputs,
        outputs={},
        graph=workflow.graph,
    )
    session.add(run)
    await session.commit()
    manager.start(run.id, workflow.id, graph, body.inputs)
    return run_summary(run, workflow.name)
