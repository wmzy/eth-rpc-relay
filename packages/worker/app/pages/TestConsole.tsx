import { useState, useEffect, useRef } from "react";

type Provider = { id: string; name: string; isDefault: boolean };

type ResultEntry = {
  id: number;
  method: string;
  status: number;
  cacheControl: string;
  elapsed: number;
  body: string;
};

const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

const PRESETS: Record<string, unknown> = {
  chainId: { jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 },
  blockNumber: { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 },
  balance: { jsonrpc: "2.0", method: "eth_getBalance", params: [VITALIK, "latest"], id: 1 },
  block: { jsonrpc: "2.0", method: "eth_getBlockByNumber", params: ["finalized", false], id: 1 },
  batch: [
    { jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 },
    { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 2 },
    { jsonrpc: "2.0", method: "eth_getBalance", params: [VITALIK, "latest"], id: 3 },
  ],
  logs: { jsonrpc: "2.0", method: "eth_getLogs", params: [{ fromBlock: "0x13B7BBE", toBlock: "0x13B7BC6", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" }], id: 1 },
};

const serializeToGetUrl = (base: string, req: { method: string; params?: unknown[]; id: number | string }) => {
  const url = new URL(`${base.replace(/\/$/, "")}/rpc`);
  url.searchParams.set("method", req.method);
  if (req.params?.length) url.searchParams.set("params", JSON.stringify(req.params));
  url.searchParams.set("id", String(req.id));
  const s = url.toString();
  return s.length <= 2048 ? s : null;
};

const serializeRequest = (base: string, req: { method: string; params?: unknown[]; id: number | string }) => {
  const g = serializeToGetUrl(base, req);
  if (g) return { url: g, method: "GET" as const, body: undefined as string | undefined };
  return { url: `${base.replace(/\/$/, "")}/rpc`, method: "POST" as const, body: JSON.stringify(req) };
};

let nextId = 1;

export const TestConsole = () => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerId, setProviderId] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [customBody, setCustomBody] = useState("");
  const [results, setResults] = useState<ResultEntry[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState("Ready.\n");

  useEffect(() => {
    fetch("/api/providers").then((r) => r.json() as Promise<Provider[]>).then((list) => {
      setProviders(list);
      const def = list.find((p) => p.isDefault);
      if (def) setProviderId(def.id);
      else if (list.length > 0) setProviderId(list[0].id);
    });
  }, []);

  const appendLog = (msg: string) => setLog((prev) => prev + msg + "\n");

  const send = async (rpcBody: unknown) => {
    if (!providerId) {
      appendLog("ERROR: No provider selected. Add one in the Providers page first.");
      return;
    }

    const method = Array.isArray(rpcBody) ? `batch[${rpcBody.length}]` : ((rpcBody as { method?: string }).method ?? "unknown");
    appendLog(`→ ${method}`);

    const relay = location.origin;
    const headers: Record<string, string> = { "X-Provider-Id": providerId };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

    const t0 = performance.now();

    const doFetch = async (req: { method: string; params?: unknown[]; id: number | string }) => {
      const s = serializeRequest(relay, req);
      return fetch(s.url, {
        method: s.method,
        headers: { ...headers, ...(s.body ? { "Content-Type": "application/json" } : {}) },
        body: s.body,
      });
    };

    try {
      let resp: Response;
      if (Array.isArray(rpcBody)) {
        const resps = await Promise.all(rpcBody.map((r: { method: string; params?: unknown[]; id: number | string }, i: number) => doFetch({ ...r, id: r.id ?? i + 1 })));
        const bodies = await Promise.all(resps.map((r) => r.json()));
        resp = new Response(JSON.stringify(bodies), { headers: { "Content-Type": "application/json" } });
      } else {
        resp = await doFetch(rpcBody as { method: string; params?: unknown[]; id: number | string });
      }

      const elapsed = Math.round(performance.now() - t0);
      const body = await resp.clone().text();
      const entry: ResultEntry = {
        id: nextId++,
        method,
        status: resp.status,
        cacheControl: resp.headers.get("cache-control") ?? "",
        elapsed,
        body,
      };
      setResults((prev) => [entry, ...prev]);
      appendLog(`← ${method} ${resp.status} in ${elapsed}ms`);
    } catch (e) {
      appendLog(`ERROR: ${(e as Error).message}`);
    }
  };

  const runPreset = (name: string) => {
    const body = PRESETS[name];
    setCustomBody(JSON.stringify(body, null, 2));
    send(body);
  };

  const sendCustom = () => {
    try { send(JSON.parse(customBody)); } catch (e) { appendLog(`Invalid JSON: ${(e as Error).message}`); }
  };

  return (
    <div>
      <h2 className="page-title">Test Console</h2>

      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "1.5rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="form-group">
            <label>Provider</label>
            <select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="" disabled>— Select a provider —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}{p.isDefault ? " (default)" : ""}</option>
              ))}
            </select>
            {providers.length === 0 && (
              <div style={{ fontSize: ".72rem", color: "var(--orange)", marginTop: ".3rem" }}>
                No providers configured. <a href="/providers">Add one first →</a>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Your RPC Token</label>
            <input type="password" value={authToken} onChange={(e) => setAuthToken(e.target.value)} placeholder="Your Alchemy/Infura API key..." />
            <div style={{ fontSize: ".65rem", color: "var(--muted)", marginTop: ".2rem" }}>
              Passed to the upstream provider for authentication. Cached responses are shared across all users.
            </div>
          </div>

          <div>
            <label>Presets</label>
            <div className="btn-row">
              {Object.keys(PRESETS).map((name) => (
                <button key={name} className="btn-secondary btn-sm" onClick={() => runPreset(name)}>{name}</button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>Custom JSON-RPC</label>
            <textarea value={customBody} onChange={(e) => setCustomBody(e.target.value)} rows={5} placeholder='{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' />
            <div className="btn-row" style={{ marginTop: ".5rem" }}>
              <button className="btn-primary" onClick={sendCustom}>Send</button>
            </div>
          </div>

          <div className="form-group">
            <label>Activity Log</label>
            <div ref={logRef} style={{ fontFamily: "var(--mono)", fontSize: ".7rem", color: "var(--muted)", lineHeight: 1.7, whiteSpace: "pre-wrap", maxHeight: 120, overflowY: "auto", background: "var(--surface)", borderRadius: 6, padding: ".6rem .8rem", border: "1px solid var(--border)" }}>
              {log}
            </div>
          </div>
        </div>

        <div>
          {results.length === 0 && <div className="empty">Send a request to see results here.</div>}
          {results.map((r) => (
            <div key={r.id} className="result-card">
              <div className="result-header">
                <span style={{ color: "var(--accent2)", fontWeight: 700 }}>{r.method}</span>
                <span>
                  <span className={`badge ${r.cacheControl.includes("immutable") ? "badge-green" : r.status === 304 ? "badge-orange" : "badge-red"}`}>
                    {r.cacheControl.includes("immutable") ? "IMMUTABLE" : r.status === 304 ? "304" : "MISS"}
                  </span>
                  {" "}
                  <span style={{ color: "var(--muted)" }}>{r.elapsed}ms · {r.status} · {r.cacheControl || "no cache header"}</span>
                </span>
              </div>
              <div className="result-body">{(() => { try { return JSON.stringify(JSON.parse(r.body), null, 2); } catch { return r.body; } })()}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
