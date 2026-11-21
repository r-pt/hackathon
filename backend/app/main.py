"""FastAPI entrypoint (frozen in Fase 0 to avoid Git merge conflicts).

Persona A owns: routers/{health,auth,campus,incidents}.py
Persona B owns: routers/{routes,external}.py
"""

import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.errors import APIError
from app.routers import auth, campus, external, health, incidents, routes

app = FastAPI(
    title="CampusRoute API",
    version="1.0.0",
    description="Optimizador de rutas universitarias accesibles (contrato en docs/openapi.yaml).",
)

raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173")
allowed_origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(APIError)
async def handle_api_error(_request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_dict())


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Los datos enviados no cumplen con el contrato de la API.",
                "details": {"fields": exc.errors()},
            }
        },
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(_request: Request, _exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "Ocurrió un error interno inesperado en el servidor.",
            }
        },
    )


# Persona A routers
app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(auth.router, prefix="/api/v1", tags=["Auth"])
app.include_router(campus.router, prefix="/api/v1", tags=["Campus"])
app.include_router(incidents.router, prefix="/api/v1", tags=["Incidents"])

# Persona B routers
app.include_router(routes.router, prefix="/api/v1", tags=["Routes"])
app.include_router(external.router, prefix="/api/v1", tags=["External"])
