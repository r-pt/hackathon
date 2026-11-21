"""Comprehensive test suite for Persona B (A*/Dijkstra routing, weather, and API contract)."""

from __future__ import annotations

import asyncio
import sys
import types
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.core.errors import APIError
from app.main import app
from app.routers.routes import load_campus_graph
from app.schemas.routes import CalculateRouteRequest, GraphEdge, GraphIncident, GraphNode
from app.services.directions_builder import build_steps
from app.services.graph_fixture import get_casa_central_graph, get_sample_graph
from app.services.routing_engine import calculate_route_plan
from app.services.weather_service import (
    clear_weather_cache,
    get_campus_weather,
    map_wmo_code_to_condition,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# 1. Core routing engine tests (pure, DB-independent)
# ---------------------------------------------------------------------------


def test_normal_route_astar_and_dijkstra_match_optimal_weight() -> None:
    nodes, edges, incidents = get_sample_graph()

    req_astar = CalculateRouteRequest(
        origin_node_id="n-entrada-sur",
        destination_node_id="n-aula-204",
        reduced_mobility=False,
        algorithm="astar",
    )
    req_dijkstra = req_astar.model_copy(update={"algorithm": "dijkstra"})

    res_astar = calculate_route_plan(
        request=req_astar, nodes=nodes, edges=edges, incidents=incidents
    )
    res_dijkstra = calculate_route_plan(
        request=req_dijkstra, nodes=nodes, edges=edges, incidents=incidents
    )

    # Normal user takes Patio Central -> Hall A -> Stairs A -> Aula 204
    # Distance: 45 + 35 + 20 + 15 + 25 = 140m
    # Weight:   45 + 35 + 20 + 21 + 25 = 146.0
    assert res_astar.path_node_ids == [
        "n-entrada-sur",
        "n-patio-central",
        "n-hall-a-p1",
        "n-escalera-a-p1",
        "n-escalera-a-p2",
        "n-aula-204",
    ]
    assert res_astar.metrics.total_distance_m == 140
    assert res_astar.metrics.uses_stairs is True
    assert res_astar.metrics.uses_elevator is False
    assert res_astar.accessibility_verified is False
    assert res_astar.graph_stats.total_weight == pytest.approx(146.0)
    assert res_dijkstra.graph_stats.total_weight == pytest.approx(146.0)
    assert res_astar.graph_stats.algorithm_used == "astar"
    assert res_dijkstra.graph_stats.algorithm_used == "dijkstra"
    assert res_astar.graph_stats.nodes_explored <= res_dijkstra.graph_stats.nodes_explored


def test_reduced_mobility_avoids_broken_elevator_a_and_matches_openapi_example() -> None:
    nodes, edges, incidents = get_sample_graph()

    req = CalculateRouteRequest(
        origin_node_id="n-entrada-sur",
        destination_node_id="n-aula-204",
        reduced_mobility=True,
        algorithm="astar",
    )

    res = calculate_route_plan(
        request=req, nodes=nodes, edges=edges, incidents=incidents
    )

    assert res.path_node_ids == [
        "n-entrada-sur",
        "n-rampa-sur",
        "n-biblioteca",
        "n-ascensor-b-p1",
        "n-ascensor-b-p2",
        "n-pasillo-p2",
        "n-aula-204",
    ]
    assert res.path_edge_ids == ["e-2", "e-7", "e-8", "e-11", "e-14", "e-15"]
    assert res.metrics.total_distance_m == 190
    assert res.metrics.estimated_time_min == pytest.approx(3.6)
    assert res.metrics.floors_traversed == [1, 2]
    assert res.metrics.uses_elevator is True
    assert res.metrics.uses_ramp is True
    assert res.metrics.uses_stairs is False
    assert res.accessibility_verified is True
    assert res.graph_stats.total_weight == pytest.approx(202.0)
    assert len(res.steps) == 6
    assert [s.order for s in res.steps] == [1, 2, 3, 4, 5, 6]

    # inc-101 blocked n-ascensor-a-p1, which was on the ideal accessible path
    assert len(res.avoided_conflicts) == 1
    assert res.avoided_conflicts[0].incident_id == "inc-101"
    assert res.avoided_conflicts[0].conflict_type == "elevator_broken"
    assert "Ascensor Edificio A" in res.avoided_conflicts[0].target_name


def test_reduced_mobility_total_block_raises_422_no_accessible_route() -> None:
    nodes, edges, incidents = get_sample_graph()
    incidents.extend(
        [
            GraphIncident(
                id="inc-102",
                target_type="node",
                node_id="n-ascensor-b-p1",
                edge_id=None,
                conflict_type="elevator_broken",
                severity="blocking",
                status="active",
                description="Ascensor Edificio B fuera de servicio",
            ),
            GraphIncident(
                id="inc-999",
                target_type="node",
                node_id="n-cafeteria",
                edge_id=None,
                conflict_type="corridor_closed",
                severity="blocking",
                status="active",
                description="Cafetería cerrada (no afecta ruta a Piso 2)",
            ),
        ]
    )

    req = CalculateRouteRequest(
        origin_node_id="n-entrada-sur",
        destination_node_id="n-aula-204",
        reduced_mobility=True,
    )

    with pytest.raises(APIError) as exc_info:
        calculate_route_plan(request=req, nodes=nodes, edges=edges, incidents=incidents)

    err = exc_info.value
    assert err.status_code == 422
    assert err.code == "NO_ACCESSIBLE_ROUTE"
    assert set(err.details["blocking_incident_ids"]) == {"inc-101", "inc-102"}

    # Route blocked purely by simulation should not blame unrelated inc-101
    sim_only_req = CalculateRouteRequest(
        origin_node_id="n-hall-a-p1",
        destination_node_id="n-cafeteria",
        reduced_mobility=False,
        simulated_blocked_edge_ids=["e-4"],
    )
    with pytest.raises(APIError) as sim_exc:
        calculate_route_plan(
            request=sim_only_req, nodes=nodes, edges=edges, incidents=incidents
        )
    assert sim_exc.value.details["blocking_incident_ids"] == []


def test_disconnected_graph_without_reduced_mobility_raises_422_route_not_found() -> None:
    nodes, edges, incidents = get_sample_graph()

    req = CalculateRouteRequest(
        origin_node_id="n-entrada-sur",
        destination_node_id="n-aula-204",
        reduced_mobility=False,
        simulated_blocked_node_ids=["n-escalera-a-p1", "n-ascensor-b-p1"],
    )

    with pytest.raises(APIError) as exc_info:
        calculate_route_plan(request=req, nodes=nodes, edges=edges, incidents=incidents)

    assert exc_info.value.status_code == 422
    assert exc_info.value.code == "ROUTE_NOT_FOUND"


def test_same_origin_and_destination_raises_400_validation_error() -> None:
    nodes, edges, incidents = get_sample_graph()
    req = CalculateRouteRequest(
        origin_node_id="n-entrada-sur",
        destination_node_id="n-entrada-sur",
        reduced_mobility=False,
    )

    with pytest.raises(APIError) as exc_info:
        calculate_route_plan(request=req, nodes=nodes, edges=edges, incidents=incidents)

    assert exc_info.value.status_code == 400
    assert exc_info.value.code == "VALIDATION_ERROR"


def test_nonexistent_node_raises_404_not_found() -> None:
    nodes, edges, incidents = get_sample_graph()
    req = CalculateRouteRequest(
        origin_node_id="n-no-existe",
        destination_node_id="n-aula-204",
        reduced_mobility=False,
    )

    with pytest.raises(APIError) as exc_info:
        calculate_route_plan(request=req, nodes=nodes, edges=edges, incidents=incidents)

    assert exc_info.value.status_code == 404
    assert exc_info.value.code == "NOT_FOUND"


def test_rain_avoidance_diverts_normal_user_to_covered_route() -> None:
    nodes, edges, incidents = get_sample_graph()

    req = CalculateRouteRequest(
        origin_node_id="n-entrada-sur",
        destination_node_id="n-aula-204",
        reduced_mobility=False,
        simulate_rain=True,
        algorithm="astar",
    )

    # With rain penalty x2.5 on outdoor edges (e-1, e-3):
    # Outdoor route via Patio Central = 45*2.5 + 35*2.5 + 20 + 21 + 25 = 266.0
    # Covered route via Rampa Sur & Ascensor B = 69 + 35 + 40 + 13 + 25 + 20 = 202.0
    res = calculate_route_plan(
        request=req,
        nodes=nodes,
        edges=edges,
        incidents=incidents,
        weather_condition="rain",
        rain_avoidance_active=True,
    )

    assert res.weather_applied.condition == "rain"
    assert res.weather_applied.rain_avoidance_active is True
    assert "n-rampa-sur" in res.path_node_ids
    assert "n-patio-central" not in res.path_node_ids
    assert res.graph_stats.total_weight == pytest.approx(202.0)


def test_warning_incident_applies_1_8x_weight_penalty() -> None:
    nodes, edges, _ = get_sample_graph()
    warning_incidents = [
        GraphIncident(
            id="inc-warn-1",
            target_type="edge",
            node_id=None,
            edge_id="e-4",
            conflict_type="crowd_congestion",
            severity="warning",
            status="active",
            description="Alta congestión frente a cafetería",
        )
    ]

    req = CalculateRouteRequest(
        origin_node_id="n-hall-a-p1",
        destination_node_id="n-cafeteria",
        reduced_mobility=False,
    )

    res = calculate_route_plan(
        request=req, nodes=nodes, edges=edges, incidents=warning_incidents
    )

    # e-4 has distance_m=30, base_weight=1.0 -> with warning x1.8 = 54.0
    assert res.graph_stats.total_weight == pytest.approx(54.0)
    assert res.steps[0].edge_weight == pytest.approx(54.0)


def test_casa_central_utfsm_preset_avoids_stairs_and_broken_elevator() -> None:
    nodes, edges, incidents = get_casa_central_graph()

    req = CalculateRouteRequest(
        origin_node_id="cc-acceso-espana",
        destination_node_id="cc-ascensor-a-p2",
        reduced_mobility=True,
        algorithm="astar",
    )

    res = calculate_route_plan(
        request=req, nodes=nodes, edges=edges, incidents=incidents
    )

    assert res.accessibility_verified is True
    assert res.metrics.uses_stairs is False
    assert res.metrics.uses_ramp is True
    assert res.metrics.uses_elevator is True
    assert "cc-ascensor-b-p1" in res.path_node_ids
    assert any(c.incident_id == "cc-inc-1" for c in res.avoided_conflicts)


def test_simulated_block_preserves_avoided_conflicts_for_normal_user() -> None:
    nodes, edges, incidents = get_sample_graph()
    req = CalculateRouteRequest(
        origin_node_id="n-entrada-sur",
        destination_node_id="n-aula-204",
        reduced_mobility=False,
        simulated_blocked_node_ids=["n-escalera-a-p1"],
    )

    res = calculate_route_plan(request=req, nodes=nodes, edges=edges, incidents=incidents)

    assert any(c.incident_id == "inc-101" for c in res.avoided_conflicts)


def test_reverse_ramp_instruction_names_ramp_and_destination() -> None:
    nodes, edges, incidents = get_sample_graph()
    req = CalculateRouteRequest(
        origin_node_id="n-aula-204",
        destination_node_id="n-entrada-sur",
        reduced_mobility=True,
    )

    res = calculate_route_plan(request=req, nodes=nodes, edges=edges, incidents=incidents)
    ramp_steps = [step for step in res.steps if step.edge_type == "ramp"]

    assert len(ramp_steps) == 1
    assert "Rampa Accesible Sur" in ramp_steps[0].instruction
    assert "Entrada Principal Sur" in ramp_steps[0].instruction


def test_downward_same_floor_stairs_instruction_says_baja() -> None:
    nodes, edges, incidents = get_casa_central_graph()
    req = CalculateRouteRequest(
        origin_node_id="cc-edificio-a-p1",
        destination_node_id="cc-acceso-espana",
        reduced_mobility=False,
    )

    res = calculate_route_plan(request=req, nodes=nodes, edges=edges, incidents=incidents)
    stairs_steps = [step for step in res.steps if step.edge_type == "stairs"]

    assert len(stairs_steps) == 1
    assert stairs_steps[0].instruction.startswith("Baja")


def test_intermediate_uncovered_corridor_does_not_say_pasillo_cubierto() -> None:
    nodes = [
        GraphNode(
            id=f"n-{i}",
            name=f"Punto {i}",
            building="Edificio A",
            floor=1,
            node_type="corridor",
            x=i * 10,
            y=0,
            z=0,
        )
        for i in range(4)
    ]
    edges = [
        GraphEdge(
            id="e-1",
            from_node_id="n-0",
            to_node_id="n-1",
            distance_m=10,
            base_weight=1.0,
            edge_type="corridor",
            is_accessible=True,
            is_covered=True,
        ),
        GraphEdge(
            id="e-2",
            from_node_id="n-1",
            to_node_id="n-2",
            distance_m=15,
            base_weight=1.0,
            edge_type="corridor",
            is_accessible=True,
            is_covered=False,
        ),
        GraphEdge(
            id="e-3",
            from_node_id="n-2",
            to_node_id="n-3",
            distance_m=10,
            base_weight=1.0,
            edge_type="corridor",
            is_accessible=True,
            is_covered=True,
        ),
    ]

    steps = build_steps(
        path_node_ids=["n-0", "n-1", "n-2", "n-3"],
        traversed_edges=edges,
        edge_weights=[10.0, 15.0, 10.0],
        nodes_by_id={node.id: node for node in nodes},
    )

    assert "pasillo cubierto" not in steps[1].instruction
    assert "pasillo" in steps[1].instruction


def test_load_campus_graph_uses_supabase_and_coerces_none_landmark() -> None:
    node_rows = [
        {
            "id": "sb-1",
            "name": "Acceso Supabase",
            "building": "Edificio SB",
            "floor": 1,
            "node_type": "entrance",
            "x": 10,
            "y": 20,
            "z": 0,
            "is_destination": True,
            "landmark": None,
        },
        {
            "id": "sb-2",
            "name": "Aula Supabase",
            "building": "Edificio SB",
            "floor": 1,
            "node_type": "room",
            "x": 40,
            "y": 20,
            "z": 0,
            "is_destination": True,
            "landmark": "Puerta azul",
        },
    ]
    edge_rows = [
        {
            "id": "sb-e1",
            "from_node_id": "sb-1",
            "to_node_id": "sb-2",
            "distance_m": 25,
            "base_weight": 1.0,
            "edge_type": "corridor",
            "is_accessible": True,
            "is_covered": True,
            "bidirectional": True,
        }
    ]
    incident_rows = [
        {
            "id": "sb-inc-1",
            "target_type": "edge",
            "node_id": None,
            "edge_id": "sb-e1",
            "conflict_type": "crowd_congestion",
            "severity": "warning",
            "status": "active",
            "description": "Alta afluencia",
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

    assert [n.id for n in nodes] == ["sb-1", "sb-2"]
    assert nodes[0].landmark == ""
    assert nodes[1].landmark == "Puerta azul"
    assert [e.id for e in edges] == ["sb-e1"]
    assert [i.id for i in incidents] == ["sb-inc-1"]


# ---------------------------------------------------------------------------
# 2. Weather service tests (live parsing, 5-min cache, silent fallback)
# ---------------------------------------------------------------------------


def test_wmo_code_mapping() -> None:
    assert map_wmo_code_to_condition(0) == "clear"
    assert map_wmo_code_to_condition(3) == "cloudy"
    assert map_wmo_code_to_condition(61) == "rain"
    assert map_wmo_code_to_condition(95) == "storm"
    assert map_wmo_code_to_condition(None) == "unknown"


def test_weather_service_live_and_cache() -> None:
    clear_weather_cache()

    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "current": {
            "temperature_2m": 16.4,
            "precipitation": 2.3,
            "weather_code": 61,
        }
    }

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    with patch("app.services.weather_service.httpx.AsyncClient", return_value=mock_client):
        first = asyncio.run(get_campus_weather())
        second = asyncio.run(get_campus_weather())

    assert first.temperature_c == 16.4
    assert first.precipitation_mm == 2.3
    assert first.condition == "rain"
    assert first.rain_alert is True
    assert first.fallback_used is False
    assert second == first
    assert mock_client.get.await_count == 1  # Served from 5-min cache on 2nd call


def test_weather_service_silent_fallback_on_error() -> None:
    clear_weather_cache()

    mock_client = AsyncMock()
    mock_client.get.side_effect = RuntimeError("Network timeout")
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    with patch("app.services.weather_service.httpx.AsyncClient", return_value=mock_client):
        weather = asyncio.run(get_campus_weather())

    assert weather.fallback_used is True
    assert weather.condition == "unknown"
    assert weather.rain_alert is False
    assert weather.source == "open-meteo"


# ---------------------------------------------------------------------------
# 3. FastAPI HTTP endpoint contract tests
# ---------------------------------------------------------------------------


def test_http_post_routes_calculate_success() -> None:
    clear_weather_cache()
    with patch("app.routers.routes.load_campus_graph", get_sample_graph):
        response = client.post(
            "/api/v1/routes/calculate",
            json={
                "origin_node_id": "n-entrada-sur",
                "destination_node_id": "n-aula-204",
                "reduced_mobility": True,
                "use_live_weather": False,
                "algorithm": "astar",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["accessibility_verified"] is True
    assert body["metrics"]["total_distance_m"] == 190
    assert body["graph_stats"]["total_weight"] == 202.0
    assert body["avoided_conflicts"][0]["incident_id"] == "inc-101"


def test_http_post_routes_calculate_400_and_422_error_shape() -> None:
    with patch("app.routers.routes.load_campus_graph", get_sample_graph):
        resp_400 = client.post(
            "/api/v1/routes/calculate",
            json={
                "origin_node_id": "n-entrada-sur",
                "destination_node_id": "n-entrada-sur",
                "reduced_mobility": False,
                "use_live_weather": False,
            },
        )
        resp_422 = client.post(
            "/api/v1/routes/calculate",
            json={
                "origin_node_id": "n-entrada-sur",
                "destination_node_id": "n-aula-204",
                "reduced_mobility": True,
                "use_live_weather": False,
                "simulated_blocked_node_ids": ["n-ascensor-b-p1"],
            },
        )
    assert resp_400.status_code == 400
    assert resp_400.json()["error"]["code"] == "VALIDATION_ERROR"
    assert resp_422.status_code == 422
    assert resp_422.json()["error"]["code"] == "NO_ACCESSIBLE_ROUTE"


def test_http_post_routes_calculate_simulate_rain_skips_live_weather() -> None:
    clear_weather_cache()
    mock_weather = AsyncMock()

    with (
        patch("app.routers.routes.load_campus_graph", get_sample_graph),
        patch("app.routers.routes.get_campus_weather", mock_weather),
    ):
        response = client.post(
            "/api/v1/routes/calculate",
            json={
                "origin_node_id": "n-entrada-sur",
                "destination_node_id": "n-aula-204",
                "reduced_mobility": False,
                "use_live_weather": True,
                "simulate_rain": True,
            },
        )

    assert response.status_code == 200
    mock_weather.assert_not_called()
    body = response.json()
    assert body["weather_applied"]["condition"] == "rain"
    assert body["weather_applied"]["rain_avoidance_active"] is True


def test_http_get_external_weather_returns_contract_shape() -> None:
    clear_weather_cache()
    mock_client = AsyncMock()
    mock_client.get.side_effect = RuntimeError("Offline test")
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    with patch("app.services.weather_service.httpx.AsyncClient", return_value=mock_client):
        response = client.get("/api/v1/external/weather")

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {
        "temperature_c",
        "precipitation_mm",
        "condition",
        "rain_alert",
        "source",
        "fallback_used",
        "fetched_at",
    }
    assert body["fallback_used"] is True
