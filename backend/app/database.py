from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.models import BusinessBase, TelemetryBase


def _create_engine(database_url: str):
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, connect_args=connect_args)

    if database_url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def enable_sqlite_foreign_keys(connection, _):
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


business_engine = _create_engine(settings.business_database_url)
telemetry_engine = _create_engine(settings.telemetry_database_url)

BusinessSession = sessionmaker(bind=business_engine, autoflush=False, expire_on_commit=False)
TelemetrySession = sessionmaker(bind=telemetry_engine, autoflush=False, expire_on_commit=False)


def get_business_db() -> Generator[Session, None, None]:
    with BusinessSession() as session:
        yield session


def get_telemetry_db() -> Generator[Session, None, None]:
    with TelemetrySession() as session:
        yield session


def create_database_tables() -> None:
    BusinessBase.metadata.create_all(bind=business_engine)
    TelemetryBase.metadata.create_all(bind=telemetry_engine)
