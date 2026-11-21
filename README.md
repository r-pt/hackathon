# RutaCampus — Navegación Universitaria Accesible 3D & GPS en Tiempo Real (UTFSM Casa Central)

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

2. **Mapa Interactivo 3D Isométrico + Vista Cenital (Prototipo UTFSM Casa Central, `2200×1450`)**
   - **6 Variantes Arquitectónicas 3D No Rectangulares con Techos Translúcidos (`🏠 Techos 3D`)**:
     - **Edificio A (`bld-a`, Ingeniería / Frontis Gótico)**: planta en **"U"** de 8 vértices con explanada frontal hacia Av. España + **Torre Gótica del Reloj central** elevada con chapitel piramidal y esfera luminosa.
     - **Edificio B (`bld-b`, Biblioteca / Claustro)**: planta tipo **claustro con Patio Interior hundido** ajardinado y techo perimetral en anillo.
     - **Edificio C (`bld-c`, Ala Norte Av. Placeres)**: planta en **"L"** con cubierta compuesta a cuatro aguas.
     - **Edificio M (`bld-m`, Informática Poniente)**: pabellón escalonado en **"T"** con cubierta cruzada translúcida.
     - **Edificio F (`bld-f`, Sur-Oriente / Talleres)**: doble nave industrial en **"H"** con techo en **diente de sierra** (`sawtooth`).
     - **Edificio P (`bld-p`, Federación)**: pabellón **octagonal achaflanado** con cubierta facetada de 8 faldones.
     - Todos los techos 3D incorporan **tragaluces translúcidos** que permiten ver y hacer clic en los nodos interiores (`Piso 1` y `Piso 2`).
   - **Calles Ortogonales con Esquinas a 90°, Textura de Piso 3D y Podios de Inicio/Llegada (`20` nodos, `30` tramos, `17` destinos)**:
     - **Red vial 100% ortogonal (`2200×1450`)**: separación amplia entre los 6 edificios y trazado de calzadas con **esquinas a 90° (giros en L y Z sin diagonales arbitrarias)**, aceras y bordillos en tonos neutros, eje central segmentado y **pasos de cebra peatonales** en cada esquina, además de 4 plazoletas/cruces pavimentados (*Explanada Monumental Av. España*, *Plaza Central del Claustro*, *Paseo Pavimentado Poniente — Mirador Cancha* y *Crucero Pavimentado Terraza Placeres*).
     - **Textura de losa 3D y áreas verdes**: retícula proyectada de adoquines (`140 px`) con marcas de losa (`280 px`) y **4 parterres ajardinados con árboles 3D** sobre el Piso 1 tanto en vista isométrica como cenital.
     - **Podios 3D luminosos de Inicio y Llegada**: balizas multicapa con haz de luz vertical, iconos escalados y carteles flotantes 3D **`📍 PUNTO DE INICIO`** y **`🏁 META · LLEGADA`**.
     - **4 destinos en Piso 2** (`Aula A-201 — Ingeniería`, `Sala de Estudio B-202 — Biblioteca`, `Ascensor Edificio A Piso 2` y `Ascensor Edificio B Piso 2`) unidos al Piso 1 tanto por **ascensores verticales 3D** (`🛗 ASCENSOR 1↔2`) como por **escaleras interiores 3D en zigzag** (`🪜 ESCALERA P1↔P2`), además de escalinatas exteriores de elevación (`🪜 Δz`).
     - **2 nuevas Salidas señalizadas (`🚪 SALIDA`)**: *Salida Norte — Av. Placeres* y *Salida Oriente — Portón Av. España*, junto a los accesos principales.
   - **Orientación Espacial 3D**: separación vertical amplia entre **Piso 1** y **Piso 2** (`ISO_FLOOR_STEP = 420`), rotación interactiva `0° / 90° / 180° / 270°` con contra-rotación automática de etiquetas, vista **3D Isométrica / Cenital**, **Estrella Polar 3D interactiva (`CompassRose`)** con puntos cardinales reales y referencias en los bordes (`N · Av. Placeres`, `S · Av. España`, `O · Informática`, `E · Jardines / Ed. F`).

3. **Modo GPS en Tiempo Real, Instrucciones por Voz y Simulador de Recorrido**
   - **Síntesis de Voz en Español (`Web Speech API`)**: botón **`🔊 Escuchar ruta`** / **`⏹ Detener voz`** con resaltado automático del paso narrado, botón **`🔊`** individual en cada paso y toggle **`🔈 Auto-voz`** que anuncia cada giro, cambio de piso y llegada en modo GPS.
   - **GPS en vivo (`navigator.geolocation.watchPosition`)**: georreferenciado al plano de UTFSM Casa Central (`2200×1450`) con ícono de **Persona con radar** sobre podio luminoso para la ubicación actual (`📍 PUNTO DE INICIO`) y **Banderín** para la meta (`🏁 META · LLEGADA`).
   - **Simulador integrado paso a paso y auto-recorrido** que permite demostrar y probar el desplazamiento en tiempo real incluso en interiores o fuera del campus.

4. **Actualización en Vivo de Caminos Disponibles al Reportar Incidencias + Respaldo Offline**
   - Modal accesible (`<dialog>` nativo) con auto-activación de sesión demo (sin fricción de login) para listar, reportar o resolver incidencias tanto en **nodos** (ascensores, aulas) como en **tramos pavimentados**.
   - **Recálculo instantáneo y visibilidad de disponibilidad**: al crear o resolver una incidencia, la app recalcula de inmediato la ruta óptima y el mapa 3D, marca con franjas rojas **`⛔ CERRADO`** todo tramo bloqueado o conectado a un nodo bloqueado, muestra un aviso del desvío aplicado (también narrado por voz si `Auto-voz` está activo) y actualiza el contador en vivo **`🛣️ Caminos disponibles: X / 30`**.
   - **Motor de respaldo offline en navegador (`frontend/src/api/fallback.ts`)** sincronizado con `client.ts` y almacén local en memoria en backend (`backend/app/db/local_store.py`), garantizando continuidad ante caídas de red o sin Supabase.

5. **Modo Oscuro Global (`🌙 Modo Oscuro`) y Diseño CSS 3D Táctil**
   - Selector global **`🌙 Modo Oscuro` / `☀️ Modo Claro`** persistido en `localStorage`, que adapta tanto los paneles y modales como el motor 3D del mapa (losa nocturna `#0F172A`, calzadas oscuras, cuadrícula cian y edificios con ventanas iluminadas en `#FDE047`).
   - Superficies biseladas 3D (`.app-stage-bg`, `.panel-3d`, `.card-3d`, `.btn-3d`, `.pill-3d`) con luces especulares, sombras en capas y respeto automático a `prefers-reduced-motion`.

---

## Herramientas Utilizadas

### IA y Flujo Agéntico
- **Google Antigravity** (orquestación Swarm Multi-Agente para desarrollo paralelo de backend, mapa 3D, paneles y verificación).
- Skills y guías aplicadas: `frontend-design`, `modern-web-guidance` (accesibilidad WCAG, `<dialog>` nativo, formularios y `prefers-reduced-motion`) y `ponytail-audit`.

### Frontend
- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **TanStack React Query v5** (`@tanstack/react-query`) para caché, sincronización e invalidación automática de mapa, incidencias y rutas
- **Motor SVG 3D isométrico propio** con polígonos extruidos no rectangulares, techos 3D translúcidos y soporte Dual Theme (Claro / Oscuro) sin dependencias pesadas ni WebGL
- **Web Speech API** (`window.speechSynthesis` en `es-CL` / `es-ES`) para narración de ruta completa y por paso
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

Verifica `backend/.env` (variables de entorno principales, clima UTFSM y escaleras entre pisos/desniveles):

```env
CAMPUS_LAT=-33.0344
CAMPUS_LON=-71.5950
ENABLE_FLOOR_STAIRS=true
ENABLE_ELEVATION_STAIRS=true
STAIR_STEP_PENALTY_SECONDS=0.7
ELEVATION_SLOPE_PENALTY_FACTOR=1.5
```

> **Nota:** Si no ingresas credenciales reales de Supabase en `backend/.env`, el backend arranca automáticamente usando el almacén local en memoria (`local_store.py`) con el grafo completo de UTFSM Casa Central (20 nodos, 30 tramos) y soporte para el token de demostración.

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

Verifica que `frontend/.env` apunte al backend local y defina las variables de entorno de escaleras/elevaciones:

```env
VITE_API_URL=http://localhost:8000
VITE_ENABLE_FLOOR_STAIRS=true
VITE_ENABLE_ELEVATION_STAIRS=true
VITE_DEFAULT_AVOID_STAIRS=false

# Supabase Auth (solo login / reporte de incidencias)
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

---

## Registro de Cambios Recientes

- **Variantes arquitectónicas 3D + Red Vial Pavimentada (UTFSM Casa Central)**: formas 3D en `U` con Torre Gótica (`bld-a`), claustro con patio hundido (`bld-b`), `L` (`bld-c`), `T` escalonado (`bld-m`), doble nave en `H` con diente de sierra (`bld-f`) y octágono achaflanado (`bld-p`); 4 plazas/cruces pavimentados intermedios (`cc-explanada-espana`, `cc-patio-central`, `cc-paseo-poniente`, `cc-terraza-placeres`) y 10 tramos de calzada pavimentada (`cc-e21..cc-e30`).
- **Actualización en vivo de caminos por incidencias + Modo Oscuro**: recálculo instantáneo al reportar o resolver bloqueos, marcado visual `⛔ CERRADO` y contador `🛣️ Caminos disponibles: X / 30` en tiempo real, más selector global `🌙 Modo Oscuro` / `☀️ Modo Claro` con edificios nocturnos iluminados.
- **Voz paso a paso, Techos 3D, Piso 2 seleccionable y 2 Salidas**: narración en español (`Web Speech API`), techos a cuatro aguas con tragaluz translúcido (`🏠 Techos 3D`), sombra proyectada 3D en todos los caminos, 4 destinos seleccionables en Piso 2 con escaleras interiores 3D (`cc-e16`, `cc-e17`), 2 nuevas Salidas (`cc-salida-placeres`, `cc-salida-oriente`), variables de entorno para escaleras/elevaciones y diseño CSS 3D biselado.
- **Espaciado amplio `1600×1050` y Estrella Polar 3D**: separación horizontal y vertical (`ISO_FLOOR_STEP = 340`) entre edificios y niveles, rosa de los vientos náutica con Norte geométrico y referencias cardinales en los cuatro bordes del campus.
