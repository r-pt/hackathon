-- =============================================================================
-- CampusRoute — Datos Semilla UTFSM Casa Central (PostgreSQL / Supabase)
-- =============================================================================
-- Idempotente: utiliza INSERT ... ON CONFLICT (id) DO UPDATE en todas las tablas.
-- Sincronizado 1:1 con backend/app/db/local_store.py y graph_fixture.py:
-- 6 edificios (bld-a, bld-b, bld-c, bld-f, bld-m, bld-p), 16 nodos (cc-*),
-- 20 aristas (cc-e1..cc-e20) e incidencia activa inicial cc-inc-1.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Edificios (6 — UTFSM Casa Central, 1600x1050)
-- -----------------------------------------------------------------------------
INSERT INTO public.buildings (id, name, x, y, width, height, floors, color)
VALUES
    ('bld-p', 'Edificio P (Federación)',   700,  60, 170, 100, 1, '#0891B2'),
    ('bld-c', 'Edificio C (Placeres)',     690, 320, 180, 105, 1, '#4F46E5'),
    ('bld-m', 'Edificio M (Informática)',  140, 420, 180, 115, 1, '#D97706'),
    ('bld-b', 'Edificio B (Biblioteca)',   980, 520, 210, 120, 2, '#059669'),
    ('bld-a', 'Edificio A (Ingeniería)',   520, 650, 210, 125, 2, '#2563EB'),
    ('bld-f', 'Edificio F (Sur-Oriente)', 1180, 790, 190, 115, 1, '#7C3AED')
ON CONFLICT (id) DO UPDATE SET
    name   = EXCLUDED.name,
    x      = EXCLUDED.x,
    y      = EXCLUDED.y,
    width  = EXCLUDED.width,
    height = EXCLUDED.height,
    floors = EXCLUDED.floors,
    color  = EXCLUDED.color;

-- -----------------------------------------------------------------------------
-- 2. Nodos (16 — UTFSM Casa Central, cc-*)
-- -----------------------------------------------------------------------------
INSERT INTO public.nodes (
    id, name, building, building_id, floor, node_type, x, y, z, is_destination, landmark
)
VALUES
    ('cc-acceso-espana',   'Acceso Principal Av. España',                    'Exterior',   NULL,    1, 'entrance',  780, 955, 0, true,  'Escalinata y acceso sur desde Av. España'),
    ('cc-edificio-a-p1',   'Edificio A — Hall Central (Piso 1)',             'Edificio A', 'bld-a', 1, 'corridor',  675, 720, 4, true,  'Patio central y accesos a aulas A'),
    ('cc-ascensor-a-p1',   'Ascensor Edificio A (Piso 1)',                   'Edificio A', 'bld-a', 1, 'elevator',  575, 700, 4, false, 'Costado oeste del hall Edificio A'),
    ('cc-ascensor-a-p2',   'Ascensor Edificio A (Piso 2)',                   'Edificio A', 'bld-a', 2, 'elevator',  575, 700, 8, true,  'Pasillo superior Edificio A'),
    ('cc-edificio-b-p1',   'Edificio B — Patio Interior (Piso 1)',           'Edificio B', 'bld-b', 1, 'corridor', 1040, 580, 4, true,  'Claustro central del Edificio B'),
    ('cc-ascensor-b-p1',   'Ascensor Edificio B (Piso 1)',                   'Edificio B', 'bld-b', 1, 'elevator', 1140, 580, 4, false, 'Ala oriente Edificio B'),
    ('cc-ascensor-b-p2',   'Ascensor Edificio B (Piso 2)',                   'Edificio B', 'bld-b', 2, 'elevator', 1140, 580, 8, true,  'Conexión superior Edificio B hacia A y C'),
    ('cc-edificio-c-p1',   'Edificio C — Acceso Norte (Av. Placeres)',       'Edificio C', 'bld-c', 1, 'entrance',  780, 370, 4, true,  'Frente a Avenida Placeres'),
    ('cc-rampa-b-c',       'Rampa Accesible B–C',                            'Exterior',   NULL,    1, 'ramp',      910, 485, 4, false, 'Rampa techada entre Edificio B y Edificio C'),
    ('cc-edificio-f',      'Edificio F (Piso 1)',                            'Edificio F', 'bld-f', 1, 'room',     1275, 845, 4, true,  'Jardines sector sur-oriente'),
    ('cc-edificio-m',      'Edificio M (Informática)',                       'Edificio M', 'bld-m', 1, 'room',      230, 475, 4, true,  'Costado poniente junto a la cancha'),
    ('cc-edificio-p',      'Edificio P (Federación)',                        'Edificio P', 'bld-p', 1, 'room',      785, 110, 4, true,  'Cruzando Av. Placeres por San Guillermo'),
    ('cc-aula-a201',       'Aula A-201 — Ingeniería (Piso 2)',               'Edificio A', 'bld-a', 2, 'room',      675, 720, 8, true,  'Sala de clases ala oriente Piso 2 Edificio A'),
    ('cc-sala-b202',       'Sala de Estudio B-202 — Biblioteca (Piso 2)',    'Edificio B', 'bld-b', 2, 'room',     1040, 580, 8, true,  'Sala silenciosa de lectura Piso 2 Biblioteca Central'),
    ('cc-salida-placeres', 'Salida Norte — Av. Placeres',                    'Exterior',   NULL,    1, 'entrance',  945, 235, 6, true,  'Portón peatonal norte hacia Av. Placeres'),
    ('cc-salida-oriente',  'Salida Oriente — Portón Av. España',             'Exterior',   NULL,    1, 'entrance', 1435, 890, 2, true,  'Salida peatonal y vehicular sector jardines oriente')
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
-- 3. Aristas (20 — cc-e1..cc-e20)
-- -----------------------------------------------------------------------------
INSERT INTO public.edges (
    id, from_node_id, to_node_id, distance_m, estimated_time_s, base_weight,
    edge_type, is_accessible, is_covered, bidirectional
)
VALUES
    ('cc-e1',  'cc-acceso-espana', 'cc-edificio-a-p1',    55, 57, 1.4,  'stairs',   false, false, true),
    ('cc-e2',  'cc-acceso-espana', 'cc-edificio-f',       95, 81, 1.15, 'ramp',     true,  false, true),
    ('cc-e3',  'cc-edificio-f',    'cc-edificio-a-p1',    65, 48, 1.0,  'corridor', true,  true,  true),
    ('cc-e4',  'cc-edificio-a-p1', 'cc-ascensor-a-p1',    20, 15, 1.0,  'corridor', true,  true,  true),
    ('cc-e5',  'cc-ascensor-a-p1', 'cc-ascensor-a-p2',    10, 35, 1.3,  'elevator', true,  true,  true),
    ('cc-e6',  'cc-edificio-a-p1', 'cc-edificio-b-p1',    40, 30, 1.0,  'corridor', true,  true,  true),
    ('cc-e7',  'cc-edificio-b-p1', 'cc-ascensor-b-p1',    25, 19, 1.0,  'corridor', true,  true,  true),
    ('cc-e8',  'cc-ascensor-b-p1', 'cc-ascensor-b-p2',    10, 35, 1.3,  'elevator', true,  true,  true),
    ('cc-e9',  'cc-ascensor-a-p2', 'cc-ascensor-b-p2',    45, 34, 1.0,  'corridor', true,  true,  true),
    ('cc-e10', 'cc-edificio-b-p1', 'cc-rampa-b-c',        30, 26, 1.15, 'ramp',     true,  true,  true),
    ('cc-e11', 'cc-rampa-b-c',     'cc-edificio-c-p1',    30, 23, 1.0,  'corridor', true,  true,  true),
    ('cc-e12', 'cc-edificio-c-p1', 'cc-edificio-p',       70, 52, 1.0,  'outdoor',  true,  false, true),
    ('cc-e13', 'cc-edificio-c-p1', 'cc-edificio-m',      130, 96, 1.0,  'outdoor',  true,  false, true),
    ('cc-e14', 'cc-ascensor-a-p2', 'cc-aula-a201',        22, 17, 1.0,  'corridor', true,  true,  true),
    ('cc-e15', 'cc-ascensor-b-p2', 'cc-sala-b202',        22, 17, 1.0,  'corridor', true,  true,  true),
    ('cc-e16', 'cc-edificio-a-p1', 'cc-aula-a201',        14, 24, 1.35, 'stairs',   false, true,  true),
    ('cc-e17', 'cc-edificio-b-p1', 'cc-sala-b202',        14, 24, 1.35, 'stairs',   false, true,  true),
    ('cc-e18', 'cc-edificio-c-p1', 'cc-salida-placeres',  45, 39, 1.15, 'ramp',     true,  false, true),
    ('cc-e19', 'cc-edificio-p',    'cc-salida-placeres',  42, 44, 1.4,  'stairs',   false, false, true),
    ('cc-e20', 'cc-edificio-f',    'cc-salida-oriente',   48, 41, 1.15, 'ramp',     true,  false, true)
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
