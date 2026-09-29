import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.main import create_app


def settings_with_test_key() -> Settings:
    return Settings(_env_file=None, callmissed_api_key=SecretStr("test-key"))


def successful_provider_response() -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "id": "provider-id",
            "model": "gpt-oss-120b",
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "Hello from CallMissed.",
                        "reasoning_content": "Private reasoning must stay private.",
                    }
                }
            ],
            "usage": {
                "prompt_tokens": 8,
                "completion_tokens": 12,
                "total_tokens": 20,
                "provider_only": "omitted",
            },
        },
    )


def test_valid_chat_normalizes_provider_response() -> None:
    captured: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return successful_provider_response()

    app = create_app(
        settings_with_test_key(), provider_transport=httpx.MockTransport(provider)
    )
    with TestClient(app) as client:
        response = client.post("/api/v1/chat", json={"message": "  Say hello.  "})

    assert response.status_code == 200
    assert response.json() == {
        "message": "Hello from CallMissed.",
        "model": "gpt-oss-120b",
        "usage": {
            "prompt_tokens": 8,
            "completion_tokens": 12,
            "total_tokens": 20,
        },
    }
    assert "reasoning_content" not in response.text
    assert captured[0].url == "https://api.callmissed.com/v1/chat/completions"
    assert captured[0].headers["authorization"] == "Bearer test-key"
    assert json.loads(captured[0].content) == {
        "model": "gpt-oss-120b",
        "messages": [{"role": "user", "content": "Say hello."}],
    }


@pytest.mark.parametrize("message", ["", " \t\n "])
def test_blank_chat_message_is_rejected_without_provider_call(message: str) -> None:
    def unexpected_provider_call(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Invalid input reached CallMissed")

    app = create_app(
        settings_with_test_key(),
        provider_transport=httpx.MockTransport(unexpected_provider_call),
    )
    with TestClient(app) as client:
        response = client.post("/api/v1/chat", json={"message": message})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


@pytest.mark.parametrize("message", [123, "x" * 4001])
def test_invalid_chat_types_and_length_are_rejected(message: object) -> None:
    with TestClient(create_app(settings_with_test_key())) as client:
        response = client.post("/api/v1/chat", json={"message": message})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_missing_api_key_returns_controlled_error() -> None:
    settings = Settings(_env_file=None, callmissed_api_key=None)
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/v1/chat", json={"message": "Hello"})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_NOT_CONFIGURED"


@pytest.mark.parametrize(
    ("error", "status_code", "code"),
    [
        (httpx.ReadTimeout("timed out"), 504, "AI_SERVICE_TIMEOUT"),
        (httpx.ConnectError("connection failed"), 502, "AI_SERVICE_UNAVAILABLE"),
    ],
)
def test_provider_transport_failures_are_safe(
    error: Exception, status_code: int, code: str
) -> None:
    def provider(_request: httpx.Request) -> httpx.Response:
        raise error

    app = create_app(
        settings_with_test_key(), provider_transport=httpx.MockTransport(provider)
    )
    with TestClient(app) as client:
        response = client.post("/api/v1/chat", json={"message": "Hello"})

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
def test_provider_http_failures_are_safe(
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
        response = client.post("/api/v1/chat", json={"message": "Hello"})

    assert response.status_code == status_code
    assert response.json()["error"]["code"] == code
    assert "provider private detail" not in response.text


@pytest.mark.parametrize(
    "provider_response",
    [
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"choices": [], "model": "gpt-oss-120b"}),
        httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": None}}],
                "model": "gpt-oss-120b",
                "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
            },
        ),
    ],
)
def test_malformed_provider_response_is_safe(provider_response: httpx.Response) -> None:
    transport = httpx.MockTransport(lambda _request: provider_response)
    with TestClient(
        create_app(settings_with_test_key(), provider_transport=transport)
    ) as client:
        response = client.post("/api/v1/chat", json={"message": "Hello"})

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "AI_SERVICE_UNAVAILABLE"
