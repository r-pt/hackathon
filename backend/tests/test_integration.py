"""End-to-end integration tests wiring Persona A (DB/Auth/Campus/Incidents) and Persona B (Routing/Weather)."""

from __future__ import annotations

import asyncio
import sys
import types
from collections.abc import Iterator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.db.local_store import (
    MAX_LOCAL_INCIDENTS,
    create_local_incident,
    list_local_incidents,
    reset_local_store,
    update_local_incident,
)
from app.main import app
from app.routers.routes import load_campus_graph
from app.schemas.incidents import CreateIncidentRequest, UpdateIncidentRequest
from app.services import weather_service
from app.services.weather_service import _get_coordinates, clear_weather_cache, get_campus_weather

client = TestClient(app)
DEMO_AUTH_HEADERS = {"Authorization": "Bearer demo-student-token"}


@pytest.fixture(autouse=True)
def _reset_store_between_tests() -> Iterator[None]:
    reset_local_store()
    yield
    reset_local_store()


def test_health_reports_degraded_when_supabase_unconfigured() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"] == "disconnected"
    assert isinstance(body["timestamp"], str)
    assert body["timestamp"].endswith("Z")


def test_campus_map_full_and_floor_filtering() -> None:
    full_resp = client.get("/api/v1/campus/map")
    assert full_resp.status_code == 200
    full_body = full_resp.json()
    assert full_body["campus_name"] == "UTFSM Casa Central — Campus Simulado"
    assert full_body["viewbox"] == {"width": 1600, "height": 1050}
    assert full_body["floors"] == [1, 2]
    assert len(full_body["buildings"]) == 6
    assert {b["id"] for b in full_body["buildings"]} == {
        "bld-a",
        "bld-b",
        "bld-c",
        "bld-f",
        "bld-m",
        "bld-p",
    }
    assert len(full_body["nodes"]) == 20
    assert len(full_body["edges"]) == 30
    assert [inc["id"] for inc in full_body["active_incidents"]] == ["cc-inc-1"]

    floor1_resp = client.get("/api/v1/campus/map", params={"floor": 1})
    assert floor1_resp.status_code == 200
    floor1_body = floor1_resp.json()
    assert floor1_body["floors"] == [1, 2]
    assert len(floor1_body["nodes"]) == 16
    assert all(node["floor"] == 1 for node in floor1_body["nodes"])
    floor1_node_ids = {node["id"] for node in floor1_body["nodes"]}
    assert all(
        edge["from_node_id"] in floor1_node_ids and edge["to_node_id"] in floor1_node_ids
        for edge in floor1_body["edges"]
    )
    assert [inc["id"] for inc in floor1_body["active_incidents"]] == ["cc-inc-1"]

    floor2_resp = client.get("/api/v1/campus/map", params={"floor": 2})
    assert floor2_resp.status_code == 200
    floor2_body = floor2_resp.json()
    assert floor2_body["floors"] == [1, 2]
    assert len(floor2_body["nodes"]) == 4
    assert {node["id"] for node in floor2_body["nodes"]} == {
        "cc-ascensor-a-p2",
        "cc-ascensor-b-p2",
        "cc-aula-a201",
        "cc-sala-b202",
    }
    assert {edge["id"] for edge in floor2_body["edges"]} == {"cc-e9", "cc-e14", "cc-e15"}
    assert floor2_body["active_incidents"] == []


def test_campus_locations_search_and_floor_filter() -> None:
    all_resp = client.get("/api/v1/campus/locations")
    assert all_resp.status_code == 200
    all_ids = {item["id"] for item in all_resp.json()["items"]}
    assert len(all_ids) == 17
    assert {
        "cc-salida-placeres",
        "cc-salida-oriente",
        "cc-explanada-espana",
        "cc-patio-central",
        "cc-paseo-poniente",
        "cc-terraza-placeres",
    }.issubset(all_ids)

    p1_resp = client.get("/api/v1/campus/locations", params={"floor": 1})
    assert p1_resp.status_code == 200
    assert len(p1_resp.json()["items"]) == 13

    p2_resp = client.get("/api/v1/campus/locations", params={"floor": 2})
    assert p2_resp.status_code == 200
    assert {item["id"] for item in p2_resp.json()["items"]} == {
        "cc-ascensor-a-p2",
        "cc-ascensor-b-p2",
        "cc-aula-a201",
        "cc-sala-b202",
    }

    response = client.get(
        "/api/v1/campus/locations",
        params={"search": "espana", "floor": 1},
    )
    assert response.status_code == 200
    items = response.json()["items"]
    assert {item["id"] for item in items} == {
        "cc-acceso-espana",
        "cc-explanada-espana",
        "cc-salida-oriente",
    }
    assert all(item["floor"] == 1 for item in items)

    # Accent-insensitive search (informatica matches Edificio M and Paseo Poniente landmark)
    accent_resp = client.get(
        "/api/v1/campus/locations",
        params={"search": "informatica"},
    )
    assert accent_resp.status_code == 200
    assert [item["id"] for item in accent_resp.json()["items"]] == [
        "cc-edificio-m",
        "cc-paseo-poniente",
    ]


def test_auth_me_and_preferences_persistence_in_local_demo_mode() -> None:
    no_auth = client.get("/api/v1/auth/me")
    assert no_auth.status_code == 401
    assert no_auth.json()["error"]["code"] == "UNAUTHORIZED"

    wrong_auth = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert wrong_auth.status_code == 401
    assert wrong_auth.json()["error"]["code"] == "UNAUTHORIZED"

    me_resp = client.get("/api/v1/auth/me", headers=DEMO_AUTH_HEADERS)
    assert me_resp.status_code == 200
    profile = me_resp.json()
    assert profile == {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "demo@campusroute.edu",
        "full_name": "Estudiante Demo",
        "reduced_mobility": True,
        "prefer_covered": False,
    }

    patch_resp = client.patch(
        "/api/v1/auth/preferences",
        headers=DEMO_AUTH_HEADERS,
        json={"reduced_mobility": False, "prefer_covered": True},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()
    assert updated["reduced_mobility"] is False
    assert updated["prefer_covered"] is True

    me_after = client.get("/api/v1/auth/me", headers=DEMO_AUTH_HEADERS)
    assert me_after.status_code == 200
    assert me_after.json()["reduced_mobility"] is False
    assert me_after.json()["prefer_covered"] is True

    empty_patch = client.patch(
        "/api/v1/auth/preferences",
        headers=DEMO_AUTH_HEADERS,
        json={},
    )
    assert empty_patch.status_code == 400
    assert empty_patch.json()["error"]["code"] == "VALIDATION_ERROR"


def test_integrated_incident_to_routing_block_and_resolve_flow() -> None:
    # 1. Create a blocking incident on Elevator B (Floor 1) in Casa Central
    create_resp = client.post(
        "/api/v1/incidents",
        headers=DEMO_AUTH_HEADERS,
        json={
            "target_type": "node",
            "node_id": "cc-ascensor-b-p1",
            "edge_id": None,
            "conflict_type": "elevator_broken",
            "severity": "blocking",
            "description": "Ascensor Edificio B en reparación de emergencia",
        },
    )
    assert create_resp.status_code == 201
    created_incident = create_resp.json()
    new_incident_id = created_incident["id"]
    assert created_incident["status"] == "active"
    assert created_incident["resolved_at"] is None

    # 2. Verify /campus/map reflects both cc-inc-1 and the new active incident
    map_resp = client.get("/api/v1/campus/map")
    assert map_resp.status_code == 200
    active_ids = {inc["id"] for inc in map_resp.json()["active_incidents"]}
    assert {"cc-inc-1", new_incident_id}.issubset(active_ids)

    # 3. Verify /routes/calculate returns 422 NO_ACCESSIBLE_ROUTE naming both incidents
    blocked_route_resp = client.post(
        "/api/v1/routes/calculate",
        json={
            "origin_node_id": "cc-acceso-espana",
            "destination_node_id": "cc-ascensor-a-p2",
            "reduced_mobility": True,
            "use_live_weather": False,
            "algorithm": "astar",
        },
    )
    assert blocked_route_resp.status_code == 422
    err = blocked_route_resp.json()["error"]
    assert err["code"] == "NO_ACCESSIBLE_ROUTE"
    assert set(err["details"]["blocking_incident_ids"]) == {"cc-inc-1", new_incident_id}

    # 4. Resolve the new incident via PATCH /api/v1/incidents/{id}
    resolve_resp = client.patch(
        f"/api/v1/incidents/{new_incident_id}",
        headers=DEMO_AUTH_HEADERS,
        json={"status": "resolved"},
    )
    assert resolve_resp.status_code == 200
    resolved = resolve_resp.json()
    assert resolved["status"] == "resolved"
    assert resolved["resolved_at"] is not None

    # 5. Verify /routes/calculate now succeeds with 200 via Elevator B and avoids cc-inc-1
    ok_route_resp = client.post(
        "/api/v1/routes/calculate",
        json={
            "origin_node_id": "cc-acceso-espana",
            "destination_node_id": "cc-ascensor-a-p2",
            "reduced_mobility": True,
            "use_live_weather": False,
            "algorithm": "astar",
        },
    )
    assert ok_route_resp.status_code == 200
    route_body = ok_route_resp.json()
    assert route_body["accessibility_verified"] is True
    assert "cc-ascensor-b-p1" in route_body["path_node_ids"]
    assert any(c["incident_id"] == "cc-inc-1" for c in route_body["avoided_conflicts"])


def test_invalid_create_incident_returns_400_jsonable_validation_error() -> None:
    response = client.post(
        "/api/v1/incidents",
        headers=DEMO_AUTH_HEADERS,
        json={
            "target_type": "node",
            "node_id": None,
            "edge_id": None,
            "conflict_type": "elevator_broken",
            "severity": "blocking",
            "description": "Ascensor sin nodo objetivo",
        },
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    fields = body["error"]["details"]["fields"]
    assert isinstance(fields, list)
    assert len(fields) >= 1
    assert {"loc", "msg", "type"}.issubset(fields[0].keys())

    # Unknown node target and unknown incident patch errors match Persona A behavior
    missing_node = client.post(
        "/api/v1/incidents",
        headers=DEMO_AUTH_HEADERS,
        json={
            "target_type": "node",
            "node_id": "n-inexistente",
            "edge_id": None,
            "conflict_type": "corridor_closed",
            "severity": "blocking",
            "description": "Nodo inexistente",
        },
    )
    assert missing_node.status_code == 400
    assert missing_node.json()["error"]["code"] == "VALIDATION_ERROR"

    missing_incident = client.patch(
        "/api/v1/incidents/inc-nope",
        headers=DEMO_AUTH_HEADERS,
        json={"status": "resolved"},
    )
    assert missing_incident.status_code == 404
    assert missing_incident.json()["error"]["code"] == "NOT_FOUND"


def test_load_campus_graph_accepts_extra_supabase_schema_columns() -> None:
    node_rows = [
        {
            "id": "n-1",
            "name": "Entrada",
            "building": "Edificio A",
            "building_id": "bld-a",
            "floor": 1,
            "node_type": "entrance",
            "x": 100,
            "y": 200,
            "z": 0,
            "is_destination": True,
            "landmark": "Acceso principal",
        },
        {
            "id": "n-2",
            "name": "Aula 101",
            "building": "Edificio A",
            "building_id": "bld-a",
            "floor": 1,
            "node_type": "room",
            "x": 180,
            "y": 200,
            "z": 0,
            "is_destination": True,
            "landmark": None,
        },
    ]
    edge_rows = [
        {
            "id": "e-1",
            "from_node_id": "n-1",
            "to_node_id": "n-2",
            "distance_m": 30,
            "estimated_time_s": 25,
            "base_weight": 1.0,
            "edge_type": "corridor",
            "is_accessible": True,
            "is_covered": True,
            "bidirectional": True,
        }
    ]
    incident_rows = [
        {
            "id": "inc-sb-1",
            "target_type": "node",
            "node_id": "n-2",
            "edge_id": None,
            "conflict_type": "corridor_closed",
            "severity": "warning",
            "status": "active",
            "description": "Obra temporal en pasillo",
            "reported_by": "00000000-0000-0000-0000-000000000001",
            "reported_at": "2026-11-21T10:15:00Z",
            "resolved_at": None,
        }
    ]

    def make_table(name: str) -> MagicMock:
        table = MagicMock()
        query = table.select.return_value
        if name == "nodes":
            query.execute.return_value = MagicMock(data=node_rows)
        elif name == "edges":
            query.execute.return_value = MagicMock(data=edge_rows)
        else:
            query.eq.return_value.execute.return_value = MagicMock(data=incident_rows)
        return table

    fake_client = MagicMock()
    fake_client.table.side_effect = make_table

    fake_db_pkg = types.ModuleType("app.db")
    fake_supabase_mod = types.ModuleType("app.db.supabase")
    fake_supabase_mod.get_supabase = lambda: fake_client  # type: ignore[attr-defined]
    fake_db_pkg.supabase = fake_supabase_mod  # type: ignore[attr-defined]

    with patch.dict(
        sys.modules,
        {"app.db": fake_db_pkg, "app.db.supabase": fake_supabase_mod},
    ):
        nodes, edges, incidents = load_campus_graph()

    assert [n.id for n in nodes] == ["n-1", "n-2"]
    assert nodes[1].landmark == ""
    assert [e.id for e in edges] == ["e-1"]
    assert [i.id for i in incidents] == ["inc-sb-1"]


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost:5173",
        "https://campusroute-frontend.vercel.app",
        "https://campusroute-frontend-hackathon-e4ab.vercel.app",
        "https://campusroute-frontend-git-preview-123.vercel.app",
    ],
)
def test_cors_preflight_allows_local_and_vercel_origins(origin: str) -> None:
    response = client.options(
        "/api/v1/routes/calculate",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == origin


def test_weather_coordinates_prefer_env_and_fallback_to_settings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("CAMPUS_LAT", raising=False)
    monkeypatch.delenv("CAMPUS_LON", raising=False)
    assert _get_coordinates() == (-33.0344, -71.5950)

    monkeypatch.setenv("CAMPUS_LAT", "-12.0464")
    monkeypatch.setenv("CAMPUS_LON", "-77.0428")
    assert _get_coordinates() == (-12.0464, -77.0428)


def test_casa_central_step1_ramp_and_same_floor_stairs_instructions() -> None:
    ramp_resp = client.post(
        "/api/v1/routes/calculate",
        json={
            "origin_node_id": "cc-acceso-espana",
            "destination_node_id": "cc-edificio-f",
            "reduced_mobility": True,
            "use_live_weather": False,
        },
    )
    assert ramp_resp.status_code == 200
    step1_ramp = ramp_resp.json()["steps"][0]["instruction"]
    assert "toma la rampa" in step1_ramp
    assert "Explanada Monumental Av. España" in step1_ramp

    stairs_resp = client.post(
        "/api/v1/routes/calculate",
        json={
            "origin_node_id": "cc-acceso-espana",
            "destination_node_id": "cc-edificio-a-p1",
            "reduced_mobility": False,
            "use_live_weather": False,
            "simulated_blocked_node_ids": ["cc-explanada-espana"],
        },
    )
    assert stairs_resp.status_code == 200
    step1_stairs = stairs_resp.json()["steps"][0]["instruction"]
    assert step1_stairs.startswith("Sube")
    assert "hasta Edificio A — Hall Central (Piso 1)." in step1_stairs


def test_local_store_caps_incidents_and_evicts_resolved_first() -> None:
    first_created = create_local_incident(
        CreateIncidentRequest(
            target_type="node",
            node_id="cc-edificio-f",
            conflict_type="corridor_closed",
            severity="warning",
            description="Incidencia resuelta antigua",
        )
    )
    update_local_incident(first_created.id, UpdateIncidentRequest(status="resolved"))

    for i in range(MAX_LOCAL_INCIDENTS + 5):
        create_local_incident(
            CreateIncidentRequest(
                target_type="node",
                node_id="cc-edificio-m",
                conflict_type="crowd_congestion",
                severity="warning",
                description=f"Congestion #{i}",
            )
        )

    all_items = list_local_incidents(status="all").items
    assert len(all_items) == MAX_LOCAL_INCIDENTS
    assert all(item.id != first_created.id for item in all_items)


def test_weather_lock_coalesces_concurrent_fetches_and_short_fallback_ttl() -> None:
    clear_weather_cache()

    async def fake_get(*_args: object, **_kwargs: object) -> MagicMock:
        await asyncio.sleep(0.02)
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        resp.json.return_value = {
            "current": {"temperature_2m": 18.0, "precipitation": 0.0, "weather_code": 0}
        }
        return resp

    mock_client = AsyncMock()
    mock_client.get.side_effect = fake_get
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    async def run_burst() -> list[object]:
        return await asyncio.gather(*(get_campus_weather() for _ in range(5)))

    with patch("app.services.weather_service.httpx.AsyncClient", return_value=mock_client):
        results = asyncio.run(run_burst())

    assert len(results) == 5
    assert mock_client.get.await_count == 1

    # Fallback cache expires after 15s (not 300s)
    clear_weather_cache()
    failing_client = AsyncMock()
    failing_client.get.side_effect = RuntimeError("timeout")
    failing_client.__aenter__.return_value = failing_client
    failing_client.__aexit__.return_value = None

    now = [100.0]
    with (
        patch("app.services.weather_service.time.monotonic", side_effect=lambda: now[0]),
        patch("app.services.weather_service.httpx.AsyncClient", return_value=failing_client),
    ):
        first = asyncio.run(get_campus_weather())
        assert first.fallback_used is True
        now[0] = 110.0  # within 15s fallback TTL -> cached
        asyncio.run(get_campus_weather())
        assert failing_client.get.await_count == 1
        now[0] = 116.0  # past 15s fallback TTL -> retries
        asyncio.run(get_campus_weather())
        assert failing_client.get.await_count == 2
        assert weather_service.FALLBACK_CACHE_TTL_SECONDS == 15.0


def test_settings_placeholder_detection_uses_prefix_only() -> None:
    assert (
        Settings(
            supabase_url="https://YOUR_PROJECT_REF.supabase.co",
            supabase_service_role_key="real-key",
        ).is_supabase_configured
        is False
    )
    assert (
        Settings(
            supabase_url="https://abc.supabase.co",
            supabase_service_role_key="YOUR_SERVICE_ROLE_KEY",
        ).is_supabase_configured
        is False
    )
    assert (
        Settings(
            supabase_url="https://abc.supabase.co",
            supabase_service_role_key="eyJhbGci_your_valid_token_payload",
        ).is_supabase_configured
        is True
    )
    defaults = Settings()
    assert defaults.enable_floor_stairs is True
    assert defaults.enable_elevation_stairs is True
    assert defaults.stair_step_penalty_seconds == 0.7
    assert defaults.elevation_slope_penalty_factor == 1.5


def test_piso2_interfloor_stairs_vs_accessible_routing() -> None:
    # Normal user takes direct inter-floor stairs cc-e16 from Edificio A P1 to Aula A-201 P2
    stairs_resp = client.post(
        "/api/v1/routes/calculate",
        json={
            "origin_node_id": "cc-edificio-a-p1",
            "destination_node_id": "cc-aula-a201",
            "reduced_mobility": False,
            "use_live_weather": False,
            "algorithm": "astar",
        },
    )
    assert stairs_resp.status_code == 200
    stairs_body = stairs_resp.json()
    assert stairs_body["path_edge_ids"] == ["cc-e16"]
    assert stairs_body["metrics"]["uses_stairs"] is True
    assert stairs_body["accessibility_verified"] is False

    # Reduced mobility avoids cc-e16 stairs and broken cc-ascensor-a-p1 (cc-inc-1),
    # routing via Elevator B (cc-e8), Floor 2 bridge (cc-e9), and corridor cc-e14.
    accessible_resp = client.post(
        "/api/v1/routes/calculate",
        json={
            "origin_node_id": "cc-edificio-a-p1",
            "destination_node_id": "cc-aula-a201",
            "reduced_mobility": True,
            "use_live_weather": False,
            "algorithm": "astar",
        },
    )
    assert accessible_resp.status_code == 200
    acc_body = accessible_resp.json()
    assert acc_body["accessibility_verified"] is True
    assert acc_body["metrics"]["uses_stairs"] is False
    assert acc_body["metrics"]["uses_elevator"] is True
    assert "cc-e16" not in acc_body["path_edge_ids"]
    assert {"cc-e8", "cc-e9", "cc-e14"}.issubset(set(acc_body["path_edge_ids"]))
    assert any(c["incident_id"] == "cc-inc-1" for c in acc_body["avoided_conflicts"])


def test_blocking_edge_cc_e6_reroutes_via_paved_plaza_cc_patio_central() -> None:
    # Baseline direct route between Edificio A P1 and Edificio B P1 uses cc-e6 (40m)
    baseline_resp = client.post(
        "/api/v1/routes/calculate",
        json={
            "origin_node_id": "cc-edificio-a-p1",
            "destination_node_id": "cc-edificio-b-p1",
            "reduced_mobility": True,
            "use_live_weather": False,
        },
    )
    assert baseline_resp.status_code == 200
    assert baseline_resp.json()["path_edge_ids"] == ["cc-e6"]

    # Report a blocking incident on edge cc-e6
    create_resp = client.post(
        "/api/v1/incidents",
        headers=DEMO_AUTH_HEADERS,
        json={
            "target_type": "edge",
            "node_id": None,
            "edge_id": "cc-e6",
            "conflict_type": "corridor_closed",
            "severity": "blocking",
            "description": "Corredor directo Edificio A-B cerrado por obras",
        },
    )
    assert create_resp.status_code == 201
    inc_id = create_resp.json()["id"]

    # Route dynamically detours through paved plaza cc-patio-central (cc-e24 + cc-e25)
    detour_resp = client.post(
        "/api/v1/routes/calculate",
        json={
            "origin_node_id": "cc-edificio-a-p1",
            "destination_node_id": "cc-edificio-b-p1",
            "reduced_mobility": True,
            "use_live_weather": False,
        },
    )
    assert detour_resp.status_code == 200
    detour = detour_resp.json()
    assert detour["path_node_ids"] == [
        "cc-edificio-a-p1",
        "cc-patio-central",
        "cc-edificio-b-p1",
    ]
    assert detour["path_edge_ids"] == ["cc-e24", "cc-e25"]
    assert any(c["incident_id"] == inc_id for c in detour["avoided_conflicts"])
