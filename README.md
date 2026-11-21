# CampusRoute — Rutas Universitarias Accesibles

Hackathon de 6 horas, 3 personas en paralelo. Optimiza rutas dentro del campus considerando **movilidad reducida**, **incidencias** (ascensores o escaleras descompuestos) y **clima**, sobre un **mapa simulador 2.5D isométrico**.

## Stack
- **Contrato**: `docs/openapi.yaml` (OpenAPI 3.1)
- **Backend**: FastAPI + Supabase (Postgres + Auth) → Render (`render.yaml`)
- **Frontend**: Vite + React + TS + Tailwind + shadcn/ui + TanStack Query → Vercel (`frontend/vercel.json`)
- **Mock**: Prism desde `docs/openapi.yaml`

## Equipo
- **Persona A** (`feat/backend-a`): DB, Auth y `/health`, `/auth/*`, `/campus/*`, `/incidents/*`.
- **Persona B** (`feat/backend-b`): `/routes/calculate` (A*/Dijkstra) y `/external/weather` (Open-Meteo).
- **Persona C** (`feat/frontend-c`): toda la carpeta `frontend/` contra Prism.

Detalle por persona: [docs/TEAM_HANDOFF.md](docs/TEAM_HANDOFF.md)

## Arranque rápido
```bash
# Mock (Persona C)
npx -y @stoplight/prism-cli mock docs/openapi.yaml -p 4010

# Backend (A y B)
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend (C)
cd frontend && cp .env.example .env   # VITE_API_URL=http://localhost:4010
```

## Reglas
1. `docs/openapi.yaml` es el contrato; cualquier cambio se hace primero ahí, en `dev`, avisando al equipo.
2. Ramas: `feat/backend-[nombre]`, `feat/frontend-[nombre]`; integración en `dev`; demo final en `main`.
3. `backend/app/main.py` y `backend/app/core/errors.py` están congelados.
4. Hitos: hora 2 datos reales en algunos endpoints · hora 4 integración completa · hora 5 solo correcciones.
