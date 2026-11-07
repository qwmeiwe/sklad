import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getGpsHistory, getOrders, getSensorHistory, getUsers, getWebSocketUrl } from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import type { GPSReading, Order, SensorReading, SocketEnvelope, User } from "../types";
import {
  ConnectionLabel,
  ErrorNotice,
  LoadingLine,
  MetricCard,
  PageShell,
  SectionHeading,
} from "../components/ui";

export function AdminPage() {
  const { token, user, logout } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [gps, setGps] = useState<GPSReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const onSensor = useCallback((message: SocketEnvelope<SensorReading>) => {
    if (message.type === "sensor" && message.data) {
      setSensors((current) => [message.data!, ...current.filter((item) => item.id !== message.data!.id)]);
    }
  }, []);
  const onGps = useCallback((message: SocketEnvelope<GPSReading>) => {
    if (message.type === "gps" && message.data) {
      setGps((current) => [message.data!, ...current.filter((item) => item.id !== message.data!.id)]);
    }
  }, []);
  const sensorSocket = useWebSocket(
    token ? getWebSocketUrl("/ws/sensors", token) : null,
    onSensor,
    Boolean(token),
  );
  const gpsSocket = useWebSocket(
    token ? getWebSocketUrl("/ws/gps", token) : null,
    onGps,
    Boolean(token),
  );

  useEffect(() => {
    if (!token) return;
    let active = true;
    Promise.all([getOrders(token), getUsers(token), getSensorHistory(token), getGpsHistory(token)])
      .then(([nextOrders, nextUsers, nextSensors, nextGps]) => {
        if (!active) return;
        setOrders(nextOrders);
        setUsers(nextUsers);
        setSensors(nextSensors);
        setGps(nextGps);
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : "Не удалось загрузить дашборд.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  const latestSensors = useMemo(() => {
    const latest = new Map<string, SensorReading>();
    for (const reading of sensors) {
      if (!latest.has(reading.sensor_type)) latest.set(reading.sensor_type, reading);
    }
    return latest;
  }, [sensors]);

  const activeOrders = orders.filter(
    (order) => order.courier_id !== null && !["delivered", "cancelled"].includes(order.status),
  );
  const latestCourierPositions = new Map<number, GPSReading>();
  for (const reading of gps) {
    if (!latestCourierPositions.has(reading.courier_id)) {
      latestCourierPositions.set(reading.courier_id, reading);
    }
  }

  const sensorValue = (type: SensorReading["sensor_type"], fallback = "—") => {
    const reading = latestSensors.get(type);
    return reading ? `${reading.value}` : fallback;
  };
  const lighting = latestSensors.get("lighting");
  const motion = latestSensors.get("motion");
  const lightsOn = Boolean(lighting?.value && motion?.value);

  return (
    <PageShell eyebrow="Контроль / 01" title="Панель склада" userName={user?.username ?? ""} onLogout={logout}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest">Склад / состояние системы</p>
        <div className="flex gap-5">
          <ConnectionLabel status={sensorSocket.status} />
          <ConnectionLabel status={gpsSocket.status} />
        </div>
      </div>

      {(loadError || sensorSocket.error || gpsSocket.error) && (
        <div className="mt-5 space-y-3">
          {[loadError, sensorSocket.error, gpsSocket.error].filter(Boolean).map((error, index) => (
            <ErrorNotice key={`${index}-${error}`}>{error}</ErrorNotice>
          ))}
        </div>
      )}

      {loading ? (
        <LoadingLine />
      ) : (
        <>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Температура"
              value={sensorValue("temperature")}
              unit={latestSensors.get("temperature")?.unit ?? "°C"}
              detail="Склад / датчик 01"
            />
            <MetricCard
              label="Влажность"
              value={sensorValue("humidity")}
              unit={latestSensors.get("humidity")?.unit ?? "%"}
              detail="Склад / датчик 02"
            />
            <MetricCard
              label="Освещение"
              value={lighting ? (lightsOn ? "ВКЛ" : "ВЫКЛ") : "—"}
              detail={motion?.value ? "Движение обнаружено" : "Движения нет"}
            />
            <MetricCard
              label="Активные маршруты"
              value={String(activeOrders.length).padStart(2, "0")}
              detail="Назначенные курьеры"
            />
          </section>

          <section className="mt-10">
            <SectionHeading trailing={<span className="text-xs font-bold">{activeOrders.length} АКТИВНЫХ</span>}>
              Курьеры на маршруте
            </SectionHeading>
            {activeOrders.length === 0 ? (
              <p className="py-6 text-sm text-[#575750]">Нет активных назначенных заказов.</p>
            ) : (
              <div className="divide-y divide-[#171717] border-b border-[#171717]">
                {activeOrders.map((order) => {
                  const courier = users.find((item) => item.id === order.courier_id);
                  const position = latestCourierPositions.get(order.courier_id!);
                  return (
                    <article
                      className="grid gap-3 py-4 sm:grid-cols-[1fr_1fr_1.5fr] sm:items-center"
                      key={order.id}
                    >
                      <div>
                        <p className="text-xs font-bold uppercase tracking-widest text-[#FF5500]">
                          Заказ / {String(order.id).padStart(4, "0")}
                        </p>
                        <p className="mt-1 font-black">{courier?.username ?? `Курьер #${order.courier_id}`}</p>
                      </div>
                      <p className="text-xs font-bold uppercase">{order.description}</p>
                      <p className="font-mono text-xs">
                        {position
                          ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`
                          : "Ожидаем координаты"}
                      </p>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="mt-10">
            <SectionHeading>Последние события датчиков</SectionHeading>
            {sensors.length === 0 ? (
              <p className="py-6 text-sm text-[#575750]">Нет данных. Запустите симулятор.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {sensors.slice(0, 8).map((reading) => (
                  <div className="border border-[#171717] p-3" key={reading.id}>
                    <p className="text-xs font-bold uppercase">{reading.sensor_type}</p>
                    <p className="mt-2 text-xl font-black">
                      {reading.value} <span className="text-sm">{reading.unit}</span>
                    </p>
                    <p className="mt-1 text-[10px] uppercase text-[#575750]">
                      {new Date(reading.timestamp).toLocaleTimeString("ru-RU")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </PageShell>
  );
}
