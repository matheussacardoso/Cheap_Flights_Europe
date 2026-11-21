from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class UpstreamServiceError(Exception):
    """Raised when an external provider (e.g. the Ryanair API) fails."""

    def __init__(self, message: str = "Failed to fetch flight data from the provider") -> None:
        self.message = message
        super().__init__(message)


class InvalidSearchError(Exception):
    """Raised when a search can't run as asked (e.g. too many fare queries, unknown city)."""

    def __init__(self, message: str) -> None:
        self.message = message
        super().__init__(message)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(UpstreamServiceError)
    async def upstream_error_handler(_: Request, exc: UpstreamServiceError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY, content={"detail": exc.message}
        )

    @app.exception_handler(InvalidSearchError)
    async def invalid_search_handler(_: Request, exc: InvalidSearchError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, content={"detail": exc.message}
        )
