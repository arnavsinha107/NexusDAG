import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, TypedDict

from app.clock import utcnow


class RunEvent(TypedDict):
    seq: int
    type: str
    run_id: str
    node_id: str | None
    ts: str
    data: dict[str, Any]


EventQueue = asyncio.Queue[RunEvent | None]


@dataclass
class _Channel:
    history: list[RunEvent] = field(default_factory=list)
    subscribers: set[EventQueue] = field(default_factory=set)
    closed: bool = False


class RunBroker:
    """In-process fan-out of run events with full replay for late subscribers.

    Channels outlive their run by `retention_seconds` so a client that connects just after
    completion still receives the whole stream; afterwards clients read persisted state over
    REST. This is single-process by design — horizontal scaling requires pinning runs to a
    worker or replacing this class with a Redis-backed implementation of the same interface.
    """

    def __init__(self, retention_seconds: float = 120.0) -> None:
        self._channels: dict[uuid.UUID, _Channel] = {}
        self._retention = retention_seconds

    def open(self, run_id: uuid.UUID) -> None:
        self._channels[run_id] = _Channel()

    def is_open(self, run_id: uuid.UUID) -> bool:
        return run_id in self._channels

    async def publish(
        self, run_id: uuid.UUID, event_type: str, node_id: str | None, data: dict[str, Any]
    ) -> None:
        channel = self._channels.get(run_id)
        if channel is None or channel.closed:
            return
        event: RunEvent = {
            "seq": len(channel.history),
            "type": event_type,
            "run_id": str(run_id),
            "node_id": node_id,
            "ts": utcnow().isoformat(),
            "data": data,
        }
        channel.history.append(event)
        for queue in channel.subscribers:
            queue.put_nowait(event)

    def close(self, run_id: uuid.UUID) -> None:
        channel = self._channels.get(run_id)
        if channel is None or channel.closed:
            return
        channel.closed = True
        for queue in channel.subscribers:
            queue.put_nowait(None)
        asyncio.get_running_loop().call_later(self._retention, self._channels.pop, run_id, None)

    @asynccontextmanager
    async def subscribe(
        self, run_id: uuid.UUID
    ) -> AsyncIterator[tuple[list[RunEvent], EventQueue] | None]:
        channel = self._channels.get(run_id)
        if channel is None:
            yield None
            return
        # Snapshot and registration happen without an intervening await, so no event can
        # fall between the replayed history and the live queue.
        queue: EventQueue = asyncio.Queue()
        history = list(channel.history)
        if channel.closed:
            queue.put_nowait(None)
        else:
            channel.subscribers.add(queue)
        try:
            yield history, queue
        finally:
            channel.subscribers.discard(queue)
