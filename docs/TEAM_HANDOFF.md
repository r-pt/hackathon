# Handoff por persona

Empieza siempre desde `dev`: `git checkout dev && git pull`, y crea tu rama.

## Persona A — DB, Auth y Funcionalidad 1 (`feat/backend-a`)
**Endpoints**: `GET /health`, `GET /auth/me`, `PATCH /auth/preferences`, `GET /campus/map`, `GET /campus/locations`, `GET|POST /incidents`, `PATCH /incidents/{id}`.

**Archivos (exclusivos)**:
- `backend/db/schema.sql` (tablas `profiles`, `buildings`, `nodes`, `edges`, `incidents`), `backend/db/seed.sql` (usa el grafo de ejemplo de `docs/openapi.yaml`: 15 nodos con x,y,z, 16 aristas con `base_weight`, 1 incidencia activa en `n-ascensor-a-p1`)
- `backend/app/core/config.py`, `core/auth.py`, `db/supabase.py`
- `backend/app/schemas/{auth,campus,incidents}.py`, `services/{campus_service,incidents_service}.py`
- `backend/app/routers/{health,auth,campus,incidents}.py`

**Horas**: 1:15 schema+seed en Supabase · 1:45 cliente, JWT y health · **2:00 `/campus/map` y `/locations` → merge a `dev`** · 2:45 auth · 3:30 incidencias · **4:00 deploy en Render** · 5:00 solo bugs + usuario demo.

## Persona B — Motor de rutas e integración externa (`feat/backend-b`)
**Endpoints**: `POST /routes/calculate`, `GET /external/weather`.

**Reglas del grafo**:
1. Excluir aristas/nodos con incidencia `active` + `blocking` y los `simulated_blocked_*`. Con `reduced_mobility=true`, excluir `stairs` y `is_accessible=false`.
2. Peso = `distance_m * base_weight`; incidencia `warning` ×1.8; lluvia (`simulate_rain`, `prefer_covered` o Open-Meteo `rain_alert`) sobre `is_covered=false` ×2.5.
3. `astar`: heurística euclidiana con z ponderado ×3; `dijkstra`: heurística 0. Reportar `nodes_explored`.
4. Errores con `APIError`: 400 mismo origen/destino · 404 nodo inexistente · 422 `NO_ACCESSIBLE_ROUTE` (con `details.blocking_incident_ids`) · 422 `ROUTE_NOT_FOUND`.

**Archivos (exclusivos)**:
- `backend/app/schemas/{routes,external}.py`
- `backend/app/services/{routing_engine,directions_builder,weather_service}.py`
- `backend/app/routers/{routes,external}.py`, `backend/tests/test_routing.py`

**Horas**: 1:15 schemas + fixture local del grafo · **2:00 motor + tests** · 2:45 conectar a Supabase (tras el merge de A) · 3:30 Open-Meteo con caché y fallback · **4:00 pytest verde + merge** · 5:00 solo bugs.

## Persona C — Frontend (`feat/frontend-c`)
Todo dentro de `frontend/` (`vercel.json` y `.env.example` ya existen). Mock: `npx -y @stoplight/prism-cli mock docs/openapi.yaml -p 4010`.

**Mapa 2.5D** (proyección isométrica): `isoX = (x - y) * 0.72 + offsetX`, `isoY = (x + y) * 0.36 - z * 28 + offsetY`. Vistas: apilada, piso 1, piso 2. Dibujar edificios (`buildings`), aristas por tipo, ruta animada, marcadores A/B e incidencias activas. Cuidar accesibilidad (teclado, foco, contraste).

**Archivos**: `frontend/src/api.ts`, `components/{CampusMap3D,Modals}.tsx`, `App.tsx`, `route-logic.test.ts`.

**Horas**: 1:15 proyecto + Prism · 1:45 tipos y hooks · 2:30 mapa · 3:15 controles y direcciones (incluye error 422) · 3:50 modales · **4:00 cambiar `VITE_API_URL` al backend real** · 5:00 solo bugs + deploy en Vercel.
