from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.embeddings import get_embedding
from app.modules.faqs.models import FAQ
from app.modules.faqs.schemas import FAQCreate, FAQUpdate
from app.modules.projects.service import get_project


def _embed_faq(faq: FAQ) -> None:
    text = f"{faq.question} {faq.answer}"
    faq.embedding = get_embedding(text)


def list_faqs(db: Session, project_id: str) -> list[FAQ]:
    get_project(db, project_id)
    stmt = (
        select(FAQ)
        .where(FAQ.project_id == project_id)
        .order_by(FAQ.created_at.desc())
    )
    return list(db.scalars(stmt).all())


def get_faq(db: Session, project_id: str, faq_id: str) -> FAQ:
    get_project(db, project_id)
    faq = db.get(FAQ, faq_id)
    if not faq or faq.project_id != project_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="FAQ not found",
        )
    return faq


def create_faq(db: Session, project_id: str, payload: FAQCreate) -> FAQ:
    get_project(db, project_id)
    faq = FAQ(project_id=project_id, question=payload.question, answer=payload.answer)
    _embed_faq(faq)
    db.add(faq)
    db.commit()
    db.refresh(faq)
    return faq


def update_faq(
    db: Session, project_id: str, faq_id: str, payload: FAQUpdate
) -> FAQ:
    faq = get_faq(db, project_id, faq_id)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(faq, field, value)
    _embed_faq(faq)
    db.commit()
    db.refresh(faq)
    return faq


def delete_faq(db: Session, project_id: str, faq_id: str) -> None:
    faq = get_faq(db, project_id, faq_id)
    db.delete(faq)
    db.commit()
