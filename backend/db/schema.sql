-- =============================================================================
-- CampusRoute — Esquema de Base de Datos (PostgreSQL / Supabase)
-- =============================================================================
-- Idempotente: seguro de re-ejecutar sobre una base de datos Supabase existente.
-- Tablas en public: profiles, buildings, nodes, edges, incidents.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. public.profiles (enlazada 1:1 con auth.users de Supabase Auth)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email text NOT NULL UNIQUE,
    full_name text NOT NULL DEFAULT '',
    role text NOT NULL DEFAULT 'student'
        CHECK (role IN ('student', 'staff', 'admin')),
    reduced_mobility boolean NOT NULL DEFAULT false,
    prefer_covered boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trigger para mantener updated_at actualizado automáticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- Trigger para crear automáticamente el perfil al registrarse en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        reduced_mobility,
        prefer_covered
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
        CASE
            WHEN (NEW.raw_app_meta_data ->> 'role') IN ('student', 'staff', 'admin')
                THEN (NEW.raw_app_meta_data ->> 'role')
            ELSE 'student'
        END,
        CASE
            WHEN LOWER(COALESCE(NEW.raw_user_meta_data ->> 'reduced_mobility', '')) = 'true'
                THEN true
            ELSE false
        END,
        CASE
            WHEN LOWER(COALESCE(NEW.raw_user_meta_data ->> 'prefer_covered', '')) = 'true'
                THEN true
            ELSE false
        END
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 2. public.buildings (geometría base 2.5D de edificios del campus)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buildings (
    id text PRIMARY KEY,
    name text NOT NULL,
    x integer NOT NULL,
    y integer NOT NULL,
    width integer NOT NULL CHECK (width > 0),
    height integer NOT NULL CHECK (height > 0),
    floors integer NOT NULL CHECK (floors >= 1),
    color text NOT NULL
);

-- -----------------------------------------------------------------------------
-- 3. public.nodes (nodos 3D del grafo universitario)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nodes (
    id text PRIMARY KEY,
    name text NOT NULL,
    building text NOT NULL,
    building_id text REFERENCES public.buildings(id) ON DELETE SET NULL,
    floor integer NOT NULL CHECK (floor >= 1),
    node_type text NOT NULL
        CHECK (node_type IN ('entrance', 'room', 'corridor', 'elevator', 'stairs', 'ramp')),
    x integer NOT NULL,
    y integer NOT NULL,
    z integer NOT NULL,
    is_destination boolean NOT NULL DEFAULT false,
    landmark text NOT NULL DEFAULT ''
);

-- -----------------------------------------------------------------------------
-- 4. public.edges (aristas ponderadas del grafo con metadatos de accesibilidad)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.edges (
    id text PRIMARY KEY,
    from_node_id text NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    to_node_id text NOT NULL REFERENCES public.nodes(id) ON DELETE CASCADE,
    distance_m integer NOT NULL CHECK (distance_m >= 1),
    estimated_time_s integer NOT NULL DEFAULT 30 CHECK (estimated_time_s >= 1),
    base_weight double precision NOT NULL DEFAULT 1.0 CHECK (base_weight >= 0.1),
    edge_type text NOT NULL
        CHECK (edge_type IN ('corridor', 'stairs', 'elevator', 'ramp', 'outdoor')),
    is_accessible boolean NOT NULL DEFAULT true,
    is_covered boolean NOT NULL DEFAULT true,
    bidirectional boolean NOT NULL DEFAULT true,
    CONSTRAINT edges_distinct_nodes_check CHECK (from_node_id <> to_node_id)
);

-- -----------------------------------------------------------------------------
-- 5. public.incidents (incidencias/conflictos sobre nodos o aristas)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.incidents (
    id text PRIMARY KEY DEFAULT ('inc-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    target_type text NOT NULL CHECK (target_type IN ('node', 'edge')),
    node_id text REFERENCES public.nodes(id) ON DELETE CASCADE,
    edge_id text REFERENCES public.edges(id) ON DELETE CASCADE,
    conflict_type text NOT NULL
        CHECK (conflict_type IN (
            'elevator_broken',
            'stairs_blocked',
            'ramp_obstructed',
            'corridor_closed',
            'crowd_congestion'
        )),
    severity text NOT NULL CHECK (severity IN ('blocking', 'warning')),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved')),
    description text NOT NULL CHECK (char_length(description) BETWEEN 3 AND 280),
    reported_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    reported_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    CONSTRAINT incidents_target_integrity_check CHECK (
        (target_type = 'node' AND node_id IS NOT NULL AND edge_id IS NULL)
        OR
        (target_type = 'edge' AND edge_id IS NOT NULL AND node_id IS NULL)
    )
);

-- -----------------------------------------------------------------------------
-- Índices para consultas de mapa, ubicaciones, rutas e incidencias
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_nodes_floor
    ON public.nodes (floor);

CREATE INDEX IF NOT EXISTS idx_nodes_is_destination
    ON public.nodes (is_destination);

CREATE INDEX IF NOT EXISTS idx_nodes_building_id
    ON public.nodes (building_id);

CREATE INDEX IF NOT EXISTS idx_edges_from_node_id
    ON public.edges (from_node_id);

CREATE INDEX IF NOT EXISTS idx_edges_to_node_id
    ON public.edges (to_node_id);

CREATE INDEX IF NOT EXISTS idx_incidents_status
    ON public.incidents (status);

CREATE INDEX IF NOT EXISTS idx_incidents_node_id
    ON public.incidents (node_id);

CREATE INDEX IF NOT EXISTS idx_incidents_edge_id
    ON public.incidents (edge_id);

-- -----------------------------------------------------------------------------
-- Row Level Security (RLS) y Políticas
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;

-- profiles: usuarios autenticados ven y actualizan solo su propio perfil
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = id)
    WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS profiles_service_role_all ON public.profiles;
CREATE POLICY profiles_service_role_all
    ON public.profiles
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- buildings: lectura pública; escritura reservada a service_role
DROP POLICY IF EXISTS buildings_select_public ON public.buildings;
CREATE POLICY buildings_select_public
    ON public.buildings
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS buildings_service_role_all ON public.buildings;
CREATE POLICY buildings_service_role_all
    ON public.buildings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- nodes: lectura pública; escritura reservada a service_role
DROP POLICY IF EXISTS nodes_select_public ON public.nodes;
CREATE POLICY nodes_select_public
    ON public.nodes
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS nodes_service_role_all ON public.nodes;
CREATE POLICY nodes_service_role_all
    ON public.nodes
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- edges: lectura pública; escritura reservada a service_role
DROP POLICY IF EXISTS edges_select_public ON public.edges;
CREATE POLICY edges_select_public
    ON public.edges
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS edges_service_role_all ON public.edges;
CREATE POLICY edges_service_role_all
    ON public.edges
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- incidents: lectura pública; usuarios autenticados pueden crear y actualizar
DROP POLICY IF EXISTS incidents_select_public ON public.incidents;
CREATE POLICY incidents_select_public
    ON public.incidents
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS incidents_insert_authenticated ON public.incidents;
CREATE POLICY incidents_insert_authenticated
    ON public.incidents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (select auth.uid()) IS NOT NULL
        AND (reported_by IS NULL OR reported_by = (select auth.uid()))
    );

DROP POLICY IF EXISTS incidents_update_authenticated ON public.incidents;
CREATE POLICY incidents_update_authenticated
    ON public.incidents
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) IS NOT NULL)
    WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS incidents_service_role_all ON public.incidents;
CREATE POLICY incidents_service_role_all
    ON public.incidents
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
