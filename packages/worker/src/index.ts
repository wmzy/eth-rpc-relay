import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env, JsonRpcRequest, JsonRpcResponse, BlockState, ChainConfig } from "./types";
import { parseRequest, generateCacheKey } from "./rpc-parser";
import { computeCachePolicy, generateEtag } from "./cache-policy";
import { forwardToUpstream, buildUpstreamUrl, buildHeaders, UpstreamError } from "./upstream";
import type { UpstreamTarget } from "./upstream";
import type { Provider, ProviderInput } from "./provider-config";
import type { StatRecord, StatsSummary, HourlyStats } from "./stats-collector";

export { BlockTracker } from "./block-tracker";
export { CacheStore } from "./cache-store";
export { ProviderConfig } from "./provider-config";
export { StatsCollector } from "./stats-collector";

type HonoEnv = { Bindings: Env };

const app = new Hono<HonoEnv>();

app.use("*", cors({ origin: "*" }));

app.get("/health", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// ── Provider config helpers ──

const getProviderConfigStub = (env: Env) => {
  const id = env.PROVIDER_CONFIG.idFromName("global");
  return env.PROVIDER_CONFIG.get(id) as unknown as {
    listProviders: () => Promise<Provider[]>;
    getProvider: (id: string) => Promise<Provider | null>;
    getDefaultProvider: () => Promise<Provider | null>;
    upsertProvider: (input: ProviderInput) => Promise<Provider>;
    deleteProvider: (id: string) => Promise<boolean>;
  };
};

const getStatsStub = (env: Env) => {
  const id = env.STATS_COLLECTOR.idFromName("global");
  return env.STATS_COLLECTOR.get(id) as unknown as {
    record: (stat: StatRecord) => Promise<void>;
    getStats: (rangeMs: number) => Promise<HourlyStats[]>;
    getSummary: () => Promise<StatsSummary>;
  };
};

// ── Resolve upstream target from Provider-ID ──

const resolveUpstreamTarget = async (
  env: Env,
  providerId?: string | null
): Promise<{ target: UpstreamTarget; providerId: string } | null> => {
  const stub = getProviderConfigStub(env);

  if (providerId) {
    const provider = await stub.getProvider(providerId);
    if (provider && provider.enabled) {
      return {
        target: { url: provider.upstreamUrl, authType: provider.authType },
        providerId: provider.id,
      };
    }
  }

  const defaultProvider = await stub.getDefaultProvider();
  if (defaultProvider) {
    return {
      target: { url: defaultProvider.upstreamUrl, authType: defaultProvider.authType },
      providerId: defaultProvider.id,
    };
  }

  return null;
};

const extractClientToken = (authHeader?: string): string | undefined => {
  if (!authHeader) return undefined;
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
};

const getBlockState = async (env: Env, target: UpstreamTarget, clientToken?: string): Promise<BlockState> => {
  const fullUrl = buildUpstreamUrl(target, clientToken);
  const authHeaders = buildHeaders(target, clientToken);
  const id = env.BLOCK_TRACKER.idFromName("global");
  const tracker = env.BLOCK_TRACKER.get(id) as unknown as {
    updateBlockState: (url: string, headers: Record<string, string>) => Promise<BlockState>;
    scheduleRefresh: (url: string, headers: Record<string, string>) => Promise<void>;
  };
  const state = await tracker.updateBlockState(fullUrl, authHeaders);
  tracker.scheduleRefresh(fullUrl, authHeaders);
  return state;
};

const getChainConfig = (env: Env): ChainConfig => ({
  blockTimeMs: parseInt(env.DEFAULT_BLOCK_TIME_MS) || 12000,
  finalizedCacheTtl: parseInt(env.DEFAULT_FINALIZED_CACHE_TTL) || 604800,
});

// ── Structured logging ──

const logRpcRequest = (data: {
  method: string;
  providerId: string;
  cacheLevel: string;
  latencyMs: number;
  status: number;
  error?: string;
}) => {
  const entry = { type: "rpc_request", ...data };
  if (data.error) {
    console.error(JSON.stringify(entry));
  } else if (data.latencyMs > 1000) {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
};

// ── RPC handler ──

const handleSingleRpc = async (
  rpcReq: JsonRpcRequest,
  env: Env,
  target: UpstreamTarget,
  providerId: string,
  clientToken: string | undefined,
  blockState: BlockState,
  config: ChainConfig,
  ifNoneMatch?: string
): Promise<Response> => {
  const t0 = Date.now();
  const cacheKey = generateCacheKey(rpcReq, providerId);
  const policy = computeCachePolicy(rpcReq, blockState, config);

  const cacheStoreId = env.CACHE_STORE.idFromName(cacheKey.slice(0, 32));
  const cacheStore = env.CACHE_STORE.get(cacheStoreId) as unknown as {
    get: (key: string) => Promise<{ body: string; etag: string } | null>;
    put: (key: string, body: string, etag: string, ttl: number) => Promise<void>;
  };

  const cached = await cacheStore.get(cacheKey);
  if (cached) {
    const latencyMs = Date.now() - t0;
    logRpcRequest({ method: rpcReq.method, providerId, cacheLevel: "do", latencyMs, status: 200 });
    recordStatAsync(env, { method: rpcReq.method, providerId, cacheHit: true, latencyMs, error: false });

    if (ifNoneMatch && cached.etag === ifNoneMatch) {
      return new Response(null, {
        status: 304,
        headers: { "Cache-Control": policy.cacheControl, ETag: cached.etag },
      });
    }
    return new Response(cached.body, {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": policy.cacheControl,
        ETag: cached.etag,
      },
    });
  }

  const rpcResp = (await forwardToUpstream(target, rpcReq, clientToken)) as JsonRpcResponse;
  const body = JSON.stringify(rpcResp);
  const etag = await generateEtag(rpcReq, body);
  const latencyMs = Date.now() - t0;

  logRpcRequest({
    method: rpcReq.method,
    providerId,
    cacheLevel: "miss",
    latencyMs,
    status: rpcResp.error ? 502 : 200,
    error: rpcResp.error?.message,
  });
  recordStatAsync(env, {
    method: rpcReq.method,
    providerId,
    cacheHit: false,
    latencyMs,
    error: !!rpcResp.error,
  });

  if (!rpcResp.error && policy.ttl > 0) {
    await cacheStore.put(cacheKey, body, etag, policy.ttl);
  }

  if (ifNoneMatch && etag === ifNoneMatch) {
    return new Response(null, {
      status: 304,
      headers: { "Cache-Control": policy.cacheControl, ETag: etag },
    });
  }

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": policy.cacheControl,
      ETag: etag,
    },
  });
};

const recordStatAsync = (env: Env, stat: StatRecord) => {
  try { getStatsStub(env).record(stat); } catch { /* fire-and-forget */ }
};

// ── RPC routes ──

const handleRpc = async (c: { req: { raw: Request; url: string; header: (n: string) => string | undefined }; env: Env; json: (data: unknown, status?: number) => Response }) => {
  const providerId = c.req.header("X-Provider-Id") ?? new URL(c.req.url).searchParams.get("provider");
  const clientToken = extractClientToken(c.req.header("Authorization"));

  const resolved = await resolveUpstreamTarget(c.env, providerId);
  if (!resolved) {
    return c.json({ error: "No provider configured. Add a provider via the Dashboard." }, 400);
  }

  const url = new URL(c.req.url);
  const parsed = await parseRequest(c.req.raw, url);
  if (!parsed) {
    return c.json({ error: "Invalid JSON-RPC request" }, 400);
  }

  const blockState = await getBlockState(c.env, resolved.target, clientToken);
  const config = getChainConfig(c.env);
  const ifNoneMatch = c.req.header("If-None-Match");

  if (Array.isArray(parsed)) {
    const results = await Promise.all(
      parsed.map(async (req) => {
        const resp = await handleSingleRpc(req, c.env, resolved.target, resolved.providerId, clientToken, blockState, config, ifNoneMatch);
        return resp.json() as Promise<JsonRpcResponse>;
      })
    );
    return c.json(results);
  }

  return handleSingleRpc(parsed, c.env, resolved.target, resolved.providerId, clientToken, blockState, config, ifNoneMatch);
};

app.all("/rpc/*", async (c) => handleRpc(c));
app.all("/rpc", async (c) => handleRpc(c));

// ── Public API: Relay config (for SDK auto-discovery) ──

app.get("/api/relay-config", async (c) => {
  const providers = await getProviderConfigStub(c.env).listProviders();
  const chains = providers
    .filter((p) => p.enabled)
    .map((p) => ({
      chainId: p.chainId,
      providerId: p.id,
      authType: p.authType,
      isDefault: p.isDefault,
    }));
  return c.json({
    relayUrl: new URL("/", c.req.url).origin,
    chains,
    maxUrlLength: parseInt(c.env.MAX_URL_LENGTH) || 2048,
  });
});

// ── Admin auth middleware ──

const adminAuth = new Hono<HonoEnv>();

adminAuth.use("*", async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!c.env.ADMIN_TOKEN || c.env.ADMIN_TOKEN === token) {
    return next();
  }
  return c.json({ error: "Unauthorized" }, 401);
});

// ── Admin API: Auth check ──

adminAuth.post("/api/auth/verify", (c) => c.json({ ok: true }));

// ── Admin API: Providers ──

adminAuth.get("/api/providers", async (c) => {
  const providers = await getProviderConfigStub(c.env).listProviders();
  return c.json(providers);
});

adminAuth.post("/api/providers", async (c) => {
  const input = (await c.req.json()) as ProviderInput;
  const provider = await getProviderConfigStub(c.env).upsertProvider(input);
  return c.json(provider, 201);
});

adminAuth.put("/api/providers/:id", async (c) => {
  const body = (await c.req.json()) as Partial<ProviderInput>;
  const input: ProviderInput = {
    id: c.req.param("id"),
    name: body.name ?? "",
    upstreamUrl: body.upstreamUrl ?? "",
    authType: body.authType ?? "none",
    chainId: body.chainId ?? 1,
    blockTimeMs: body.blockTimeMs ?? 12000,
    isDefault: body.isDefault ?? false,
    enabled: body.enabled ?? true,
  };
  const provider = await getProviderConfigStub(c.env).upsertProvider(input);
  return c.json(provider);
});

adminAuth.delete("/api/providers/:id", async (c) => {
  await getProviderConfigStub(c.env).deleteProvider(c.req.param("id"));
  return c.json({ ok: true });
});

// ── Admin API: Stats ──

const RANGE_MAP: Record<string, number> = {
  "1h": 3_600_000,
  "24h": 86_400_000,
  "7d": 604_800_000,
};

adminAuth.get("/api/stats", async (c) => {
  const range = c.req.query("range") ?? "24h";
  const rangeMs = RANGE_MAP[range] ?? 86_400_000;
  const stats = await getStatsStub(c.env).getStats(rangeMs);
  return c.json(stats);
});

adminAuth.get("/api/stats/summary", async (c) => {
  const summary = await getStatsStub(c.env).getSummary();
  return c.json(summary);
});

// ── Admin API: Config ──

adminAuth.get("/api/config", (c) => {
  return c.json({
    defaultBlockTimeMs: parseInt(c.env.DEFAULT_BLOCK_TIME_MS) || 12000,
    defaultFinalizedCacheTtl: parseInt(c.env.DEFAULT_FINALIZED_CACHE_TTL) || 604800,
    maxUrlLength: parseInt(c.env.MAX_URL_LENGTH) || 2048,
  });
});

app.route("/", adminAuth);

// ── Error handling ──

app.onError((err, c) => {
  if (err instanceof UpstreamError) {
    return c.json({ error: err.message }, err.statusCode as 502);
  }
  console.error(JSON.stringify({ type: "unhandled_error", message: err.message, stack: err.stack }));
  return c.json({ error: "Internal server error" }, 500);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app;
