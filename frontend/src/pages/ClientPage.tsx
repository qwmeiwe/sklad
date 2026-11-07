import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getGpsHistory, getOrders, getWebSocketUrl } from "../api";
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

export function ClientPage() {
  const { token, user, logout } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [position, setPosition] = useState<GPSReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([getOrders(token), getGpsHistory(token)])
      .then(([nextOrders, history]) => {
        if (!active) return;
        setOrders(nextOrders);
        const firstActive = nextOrders.find(
          (order) => !["delivered", "cancelled"].includes(order.status),
        );
        const orderId = firstActive?.id ?? nextOrders[0]?.id ?? null;
        setSelectedOrderId(orderId);
        if (orderId !== null) {
          const latest = history.find((reading) => reading.order_id === orderId);
          if (latest) setPosition(latest);
        }
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : "Не удалось загрузить заказ.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const onGps = useCallback((message: SocketEnvelope<GPSReading>) => {
    if (message.type === "gps" && message.data) setPosition(message.data);
  }, []);
  const gpsSocket = useWebSocket(
    token && selectedOrder
      ? getWebSocketUrl("/ws/gps", token, { order_id: selectedOrder.id })
      : null,
    onGps,
    Boolean(token && selectedOrder && !["delivered", "cancelled"].includes(selectedOrder.status)),
  );

  const orderPosition = useMemo(
    () => (position?.order_id === selectedOrderId ? position : null),
    [position, selectedOrderId],
  );

  return (
    <PageShell eyebrow="Доставка / 03" title="Отслеживание заказа" userName={user?.username ?? ""} onLogout={logout}>
      {loadError && <ErrorNotice>{loadError}</ErrorNotice>}
      {gpsSocket.error && <div className="mt-4"><ErrorNotice>{gpsSocket.error}</ErrorNotice></div>}
      {loading ? (
        <LoadingLine />
      ) : !selectedOrder ? (
        <p className="border border-[#171717] p-5 text-sm">Заказов пока нет.</p>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <section>
            {orders.length > 1 && (
              <label className="mb-6 block text-xs font-bold uppercase tracking-widest">
                Мои заказы
                <select
                  className="field mt-2"
                  onChange={(event) => setSelectedOrderId(Number(event.target.value))}
                  value={selectedOrder.id}
                >
                  {orders.map((order) => (
                    <option key={order.id} value={order.id}>
                      Заказ #{order.id} / {order.description}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <SectionHeading trailing={<ConnectionLabel status={gpsSocket.status} />}>
              Статус доставки
            </SectionHeading>
            <OrderCard order={selectedOrder} />
            <p className="mt-4 text-xs leading-5 text-[#575750]">
              {gpsSocket.status === "connected"
                ? "Получаем координаты курьера в реальном времени."
                : "Ожидаем подключение курьера к трансляции."}
            </p>
          </section>
          <section>
            <SectionHeading>Положение курьера</SectionHeading>
            <TrackingMap point={orderPosition} />
            {orderPosition && (
              <p className="mt-3 text-xs uppercase text-[#575750]">
                Обновлено {new Date(orderPosition.timestamp).toLocaleTimeString("ru-RU")}
              </p>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
