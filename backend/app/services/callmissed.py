import logging

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.chat import ChatResponse


logger = logging.getLogger(__name__)


class CallMissedService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self.settings = settings
        self.client = client

    async def chat(self, message: str) -> ChatResponse:
        api_key = self.settings.callmissed_api_key
        secret = api_key.get_secret_value().strip() if api_key else ""
        if not secret:
            logger.error("CallMissed chat is not configured")
            raise AppError(
                "AI_NOT_CONFIGURED", "AI chat is not configured.", 503
            )

        try:
            response = await self.client.post(
                f"{self.settings.callmissed_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {secret}"},
                json={
                    "model": self.settings.callmissed_chat_model,
                    "messages": [{"role": "user", "content": message}],
                },
            )
        except httpx.TimeoutException:
            logger.warning("CallMissed chat request timed out")
            raise AppError(
                "AI_SERVICE_TIMEOUT", "The AI service timed out. Please try again.", 504
            ) from None
        except httpx.RequestError:
            logger.warning("CallMissed chat network failure")
            raise AppError(
                "AI_SERVICE_UNAVAILABLE",
                "The AI service is temporarily unavailable. Please try again.",
                502,
            ) from None

        if response.status_code == 429:
            logger.warning("CallMissed chat rate limited", extra={"upstream_status": 429})
            raise AppError(
                "AI_RATE_LIMITED", "The AI service is busy. Please try again shortly.", 429
            )
        if response.status_code >= 400:
            logger.warning(
                "CallMissed chat rejected request",
                extra={"upstream_status": response.status_code},
            )
            raise AppError(
                "AI_SERVICE_UNAVAILABLE",
                "The AI service is temporarily unavailable. Please try again.",
                502,
            )

        try:
            data = response.json()
            answer = data["choices"][0]["message"]["content"]
            normalized = ChatResponse.model_validate(
                {"message": answer, "model": data["model"], "usage": data["usage"]}
            )
        except (ValueError, TypeError, KeyError, IndexError, ValidationError):
            logger.error("CallMissed chat returned an invalid response")
            raise AppError(
                "AI_SERVICE_UNAVAILABLE",
                "The AI service returned an invalid response. Please try again.",
                502,
            ) from None

        return normalized
