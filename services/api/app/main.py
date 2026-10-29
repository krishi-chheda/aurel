import logging

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import assistant
from .config import get_settings
from .models import User
from .routers import admin, appointments, auth, care, health, me, notifications
from .schemas import AskIn, AskOut
from .security import current_user, rate_limit

log = logging.getLogger("aurel")
settings = get_settings()

app = FastAPI(title="Aurel API", version="0.1.0",
              description="Shared backend for the Aurel web and mobile clients. All data is synthetic.",
              docs_url=None if settings.is_production else "/docs")

app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
                   allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# One error envelope for every client: {"error": {"code", "message", ...}}
@app.exception_handler(StarletteHTTPException)
async def http_error(_: Request, exc: StarletteHTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"code": "http_error", "message": str(exc.detail)}
    return JSONResponse({"error": detail}, status_code=exc.status_code, headers=getattr(exc, "headers", None))


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    # Field paths and messages only - submitted values are never echoed back (they may be health data).
    fields = [{"field": ".".join(str(p) for p in e["loc"] if p not in ("body", "data")), "message": e["msg"]}
              for e in exc.errors()]
    return JSONResponse({"error": {"code": "validation_error", "message": "Some fields need attention.",
                                   "fields": fields}}, status_code=422)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"error": {"code": "server_error", "message": "Something went wrong on our side. Please try again."}},
                        status_code=500)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["Cache-Control"] = "no-store"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


for r in (auth.router, me.router, health.router, care.router, appointments.router, notifications.router, admin.router):
    app.include_router(r)


@app.post("/assistant/ask", response_model=AskOut, tags=["assistant"])
def ask(body: AskIn, user: User = Depends(current_user)):
    rate_limit(f"assistant:{user.id}", 30, 60)
    return assistant.answer(body.message)


@app.get("/healthz", tags=["ops"])
def healthz():
    return {"ok": True}
