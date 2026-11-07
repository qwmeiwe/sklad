import asyncio
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.auth import decode_access_token
from app.config import settings
from app.database import BusinessSession, TelemetrySession
from app.models import GPSData, Order, SensorData, User, UserRole, utc_now
from app.schemas import GPSInput, SensorInput

logger = logging.getLogger(__name__)
router = APIRouter()


@dataclass(frozen=True)
class Subscriber:
    websocket: WebSocket
    role: UserRole
    user_id: int
    order_id: int | None = None


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[Subscriber] = set()
        self._lock = asyncio.Lock()

    async def connect(
        self, websocket: WebSocket, role: UserRole, user_id: int, order_id: int | None = None
    ) -> Subscriber:
        await websocket.accept()
        subscriber = Subscriber(
            websocket=websocket, role=role, user_id=user_id, order_id=order_id
        )
        async with self._lock:
            self._connections.add(subscriber)
        return subscriber

    async def disconnect(self, subscriber: Subscriber) -> None:
        async with self._lock:
            self._connections.discard(subscriber)

    async def broadcast_sensors(self, message: dict) -> None:
        async with self._lock:
            targets = [connection for connection in self._connections if connection.role == UserRole.ADMIN]
        await self._send(targets, message)

    async def broadcast_gps(
        self, message: dict, courier_id: int, client_id: int
    ) -> None:
        async with self._lock:
            targets = [
                connection
                for connection in self._connections
                if (
                    connection.role == UserRole.ADMIN
                    and (connection.order_id is None or connection.order_id == message["data"]["order_id"])
                )
                or (connection.role == UserRole.COURIER and connection.user_id == courier_id)
                or (
                    connection.role == UserRole.CLIENT
                    and connection.user_id == client_id
                    and connection.order_id == message["data"]["order_id"]
                )
            ]
        await self._send(targets, message)

    async def _send(self, targets: list[Subscriber], message: dict) -> None:
        results = await asyncio.gather(
            *(connection.websocket.send_json(message) for connection in targets),
            return_exceptions=True,
        )
        failed = [
            connection
            for connection, result in zip(targets, results)
            if isinstance(result, Exception)
        ]
        if failed:
            async with self._lock:
                self._connections.difference_update(failed)


manager = ConnectionManager()


def _user_from_token(token: str) -> User | None:
    user_id = decode_access_token(token)
    with BusinessSession() as db:
        user = db.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
        if user is None:
            return None
        db.expunge(user)
        return user


def _isoformat(timestamp: datetime) -> str:
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)
    return timestamp.isoformat()


@router.websocket("/ws/sensors")
async def sensor_stream(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token", "")
    if secrets.compare_digest(token, settings.iot_device_token):
        subscriber = None
    else:
        try:
            user = _user_from_token(token)
        except HTTPException:
            await websocket.close(code=1008, reason="Invalid authentication.")
            return
        if user is None or user.role != UserRole.ADMIN:
            await websocket.close(code=1008, reason="Sensor stream is not authorized.")
            return
        subscriber = await manager.connect(websocket, user.role, user.id)
        try:
            while True:
                await websocket.receive_text()
                await websocket.send_json(
                    {"type": "error", "detail": "Admin sensor connections are read-only."}
                )
        except WebSocketDisconnect:
            return
        finally:
            await manager.disconnect(subscriber)

    await websocket.accept()
    try:
        while True:
            raw_message = await websocket.receive_text()
            try:
                payload = SensorInput.model_validate_json(raw_message)
            except (ValidationError, ValueError) as error:
                await websocket.send_json({"type": "error", "detail": str(error)})
                continue

            timestamp = payload.timestamp or utc_now()
            try:
                with TelemetrySession() as db:
                    row = SensorData(
                        sensor_type=payload.sensor_type,
                        value=payload.value,
                        unit=payload.unit,
                        timestamp=timestamp,
                    )
                    db.add(row)
                    db.commit()
                    db.refresh(row)
                    event = {
                        "type": "sensor",
                        "data": {
                            "id": row.id,
                            "sensor_type": row.sensor_type,
                            "value": row.value,
                            "unit": row.unit,
                            "timestamp": _isoformat(row.timestamp),
                        },
                    }
            except SQLAlchemyError:
                logger.exception("Could not persist incoming sensor telemetry.")
                await websocket.send_json({"type": "error", "detail": "Could not save telemetry."})
                continue
            await manager.broadcast_sensors(event)
            await websocket.send_json({"type": "accepted", "timestamp": event["data"]["timestamp"]})
    except WebSocketDisconnect:
        return


@router.websocket("/ws/gps")
async def gps_stream(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token", "")
    try:
        courier = _user_from_token(token)
    except HTTPException:
        await websocket.close(code=1008, reason="Invalid authentication.")
        return
    order_id_text = websocket.query_params.get("order_id", "")
    if courier is None:
        await websocket.close(code=1008, reason="Authentication is required.")
        return
    order_id = None
    if order_id_text:
        try:
            order_id = int(order_id_text)
        except ValueError:
            await websocket.close(code=1008, reason="A valid order_id is required.")
            return

    if courier.role == UserRole.COURIER:
        if order_id is None:
            await websocket.close(code=1008, reason="A valid order_id is required.")
            return
        with BusinessSession() as db:
            order = db.scalar(select(Order).where(Order.id == order_id))
            if order is None or order.courier_id != courier.id:
                await websocket.close(code=1008, reason="Order is not assigned to this courier.")
                return
    elif courier.role == UserRole.CLIENT:
        if order_id is None:
            await websocket.close(code=1008, reason="Clients must provide their order_id.")
            return
        with BusinessSession() as db:
            order = db.scalar(select(Order).where(Order.id == order_id))
            if order is None or order.client_id != courier.id:
                await websocket.close(code=1008, reason="Order is not available to this client.")
                return

    subscriber = await manager.connect(websocket, courier.role, courier.id, order_id)
    try:
        if courier.role != UserRole.COURIER:
            while True:
                await websocket.receive_text()
                await websocket.send_json(
                    {"type": "error", "detail": "GPS subscription connections are read-only."}
                )

        while True:
            raw_message = await websocket.receive_text()
            try:
                payload = GPSInput.model_validate_json(raw_message)
            except (ValidationError, ValueError) as error:
                await websocket.send_json({"type": "error", "detail": str(error)})
                continue

            with BusinessSession() as db:
                order = db.scalar(select(Order).where(Order.id == order_id))
                if order is None or order.courier_id != courier.id:
                    await websocket.send_json({"type": "error", "detail": "Order assignment changed."})
                    await websocket.close(code=1008, reason="Order assignment changed.")
                    return
                client_id = order.client_id

            timestamp = payload.timestamp or utc_now()
            try:
                with TelemetrySession() as db:
                    row = GPSData(
                        courier_id=courier.id,
                        order_id=order_id,
                        latitude=payload.latitude,
                        longitude=payload.longitude,
                        timestamp=timestamp,
                    )
                    db.add(row)
                    db.commit()
                    db.refresh(row)
                    event = {
                        "type": "gps",
                        "data": {
                            "id": row.id,
                            "courier_id": row.courier_id,
                            "order_id": row.order_id,
                            "latitude": row.latitude,
                            "longitude": row.longitude,
                            "timestamp": _isoformat(row.timestamp),
                        },
                    }
            except SQLAlchemyError:
                logger.exception("Could not persist incoming GPS telemetry.")
                await websocket.send_json({"type": "error", "detail": "Could not save GPS telemetry."})
                continue

            await manager.broadcast_gps(event, courier.id, client_id)
            await websocket.send_json({"type": "accepted", "timestamp": event["data"]["timestamp"]})
    except WebSocketDisconnect:
        return
    finally:
        await manager.disconnect(subscriber)
