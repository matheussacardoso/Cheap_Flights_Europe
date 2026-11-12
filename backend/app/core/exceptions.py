from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class UpstreamServiceError(Exception):
    """Raised when an external provider (e.g. the Ryanair API) fails."""

    def __init__(self, message: str = "Failed to fetch flight data from the provider") -> None:
        self.message = message
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(UpstreamServiceError)
    async def upstream_error_handler(_: Request, exc: UpstreamServiceError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY, content={"detail": exc.message}
        )
