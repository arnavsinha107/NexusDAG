from fastapi import APIRouter

from app.api.deps import ServicesDep, SettingsDep
from app.config import EMBEDDING_DIM
from app.schemas import MetaRead

router = APIRouter(prefix="/meta", tags=["metadata"])


@router.get("", response_model=MetaRead)
async def get_engine_meta(settings: SettingsDep, services: ServicesDep) -> MetaRead:
    return MetaRead(
        version="1.0.0",
        environment=settings.environment,
        llm_provider=settings.llm_provider,
        llm_model=settings.llm_model if settings.llm_provider == "openai" else "extractive-offline",
        embedding_provider=settings.embedding_provider,
        embedding_model=services.embedder.name,
        embedding_dim=EMBEDDING_DIM,
    )
