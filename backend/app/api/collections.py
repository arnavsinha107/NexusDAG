import uuid

from fastapi import APIRouter, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import ServicesDep, SessionDep, SettingsDep
from app.models import Chunk, Collection, Document
from app.schemas import (
    CollectionCreate,
    CollectionRead,
    DocumentCreate,
    DocumentRead,
    QueryMatch,
    QueryRequest,
)
from app.services.ingestion import extract_text, ingest_document

router = APIRouter(prefix="/collections", tags=["collections"])


async def _get_collection(session: AsyncSession, collection_id: uuid.UUID) -> Collection:
    collection = await session.get(Collection, collection_id)
    if collection is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Collection not found.")
    return collection


@router.get("", response_model=list[CollectionRead])
async def list_collections(session: SessionDep) -> list[CollectionRead]:
    stmt = (
        select(
            Collection,
            func.count(func.distinct(Document.id)).label("doc_count"),
            func.count(Chunk.id).label("chunk_count"),
        )
        .outerjoin(Document, Document.collection_id == Collection.id)
        .outerjoin(Chunk, Chunk.collection_id == Collection.id)
        .group_by(Collection.id)
        .order_by(Collection.created_at.desc())
    )
    rows = (await session.execute(stmt)).all()
    return [
        CollectionRead(
            id=col.id,
            name=col.name,
            description=col.description,
            created_at=col.created_at,
            document_count=doc_count,
            chunk_count=chunk_count,
        )
        for col, doc_count, chunk_count in rows
    ]


@router.post("", response_model=CollectionRead, status_code=status.HTTP_201_CREATED)
async def create_collection(body: CollectionCreate, session: SessionDep) -> CollectionRead:
    existing = await session.execute(select(Collection).where(Collection.name == body.name.strip()))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Collection '{body.name}' already exists.")

    collection = Collection(name=body.name.strip(), description=body.description.strip())
    session.add(collection)
    await session.commit()
    await session.refresh(collection)
    return CollectionRead(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        created_at=collection.created_at,
        document_count=0,
        chunk_count=0,
    )


@router.get("/{collection_id}", response_model=CollectionRead)
async def get_collection(collection_id: uuid.UUID, session: SessionDep) -> CollectionRead:
    collection = await _get_collection(session, collection_id)
    doc_count = await session.scalar(
        select(func.count(Document.id)).where(Document.collection_id == collection.id)
    ) or 0
    chunk_count = await session.scalar(
        select(func.count(Chunk.id)).where(Chunk.collection_id == collection.id)
    ) or 0
    return CollectionRead(
        id=collection.id,
        name=collection.name,
        description=collection.description,
        created_at=collection.created_at,
        document_count=doc_count,
        chunk_count=chunk_count,
    )


@router.delete("/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(collection_id: uuid.UUID, session: SessionDep) -> Response:
    collection = await _get_collection(session, collection_id)
    await session.delete(collection)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{collection_id}/documents", response_model=list[DocumentRead])
async def list_documents(collection_id: uuid.UUID, session: SessionDep) -> list[DocumentRead]:
    await _get_collection(session, collection_id)
    stmt = (
        select(Document)
        .where(Document.collection_id == collection_id)
        .order_by(Document.created_at.desc())
    )
    docs = (await session.execute(stmt)).scalars().all()
    return [DocumentRead.model_validate(doc) for doc in docs]


@router.post(
    "/{collection_id}/documents",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_document(
    collection_id: uuid.UUID,
    body: DocumentCreate,
    session: SessionDep,
    services: ServicesDep,
    settings: SettingsDep,
) -> DocumentRead:
    await _get_collection(session, collection_id)
    doc = await ingest_document(
        session,
        services,
        settings,
        collection_id=collection_id,
        title=body.title.strip(),
        text=body.text.strip(),
        source="raw_text",
    )
    return DocumentRead.model_validate(doc)


@router.post(
    "/{collection_id}/upload",
    response_model=DocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    collection_id: uuid.UUID,
    session: SessionDep,
    services: ServicesDep,
    settings: SettingsDep,
    file: UploadFile = File(...),
    title: str | None = Form(None),
) -> DocumentRead:
    await _get_collection(session, collection_id)

    raw = await file.read()
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds maximum size of {settings.max_upload_bytes // 1_000_000}MB.",
        )

    try:
        text_content = extract_text(file.filename or "uploaded_file.txt", raw)
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    doc_title = (title or file.filename or "Uploaded Document").strip()
    doc = await ingest_document(
        session,
        services,
        settings,
        collection_id=collection_id,
        title=doc_title,
        text=text_content,
        source="upload",
    )
    return DocumentRead.model_validate(doc)


@router.post("/{collection_id}/query", response_model=list[QueryMatch])
async def query_collection(
    collection_id: uuid.UUID,
    body: QueryRequest,
    session: SessionDep,
    services: ServicesDep,
) -> list[QueryMatch]:
    await _get_collection(session, collection_id)
    vector = (await services.embed([body.query]))[0]
    matches = await services.retriever.search(
        collection_id=collection_id,
        vector=vector.tolist(),
        top_k=body.top_k,
    )
    return [
        QueryMatch(
            chunk_id=m.chunk_id,
            document_id=m.document_id,
            document_title=m.document_title,
            content=m.content,
            score=round(m.score, 4),
        )
        for m in matches
    ]
