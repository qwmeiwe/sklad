import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { UserRole } from "../types";

const roles: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Администратор" },
  { value: "courier", label: "Курьер" },
  { value: "client", label: "Клиент" },
];

export function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<UserRole>("admin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <div className="p-8 text-sm font-bold uppercase">Проверка сессии...</div>;
  if (user) return <Navigate to={`/${user.role}`} replace />;

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
    <main className="grid min-h-screen bg-[#F4F4F0] text-[#171717] lg:grid-cols-[1.1fr_0.9fr]">
      <section className="flex flex-col justify-between border-b-2 border-[#171717] p-8 sm:p-12 lg:border-b-0 lg:border-r-2 lg:p-16">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#FF5500]">
          Smart logistics / 01
        </p>
        <div className="py-16">
          <p className="text-xs font-bold uppercase tracking-[0.2em]">Складская телематика</p>
          <h1 className="mt-5 max-w-2xl text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-7xl">
            Движение.
            <br />
            Под контролем.
          </h1>
          <p className="mt-8 max-w-md text-sm leading-6 text-[#575750]">
            Состояние склада и маршрут доставки — в одной системе, в реальном времени.
          </p>
        </div>
        <p className="text-xs font-bold uppercase tracking-widest">Logistics control</p>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-12">
        <form className="w-full max-w-md" onSubmit={handleSubmit}>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF5500]">Авторизация</p>
          <h2 className="mt-3 text-3xl font-black uppercase">Войти в систему</h2>

          <fieldset className="mt-8">
            <legend className="mb-3 text-xs font-bold uppercase tracking-widest">Роль</legend>
            <div className="grid grid-cols-3 border-2 border-[#171717]">
              {roles.map((item) => (
                <label
                  key={item.value}
                  className={`cursor-pointer border-r border-[#171717] p-3 text-center text-[10px] font-bold uppercase last:border-r-0 sm:text-xs ${
                    role === item.value ? "bg-[#FF5500] text-white" : ""
                  }`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="role"
                    value={item.value}
                    checked={role === item.value}
                    onChange={() => setRole(item.value)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#575750]">Роль должна совпадать с ролью учётной записи.</p>
          </fieldset>

          <label className="mt-6 block text-xs font-bold uppercase tracking-widest" htmlFor="username">
            Логин
          </label>
          <input
            autoComplete="username"
            className="field mt-2"
            id="username"
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />

          <label className="mt-5 block text-xs font-bold uppercase tracking-widest" htmlFor="password">
            Пароль
          </label>
          <input
            autoComplete="current-password"
            className="field mt-2"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />

          {error && (
            <p className="mt-5 border-2 border-[#FF5500] p-3 text-sm font-bold" role="alert">
              {error}
            </p>
          )}
          <button className="button-primary mt-7 w-full" disabled={submitting} type="submit">
            {submitting ? "Входим..." : "Войти"}
          </button>
        </form>
      </section>
    </main>
  );
}
