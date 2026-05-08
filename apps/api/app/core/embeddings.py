from httpx import Client, ConnectError, HTTPStatusError, ReadTimeout

from app.core.config import settings


class EmbeddingError(Exception):
    pass


def get_embedding(text: str) -> list[float]:
    try:
        with Client(
            base_url=settings.ollama_base_url,
            timeout=settings.ollama_timeout,
        ) as client:
            response = client.post(
                "/api/embeddings",
                json={
                    "model": settings.embedding_model,
                    "prompt": text,
                },
            )
            response.raise_for_status()
            return response.json()["embedding"]
    except ConnectError:
        raise EmbeddingError("Ollama is not reachable")
    except ReadTimeout:
        raise EmbeddingError("Ollama embeddings request timed out — the model may be loading")
    except HTTPStatusError as exc:
        raise EmbeddingError(f"Ollama embeddings failed: {exc.response.text}")
    except KeyError:
        raise EmbeddingError("Ollama embeddings response missing 'embedding' field")


def get_embeddings(texts: list[str]) -> list[list[float]]:
    embeddings: list[list[float]] = []

    try:
        with Client(
            base_url=settings.ollama_base_url,
            timeout=settings.ollama_timeout,
        ) as client:
            for text in texts:
                response = client.post(
                    "/api/embeddings",
                    json={
                        "model": settings.embedding_model,
                        "prompt": text,
                    },
                )
                response.raise_for_status()
                embeddings.append(response.json()["embedding"])
    except ConnectError:
        raise EmbeddingError("Ollama is not reachable")
    except ReadTimeout:
        raise EmbeddingError("Ollama embeddings request timed out — the model may be loading")
    except HTTPStatusError as exc:
        raise EmbeddingError(f"Ollama embeddings failed: {exc.response.text}")
    except KeyError:
        raise EmbeddingError("Ollama embeddings response missing 'embedding' field")

    return embeddings
