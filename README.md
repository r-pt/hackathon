# CampusRoute — Navegación Universitaria Accesible 3D & GPS en Tiempo Real (UTFSM Casa Central)

Aplicación web de navegación accesible dentro de **UTFSM Casa Central (Valparaíso)** que calcula rutas óptimas paso a paso considerando **movilidad reducida**, **incidencias activas en tiempo real** (ascensores, rampas, escaleras o pasillos bloqueados), **condiciones climáticas** (lluvia y rutas techadas) y **seguimiento GPS en vivo** sobre un **mapa interactivo 3D isométrico y cenital**.

**Equipo: "Los Larpers"**
- **Américo Acuña**
- **Rodolfo Palma**
- **Jorge Valdés**

Repositorio oficial: [https://github.com/r-pt/hackathon](https://github.com/r-pt/hackathon)

---

## Deploy en Producción

| Servicio | URL | Notas |
| --- | --- | --- |
| **Frontend (Vercel)** | [https://campusroute-frontend.vercel.app](https://campusroute-frontend.vercel.app) | SPA React + Vite con mapa 3D/cenital, GPS en vivo y motor de respaldo offline |
| **Backend API (Vercel Serverless / Render)** | [https://campusroute-api.vercel.app](https://campusroute-api.vercel.app) | Endpoints REST bajo `/api/v1/*` |
| **Documentación Swagger / OpenAPI** | [https://campusroute-api.vercel.app/docs](https://campusroute-api.vercel.app/docs) | Especificación interactiva basada en `docs/openapi.yaml` |

---

## El Problema Planteado

Orientarse en un campus universitario multinivel y con arquitectura compleja como **UTFSM Casa Central** presenta barreras cotidianas críticas, especialmente para estudiantes, docentes y visitantes con **movilidad reducida**:

- **Desniveles y escaleras no señalizadas en mapas planos**: los mapas estáticos 2D no distinguen claramente qué conexiones son rampas accesibles, ascensores o escaleras ni cómo se conectan los pisos superiores e inferiores.
- **Incidencias sin aviso en tiempo real**: cuando un ascensor entra en mantenimiento, una rampa queda obstruida o un pasillo se cierra, las personas se enteran recién al llegar al punto bloqueado y deben retroceder largos tramos.
- **Clima adverso en tramos descubiertos**: en días de lluvia, elegir un trayecto exterior sin techo puede volver inseguro o incómodo el desplazamiento, mientras existen corredores cubiertos alternativos.
- **Mapas difíciles de interpretar**: la falta de contexto espacial 3D, edificios diferenciados y guía paso a paso dificulta saber dónde está uno y qué dirección tomar al cambiar de edificio o nivel.

---

## Cómo lo Buscamos Solucionar

CampusRoute integra un grafo espacial multicapa del campus con ruteo inteligente, visualización interactiva y reportes comunitarios:

1. **Motor de Ruteo Accesible Multi-Criterio (`A*` / `Dijkstra`)**
   - **Modo Movilidad Reducida**: descarta automáticamente escaleras y tramos no accesibles (`is_accessible = false`), priorizando rampas y ascensores operativos y verificando accesibilidad sin escalones.
   - **Evasión Dinámica de Incidencias**: excluye nodos y aristas con incidencias activas de severidad `blocking`, penaliza incidencias de tipo `warning` (`×1.8`) e informa qué conflictos fueron evitados (`avoided_conflicts`) o cuáles impiden llegar (`422 NO_ACCESSIBLE_ROUTE` con `blocking_incident_ids`).
   - **Protección ante Lluvia**: consulta el clima en vivo vía **Open-Meteo** (y permite activar **Simular lluvia** o **Preferir tramos cubiertos**), aplicando penalización (`×2.5`) sobre caminos descubiertos (`is_covered = false`) para privilegiar pasillos techados.
   - **Transparencia algorítmica**: compara heurística 3D euclidiana (`A*`, con elevación `z` ponderada) frente a `Dijkstra`, exponiendo distancia, tiempo estimado, peso total y nodos explorados.

2. **Mapa Interactivo 3D Isométrico + Vista Cenital (UTFSM Casa Central)**
   - **6 edificios delimitados por color (`A, B, C, F, M, P`)** con volúmenes 3D, placas de señalética superiores y separación vertical clara entre **Piso 1** y **Piso 2** (más vista individual por piso).
   - **Rotación interactiva `0° / 90° / 180° / 270°`** con contra-rotación automática de etiquetas, placas y pines para mantener siempre legible el texto, además de alternancia entre vista **3D Isométrica** y **Vista Cenital**.
   - **Capas visuales accesibles (no solo color)**: pasillos techados con halo/cobertura diferenciada, conectores verticales visibles para ascensores y escaleras, indicador de **Persona con radar** para la ubicación actual (Origen `A` / GPS) y **Banderín** para el destino (`B`), junto con navegación completa por teclado y respeto a `prefers-reduced-motion`.

3. **Modo GPS en Tiempo Real y Simulador de Recorrido**
   - Integración directa con `navigator.geolocation.watchPosition` georreferenciado al plano de UTFSM Casa Central para actualizar la posición en vivo sobre el grafo del campus.
   - **Simulador integrado paso a paso y auto-recorrido** que permite demostrar y probar el desplazamiento en tiempo real incluso en interiores o fuera del campus.

4. **Reporte Comunitario de Incidencias + Respaldo Offline**
   - Modal accesible (`<dialog>` nativo) para listar incidencias activas, marcarlas como resueltas (`PATCH /api/v1/incidents/{id}`) o reportar nuevos bloqueos en nodos o tramos (`POST /api/v1/incidents`), recalculando mapa y rutas al instante.
   - **Motor de respaldo offline en navegador (`frontend/src/api/fallback.ts`)** y almacén local en memoria en backend (`backend/app/db/local_store.py`), garantizando funcionamiento interactivo completo incluso si la API remota o Supabase no están disponibles.

---

## Herramientas Utilizadas

### IA y Flujo Agéntico
- **Google Antigravity** (orquestación Swarm Multi-Agente para desarrollo paralelo de backend, mapa 3D, paneles y verificación).
- Skills y guías aplicadas: `frontend-design`, `modern-web-guidance` (accesibilidad WCAG, `<dialog>` nativo, formularios y `prefers-reduced-motion`) y `ponytail-audit`.

### Frontend
- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **TanStack React Query v5** (`@tanstack/react-query`) para caché, sincronización e invalidación automática de mapa, incidencias y rutas
- **Motor SVG 3D isométrico propio** e iconografía SVG inline accesible (sin dependencias pesadas de mapas ni WebGL)
- **Web Geolocation API** (`navigator.geolocation.watchPosition`)

### Backend
- **Python 3.12** + **FastAPI** + **Pydantic v2** (`pydantic-settings`)
- **Uvicorn** (servidor ASGI)
- **`httpx`** (cliente HTTP asíncrono para Open-Meteo) y **`PyJWT`** (validación de tokens JWT)

### Base de Datos y Autenticación
- **Supabase** (PostgreSQL + Supabase Auth JWT + Row Level Security en `backend/db/schema.sql` y `backend/db/seed.sql`)
- **`local_store.py`**: almacén local thread-safe en memoria cuando Supabase no está configurado

### APIs y Contratos
- **Open-Meteo API** (clima en tiempo real con caché y fallback automático)
- **OpenAPI 3.1** (`docs/openapi.yaml`) como fuente única de verdad del contrato entre frontend y backend
- **Stoplight Prism** (`@stoplight/prism-cli`) para mock server en desarrollo paralelo

### Testing y Verificación
- **Pytest** (suite de pruebas de ruteo accesible, incidencias, clima e integración en `backend/tests/`)
- **TypeScript (`tsc --noEmit`)** y **Vite Production Build (`npm run build`)**

---

## Estructura del Proyecto

```text
.
├── backend/
│   ├── app/
│   │   ├── core/          # Configuración, autenticación JWT y manejo uniforme de errores
│   │   ├── db/            # Cliente Supabase y respaldo local_store.py
│   │   ├── routers/       # Endpoints /health, /auth, /campus, /incidents, /routes, /external
│   │   ├── schemas/       # Modelos Pydantic v2 alineados con OpenAPI 3.1
│   │   ├── services/      # Motor A*/Dijkstra, generador de indicaciones, clima Open-Meteo
│   │   └── main.py        # Aplicación FastAPI y configuración CORS
│   ├── db/
│   │   ├── schema.sql     # Tablas PostgreSQL + políticas RLS (Supabase)
│   │   └── seed.sql       # Datos iniciales del campus UTFSM Casa Central
│   ├── tests/             # Suite Pytest (ruteo, incidencias, contratos)
│   ├── .env.example
│   └── requirements.txt
├── docs/
│   ├── openapi.yaml       # Contrato OpenAPI 3.1
│   └── TEAM_HANDOFF.md
├── frontend/
│   ├── src/
│   │   ├── api/           # Tipos OpenAPI, cliente fetch, hooks TanStack Query y fallback.ts
│   │   ├── components/    # CampusMap3D, RouteControls, RouteDirections, IncidentModal, AuthModal
│   │   ├── App.tsx        # Layout principal, estado GPS y sincronización de vistas
│   │   └── index.css
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
└── render.yaml            # Configuración opcional de deploy backend en Render
```

---

## Inicialización e Instalación Local (Paso a Paso)

### Requisitos Previos
- **Git**
- **Python 3.12+** (con `venv` y `pip`)
- **Node.js 20+** y **npm**

### 1. Clonar el Repositorio

```bash
git clone https://github.com/r-pt/hackathon.git
cd hackathon
```

### 2. Configurar e Iniciar el Backend (`backend/`)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # En Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
```

> **Nota:** Si no ingresas credenciales reales de Supabase en `backend/.env`, el backend arranca automáticamente usando el almacén local en memoria (`local_store.py`) con el grafo completo de UTFSM Casa Central y soporte para el token de demostración.

Levantar el servidor FastAPI en desarrollo:

```bash
uvicorn app.main:app --reload --port 8000
```

La API quedará disponible en `http://localhost:8000` y su documentación interactiva Swagger en `http://localhost:8000/docs`.

Ejecutar la suite de pruebas del backend:

```bash
pytest -v
```

### 3. Configurar e Iniciar el Frontend (`frontend/`)

En una nueva terminal desde la raíz del proyecto:

```bash
cd frontend
npm install
cp .env.example .env
```

Verifica que `frontend/.env` apunte al backend local:

```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Iniciar el servidor de desarrollo:

```bash
npm run dev
```

Abre la URL local indicada por Vite (por defecto `http://localhost:5173`).

Generar el build de producción (incluye chequeo estricto de TypeScript):

```bash
npm run build
```

### 4. (Opcional) Mock Server con Stoplight Prism

Si deseas probar el frontend exclusivamente contra el contrato OpenAPI sin levantar Python:

```bash
npx -y @stoplight/prism-cli mock docs/openapi.yaml -p 4010
```

Y configura `VITE_API_URL=http://localhost:4010` en `frontend/.env`.

### 5. (Opcional) Configuración de Supabase (Base de Datos y Auth Real)

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. Abre el **SQL Editor** en tu proyecto y ejecuta primero `backend/db/schema.sql` (crea las tablas `profiles`, `buildings`, `nodes`, `edges`, `incidents` y sus políticas RLS).
3. Luego ejecuta `backend/db/seed.sql` para cargar los edificios, nodos, aristas y la incidencia inicial del campus.
4. Copia `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_JWT_SECRET` en `backend/.env`, y `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` en `frontend/.env`.
