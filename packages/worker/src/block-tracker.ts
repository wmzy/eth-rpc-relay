import { DurableObject } from "cloudflare:workers";
import type { BlockState, Env } from "./types";

const REFRESH_INTERVAL_MS = 6000;

export class BlockTracker extends DurableObject<Env> {
  private state: BlockState = { latest: 0, finalized: 0, updatedAt: 0 };
  private initialized = false;

  private ensureTable(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS block_state (
        id INTEGER PRIMARY KEY DEFAULT 1,
        latest INTEGER NOT NULL DEFAULT 0,
        finalized INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  private loadState(): void {
    if (this.initialized) return;
    this.ensureTable();
    const row = this.ctx.storage.sql
      .exec("SELECT latest, finalized, updated_at FROM block_state WHERE id = 1")
      .toArray()[0] as { latest: number; finalized: number; updated_at: number } | undefined;
    if (row) {
      this.state = {
        latest: row.latest,
        finalized: row.finalized,
        updatedAt: row.updated_at,
      };
    }
    this.initialized = true;
  }

  private saveState(): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO block_state (id, latest, finalized, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET latest = ?, finalized = ?, updated_at = ?`,
      this.state.latest,
      this.state.finalized,
      this.state.updatedAt,
      this.state.latest,
      this.state.finalized,
      this.state.updatedAt
    );
  }

  async getBlockState(): Promise<BlockState> {
    this.loadState();
    return { ...this.state };
  }

  async updateBlockState(url: string, headers: Record<string, string>): Promise<BlockState> {
    this.loadState();

    const now = Date.now();
    if (now - this.state.updatedAt < REFRESH_INTERVAL_MS) {
      return { ...this.state };
    }

    const [latestResult, finalizedResult] = await Promise.all([
      this.fetchBlockNumber(url, headers, "latest"),
      this.fetchBlockNumber(url, headers, "finalized"),
    ]);

    if (latestResult !== null) this.state.latest = latestResult;
    if (finalizedResult !== null) this.state.finalized = finalizedResult;
    this.state.updatedAt = now;

    this.saveState();
    return { ...this.state };
  }

  async scheduleRefresh(url: string, headers: Record<string, string>): Promise<void> {
    this.loadState();
    const alarm = await this.ctx.storage.getAlarm();
    if (!alarm) {
      await this.ctx.storage.setAlarm(Date.now() + REFRESH_INTERVAL_MS);
    }
    await this.ctx.storage.put("upstreamUrl", url);
    await this.ctx.storage.put("upstreamHeaders", headers);
  }

  override async alarm(): Promise<void> {
    const url = (await this.ctx.storage.get("upstreamUrl")) as string | undefined;
    const headers = ((await this.ctx.storage.get("upstreamHeaders")) ?? {}) as Record<string, string>;
    if (url) {
      await this.updateBlockState(url, headers);
      await this.ctx.storage.setAlarm(Date.now() + REFRESH_INTERVAL_MS);
    }
  }

  private async fetchBlockNumber(
    url: string,
    authHeaders: Record<string, string>,
    tag: "latest" | "finalized"
  ): Promise<number | null> {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_getBlockByNumber",
          params: [tag, false],
          id: 1,
        }),
      });
      const data = (await resp.json()) as { result?: { number?: string } };
      return data.result?.number ? parseInt(data.result.number, 16) : null;
    } catch {
      return null;
    }
  }
}
