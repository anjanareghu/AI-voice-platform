import base64
import binascii
import logging

import httpx
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.schemas.chat import ChatResponse
from app.schemas.image import ImageResponse


logger = logging.getLogger(__name__)


class CallMissedService:
    def __init__(self, settings: Settings, client: httpx.AsyncClient) -> None:
        self.settings = settings
        self.client = client

    def _authorization_headers(self, feature: str) -> dict[str, str]:
        api_key = self.settings.callmissed_api_key
        secret = api_key.get_secret_value().strip() if api_key else ""
        if not secret:
            logger.error("CallMissed %s is not configured", feature)
            raise AppError(
                "AI_NOT_CONFIGURED", f"AI {feature} is not configured.", 503
            )
        return {"Authorization": f"Bearer {secret}"}

    async def chat(self, message: str) -> ChatResponse:
        headers = self._authorization_headers("chat")
        try:
            response = await self.client.post(
                f"{self.settings.callmissed_base_url.rstrip('/')}/chat/completions",
                headers=headers,
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

    async def generate_image(self, prompt: str) -> ImageResponse:
        headers = self._authorization_headers("image generation")
        try:
            response = await self.client.post(
                f"{self.settings.callmissed_base_url.rstrip('/')}/images/generations",
                headers=headers,
                json={
                    "model": self.settings.callmissed_image_model,
                    "prompt": prompt,
                    "n": 1,
                    "size": self.settings.callmissed_image_size,
                },
                timeout=httpx.Timeout(120.0, connect=5.0),
            )
        except httpx.TimeoutException:
            logger.warning("CallMissed image generation timed out")
            raise AppError(
                "AI_SERVICE_TIMEOUT",
                "Image generation timed out. Please try again.",
                504,
            ) from None
        except httpx.RequestError:
            logger.warning("CallMissed image generation network failure")
            raise AppError(
                "AI_SERVICE_UNAVAILABLE",
                "Image generation is temporarily unavailable. Please try again.",
                502,
            ) from None

        if response.status_code == 429:
            logger.warning("CallMissed image generation rate limited")
            raise AppError(
                "AI_RATE_LIMITED",
                "Image generation is busy. Please try again shortly.",
                429,
            )
        if response.status_code >= 400:
            logger.warning(
                "CallMissed image generation rejected request",
                extra={"upstream_status": response.status_code},
            )
            raise AppError(
                "AI_SERVICE_UNAVAILABLE",
                "Image generation is temporarily unavailable. Please try again.",
                502,
            )

        try:
            data = response.json()
            encoded_image = data["data"][0]["b64_json"]
            image_bytes = base64.b64decode(encoded_image, validate=True)
            if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
                media_type = "image/png"
            elif image_bytes.startswith(b"\xff\xd8\xff"):
                media_type = "image/jpeg"
            else:
                raise ValueError("Unsupported image format")
            return ImageResponse(
                image_data_url=f"data:{media_type};base64,{encoded_image}",
                model=self.settings.callmissed_image_model,
            )
        except (ValueError, TypeError, KeyError, IndexError, binascii.Error):
            logger.error("CallMissed image generation returned an invalid response")
            raise AppError(
                "AI_SERVICE_UNAVAILABLE",
                "The AI service returned an invalid image. Please try again.",
                502,
            ) from None
