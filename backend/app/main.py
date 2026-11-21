"""Entrypoint FastAPI (congelado en Fase 0 para evitar conflictos de Git).

Persona A: routers health, auth, campus, incidents. Persona B: routers routes, external.
"""

import os

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.errors import APIError
from app.routers import auth, campus, external, health, incidents, routes

app = FastAPI(title="CampusRoute API", version="1.0.0")

raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:4173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in raw_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(APIError)
async def handle_api_error(_request: Request, exc: APIError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content=exc.to_dict())


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "Los datos enviados no cumplen con el contrato de la API.",
                "details": {"fields": jsonable_errors(exc)},
            }
        },
    )


def jsonable_errors(exc: RequestValidationError) -> list[dict]:
    return [{"loc": list(e["loc"]), "msg": e["msg"], "type": e["type"]} for e in exc.errors()]


app.include_router(health.router, prefix="/api/v1", tags=["Health"])
app.include_router(auth.router, prefix="/api/v1", tags=["Auth"])
app.include_router(campus.router, prefix="/api/v1", tags=["Campus"])
app.include_router(incidents.router, prefix="/api/v1", tags=["Incidents"])
app.include_router(routes.router, prefix="/api/v1", tags=["Routes"])
app.include_router(external.router, prefix="/api/v1", tags=["External"])
