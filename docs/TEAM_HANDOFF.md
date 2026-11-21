# Guía de Arranque por Persona (Handoff de Fase 0)

> **Fase 0 completada**: el contrato `docs/openapi.yaml`, el esqueleto FastAPI con routers montados, la configuración de despliegue (`render.yaml`, `frontend/vercel.json`) y las ramas `main` / `dev` ya están listos.
>
> **Regla #1**: Empieza siempre desde `dev`:
> ```bash
> git checkout dev && git pull origin dev
> ```

---

## Persona A — Backend: DB, Auth y Funcionalidad 1

- **Rama**: `git checkout -b feat/backend-a`
- **Responsabilidad**: Supabase (`schema.sql` + `seed.sql`), cliente DB, validación JWT de Supabase Auth, mapa/ubicaciones del campus y CRUD de incidencias.

### Endpoints que implementas (ver `docs/openapi.yaml`)
- `GET /api/v1/health`
- `GET /api/v1/auth/me` *(Bearer JWT)*
- `PATCH /api/v1/auth/preferences` *(Bearer JWT)*
- `GET /api/v1/campus/map`
- `GET /api/v1/campus/locations`
- `GET /api/v1/incidents`
- `POST /api/v1/incidents` *(Bearer JWT)*
- `PATCH /api/v1/incidents/{incidentId}` *(Bearer JWT)*

### Archivos que creas o modificas (exclusivos de Persona A)
- `backend/db/schema.sql` *(tablas: `profiles`, `buildings`, `nodes`, `edges`, `incidents`)*
- `backend/db/seed.sql` *(copia exacta del grafo de ejemplo en `docs/openapi.yaml`: 2 edificios, 15+ nodos con `x,y,z`, 16+ aristas con `base_weight`, 1 incidencia activa en `n-ascensor-a-p1`)*
- `backend/app/core/config.py` *(Settings con `pydantic-settings` leyendo `backend/.env`)*
- `backend/app/core/auth.py` *(dependencia FastAPI `get_current_user` validando Bearer JWT con Supabase)*
- `backend/app/db/supabase.py` *(cliente compartido `get_supabase()` que Persona B importará en Hora 2)*
- `backend/app/schemas/auth.py`, `campus.py`, `incidents.py`
- `backend/app/services/campus_service.py`, `incidents_service.py`
- `backend/app/routers/health.py`, `auth.py`, `campus.py`, `incidents.py`

> **NO tocar**: `backend/app/main.py`, `backend/app/core/errors.py`, routers/schemas/services de Persona B ni `frontend/`.

### Metas por Hora
- **Hora 1:15**: `schema.sql` y `seed.sql` ejecutados en Supabase.
- **Hora 1:45**: `supabase.py`, `auth.py` y `GET /api/v1/health` funcionando.
- **Hora 2:00 (Hito 1)**: `GET /api/v1/campus/map` y `/locations` con datos reales → **Merge a `dev`** para desbloquear a Persona B.
- **Hora 2:45**: `/auth/me` y `/auth/preferences` listos.
- **Hora 3:30**: `/incidents` (`GET`, `POST`, `PATCH`) validando `target_type=node` vs `edge`.
- **Hora 4:00 (Hito 2)**: Merge final en `dev` + primer deploy en **Render** usando `render.yaml`.
- **Hora 5:00 (Hito 3)**: Solo bugfixes + crear usuario demo en Supabase Auth (`estudiante.demo@uni.edu`).

---

## Persona B — Backend: Funcionalidad 2 (Motor A*/Dijkstra) + Clima Open-Meteo

- **Rama**: `git checkout -b feat/backend-b`
- **Responsabilidad**: Motor de búsqueda en grafo ponderado (`A*` y `Dijkstra`) considerando movilidad reducida, incidencias activas y lluvia, más integración externa con Open-Meteo.

### Endpoints que implementas (ver `docs/openapi.yaml`)
- `POST /api/v1/routes/calculate`
- `GET /api/v1/external/weather`

### Fórmula del Grafo Ponderado y Reglas
1. **Bloqueos duros** (arista/nodo excluido):
   - Incidencias `status='active'` con `severity='blocking'` o IDs enviados en `simulated_blocked_node_ids` / `simulated_blocked_edge_ids`.
   - Si `reduced_mobility=true`: excluir aristas con `edge_type='stairs'` o `is_accessible=false`.
2. **Peso efectivo de arista**:
   - `peso = distance_m * base_weight`
   - Si hay incidencia `severity='warning'` sobre nodo/arista: `peso *= 1.8`
   - Si `rain_avoidance_active=true` (por `prefer_covered=true`, `simulate_rain=true`, o Open-Meteo `rain_alert=true` con `use_live_weather=true`) y `is_covered=false`: `peso *= 2.5`
3. **Búsqueda**:
   - `algorithm='astar'`: heurística Euclidiana 3D `sqrt((x1-x2)^2 + (y1-y2)^2 + ((z1-z2)*3)^2)` (admisible/guiada) contando `nodes_explored`.
   - `algorithm='dijkstra'`: heurística `0`.
4. **Errores de contrato** (usar `APIError` desde `app.core.errors`):
   - `400 VALIDATION_ERROR`: `origin_node_id == destination_node_id`.
   - `404 NOT_FOUND`: nodo origen o destino inexistente.
   - `422 NO_ACCESSIBLE_ROUTE`: sin ruta cuando `reduced_mobility=true` (incluir `details={"blocking_incident_ids": [...]}`).
   - `422 ROUTE_NOT_FOUND`: grafo desconectado incluso sin movilidad reducida.

### Archivos que creas o modificas (exclusivos de Persona B)
- `backend/app/schemas/routes.py`, `external.py`
- `backend/app/services/routing_engine.py` *(algoritmo `A*`/`Dijkstra` puro y testeable sin DB)*
- `backend/app/services/directions_builder.py` *(construye `steps` legibles con landmarks y `avoided_conflicts`)*
- `backend/app/services/weather_service.py` *(cliente `httpx` a Open-Meteo con caché 5 min + fallback silencioso)*
- `backend/app/routers/routes.py`, `external.py`
- `backend/tests/test_routing.py`

> **NO tocar**: `backend/app/main.py`, `backend/app/core/errors.py`, archivos de Persona A ni `frontend/`.

### Metas por Hora
- **Hora 1:15**: Schemas Pydantic + fixture local con el grafo de `docs/openapi.yaml` (no esperes a Persona A).
- **Hora 2:00 (Hito 1)**: `routing_engine.py` + `directions_builder.py` pasando tests locales.
- **Hora 2:45**: `git pull origin dev` (tras Hito 1 de A) y conectar `/routes/calculate` a Supabase real.
- **Hora 3:30**: `weather_service.py` + `GET /api/v1/external/weather` integrado con pesos de lluvia.
- **Hora 4:00 (Hito 2)**: `pytest` en verde (ruta normal, movilidad reducida, desvío por ascensor A roto, bloqueo total `422`, lluvia) → **Merge a `dev`**.
- **Hora 5:00 (Hito 3)**: Solo bugfixes y ajuste fino de textos/tiempos.

---

## Persona C — Frontend: Mapa Simulador 2.5D Isométrico + Paneles + Prism

- **Rama**: `git checkout -b feat/frontend-c`
- **Responsabilidad**: Toda la carpeta `frontend/` (Vite + React + TS + Tailwind + shadcn/ui + TanStack Query).

### Mock desde el Minuto 1 (sin esperar al backend)
```bash
# Terminal 1 (en raíz del repo)
npx -y @stoplight/prism-cli mock docs/openapi.yaml -p 4010

# Terminal 2 (en frontend/)
cp .env.example .env   # VITE_API_URL=http://localhost:4010
npm run dev
```

### Arquitectura de UI (Mapa 2.5D Isométrico)
- Proyección isométrica simple para cada nodo `(x, y, z)`:
  - `isoX = (x - y) * 0.72 + offsetX`
  - `isoY = (x + y) * 0.36 - z * 28 + offsetY`
- Permite alternar entre **Vista 2.5D Apilada (Piso 1 + Piso 2)**, **Solo Piso 1** y **Solo Piso 2**.
- Dibuja:
  1. Bloques base de `buildings` con profundidad isométrica sutil.
  2. Aristas diferenciadas por estilo (`stairs` punteada naranja, `ramp` verde, `elevator` eje vertical morado/azul, `corridor` gris/azul, `outdoor` celeste).
  3. Ruta óptima resaltada con animación (`stroke-dasharray`) + marcadores claros de **A (Origen)** y **B (Destino)**.
  4. Badges rojos de alerta sobre nodos/aristas en `active_incidents`.
- **Accesibilidad UI**: usar diálogos nativos/shadcn accesibles, navegación por teclado y alto contraste (el proyecto trata sobre accesibilidad universitaria).

### Archivos que creas o modificas (exclusivos de Persona C)
- Todo dentro de `frontend/` (excepto `frontend/vercel.json` y `frontend/.env.example` que ya están listos):
  - `frontend/src/api/types.ts`, `client.ts`, `hooks.ts`
  - `frontend/src/components/CampusMap3D.tsx`
  - `frontend/src/components/RouteControls.tsx`
  - `frontend/src/components/RouteDirections.tsx`
  - `frontend/src/components/IncidentModal.tsx`
  - `frontend/src/components/AuthModal.tsx`
  - `frontend/src/App.tsx`

### Metas por Hora
- **Hora 1:15**: Proyecto Vite + Tailwind + shadcn/ui + TanStack Query corriendo contra Prism (`:4010`).
- **Hora 1:45**: Tipos y hooks de API listos para todos los endpoints del contrato.
- **Hora 2:30**: `CampusMap3D.tsx` renderizando edificios, pisos 1 y 2, nodos clicables, incidencias y ruta animada.
- **Hora 3:15**: `RouteControls.tsx` (A→B, switch **Movilidad reducida**, selector `A*`/`Dijkstra`, toggle lluvia) + `RouteDirections.tsx` (pasos, métricas, `graph_stats`, conflictos evitados, error `422`).
- **Hora 3:50**: `IncidentModal.tsx` y `AuthModal.tsx` (Supabase Auth).
- **Hora 4:00 (Hito 2)**: Cambiar `VITE_API_URL` en `.env` al backend real y probar flujo completo end-to-end → **Merge a `dev`**.
- **Hora 5:00 (Hito 3)**: Solo bugfixes + deploy en **Vercel** apuntando `VITE_API_URL` a Render.
