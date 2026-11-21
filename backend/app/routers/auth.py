"""Auth y preferencias — Dueño: Persona A."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/auth")


def _todo() -> APIError:
    return APIError(status_code=501, code="INTERNAL_ERROR", message="Pendiente: Persona A")


@router.get("/me")
async def get_current_user() -> dict:
    raise _todo()


@router.patch("/preferences")
async def update_preferences() -> dict:
    raise _todo()
