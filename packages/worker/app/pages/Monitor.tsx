import { useState, useEffect } from "react";
import { StatsCard } from "../components/StatsCard";

type Summary = {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  avgLatencyMs: number;
  errors: number;
  byProvider: Record<string, { requests: number; hitRate: number }>;
  byMethod: Record<string, { requests: number; hitRate: number }>;
};

type HourlyStat = {
  hour: number;
  providerId: string;
  method: string;
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
  totalLatencyMs: number;
  errors: number;
};

const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const formatHour = (ts: number) => {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:00`;
};

export const Monitor = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [hourly, setHourly] = useState<HourlyStat[]>([]);
  const [range, setRange] = useState("24h");

  useEffect(() => {
    fetch("/api/stats/summary").then((r) => r.json() as Promise<Summary>).then(setSummary);
    fetch(`/api/stats?range=${range}`).then((r) => r.json() as Promise<HourlyStat[]>).then(setHourly);
  }, [range]);

  const hourlyAgg = (() => {
    const map = new Map<number, { hits: number; misses: number }>();
    for (const s of hourly) {
      const prev = map.get(s.hour) ?? { hits: 0, misses: 0 };
      map.set(s.hour, { hits: prev.hits + s.cacheHits, misses: prev.misses + s.cacheMisses });
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  })();

  const maxTotal = Math.max(1, ...hourlyAgg.map(([, v]) => v.hits + v.misses));

  return (
    <div>
      <h2 className="page-title">Monitor</h2>

      {!summary ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          <div className="stats-grid">
            <StatsCard value={summary.totalRequests.toLocaleString()} label="Total Requests (24h)" />
            <StatsCard value={formatRate(summary.hitRate)} label="Cache Hit Rate" />
            <StatsCard value={`${summary.avgLatencyMs}ms`} label="Avg Latency" />
            <StatsCard value={summary.errors.toLocaleString()} label="Errors" />
          </div>

          {hourlyAgg.length > 0 && (
            <div className="card" style={{ marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <label style={{ margin: 0 }}>Requests by Hour</label>
                <div className="btn-row">
                  {["1h", "24h", "7d"].map((r) => (
                    <button key={r} className={range === r ? "btn-primary btn-sm" : "btn-secondary btn-sm"} onClick={() => setRange(r)}>{r}</button>
                  ))}
                </div>
              </div>
              <div className="bar-chart">
                {hourlyAgg.map(([hour, v]) => {
                  const total = v.hits + v.misses;
                  const hitH = Math.round((v.hits / maxTotal) * 100);
                  const missH = Math.round((v.misses / maxTotal) * 100);
                  return (
                    <div className="bar-col" key={hour} title={`${formatHour(hour)}: ${total} reqs (${v.hits} hits, ${v.misses} misses)`}>
                      <div className="bar-hit" style={{ height: `${hitH}px` }} />
                      <div className="bar-miss" style={{ height: `${missH}px` }} />
                      {hourlyAgg.length <= 24 && <span className="bar-label">{formatHour(hour)}</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: "1rem", marginTop: ".8rem", fontSize: ".7rem" }}>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--green)", borderRadius: 2, marginRight: 4 }} />Cache Hit</span>
                <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--red)", borderRadius: 2, marginRight: 4 }} />Cache Miss</span>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="card">
              <label>By Provider</label>
              <table>
                <thead><tr><th>Provider</th><th>Requests</th><th>Hit Rate</th></tr></thead>
                <tbody>
                  {Object.entries(summary.byProvider).map(([id, v]) => (
                    <tr key={id}><td>{id}</td><td>{v.requests}</td><td>{formatRate(v.hitRate)}</td></tr>
                  ))}
                </tbody>
              </table>
              {Object.keys(summary.byProvider).length === 0 && <div className="empty mt-1">No data yet</div>}
            </div>
            <div className="card">
              <label>By Method</label>
              <table>
                <thead><tr><th>Method</th><th>Requests</th><th>Hit Rate</th></tr></thead>
                <tbody>
                  {Object.entries(summary.byMethod).map(([m, v]) => (
                    <tr key={m}><td style={{ fontFamily: "var(--mono)", fontSize: ".75rem" }}>{m}</td><td>{v.requests}</td><td>{formatRate(v.hitRate)}</td></tr>
                  ))}
                </tbody>
              </table>
              {Object.keys(summary.byMethod).length === 0 && <div className="empty mt-1">No data yet</div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
