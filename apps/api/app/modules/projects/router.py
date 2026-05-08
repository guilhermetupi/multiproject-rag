from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.db.session import get_db
from app.modules.projects.schemas import (
    ProjectCreate,
    ProjectResponse,
    ProjectUpdate,
)
from app.modules.projects import service

router = APIRouter()


@router.get("", response_model=list[ProjectResponse])
def list_projects(db: Session = Depends(get_db)):
    return service.list_projects(db)


@router.post(
    "",
    response_model=ProjectResponse,
    dependencies=[Depends(require_admin)],
)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
):
    return service.create_project(db, payload)


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
):
    return service.get_project(db, project_id)


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    dependencies=[Depends(require_admin)],
)
def update_project(
    project_id: str,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
):
    return service.update_project(db, project_id, payload)


@router.delete(
    "/{project_id}",
    dependencies=[Depends(require_admin)],
)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
):
    service.delete_project(db, project_id)
    return {"id": project_id, "deleted": True}