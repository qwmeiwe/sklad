import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  createOrder,
  createUser,
  deleteOrder,
  deleteUser,
  getGpsHistory,
  getOrders,
  getSensorHistory,
  getUsers,
  getWebSocketUrl,
  updateOrder,
  updateUser,
} from "../api";
import { useWebSocket } from "../hooks/useWebSocket";
import type { GPSReading, Order, OrderStatus, SensorReading, SocketEnvelope, User, UserRole } from "../types";
import {
  EmptyState,
  ErrorNotice,
  formatDate,
  LoadingLine,
  MetricCard,
  PageShell,
  StatusBadge,
  SuccessNotice,
} from "../components/ui";

type OrderDraft = {
  description: string;
  client_id: number;
  courier_id: number | null;
  status: OrderStatus;
};

function ManagedOrderRow({
  order,
  users,
  onSave,
  onDelete,
}: {
  order: Order;
  users: User[];
  onSave: (orderId: number, draft: OrderDraft) => Promise<boolean>;
  onDelete: (orderId: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<OrderDraft>({
    description: order.description,
    client_id: order.client_id,
    courier_id: order.courier_id,
    status: order.status,
  });
  const clients = users.filter((item) => item.role === "client");
  const couriers = users.filter((item) => item.role === "courier");

  async function save() {
    setSaving(true);
    try {
      if (await onSave(order.id, draft)) setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <div className="person-cell">
          <span className="person-avatar">#{String(order.id).padStart(2, "0")}</span>
          <div>
            {editing ? (
              <input
                aria-label="Описание заказа"
                className="field"
                maxLength={500}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                value={draft.description}
              />
            ) : (
              <>
                <strong>{order.description}</strong>
                <p className="person-email">{formatDate(order.created_at)}</p>
              </>
            )}
          </div>
        </div>
      </td>
      <td>
        {editing ? (
          <select
            aria-label="Клиент"
            className="inline-select"
            onChange={(event) => setDraft({ ...draft, client_id: Number(event.target.value) })}
            value={draft.client_id}
          >
            {clients.map((client) => <option key={client.id} value={client.id}>{client.username}</option>)}
          </select>
        ) : users.find((item) => item.id === order.client_id)?.username ?? `Клиент #${order.client_id}`}
      </td>
      <td>
        {editing ? (
          <select
            aria-label="Курьер"
            className="inline-select"
            onChange={(event) => setDraft({ ...draft, courier_id: event.target.value ? Number(event.target.value) : null })}
            value={draft.courier_id ?? ""}
          >
            <option value="">Не назначен</option>
            {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.username}</option>)}
          </select>
        ) : users.find((item) => item.id === order.courier_id)?.username ?? "Не назначен"}
      </td>
      <td>
        {editing ? (
          <select
            aria-label="Статус заказа"
            className="inline-select"
            onChange={(event) => setDraft({ ...draft, status: event.target.value as OrderStatus })}
            value={draft.status}
          >
            <option value="pending">Ожидает</option>
            <option value="picked_up">Принят</option>
            <option value="in_transit">В пути</option>
            <option value="delivered">Доставлен</option>
            <option value="cancelled">Отменён</option>
          </select>
        ) : <StatusBadge status={order.status} />}
      </td>
      <td>
        <div className="table-actions">
          {editing ? (
            <>
              <button className="button-small" disabled={saving || !draft.description.trim()} onClick={() => void save()} type="button">
                {saving ? "..." : "Сохранить"}
              </button>
              <button className="button-small" onClick={() => setEditing(false)} type="button">Отмена</button>
            </>
          ) : (
            <>
              <button className="button-small" onClick={() => setEditing(true)} type="button">Изменить</button>
              <button className="button-small" onClick={() => void onDelete(order.id)} type="button">Удалить</button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

function ManagedUserRow({
  user,
  onSave,
  onDelete,
  isCurrentUser,
  isReferenced,
}: {
  user: User;
  onSave: (userId: number, role: UserRole, isActive: boolean) => Promise<boolean>;
  onDelete: (userId: number) => Promise<void>;
  isCurrentUser: boolean;
  isReferenced: boolean;
}) {
  const [role, setRole] = useState(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(user.id, role, isActive);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>
        <div className="person-cell">
          <span className="person-avatar">{user.username.slice(0, 1).toUpperCase()}</span>
          <div>
            <strong>{user.username}</strong>
            {user.email && <p className="person-email">{user.email}</p>}
          </div>
        </div>
      </td>
      <td>
        <div>
          <select
            aria-label={`Роль пользователя ${user.username}`}
            className="inline-select"
            disabled={isCurrentUser || isReferenced}
            onChange={(event) => setRole(event.target.value as UserRole)}
            value={role}
          >
            <option value="admin">Администратор</option>
            <option value="courier">Курьер</option>
            <option value="client">Клиент</option>
          </select>
          {(isCurrentUser || isReferenced) && (
            <p className="person-email">{isCurrentUser ? "Нельзя менять свою роль" : "Сначала переназначьте заказы"}</p>
          )}
        </div>
      </td>
      <td>
        <button
          aria-label={isActive ? `Отключить ${user.username}` : `Включить ${user.username}`}
          className={`role-chip${isActive ? "" : " inactive"}`}
          disabled={isCurrentUser}
          onClick={() => setIsActive(!isActive)}
          type="button"
        >
          {isActive ? "Активен" : "Отключён"}
        </button>
      </td>
      <td>
        <div className="table-actions">
          <button className="button-small" disabled={saving} onClick={() => void save()} type="button">
            {saving ? "..." : "Сохранить"}
          </button>
          <button
            className="button-small"
            disabled={isCurrentUser || isReferenced}
            onClick={() => void onDelete(user.id)}
            title={isCurrentUser ? "Нельзя удалить свою учётную запись" : isReferenced ? "Сначала удалите связанные заказы" : undefined}
            type="button"
          >
            Удалить
          </button>
        </div>
      </td>
    </tr>
  );
}

export function AdminPage() {
  const { token, user, logout } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sensors, setSensors] = useState<SensorReading[]>([]);
  const [gps, setGps] = useState<GPSReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [sensorClock, setSensorClock] = useState(Date.now);
  const [activeForm, setActiveForm] = useState<"order" | "user" | null>(null);
  const [creating, setCreating] = useState(false);
  const [orderDescription, setOrderDescription] = useState("");
  const [orderClient, setOrderClient] = useState("");
  const [orderCourier, setOrderCourier] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("client");

  const refresh = useCallback(async () => {
    if (!token) return;
    const [nextOrders, nextUsers, nextSensors, nextGps] = await Promise.all([
      getOrders(token),
      getUsers(token),
      getSensorHistory(token),
      getGpsHistory(token),
    ]);
    setOrders(nextOrders);
    setUsers(nextUsers);
    setSensors(nextSensors);
    setGps(nextGps);
  }, [token]);

  const onSensor = useCallback((message: SocketEnvelope<SensorReading>) => {
    if (message.type === "sensor" && message.data) {
      const reading = message.data;
      setSensors((current) => [reading, ...current.filter((item) => item.id !== reading.id)]);
    }
  }, []);
  const onGps = useCallback((message: SocketEnvelope<GPSReading>) => {
    if (message.type === "gps" && message.data) {
      const reading = message.data;
      setGps((current) => [reading, ...current.filter((item) => item.id !== reading.id)]);
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
    let active = true;
    refresh()
      .catch((reason: unknown) => {
        if (active) setLoadError(reason instanceof Error ? reason.message : "Не удалось загрузить данные.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    const intervalId = window.setInterval(() => setSensorClock(Date.now()), 10_000);
    return () => window.clearInterval(intervalId);
  }, []);

  const latestSensors = useMemo(() => {
    const latest = new Map<string, SensorReading>();
    for (const reading of sensors) {
      if (!latest.has(reading.sensor_type)) latest.set(reading.sensor_type, reading);
    }
    return latest;
  }, [sensors]);
  const latestGps = useMemo(() => {
    const latest = new Map<number, GPSReading>();
    for (const reading of gps) {
      if (!latest.has(reading.order_id)) latest.set(reading.order_id, reading);
    }
    return latest;
  }, [gps]);
  const clients = users.filter((item) => item.role === "client");
  const couriers = users.filter((item) => item.role === "courier");
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  const activeRoutes = activeOrders.filter((order) => order.courier_id !== null);
  const deliveredOrders = orders.filter((order) => order.status === "delivered").length;
  const lighting = latestSensors.get("lighting");
  const motion = latestSensors.get("motion");
  const latestSensorTimestamp = Math.max(
    0,
    ...Array.from(latestSensors.values(), (reading) => new Date(reading.timestamp).getTime()),
  );
  const sensorIsFresh = latestSensorTimestamp > 0 && sensorClock - latestSensorTimestamp < 3 * 60 * 1000;
  const systemIsLive =
    sensorSocket.status === "connected" && gpsSocket.status === "connected" && sensorIsFresh;
  const sensorStatusText = systemIsLive
    ? "Система онлайн"
    : sensorSocket.status === "connecting" || gpsSocket.status === "connecting"
      ? "Подключаем систему"
      : sensorSocket.status === "connected" && gpsSocket.status === "connected"
        ? "Ждём данные датчиков"
        : "Нет связи с системой";
  const sensorUpdatedAt = (type: SensorReading["sensor_type"]) => {
    const reading = latestSensors.get(type);
    return reading ? `Обновлено ${new Date(reading.timestamp).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` : "Нет данных";
  };
  const sensorValue = (type: SensorReading["sensor_type"], fallback = "—") => {
    const reading = latestSensors.get(type);
    return reading ? `${reading.value}` : fallback;
  };

  async function runAction(action: () => Promise<void>, successMessage: string): Promise<boolean> {
    setActionError("");
    setNotice("");
    try {
      await action();
      setNotice(successMessage);
      return true;
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Не удалось выполнить операцию.");
      return false;
    }
  }

  async function handleCreateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setCreating(true);
    await runAction(async () => {
      const created = await createOrder(token, {
        description: orderDescription.trim(),
        client_id: Number(orderClient),
        courier_id: orderCourier ? Number(orderCourier) : null,
      });
      setOrders((current) => [created, ...current]);
      setOrderDescription("");
      setOrderClient("");
      setOrderCourier("");
      setActiveForm(null);
    }, "Новый заказ создан.");
    setCreating(false);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setCreating(true);
    await runAction(async () => {
      const created = await createUser(token, {
        username: newUsername.trim(),
        password: newPassword,
        role: newRole,
        email: newEmail.trim() || null,
      });
      setUsers((current) => [...current, created].sort((a, b) => a.id - b.id));
      setNewUsername("");
      setNewPassword("");
      setNewEmail("");
      setNewRole("client");
      setActiveForm(null);
    }, "Учётная запись создана.");
    setCreating(false);
  }

  async function saveOrder(orderId: number, draft: OrderDraft): Promise<boolean> {
    if (!token) return false;
    return runAction(async () => {
      const updated = await updateOrder(token, orderId, { ...draft, description: draft.description.trim() });
      setOrders((current) => current.map((item) => item.id === orderId ? updated : item));
    }, "Изменения заказа сохранены.");
  }

  async function removeOrder(orderId: number) {
    if (!token || !window.confirm(`Удалить заказ №${orderId}? Это действие нельзя отменить.`)) return;
    await runAction(async () => {
      await deleteOrder(token, orderId);
      setOrders((current) => current.filter((item) => item.id !== orderId));
    }, "Заказ удалён.");
  }

  async function saveUser(userId: number, role: UserRole, isActive: boolean): Promise<boolean> {
    if (!token) return false;
    return runAction(async () => {
      const updated = await updateUser(token, userId, { role, is_active: isActive });
      setUsers((current) => current.map((item) => item.id === userId ? updated : item));
    }, "Профиль пользователя обновлён.");
  }

  async function removeUser(userId: number) {
    if (!token || !window.confirm("Удалить пользователя? Если на него ссылаются заказы, удаление будет отклонено.")) return;
    await runAction(async () => {
      await deleteUser(token, userId);
      setUsers((current) => current.filter((item) => item.id !== userId));
    }, "Пользователь удалён.");
  }

  const openForm = (form: "order" | "user") => {
    setActionError("");
    setNotice("");
    setActiveForm((current) => current === form ? null : form);
  };

  return (
    <PageShell eyebrow="Операционный центр" title="Панель склада" userName={user?.username ?? ""} onLogout={logout}>
      <div className="page-intro">
        <div>
          <p className="eyebrow">{new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date())}</p>
          <h1 className="page-title">Всё под контролем.</h1>
          <p className="page-subtitle">Операции склада, состояние датчиков и движение заказов — в одном месте.</p>
        </div>
        <div className={`welcome-pill${systemIsLive ? " system-live" : ""}`}>
          <span className="system-live-dot" />
          {sensorStatusText}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button className="button-secondary" onClick={() => openForm("user")} type="button"><span aria-hidden="true">＋</span> Добавить пользователя</button>
          <button className="button-primary" onClick={() => openForm("order")} type="button"><span aria-hidden="true">＋</span> Новый заказ</button>
        </div>
      </div>

      {(loadError || actionError || sensorSocket.error || gpsSocket.error) && (
        <div className="mt-4 grid gap-2">
          {[loadError, actionError, sensorSocket.error, gpsSocket.error].filter(Boolean).map((error) => (
            <ErrorNotice key={error}>{error}</ErrorNotice>
          ))}
        </div>
      )}
      {notice && <div className="mt-4"><SuccessNotice>{notice}</SuccessNotice></div>}

      {activeForm === "order" && (
        <form className="panel panel-pad mt-5" onSubmit={(event) => void handleCreateOrder(event)}>
          <div className="panel-topline">
            <div><h2 className="panel-title">Создать заказ</h2><p className="panel-caption">Назначьте клиента и, при необходимости, курьера.</p></div>
            <button aria-label="Закрыть" className="button-quiet" onClick={() => setActiveForm(null)} type="button">✕</button>
          </div>
          {clients.length === 0 ? (
            <EmptyState title="Сначала добавьте клиента" detail="Для нового заказа нужна активная учётная запись клиента." />
          ) : (
            <>
              <div className="form-grid">
                <label className="field-label">Описание заказа
                  <input className="field" maxLength={500} onChange={(event) => setOrderDescription(event.target.value)} placeholder="Например, коробка документов" required value={orderDescription} />
                </label>
                <label className="field-label">Клиент
                  <select className="select-field" onChange={(event) => setOrderClient(event.target.value)} required value={orderClient}>
                    <option value="">Выберите клиента</option>
                    {clients.map((client) => <option key={client.id} value={client.id}>{client.username}</option>)}
                  </select>
                </label>
                <label className="field-label">Курьер <span className="field-help">Можно назначить позже</span>
                  <select className="select-field" onChange={(event) => setOrderCourier(event.target.value)} value={orderCourier}>
                    <option value="">Пока без курьера</option>
                    {couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.username}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-actions">
                <button className="button-secondary" onClick={() => setActiveForm(null)} type="button">Отмена</button>
                <button className="button-primary" disabled={creating} type="submit">{creating ? "Создаём…" : "Создать заказ"}</button>
              </div>
            </>
          )}
        </form>
      )}

      {activeForm === "user" && (
        <form className="panel panel-pad mt-5" onSubmit={(event) => void handleCreateUser(event)}>
          <div className="panel-topline">
            <div><h2 className="panel-title">Новый пользователь</h2><p className="panel-caption">Создайте доступ для команды или клиента.</p></div>
            <button aria-label="Закрыть" className="button-quiet" onClick={() => setActiveForm(null)} type="button">✕</button>
          </div>
          <div className="form-grid">
            <label className="field-label">Логин
              <input autoComplete="off" className="field" minLength={3} maxLength={64} onChange={(event) => setNewUsername(event.target.value)} required value={newUsername} />
            </label>
            <label className="field-label">Пароль
              <input autoComplete="new-password" className="field" minLength={8} maxLength={128} onChange={(event) => setNewPassword(event.target.value)} required type="password" value={newPassword} />
            </label>
            <label className="field-label">Электронная почта <span className="field-help">Необязательно</span>
              <input className="field" onChange={(event) => setNewEmail(event.target.value)} type="email" value={newEmail} />
            </label>
            <label className="field-label">Роль
              <select className="select-field" onChange={(event) => setNewRole(event.target.value as UserRole)} value={newRole}>
                <option value="client">Клиент</option>
                <option value="courier">Курьер</option>
                <option value="admin">Администратор</option>
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button className="button-secondary" onClick={() => setActiveForm(null)} type="button">Отмена</button>
            <button className="button-primary" disabled={creating} type="submit">{creating ? "Создаём…" : "Создать пользователя"}</button>
          </div>
        </form>
      )}

      {loading ? <LoadingLine /> : (
        <>
          <section aria-label="Обзор склада" className="metrics-grid mt-5">
            <MetricCard accent label="Заказов в работе" value={String(activeOrders.length).padStart(2, "0")} detail={`${deliveredOrders} доставлено за всё время`} />
            <MetricCard label="Активные маршруты" value={String(activeRoutes.length).padStart(2, "0")} detail={`${couriers.length} курьеров в системе`} />
            <MetricCard key={latestSensors.get("temperature")?.id} label="Температура" value={sensorValue("temperature")} unit={latestSensors.get("temperature")?.unit ?? "°C"} detail={sensorUpdatedAt("temperature")} />
            <MetricCard key={latestSensors.get("humidity")?.id} label="Влажность" value={sensorValue("humidity")} unit={latestSensors.get("humidity")?.unit ?? "%"} detail={sensorUpdatedAt("humidity")} />
            <MetricCard key={latestSensors.get("battery")?.id} label="Заряд датчиков" value={sensorValue("battery")} unit={latestSensors.get("battery")?.unit ?? "%"} detail={sensorUpdatedAt("battery")} />
          </section>

          <div className="dashboard-grid">
            <div className="stack">
              <section className="panel panel-pad" id="orders">
                <div className="panel-topline">
                  <div><h2 className="panel-title">Заказы</h2><p className="panel-caption">Назначайте исполнителей и следите за статусом.</p></div>
                  <span className="role-chip">{orders.length} всего</span>
                </div>
                {orders.length === 0 ? (
                  <EmptyState title="Пока нет заказов" detail="Создайте первый заказ — он появится здесь." />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Заказ</th><th>Клиент</th><th>Курьер</th><th>Статус</th><th>Действия</th></tr></thead>
                      <tbody>
                        {orders.map((order) => (
                          <ManagedOrderRow
                            key={order.id}
                            onDelete={removeOrder}
                            onSave={saveOrder}
                            order={order}
                            users={users}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="panel panel-pad" id="team">
                <div className="panel-topline">
                  <div><h2 className="panel-title">Пользователи</h2><p className="panel-caption">Роли и доступ к рабочему пространству.</p></div>
                  <span className="role-chip">{users.length} в системе</span>
                </div>
                {users.length === 0 ? (
                  <EmptyState title="Нет пользователей" detail="Добавьте пользователей, чтобы назначать заказы." />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Пользователь</th><th>Роль</th><th>Статус</th><th>Действия</th></tr></thead>
                      <tbody>
                        {users.map((account) => (
                          <ManagedUserRow
                            isCurrentUser={account.id === user?.id}
                            isReferenced={orders.some((order) => order.client_id === account.id || order.courier_id === account.id)}
                            key={account.id}
                            onDelete={removeUser}
                            onSave={saveUser}
                            user={account}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            <div className="stack">
              <section className="panel panel-pad">
                <div className="panel-topline">
                  <div><h2 className="panel-title">Склад сейчас</h2><p className="panel-caption">Последние показания телеметрии.</p></div>
                </div>
                <div className="live-list">
                  {(["temperature", "humidity", "battery", "lighting", "motion"] as const).map((type) => {
                    const reading = latestSensors.get(type);
                    const labels: Record<typeof type, string> = {
                      temperature: "Температура",
                      humidity: "Влажность",
                      battery: "Заряд сенсора",
                      lighting: "Освещение",
                      motion: "Движение",
                    };
                    const value = type === "lighting"
                      ? reading ? reading.value ? "Включено" : "Выключено" : "—"
                      : type === "motion"
                        ? reading ? reading.value ? "Обнаружено" : "Нет" : "—"
                        : reading ? `${reading.value} ${reading.unit ?? ""}` : "—";
                    return (
                      <div className="live-row" key={type}>
                        <div><p className="live-title">{labels[type]}</p><p className="live-detail">{reading ? formatDate(reading.timestamp) : "Нет данных от датчика"}</p></div>
                        <span className="live-value">{value}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="panel panel-pad">
                <div className="panel-topline">
                  <div><h2 className="panel-title">Курьеры на маршруте</h2><p className="panel-caption">Последняя известная GPS-позиция.</p></div>
                </div>
                {activeRoutes.length === 0 ? (
                  <EmptyState title="Нет активных маршрутов" detail="Назначьте курьера заказу, чтобы увидеть его здесь." />
                ) : (
                  <div className="live-list">
                    {activeRoutes.map((order) => {
                      const courier = users.find((item) => item.id === order.courier_id);
                      const position = latestGps.get(order.id);
                      return (
                        <div className="live-row" key={order.id}>
                          <div>
                            <p className="live-title">{courier?.username ?? `Курьер #${order.courier_id}`}</p>
                            <p className="live-detail">Заказ №{order.id} · {order.description}</p>
                          </div>
                          <span className="live-value">{position ? `${position.latitude.toFixed(3)}, ${position.longitude.toFixed(3)}` : "Ожидаем GPS"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="panel panel-pad" id="sensors">
                <div className="panel-topline">
                  <div><h2 className="panel-title">Недавние события</h2><p className="panel-caption">Последние показания датчиков.</p></div>
                  <span className="role-chip">{sensors.length} событий</span>
                </div>
                {sensors.length === 0 ? (
                  <EmptyState title="Пока тихо" detail="Подключите симулятор, чтобы получать события." />
                ) : (
                  <div className="sensor-grid">
                    {sensors.slice(0, 8).map((reading) => (
                      <div className="sensor-event" key={reading.id}>
                        <p className="sensor-event-type">{reading.sensor_type}</p>
                        <p className="sensor-event-value">{reading.value} <span className="metric-unit">{reading.unit}</span></p>
                        <p className="sensor-event-time">{formatDate(reading.timestamp)}</p>
                      </div>
                    ))}
                  </div>
                )}
                {lighting && motion && <p className="panel-caption mt-3">{lighting.value && motion.value ? "Есть движение при включённом освещении." : `Освещение ${lighting.value ? "включено" : "выключено"}, движения ${motion.value ? "есть" : "нет"}.`}</p>}
              </section>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
