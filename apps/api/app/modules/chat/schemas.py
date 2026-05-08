from datetime import datetime

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None


class ChatSource(BaseModel):
    document_id: str
    chunk_id: str
    title: str | None = None
    score: float | None = None


class ChatResponse(BaseModel):
    answer: str
    session_id: str
    sources: list[ChatSource]


class ChatMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionResponse(BaseModel):
    id: str
    project_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ChatSessionDetailResponse(BaseModel):
    id: str
    project_id: str
    created_at: datetime
    messages: list[ChatMessageResponse]

    model_config = {"from_attributes": True}