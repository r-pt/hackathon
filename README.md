# CampusRoute — Optimizador de Rutas Universitarias Accesibles

Proyecto de hackathon (6 horas, 3 personas en paralelo) para optimizar desplazamientos dentro de un campus universitario considerando **movilidad reducida**, **incidencias en vivo** (ascensores o escaleras descompuestos) y **clima exterior**, visualizado en un **mapa simulador 2.5D isométrico**.

## Stack

- **Contrato único**: `docs/openapi.yaml` (OpenAPI 3.1)
- **Backend**: FastAPI (Python) + Supabase (Postgres + Auth) → Despliegue en **Render** (`render.yaml`)
- **Frontend**: Vite + React + TypeScript + Tailwind + shadcn/ui + TanStack Query → Despliegue en **Vercel** (`frontend/vercel.json`)
- **Mock API (Horas 0:45–4:00)**: Prism (`@stoplight/prism-cli`) desde `docs/openapi.yaml`

## División del Equipo

- **Persona A (Backend — `feat/backend-a`)**: Base de datos (`backend/db/schema.sql`, `seed.sql`), Supabase Auth JWT y Funcionalidad 1 (`/health`, `/auth/*`, `/campus/*`, `/incidents/*`).
- **Persona B (Backend — `feat/backend-b`)**: Funcionalidad 2 (motor de búsqueda en grafo ponderado `A*` / `Dijkstra` en `/routes/calculate`) e integración externa Open-Meteo (`/external/weather`).
- **Persona C (Frontend — `feat/frontend-c`)**: Mapa simulador 2.5D isométrico SVG, panel A→B con switch de movilidad reducida, pasos, conflictos y modal de incidencias contra Prism (`VITE_API_URL=http://localhost:4010`).

Consulta **[docs/TEAM_HANDOFF.md](docs/TEAM_HANDOFF.md)** para las instrucciones paso a paso de cada persona, propiedad exacta de archivos y checklist por hora.

## Arranque Rápido Local

### 1. Levantar Mock con Prism (Persona C, desde Hora 0:45)
```bash
npx -y @stoplight/prism-cli mock docs/openapi.yaml -p 4010
```

### 2. Levantar Backend FastAPI (Persona A y B)
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

### 3. Levantar Frontend (Persona C)
```bash
cd frontend
cp .env.example .env
# Hora 0:45–4:00: VITE_API_URL=http://localhost:4010 (Prism)
# Hora 4:00+:     VITE_API_URL=http://localhost:8000 (o URL de Render)
npm run dev
```

## Reglas de Integración y Git

1. **`docs/openapi.yaml` es el contrato**: cualquier cambio de ruta, campo o código de error se actualiza primero en `docs/openapi.yaml` en `dev` avisando al equipo.
2. **Ramas**: cada persona crea su rama desde `dev` (`feat/backend-a`, `feat/backend-b`, `feat/frontend-c`). Integración en `dev`, despliegue final desde `main`.
3. **Cero conflictos**: `backend/app/main.py` y `backend/app/core/errors.py` ya vienen congelados de Fase 0 con todos los routers montados. Cada persona trabaja solo en sus archivos asignados.
4. **Hitos**:
   - **Hora 2:00**: Persona A hace merge de DB + `/campus/map` a `dev`; Persona B tiene `A*`/`Dijkstra` funcionando con tests; Persona C renderiza el mapa 2.5D contra Prism.
   - **Hora 4:00**: Integración completa en `dev` + Frontend cambia `VITE_API_URL` al backend real.
   - **Hora 5:00**: Feature freeze — solo corrección de errores, despliegue y ensayo de demo.

---

## Backend — Módulo de Ruteo y Clima (Persona B / Jorge)

Esta parte del backend implementa el **motor de cálculo de rutas óptimas en grafo ponderado (`A*` / `Dijkstra`)** y la **integración de clima en vivo con Open-Meteo**, desacoplados de la base de datos para poder probarse de forma independiente y conectarse transparentemente a Supabase cuando esté disponible.

### Estructura de Archivos

| Archivo | Responsabilidad |
| --- | --- |
| `backend/app/routers/routes.py` | Endpoint `POST /api/v1/routes/calculate`. Carga el grafo desde Supabase (`app.db.supabase.get_supabase()`) con fallback automático al fixture local y consulta clima si `use_live_weather=true`. |
| `backend/app/routers/external.py` | Endpoint `GET /api/v1/external/weather`. Expone el estado climático actual del campus. |
| `backend/app/schemas/routes.py` | Contratos Pydantic para nodos, aristas, incidencias, `CalculateRouteRequest` y `CalculateRouteResponse` (alineados con `docs/openapi.yaml`). |
| `backend/app/schemas/external.py` | Contrato Pydantic `WeatherResponse` y enum `WeatherCondition`. |
| `backend/app/services/routing_engine.py` | Motor puro de búsqueda en grafo ponderado (`A*` y `Dijkstra`), filtros de accesibilidad, bloqueos, penalizaciones dinámicas y manejo de errores de contrato. |
| `backend/app/services/directions_builder.py` | Calcula métricas (`RouteMetrics`), genera pasos legibles en español con landmarks (`RouteStep`) y detecta conflictos evitados (`AvoidedConflict`). |
| `backend/app/services/weather_service.py` | Cliente asíncrono `httpx` contra Open-Meteo con caché en memoria (5 min), mapeo de códigos WMO y fallback silencioso ante fallas de red. |
| `backend/app/services/graph_fixture.py` | Grafo local de pruebas (espejo del ejemplo en `docs/openapi.yaml`: 15 nodos, 16 aristas, 1 incidencia activa) + preset de UTFSM Casa Central. |
| `backend/tests/test_routing.py` | Suite de 15 tests automatizados (motor, accesibilidad, clima, caché/fallback y contrato HTTP). |

### Cómo funciona `POST /api/v1/routes/calculate`

1. **Carga del grafo (`load_campus_graph`)**: intenta leer `nodes`, `edges` e `incidents` (`status='active'`) desde Supabase. Si Supabase no está configurado o aún no está disponible, usa automáticamente `get_sample_graph()` como respaldo sin romper la API.
2. **Bloqueos duros (exclusión de nodos/aristas)**:
   - Excluye nodos y aristas con incidencias activas de severidad `blocking` o incluidos en `simulated_blocked_node_ids` / `simulated_blocked_edge_ids`.
   - Si `reduced_mobility=true`, excluye todas las aristas con `edge_type='stairs'` o `is_accessible=false`.
3. **Pesos dinámicos por arista**:
   - Base: `peso = distance_m * base_weight`
   - Incidencia `warning` activa en la arista o sus extremos: `peso *= 1.8`
   - Evasión de lluvia activa (`prefer_covered=true`, `simulate_rain=true`, o alerta real de Open-Meteo con `use_live_weather=true`) en tramos no cubiertos (`is_covered=false`): `peso *= 2.5`
4. **Búsqueda (`A*` vs `Dijkstra`)**:
   - `astar`: utiliza heurística Euclidiana 3D admisible `sqrt((x1-x2)^2 + (y1-y2)^2 + ((z1-z2)*3)^2)` y reporta `nodes_explored`.
   - `dijkstra`: utiliza heurística `0` para comparar exploración vs `A*`.
5. **Métricas, pasos y conflictos evitados**:
   - Velocidad estimada según perfil (`1.35 m/s` estándar, `1.0 m/s` con movilidad reducida) más `25 s` de espera por tramo de ascensor.
   - Genera instrucciones paso a paso en español enriquecidas con `landmark` y compara contra la ruta ideal sin incidentes para listar `avoided_conflicts`.
6. **Errores de contrato (`APIError`)**:
   - `400 VALIDATION_ERROR`: origen y destino son el mismo nodo.
   - `404 NOT_FOUND`: el nodo de origen o destino no existe en el grafo.
   - `422 NO_ACCESSIBLE_ROUTE`: no existe ruta viable con `reduced_mobility=true` (incluye `details.blocking_incident_ids`).
   - `422 ROUTE_NOT_FOUND`: no existe camino entre origen y destino incluso sin restricción de movilidad.

### Cómo funciona `GET /api/v1/external/weather`

- Consulta en vivo la API de **Open-Meteo** para las coordenadas del campus (por defecto UTFSM Casa Central, Valparaíso: `-33.0344, -71.5950`, configurables con las variables de entorno `CAMPUS_LAT` y `CAMPUS_LON`).
- Mapea el código meteorológico WMO a `clear | cloudy | rain | storm | unknown` y activa `rain_alert=true` cuando hay lluvia/tormenta o precipitación.
- Mantiene un **caché en memoria de 5 minutos** (`300 s`) para evitar llamadas redundantes.
- Si Open-Meteo falla o excede el timeout, responde con un **fallback seguro** (`fallback_used=true`, `condition="unknown"`, `rain_alert=false`) para no interrumpir el cálculo de rutas.

### Ejecutar las Pruebas de Persona B

```bash
cd backend
PYTHONPATH=. pytest -v tests/test_routing.py
```

