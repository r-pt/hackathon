"""Pydantic schemas for /health and /campus/* endpoints (docs/openapi.yaml)."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field, field_serializer

from app.schemas.incidents import Incident

HealthStatus = Literal["ok", "degraded"]
DatabaseStatus = Literal["connected", "disconnected"]
NodeType = Literal["entrance", "room", "corridor", "elevator", "stairs", "ramp"]
EdgeType = Literal["corridor", "stairs", "elevator", "ramp", "outdoor"]


class HealthResponse(BaseModel):
    status: HealthStatus
    database: DatabaseStatus
    timestamp: datetime

    @field_serializer("timestamp")
    def _serialize_timestamp(self, value: datetime) -> str:
        utc_dt = (
            value.astimezone(timezone.utc)
            if value.tzinfo is not None
            else value.replace(tzinfo=timezone.utc)
        )
        return utc_dt.isoformat().replace("+00:00", "Z")


class CampusBuilding(BaseModel):
    id: str
    name: str
    x: int
    y: int
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    floors: int = Field(ge=1)
    color: str


class CampusNode(BaseModel):
    id: str
    name: str
    building: str
    floor: int = Field(ge=1)
    node_type: NodeType
    x: int
    y: int
    z: int
    is_destination: bool
    landmark: str = ""


class CampusEdge(BaseModel):
    id: str
    from_node_id: str
    to_node_id: str
    distance_m: int = Field(ge=1)
    base_weight: float = Field(ge=0.1)
    edge_type: EdgeType
    is_accessible: bool
    is_covered: bool
    bidirectional: bool


class ViewBox(BaseModel):
    width: int
    height: int


class CampusMapResponse(BaseModel):
    campus_name: str
    viewbox: ViewBox
    floors: list[int]
    buildings: list[CampusBuilding]
    nodes: list[CampusNode]
    edges: list[CampusEdge]
    active_incidents: list[Incident]


class LocationItem(BaseModel):
    id: str
    name: str
    building: str
    floor: int = Field(ge=1)
    node_type: NodeType
    landmark: str = ""


class LocationsResponse(BaseModel):
    items: list[LocationItem]
