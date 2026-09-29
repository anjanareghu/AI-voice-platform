from fastapi import APIRouter, Request

from app.schemas.image import ImageRequest, ImageResponse
from app.services.callmissed import CallMissedService


router = APIRouter(prefix="/api/v1/images", tags=["images"])


@router.post("/generate", response_model=ImageResponse)
async def generate_image(body: ImageRequest, request: Request) -> ImageResponse:
    service: CallMissedService = request.app.state.callmissed_service
    return await service.generate_image(body.prompt)
