"""Supabase Auth JWT validation, profile helpers, and RBAC dependencies."""

from collections.abc import Callable
from typing import Any

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.config import get_settings
from app.core.errors import APIError
from app.db.supabase import get_supabase, get_user_supabase
from app.schemas.auth import UpdatePreferencesRequest, UserProfile

ALLOWED_ROLES = frozenset({"student", "staff", "admin"})
PROFILE_COLUMNS = "id, email, full_name, role, reduced_mobility, prefer_covered"

_bearer_scheme = HTTPBearer(auto_error=False)


class AuthenticatedUser(BaseModel):
    """Authenticated user identity extracted from a verified Supabase JWT."""

    id: str
    email: str
    full_name: str = ""
    role: str = "student"
    access_token: str


def _is_usable_jwt_secret(secret: str | None) -> bool:
    if not secret:
        return False
    cleaned = secret.strip()
    return bool(cleaned) and not cleaned.startswith("YOUR_")


def _extract_app_role(
    app_metadata: dict[str, Any] | None,
) -> str:
    app_meta = app_metadata or {}
    candidate = app_meta.get("role")
    if isinstance(candidate, str) and candidate in ALLOWED_ROLES:
        return candidate
    return "student"


def _extract_full_name(
    user_metadata: dict[str, Any] | None,
    email: str,
) -> str:
    user_meta = user_metadata or {}
    raw_name = user_meta.get("full_name") or user_meta.get("name") or ""
    if isinstance(raw_name, str) and raw_name.strip():
        return raw_name.strip()
    if "@" in email:
        return email.split("@", 1)[0]
    return email


def _verify_token_with_supabase(token: str) -> AuthenticatedUser:
    try:
        supabase = get_supabase()
        response = supabase.auth.get_user(token)
    except APIError:
        raise
    except Exception as exc:
        raise APIError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Token de autenticación inválido o expirado.",
        ) from exc

    sb_user = getattr(response, "user", None)
    if sb_user is None or not getattr(sb_user, "id", None):
        raise APIError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Token de autenticación inválido o expirado.",
        )

    email = getattr(sb_user, "email", None) or ""
    user_metadata = getattr(sb_user, "user_metadata", None) or {}
    app_metadata = getattr(sb_user, "app_metadata", None) or {}
    full_name = _extract_full_name(user_metadata, email)
    role = _extract_app_role(app_metadata)

    return AuthenticatedUser(
        id=str(sb_user.id),
        email=email,
        full_name=full_name,
        role=role,
        access_token=token,
    )


def _decode_supabase_token(token: str) -> AuthenticatedUser:
    settings = get_settings()

    try:
        header = jwt.get_unverified_header(token)
    except jwt.InvalidTokenError as exc:
        raise APIError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Token JWT con formato inválido.",
        ) from exc

    algorithm = header.get("alg")
    secret = settings.supabase_jwt_secret

    if algorithm == "HS256" and _is_usable_jwt_secret(secret):
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except jwt.ExpiredSignatureError as exc:
            raise APIError(
                status_code=401,
                code="UNAUTHORIZED",
                message="El token de autenticación ha expirado.",
            ) from exc
        except jwt.InvalidTokenError as exc:
            raise APIError(
                status_code=401,
                code="UNAUTHORIZED",
                message="Token de autenticación inválido.",
            ) from exc

        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id.strip():
            raise APIError(
                status_code=401,
                code="UNAUTHORIZED",
                message="El token JWT no contiene un identificador de usuario válido.",
            )

        user_metadata = payload.get("user_metadata")
        app_metadata = payload.get("app_metadata")
        if not isinstance(user_metadata, dict):
            user_metadata = {}
        if not isinstance(app_metadata, dict):
            app_metadata = {}

        email = payload.get("email") or user_metadata.get("email") or ""
        if not isinstance(email, str):
            email = ""

        full_name = _extract_full_name(user_metadata, email)
        role = _extract_app_role(app_metadata)

        return AuthenticatedUser(
            id=user_id,
            email=email,
            full_name=full_name,
            role=role,
            access_token=token,
        )

    return _verify_token_with_supabase(token)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthenticatedUser:
    """FastAPI dependency that validates a Supabase Bearer JWT."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise APIError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Se requiere un token Bearer en el encabezado Authorization.",
        )

    token = credentials.credentials.strip()
    if not token:
        raise APIError(
            status_code=401,
            code="UNAUTHORIZED",
            message="El token Bearer no puede estar vacío.",
        )

    return _decode_supabase_token(token)


def _fetch_profile_row(
    user_id: str,
    access_token: str | None = None,
) -> dict[str, Any] | None:
    supabase = get_user_supabase(access_token)
    response = (
        supabase.table("profiles")
        .select(PROFILE_COLUMNS)
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def get_or_create_user_profile(user: AuthenticatedUser) -> UserProfile:
    """Fetch user profile from Supabase or create a default row if missing."""
    existing = _fetch_profile_row(user.id, user.access_token)
    if existing is not None:
        return UserProfile.model_validate(existing)

    fallback_name = (
        user.full_name.strip()
        or (user.email.split("@", 1)[0] if "@" in user.email else user.email)
        or "Estudiante"
    )
    role = user.role if user.role in ALLOWED_ROLES else "student"

    default_profile: dict[str, Any] = {
        "id": user.id,
        "email": user.email,
        "full_name": fallback_name,
        "role": role,
        "reduced_mobility": False,
        "prefer_covered": False,
    }

    supabase = get_user_supabase(user.access_token)
    response = (
        supabase.table("profiles")
        .upsert(default_profile, on_conflict="id")
        .execute()
    )
    rows = response.data or []
    row = rows[0] if rows else default_profile
    return UserProfile.model_validate(row)


def update_user_preferences(
    user: AuthenticatedUser,
    payload: UpdatePreferencesRequest,
) -> UserProfile:
    """Update reduced_mobility and/or prefer_covered preferences for the user."""
    if payload.reduced_mobility is None and payload.prefer_covered is None:
        raise APIError(
            status_code=400,
            code="VALIDATION_ERROR",
            message="Debes enviar al menos una preferencia para actualizar.",
        )

    existing = get_or_create_user_profile(user)

    updates: dict[str, Any] = {}
    if payload.reduced_mobility is not None:
        updates["reduced_mobility"] = payload.reduced_mobility
    if payload.prefer_covered is not None:
        updates["prefer_covered"] = payload.prefer_covered

    supabase = get_user_supabase(user.access_token)
    response = (
        supabase.table("profiles")
        .update(updates)
        .eq("id", user.id)
        .execute()
    )
    rows = response.data or []
    if rows:
        return UserProfile.model_validate(rows[0])
    return existing.model_copy(update=updates)


def require_roles(*allowed_roles: str) -> Callable[..., AuthenticatedUser]:
    """Build a FastAPI dependency restricting access to specific user roles."""
    normalized_roles = tuple(role.strip() for role in allowed_roles if role.strip())

    def _check_role(
        user: AuthenticatedUser = Depends(get_current_user),
    ) -> AuthenticatedUser:
        profile_row = _fetch_profile_row(user.id, user.access_token)
        effective_role = (
            profile_row.get("role")
            if isinstance(profile_row, dict) and profile_row.get("role") in ALLOWED_ROLES
            else user.role
        )
        if effective_role not in normalized_roles:
            raise APIError(
                status_code=403,
                code="UNAUTHORIZED",
                message="No tienes permisos suficientes para realizar esta acción.",
                details={
                    "required_roles": list(normalized_roles),
                    "current_role": effective_role,
                },
            )
        return user.model_copy(update={"role": effective_role})

    return _check_role
