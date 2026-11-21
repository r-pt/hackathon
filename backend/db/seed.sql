-- =============================================================================
-- CampusRoute — Datos Semilla del Campus Simulado (PostgreSQL / Supabase)
-- =============================================================================
-- Idempotente: utiliza INSERT ... ON CONFLICT (id) DO UPDATE en todas las tablas.
-- Contiene exactamente el grafo base de docs/openapi.yaml (2 edificios, 15 nodos,
-- 16 aristas e-1..e-16 e incidencia activa inc-101) más una ampliación realista
-- hasta 20 nodos y 31 aristas sin alterar la ruta óptima de demostración.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Edificios (2)
-- -----------------------------------------------------------------------------
INSERT INTO public.buildings (id, name, x, y, width, height, floors, color)
VALUES
    ('bld-a', 'Edificio A (Ingeniería)',        150, 110, 400, 210, 2, '#3b82f6'),
    ('bld-b', 'Edificio B (Biblioteca y Labs)', 610, 130, 280, 410, 2, '#10b981')
ON CONFLICT (id) DO UPDATE SET
    name   = EXCLUDED.name,
    x      = EXCLUDED.x,
    y      = EXCLUDED.y,
    width  = EXCLUDED.width,
    height = EXCLUDED.height,
    floors = EXCLUDED.floors,
    color  = EXCLUDED.color;

-- -----------------------------------------------------------------------------
-- 2. Nodos (20 = 15 base de docs/openapi.yaml + 5 ampliación realista)
-- -----------------------------------------------------------------------------
INSERT INTO public.nodes (
    id, name, building, building_id, floor, node_type, x, y, z, is_destination, landmark
)
VALUES
    -- 15 nodos exactos de docs/openapi.yaml
    ('n-entrada-sur',   'Entrada Principal Sur',          'Exterior',     NULL,    1, 'entrance', 120, 540, 0, true,  'Frente a la garita y parada de bus'),
    ('n-patio-central', 'Patio Central',                  'Exterior',     NULL,    1, 'corridor', 340, 440, 0, false, 'Explanada con fuente central'),
    ('n-biblioteca',    'Biblioteca Central',             'Edificio B',   'bld-b', 1, 'room',     680, 490, 0, true,  'Puerta vidriada junto al patio'),
    ('n-cafeteria',     'Cafetería Universitaria',        'Edificio A',   'bld-a', 1, 'room',     180, 260, 0, true,  'Planta baja ala oeste'),
    ('n-rampa-sur',     'Rampa Accesible Sur',            'Edificio B',   'bld-b', 1, 'ramp',     520, 520, 0, false, 'Rampa techada con barandas junto a Biblioteca'),
    ('n-hall-a-p1',     'Hall Edificio A (Piso 1)',       'Edificio A',   'bld-a', 1, 'corridor', 340, 260, 0, false, 'Recepción y tablero de avisos'),
    ('n-escalera-a-p1', 'Escalera Central A (Piso 1)',    'Edificio A',   'bld-a', 1, 'stairs',   420, 200, 0, false, 'Escalera principal de concreto'),
    ('n-ascensor-a-p1', 'Ascensor Edificio A (Piso 1)',   'Edificio A',   'bld-a', 1, 'elevator', 340, 160, 0, false, 'Al costado del hall de Rectorado'),
    ('n-ascensor-b-p1', 'Ascensor Edificio B (Piso 1)',   'Edificio B',   'bld-b', 1, 'elevator', 720, 280, 0, false, 'Pasillo interno norte de Biblioteca'),
    ('n-escalera-a-p2', 'Escalera Central A (Piso 2)',    'Edificio A',   'bld-a', 2, 'stairs',   420, 200, 4, false, 'Descanso superior Edificio A'),
    ('n-ascensor-a-p2', 'Ascensor Edificio A (Piso 2)',   'Edificio A',   'bld-a', 2, 'elevator', 340, 160, 4, false, 'Frente al pasillo de aulas 200'),
    ('n-ascensor-b-p2', 'Ascensor Edificio B (Piso 2)',   'Edificio B',   'bld-b', 2, 'elevator', 720, 280, 4, false, 'Junto al puente techado del Piso 2'),
    ('n-pasillo-p2',    'Puente Cubierto Piso 2',         'Edificio A-B', NULL,    2, 'corridor', 560, 240, 4, false, 'Pasarela cerrada entre Edificio A y B'),
    ('n-aula-204',      'Aula 204 (Ingeniería)',          'Edificio A',   'bld-a', 2, 'room',     500, 150, 4, true,  'Segunda puerta a la derecha del puente'),
    ('n-lab-computo',   'Laboratorio de Cómputo',         'Edificio B',   'bld-b', 2, 'room',     840, 180, 4, true,  'Fondo del pasillo Piso 2 Edificio B'),

    -- 5 nodos de ampliación del campus
    ('n-auditorio',     'Auditorio Principal',            'Edificio A',   'bld-a', 1, 'room',     240, 150, 0, true,  'Ala noroeste planta baja, junto a Cafetería'),
    ('n-pasillo-ab-p1', 'Galería Cubierta A-B (Piso 1)',  'Edificio A-B', NULL,    1, 'corridor', 560, 310, 0, false, 'Pasillo techado con pérgola entre Edificio A y B'),
    ('n-rampa-norte',   'Rampa Accesible Norte',          'Exterior',     NULL,    1, 'ramp',     640, 160, 0, false, 'Acceso accesible norte al costado del Edificio B'),
    ('n-escalera-b-p1', 'Escalera Edificio B (Piso 1)',   'Edificio B',   'bld-b', 1, 'stairs',   820, 390, 0, false, 'Escalera lateral este detrás de Biblioteca'),
    ('n-escalera-b-p2', 'Escalera Edificio B (Piso 2)',   'Edificio B',   'bld-b', 2, 'stairs',   820, 390, 4, false, 'Descanso superior ala este Edificio B')
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
-- 3. Aristas (31 = 16 base e-1..e-16 de docs/openapi.yaml + 15 ampliación)
-- -----------------------------------------------------------------------------
INSERT INTO public.edges (
    id, from_node_id, to_node_id, distance_m, estimated_time_s, base_weight,
    edge_type, is_accessible, is_covered, bidirectional
)
VALUES
    -- 16 aristas exactas de docs/openapi.yaml (e-1 a e-16)
    ('e-1',  'n-entrada-sur',   'n-patio-central', 45, 38, 1.0,  'outdoor',  true,  false, true),
    ('e-2',  'n-entrada-sur',   'n-rampa-sur',     60, 63, 1.15, 'ramp',     true,  true,  true),
    ('e-3',  'n-patio-central', 'n-hall-a-p1',     35, 30, 1.0,  'outdoor',  true,  false, true),
    ('e-4',  'n-hall-a-p1',     'n-cafeteria',     30, 25, 1.0,  'corridor', true,  true,  true),
    ('e-5',  'n-hall-a-p1',     'n-escalera-a-p1', 20, 17, 1.0,  'corridor', true,  true,  true),
    ('e-6',  'n-hall-a-p1',     'n-ascensor-a-p1', 25, 21, 1.0,  'corridor', true,  true,  true),
    ('e-7',  'n-rampa-sur',     'n-biblioteca',    35, 30, 1.0,  'corridor', true,  true,  true),
    ('e-8',  'n-biblioteca',    'n-ascensor-b-p1', 40, 34, 1.0,  'corridor', true,  true,  true),
    ('e-9',  'n-escalera-a-p1', 'n-escalera-a-p2', 15, 25, 1.4,  'stairs',   false, true,  true),
    ('e-10', 'n-ascensor-a-p1', 'n-ascensor-a-p2', 10, 48, 1.3,  'elevator', true,  true,  true),
    ('e-11', 'n-ascensor-b-p1', 'n-ascensor-b-p2', 10, 48, 1.3,  'elevator', true,  true,  true),
    ('e-12', 'n-escalera-a-p2', 'n-aula-204',      25, 22, 1.0,  'corridor', true,  true,  true),
    ('e-13', 'n-ascensor-a-p2', 'n-aula-204',      30, 25, 1.0,  'corridor', true,  true,  true),
    ('e-14', 'n-ascensor-b-p2', 'n-pasillo-p2',    25, 22, 1.0,  'corridor', true,  true,  true),
    ('e-15', 'n-pasillo-p2',    'n-aula-204',      20, 19, 1.0,  'corridor', true,  true,  true),
    ('e-16', 'n-ascensor-b-p2', 'n-lab-computo',   30, 25, 1.0,  'corridor', true,  true,  true),

    -- 15 aristas de ampliación (e-17 a e-31)
    -- Recorridos cubiertos, exteriores, rampas y escaleras alternas para probar desvíos y lluvia
    ('e-17', 'n-entrada-sur',   'n-cafeteria',     60, 52, 1.0,  'corridor', true,  true,  true),
    ('e-18', 'n-cafeteria',     'n-auditorio',     28, 24, 1.0,  'corridor', true,  true,  true),
    ('e-19', 'n-hall-a-p1',     'n-auditorio',     30, 25, 1.0,  'corridor', true,  true,  true),
    ('e-20', 'n-auditorio',     'n-ascensor-a-p1', 22, 19, 1.0,  'corridor', true,  true,  true),
    ('e-21', 'n-hall-a-p1',     'n-pasillo-ab-p1', 45, 45, 1.4,  'stairs',   false, true,  true),
    ('e-22', 'n-pasillo-ab-p1', 'n-ascensor-b-p1', 40, 34, 1.0,  'corridor', true,  true,  true),
    ('e-23', 'n-patio-central', 'n-rampa-sur',     38, 32, 1.0,  'outdoor',  true,  false, true),
    ('e-24', 'n-patio-central', 'n-biblioteca',    70, 58, 1.0,  'outdoor',  true,  false, true),
    ('e-25', 'n-pasillo-ab-p1', 'n-rampa-norte',   35, 37, 1.15, 'ramp',     true,  false, true),
    ('e-26', 'n-rampa-norte',   'n-ascensor-b-p1', 30, 26, 1.0,  'corridor', true,  true,  true),
    ('e-27', 'n-biblioteca',    'n-escalera-b-p1', 30, 25, 1.0,  'corridor', true,  true,  true),
    ('e-28', 'n-escalera-b-p1', 'n-escalera-b-p2', 15, 25, 1.4,  'stairs',   false, true,  true),
    ('e-29', 'n-escalera-b-p2', 'n-lab-computo',   30, 25, 1.0,  'corridor', true,  true,  true),
    ('e-30', 'n-escalera-b-p2', 'n-ascensor-b-p2', 28, 24, 1.0,  'corridor', true,  true,  true),
    ('e-31', 'n-ascensor-a-p2', 'n-escalera-a-p2', 18, 15, 1.0,  'corridor', true,  true,  true)
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
-- 4. Incidencias iniciales (1 activa: inc-101)
-- -----------------------------------------------------------------------------
INSERT INTO public.incidents (
    id, target_type, node_id, edge_id, conflict_type, severity, status,
    description, reported_by, reported_at, resolved_at
)
VALUES (
    'inc-101',
    'node',
    'n-ascensor-a-p1',
    NULL,
    'elevator_broken',
    'blocking',
    'active',
    'Ascensor Edificio A fuera de servicio por mantenimiento',
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
