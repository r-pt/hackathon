"""Campus map & locations router — Owner: Persona A (feat/backend-a)."""

from fastapi import APIRouter

from app.core.errors import APIError

router = APIRouter(prefix="/campus")


@router.get("/map")
async def get_campus_map(floor: int | None = None) -> dict[str, str]:
    _ = floor
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona A (ver docs/openapi.yaml).",
    )


@router.get("/locations")
async def list_campus_locations(
    search: str | None = None, floor: int | None = None
) -> dict[str, str]:
    _ = (search, floor)
    raise APIError(
        status_code=501,
        code="INTERNAL_ERROR",
        message="Pendiente de implementación por Persona A (ver docs/openapi.yaml).",
    )
