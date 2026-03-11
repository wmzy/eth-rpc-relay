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
  chainIds: number[];
  supportsChain: (chainId: number) => boolean;
  getProviderForChain: (chainId: number) => ChainRoute | undefined;
  createFetchForChain: (chainId: number, token?: string) => ReturnType<typeof createRelayFetch> | null;
  createFetch: (originalUrl?: string, token?: string) => (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

const resolveToken = (tokens: TokenMap | string | undefined, chainId: number): string | undefined => {
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

  const supportsChain = (chainId: number) => chainMap.has(chainId);

  const getProviderForChain = (chainId: number) => chainMap.get(chainId);

  const createFetchForChain = (chainId: number, token?: string) => {
    const route = chainMap.get(chainId);
    if (!route) return null;
    const relayConfig: RelayConfig = {
      relayUrl: config.relayUrl,
      providerId: route.providerId,
      token: token ?? resolveToken(options.tokens, chainId),
      batchSplitEnabled: options.batchSplitEnabled,
      logsChunkSize: options.logsChunkSize,
      maxUrlLength: config.maxUrlLength,
      fetchFn,
    };
    return createRelayFetch(relayConfig);
  };

  const createFetch = (originalUrl?: string, token?: string) => {
    const relayFetchCache = new Map<number, ReturnType<typeof createRelayFetch>>();
    let detectedChainId: number | null | undefined;

    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      if (detectedChainId === undefined && originalUrl) {
        detectedChainId = await detectChainId(originalUrl, fetchFn);
      }

      if (detectedChainId !== undefined && detectedChainId !== null && supportsChain(detectedChainId)) {
        const cached = relayFetchCache.get(detectedChainId);
        if (cached) return cached(input, init);
        const effectiveToken = token ?? resolveToken(options.tokens, detectedChainId);
        const fn = createFetchForChain(detectedChainId, effectiveToken);
        if (fn) {
          relayFetchCache.set(detectedChainId, fn);
          return fn(input, init);
        }
      }

      return fetchFn(input, init);
    };
  };

  return {
    config,
    chainIds: [...chainMap.keys()],
    supportsChain,
    getProviderForChain,
    createFetchForChain,
    createFetch,
  };
};
