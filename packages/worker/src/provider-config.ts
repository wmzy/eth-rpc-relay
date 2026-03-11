import { DurableObject } from "cloudflare:workers";
import type { Env } from "./types";

export type AuthType = "none" | "bearer" | "api-key" | "url-param";

export type Provider = {
  id: string;
  name: string;
  upstreamUrl: string;
  authType: AuthType;
  tokenRequired: boolean;
  chainId: number;
  blockTimeMs: number;
  isDefault: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type ProviderInput = Omit<Provider, "createdAt" | "updatedAt">;

type ProviderRow = {
  id: string;
  name: string;
  upstream_url: string;
  auth_type: string;
  token_required: number;
  chain_id: number;
  block_time_ms: number;
  is_default: number;
  enabled: number;
  created_at: number;
  updated_at: number;
};

const rowToProvider = (row: ProviderRow): Provider => ({
  id: row.id,
  name: row.name,
  upstreamUrl: row.upstream_url,
  authType: row.auth_type as AuthType,
  tokenRequired: row.token_required === 1,
  chainId: row.chain_id,
  blockTimeMs: row.block_time_ms,
  isDefault: row.is_default === 1,
  enabled: row.enabled === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class ProviderConfig extends DurableObject<Env> {
  private initialized = false;

  private ensureTable(): void {
    if (this.initialized) return;
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        upstream_url TEXT NOT NULL,
        auth_type TEXT DEFAULT 'none',
        token_required INTEGER DEFAULT 0,
        chain_id INTEGER DEFAULT 1,
        block_time_ms INTEGER DEFAULT 12000,
        is_default INTEGER DEFAULT 0,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY)
    `);
    const migrated = this.ctx.storage.sql
      .exec("SELECT 1 FROM _migrations WHERE key = 'add_token_required'")
      .toArray();
    if (migrated.length === 0) {
      try {
        this.ctx.storage.sql.exec("ALTER TABLE providers ADD COLUMN token_required INTEGER DEFAULT 0");
      } catch { /* column may already exist from CREATE TABLE */ }
      this.ctx.storage.sql.exec("INSERT OR IGNORE INTO _migrations (key) VALUES ('add_token_required')");
    }
    this.initialized = true;
  }

  async listProviders(): Promise<Provider[]> {
    this.ensureTable();
    const rows = this.ctx.storage.sql
      .exec("SELECT * FROM providers ORDER BY is_default DESC, name ASC")
      .toArray() as ProviderRow[];
    return rows.map(rowToProvider);
  }

  async getProvider(id: string): Promise<Provider | null> {
    this.ensureTable();
    const rows = this.ctx.storage.sql
      .exec("SELECT * FROM providers WHERE id = ?", id)
      .toArray() as ProviderRow[];
    return rows[0] ? rowToProvider(rows[0]) : null;
  }

  async getDefaultProvider(): Promise<Provider | null> {
    this.ensureTable();
    const rows = this.ctx.storage.sql
      .exec("SELECT * FROM providers WHERE is_default = 1 AND enabled = 1 LIMIT 1")
      .toArray() as ProviderRow[];
    if (rows[0]) return rowToProvider(rows[0]);
    const fallback = this.ctx.storage.sql
      .exec("SELECT * FROM providers WHERE enabled = 1 LIMIT 1")
      .toArray() as ProviderRow[];
    return fallback[0] ? rowToProvider(fallback[0]) : null;
  }

  async upsertProvider(input: ProviderInput): Promise<Provider> {
    this.ensureTable();
    const now = Date.now();

    if (input.isDefault) {
      this.ctx.storage.sql.exec("UPDATE providers SET is_default = 0 WHERE is_default = 1");
    }

    this.ctx.storage.sql.exec(
      `INSERT INTO providers (id, name, upstream_url, auth_type, token_required, chain_id, block_time_ms, is_default, enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         upstream_url = excluded.upstream_url,
         auth_type = excluded.auth_type,
         token_required = excluded.token_required,
         chain_id = excluded.chain_id,
         block_time_ms = excluded.block_time_ms,
         is_default = excluded.is_default,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      input.id,
      input.name,
      input.upstreamUrl,
      input.authType,
      input.tokenRequired ? 1 : 0,
      input.chainId,
      input.blockTimeMs,
      input.isDefault ? 1 : 0,
      input.enabled ? 1 : 0,
      now,
      now
    );

    return (await this.getProvider(input.id))!;
  }

  async deleteProvider(id: string): Promise<boolean> {
    this.ensureTable();
    this.ctx.storage.sql.exec("DELETE FROM providers WHERE id = ?", id);
    return true;
  }
}
