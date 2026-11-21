import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getOrders, getWebSocketUrl } from "../api";
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
  const canTransmit = activeOrder !== null && !["delivered", "cancelled"].includes(activeOrder.status);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getOrders(token)
      .then((result) => {
        if (!active) return;
        setOrders(result);
        const firstActive = result.find((order) => !["delivered", "cancelled"].includes(order.status));
        setSelectedOrderId(firstActive?.id ?? result[0]?.id ?? null);
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
    if (message.type === "gps" && message.data) {
      const next = { latitude: message.data.latitude, longitude: message.data.longitude };
      positionRef.current = next;
      setPosition(next);
    }
  }, []);
  const gpsSocket = useWebSocket(
    token && activeOrder ? getWebSocketUrl("/ws/gps", token, { order_id: activeOrder.id }) : null,
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
    <PageShell eyebrow="Маршруты" title="Кабинет курьера" userName={user?.username ?? ""} onLogout={logout}>
      <div className="page-intro">
        <div>
          <p className="eyebrow">Рабочая смена</p>
          <h1 className="page-title">Хорошего маршрута, {user?.username}.</h1>
          <p className="page-subtitle">Ваши назначения и передача геопозиции — без лишних действий.</p>
        </div>
        <div className={`welcome-pill${onShift ? " shift-card-active" : ""}`}>
          <span>{onShift ? "●" : "○"}</span> {onShift ? "На линии" : "Смена не начата"}
        </div>
      </div>

      {loadError && <ErrorNotice>{loadError}</ErrorNotice>}
      {gpsSocket.error && <div className="mt-3"><ErrorNotice>{gpsSocket.error}</ErrorNotice></div>}
      {loading ? <LoadingLine /> : (
        <div className="dashboard-grid">
          <section className="stack">
            <div className="panel panel-pad">
              <div className="panel-topline">
                <div><h2 className="panel-title">Назначенный заказ</h2><p className="panel-caption">Выберите доставку, которую выполняете.</p></div>
                {orders.length > 1 && (
                  <select
                    aria-label="Выбрать заказ"
                    className="select-field"
                    disabled={onShift}
                    onChange={(event) => setSelectedOrderId(Number(event.target.value))}
                    value={selectedOrderId ?? ""}
                  >
                    {orders.map((order) => <option key={order.id} value={order.id}>№{order.id} · {order.description}</option>)}
                  </select>
                )}
              </div>
              {activeOrder ? (
                <>
                  <OrderCard order={activeOrder} />
                  <div className={`shift-card mt-4${onShift ? " shift-card-active" : ""}`}>
                    <div className="panel-topline">
                      <div>
                        <p className="panel-title">{onShift ? "Вы на маршруте" : canTransmit ? "Готовы к выезду?" : "Заказ закрыт"}</p>
                        <p className="panel-caption">{onShift ? "Передаём координаты для клиента и склада." : "Начните смену, чтобы показать своё положение."}</p>
                      </div>
                      {onShift && <ConnectionLabel status={gpsSocket.status} />}
                    </div>
                    <button
                      className={onShift ? "button-secondary" : "button-primary"}
                      disabled={!canTransmit || (onShift && gpsSocket.status === "connecting")}
                      onClick={toggleShift}
                      type="button"
                    >
                      {onShift ? "Завершить смену" : "Начать смену"}
                    </button>
                    {!canTransmit && <p className="field-help mt-3">Для этого заказа передача координат уже не требуется.</p>}
                  </div>
                </>
              ) : (
                <EmptyState title="Заказов пока нет" detail="Новые назначения появятся здесь автоматически." />
              )}
            </div>
            <div className="panel panel-pad">
              <SectionHeading>Передача геопозиции</SectionHeading>
              <div className="live-list">
                <div className="live-row"><div><p className="live-title">Соединение с системой</p><p className="live-detail">Защищённый канал GPS</p></div><ConnectionLabel status={gpsSocket.status} /></div>
                <div className="live-row"><div><p className="live-title">Текущая позиция</p><p className="live-detail">Обновление каждые 5 секунд</p></div><span className="live-value">{onShift ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : "Не передаётся"}</span></div>
              </div>
              <p className="field-help mt-3">В демо-режиме координаты имитируются в браузере. Для реального GPS потребуется подключить геолокацию устройства.</p>
            </div>
          </section>

          <section className="panel panel-pad">
            <div className="panel-topline">
              <div><h2 className="panel-title">Карта маршрута</h2><p className="panel-caption">Видно вам и получателю доставки.</p></div>
              {onShift && <ConnectionLabel status={gpsSocket.status} />}
            </div>
            <TrackingMap point={onShift ? position : null} />
            <p className="panel-caption mt-3">{onShift ? "Геопозиция обновляется в реальном времени." : "Начните смену, чтобы передавать геопозицию."}</p>
          </section>
        </div>
      )}
    </PageShell>
  );
}
