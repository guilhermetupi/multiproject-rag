from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from httpx import Client, ConnectError
from sqlalchemy import text

import app.db.models

from app.api.router import api_router
from app.core.config import settings
from app.db.session import SessionLocal

app = FastAPI(
    title="Multiproject RAG API",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health")
def health_check():
    db_status = "ok"
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
    except Exception:
        db_status = "error"

    ollama_status = "ok"
    try:
        with Client(base_url=settings.ollama_base_url, timeout=5) as client:
            client.get("/api/tags")
    except ConnectError:
        ollama_status = "unreachable"
    except Exception:
        ollama_status = "error"

    overall = "ok" if db_status == "ok" and ollama_status == "ok" else "degraded"

    return {
        "status": overall,
        "database": db_status,
        "ollama": ollama_status,
    }
