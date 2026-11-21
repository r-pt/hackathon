"""Health router — Owner: Persona A (feat/backend-a)."""

from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def get_health() -> dict[str, str]:
    """Stub Fase 0. Persona A reemplaza con chequeo real a Supabase."""
    return {
        "status": "ok",
        "database": "disconnected",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
