import type { ReactNode } from "react";
import type { Order, OrderStatus, UserRole } from "../types";
import type { SocketStatus } from "../hooks/useWebSocket";

export const statusLabels: Record<OrderStatus, string> = {
  pending: "Ожидает",
  picked_up: "Принят",
  in_transit: "В пути",
  delivered: "Доставлен",
  cancelled: "Отменён",
};

export const roleLabels: Record<UserRole, string> = {
  admin: "Администратор",
  courier: "Курьер",
  client: "Клиент",
};

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PageShell({
  eyebrow,
  title,
  userName,
  onLogout,
  children,
}: {
  eyebrow: string;
  title: string;
  userName: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  return (
    <main className="app-shell">
      <header className="topbar">
        <a aria-label="Склад — на главную" className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">с</span>
          <span className="brand-name">склад<span>.</span></span>
        </a>
        <div className="topbar-context">
          <span className="topbar-dot" />
          <span>{eyebrow}</span>
          <span className="topbar-divider">/</span>
          <strong>{title}</strong>
        </div>
        <div className="topbar-account">
          <span aria-hidden="true" className="avatar">{userName.slice(0, 1).toUpperCase() || "?"}</span>
          <span className="account-name">{userName}</span>
          <button className="button-quiet" onClick={onLogout} type="button">Выйти</button>
        </div>
      </header>
      <div className="page-content">{children}</div>
      <footer className="app-footer">
        <span>склад. / операционная система логистики</span>
        <span>Работаем в реальном времени <span className="footer-spark">✳</span></span>
      </footer>
    </main>
  );
}

export function SectionHeading({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <h2>{children}</h2>
      {trailing}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  detail,
  accent = false,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
  accent?: boolean;
}) {
  return (
    <article className={`metric-card${accent ? " metric-card-accent" : ""}`}>
      <div className="metric-card-top">
        <span className="metric-label">{label}</span>
        <span aria-hidden="true" className="metric-indicator" />
      </div>
      <p className="metric-value">
        {value}
        {unit && <span className="metric-unit">{unit}</span>}
      </p>
      {detail && <p className="metric-detail">{detail}</p>}
    </article>
  );
}

export function ConnectionLabel({ status }: { status: SocketStatus }) {
  const connected = status === "connected";
  return (
    <span className={`connection-label${connected ? " is-connected" : ""}`}>
      <span className="connection-dot" />
      {connected ? "В эфире" : status === "connecting" ? "Соединяемся" : "Нет связи"}
    </span>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`status-badge status-${status}`}>{statusLabels[status]}</span>;
}

export function OrderCard({ order }: { order: Order }) {
  return (
    <article className="order-card">
      <div className="order-card-heading">
        <div>
          <p className="order-reference">Заказ № {String(order.id).padStart(4, "0")}</p>
          <h3>{order.description}</h3>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <div className="order-meta">
        <span><span className="meta-label">Создан</span> {formatDate(order.created_at)}</span>
        <span><span className="meta-label">Обновлён</span> {formatDate(order.updated_at)}</span>
      </div>
    </article>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return <p role="alert" className="notice notice-error">{children}</p>;
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return <p role="status" className="notice notice-success">{children}</p>;
}

export function LoadingLine() {
  return (
    <div aria-live="polite" className="loading-state">
      <span className="loading-spinner" />
      <span>Собираем данные системы…</span>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true" className="empty-symbol">↗</span>
      <p className="empty-title">{title}</p>
      <p className="empty-detail">{detail}</p>
    </div>
  );
}

export function TrackingMap({ point }: { point: { latitude: number; longitude: number } | null }) {
  return (
    <div
      aria-label={
        point
          ? `Координаты курьера: ${point.latitude}, ${point.longitude}`
          : "Карта ожидает координаты курьера"
      }
      className={`tracking-map${point ? " tracking-map-active" : ""}`}
      role="img"
    >
      <div aria-hidden="true" className="map-grid" />
      <svg aria-hidden="true" className="map-route" viewBox="0 0 640 320" preserveAspectRatio="none">
        <path className="map-route-shadow" d="M56 268 C130 260 112 176 215 190 S335 244 378 151 S494 113 584 42" />
        <path className="map-route-line" d="M56 268 C130 260 112 176 215 190 S335 244 378 151 S494 113 584 42" />
      </svg>
      <span className="map-tag">{point ? "Курьер на маршруте" : "Ожидаем координаты"}</span>
      <span className="map-start">СКЛАД</span>
      {point ? (
        <span className="map-marker"><span /></span>
      ) : (
        <span className="map-placeholder">Здесь появится маршрут доставки</span>
      )}
      {point && (
        <span className="map-coordinates">
          {point.latitude.toFixed(5)}° N <span>·</span> {point.longitude.toFixed(5)}° E
        </span>
      )}
    </div>
  );
}
