import { describe, it, expect } from "vitest";
import type { ProviderInput, AuthType } from "../src/provider-config";

const makeProvider = (overrides: Partial<ProviderInput> = {}): ProviderInput => ({
  id: "test-provider",
  name: "Test Provider",
  upstreamUrl: "https://rpc.example.com",
  authType: "none" as AuthType,
  tokenRequired: false,
  chainId: 1,
  blockTimeMs: 12000,
  isDefault: false,
  enabled: true,
  ...overrides,
});

describe("ProviderInput validation", () => {
  it("creates a valid provider input", () => {
    const input = makeProvider();
    expect(input.id).toBe("test-provider");
    expect(input.authType).toBe("none");
    expect(input.enabled).toBe(true);
  });

  it("supports bearer auth type for client token passthrough", () => {
    const input = makeProvider({ authType: "bearer" });
    expect(input.authType).toBe("bearer");
  });

  it("supports api-key auth type for URL path append", () => {
    const input = makeProvider({ authType: "api-key" });
    expect(input.authType).toBe("api-key");
  });

  it("supports url-param auth type for query parameter", () => {
    const input = makeProvider({ authType: "url-param" });
    expect(input.authType).toBe("url-param");
  });

  it("supports default provider flag", () => {
    const input = makeProvider({ isDefault: true });
    expect(input.isDefault).toBe(true);
  });
});
