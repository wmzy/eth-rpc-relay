import { describe, it, expect, vi } from "vitest";
import { splitLogRange, fetchLogsOptimized } from "../src/logs-optimizer";
import type { JsonRpcRequest, RelayConfig } from "../src/types";

describe("splitLogRange", () => {
  it("does not split small ranges", () => {
    const filter = { fromBlock: "0x1", toBlock: "0x100" };
    const chunks = splitLogRange(filter, 1000);
    expect(chunks).toHaveLength(1);
  });

  it("splits large ranges into chunks", () => {
    const filter = { fromBlock: "0x0", toBlock: "0x1388" }; // 0 to 5000
    const chunks = splitLogRange(filter, 1000);
    expect(chunks).toHaveLength(6);
    expect(chunks[0].fromBlock).toBe("0x0");
    expect(chunks[0].toBlock).toBe("0x3e7"); // 999
    expect(chunks[5].fromBlock).toBe("0x1388"); // 5000
    expect(chunks[5].toBlock).toBe("0x1388"); // 5000
  });

  it("preserves filter fields across chunks", () => {
    const filter = {
      fromBlock: "0x0",
      toBlock: "0x7d0", // 2000
      address: "0xabc",
      topics: ["0xdef"],
    };
    const chunks = splitLogRange(filter, 1000);
    expect(chunks).toHaveLength(3); // 0-999, 1000-1999, 2000-2000
    expect(chunks[0].address).toBe("0xabc");
    expect(chunks[1].topics).toEqual(["0xdef"]);
  });

  it("handles non-hex block tags gracefully", () => {
    const filter = { fromBlock: "latest", toBlock: "latest" };
    const chunks = splitLogRange(filter);
    expect(chunks).toHaveLength(1);
  });
});

describe("fetchLogsOptimized", () => {
  it("merges results from chunked requests", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      const c = callCount;
      return Promise.resolve(
        new Response(
          JSON.stringify({ jsonrpc: "2.0", result: [{ log: c }], id: c })
        )
      );
    });

    const config: RelayConfig = {
      relayUrl: "https://relay.example.com",
      logsChunkSize: 1000,
      fetchFn: mockFetch as unknown as typeof fetch,
    };

    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [{ fromBlock: "0x0", toBlock: "0x7d0" }], // 0 to 2000
      id: 1,
    };

    const result = await fetchLogsOptimized(req, config);
    expect(result.result).toHaveLength(3); // 3 chunks: 0-999, 1000-1999, 2000-2000
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("returns error if any chunk fails", async () => {
    const mockFetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message: "query timeout" },
            id: 1,
          })
        )
      )
    );

    const config: RelayConfig = {
      relayUrl: "https://relay.example.com",
      logsChunkSize: 1000,
      fetchFn: mockFetch as unknown as typeof fetch,
    };

    const req: JsonRpcRequest = {
      jsonrpc: "2.0",
      method: "eth_getLogs",
      params: [{ fromBlock: "0x0", toBlock: "0x7d0" }],
      id: 1,
    };

    const result = await fetchLogsOptimized(req, config);
    expect(result.error).toBeDefined();
  });
});
