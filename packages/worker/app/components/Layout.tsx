import { NavLink, Outlet } from "react-router-dom";

type LayoutProps = { onLogout: () => void };

export const Layout = ({ onLogout }: LayoutProps) => (
  <>
    <aside className="sidebar">
      <div className="sidebar-brand">
        <h1>ETH RPC Relay<span className="tag">Dashboard</span></h1>
      </div>
      <nav>
        <NavLink to="/monitor" className={({ isActive }) => isActive ? "active" : ""}>Monitor</NavLink>
        <NavLink to="/providers" className={({ isActive }) => isActive ? "active" : ""}>Providers</NavLink>
        <NavLink to="/test" className={({ isActive }) => isActive ? "active" : ""}>Test Console</NavLink>
      </nav>
      <div style={{ marginTop: "auto", padding: "1rem 1.2rem", borderTop: "1px solid var(--border)" }}>
        <button className="btn-secondary btn-sm" style={{ width: "100%" }} onClick={onLogout}>Logout</button>
      </div>
    </aside>
    <main className="main-content">
      <Outlet />
    </main>
  </>
);
