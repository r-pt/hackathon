-- =============================================================================
-- CampusRoute — Datos Semilla UTFSM Casa Central (PostgreSQL / Supabase)
-- =============================================================================
-- Idempotente: utiliza INSERT ... ON CONFLICT (id) DO UPDATE en todas las tablas.
-- Sincronizado 1:1 con backend/app/db/local_store.py y graph_fixture.py:
-- 6 edificios (bld-a, bld-b, bld-c, bld-f, bld-m, bld-p), 20 nodos (cc-*),
-- 30 aristas (cc-e1..cc-e30) e incidencia activa inicial cc-inc-1.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Edificios (6 — UTFSM Casa Central, 2200x1450)
-- -----------------------------------------------------------------------------
INSERT INTO public.buildings (id, name, x, y, width, height, floors, color)
VALUES
    ('bld-p', 'Edificio P — Gimnasio y Federación',   980,  55, 200, 110, 1, '#0891B2'),
    ('bld-c', 'Edificio C — Química y Laboratorios',  970, 320, 220, 115, 1, '#4F46E5'),
    ('bld-b', 'Edificio B — Claustro y Biblioteca',   960, 610, 240, 135, 2, '#059669'),
    ('bld-a', 'Edificio A — Frontis y Aula Magna',    960, 940, 240, 140, 2, '#2563EB'),
    ('bld-m', 'Edificio M — Mecánica y Talleres',     160, 580, 220, 130, 1, '#D97706'),
    ('bld-f', 'Edificio F — Informática (DI)',       1620, 950, 220, 130, 1, '#7C3AED')
ON CONFLICT (id) DO UPDATE SET
    name   = EXCLUDED.name,
    x      = EXCLUDED.x,
    y      = EXCLUDED.y,
    width  = EXCLUDED.width,
    height = EXCLUDED.height,
    floors = EXCLUDED.floors,
    color  = EXCLUDED.color;

-- -----------------------------------------------------------------------------
-- 2. Nodos (20 — UTFSM Casa Central, cc-*)
-- -----------------------------------------------------------------------------
INSERT INTO public.nodes (
    id, name, building, building_id, floor, node_type, x, y, z, is_destination, landmark
)
VALUES
    ('cc-acceso-espana',    'Acceso Principal Av. España',           'Exterior',             NULL,    1, 'entrance', 1080, 1340, 0, true,  'Escalinata y acceso sur desde Av. España'),
    ('cc-edificio-a-p1',    'Hall Central y Aula Magna',             'Edificio A',           'bld-a', 1, 'corridor', 1080, 1015, 4, true,  'Patio central y accesos a aulas A'),
    ('cc-ascensor-a-p1',    'Ascensor Sector Frontis',               'Edificio A',           'bld-a', 1, 'elevator', 1000, 1015, 4, false, 'Costado oeste del hall Edificio A'),
    ('cc-ascensor-a-p2',    'Ascensor Nivel 2 — Frontis',            'Edificio A',           'bld-a', 2, 'elevator', 1000, 1015, 8, true,  'Pasillo superior Edificio A'),
    ('cc-edificio-b-p1',    'Patio del Claustro Central',            'Edificio B',           'bld-b', 1, 'corridor', 1080,  675, 4, true,  'Claustro central del Edificio B'),
    ('cc-ascensor-b-p1',    'Ascensor Biblioteca',                   'Edificio B',           'bld-b', 1, 'elevator', 1160,  675, 4, false, 'Ala oriente Edificio B'),
    ('cc-ascensor-b-p2',    'Ascensor Nivel 2 — Biblioteca',         'Edificio B',           'bld-b', 2, 'elevator', 1160,  675, 8, true,  'Conexión superior Edificio B hacia A y C'),
    ('cc-edificio-c-p1',    'Hall Química y Acceso Placeres',        'Edificio C',           'bld-c', 1, 'entrance', 1080,  380, 4, true,  'Frente a Avenida Placeres'),
    ('cc-rampa-b-c',        'Rampa Accesible B–C',                   'Exterior',             NULL,    1, 'ramp',     1260,  525, 4, false, 'Rampa techada entre Edificio B y Edificio C'),
    ('cc-edificio-f',       'Salas y Laboratorios de Informática',   'Edificio F',           'bld-f', 1, 'room',     1730, 1015, 4, true,  'Departamento de Informática (DI) en jardines sur-oriente'),
    ('cc-edificio-m',       'Talleres y Laboratorios de Mecánica',   'Edificio M',           'bld-m', 1, 'room',      270,  645, 4, true,  'Sector poniente junto a la cancha — Departamento de Mecánica'),
    ('cc-edificio-p',       'Acceso Gimnasio y Federación',          'Edificio P',           'bld-p', 1, 'room',     1080,  110, 4, true,  'Cruzando Av. Placeres por San Guillermo'),
    ('cc-aula-a201',        'Sala A-201 — Frontis Sur',              'Edificio A',           'bld-a', 2, 'room',     1080, 1015, 8, true,  'Sala de clases ala oriente Piso 2 Edificio A'),
    ('cc-sala-b202',        'Biblioteca Central — Sala B-202',       'Edificio B',           'bld-b', 2, 'room',     1080,  675, 8, true,  'Sala silenciosa de lectura Piso 2 Biblioteca Central'),
    ('cc-salida-placeres',  'Salida Norte — Av. Placeres',           'Exterior',             NULL,    1, 'entrance', 1480,  225, 6, true,  'Portón peatonal norte hacia Av. Placeres'),
    ('cc-salida-oriente',   'Salida Oriente — Portón Av. España',    'Exterior',             NULL,    1, 'entrance', 2020, 1015, 2, true,  'Salida peatonal y vehicular sector jardines oriente'),
    ('cc-explanada-espana', 'Explanada Monumental Av. España',       'Red Vial Pavimentada', NULL,    1, 'corridor',  880, 1185, 2, true,  'Explanada pavimentada sur entre Portón Av. España, Frontis Edificio A y Jardines'),
    ('cc-patio-central',    'Plaza Central del Claustro',            'Red Vial Pavimentada', NULL,    1, 'corridor',  880,  835, 4, true,  'Plaza pavimentada central entre Edificio A, Claustro Edificio B y Paseo Poniente'),
    ('cc-paseo-poniente',   'Paseo Poniente — Mirador Cancha',       'Red Vial Pavimentada', NULL,    1, 'corridor',  620,  645, 4, true,  'Calzada peatonal poniente junto a la cancha hacia Mecánica (Ed. M), Plaza Central y Ed. C'),
    ('cc-terraza-placeres', 'Crucero Pavimentado Av. Placeres',      'Red Vial Pavimentada', NULL,    1, 'corridor', 1080,  225, 5, true,  'Cruce vial pavimentado norte entre Edificio C, Edificio P y Salida Av. Placeres')
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
-- 3. Aristas (30 — cc-e1..cc-e30)
-- -----------------------------------------------------------------------------
INSERT INTO public.edges (
    id, from_node_id, to_node_id, distance_m, estimated_time_s, base_weight,
    edge_type, is_accessible, is_covered, bidirectional
)
VALUES
    ('cc-e1',  'cc-acceso-espana',    'cc-edificio-a-p1',     55, 57, 1.4,  'stairs',   false, false, true),
    ('cc-e2',  'cc-acceso-espana',    'cc-edificio-f',        95, 81, 1.15, 'ramp',     true,  false, true),
    ('cc-e3',  'cc-edificio-f',       'cc-edificio-a-p1',     65, 48, 1.0,  'corridor', true,  true,  true),
    ('cc-e4',  'cc-edificio-a-p1',    'cc-ascensor-a-p1',     20, 15, 1.0,  'corridor', true,  true,  true),
    ('cc-e5',  'cc-ascensor-a-p1',    'cc-ascensor-a-p2',     10, 35, 1.3,  'elevator', true,  true,  true),
    ('cc-e6',  'cc-edificio-a-p1',    'cc-edificio-b-p1',     40, 30, 1.0,  'corridor', true,  true,  true),
    ('cc-e7',  'cc-edificio-b-p1',    'cc-ascensor-b-p1',     25, 19, 1.0,  'corridor', true,  true,  true),
    ('cc-e8',  'cc-ascensor-b-p1',    'cc-ascensor-b-p2',     10, 35, 1.3,  'elevator', true,  true,  true),
    ('cc-e9',  'cc-ascensor-a-p2',    'cc-ascensor-b-p2',     45, 34, 1.0,  'corridor', true,  true,  true),
    ('cc-e10', 'cc-edificio-b-p1',    'cc-rampa-b-c',         30, 26, 1.15, 'ramp',     true,  true,  true),
    ('cc-e11', 'cc-rampa-b-c',        'cc-edificio-c-p1',     30, 23, 1.0,  'corridor', true,  true,  true),
    ('cc-e12', 'cc-edificio-c-p1',    'cc-edificio-p',        70, 52, 1.0,  'outdoor',  true,  false, true),
    ('cc-e13', 'cc-edificio-c-p1',    'cc-edificio-m',       130, 96, 1.0,  'outdoor',  true,  false, true),
    ('cc-e14', 'cc-ascensor-a-p2',    'cc-aula-a201',         22, 17, 1.0,  'corridor', true,  true,  true),
    ('cc-e15', 'cc-ascensor-b-p2',    'cc-sala-b202',         22, 17, 1.0,  'corridor', true,  true,  true),
    ('cc-e16', 'cc-edificio-a-p1',    'cc-aula-a201',         14, 24, 1.35, 'stairs',   false, true,  true),
    ('cc-e17', 'cc-edificio-b-p1',    'cc-sala-b202',         14, 24, 1.35, 'stairs',   false, true,  true),
    ('cc-e18', 'cc-edificio-c-p1',    'cc-salida-placeres',   45, 39, 1.15, 'ramp',     true,  false, true),
    ('cc-e19', 'cc-edificio-p',       'cc-salida-placeres',   42, 44, 1.4,  'stairs',   false, false, true),
    ('cc-e20', 'cc-edificio-f',       'cc-salida-oriente',    48, 41, 1.15, 'ramp',     true,  false, true),
    ('cc-e21', 'cc-acceso-espana',    'cc-explanada-espana',  32, 24, 1.0,  'ramp',     true,  false, true),
    ('cc-e22', 'cc-explanada-espana', 'cc-edificio-a-p1',     38, 30, 1.05, 'ramp',     true,  false, true),
    ('cc-e23', 'cc-explanada-espana', 'cc-edificio-f',        52, 39, 1.0,  'outdoor',  true,  false, true),
    ('cc-e24', 'cc-edificio-a-p1',    'cc-patio-central',     26, 19, 1.0,  'corridor', true,  true,  true),
    ('cc-e25', 'cc-patio-central',    'cc-edificio-b-p1',     28, 21, 1.0,  'corridor', true,  true,  true),
    ('cc-e26', 'cc-patio-central',    'cc-paseo-poniente',    48, 36, 1.0,  'outdoor',  true,  false, true),
    ('cc-e27', 'cc-paseo-poniente',   'cc-edificio-m',        44, 33, 1.0,  'outdoor',  true,  false, true),
    ('cc-e28', 'cc-paseo-poniente',   'cc-edificio-c-p1',     54, 42, 1.05, 'ramp',     true,  false, true),
    ('cc-e29', 'cc-edificio-c-p1',    'cc-terraza-placeres',  24, 18, 1.0,  'outdoor',  true,  false, true),
    ('cc-e30', 'cc-terraza-placeres', 'cc-salida-placeres',   24, 18, 1.0,  'ramp',     true,  false, true)
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
