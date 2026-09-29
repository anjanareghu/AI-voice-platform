from uuid import UUID

from fastapi import APIRouter, Request, Response

from app.schemas.voice import VoiceSessionResponse
from app.services.callmissed import CallMissedService


router = APIRouter(prefix="/api/v1/voice/sessions", tags=["voice"])


@router.post("", status_code=201, response_model=VoiceSessionResponse)
async def create_voice_session(
    request: Request, response: Response
) -> VoiceSessionResponse:
    service: CallMissedService = request.app.state.callmissed_service
    session = await service.create_voice_session()
    response.headers["Cache-Control"] = "no-store"
    return session


@router.delete("/{session_id}", status_code=204)
async def end_voice_session(session_id: UUID, request: Request) -> None:
    service: CallMissedService = request.app.state.callmissed_service
    await service.end_voice_session(session_id)
