from fastapi import APIRouter

from app.modules.projects.router import router as projects_router
from app.modules.documents.router import router as documents_router
from app.modules.chat.router import router as chat_router
from app.modules.faqs.router import router as faqs_router

api_router = APIRouter()

api_router.include_router(
    projects_router,
    prefix="/projects",
    tags=["projects"],
)

api_router.include_router(
    documents_router,
    prefix="/projects/{project_id}/documents",
    tags=["documents"],
)

api_router.include_router(
    chat_router,
    prefix="/projects/{project_id}/chat",
    tags=["chat"],
)

api_router.include_router(
    faqs_router,
    prefix="/projects/{project_id}/faqs",
    tags=["faqs"],
)