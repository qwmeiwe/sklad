# Smart Logistics frontend

## Run locally

1. Start the FastAPI backend on `http://127.0.0.1:8000`.
2. From this directory, install dependencies with `npm install`.
3. Start the Vite development server with `npm run dev`.
4. Open the Vite URL (normally `http://localhost:5173`) and sign in with an account created in the backend.

Vite proxies REST, health, and WebSocket requests to the local backend. Set `VITE_API_URL` in `.env` to use another backend origin. The API's CORS settings must allow that frontend origin.

The login screen's role selector is a convenience check: the actual role always comes from the authenticated backend account. The frontend stores the JWT in local storage and sends it to the API and authenticated WebSocket connections.

Run `npm run typecheck` or `npm run build` to validate the app. The courier screen sends mock GPS coordinates every 5 seconds while a shift is active. The admin screen listens for sensor and GPS updates; clients subscribe only to their own selected order.
