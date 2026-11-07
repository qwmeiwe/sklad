from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.auth import hash_password
from app.config import settings
from app.database import BusinessSession, create_database_tables
from app.api import router as api_router
from app.models import User, UserRole
from app.websockets import router as websocket_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    create_database_tables()
    if settings.bootstrap_admin_username and settings.bootstrap_admin_password:
        with BusinessSession() as db:
            admin = db.scalar(
                select(User).where(User.username == settings.bootstrap_admin_username)
            )
            if admin is None:
                db.add(
                    User(
                        username=settings.bootstrap_admin_username,
                        password_hash=hash_password(settings.bootstrap_admin_password),
                        role=UserRole.ADMIN,
                    )
                )
                db.commit()
    elif settings.bootstrap_admin_username or settings.bootstrap_admin_password:
        raise RuntimeError(
            "Set both BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD, or neither."
        )
    yield


app = FastAPI(
    title="Smart Logistics API",
    version="0.1.0",
    description="REST API and WebSocket telemetry service for the smart logistics MVP.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router)
app.include_router(websocket_router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}
