import shutil
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.documents.models import Document, DocumentChunk
from app.modules.projects.service import get_project
from app.modules.documents.ingestion import ingest_document

ALLOWED_CONTENT_TYPES = {
    "text/plain",
    "text/markdown",
    "application/pdf",
}


def _get_project_storage_dir(project_id: str) -> Path:
    return Path(settings.storage_dir) / "projects" / project_id / "documents"


def _build_storage_path(project_id: str, document_id: str, filename: str) -> Path:
    safe_filename = Path(filename).name
    return _get_project_storage_dir(project_id) / document_id / safe_filename


def list_project_documents(db: Session, project_id: str) -> list[Document]:
    get_project(db, project_id)

    statement = (
        select(Document)
        .where(Document.project_id == project_id)
        .order_by(Document.created_at.desc())
    )

    return list(db.scalars(statement).all())


def get_project_document(
    db: Session,
    project_id: str,
    document_id: str,
) -> Document:
    statement = select(Document).where(
        Document.id == document_id,
        Document.project_id == project_id,
    )

    document = db.scalar(statement)

    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found",
        )

    return document


def create_project_document(
    db: Session,
    project_id: str,
    file: UploadFile,
) -> Document:
    get_project(db, project_id)

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must have a filename",
        )

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type",
        )

    if file.size and file.size > settings.max_upload_size_mb * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_upload_size_mb}MB",
        )

    document = Document(
        project_id=project_id,
        filename=Path(file.filename).name,
        content_type=file.content_type,
        status="uploaded",
    )

    db.add(document)
    db.flush()

    storage_path = _build_storage_path(
        project_id=project_id,
        document_id=document.id,
        filename=document.filename,
    )

    storage_path.parent.mkdir(parents=True, exist_ok=True)

    try:
        with storage_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        document.storage_path = str(storage_path)

        db.commit()
        db.refresh(document)

        return document

    except Exception:
        db.rollback()

        if storage_path.exists():
            storage_path.unlink()

        raise


def delete_project_document(
    db: Session,
    project_id: str,
    document_id: str,
) -> None:
    document = get_project_document(db, project_id, document_id)

    storage_path = Path(document.storage_path) if document.storage_path else None

    db.delete(document)
    db.commit()

    if storage_path and storage_path.exists():
        storage_path.unlink()


def run_document_ingestion(
    db: Session,
    project_id: str,
    document_id: str,
) -> Document:
    document = get_project_document(db, project_id, document_id)

    if document.status == "processing":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is already processing",
        )

    return ingest_document(db, document)


def list_document_chunks(
    db: Session,
    project_id: str,
    document_id: str,
) -> list[DocumentChunk]:
    get_project_document(db, project_id, document_id)

    statement = (
        select(DocumentChunk)
        .where(
            DocumentChunk.project_id == project_id,
            DocumentChunk.document_id == document_id,
        )
        .order_by(DocumentChunk.chunk_index.asc())
    )

    return list(db.scalars(statement).all())
