from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_health_returns_ok() -> None:
    with TestClient(create_app(Settings(_env_file=None))) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_route_has_safe_error_contract() -> None:
    with TestClient(create_app(Settings(_env_file=None))) as client:
        response = client.get("/missing")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "NOT_FOUND",
            "message": "The requested resource was not found.",
        }
    }


def test_cors_allows_only_configured_origin() -> None:
    settings = Settings(
        _env_file=None,
        cors_origins=["https://example.com"],
    )
    with TestClient(create_app(settings)) as client:
        allowed = client.options(
            "/health",
            headers={
                "Origin": "https://example.com",
                "Access-Control-Request-Method": "GET",
            },
        )
        denied = client.options(
            "/health",
            headers={
                "Origin": "https://other.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://example.com"
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
