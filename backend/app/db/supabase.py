"""Shared Supabase client singleton and connectivity check."""

from functools import lru_cache

from supabase import Client, ClientOptions, create_client

from app.core.config import get_settings
from app.core.errors import APIError

POSTGREST_TIMEOUT_SECONDS = 5


def _create_supabase_client() -> Client:
    """Instantiate a Supabase client from settings or raise a clean 500 APIError."""
    settings = get_settings()
    if not settings.is_supabase_configured:
        raise APIError(
            status_code=500,
            code="INTERNAL_ERROR",
            message=(
                "Configuración de Supabase incompleta. "
                "Define SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en backend/.env."
            ),
        )

    try:
        return create_client(
            settings.supabase_url.strip(),
            settings.supabase_service_role_key.strip(),
            options=ClientOptions(postgrest_client_timeout=POSTGREST_TIMEOUT_SECONDS),
        )
    except Exception as exc:
        raise APIError(
            status_code=500,
            code="INTERNAL_ERROR",
            message="No se pudo inicializar el cliente de Supabase.",
        ) from exc


@lru_cache(maxsize=1)
def get_supabase() -> Client:
    """Return a cached Supabase client configured with the project key.

    Raises APIError(500, INTERNAL_ERROR) if Supabase environment variables are
    missing or still use placeholder values. Never fails on module import.
    """
    return _create_supabase_client()


def get_user_supabase(access_token: str | None = None) -> Client:
    """Return a per-request Supabase client optionally authenticated with a user JWT.

    Using a separate client prevents mutating the shared singleton's PostgREST
    Authorization header while allowing RLS-protected queries to succeed with
    either a service_role key or an anon key.
    """
    client = _create_supabase_client()
    if access_token:
        client.postgrest.auth(access_token)
    return client


def check_supabase_connection() -> bool:
    """Perform a lightweight query against Supabase and return connectivity status."""
    try:
        get_supabase().table("buildings").select("id").limit(1).execute()
        return True
    except Exception:
        return False
