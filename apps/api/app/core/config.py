from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    admin_api_token: str = "dev-admin-token"
    storage_dir: str = "storage"

    database_url: str = (
        "postgresql+psycopg://multiproject:multiproject"
        "@localhost:5433/multiproject_rag"
    )

    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    ollama_base_url: str = "http://localhost:11434"
    ollama_timeout: int = 120
    embedding_model: str = "mxbai-embed-large"
    chat_model: str = "llama3.1:8b"
    llm_temperature: float = 0.0
    max_upload_size_mb: int = 20
    max_retrieval_chunks: int = 8

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


settings = Settings()
