from datetime import datetime

from pydantic import BaseModel, Field


class FAQCreate(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=4000)


class FAQUpdate(BaseModel):
    question: str | None = Field(default=None, min_length=1, max_length=2000)
    answer: str | None = Field(default=None, min_length=1, max_length=4000)


class FAQResponse(BaseModel):
    id: str
    project_id: str
    question: str
    answer: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
