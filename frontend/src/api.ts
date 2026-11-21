import type { GPSReading, Order, SensorReading, User } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request<T>(
  path: string,
  token?: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String(body.detail)
        : `Request failed (${response.status})`;
    throw new Error(detail);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function login(username: string, password: string): Promise<string> {
  const body = new URLSearchParams({ username, password });
  const result = await request<{ access_token: string }>("/api/auth/token", undefined, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return result.access_token;
}

export const getCurrentUser = (token: string) =>
  request<User>("/api/auth/me", token);

export const getUsers = (token: string) => request<User[]>("/api/users", token);

export const getOrders = (token: string) => request<Order[]>("/api/orders", token);

export const createOrder = (
  token: string,
  payload: { description: string; client_id: number; courier_id: number | null },
) => request<Order>("/api/orders", token, { method: "POST", body: JSON.stringify(payload) });

export const updateOrder = (
  token: string,
  orderId: number,
  payload: Partial<Pick<Order, "description" | "client_id" | "courier_id" | "status">>,
) =>
  request<Order>(`/api/orders/${orderId}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteOrder = (token: string, orderId: number) =>
  request<void>(`/api/orders/${orderId}`, token, { method: "DELETE" });

export const getSensorHistory = (token: string) =>
  request<SensorReading[]>("/api/telemetry/sensors?limit=100", token);

export const createUser = (
  token: string,
  payload: { username: string; password: string; role: User["role"]; email: string | null },
) => request<User>("/api/users", token, { method: "POST", body: JSON.stringify(payload) });

export const updateUser = (
  token: string,
  userId: number,
  payload: Partial<Pick<User, "username" | "email" | "role" | "is_active">> & { password?: string },
) =>
  request<User>(`/api/users/${userId}`, token, {
    method: "PUT",
    body: JSON.stringify(payload),
  });

export const deleteUser = (token: string, userId: number) =>
  request<void>(`/api/users/${userId}`, token, { method: "DELETE" });

export const getGpsHistory = (token: string, orderId?: number) => {
  const query = orderId === undefined ? "" : `?order_id=${orderId}&limit=100`;
  return request<GPSReading[]>(`/api/telemetry/gps${query}`, token);
};

export function getWebSocketUrl(
  path: string,
  token: string,
  params: Record<string, string | number> = {},
): string {
  const base = API_BASE || window.location.origin;
  const url = new URL(path, base);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}
