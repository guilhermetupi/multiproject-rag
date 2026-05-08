from datetime import datetime

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    id: str
    project_id: str
    filename: str
    content_type: str | None
    status: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }


class DocumentUploadResponse(BaseModel):
    id: str
    project_id: str
    filename: str
    content_type: str | None
    status: str
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }


class DocumentIngestResponse(BaseModel):
    document_id: str
    project_id: str
    status: str


class DocumentChunkResponse(BaseModel):
    id: str
    project_id: str
    document_id: str
    chunk_index: int
    content: str
    page_number: int | None
    section_title: str | None
    created_at: datetime

    model_config = {
        "from_attributes": True,
    }