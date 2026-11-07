import type { ReactNode } from "react";
import type { Order, OrderStatus } from "../types";
import type { SocketStatus } from "../hooks/useWebSocket";

export const statusLabels: Record<OrderStatus, string> = {
  pending: "ОЖИДАЕТ",
  picked_up: "ПРИНЯТ",
  in_transit: "В ПУТИ",
  delivered: "ДОСТАВЛЕН",
  cancelled: "ОТМЕНЁН",
};

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
    <main className="min-h-screen bg-[#F4F4F0] px-5 py-6 text-[#171717] sm:px-8 lg:px-12">
      <header className="mx-auto flex max-w-7xl items-center justify-between border-b-2 border-[#171717] pb-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#FF5500]">
            {eyebrow}
          </p>
          <h1 className="mt-1 text-2xl font-black uppercase tracking-tight sm:text-3xl">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm font-bold uppercase sm:inline">{userName}</span>
          <button className="button-outline" onClick={onLogout} type="button">
            Выйти
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl py-8">{children}</div>
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
    <div className="mb-4 flex items-center justify-between gap-4 border-b border-[#171717] pb-2">
      <h2 className="text-sm font-black uppercase tracking-[0.12em]">{children}</h2>
      {trailing}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}) {
  return (
    <article className="border-2 border-[#171717] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#575750]">{label}</p>
      <p className="mt-4 text-4xl font-black tabular-nums">
        {value}
        {unit && <span className="ml-1 text-base font-bold">{unit}</span>}
      </p>
      {detail && <p className="mt-3 text-xs uppercase text-[#575750]">{detail}</p>}
    </article>
  );
}

export function ConnectionLabel({ status }: { status: SocketStatus }) {
  const connected = status === "connected";
  return (
    <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
      <span className={`h-2 w-2 ${connected ? "bg-[#FF5500]" : "bg-[#8A8A82]"}`} />
      {connected ? "В сети" : status === "connecting" ? "Подключение" : "Нет связи"}
    </span>
  );
}

export function OrderCard({ order }: { order: Order }) {
  return (
    <article className="border-2 border-[#171717] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-[#FF5500]">
            Заказ / {String(order.id).padStart(4, "0")}
          </p>
          <h3 className="mt-2 text-lg font-black">{order.description}</h3>
        </div>
        <span className="border border-[#171717] px-2 py-1 text-xs font-bold uppercase">
          {statusLabels[order.status]}
        </span>
      </div>
      <p className="mt-4 text-xs uppercase tracking-wide text-[#575750]">
        Создан {new Date(order.created_at).toLocaleString("ru-RU")}
      </p>
    </article>
  );
}

export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="border-2 border-[#FF5500] p-4 text-sm font-bold">
      {children}
    </p>
  );
}

export function LoadingLine() {
  return <p className="py-8 text-sm font-bold uppercase tracking-widest">Загрузка данных...</p>;
}

export function TrackingMap({ point }: { point: { latitude: number; longitude: number } | null }) {
  return (
    <div
      aria-label={
        point
          ? `Координаты курьера: ${point.latitude}, ${point.longitude}`
          : "Карта ожидает координаты курьера"
      }
      className="relative min-h-64 overflow-hidden border-2 border-[#171717] bg-[#E9E9E2]"
    >
      <div
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "linear-gradient(#17171718 1px, transparent 1px), linear-gradient(90deg, #17171718 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="absolute left-4 top-4 border border-[#171717] bg-[#F4F4F0] px-2 py-1 text-[10px] font-bold uppercase tracking-widest">
        Схема / GPS
      </div>
      {point ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="relative grid h-12 w-12 place-items-center border-2 border-[#FF5500] bg-[#F4F4F0] text-xs font-black">
            GPS
            <span className="absolute h-3 w-3 -translate-y-8 rotate-45 bg-[#FF5500]" />
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs font-bold uppercase tracking-widest text-[#575750]">
          Координаты курьера появятся после начала трансляции
        </div>
      )}
      {point && (
        <p className="absolute bottom-3 left-3 bg-[#F4F4F0] px-2 py-1 font-mono text-xs">
          {point.latitude.toFixed(5)}, {point.longitude.toFixed(5)}
        </p>
      )}
    </div>
  );
}
