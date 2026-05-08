from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    system_prompt: str | None = Field(default=None, max_length=4000)
    provider: str | None = Field(default=None, max_length=40)
    model_name: str | None = Field(default=None, max_length=120)
    api_key: str | None = Field(default=None, max_length=500)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    system_prompt: str | None = Field(default=None, max_length=4000)
    provider: str | None = Field(default=None, max_length=40)
    model_name: str | None = Field(default=None, max_length=120)
    api_key: str | None = Field(default=None, max_length=500)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None
    system_prompt: str | None
    provider: str | None = None
    model_name: str | None = None
    api_key: str | None = Field(default=None, exclude=True)