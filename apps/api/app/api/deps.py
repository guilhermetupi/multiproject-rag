from fastapi import Header, HTTPException, status

from app.core.config import settings


def require_admin(
    authorization: str | None = Header(default=None),
) -> None:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization header",
        )

    scheme, _, token = authorization.partition(" ")

    if scheme.lower() != "bearer" or token != settings.admin_api_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid admin credentials",
        )

def require_public_project_access(project_id: str) -> None:
    return None


def require_project_admin_access(project_id: str) -> None:
    """
    Placeholder.

    Depois, isso pode:
    - validar admin global
    - ou validar owner do projeto
    - ou validar role do usuário
    """
    return None