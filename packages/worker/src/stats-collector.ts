import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

export type StatRecord = {
  method: string;
  providerId: string;
  cacheHit: boolean;
  latencyMs: number;
  error: boolean;
};

export type HourlyStats = {
  hour: number;
  providerId: string;
  method: string;
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
  totalLatencyMs: number;
  errors: number;
};

export type StatsSummary = {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRate: number;
  avgLatencyMs: number;
  errors: number;
  byProvider: Record<string, { requests: number; hitRate: number }>;
  byMethod: Record<string, { requests: number; hitRate: number }>;
};

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const truncateToHour = (ts: number): number =>
  Math.floor(ts / 3_600_000) * 3_600_000;

export class StatsCollector extends DurableObject<Env> {
  private initialized = false;

  private ensureTable(): void {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS hourly_stats (
        hour INTEGER NOT NULL,
        provider_id TEXT NOT NULL,
        method TEXT NOT NULL,
        cache_hits INTEGER DEFAULT 0,
        cache_misses INTEGER DEFAULT 0,
        total_requests INTEGER DEFAULT 0,
        total_latency_ms INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        PRIMARY KEY (hour, provider_id, method)
      )
    `);
    this.initialized = true;
  }

  async record(stat: StatRecord): Promise<void> {
    this.ensureTable();
    const hour = truncateToHour(Date.now());
    this.ctx.storage.sql.exec(
      `INSERT INTO hourly_stats (hour, provider_id, method, cache_hits, cache_misses, total_requests, total_latency_ms, errors)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(hour, provider_id, method) DO UPDATE SET
         cache_hits = cache_hits + excluded.cache_hits,
         cache_misses = cache_misses + excluded.cache_misses,
         total_requests = total_requests + 1,
         total_latency_ms = total_latency_ms + excluded.total_latency_ms,
         errors = errors + excluded.errors`,
      hour,
      stat.providerId,
      stat.method,
      stat.cacheHit ? 1 : 0,
      stat.cacheHit ? 0 : 1,
      stat.latencyMs,
      stat.error ? 1 : 0
    );
  }

  async getStats(rangeMs: number): Promise<HourlyStats[]> {
    this.ensureTable();
    const since = Date.now() - rangeMs;
    const rows = this.ctx.storage.sql
      .exec(
        "SELECT * FROM hourly_stats WHERE hour >= ? ORDER BY hour DESC",
        since
      )
      .toArray() as Array<{
        hour: number;
        provider_id: string;
        method: string;
        cache_hits: number;
        cache_misses: number;
        total_requests: number;
        total_latency_ms: number;
        errors: number;
      }>;
    return rows.map((r) => ({
      hour: r.hour,
      providerId: r.provider_id,
      method: r.method,
      cacheHits: r.cache_hits,
      cacheMisses: r.cache_misses,
      totalRequests: r.total_requests,
      totalLatencyMs: r.total_latency_ms,
      errors: r.errors,
    }));
  }

  async getSummary(): Promise<StatsSummary> {
    this.ensureTable();
    const since = Date.now() - 24 * 3_600_000;
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT provider_id, method,
                SUM(cache_hits) as hits, SUM(cache_misses) as misses,
                SUM(total_requests) as reqs, SUM(total_latency_ms) as lat,
                SUM(errors) as errs
         FROM hourly_stats WHERE hour >= ?
         GROUP BY provider_id, method`,
        since
      )
      .toArray() as Array<{
        provider_id: string;
        method: string;
        hits: number;
        misses: number;
        reqs: number;
        lat: number;
        errs: number;
      }>;

    let totalRequests = 0, cacheHits = 0, cacheMisses = 0, totalLatency = 0, errors = 0;
    const byProvider: Record<string, { requests: number; hits: number }> = {};
    const byMethod: Record<string, { requests: number; hits: number }> = {};

    for (const r of rows) {
      totalRequests += r.reqs;
      cacheHits += r.hits;
      cacheMisses += r.misses;
      totalLatency += r.lat;
      errors += r.errs;

      const p = byProvider[r.provider_id] ?? { requests: 0, hits: 0 };
      p.requests += r.reqs;
      p.hits += r.hits;
      byProvider[r.provider_id] = p;

      const m = byMethod[r.method] ?? { requests: 0, hits: 0 };
      m.requests += r.reqs;
      m.hits += r.hits;
      byMethod[r.method] = m;
    }

    const toHitRate = (d: { requests: number; hits: number }) => ({
      requests: d.requests,
      hitRate: d.requests > 0 ? d.hits / d.requests : 0,
    });

    return {
      totalRequests,
      cacheHits,
      cacheMisses,
      hitRate: totalRequests > 0 ? cacheHits / totalRequests : 0,
      avgLatencyMs: totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0,
      errors,
      byProvider: Object.fromEntries(
        Object.entries(byProvider).map(([k, v]) => [k, toHitRate(v)])
      ),
      byMethod: Object.fromEntries(
        Object.entries(byMethod).map(([k, v]) => [k, toHitRate(v)])
      ),
    };
  }

  async cleanup(): Promise<number> {
    this.ensureTable();
    const cutoff = Date.now() - THIRTY_DAYS_MS;
    const result = this.ctx.storage.sql.exec(
      "DELETE FROM hourly_stats WHERE hour < ?",
      cutoff
    );
    return result.rowsWritten;
  }

  override async alarm(): Promise<void> {
    await this.cleanup();
    await this.ctx.storage.setAlarm(Date.now() + 3_600_000);
  }
}
