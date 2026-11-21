import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ErrorNotice, LoadingLine, roleLabels } from "../components/ui";
import type { UserRole } from "../types";

const demoAccounts: { role: UserRole; username: string; password: string; label: string }[] = [
  { role: "admin", username: "demo_admin", password: "DemoAdmin123!", label: "Администратор" },
  { role: "courier", username: "demo_courier", password: "DemoCourier123!", label: "Курьер" },
  { role: "client", username: "demo_client", password: "DemoClient123!", label: "Клиент" },
];

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <LoadingLine />;
  if (user) return <Navigate to={`/${user.role}`} replace />;

  function chooseDemo(account: (typeof demoAccounts)[number]) {
    setRole(account.role);
    setUsername(account.username);
    setPassword(account.password);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password, role);
      navigate(`/${role}`, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить вход.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-visual">
        <div className="login-logo">
          <span aria-hidden="true" className="brand-mark">с</span>
          <span>склад.</span>
        </div>
        <div className="login-copy">
          <p className="login-kicker">Логистика, которая движется</p>
          <h1 className="login-headline">Всё на своём<br />месте. <em>И в пути.</em></h1>
          <p className="login-description">
            Заказы, склад и маршруты — в одном спокойном рабочем пространстве. Актуальные данные без лишнего шума.
          </p>
        </div>
        <div className="login-stats">
          <div><p className="login-stat-value">24 / 7</p><p className="login-stat-label">Контроль операций</p></div>
          <div><p className="login-stat-value">Live</p><p className="login-stat-label">Телеметрия и маршруты</p></div>
          <div><p className="login-stat-value">3 роли</p><p className="login-stat-label">Одно рабочее место</p></div>
        </div>
      </section>

      <section className="login-form-side">
        <form className="login-form" onSubmit={handleSubmit}>
          <p className="eyebrow">Рабочее пространство</p>
          <h2 className="login-form-heading">Рады видеть вас</h2>
          <p className="login-form-subtitle">Войдите в систему, чтобы продолжить работу.</p>

          <div className="demo-heading">
            <span>Быстрый вход</span>
            <span className="demo-label">Демо-аккаунты</span>
          </div>
          <div className="demo-options">
            {demoAccounts.map((account) => (
              <button
                aria-pressed={username === account.username}
                className={`demo-option${username === account.username ? " is-selected" : ""}`}
                key={account.role}
                onClick={() => chooseDemo(account)}
                type="button"
              >
                <strong>{account.label}</strong>
                <span>{account.username}</span>
              </button>
            ))}
          </div>

          <label className="login-field" htmlFor="username">
            Логин
            <input
              autoComplete="username"
              className="field"
              id="username"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Ваш логин"
              required
              value={username}
            />
          </label>

          <label className="login-field" htmlFor="password">
            Пароль
            <input
              autoComplete="current-password"
              className="field"
              id="password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Ваш пароль"
              required
              type="password"
              value={password}
            />
          </label>
          <input name="role" type="hidden" value={role} />
          <p className="field-help">Роль: {roleLabels[role]} · проверяется по учётной записи</p>

          {error && <div className="mt-4"><ErrorNotice>{error}</ErrorNotice></div>}
          <button className="button-primary login-submit" disabled={submitting} type="submit">
            {submitting ? "Подключаемся…" : "Войти в систему"}
            <span aria-hidden="true">↗</span>
          </button>
          <p className="login-footer">Демо-доступы предназначены для локальной разработки.</p>
        </form>
      </section>
    </main>
  );
}
