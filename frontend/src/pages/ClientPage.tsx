import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getGpsHistory, getOrders, getWebSocketUrl } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import type { GPSReading, Order, SocketEnvelope } from "../types";
import {
  ConnectionLabel,
  EmptyState,
  ErrorNotice,
  LoadingLine,
  OrderCard,
  PageShell,
  SectionHeading,
  StatusBadge,
  TrackingMap,
} from "../components/ui";

const deliverySteps = [
  { status: "pending", label: "Оформлен" },
  { status: "picked_up", label: "Принят" },
  { status: "in_transit", label: "В пути" },
  { status: "delivered", label: "Доставлен" },
] as const;

export function ClientPage() {
  const { token, user, logout } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState<GPSReading[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [position, setPosition] = useState<GPSReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const selectedOrder = orders.find((order) => order.id === selectedOrderId) ?? null;

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([getOrders(token), getGpsHistory(token)])
      .then(([nextOrders, nextHistory]) => {
        if (!active) return;
        setOrders(nextOrders);
        setHistory(nextHistory);
        const firstActive = nextOrders.find((order) => !["delivered", "cancelled"].includes(order.status));
        setSelectedOrderId(firstActive?.id ?? nextOrders[0]?.id ?? null);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : "Не удалось загрузить заказы.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  const onGps = useCallback((message: SocketEnvelope<GPSReading>) => {
    if (message.type === "gps" && message.data) setPosition(message.data);
  }, []);
  const canTrack = Boolean(
    token && selectedOrder && !["delivered", "cancelled"].includes(selectedOrder.status),
  );
  const gpsSocket = useWebSocket(
    token && selectedOrder ? getWebSocketUrl("/ws/gps", token, { order_id: selectedOrder.id }) : null,
    onGps,
    canTrack,
  );
  const orderPosition = useMemo(() => {
    if (position?.order_id === selectedOrderId) return position;
    return history.find((reading) => reading.order_id === selectedOrderId) ?? null;
  }, [history, position, selectedOrderId]);
  const stepIndex = selectedOrder
    ? deliverySteps.findIndex((step) => step.status === selectedOrder.status)
    : -1;

  return (
    <PageShell eyebrow="Личный кабинет" title="Мои доставки" userName={user?.username ?? ""} onLogout={logout}>
      <div className="page-intro">
        <div>
          <p className="eyebrow">Привет, {user?.username}</p>
          <h1 className="page-title">Всё едет по плану.</h1>
          <p className="page-subtitle">Ваши доставки и местоположение курьера — здесь, в реальном времени.</p>
        </div>
        <div className="welcome-pill"><span>✳</span> {orders.length} {orders.length === 1 ? "заказ" : "заказов"}</div>
      </div>

      {loadError && <ErrorNotice>{loadError}</ErrorNotice>}
      {gpsSocket.error && <div className="mt-3"><ErrorNotice>{gpsSocket.error}</ErrorNotice></div>}
      {loading ? <LoadingLine /> : !selectedOrder ? (
        <div className="panel panel-pad">
          <EmptyState title="Заказов пока нет" detail="Как только появится новая доставка, она отобразится здесь." />
        </div>
      ) : (
        <>
          <div className="dashboard-grid">
            <section className="stack">
              <div className="panel panel-pad">
                <div className="panel-topline">
                  <div><h2 className="panel-title">Текущий заказ</h2><p className="panel-caption">Статус и детали доставки.</p></div>
                  {orders.length > 1 && (
                    <label className="field-label">
                      <span className="sr-only">Выбрать заказ</span>
                      <select
                        aria-label="Выбрать заказ"
                        className="select-field"
                        onChange={(event) => setSelectedOrderId(Number(event.target.value))}
                        value={selectedOrder.id}
                      >
                        {orders.map((order) => (
                          <option key={order.id} value={order.id}>№{order.id} · {order.description}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <OrderCard order={selectedOrder} />
                <div className="steps" aria-label="Этапы доставки">
                  {deliverySteps.map((step, index) => {
                    const complete = selectedOrder.status !== "cancelled" && stepIndex > index;
                    const current = step.status === selectedOrder.status;
                    return (
                      <div className={`step${complete ? " is-done" : ""}${current ? " is-current" : ""}`} key={step.status}>
                        <span className="step-dot">{complete ? "✓" : ""}</span>
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
                {selectedOrder.status === "cancelled" ? (
                  <div className="notice notice-error">Этот заказ отменён. Если это ошибка, свяжитесь с отправителем.</div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="live-title">Статус доставки</p><p className="live-detail">Обновляем маршрут автоматически</p></div>
                    <StatusBadge status={selectedOrder.status} />
                  </div>
                )}
              </div>
            </section>

            <section className="stack">
              <div className="panel panel-pad">
                <div className="panel-topline">
                  <div><h2 className="panel-title">Маршрут курьера</h2><p className="panel-caption">Последняя известная геопозиция.</p></div>
                  <ConnectionLabel status={gpsSocket.status} />
                </div>
                <TrackingMap point={orderPosition} />
                <p className="panel-caption mt-3">
                  {orderPosition
                    ? `Последнее обновление: ${new Date(orderPosition.timestamp).toLocaleTimeString("ru-RU")}`
                    : selectedOrder.status === "delivered"
                      ? "Заказ уже доставлен."
                      : "Курьер ещё не начал передачу геопозиции."}
                </p>
              </div>
              <div className="panel panel-pad">
                <div className="panel-topline"><div><h2 className="panel-title">Нужна помощь?</h2><p className="panel-caption">По вопросам доставки обратитесь к отправителю.</p></div><span aria-hidden="true" className="empty-symbol">↗</span></div>
                <p className="field-help">Номер заказа: <strong>#{selectedOrder.id}</strong> · Создан {new Date(selectedOrder.created_at).toLocaleDateString("ru-RU")}</p>
              </div>
            </section>
          </div>

          {orders.length > 1 && (
            <section className="mt-7">
              <SectionHeading>Все мои заказы</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {orders.map((order) => (
                  <div
                    aria-label={`Выбрать заказ ${order.id}`}
                    className="order-list-button"
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedOrderId(order.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <OrderCard order={order} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}
