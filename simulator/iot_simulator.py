#!/usr/bin/env python3
"""Send mock warehouse sensor readings and courier locations to the API."""

import argparse
import asyncio
import json
import logging
import math
import os
import random
import time
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen

from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosedError, WebSocketException

LOGGER = logging.getLogger("iot_simulator")
TEMPERATURE_INTERVAL = 60.0
HUMIDITY_INTERVAL = 60.0
MOTION_INTERVAL = 10.0
LIGHTING_INTERVAL = 10.0
GPS_INTERVAL = 5.0
ACK_TIMEOUT = 15.0


def _api_url(server_url: str, path: str) -> str:
    parsed = urlsplit(server_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("--server-url must be an absolute http:// or https:// URL.")
    if parsed.query or parsed.fragment:
        raise ValueError("--server-url must not include a query string or fragment.")
    base_path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme, parsed.netloc, f"{base_path}{path}", "", ""))


def _websocket_url(server_url: str, path: str) -> str:
    api_url = _api_url(server_url, path)
    parsed = urlsplit(api_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return urlunsplit((scheme, parsed.netloc, parsed.path, parsed.query, parsed.fragment))


def _login(server_url: str, username: str, password: str) -> str:
    request = Request(
        _api_url(server_url, "/api/auth/token"),
        data=urlencode({"username": username, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=10) as response:
            result = json.load(response)
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Courier login failed (HTTP {error.code}): {detail}") from error
    except URLError as error:
        raise RuntimeError(f"Could not reach the API login endpoint: {error.reason}") from error

    token = result.get("access_token")
    if not isinstance(token, str) or not token:
        raise RuntimeError("Login response did not contain an access token.")
    return token


async def _receive_acknowledgement(websocket) -> None:
    while True:
        raw_message = await asyncio.wait_for(websocket.recv(), timeout=ACK_TIMEOUT)
        try:
            message = json.loads(raw_message)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            raise RuntimeError("The server returned a malformed WebSocket message.") from error

        if not isinstance(message, dict):
            raise RuntimeError("The server returned an unexpected WebSocket message.")
        if message.get("type") == "error":
            raise RuntimeError(f"The server rejected telemetry: {message.get('detail', 'unknown error')}")
        if message.get("type") == "accepted":
            return
        if message.get("type") != "gps":
            raise RuntimeError(f"The server returned an unexpected message type: {message.get('type')!r}")


async def _send(websocket, payload: dict) -> None:
    await websocket.send(json.dumps(payload, separators=(",", ":")))
    await _receive_acknowledgement(websocket)


def _sensor_reading(sensor_type: str, motion: int) -> tuple[float | int, str]:
    if sensor_type == "temperature":
        return round(random.uniform(18.0, 26.0), 1), "C"
    if sensor_type == "humidity":
        return round(random.uniform(35.0, 65.0), 1), "%"
    if sensor_type == "motion":
        return motion, "bool"
    if sensor_type == "lighting":
        return motion, "bool"
    raise ValueError(f"Unsupported sensor type: {sensor_type}")


async def _simulate_sensors(websocket) -> None:
    intervals = {
        "temperature": TEMPERATURE_INTERVAL,
        "humidity": HUMIDITY_INTERVAL,
        "motion": MOTION_INTERVAL,
        "lighting": LIGHTING_INTERVAL,
    }
    next_reading = dict.fromkeys(intervals, time.monotonic())
    motion = 0

    while True:
        now = time.monotonic()
        for sensor_type, interval in intervals.items():
            if now < next_reading[sensor_type]:
                continue
            if sensor_type == "motion":
                motion = int(random.random() < 0.55)
            value, unit = _sensor_reading(sensor_type, motion)
            await _send(
                websocket,
                {
                    "sensor_type": sensor_type,
                    "value": value,
                    "unit": unit,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )
            LOGGER.info("%s: %s %s", sensor_type, value, unit)
            next_reading[sensor_type] = time.monotonic() + interval

        delay = max(0.0, min(next_reading.values()) - time.monotonic())
        await asyncio.sleep(min(delay, 1.0))


async def _simulate_gps(websocket, latitude: float, longitude: float) -> None:
    while True:
        await _send(
            websocket,
            {
                "latitude": round(latitude, 6),
                "longitude": round(longitude, 6),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        LOGGER.info("GPS: %.6f, %.6f", latitude, longitude)

        latitude += random.gauss(0.0, 0.00012)
        longitude += random.gauss(0.0, 0.00012 / max(math.cos(math.radians(latitude)), 0.1))
        latitude = min(90.0, max(-90.0, latitude))
        longitude = min(180.0, max(-180.0, longitude))
        await asyncio.sleep(GPS_INTERVAL)


async def _run_forever(
    label: str,
    websocket_url: str,
    worker: Callable[..., Awaitable[None]],
    *worker_args,
) -> None:
    backoff = 1.0
    while True:
        try:
            async with connect(
                websocket_url,
                open_timeout=10,
                ping_interval=20,
                ping_timeout=20,
                max_size=1_048_576,
            ) as websocket:
                LOGGER.info("%s connected.", label)
                backoff = 1.0
                await worker(websocket, *worker_args)
        except ConnectionClosedError as error:
            if error.rcvd is not None and error.rcvd.code == 1008:
                raise RuntimeError(f"{label} connection rejected: {error.rcvd.reason}") from error
            LOGGER.warning("%s connection closed; reconnecting: %s", label, error)
        except (OSError, WebSocketException, TimeoutError) as error:
            LOGGER.warning("%s connection failed; reconnecting: %s", label, error)

        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 30.0)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--server-url",
        default=os.getenv("SERVER_URL", "http://127.0.0.1:8000"),
        help="FastAPI base URL (default: SERVER_URL or http://127.0.0.1:8000).",
    )
    parser.add_argument(
        "--mode",
        choices=("all", "sensors", "gps"),
        default="all",
        help="Run both streams or just one of them (default: all).",
    )
    parser.add_argument(
        "--iot-token",
        default=os.getenv("IOT_DEVICE_TOKEN"),
        help="Device token; defaults to IOT_DEVICE_TOKEN.",
    )
    parser.add_argument(
        "--courier-username",
        default=os.getenv("COURIER_USERNAME"),
        help="Courier account; defaults to COURIER_USERNAME.",
    )
    parser.add_argument(
        "--courier-password",
        default=os.getenv("COURIER_PASSWORD"),
        help="Courier password; defaults to COURIER_PASSWORD.",
    )
    parser.add_argument(
        "--order-id",
        type=int,
        default=int(os.environ["ORDER_ID"]) if os.getenv("ORDER_ID") else None,
        help="Order assigned to the courier; defaults to ORDER_ID.",
    )
    parser.add_argument("--latitude", type=float, default=55.751244, help="Starting latitude.")
    parser.add_argument("--longitude", type=float, default=37.618423, help="Starting longitude.")
    parser.add_argument("--seed", type=int, help="Optional random seed for repeatable sensor data.")
    parser.add_argument("--verbose", action="store_true", help="Log each generated reading.")
    args = parser.parse_args()

    if args.mode in {"all", "sensors"} and not args.iot_token:
        parser.error("--iot-token or IOT_DEVICE_TOKEN is required for sensor simulation.")
    if args.mode in {"all", "gps"}:
        if not args.courier_username or not args.courier_password:
            parser.error(
                "--courier-username and --courier-password (or COURIER_USERNAME and "
                "COURIER_PASSWORD) are required for GPS simulation."
            )
        if args.order_id is None or args.order_id < 1:
            parser.error("--order-id or a positive ORDER_ID is required for GPS simulation.")
    if not -90 <= args.latitude <= 90:
        parser.error("--latitude must be between -90 and 90.")
    if not -180 <= args.longitude <= 180:
        parser.error("--longitude must be between -180 and 180.")
    return args


async def _run(args: argparse.Namespace) -> None:
    jobs = []
    if args.mode in {"all", "sensors"}:
        sensor_query = urlencode({"token": args.iot_token})
        sensor_url = _websocket_url(args.server_url, f"/ws/sensors?{sensor_query}")
        jobs.append(_run_forever("Sensors", sensor_url, _simulate_sensors))

    if args.mode in {"all", "gps"}:
        token = await asyncio.to_thread(
            _login, args.server_url, args.courier_username, args.courier_password
        )
        gps_query = urlencode({"token": token, "order_id": args.order_id})
        gps_url = _websocket_url(
            args.server_url, f"/ws/gps?{gps_query}"
        )
        jobs.append(
            _run_forever(
                "Courier GPS",
                gps_url,
                _simulate_gps,
                args.latitude,
                args.longitude,
            )
        )

    await asyncio.gather(*jobs)


def main() -> None:
    args = _parse_args()
    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(asctime)s %(levelname)s %(message)s",
    )
    if args.seed is not None:
        random.seed(args.seed)
    try:
        asyncio.run(_run(args))
    except KeyboardInterrupt:
        LOGGER.info("Simulation stopped.")


if __name__ == "__main__":
    main()
