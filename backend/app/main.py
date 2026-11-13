import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import flights, health, network
from app.core.config import Settings, get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import setup_logging
from app.core.middleware import request_context_middleware
from app.services.network_service import NetworkService

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Shared resources are opened once here, stored on app.state and closed after `yield`.
    settings: Settings = app.state.settings
    logger.info("Starting up", extra={"environment": settings.environment})
    async with httpx.AsyncClient(
        base_url=settings.ryanair_web_api_url,
        timeout=settings.upstream_timeout_seconds,
        headers={"User-Agent": "Mozilla/5.0 (compatible; cheap-flights-backend)"},
    ) as client:
        app.state.network_service = NetworkService(client, settings.network_cache_ttl_seconds)
        yield
    logger.info("Shutting down")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    setup_logging(settings.log_level, settings.log_json)

    # Don't expose interactive docs / the OpenAPI schema in production.
    docs_enabled = not settings.is_production

    app = FastAPI(
        title=settings.app_name,
        description=settings.app_description,
        version=settings.app_version,
        debug=settings.debug,
        lifespan=lifespan,
        docs_url="/docs" if docs_enabled else None,
        redoc_url="/redoc" if docs_enabled else None,
        openapi_url="/openapi.json" if docs_enabled else None,
    )

    app.state.settings = settings

    app.middleware("http")(request_context_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    register_exception_handlers(app)
    app.include_router(health.router)
    app.include_router(flights.router)
    app.include_router(network.router)
    return app


app = create_app()
