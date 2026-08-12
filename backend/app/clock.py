from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


def duration_ms(started: datetime | None, finished: datetime | None) -> int | None:
    if started is None or finished is None:
        return None
    return int((finished - started).total_seconds() * 1000)
