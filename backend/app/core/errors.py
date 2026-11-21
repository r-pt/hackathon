"""Shared contract-compliant error helpers (frozen in Fase 0).

Both Persona A and Persona B raise APIError so every endpoint returns the exact
ErrorResponse shape defined in docs/openapi.yaml.
"""

from typing import Any


class APIError(Exception):
    """Domain/HTTP error serialized to the OpenAPI ErrorResponse schema."""

    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "error": {
                "code": self.code,
                "message": self.message,
            }
        }
        if self.details:
            payload["error"]["details"] = self.details
        return payload
