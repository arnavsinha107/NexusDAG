from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.engine.manager import RunManager
from app.services.container import Services


def _run_manager(request: Request) -> RunManager:
    manager: RunManager = request.app.state.run_manager
    return manager


def _services(request: Request) -> Services:
    services: Services = request.app.state.services
    return services


SessionDep = Annotated[AsyncSession, Depends(get_session)]
ManagerDep = Annotated[RunManager, Depends(_run_manager)]
ServicesDep = Annotated[Services, Depends(_services)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
