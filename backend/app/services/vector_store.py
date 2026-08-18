import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Chunk, Document


@dataclass(frozen=True)
class ScoredChunk:
    chunk_id: int
    document_id: uuid.UUID
    document_title: str
    content: str
    score: float


class Retriever(Protocol):
    async def search(
        self,
        collection_id: uuid.UUID,
        vector: Sequence[float],
        top_k: int,
        min_score: float = -1.0,
    ) -> list[ScoredChunk]: ...


class PgVectorRetriever:
    def __init__(self, sessionmaker: async_sessionmaker[AsyncSession]) -> None:
        self._sessionmaker = sessionmaker

    async def search(
        self,
        collection_id: uuid.UUID,
        vector: Sequence[float],
        top_k: int,
        min_score: float = -1.0,
    ) -> list[ScoredChunk]:
        distance = Chunk.embedding.cosine_distance(list(vector))
        stmt = (
            select(
                Chunk.id,
                Chunk.document_id,
                Document.title,
                Chunk.content,
                (1 - distance).label("score"),
            )
            .join(Document, Document.id == Chunk.document_id)
            .where(Chunk.collection_id == collection_id)
            .order_by(distance)
            .limit(top_k)
        )
        async with self._sessionmaker() as session:
            # The HNSW candidate list is filtered by collection after the graph walk, so
            # widen it relative to k to avoid returning fewer rows than requested.
            ef_search = max(40, min(top_k * 8, 1000))
            await session.execute(text(f"SET LOCAL hnsw.ef_search = {ef_search}"))
            rows = (await session.execute(stmt)).all()
        return [
            ScoredChunk(
                chunk_id=row.id,
                document_id=row.document_id,
                document_title=row.title,
                content=row.content,
                score=float(row.score),
            )
            for row in rows
            if float(row.score) >= min_score
        ]
