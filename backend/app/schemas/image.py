from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


ImagePrompt = Annotated[
    str,
    StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=4000),
]


class ImageRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: ImagePrompt


class ImageResponse(BaseModel):
    image_data_url: str = Field(min_length=1)
    model: str = Field(min_length=1)
