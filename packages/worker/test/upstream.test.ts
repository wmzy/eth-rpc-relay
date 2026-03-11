import { describe, it, expect } from "vitest";
import { validateUpstreamUrl, buildUpstreamUrl, buildHeaders } from "../src/upstream";
import type { UpstreamTarget } from "../src/upstream";

describe("validateUpstreamUrl", () => {
  it("accepts valid HTTPS URLs", () => {
    expect(validateUpstreamUrl("https://eth-mainnet.g.alchemy.com/v2/key")).toBe(true);
    expect(validateUpstreamUrl("https://rpc.ankr.com/eth")).toBe(true);
  });

  it("rejects HTTP URLs", () => {
    expect(validateUpstreamUrl("http://rpc.example.com")).toBe(false);
  });

  it("rejects localhost", () => {
    expect(validateUpstreamUrl("https://localhost:8545")).toBe(false);
    expect(validateUpstreamUrl("https://127.0.0.1:8545")).toBe(false);
  });

  it("rejects private IPs", () => {
    expect(validateUpstreamUrl("https://10.0.0.1:8545")).toBe(false);
    expect(validateUpstreamUrl("https://192.168.1.1:8545")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(validateUpstreamUrl("not-a-url")).toBe(false);
    expect(validateUpstreamUrl("")).toBe(false);
  });
});

describe("buildUpstreamUrl – client token passthrough", () => {
  it("returns base URL when no client token", () => {
    const target: UpstreamTarget = { url: "https://rpc.example.com/v2", authType: "api-key" };
    expect(buildUpstreamUrl(target)).toBe("https://rpc.example.com/v2");
  });

  it("appends token to URL path for api-key type", () => {
    const target: UpstreamTarget = { url: "https://eth-mainnet.g.alchemy.com/v2", authType: "api-key" };
    expect(buildUpstreamUrl(target, "my-key-123")).toBe("https://eth-mainnet.g.alchemy.com/v2/my-key-123");
  });

  it("strips trailing slash before appending api-key", () => {
    const target: UpstreamTarget = { url: "https://rpc.example.com/v2/", authType: "api-key" };
    expect(buildUpstreamUrl(target, "abc")).toBe("https://rpc.example.com/v2/abc");
  });

  it("adds query parameter for url-param type", () => {
    const target: UpstreamTarget = { url: "https://rpc.example.com/v2", authType: "url-param" };
    const result = buildUpstreamUrl(target, "my-key");
    expect(result).toContain("key=my-key");
  });

  it("returns base URL for bearer type (token goes in header)", () => {
    const target: UpstreamTarget = { url: "https://rpc.example.com", authType: "bearer" };
    expect(buildUpstreamUrl(target, "tok")).toBe("https://rpc.example.com");
  });

  it("returns base URL for none type even with token", () => {
    const target: UpstreamTarget = { url: "https://rpc.example.com", authType: "none" };
    expect(buildUpstreamUrl(target, "tok")).toBe("https://rpc.example.com");
  });
});

describe("buildHeaders – client token passthrough", () => {
  it("includes Content-Type only when no token", () => {
    const target: UpstreamTarget = { url: "https://rpc.example.com", authType: "bearer" };
    const headers = buildHeaders(target);
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("adds Authorization header for bearer type with client token", () => {
    const target: UpstreamTarget = { url: "https://rpc.example.com", authType: "bearer" };
    const headers = buildHeaders(target, "my-token");
    expect(headers["Authorization"]).toBe("Bearer my-token");
  });

  it("does not add Authorization header for api-key type", () => {
    const target: UpstreamTarget = { url: "https://rpc.example.com", authType: "api-key" };
    const headers = buildHeaders(target, "my-key");
    expect(headers["Authorization"]).toBeUndefined();
  });
});
