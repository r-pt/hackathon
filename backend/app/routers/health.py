"""Health router — Owner: Persona A (feat/backend-a)."""

from datetime import datetime, timezone

from fastapi import APIRouter

from app.db.supabase import check_supabase_connection
from app.schemas.campus import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse, operation_id="getHealth")
def get_health() -> HealthResponse:
    """Return service health and live Supabase database connectivity status."""
    connected = check_supabase_connection()
    timestamp = datetime.now(timezone.utc).replace(microsecond=0)
    return HealthResponse(
        status="ok" if connected else "degraded",
        database="connected" if connected else "disconnected",
        timestamp=timestamp,
    )
