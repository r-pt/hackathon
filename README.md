# RutaCampus — Navegación Universitaria Accesible 3D & GPS en Tiempo Real (UTFSM Casa Central)

Aplicación web que ayuda a estudiantes a orientarse y desplazarse dentro de **UTFSM Casa Central (Valparaíso)**. Calcula rutas paso a paso que consideran **movilidad reducida**, **incidencias activas en tiempo real** (ascensores, rampas, escaleras o pasillos bloqueados), **condiciones climáticas** (lluvia y rutas techadas) y **seguimiento GPS en vivo** sobre un **mapa interactivo 3D isométrico y cenital**.

**Equipo: "Los Larpers"**

- **Américo Acuña**
- **Rodolfo Palma**
- **Jorge Valdés**

**Repositorio oficial:** [https://github.com/r-pt/hackathon-lyoss-2026](https://github.com/r-pt/hackathon-lyoss-2026)

---

## Deploy en Producción

| Servicio | URL | Notas |
|---|---|---|
| **Frontend (Vercel)** | [https://campusroute-frontend.vercel.app](https://campusroute-frontend.vercel.app) | SPA React + Vite con mapa 3D/cenital, GPS en vivo y motor de respaldo offline |
| **Backend API (Vercel Serverless / Render)** | [https://campusroute-api.vercel.app](https://campusroute-api.vercel.app) | Endpoints REST bajo `/api/v1/*` |
| **Documentación Swagger / OpenAPI** | [https://campusroute-api.vercel.app/docs](https://campusroute-api.vercel.app/docs) | Especificación interactiva basada en `docs/openapi.yaml` |

---

> **Nota / Disclaimer sobre el Mapa (Prototipo Demostrativo):** El mapa 3D/cenital es un **prototipo funcional inspirado en UTFSM Casa Central**. **No refleja con exactitud arquitectónica ni geográfica los edificios reales de la universidad.** Su propósito es demostrar el problema que buscamos resolver: ruteo accesible, evasión de incidencias en vivo, protección ante lluvia, guiado GPS/voz y evacuación segura.

---

## El Problema Planteado

Dentro de un campus universitario, los estudiantes necesitan desplazarse constantemente entre edificios, salas, laboratorios y bibliotecas. Esa tarea no es igual de sencilla para todos. Las barreras de orientación y desplazamiento dependen de la distribución de los espacios, las condiciones de los recorridos, la accesibilidad de la infraestructura y la claridad de la información disponible.

Identificamos la siguiente dificultad concreta:

> **Un estudiante con movilidad reducida no puede saber, antes de salir, si una ruta entre dos espacios del campus es accesible en ese momento.** Los mapas planos no distinguen rampas, ascensores y escaleras, y las incidencias (un ascensor en mantenimiento, una rampa obstruida, un pasillo cerrado) no se informan antes de llegar al punto bloqueado.

Esta dificultad se manifiesta en cuatro situaciones:

- **Desniveles y escaleras no señalizadas en mapas planos:** los mapas 2D no muestran qué conexiones son rampas, ascensores o escaleras, ni cómo se conectan los pisos.
- **Incidencias sin aviso:** cuando un ascensor se detiene o un pasillo se cierra, el estudiante se entera al llegar y debe retroceder.
- **Lluvia en tramos descubiertos:** en días de lluvia, un trayecto exterior sin techo puede ser incómodo o inseguro, aunque existan corredores cubiertos alternativos.
- **Orientación en edificios de varios niveles:** sin contexto espacial 3D ni guía paso a paso, cuesta saber dónde se está y qué dirección tomar al cambiar de edificio o de piso.

**Estudiantes beneficiados:** principalmente estudiantes con movilidad reducida. Como la app también guía a cualquier persona en edificios de varios niveles, otros estudiantes que se desplazan por el campus pueden beneficiarse, por ejemplo quienes llegan por primera vez.

**Aspecto que mejora:** la **disponibilidad y claridad de la información** para orientarse, y la **accesibilidad de los recorridos** al momento de elegirlos.

---

## Objetivos de Desarrollo Sostenible (ODS)

RutaCampus se vincula con los siguientes ODS de la Agenda 2030 de Naciones Unidas:

- **ODS 10 — Reducción de las desigualdades:** el modo movilidad reducida y las rutas sin escaleras buscan que todas las personas puedan orientarse y desplazarse en el campus en igualdad de condiciones.
- **ODS 11 — Ciudades y comunidades sostenibles:** en particular, la meta 11.2 (sistemas de transporte accesibles para todos) y la meta 11.7 (espacios públicos accesibles e inclusivos). La app mejora el desplazamiento interno del campus, evita tramos bloqueados y prioriza recorridos cubiertos ante la lluvia.

**Usuarios y beneficiarios:** estudiantes de UTFSM Casa Central, con foco en quienes tienen movilidad reducida y en quienes necesitan orientarse en edificios de varios niveles.

**Impacto esperado:** reducir el tiempo perdido por incidencias no informadas, evitar desplazamientos inaccesibles y aumentar la autonomía de estudiantes con movilidad reducida dentro del campus.

---

## Supuestos y Limitaciones

Esta sección declara los supuestos del prototipo, como permite el enunciado de la Hackathon LYOSS USM 2026.

**Supuestos:**

- **Mapa y grafo:** el plano de UTFSM Casa Central es una **aproximación**. Los edificios, nodos (20) y tramos (30) representan el campus de forma simplificada, no un levantamiento oficial.
- **Datos de accesibilidad:** la información de ascensores, rampas, escaleras y cobertura de techos proviene de **datos de ejemplo** cargados en `backend/db/seed.sql` y en el almacén local. **[confirmar: si estos datos fueron verificados en terreno o son supuestos]**.
- **Incidencias:** en la demo, las incidencias se reportan manualmente desde la app. **No existe integración con los sistemas de mantención de la universidad.**
- **Clima:** la lluvia se consulta en vivo a Open-Meteo. La opción **Simular lluvia** permite forzar ese escenario para la demo.
- **Usuarios:** **[confirmar: si hubo pruebas con estudiantes con movilidad reducida o si la validación fue solo técnica]**.

**Limitaciones:**

- **GPS:** la ubicación en vivo requiere permiso del navegador. En interiores, su precisión es limitada, por eso existe el simulador de recorrido.
- **Voz:** la narración usa la Web Speech API. Su calidad y disponibilidad dependen del navegador y de las voces instaladas en el dispositivo.
- **Autenticación:** la demo usa una sesión de prueba. **No valida identidad institucional** ni verifica que el usuario sea estudiante de la USM.
- **Alcance:** la app **no reemplaza la señalética oficial, ni los planos ni una evaluación formal de accesibilidad** del campus.
- **Datos personales:** la app usa la ubicación del dispositivo solo para mostrar la posición en el mapa. **[confirmar: política de tratamiento si la app se usa fuera de la demo]**.

---

## Cómo lo Buscamos Solucionar

CampusRoute integra un grafo espacial multicapa del campus con ruteo inteligente, visualización interactiva y reportes de incidencias:

1. **Motor de Ruteo Accesible Multi-Criterio (`A*` / `Dijkstra`) con Penalizaciones de Escaleras y Elevación**

   - **Modo Movilidad Reducida**: descarta automáticamente escaleras y tramos no accesibles (`is_accessible = false`), priorizando rampas y ascensores operativos y verificando accesibilidad sin escalones.
   - **Penalizaciones Reales de Escaleras y Pendiente**: las variables de entorno `ENABLE_FLOOR_STAIRS`, `ENABLE_ELEVATION_STAIRS`, `STAIR_STEP_PENALTY_SECONDS` (`0.7 s/peldaño`) y `ELEVATION_SLOPE_PENALTY_FACTOR` (`1.5`) afectan el filtrado de tramos, el peso del grafo y el tiempo estimado de viaje, tanto en el backend FastAPI como en el respaldo offline `fallback.ts`.
   - **Evasión Dinámica de Incidencias**: excluye nodos y aristas con incidencias activas de severidad `blocking`, penaliza incidencias de tipo `warning` (`×1.8`) e informa qué conflictos fueron evitados (`avoided_conflicts`) o cuáles impiden llegar (`422 NO_ACCESSIBLE_ROUTE` con `blocking_incident_ids`).
   - **Protección ante Lluvia**: consulta el clima en vivo vía **Open-Meteo** (o permite activar **Simular lluvia** o **Preferir tramos cubiertos**), aplicando penalización (`×2.5`) sobre caminos descubiertos (`is_covered = false`) para privilegiar pasillos techados.
   - **Selectores agrupados por edificio y modal completo de recorrido**: los selectores de origen y destino agrupan los destinos por edificio/zona, y el modal **`📋 Ver todos los pasos del recorrido`** presenta el itinerario completo con narración por voz.

2. **Mapa Interactivo 3D Isométrico + Vista Cenital a Ancho Completo (`~78vh`) con Zoom/Paneo Vectorial (UTFSM Casa Central, `2200×1450`)**

   - **Layout Mapa-Primero (`~78vh`) + Zoom y Paneo Vectorial SVG (`60%–350%`)**: el mapa 3D ocupa todo el ancho superior, con controles `+` / `−` / `⟲ Restablecer`, zoom con rueda del mouse y paneo libre hasta los bordes, seguido por una grilla inferior de 3 columnas (controles, indicaciones y números de emergencia).
   - **6 Variantes Arquitectónicas 3D (`🏠 Techos 3D`)**, ordenadas de sur a norte según el eje del campus:
     - **Edificio A — Frontis y Aula Magna (`bld-a`)**: planta en "U" de 8 vértices orientada hacia Av. España, con una torre central elevada con chapitel piramidal y esfera luminosa.
     - **Edificio B — Claustro y Biblioteca (`bld-b`)**: planta tipo claustro con patio interior hundido y techo perimetral en anillo.
     - **Edificio C — Química y Laboratorios (`bld-c`)**: planta en "L" con cubierta a cuatro aguas frente a Av. Placeres.
     - **Edificio F — Informática (DI) (`bld-f`)**: doble nave en "H" con techo en diente de sierra, entre jardines sur-oriente.
     - **Edificio M — Mecánica y Talleres (`bld-m`)**: pabellón escalonado en "T" con cubierta cruzada translúcida, junto a la cancha.
     - **Edificio P — Gimnasio y Federación (`bld-p`)**: pabellón octogonal achaflanado con cubierta facetada de 8 faldones, en el extremo norte.
     - Todos los techos incorporan **tragaluces translúcidos** y permiten ver y hacer clic en los nodos interiores (`Piso 1` y `Piso 2`).
   - **Calles Ortogonales, Textura de Piso 3D y Podios de Inicio/Llegada (`20` nodos, `30` tramos, `17` destinos)**:
     - **Red vial ortogonal (`2200×1450`)** con calzadas de esquinas a 90°, aceras, pasos de cebra en cada esquina y cuatro plazoletas pavimentadas (*Explanada Monumental Av. España*, *Plaza Central del Claustro*, *Paseo Poniente — Mirador Cancha* y *Crucero Pavimentado Av. Placeres*).
     - **Textura de losa 3D y áreas verdes**: retícula de adoquines (`140 px`) con marcas de losa (`280 px`) y cuatro parterres ajardinados con árboles 3D.
     - **Podios 3D luminosos de Inicio y Llegada**: balizas con haz de luz vertical y carteles flotantes **`📍 PUNTO DE INICIO`** y **`🏁 META · LLEGADA`**.
     - **4 destinos en Piso 2** (`Sala A-201 — Frontis Sur`, `Biblioteca Central — Sala B-202`, `Ascensor Nivel 2 — Frontis` y `Ascensor Nivel 2 — Biblioteca`), unidos al Piso 1 por ascensores verticales 3D (`🛗 ASCENSOR 1↔2`), escaleras interiores en zigzag (`🪜 ESCALERA P1↔P2`) y escalinatas exteriores de elevación (`🪜 Δz`).
     - **2 Salidas señalizadas (`🚪 SALIDA`)**: *Salida Norte — Av. Placeres* y *Salida Oriente — Portón Av. España*, junto al *Acceso Principal Av. España*.
   - **Orientación Espacial 3D**: separación vertical entre Piso 1 y Piso 2 (`ISO_FLOOR_STEP = 420`), rotación `0° / 90° / 180° / 270°` con etiquetas que siempre quedan legibles, vista 3D Isométrica / Cenital y una **Estrella Polar 3D interactiva (`CompassRose`)** con referencias cardinales en los bordes (`N · Av. Placeres`, `S · Av. España`, `O · Mecánica / Cancha`, `E · Informática / Jardines`).

3. **Modo GPS en Tiempo Real, Instrucciones por Voz y Simulador de Recorrido**

   - **Síntesis de Voz en Español (`Web Speech API`)**: botón `🔊 Escuchar ruta` / `⏹ Detener voz` con resaltado del paso narrado, botón `🔊` en cada paso y toggle `🔈 Auto-voz` que anuncia cada giro, cambio de piso y llegada.
   - **GPS en vivo (`navigator.geolocation.watchPosition`)**: posición actual sobre el plano con ícono de persona y meta con banderín (`🏁 META · LLEGADA`).
   - **Simulador integrado de recorrido** para demostrar la navegación en tiempo real, incluso en interiores o fuera del campus.

4. **Actualización en Vivo de Caminos Disponibles al Reportar Incidencias + Respaldo Offline**

   - Modal accesible (`<dialog>` nativo) para listar, reportar o resolver incidencias en **nodos** (ascensores, aulas) y en **tramos pavimentados**. La demo inicia sesión automáticamente.
   - **Recálculo instantáneo**: al crear o resolver una incidencia, la app recalcula la ruta y el mapa 3D, marca con `⛔ CERRADO` los tramos bloqueados, muestra el desvío aplicado (también narrado si `Auto-voz` está activo) y actualiza el contador `🛣️ Caminos disponibles: X / 30`.
   - **Motor de respaldo offline en navegador (`frontend/src/api/fallback.ts`)**, sincronizado con `client.ts` y con el almacén local en memoria del backend (`backend/app/db/local_store.py`), que mantiene la continuidad ante caídas de red o si Supabase no está configurado.

5. **Modo Evacuación Inteligente (`🚨 Evacuar`), Números de Emergencia UTFSM y Compartir Ruta por QR**

   - **Modo Evacuación (`🚨 Evacuar`)**: evalúa en paralelo las 3 salidas seguras del campus, respeta incidencias bloqueantes y movilidad reducida, selecciona la salida más conveniente, la traza en el mapa y la anuncia por voz.
   - **Números de Emergencia UTFSM Casa Central (`EmergencyContacts.tsx`)**: tarjeta de acceso rápido con enlaces `tel:` a Central de Emergencias (`+56 32 265 4222`), Supervisor de Seguridad 24/7 (`+569 7877 1654`), Atención de Salud Sansanito (`+56 32 265 4639` / `+569 7334 4188`) y Prevencionista de Riesgos (`+569 6229 5110`).
   - **Compartir Ruta por Enlace + Código QR Offline (`ShareRouteModal.tsx`)**: genera un QR vectorial SVG con `qrcode` y un enlace con parámetros (`?from=&to=&rm=1&cov=1&rain=1&evac=1`) que restaura origen, destino y preferencias al abrirlo en otro teléfono.

6. **Modo Oscuro Global WCAG AA (`🌙 Modo Oscuro`) y Diseño CSS 3D Táctil**

   - Selector global `🌙 Modo Oscuro` / `☀️ Modo Claro`, persistido en `localStorage`, con contraste WCAG AA en paneles, selectores, modales y el mapa nocturno.
   - Superficies biseladas 3D (`.panel-3d`, `.card-3d`, `.btn-3d`, `.pill-3d`) con respeto automático a `prefers-reduced-motion`.

---

## Uso de Inteligencia Artificial

De acuerdo con las bases de la Hackathon LYOSS USM, declaramos las siguientes herramientas de IA utilizadas durante el desarrollo:

- **Google Antigravity:** orquestación multi-agente para desarrollo paralelo de backend, mapa 3D, paneles y verificación. 
- **Skills y guías aplicadas:** `frontend-design`, `modern-web-guidance` (accesibilidad WCAG, `<dialog>` nativo, formularios y `prefers-reduced-motion`) y `ponytail-audit`.
Todo el código generado con asistencia de IA fue revisado, probado y adaptado por el equipo antes de incorporarse a la solución. Los integrantes pueden explicar y modificar el funcionamiento de cualquier parte del sistema.

---

## Recursos Externos

- **Open-Meteo API:** clima en tiempo real para la lógica de lluvia y rutas cubiertas.
- **Supabase:** PostgreSQL, autenticación JWT y Row Level Security (opcional; hay almacén local de respaldo).
- **Web Speech API y Web Geolocation API:** APIs nativas del navegador.
- **Stoplight Prism:** mock server para desarrollo contra el contrato OpenAPI (opcional).
- **Librerías:** React, Vite, Tailwind CSS, TanStack React Query, `qrcode`, FastAPI, Pydantic, Uvicorn, httpx, PyJWT y Pytest.

---

## Estructura del Proyecto

```
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
│   │   └── seed.sql       # Datos de ejemplo del campus UTFSM Casa Central
│   ├── tests/             # Suite Pytest (ruteo, incidencias, contratos)
│   ├── .env.example
│   └── requirements.txt
├── docs/
│   ├── openapi.yaml       # Contrato OpenAPI 3.1
│   └── TEAM_HANDOFF.md
├── frontend/
│   ├── src/
│   │   ├── api/           # Tipos OpenAPI, cliente fetch, hooks TanStack Query y fallback.ts
│   │   ├── components/    # CampusMap3D, RouteControls, RouteDirections, IncidentModal, AuthModal, EmergencyContacts, ShareRouteModal
│   │   ├── App.tsx        # Layout principal, estado GPS, modo evacuación, deep-links QR y sincronización de vistas
│   │   └── index.css
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
├── render.yaml            # Configuración opcional de deploy backend en Render
├── LICENSE                # Licencia de código abierto [completar: MIT / Apache 2.0 / GPL v3]
└── README.md
```

---

## Licencia

Este proyecto se distribuye bajo la licencia [completar: MIT / Apache 2.0 / GPL v3]. Consulta el archivo [LICENSE](./LICENSE) para más detalles.

---

## Requisitos Previos

- **Git**
- **Python 3.12+** (con `venv` y `pip`)
- **Node.js 20+** y **npm**

---

## Inicialización e Instalación Local (Paso a Paso)

### 1. Clonar el Repositorio

```bash
git clone https://github.com/r-pt/hackathon-lyoss-2026.git
cd hackathon-lyoss-2026
```

### 2. Configurar e Iniciar el Backend (`backend/`)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # En Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
```

Verifica `backend/.env` (variables principales de clima, escaleras entre pisos y desniveles):

```
CAMPUS_LAT=-33.0344
CAMPUS_LON=-71.5950
ENABLE_FLOOR_STAIRS=true
ENABLE_ELEVATION_STAIRS=true
STAIR_STEP_PENALTY_SECONDS=0.7
ELEVATION_SLOPE_PENALTY_FACTOR=1.5
```

> **Nota:** si no ingresas credenciales reales de Supabase en `backend/.env`, el backend arranca con el almacén local en memoria (`local_store.py`), con el grafo completo del campus (20 nodos, 30 tramos) y el token de demostración.

Levantar el servidor FastAPI en desarrollo:

```bash
uvicorn app.main:app --reload --port 8000
```

La API quedará disponible en `http://localhost:8000` y su documentación Swagger en `http://localhost:8000/docs`.

Ejecutar la suite de pruebas del backend:

```bash
pytest -v
```

### 3. Configurar e Iniciar el Frontend (`frontend/`)

En una nueva terminal, desde la raíz del proyecto:

```bash
cd frontend
npm install
cp .env.example .env
```

Verifica que `frontend/.env` apunte al backend local:

```
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

Abre la URL que indique Vite (por defecto `http://localhost:5173`).

Generar el build de producción (incluye chequeo estricto de TypeScript):

```bash
npm run build
```

### 4. (Opcional) Mock Server con Stoplight Prism

Para probar el frontend contra el contrato OpenAPI sin levantar Python:

```bash
npx -y @stoplight/prism-cli mock docs/openapi.yaml -p 4010
```

Y configura `VITE_API_URL=http://localhost:4010` en `frontend/.env`.

### 5. (Opcional) Configuración de Supabase

1. Crea un proyecto en [Supabase](https://supabase.com/).
2. En el **SQL Editor**, ejecuta primero `backend/db/schema.sql` (tablas `profiles`, `buildings`, `nodes`, `edges`, `incidents` y sus políticas RLS).
3. Luego ejecuta `backend/db/seed.sql` para cargar edificios, nodos, aristas y la incidencia inicial.
4. Copia `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_JWT_SECRET` en `backend/.env`, y `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` en `frontend/.env`.

---

## Tecnologías

### IA y Flujo Agéntico

- **Google Antigravity** (orquestación multi-agente para desarrollo paralelo de backend, mapa 3D, paneles y verificación).

### Frontend

- **React 19** + **TypeScript** + **Vite 8**
- **Tailwind CSS v4** (`@tailwindcss/vite`)
- **TanStack React Query v5** para caché, sincronización e invalidación automática de mapa, incidencias y rutas
- **Motor SVG 3D isométrico propio** con polígonos extruidos, techos translúcidos, zoom/paneo vectorial (`75%–300%`) y soporte de tema claro/oscuro WCAG AA, sin dependencias WebGL
- **`qrcode`**: generación de QR en SVG, sin conexión, para compartir rutas por deep-link
- **Web Speech API** (`window.speechSynthesis`, `es-CL` / `es-ES`) para narrar la ruta
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

- **Pytest** (**43 tests** automatizados de ruteo accesible, penalizaciones de escaleras/elevación, incidencias, clima e integración en `backend/tests/`)
- **TypeScript (`tsc --noEmit`)** y **Vite Production Build (`npm run build`)**
