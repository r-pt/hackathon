"""Auth & preferences router — Owner: Persona A (feat/backend-a)."""

from fastapi import APIRouter, Depends

from app.core.auth import (
    AuthenticatedUser,
    get_current_user,
    get_or_create_user_profile,
    update_user_preferences,
)
from app.schemas.auth import UpdatePreferencesRequest, UserProfile

router = APIRouter(prefix="/auth")


@router.get("/me", response_model=UserProfile, operation_id="getCurrentUser")
def get_me(
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserProfile:
    return get_or_create_user_profile(current_user)


@router.patch(
    "/preferences",
    response_model=UserProfile,
    operation_id="updatePreferences",
)
def update_preferences(
    payload: UpdatePreferencesRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
) -> UserProfile:
    return update_user_preferences(current_user, payload)
