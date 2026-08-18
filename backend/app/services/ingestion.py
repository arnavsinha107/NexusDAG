import io
import uuid
from pathlib import PurePath

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import Chunk, Document
from app.services.chunking import chunk_text
from app.services.container import Services

TEXT_SUFFIXES = frozenset({".txt", ".md", ".markdown", ".rst", ".csv", ".json", ".html"})


class UnsupportedDocument(ValueError):
    pass


def extract_text(filename: str, raw: bytes) -> str:
    suffix = PurePath(filename).suffix.lower()
    if suffix == ".pdf":
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    if suffix in TEXT_SUFFIXES:
        return raw.decode("utf-8", errors="replace")
    raise UnsupportedDocument(
        f"Unsupported file type '{suffix or filename}'. Upload PDF, Markdown, or plain text."
    )


async def ingest_document(
    session: AsyncSession,
    services: Services,
    settings: Settings,
    *,
    collection_id: uuid.UUID,
    title: str,
    text: str,
    source: str,
) -> Document:
    chunks = chunk_text(text, settings.chunk_size, settings.chunk_overlap)
    if not chunks:
        raise UnsupportedDocument("The document contains no extractable text.")
    vectors = await services.embed(chunks)
    document = Document(
        collection_id=collection_id,
        title=title,
        source=source,
        char_count=len(text),
        chunk_count=len(chunks),
    )
    session.add(document)
    await session.flush()
    session.add_all(
        Chunk(
            document_id=document.id,
            collection_id=collection_id,
            ordinal=ordinal,
            content=content,
            embedding=vector,
        )
        for ordinal, (content, vector) in enumerate(zip(chunks, vectors, strict=True))
    )
    await session.commit()
    return document
