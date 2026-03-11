import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

type CacheEntry = {
  body: string;
  etag: string;
  expiresAt: number;
  headers: Record<string, string>;
};

export class CacheStore extends DurableObject<Env> {
  private initialized = false;

  private ensureTable(): void {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        body TEXT NOT NULL,
        etag TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        headers TEXT NOT NULL DEFAULT '{}'
      )
    `);
    this.ctx.storage.sql.exec(
      "CREATE INDEX IF NOT EXISTS idx_expires ON cache_entries(expires_at)"
    );
    this.initialized = true;
  }

  async get(key: string): Promise<CacheEntry | null> {
    this.ensureTable();
    const row = this.ctx.storage.sql
      .exec("SELECT body, etag, expires_at, headers FROM cache_entries WHERE key = ?", key)
      .toArray()[0] as
      | { body: string; etag: string; expires_at: number; headers: string }
      | undefined;

    if (!row) return null;
    if (row.expires_at < Date.now()) {
      this.ctx.storage.sql.exec("DELETE FROM cache_entries WHERE key = ?", key);
      return null;
    }

    return {
      body: row.body,
      etag: row.etag,
      expiresAt: row.expires_at,
      headers: JSON.parse(row.headers),
    };
  }

  async put(
    key: string,
    body: string,
    etag: string,
    ttlSeconds: number,
    headers: Record<string, string> = {}
  ): Promise<void> {
    this.ensureTable();
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.ctx.storage.sql.exec(
      `INSERT INTO cache_entries (key, body, etag, expires_at, headers)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET body = ?, etag = ?, expires_at = ?, headers = ?`,
      key,
      body,
      etag,
      expiresAt,
      JSON.stringify(headers),
      body,
      etag,
      expiresAt,
      JSON.stringify(headers)
    );
  }

  async remove(key: string): Promise<void> {
    this.ensureTable();
    this.ctx.storage.sql.exec("DELETE FROM cache_entries WHERE key = ?", key);
  }

  async cleanup(): Promise<number> {
    this.ensureTable();
    const result = this.ctx.storage.sql.exec(
      "DELETE FROM cache_entries WHERE expires_at < ?",
      Date.now()
    );
    return result.rowsWritten;
  }

  override async alarm(): Promise<void> {
    await this.cleanup();
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }
}
