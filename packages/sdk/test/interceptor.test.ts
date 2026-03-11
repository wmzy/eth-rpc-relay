import { describe, it, expect, vi } from "vitest";
import { createRelayFetch } from "../src/interceptor";
import type { RelayConfig } from "../src/types";

const makeConfig = (fetchFn: typeof fetch): RelayConfig => ({
  relayUrl: "https://relay.example.com",
  fetchFn,
});

describe("createRelayFetch", () => {
  it("passes through non-POST requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const relayFetch = createRelayFetch(makeConfig(mockFetch as unknown as typeof fetch));

    await relayFetch("https://example.com", { method: "GET" });
    expect(mockFetch).toHaveBeenCalledWith("https://example.com", { method: "GET" });
  });

  it("passes through non-JSON-RPC POST requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const relayFetch = createRelayFetch(makeConfig(mockFetch as unknown as typeof fetch));

    await relayFetch("https://example.com", {
      method: "POST",
      body: "not json",
    });
    expect(mockFetch).toHaveBeenCalledWith("https://example.com", expect.anything());
  });

  it("converts single JSON-RPC request to GET", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jsonrpc: "2.0", result: "0x1", id: 1 }))
    );
    const relayFetch = createRelayFetch(makeConfig(mockFetch as unknown as typeof fetch));

    await relayFetch("https://node.example.com", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_blockNumber",
        params: [],
        id: 1,
      }),
    });

    const callUrl = mockFetch.mock.calls[0][0] as string;
    expect(callUrl).toContain("relay.example.com");
    expect(callUrl).toContain("method=eth_blockNumber");
    expect(mockFetch.mock.calls[0][1].method).toBe("GET");
  });

  it("splits batch requests into individual GET requests", async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ jsonrpc: "2.0", result: "0x1", id: 1 }))
      )
    );
    const relayFetch = createRelayFetch(makeConfig(mockFetch as unknown as typeof fetch));

    const response = await relayFetch("https://node.example.com", {
      method: "POST",
      body: JSON.stringify([
        { jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 },
        { jsonrpc: "2.0", method: "eth_chainId", params: [], id: 2 },
      ]),
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const results = await response.json();
    expect(results).toHaveLength(2);
  });

  it("optimizes eth_getLogs requests", async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", result: [{ log: 1 }], id: 1 })
        )
      )
    );
    const relayFetch = createRelayFetch({
      ...makeConfig(mockFetch as unknown as typeof fetch),
      logsChunkSize: 500,
    });

    await relayFetch("https://node.example.com", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_getLogs",
        params: [{ fromBlock: "0x0", toBlock: "0x3e8" }], // 0 to 1000
        id: 1,
      }),
    });

    expect(mockFetch).toHaveBeenCalledTimes(3); // 0-499, 500-999, 1000-1000
  });
});
