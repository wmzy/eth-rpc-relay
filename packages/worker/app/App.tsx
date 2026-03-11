import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { Monitor } from "./pages/Monitor";
import { Providers } from "./pages/Providers";
import { TestConsole } from "./pages/TestConsole";

export const App = () => {
  const auth = useAuth();

  useEffect(() => {
    if (auth.token && !auth.verified) {
      auth.verify(auth.token);
    }
  }, []);

  if (!auth.verified) {
    if (auth.token && auth.checking) {
      return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--muted)" }}>Verifying...</div>;
    }
    return <Login onLogin={auth.verify} checking={auth.checking} error={auth.error} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout onLogout={auth.logout} />}>
          <Route index element={<Navigate to="/monitor" replace />} />
          <Route path="monitor" element={<Monitor authFetch={auth.authFetch} />} />
          <Route path="providers" element={<Providers authFetch={auth.authFetch} />} />
          <Route path="test" element={<TestConsole authFetch={auth.authFetch} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
