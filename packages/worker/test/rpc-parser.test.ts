import { describe, it, expect } from "vitest";
import {
  parseGetRequest,
  parsePathRequest,
  serializeToUrl,
  generateCacheKey,
} from "../src/rpc-parser";

describe("parseGetRequest", () => {
  it("parses method and params from query string", () => {
    const url = new URL(
      'https://relay.example.com/rpc?method=eth_getBalance&params=["0xabc","latest"]&id=1'
    );
    const result = parseGetRequest(url);
    expect(result).not.toBeNull();
    expect(result!.method).toBe("eth_getBalance");
    expect(result!.params).toEqual(["0xabc", "latest"]);
    expect(result!.id).toBe(1);
  });

  it("returns null when method is missing", () => {
    const url = new URL("https://relay.example.com/rpc?params=[]");
    expect(parseGetRequest(url)).toBeNull();
  });

  it("handles missing params", () => {
    const url = new URL("https://relay.example.com/rpc?method=eth_blockNumber");
    const result = parseGetRequest(url);
    expect(result!.params).toEqual([]);
  });
});

describe("parsePathRequest", () => {
  it("parses method from path", () => {
    const url = new URL("https://relay.example.com/rpc/eth_blockNumber?id=1");
    const result = parsePathRequest(url);
    expect(result).not.toBeNull();
    expect(result!.method).toBe("eth_blockNumber");
  });

  it("returns null when rpc segment is missing", () => {
    const url = new URL("https://relay.example.com/api/eth_blockNumber");
    expect(parsePathRequest(url)).toBeNull();
  });
});

describe("serializeToUrl", () => {
  it("serializes request to URL with query params", () => {
    const url = serializeToUrl("https://relay.example.com", {
      jsonrpc: "2.0",
      method: "eth_getBalance",
      params: ["0xabc", "latest"],
      id: 1,
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("method")).toBe("eth_getBalance");
    expect(parsed.searchParams.get("id")).toBe("1");
  });
});

describe("generateCacheKey", () => {
  it("generates deterministic keys", () => {
    const req = { jsonrpc: "2.0" as const, method: "eth_blockNumber", params: [] as unknown[], id: 1 };
    const key1 = generateCacheKey(req);
    const key2 = generateCacheKey(req);
    expect(key1).toBe(key2);
  });

  it("includes provider ID when specified", () => {
    const req = { jsonrpc: "2.0" as const, method: "eth_blockNumber", params: [] as unknown[], id: 1 };
    const key = generateCacheKey(req, "provider-1");
    expect(key).toContain("provider-1");
  });
});
