"""Pydantic schemas for authentication and user mobility preferences."""

from pydantic import BaseModel, ConfigDict


class UserProfile(BaseModel):
    """Student/user profile and persisted mobility preferences."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    reduced_mobility: bool
    prefer_covered: bool


class UpdatePreferencesRequest(BaseModel):
    """Partial update payload for user mobility preferences."""

    reduced_mobility: bool | None = None
    prefer_covered: bool | None = None
