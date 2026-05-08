from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.modules.faqs.schemas import FAQCreate, FAQResponse, FAQUpdate
from app.modules.faqs import service

router = APIRouter()


@router.get("", response_model=list[FAQResponse])
def list_faqs(
    project_id: str,
    db: Session = Depends(get_db),
):
    return service.list_faqs(db, project_id)


@router.post(
    "",
    response_model=FAQResponse,
    dependencies=[Depends(require_admin)],
)
def create_faq(
    project_id: str,
    payload: FAQCreate,
    db: Session = Depends(get_db),
):
    return service.create_faq(db, project_id, payload)


@router.patch(
    "/{faq_id}",
    response_model=FAQResponse,
    dependencies=[Depends(require_admin)],
)
def update_faq(
    project_id: str,
    faq_id: str,
    payload: FAQUpdate,
    db: Session = Depends(get_db),
):
    return service.update_faq(db, project_id, faq_id, payload)


@router.delete(
    "/{faq_id}",
    dependencies=[Depends(require_admin)],
)
def delete_faq(
    project_id: str,
    faq_id: str,
    db: Session = Depends(get_db),
):
    service.delete_faq(db, project_id, faq_id)
    return {"id": faq_id, "deleted": True}
