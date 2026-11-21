"""Auth & preferences router — Owner: Persona A (feat/backend-a)."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/auth")


@router.get("/me")
async def get_current_user() -> dict[str, str]:
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona A (ver docs/openapi.yaml).",
    )


@router.patch("/preferences")
async def update_preferences() -> dict[str, str]:
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona A (ver docs/openapi.yaml).",
    )
