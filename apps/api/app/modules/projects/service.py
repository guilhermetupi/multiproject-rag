from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.projects.models import Project
from app.modules.projects.schemas import ProjectCreate, ProjectUpdate


def list_projects(db: Session) -> list[Project]:
    statement = select(Project).order_by(Project.created_at.desc())
    return list(db.scalars(statement).all())


def get_project(db: Session, project_id: str) -> Project:
    project = db.get(Project, project_id)

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return project


def create_project(db: Session, payload: ProjectCreate) -> Project:
    project = Project(
        name=payload.name,
        description=payload.description,
        system_prompt=payload.system_prompt,
        provider=payload.provider,
        model_name=payload.model_name,
        api_key=payload.api_key,
    )

    db.add(project)
    db.commit()
    db.refresh(project)

    return project


def update_project(
    db: Session,
    project_id: str,
    payload: ProjectUpdate,
) -> Project:
    project = get_project(db, project_id)

    update_data = payload.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(project, field, value)

    db.commit()
    db.refresh(project)

    return project


def delete_project(db: Session, project_id: str) -> None:
    project = get_project(db, project_id)

    db.delete(project)
    db.commit()