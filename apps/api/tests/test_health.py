from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient


def test_health_all_ok():
    from app.main import app

    with patch("app.main.SessionLocal") as mock_sm, \
         patch("app.main.Client") as mock_client_cls:

        mock_db = MagicMock()
        mock_sm.return_value = mock_db

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        client = TestClient(app)
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["database"] == "ok"
        assert data["ollama"] == "ok"


def test_health_ollama_unreachable():
    from app.main import app
    from httpx import ConnectError

    with patch("app.main.SessionLocal") as mock_sm, \
         patch("app.main.Client") as mock_client_cls:

        mock_db = MagicMock()
        mock_sm.return_value = mock_db

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.get.side_effect = ConnectError("boom")
        mock_client_cls.return_value = mock_client

        client = TestClient(app)
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "degraded"
        assert data["ollama"] == "unreachable"
