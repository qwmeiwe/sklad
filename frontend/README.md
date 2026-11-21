# Smart Logistics frontend

## Run locally

1. Start the FastAPI backend on `http://127.0.0.1:8000`.
2. From this directory, install dependencies with `npm install`.
3. Start the Vite development server with `npm run dev`.
4. Open the Vite URL (normally `http://localhost:5173`) and sign in with an account created in the backend.

Vite proxies REST, health, and WebSocket requests to the local backend. Set `VITE_API_URL` in `.env` to use another backend origin. The API's CORS settings must allow that frontend origin.

The login screen has shortcuts for the local demo accounts. The selected role is checked against the authenticated backend account; it is never trusted as the account's actual role. The frontend stores the JWT in local storage and sends it to the API and authenticated WebSocket connections.

The admin workspace supports creating, assigning, updating, and deleting orders, as well as creating and managing user roles and access. Sensor readings and courier positions update over WebSockets. Clients can track only their own selected order.

To see changing warehouse readings locally, start the sensor simulator from the project root in a separate terminal after starting the backend:

```powershell
python -m pip install -r simulator\requirements.txt
$env:IOT_DEVICE_TOKEN = "the value of IOT_DEVICE_TOKEN from backend\.env"
python simulator\iot_simulator.py --mode sensors --verbose
```

The admin dashboard receives each sensor reading live and shows when readings were last updated. Without a physical sensor or a running simulator, it displays the latest saved readings and indicates when new data is not arriving.

Run `npm run typecheck` or `npm run build` to validate the app. While a shift is active, the courier screen sends mock GPS coordinates every 5 seconds; connect a device GPS source for real-world location updates.
