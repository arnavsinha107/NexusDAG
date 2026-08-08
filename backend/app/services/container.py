import asyncio
from collections.abc import Sequence
from dataclasses import dataclass

from app.services.embeddings import Embedder, Matrix
from app.services.llm import LLMClient
from app.services.vector_store import Retriever


@dataclass(frozen=True)
class Services:
    embedder: Embedder
    llm: LLMClient
    retriever: Retriever
    default_model: str

    async def embed(self, texts: Sequence[str]) -> Matrix:
        return await asyncio.to_thread(self.embedder.embed, list(texts))
