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
