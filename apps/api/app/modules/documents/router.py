from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.modules.documents import service
from app.modules.documents.schemas import (
    DocumentChunkResponse,
    DocumentIngestResponse,
    DocumentResponse,
    DocumentUploadResponse,
)

router = APIRouter()


@router.get(
    "",
    response_model=list[DocumentResponse],
    dependencies=[Depends(require_admin)],
)
def list_project_documents(
    project_id: str,
    db: Session = Depends(get_db),
):
    return service.list_project_documents(db, project_id)


@router.post(
    "",
    response_model=DocumentUploadResponse,
    dependencies=[Depends(require_admin)],
)
async def upload_project_document(
    project_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    return service.create_project_document(db, project_id, file)


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    dependencies=[Depends(require_admin)],
)
def get_project_document(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    return service.get_project_document(db, project_id, document_id)


@router.delete(
    "/{document_id}",
    dependencies=[Depends(require_admin)],
)
def delete_project_document(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    service.delete_project_document(db, project_id, document_id)

    return {
        "project_id": project_id,
        "document_id": document_id,
        "deleted": True,
    }


@router.post(
    "/{document_id}/ingest",
    response_model=DocumentIngestResponse,
    dependencies=[Depends(require_admin)],
)
def ingest_project_document(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    document = service.run_document_ingestion(db, project_id, document_id)

    return DocumentIngestResponse(
        document_id=document.id,
        project_id=document.project_id,
        status=document.status,
        error_message=document.error_message,
    )


@router.get(
    "/{document_id}/chunks",
    response_model=list[DocumentChunkResponse],
    dependencies=[Depends(require_admin)],
)
def list_document_chunks(
    project_id: str,
    document_id: str,
    db: Session = Depends(get_db),
):
    return service.list_document_chunks(db, project_id, document_id)
