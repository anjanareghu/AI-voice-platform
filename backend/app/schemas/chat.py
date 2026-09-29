from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


ChatMessage = Annotated[
    str,
    StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=4000),
]


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: ChatMessage


class Usage(BaseModel):
    prompt_tokens: int = Field(ge=0, strict=True)
    completion_tokens: int = Field(ge=0, strict=True)
    total_tokens: int = Field(ge=0, strict=True)


class ChatResponse(BaseModel):
    message: str = Field(min_length=1)
    model: str = Field(min_length=1)
    usage: Usage
