# Smart Logistics API

## Run locally

From the `backend` directory:

1. Create and activate a virtual environment.
2. Install dependencies with `pip install -r requirements.txt`.
3. Copy `.env.example` to `.env` and set the bootstrap admin password, JWT secret, and IoT device token.
4. Start the API with `uvicorn app.main:app --reload`.

The SQLite files are created on startup. Business data (`users`, `orders`) and telemetry (`sensor_data`, `gps_data`) use separate database connections and can be moved to separate database engines independently. Set both database URL variables to the same URL only when intentionally consolidating them.

OpenAPI docs are available at `/docs`. The login endpoint accepts OAuth2 form fields `username` and `password`; the selected role is derived from the account, not trusted from the client.

## Demo accounts

For local development only, run `python -m app.seed_demo` from the `backend` directory to create three test users, an in-transit order assigned to the demo courier, initial sensor readings, and a starting GPS point. The seeder is repeatable, resets these demo users to the credentials below, and refuses to run when `ENVIRONMENT=production`. Demo passwords are public test credentials and must never be used in a deployed environment.

| Role | Username | Password |
|---|---|---|
| Admin | `demo_admin` | `DemoAdmin123!` |
| Courier | `demo_courier` | `DemoCourier123!` |
| Client | `demo_client` | `DemoClient123!` |

## REST endpoints

- `POST /api/auth/token`, `GET /api/auth/me`
- `/api/users` — admin-only user CRUD
- `/api/orders` — admin CRUD; couriers and clients can read only their own orders
- `GET /api/telemetry/sensors` — admin-only sensor history
- `GET /api/telemetry/gps` — GPS history restricted to the caller's role and assignments
- `GET /health`

## WebSocket message shapes

Authenticate using the `token` query parameter. WebSocket query authentication is used because browser WebSocket APIs do not support arbitrary authorization headers; use WSS and avoid logging query strings outside local development.

- `WS /ws/sensors?token=<IOT_DEVICE_TOKEN>` accepts:

  ```json
  {"sensor_type":"temperature","value":21.5,"unit":"C"}
  ```

  Supported sensor types are `temperature`, `humidity`, `lighting`, and `motion`. Values for `lighting` and `motion` are numeric (0 or 1 conventionally). Events are persisted and broadcast only to connected admins.

- `WS /ws/gps?token=<COURIER_JWT>&order_id=<ORDER_ID>` accepts:

  ```json
  {"latitude":55.751244,"longitude":37.618423}
  ```

  The order must currently be assigned to that courier. GPS events are persisted and broadcast to admins, that courier, and the order's client only.

Both channels return `{"type":"accepted",...}` after storing an event and `{"type":"error",...}` for invalid or rejected messages. Clients should send sensor/GPS events at the frequencies required by the device (10 seconds for lighting/motion, 60 seconds for temperature/humidity, and 5 seconds for GPS).

## Simulator

From the project root, follow [the simulator instructions](../simulator/README.md) to install its WebSocket client and send mock sensor and courier GPS readings.
