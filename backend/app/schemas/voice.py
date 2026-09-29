from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, StringConstraints


SecureWebSocketUrl = Annotated[
    str, StringConstraints(strict=True, pattern=r"^wss://[^\s]+$")
]
SessionToken = Annotated[str, StringConstraints(strict=True, strip_whitespace=True, min_length=1)]


class VoiceSessionResponse(BaseModel):
    session_id: UUID
    ws_url: SecureWebSocketUrl
    token: SessionToken
