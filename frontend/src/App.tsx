import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { AdminPage } from "./pages/AdminPage";
import { CourierPage } from "./pages/CourierPage";
import { ClientPage } from "./pages/ClientPage";
import type { UserRole } from "./types";
import type { ReactNode } from "react";

function RoleRoute({ role, children }: { role: UserRole; children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm font-bold uppercase">Проверка сессии...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />;
  return children;
}

export function App() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={<RoleRoute role="admin"><AdminPage /></RoleRoute>}
      />
      <Route
        path="/courier"
        element={<RoleRoute role="courier"><CourierPage /></RoleRoute>}
      />
      <Route
        path="/client"
        element={<RoleRoute role="client"><ClientPage /></RoleRoute>}
      />
      <Route
        path="*"
        element={<Navigate to={user ? `/${user.role}` : "/login"} replace />}
      />
    </Routes>
  );
}
