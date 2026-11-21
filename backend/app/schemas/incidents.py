"""Pydantic schemas for campus incidents / conflicts."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TargetType = Literal["node", "edge"]
ConflictType = Literal[
    "elevator_broken",
    "stairs_blocked",
    "ramp_obstructed",
    "corridor_closed",
    "crowd_congestion",
]
IncidentSeverity = Literal["blocking", "warning"]
IncidentStatus = Literal["active", "resolved"]


class Incident(BaseModel):
    """Campus incident affecting either a node or an edge."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    target_type: TargetType
    node_id: str | None = None
    edge_id: str | None = None
    conflict_type: ConflictType
    severity: IncidentSeverity
    status: IncidentStatus
    description: str
    reported_at: datetime
    resolved_at: datetime | None = None


class CreateIncidentRequest(BaseModel):
    """Request payload to report a new campus incident."""

    target_type: TargetType
    node_id: str | None = None
    edge_id: str | None = None
    conflict_type: ConflictType
    severity: IncidentSeverity
    description: str = Field(..., min_length=3, max_length=280)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str) -> str:
        cleaned = value.strip()
        if len(cleaned) < 3 or len(cleaned) > 280:
            raise ValueError("La descripción debe tener entre 3 y 280 caracteres.")
        return cleaned

    @model_validator(mode="after")
    def validate_target_reference(self) -> "CreateIncidentRequest":
        node_id = self.node_id.strip() if isinstance(self.node_id, str) else None
        edge_id = self.edge_id.strip() if isinstance(self.edge_id, str) else None
        self.node_id = node_id or None
        self.edge_id = edge_id or None

        if self.target_type == "node":
            if not self.node_id or self.edge_id is not None:
                raise ValueError(
                    "Cuando target_type es 'node', debes enviar 'node_id' y dejar 'edge_id' en null."
                )
        elif self.target_type == "edge":
            if not self.edge_id or self.node_id is not None:
                raise ValueError(
                    "Cuando target_type es 'edge', debes enviar 'edge_id' y dejar 'node_id' en null."
                )
        return self


class UpdateIncidentRequest(BaseModel):
    """Partial update payload to resolve or edit an existing incident."""

    status: IncidentStatus | None = None
    severity: IncidentSeverity | None = None
    description: str | None = Field(default=None, min_length=3, max_length=280)

    @field_validator("description")
    @classmethod
    def validate_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if len(cleaned) < 3 or len(cleaned) > 280:
            raise ValueError("La descripción debe tener entre 3 y 280 caracteres.")
        return cleaned


class IncidentsListResponse(BaseModel):
    """Response envelope for listing campus incidents."""

    items: list[Incident]
