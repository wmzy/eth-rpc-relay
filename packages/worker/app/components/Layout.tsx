import { NavLink, Outlet } from "react-router-dom";

export const Layout = () => (
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
    </aside>
    <main className="main-content">
      <Outlet />
    </main>
  </>
);
