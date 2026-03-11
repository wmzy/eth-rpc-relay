import { describe, it, expect } from "vitest";
import type { StatRecord } from "../src/stats-collector";

const makeStat = (overrides: Partial<StatRecord> = {}): StatRecord => ({
  method: "eth_blockNumber",
  providerId: "test-provider",
  cacheHit: false,
  latencyMs: 50,
  error: false,
  ...overrides,
});

describe("StatRecord structure", () => {
  it("creates a valid stat record", () => {
    const stat = makeStat();
    expect(stat.method).toBe("eth_blockNumber");
    expect(stat.providerId).toBe("test-provider");
    expect(stat.cacheHit).toBe(false);
    expect(stat.latencyMs).toBe(50);
    expect(stat.error).toBe(false);
  });

  it("represents a cache hit", () => {
    const stat = makeStat({ cacheHit: true, latencyMs: 2 });
    expect(stat.cacheHit).toBe(true);
    expect(stat.latencyMs).toBe(2);
  });

  it("represents an error", () => {
    const stat = makeStat({ error: true, latencyMs: 5000 });
    expect(stat.error).toBe(true);
  });
});
