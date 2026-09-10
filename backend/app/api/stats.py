from datetime import timedelta

import numpy as np
from fastapi import APIRouter
from sqlalchemy import func, select

from app.api.deps import ManagerDep, SessionDep
from app.clock import utcnow
from app.models import Chunk, Collection, Run, Workflow
from app.schemas import DailyRuns, StatsRead

router = APIRouter(prefix="/stats", tags=["telemetry"])


@router.get("", response_model=StatsRead)
async def get_system_stats(session: SessionDep, manager: ManagerDep) -> StatsRead:
    now = utcnow()
    since_24h = now - timedelta(hours=24)
    since_7d = now - timedelta(days=7)

    # 24h Runs count and status
    runs_24h_stmt = (
        select(Run.status, Run.started_at, Run.finished_at)
        .where(Run.created_at >= since_24h)
    )
    rows_24h = (await session.execute(runs_24h_stmt)).all()
    total_24h = len(rows_24h)
    succeeded_24h = sum(1 for r in rows_24h if r.status == "succeeded")
    completed_24h = sum(1 for r in rows_24h if r.status in ("succeeded", "failed"))
    success_rate = (succeeded_24h / completed_24h) if completed_24h > 0 else None

    # Median duration calculation
    durations = [
        (r.finished_at - r.started_at).total_seconds() * 1000
        for r in rows_24h
        if r.started_at and r.finished_at and r.status == "succeeded"
    ]
    median_duration = int(float(np.median(durations))) if durations else None

    # Aggregate counts
    wf_count = await session.scalar(select(func.count(Workflow.id))) or 0
    coll_count = await session.scalar(select(func.count(Collection.id))) or 0
    chunk_count = await session.scalar(select(func.count(Chunk.id))) or 0

    # 7-day run timeline grouping
    daily_stmt = (
        select(
            func.to_char(Run.created_at, "YYYY-MM-DD").label("date_str"),
            Run.status,
            func.count(Run.id),
        )
        .where(Run.created_at >= since_7d)
        .group_by("date_str", Run.status)
        .order_by("date_str")
    )
    daily_rows = (await session.execute(daily_stmt)).all()

    # Aggregate daily counts
    timeline: dict[str, dict[str, int]] = {}
    for d in range(7):
        day_str = (now - timedelta(days=6 - d)).strftime("%Y-%m-%d")
        timeline[day_str] = {"succeeded": 0, "failed": 0}

    for date_str, st, count in daily_rows:
        if date_str in timeline:
            if st == "succeeded":
                timeline[date_str]["succeeded"] += count
            elif st == "failed":
                timeline[date_str]["failed"] += count

    daily_list = [
        DailyRuns(date=d, succeeded=counts["succeeded"], failed=counts["failed"])
        for d, counts in timeline.items()
    ]

    return StatsRead(
        runs_24h=total_24h,
        success_rate_24h=round(success_rate, 3) if success_rate is not None else None,
        median_duration_ms_24h=median_duration,
        active_runs=manager.active_count,
        workflows=wf_count,
        collections=coll_count,
        chunks=chunk_count,
        daily=daily_list,
    )
