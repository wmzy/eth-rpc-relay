import { describe, it, expect, vi } from "vitest";
import { splitBatch, sendBatchAsSplitRequests } from "../src/batch-handler";
import type { JsonRpcRequest, RelayConfig } from "../src/types";

const makeReq = (method: string, id: number): JsonRpcRequest => ({
  jsonrpc: "2.0",
  method,
  params: [],
  id,
});

describe("splitBatch", () => {
  it("preserves existing IDs", () => {
    const batch = [makeReq("eth_blockNumber", 1), makeReq("eth_chainId", 2)];
    const split = splitBatch(batch);
    expect(split[0].id).toBe(1);
    expect(split[1].id).toBe(2);
  });
});

describe("sendBatchAsSplitRequests", () => {
  it("sends individual requests for each batch item", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ jsonrpc: "2.0", result: "0x1", id: 1 }),
    });

    const config: RelayConfig = {
      relayUrl: "https://relay.example.com",
      fetchFn: mockFetch as unknown as typeof fetch,
    };

    const batch = [makeReq("eth_blockNumber", 1), makeReq("eth_chainId", 2)];
    const results = await sendBatchAsSplitRequests(batch, config);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
  });

  it("includes auth headers when configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ jsonrpc: "2.0", result: "0x1", id: 1 }),
    });

    const config: RelayConfig = {
      relayUrl: "https://relay.example.com",
      token: "my-token",
      providerId: "provider-1",
      fetchFn: mockFetch as unknown as typeof fetch,
    };

    await sendBatchAsSplitRequests([makeReq("eth_blockNumber", 1)], config);

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers["Authorization"]).toBe("Bearer my-token");
    expect(callArgs[1].headers["X-Provider-Id"]).toBe("provider-1");
  });
});
