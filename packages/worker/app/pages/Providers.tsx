import { useState, useEffect, useCallback } from "react";

type AuthType = "none" | "bearer" | "api-key" | "url-param";

type Provider = {
  id: string;
  name: string;
  upstreamUrl: string;
  authType: AuthType;
  chainId: number;
  blockTimeMs: number;
  isDefault: boolean;
  enabled: boolean;
};

const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  none: "None",
  bearer: "Bearer Token (Authorization header)",
  "api-key": "API Key (appended to URL path)",
  "url-param": "API Key (query parameter ?key=…)",
};

const EMPTY: Provider = {
  id: "", name: "", upstreamUrl: "", authType: "none",
  chainId: 1, blockTimeMs: 12000, isDefault: false, enabled: true,
};

export const Providers = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [editing, setEditing] = useState<Provider | null>(null);
  const [isNew, setIsNew] = useState(false);

  const load = useCallback(() => {
    fetch("/api/providers").then((r) => r.json() as Promise<Provider[]>).then(setProviders);
  }, []);

  useEffect(load, [load]);

  const save = async () => {
    if (!editing) return;
    const method = isNew ? "POST" : "PUT";
    const url = isNew ? "/api/providers" : `/api/providers/${editing.id}`;
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    setEditing(null);
    load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/providers/${id}`, { method: "DELETE" });
    load();
  };

  const openNew = () => { setEditing({ ...EMPTY }); setIsNew(true); };
  const openEdit = (p: Provider) => { setEditing({ ...p }); setIsNew(false); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 className="page-title" style={{ margin: 0 }}>Providers</h2>
        <button className="btn-primary" onClick={openNew}>+ Add Provider</button>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr><th>ID</th><th>Name</th><th>Upstream URL</th><th>Token Mode</th><th>Chain</th><th>Default</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <td style={{ fontFamily: "var(--mono)", fontSize: ".75rem" }}>{p.id}</td>
                <td>{p.name}</td>
                <td style={{ fontFamily: "var(--mono)", fontSize: ".72rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.upstreamUrl}</td>
                <td><span className="badge badge-muted">{p.authType}</span></td>
                <td>{p.chainId}</td>
                <td>{p.isDefault ? <span className="badge badge-green">Default</span> : "—"}</td>
                <td>{p.enabled ? <span className="badge badge-green">Active</span> : <span className="badge badge-red">Disabled</span>}</td>
                <td>
                  <div className="btn-row">
                    <button className="btn-secondary btn-sm" onClick={() => openEdit(p)}>Edit</button>
                    <button className="btn-danger btn-sm" onClick={() => remove(p.id)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {providers.length === 0 && <div className="empty mt-1">No providers configured. Click "Add Provider" to get started.</div>}
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{isNew ? "Add Provider" : `Edit: ${editing.id}`}</h2>

            <div className="form-row">
              <div className="form-group">
                <label>Provider ID</label>
                <input value={editing.id} disabled={!isNew} onChange={(e) => setEditing({ ...editing, id: e.target.value })} placeholder="alchemy-eth" />
              </div>
              <div className="form-group">
                <label>Display Name</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Alchemy Ethereum" />
              </div>
            </div>

            <div className="form-group">
              <label>Upstream RPC URL (base URL, without API key)</label>
              <input value={editing.upstreamUrl} onChange={(e) => setEditing({ ...editing, upstreamUrl: e.target.value })} placeholder="https://eth-mainnet.g.alchemy.com/v2" />
            </div>

            <div className="form-group">
              <label>Client Token Mode</label>
              <select value={editing.authType} onChange={(e) => setEditing({ ...editing, authType: e.target.value as AuthType })}>
                {Object.entries(AUTH_TYPE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>{label}</option>
                ))}
              </select>
              <div style={{ fontSize: ".65rem", color: "var(--muted)", marginTop: ".3rem" }}>
                {editing.authType === "none" && "Client tokens are ignored. Upstream URL is called as-is."}
                {editing.authType === "api-key" && `Client token is appended to URL path: ${editing.upstreamUrl.replace(/\/$/, "")}/\{token\}`}
                {editing.authType === "bearer" && "Client token is sent as: Authorization: Bearer {token}"}
                {editing.authType === "url-param" && "Client token is sent as query parameter: ?key={token}"}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Chain ID</label>
                <input type="number" value={editing.chainId} onChange={(e) => setEditing({ ...editing, chainId: Number(e.target.value) })} />
              </div>
              <div className="form-group">
                <label>Block Time (ms)</label>
                <input type="number" value={editing.blockTimeMs} onChange={(e) => setEditing({ ...editing, blockTimeMs: Number(e.target.value) })} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label><input type="checkbox" checked={editing.isDefault} onChange={(e) => setEditing({ ...editing, isDefault: e.target.checked })} style={{ width: "auto", marginRight: ".4rem" }} />Set as Default</label>
              </div>
              <div className="form-group">
                <label><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} style={{ width: "auto", marginRight: ".4rem" }} />Enabled</label>
              </div>
            </div>

            <div className="btn-row" style={{ marginTop: "1rem" }}>
              <button className="btn-primary" onClick={save}>Save</button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
