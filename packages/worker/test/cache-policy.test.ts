import { describe, it, expect } from "vitest";
import { computeCachePolicy, parseBlockTag, generateEtag } from "../src/cache-policy";
import type { BlockState, ChainConfig, JsonRpcRequest } from "../src/types";

const blockState: BlockState = {
  latest: 20000000,
  finalized: 19999900,
  updatedAt: Date.now() - 3000,
};

const config: ChainConfig = {
  blockTimeMs: 12000,
  finalizedCacheTtl: 604800,
};

const makeReq = (method: string, params: unknown[] = []): JsonRpcRequest => ({
  jsonrpc: "2.0",
  method,
  params,
  id: 1,
});

describe("parseBlockTag", () => {
  it("parses hex block numbers", () => {
    expect(parseBlockTag("0x1")).toBe(1);
    expect(parseBlockTag("0xff")).toBe(255);
    expect(parseBlockTag("0x1312D00")).toBe(20000000);
  });

  it("returns null for named tags", () => {
    expect(parseBlockTag("latest")).toBeNull();
    expect(parseBlockTag("finalized")).toBeNull();
  });
});

describe("computeCachePolicy", () => {
  it("returns immutable cache for static methods", () => {
    const policy = computeCachePolicy(makeReq("eth_chainId"), blockState, config);
    expect(policy.cacheControl).toContain("immutable");
    expect(policy.ttl).toBe(31536000);
  });

  it("returns long cache for hash-based methods", () => {
    const policy = computeCachePolicy(
      makeReq("eth_getTransactionByHash", ["0xabc"]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("immutable");
    expect(policy.ttl).toBe(604800);
  });

  it("returns short cache for 'finalized' tag (dynamic alias)", () => {
    const policy = computeCachePolicy(
      makeReq("eth_getBalance", ["0xabc", "finalized"]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("must-revalidate");
    expect(policy.cacheControl).not.toContain("immutable");
  });

  it("returns long cache for 'earliest' tag (block 0, immutable)", () => {
    const policy = computeCachePolicy(
      makeReq("eth_getBalance", ["0xabc", "earliest"]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("immutable");
  });

  it("returns long cache for block number <= finalized", () => {
    const blockHex = `0x${(19999800).toString(16)}`;
    const policy = computeCachePolicy(
      makeReq("eth_getBalance", ["0xabc", blockHex]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("immutable");
  });

  it("returns short cache for latest block tag", () => {
    const policy = computeCachePolicy(
      makeReq("eth_getBalance", ["0xabc", "latest"]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("must-revalidate");
    expect(policy.ttl).toBeGreaterThan(0);
    expect(policy.ttl).toBeLessThanOrEqual(12);
  });

  it("marks eth_call with from as private", () => {
    const policy = computeCachePolicy(
      makeReq("eth_call", [{ from: "0xabc", to: "0xdef", data: "0x" }, "latest"]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("private");
    expect(policy.isPrivate).toBe(true);
  });

  it("returns long cache for eth_getBlockByNumber with finalized block number", () => {
    const blockHex = `0x${(19999800).toString(16)}`;
    const policy = computeCachePolicy(
      makeReq("eth_getBlockByNumber", [blockHex, false]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("immutable");
    expect(policy.ttl).toBe(604800);
  });

  it("returns short cache for eth_getBlockByNumber with latest block number", () => {
    const blockHex = `0x${(20000000).toString(16)}`;
    const policy = computeCachePolicy(
      makeReq("eth_getBlockByNumber", [blockHex, false]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("must-revalidate");
  });

  it("returns short cache for eth_getBlockByNumber with 'finalized' tag (dynamic alias)", () => {
    const policy = computeCachePolicy(
      makeReq("eth_getBlockByNumber", ["finalized", false]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("must-revalidate");
    expect(policy.cacheControl).not.toContain("immutable");
  });

  it("returns short cache for eth_getBlockByNumber with 'safe' tag", () => {
    const policy = computeCachePolicy(
      makeReq("eth_getBlockByNumber", ["safe", false]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("must-revalidate");
  });

  it("returns short cache for eth_getLogs with 'finalized' toBlock tag", () => {
    const policy = computeCachePolicy(
      makeReq("eth_getLogs", [{ fromBlock: "0x100", toBlock: "finalized" }]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("must-revalidate");
    expect(policy.cacheControl).not.toContain("immutable");
  });

  it("returns long cache for eth_getLogs with finalized range", () => {
    const fromHex = `0x${(19999000).toString(16)}`;
    const toHex = `0x${(19999800).toString(16)}`;
    const policy = computeCachePolicy(
      makeReq("eth_getLogs", [{ fromBlock: fromHex, toBlock: toHex }]),
      blockState,
      config
    );
    expect(policy.cacheControl).toContain("immutable");
  });
});

describe("generateEtag", () => {
  it("generates consistent etags", async () => {
    const req = makeReq("eth_blockNumber");
    const etag1 = await generateEtag(req, '{"result":"0x1"}');
    const etag2 = await generateEtag(req, '{"result":"0x1"}');
    expect(etag1).toBe(etag2);
  });

  it("generates different etags for different responses", async () => {
    const req = makeReq("eth_blockNumber");
    const etag1 = await generateEtag(req, '{"result":"0x1"}');
    const etag2 = await generateEtag(req, '{"result":"0x2"}');
    expect(etag1).not.toBe(etag2);
  });
});
