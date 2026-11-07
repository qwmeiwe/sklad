import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getOrders, getWebSocketUrl } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import type { GPSReading, Order, SocketEnvelope } from "../types";
import {
  ConnectionLabel,
  ErrorNotice,
  LoadingLine,
  OrderCard,
  PageShell,
  SectionHeading,
  TrackingMap,
} from "../components/ui";

type Coordinates = { latitude: number; longitude: number };

export function CourierPage() {
  const { token, user, logout } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [onShift, setOnShift] = useState(false);
  const [position, setPosition] = useState<Coordinates>({
    latitude: 55.751244,
    longitude: 37.618423,
  });
  const positionRef = useRef(position);
  const activeOrder = orders.find((order) => order.id === selectedOrderId) ?? null;
  const canTransmit =
    activeOrder !== null && !["delivered", "cancelled"].includes(activeOrder.status);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getOrders(token)
      .then((result) => {
        if (!active) return;
        setOrders(result);
        const firstActive = result.find(
          (order) => !["delivered", "cancelled"].includes(order.status),
        );
        setSelectedOrderId(firstActive?.id ?? result[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : "Не удалось загрузить заказы.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const onGps = useCallback((message: SocketEnvelope<GPSReading>) => {
    if (message.type === "gps" && message.data) {
      setPosition({ latitude: message.data.latitude, longitude: message.data.longitude });
    }
  }, []);
  const gpsSocket = useWebSocket(
    token && activeOrder
      ? getWebSocketUrl("/ws/gps", token, { order_id: activeOrder.id })
      : null,
    onGps,
    onShift && Boolean(token && activeOrder),
  );

  useEffect(() => {
    if (!onShift || gpsSocket.status !== "connected") return;
    const sendLocation = () => {
      const next = {
        latitude: positionRef.current.latitude + (Math.random() - 0.5) * 0.0002,
        longitude: positionRef.current.longitude + (Math.random() - 0.5) * 0.0002,
      };
      next.latitude = Math.max(-90, Math.min(90, next.latitude));
      next.longitude = Math.max(-180, Math.min(180, next.longitude));
      positionRef.current = next;
      setPosition(next);
      gpsSocket.sendMessage(next);
    };
    sendLocation();
    const intervalId = window.setInterval(sendLocation, 5000);
    return () => window.clearInterval(intervalId);
  }, [onShift, gpsSocket.status, gpsSocket.sendMessage]);

  function toggleShift() {
    if (onShift) {
      setOnShift(false);
      return;
    }
    if (!canTransmit) return;
    positionRef.current = position;
    setOnShift(true);
  }

  return (
    <PageShell eyebrow="Маршрут / 02" title="Кабинет курьера" userName={user?.username ?? ""} onLogout={logout}>
      {loadError && <ErrorNotice>{loadError}</ErrorNotice>}
      {gpsSocket.error && <div className="mt-4"><ErrorNotice>{gpsSocket.error}</ErrorNotice></div>}
      {loading ? (
        <LoadingLine />
      ) : (
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <section>
            <SectionHeading>Активный заказ</SectionHeading>
            {orders.length === 0 ? (
              <p className="border border-[#171717] p-5 text-sm">Назначенных заказов пока нет.</p>
            ) : (
              <>
                {orders.length > 1 && (
                  <label className="mb-4 block text-xs font-bold uppercase tracking-widest">
                    Выбрать заказ
                    <select
                      className="field mt-2"
                      disabled={onShift}
                      onChange={(event) => setSelectedOrderId(Number(event.target.value))}
                      value={selectedOrderId ?? ""}
                    >
                      {orders.map((order) => (
                        <option key={order.id} value={order.id}>
                          Заказ #{order.id} / {order.description}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {activeOrder && <OrderCard order={activeOrder} />}
                <div className="mt-6 flex flex-wrap items-center gap-4">
                  <button
                    className="button-primary"
                    disabled={!canTransmit || (onShift && gpsSocket.status === "connecting")}
                    onClick={toggleShift}
                    type="button"
                  >
                    {onShift ? "Завершить смену" : "Начать смену / передавать геопозицию"}
                  </button>
                  {onShift && <ConnectionLabel status={gpsSocket.status} />}
                </div>
                <p className="mt-4 text-xs leading-5 text-[#575750]">
                  При включённой смене браузер передаёт демонстрационные координаты раз в 5 секунд.
                </p>
              </>
            )}
          </section>
          <section>
            <SectionHeading trailing={onShift ? <ConnectionLabel status={gpsSocket.status} /> : undefined}>
              Текущая геопозиция
            </SectionHeading>
            <TrackingMap point={onShift ? position : null} />
          </section>
        </div>
      )}
    </PageShell>
  );
}
