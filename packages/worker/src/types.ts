export type Env = {
  BLOCK_TRACKER: DurableObjectNamespace;
  CACHE_STORE: DurableObjectNamespace;
  PROVIDER_CONFIG: DurableObjectNamespace;
  STATS_COLLECTOR: DurableObjectNamespace;
  DEFAULT_BLOCK_TIME_MS: string;
  DEFAULT_FINALIZED_CACHE_TTL: string;
  MAX_URL_LENGTH: string;
  ADMIN_TOKEN: string;
};

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  method: string;
  params: unknown[];
  id: number | string;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id: number | string;
};

export type BlockTag = "latest" | "earliest" | "pending" | "safe" | "finalized" | string;

export type BlockState = {
  latest: number;
  finalized: number;
  updatedAt: number;
};

export type CachePolicy = {
  cacheControl: string;
  etag?: string;
  isPrivate: boolean;
  ttl: number;
};

export type ChainConfig = {
  blockTimeMs: number;
  finalizedCacheTtl: number;
};

export const METHODS_WITH_BLOCK_TAG = [
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_getStorageAt",
  "eth_call",
  "eth_estimateGas",
  "eth_getBlockByNumber",
  "eth_getTransactionByBlockNumberAndIndex",
  "eth_getUncleByBlockNumberAndIndex",
  "eth_getUncleCountByBlockNumber",
  "eth_getBlockTransactionCountByNumber",
] as const;

export const METHODS_WITH_BLOCK_RANGE = ["eth_getLogs"] as const;

export const CACHEABLE_BY_HASH_METHODS = [
  "eth_getBlockByHash",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getUncleByBlockHashAndIndex",
  "eth_getBlockTransactionCountByHash",
  "eth_getUncleCountByBlockHash",
] as const;

export const STATIC_METHODS = [
  "eth_chainId",
  "net_version",
  "web3_clientVersion",
  "eth_protocolVersion",
] as const;
