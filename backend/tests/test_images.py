import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.main import create_app


PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9kL+YAAAAASUVORK5CYII="
)
PNG_BASE64 = base64.b64encode(PNG_BYTES).decode("ascii")


def settings_with_test_key() -> Settings:
    return Settings(_env_file=None, callmissed_api_key=SecretStr("test-key"))


def test_valid_image_request_returns_displayable_data_url() -> None:
    captured: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(
            200,
            json={
                "created": 1731234567,
                "data": [{"b64_json": PNG_BASE64, "revised_prompt": None}],
            },
        )

    app = create_app(
        settings_with_test_key(), provider_transport=httpx.MockTransport(provider)
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/images/generate", json={"prompt": "  A small friendly robot  "}
        )

    assert response.status_code == 200
    assert response.json() == {
        "image_data_url": f"data:image/png;base64,{PNG_BASE64}",
        "model": "flux-2-klein-9b",
    }
    assert captured[0].url == "https://api.callmissed.com/v1/images/generations"
    assert captured[0].headers["authorization"] == "Bearer test-key"
    assert json.loads(captured[0].content) == {
        "model": "flux-2-klein-9b",
        "prompt": "A small friendly robot",
        "n": 1,
        "size": "1024x1024",
    }
    assert captured[0].extensions["timeout"]["read"] == 120.0


def test_jpeg_response_uses_jpeg_media_type() -> None:
    encoded = base64.b64encode(b"\xff\xd8\xff\xe0JPEG test data").decode("ascii")
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(200, json={"data": [{"b64_json": encoded}]})
    )
    with TestClient(
        create_app(settings_with_test_key(), provider_transport=transport)
    ) as client:
        response = client.post("/api/v1/images/generate", json={"prompt": "Robot"})

    assert response.status_code == 200
    assert response.json()["image_data_url"] == f"data:image/jpeg;base64,{encoded}"


@pytest.mark.parametrize("prompt", ["", " \t\n "])
def test_blank_image_prompt_is_rejected_without_provider_call(prompt: str) -> None:
    def unexpected_provider_call(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Invalid prompt reached CallMissed")

    app = create_app(
        settings_with_test_key(),
        provider_transport=httpx.MockTransport(unexpected_provider_call),
    )
    with TestClient(app) as client:
        response = client.post("/api/v1/images/generate", json={"prompt": prompt})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


@pytest.mark.parametrize("prompt", [123, "x" * 4001])
def test_invalid_image_prompt_type_and_length_are_rejected(prompt: object) -> None:
    with TestClient(create_app(settings_with_test_key())) as client:
        response = client.post("/api/v1/images/generate", json={"prompt": prompt})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_missing_api_key_returns_controlled_error() -> None:
    settings = Settings(_env_file=None, callmissed_api_key=None)
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/v1/images/generate", json={"prompt": "Robot"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_NOT_CONFIGURED"


@pytest.mark.parametrize(
    ("error", "status_code", "code"),
    [
        (httpx.ReadTimeout("timed out"), 504, "AI_SERVICE_TIMEOUT"),
        (httpx.ConnectError("connection failed"), 502, "AI_SERVICE_UNAVAILABLE"),
    ],
)
def test_image_transport_failures_are_safe(
    error: Exception, status_code: int, code: str
) -> None:
    def provider(_request: httpx.Request) -> httpx.Response:
        raise error

    app = create_app(
        settings_with_test_key(), provider_transport=httpx.MockTransport(provider)
    )
    with TestClient(app) as client:
        response = client.post("/api/v1/images/generate", json={"prompt": "Robot"})

    assert response.status_code == status_code
    assert response.json()["error"]["code"] == code
    assert "test-key" not in response.text


@pytest.mark.parametrize(
    ("upstream_status", "status_code", "code"),
    [
        (401, 502, "AI_SERVICE_UNAVAILABLE"),
        (403, 502, "AI_SERVICE_UNAVAILABLE"),
        (429, 429, "AI_RATE_LIMITED"),
        (503, 502, "AI_SERVICE_UNAVAILABLE"),
    ],
)
def test_image_provider_status_failures_are_safe(
    upstream_status: int, status_code: int, code: str
) -> None:
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(
            upstream_status, json={"error": {"message": "provider private detail"}}
        )
    )
    with TestClient(
        create_app(settings_with_test_key(), provider_transport=transport)
    ) as client:
        response = client.post("/api/v1/images/generate", json={"prompt": "Robot"})

    assert response.status_code == status_code
    assert response.json()["error"]["code"] == code
    assert "provider private detail" not in response.text


@pytest.mark.parametrize(
    "provider_response",
    [
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"data": []}),
        httpx.Response(200, json={"data": [{"b64_json": "invalid-base64!"}]}),
        httpx.Response(
            200,
            json={"data": [{"b64_json": base64.b64encode(b"not an image").decode()}]},
        ),
    ],
)
def test_malformed_image_response_is_safe(provider_response: httpx.Response) -> None:
    transport = httpx.MockTransport(lambda _request: provider_response)
    with TestClient(
        create_app(settings_with_test_key(), provider_transport=transport)
    ) as client:
        response = client.post("/api/v1/images/generate", json={"prompt": "Robot"})

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "AI_SERVICE_UNAVAILABLE"
