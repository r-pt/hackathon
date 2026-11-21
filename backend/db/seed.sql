-- =============================================================================
-- CampusRoute — Datos Semilla UTFSM Casa Central (PostgreSQL / Supabase)
-- =============================================================================
-- Idempotente: utiliza INSERT ... ON CONFLICT (id) DO UPDATE en todas las tablas.
-- Sincronizado 1:1 con backend/app/db/local_store.py y graph_fixture.py:
-- 6 edificios (bld-a, bld-b, bld-c, bld-f, bld-m, bld-p), 12 nodos (cc-*),
-- 13 aristas (cc-e1..cc-e13) e incidencia activa inicial cc-inc-1.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Edificios (6 — UTFSM Casa Central)
-- -----------------------------------------------------------------------------
INSERT INTO public.buildings (id, name, x, y, width, height, floors, color)
VALUES
    ('bld-a', 'Edificio A (Ingeniería)',  545, 380, 120, 110, 2, '#2563EB'),
    ('bld-b', 'Edificio B (Biblioteca)',  595, 295, 140,  95, 2, '#059669'),
    ('bld-c', 'Edificio C (Placeres)',    535, 195, 105,  85, 1, '#4F46E5'),
    ('bld-f', 'Edificio F (Sur-Oriente)', 735, 475, 110,  90, 1, '#7C3AED'),
    ('bld-m', 'Edificio M (Informática)', 225, 270, 110,  90, 1, '#D97706'),
    ('bld-p', 'Edificio P (Federación)',  535, 100, 110,  85, 1, '#0891B2')
ON CONFLICT (id) DO UPDATE SET
    name   = EXCLUDED.name,
    x      = EXCLUDED.x,
    y      = EXCLUDED.y,
    width  = EXCLUDED.width,
    height = EXCLUDED.height,
    floors = EXCLUDED.floors,
    color  = EXCLUDED.color;

-- -----------------------------------------------------------------------------
-- 2. Nodos (12 — UTFSM Casa Central, cc-*)
-- -----------------------------------------------------------------------------
INSERT INTO public.nodes (
    id, name, building, building_id, floor, node_type, x, y, z, is_destination, landmark
)
VALUES
    ('cc-acceso-espana', 'Acceso Principal Av. España',               'Exterior',   NULL,    1, 'entrance', 620, 590, 0, true,  'Escalinata y acceso sur desde Av. España'),
    ('cc-edificio-a-p1', 'Edificio A — Hall Central (Piso 1)',        'Edificio A', 'bld-a', 1, 'corridor', 615, 450, 4, true,  'Patio central y accesos a aulas A'),
    ('cc-ascensor-a-p1', 'Ascensor Edificio A (Piso 1)',              'Edificio A', 'bld-a', 1, 'elevator', 590, 410, 4, false, 'Costado oeste del hall Edificio A'),
    ('cc-ascensor-a-p2', 'Ascensor Edificio A (Piso 2)',              'Edificio A', 'bld-a', 2, 'elevator', 590, 410, 8, false, 'Pasillo superior Edificio A'),
    ('cc-edificio-b-p1', 'Edificio B — Patio Interior (Piso 1)',      'Edificio B', 'bld-b', 1, 'corridor', 635, 335, 4, true,  'Claustro central del Edificio B'),
    ('cc-ascensor-b-p1', 'Ascensor Edificio B (Piso 1)',              'Edificio B', 'bld-b', 1, 'elevator', 695, 335, 4, false, 'Ala oriente Edificio B'),
    ('cc-ascensor-b-p2', 'Ascensor Edificio B (Piso 2)',              'Edificio B', 'bld-b', 2, 'elevator', 695, 335, 8, false, 'Conexión superior Edificio B hacia A y C'),
    ('cc-edificio-c-p1', 'Edificio C — Acceso Norte (Av. Placeres)',  'Edificio C', 'bld-c', 1, 'entrance', 575, 235, 4, true,  'Frente a Avenida Placeres'),
    ('cc-rampa-b-c',     'Rampa Accesible B–C',                       'Exterior',   NULL,    1, 'ramp',     610, 285, 4, false, 'Rampa techada entre Edificio B y Edificio C'),
    ('cc-edificio-f',    'Edificio F (Piso 1)',                       'Edificio F', 'bld-f', 1, 'room',     790, 520, 4, true,  'Jardines sector sur-oriente'),
    ('cc-edificio-m',    'Edificio M (Informática)',                  'Edificio M', 'bld-m', 1, 'room',     280, 315, 4, true,  'Costado poniente junto a la cancha'),
    ('cc-edificio-p',    'Edificio P (Federación)',                   'Edificio P', 'bld-p', 1, 'room',     590, 145, 4, true,  'Cruzando Av. Placeres por San Guillermo')
ON CONFLICT (id) DO UPDATE SET
    name           = EXCLUDED.name,
    building       = EXCLUDED.building,
    building_id    = EXCLUDED.building_id,
    floor          = EXCLUDED.floor,
    node_type      = EXCLUDED.node_type,
    x              = EXCLUDED.x,
    y              = EXCLUDED.y,
    z              = EXCLUDED.z,
    is_destination = EXCLUDED.is_destination,
    landmark       = EXCLUDED.landmark;

-- -----------------------------------------------------------------------------
-- 3. Aristas (13 — cc-e1..cc-e13)
-- -----------------------------------------------------------------------------
INSERT INTO public.edges (
    id, from_node_id, to_node_id, distance_m, estimated_time_s, base_weight,
    edge_type, is_accessible, is_covered, bidirectional
)
VALUES
    ('cc-e1',  'cc-acceso-espana', 'cc-edificio-a-p1',  55, 57, 1.4,  'stairs',   false, false, true),
    ('cc-e2',  'cc-acceso-espana', 'cc-edificio-f',     95, 81, 1.15, 'ramp',     true,  false, true),
    ('cc-e3',  'cc-edificio-f',    'cc-edificio-a-p1',  65, 48, 1.0,  'corridor', true,  true,  true),
    ('cc-e4',  'cc-edificio-a-p1', 'cc-ascensor-a-p1',  20, 15, 1.0,  'corridor', true,  true,  true),
    ('cc-e5',  'cc-ascensor-a-p1', 'cc-ascensor-a-p2',  10, 35, 1.3,  'elevator', true,  true,  true),
    ('cc-e6',  'cc-edificio-a-p1', 'cc-edificio-b-p1',  40, 30, 1.0,  'corridor', true,  true,  true),
    ('cc-e7',  'cc-edificio-b-p1', 'cc-ascensor-b-p1',  25, 19, 1.0,  'corridor', true,  true,  true),
    ('cc-e8',  'cc-ascensor-b-p1', 'cc-ascensor-b-p2',  10, 35, 1.3,  'elevator', true,  true,  true),
    ('cc-e9',  'cc-ascensor-a-p2', 'cc-ascensor-b-p2',  45, 34, 1.0,  'corridor', true,  true,  true),
    ('cc-e10', 'cc-edificio-b-p1', 'cc-rampa-b-c',      30, 26, 1.15, 'ramp',     true,  true,  true),
    ('cc-e11', 'cc-rampa-b-c',     'cc-edificio-c-p1',  30, 23, 1.0,  'corridor', true,  true,  true),
    ('cc-e12', 'cc-edificio-c-p1', 'cc-edificio-p',     70, 52, 1.0,  'outdoor',  true,  false, true),
    ('cc-e13', 'cc-edificio-c-p1', 'cc-edificio-m',    130, 96, 1.0,  'outdoor',  true,  false, true)
ON CONFLICT (id) DO UPDATE SET
    from_node_id     = EXCLUDED.from_node_id,
    to_node_id       = EXCLUDED.to_node_id,
    distance_m       = EXCLUDED.distance_m,
    estimated_time_s = EXCLUDED.estimated_time_s,
    base_weight      = EXCLUDED.base_weight,
    edge_type        = EXCLUDED.edge_type,
    is_accessible    = EXCLUDED.is_accessible,
    is_covered       = EXCLUDED.is_covered,
    bidirectional    = EXCLUDED.bidirectional;

-- -----------------------------------------------------------------------------
-- 4. Incidencia inicial activa (cc-inc-1)
-- -----------------------------------------------------------------------------
INSERT INTO public.incidents (
    id, target_type, node_id, edge_id, conflict_type, severity, status,
    description, reported_by, reported_at, resolved_at
)
VALUES (
    'cc-inc-1',
    'node',
    'cc-ascensor-a-p1',
    NULL,
    'elevator_broken',
    'blocking',
    'active',
    'Ascensor Edificio A en mantención',
    NULL,
    '2026-11-21T10:15:00Z',
    NULL
)
ON CONFLICT (id) DO UPDATE SET
    target_type   = EXCLUDED.target_type,
    node_id       = EXCLUDED.node_id,
    edge_id       = EXCLUDED.edge_id,
    conflict_type = EXCLUDED.conflict_type,
    severity      = EXCLUDED.severity,
    status        = EXCLUDED.status,
    description   = EXCLUDED.description,
    reported_by   = EXCLUDED.reported_by,
    reported_at   = EXCLUDED.reported_at,
    resolved_at   = EXCLUDED.resolved_at;

COMMIT;
