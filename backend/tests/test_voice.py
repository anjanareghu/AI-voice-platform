import json

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.main import create_app


SESSION_ID = "7c2b9e30-1d8a-4c5f-9b3d-2f4a6e8b1c2d"
CONNECTION_TOKEN = "header.payload.signature"


def settings_with_test_key() -> Settings:
    return Settings(_env_file=None, callmissed_api_key=SecretStr("test-key"))


def created_session() -> httpx.Response:
    return httpx.Response(
        201,
        json={
            "id": SESSION_ID,
            "ws_url": "wss://voice.example.test/livekit",
            "token": CONNECTION_TOKEN,
            "status": "created",
            "tenant_id": "private-tenant-id",
            "config": {"system_prompt": "private provider configuration"},
        },
    )


def test_create_voice_session_normalizes_credentials_and_disables_caching() -> None:
    captured: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return created_session()

    app = create_app(
        settings_with_test_key(), provider_transport=httpx.MockTransport(provider)
    )
    with TestClient(app) as client:
        response = client.post("/api/v1/voice/sessions")

    assert response.status_code == 201
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "session_id": SESSION_ID,
        "ws_url": "wss://voice.example.test/livekit",
        "token": CONNECTION_TOKEN,
    }
    assert "test-key" not in response.text
    assert "private-tenant-id" not in response.text
    assert captured[0].method == "POST"
    assert captured[0].url == "https://api.callmissed.com/v1/voice/sessions"
    assert captured[0].headers["authorization"] == "Bearer test-key"
    assert json.loads(captured[0].content) == {
        "system_prompt": "You are a helpful voice assistant. Keep replies brief and clear.",
        "voice": "shubh",
        "language": "en-IN",
        "max_duration_seconds": 300,
    }


@pytest.mark.parametrize(
    "provider_response",
    [
        httpx.Response(201, text="not json"),
        httpx.Response(201, json={"id": SESSION_ID, "ws_url": "wss://voice.example"}),
        httpx.Response(
            201,
            json={"id": SESSION_ID, "ws_url": "ws://voice.example", "token": CONNECTION_TOKEN},
        ),
        httpx.Response(
            201,
            json={"id": "invalid", "ws_url": "wss://voice.example", "token": CONNECTION_TOKEN},
        ),
        httpx.Response(
            201,
            json={"id": SESSION_ID, "ws_url": "wss://voice.example", "token": "test-key"},
        ),
    ],
)
def test_malformed_creation_response_is_safe(provider_response: httpx.Response) -> None:
    transport = httpx.MockTransport(lambda _request: provider_response)
    with TestClient(
        create_app(settings_with_test_key(), provider_transport=transport)
    ) as client:
        response = client.post("/api/v1/voice/sessions")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "AI_SERVICE_UNAVAILABLE"
    assert "test-key" not in response.text


def test_missing_api_key_is_safe() -> None:
    settings = Settings(_env_file=None, callmissed_api_key=None)
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/v1/voice/sessions")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AI_NOT_CONFIGURED"


@pytest.mark.parametrize(
    ("upstream_status", "app_status", "code"),
    [
        (400, 503, "AI_NOT_CONFIGURED"),
        (401, 503, "AI_NOT_CONFIGURED"),
        (403, 503, "AI_NOT_CONFIGURED"),
        (402, 503, "AI_SERVICE_UNAVAILABLE"),
        (429, 429, "AI_RATE_LIMITED"),
        (503, 502, "AI_SERVICE_UNAVAILABLE"),
    ],
)
def test_create_voice_provider_status_failures_are_safe(
    upstream_status: int, app_status: int, code: str
) -> None:
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(
            upstream_status, json={"error": {"message": "provider private detail"}}
        )
    )
    with TestClient(
        create_app(settings_with_test_key(), provider_transport=transport)
    ) as client:
        response = client.post("/api/v1/voice/sessions")

    assert response.status_code == app_status
    assert response.json()["error"]["code"] == code
    assert "provider private detail" not in response.text


@pytest.mark.parametrize(
    ("error", "app_status", "code"),
    [
        (httpx.ReadTimeout("timed out"), 504, "AI_SERVICE_TIMEOUT"),
        (httpx.ConnectError("network failed"), 502, "AI_SERVICE_UNAVAILABLE"),
    ],
)
def test_create_voice_transport_failures_are_safe(
    error: Exception, app_status: int, code: str
) -> None:
    def provider(_request: httpx.Request) -> httpx.Response:
        raise error

    with TestClient(
        create_app(
            settings_with_test_key(), provider_transport=httpx.MockTransport(provider)
        )
    ) as client:
        response = client.post("/api/v1/voice/sessions")

    assert response.status_code == app_status
    assert response.json()["error"]["code"] == code


def test_end_voice_session_returns_204() -> None:
    captured: list[httpx.Request] = []

    def provider(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        return httpx.Response(204)

    with TestClient(
        create_app(
            settings_with_test_key(), provider_transport=httpx.MockTransport(provider)
        )
    ) as client:
        response = client.delete(f"/api/v1/voice/sessions/{SESSION_ID}")

    assert response.status_code == 204
    assert response.content == b""
    assert captured[0].method == "DELETE"
    assert captured[0].url == f"https://api.callmissed.com/v1/voice/sessions/{SESSION_ID}"
    assert captured[0].headers["authorization"] == "Bearer test-key"


def test_invalid_session_id_is_rejected_without_provider_call() -> None:
    def unexpected_provider_call(_request: httpx.Request) -> httpx.Response:
        raise AssertionError("Invalid session ID reached CallMissed")

    with TestClient(
        create_app(
            settings_with_test_key(),
            provider_transport=httpx.MockTransport(unexpected_provider_call),
        )
    ) as client:
        response = client.delete("/api/v1/voice/sessions/not-a-uuid")

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "INVALID_REQUEST"


def test_voice_delete_cors_preflight_allows_configured_origin() -> None:
    with TestClient(create_app(settings_with_test_key())) as client:
        response = client.options(
            f"/api/v1/voice/sessions/{SESSION_ID}",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "DELETE",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


@pytest.mark.parametrize(
    ("upstream_status", "app_status", "code"),
    [
        (404, 404, "VOICE_SESSION_NOT_FOUND"),
        (401, 503, "AI_NOT_CONFIGURED"),
        (429, 429, "AI_RATE_LIMITED"),
        (503, 502, "AI_SERVICE_UNAVAILABLE"),
    ],
)
def test_end_voice_provider_status_failures_are_safe(
    upstream_status: int, app_status: int, code: str
) -> None:
    transport = httpx.MockTransport(
        lambda _request: httpx.Response(
            upstream_status, json={"error": {"message": "provider private detail"}}
        )
    )
    with TestClient(
        create_app(settings_with_test_key(), provider_transport=transport)
    ) as client:
        response = client.delete(f"/api/v1/voice/sessions/{SESSION_ID}")

    assert response.status_code == app_status
    assert response.json()["error"]["code"] == code
    assert "provider private detail" not in response.text


@pytest.mark.parametrize(
    ("error", "app_status", "code"),
    [
        (httpx.ReadTimeout("timed out"), 504, "AI_SERVICE_TIMEOUT"),
        (httpx.ConnectError("network failed"), 502, "AI_SERVICE_UNAVAILABLE"),
    ],
)
def test_end_voice_transport_failures_are_safe(
    error: Exception, app_status: int, code: str
) -> None:
    def provider(_request: httpx.Request) -> httpx.Response:
        raise error

    with TestClient(
        create_app(
            settings_with_test_key(), provider_transport=httpx.MockTransport(provider)
        )
    ) as client:
        response = client.delete(f"/api/v1/voice/sessions/{SESSION_ID}")

    assert response.status_code == app_status
    assert response.json()["error"]["code"] == code
