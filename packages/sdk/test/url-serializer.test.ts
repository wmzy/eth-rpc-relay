import { describe, it, expect } from "vitest";
import {
  serializeToGetUrl,
  serializeToPathUrl,
  serializeRequest,
} from "../src/url-serializer";
import type { JsonRpcRequest } from "../src/types";

const BASE_URL = "https://relay.example.com";

const makeReq = (
  method: string,
  params: unknown[] = [],
  id: number | string = 1
): JsonRpcRequest => ({
  jsonrpc: "2.0",
  method,
  params,
  id,
});

describe("serializeToGetUrl", () => {
  it("serializes a simple request to GET URL", () => {
    const req = makeReq("eth_blockNumber");
    const url = serializeToGetUrl(BASE_URL, req);
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("method")).toBe("eth_blockNumber");
    expect(parsed.searchParams.get("id")).toBe("1");
  });

  it("serializes params as JSON", () => {
    const req = makeReq("eth_getBalance", ["0xabc", "latest"]);
    const url = serializeToGetUrl(BASE_URL, req);
    const parsed = new URL(url!);
    expect(JSON.parse(parsed.searchParams.get("params")!)).toEqual([
      "0xabc",
      "latest",
    ]);
  });

  it("returns null when URL exceeds max length", () => {
    const longParam = "0x" + "a".repeat(3000);
    const req = makeReq("eth_call", [{ data: longParam }]);
    const url = serializeToGetUrl(BASE_URL, req, 2048);
    expect(url).toBeNull();
  });
});

describe("serializeToPathUrl", () => {
  it("serializes method as path segment", () => {
    const req = makeReq("eth_chainId");
    const url = serializeToPathUrl(BASE_URL, req);
    expect(url).toContain("/rpc/eth_chainId");
  });
});

describe("serializeRequest", () => {
  it("uses GET for short requests", () => {
    const req = makeReq("eth_blockNumber");
    const result = serializeRequest(BASE_URL, req);
    expect(result.method).toBe("GET");
    expect(result.body).toBeUndefined();
  });

  it("falls back to POST for long requests", () => {
    const longParam = "0x" + "a".repeat(3000);
    const req = makeReq("eth_call", [{ data: longParam }]);
    const result = serializeRequest(BASE_URL, req, 100);
    expect(result.method).toBe("POST");
    expect(result.body).toBeDefined();
  });
});
