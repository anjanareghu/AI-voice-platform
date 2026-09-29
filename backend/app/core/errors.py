import logging

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


logger = logging.getLogger(__name__)


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


async def app_error_handler(_request: Request, error: AppError) -> JSONResponse:
    return error_response(error.code, error.message, error.status_code)


async def validation_error_handler(
    _request: Request, _error: RequestValidationError
) -> JSONResponse:
    return error_response("INVALID_REQUEST", "Invalid request.", 422)


async def http_error_handler(
    _request: Request, error: StarletteHTTPException
) -> JSONResponse:
    if error.status_code == 404:
        return error_response("NOT_FOUND", "The requested resource was not found.", 404)
    if error.status_code == 405:
        return error_response("METHOD_NOT_ALLOWED", "Method not allowed.", 405)
    return error_response("HTTP_ERROR", "The request could not be completed.", error.status_code)


async def unexpected_error_handler(_request: Request, error: Exception) -> JSONResponse:
    logger.error("Unexpected application error", exc_info=error)
    return error_response("INTERNAL_ERROR", "An unexpected error occurred.", 500)
