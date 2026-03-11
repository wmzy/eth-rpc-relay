import type { RelayConfig, RelayRemoteConfig, ChainRoute } from "./types";
import { createRelayFetch } from "./interceptor";

export type TokenMap = Record<number, string>;

export type RelayOptions = {
  relayUrl: string;
  /** Per-chain token map: { [chainId]: "api-key" }, or a single string applied to all chains */
  tokens?: TokenMap | string;
  batchSplitEnabled?: boolean;
  logsChunkSize?: number;
  fetchFn?: typeof fetch;
};

export type Relay = {
  config: RelayRemoteConfig;
  options: RelayOptions;
  chainIds: number[];
  chainMap: Map<number, ChainRoute>;
};

export const resolveToken = (tokens: TokenMap | string | undefined, chainId: number): string | undefined => {
  if (!tokens) return undefined;
  if (typeof tokens === "string") return tokens;
  return tokens[chainId];
};

const detectChainId = async (rpcUrl: string, fetchFn: typeof fetch): Promise<number | null> => {
  try {
    const resp = await fetchFn(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
    });
    const data = (await resp.json()) as { result?: string };
    return data.result ? parseInt(data.result, 16) : null;
  } catch {
    return null;
  }
};

export const fetchRelayConfig = async (
  relayUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<RelayRemoteConfig> => {
  const base = relayUrl.replace(/\/$/, "");
  const resp = await fetchFn(`${base}/api/relay-config`);
  return resp.json() as Promise<RelayRemoteConfig>;
};

export const createRelay = async (options: RelayOptions): Promise<Relay> => {
  const fetchFn = options.fetchFn ?? fetch;
  const config = await fetchRelayConfig(options.relayUrl, fetchFn);

  const chainMap = new Map<number, ChainRoute>();
  for (const chain of config.chains) {
    if (!chainMap.has(chain.chainId) || chain.isDefault) {
      chainMap.set(chain.chainId, chain);
    }
  }

  return {
    config,
    options,
    chainIds: [...chainMap.keys()],
    chainMap,
  };
};

export const supportsChain = (relay: Relay, chainId: number): boolean =>
  relay.chainMap.has(chainId);

export const isTokenRequired = (relay: Relay, chainId: number): boolean =>
  relay.chainMap.get(chainId)?.tokenRequired ?? false;

export const getProviderForChain = (relay: Relay, chainId: number): ChainRoute | undefined =>
  relay.chainMap.get(chainId);

export const createFetchForChain = (
  relay: Relay,
  chainId: number,
  token?: string
): ReturnType<typeof createRelayFetch> | null => {
  const route = relay.chainMap.get(chainId);
  if (!route) return null;
  const effectiveToken = token ?? resolveToken(relay.options.tokens, chainId);
  if (route.tokenRequired && !effectiveToken) return null;
  const fetchFn = relay.options.fetchFn ?? fetch;
  const relayConfig: RelayConfig = {
    relayUrl: relay.config.relayUrl,
    providerId: route.providerId,
    token: effectiveToken,
    batchSplitEnabled: relay.options.batchSplitEnabled,
    logsChunkSize: relay.options.logsChunkSize,
    maxUrlLength: relay.config.maxUrlLength,
    fetchFn,
  };
  return createRelayFetch(relayConfig);
};

export const createFetch = (
  relay: Relay,
  originalUrl?: string,
  token?: string
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> => {
  const fetchFn = relay.options.fetchFn ?? fetch;
  const relayFetchCache = new Map<number, ReturnType<typeof createRelayFetch>>();
  let detectedChainId: number | null | undefined;

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (detectedChainId === undefined && originalUrl) {
      detectedChainId = await detectChainId(originalUrl, fetchFn);
    }

    if (detectedChainId !== undefined && detectedChainId !== null && supportsChain(relay, detectedChainId)) {
      const cached = relayFetchCache.get(detectedChainId);
      if (cached) return cached(input, init);
      const effectiveToken = token ?? resolveToken(relay.options.tokens, detectedChainId);
      const fn = createFetchForChain(relay, detectedChainId, effectiveToken);
      if (fn) {
        relayFetchCache.set(detectedChainId, fn);
        return fn(input, init);
      }
    }

    return fetchFn(input, init);
  };
};
