export type UserRole = "admin" | "courier" | "client";

export type User = {
  id: number;
  username: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
};

export type OrderStatus =
  | "pending"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "cancelled";

export type Order = {
  id: number;
  description: string;
  status: OrderStatus;
  client_id: number;
  courier_id: number | null;
  created_at: string;
  updated_at: string;
};

export type SensorType = "temperature" | "humidity" | "lighting" | "motion";

export type SensorReading = {
  id: number;
  sensor_type: SensorType;
  value: number;
  unit: string | null;
  timestamp: string;
};

export type GPSReading = {
  id: number;
  courier_id: number;
  order_id: number;
  latitude: number;
  longitude: number;
  timestamp: string;
};

export type SocketEnvelope<T> = {
  type: "sensor" | "gps" | "accepted" | "error";
  data?: T;
  detail?: string;
};
