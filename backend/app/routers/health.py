"""Health — Dueño: Persona A."""

from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def get_health() -> dict[str, str]:
    """Stub de Fase 0. Persona A agrega el chequeo real a Supabase."""
    return {
        "status": "ok",
        "database": "disconnected",
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
