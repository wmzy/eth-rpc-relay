import type {
  BlockState,
  BlockTag,
  CachePolicy,
  ChainConfig,
  JsonRpcRequest,
} from "./types";
import {
  CACHEABLE_BY_HASH_METHODS,
  METHODS_WITH_BLOCK_RANGE,
  METHODS_WITH_BLOCK_TAG,
  STATIC_METHODS,
} from "./types";

const ONE_WEEK = 604800;
const ONE_YEAR = 31536000;

export const parseBlockTag = (tag: BlockTag): number | null => {
  if (typeof tag !== "string") return null;
  if (tag.startsWith("0x")) return parseInt(tag, 16);
  return null;
};

const isPrivateRequest = (req: JsonRpcRequest): boolean => {
  if (req.method === "eth_call" || req.method === "eth_estimateGas") {
    const txObj = req.params[0];
    if (txObj && typeof txObj === "object" && "from" in (txObj as Record<string, unknown>)) {
      return true;
    }
  }
  return false;
};

const extractBlockTag = (req: JsonRpcRequest): BlockTag | null => {
  const methodsWithTag = METHODS_WITH_BLOCK_TAG as readonly string[];
  if (!methodsWithTag.includes(req.method)) return null;

  const tagParamIndex = (() => {
    switch (req.method) {
      case "eth_getStorageAt":
        return 2;
      case "eth_call":
      case "eth_estimateGas":
        return 1;
      case "eth_getBlockByNumber":
      case "eth_getTransactionByBlockNumberAndIndex":
      case "eth_getUncleByBlockNumberAndIndex":
      case "eth_getUncleCountByBlockNumber":
      case "eth_getBlockTransactionCountByNumber":
        return 0;
      default:
        return req.params.length - 1;
    }
  })();

  return (req.params[tagParamIndex] as BlockTag) ?? "latest";
};

const extractBlockRange = (
  req: JsonRpcRequest
): { fromBlock: BlockTag; toBlock: BlockTag } | null => {
  const methodsWithRange = METHODS_WITH_BLOCK_RANGE as readonly string[];
  if (!methodsWithRange.includes(req.method)) return null;

  const filter = req.params[0] as Record<string, unknown> | undefined;
  return {
    fromBlock: (filter?.fromBlock as BlockTag) ?? "latest",
    toBlock: (filter?.toBlock as BlockTag) ?? "latest",
  };
};

const computeFinalizedPolicy = (config: ChainConfig): CachePolicy => ({
  cacheControl: `public, max-age=${config.finalizedCacheTtl}, immutable`,
  isPrivate: false,
  ttl: config.finalizedCacheTtl,
});

const computeLatestPolicy = (
  blockState: BlockState,
  config: ChainConfig,
  isPrivate: boolean
): CachePolicy => {
  const elapsed = Date.now() - blockState.updatedAt;
  const remaining = Math.max(1, Math.floor((config.blockTimeMs - elapsed) / 1000));
  const scope = isPrivate ? "private" : "public";
  return {
    cacheControl: `${scope}, max-age=${remaining}, must-revalidate`,
    isPrivate,
    ttl: remaining,
  };
};

export const computeCachePolicy = (
  req: JsonRpcRequest,
  blockState: BlockState,
  config: ChainConfig
): CachePolicy => {
  const priv = isPrivateRequest(req);

  const staticMethods = STATIC_METHODS as readonly string[];
  if (staticMethods.includes(req.method)) {
    return {
      cacheControl: `public, max-age=${ONE_YEAR}, immutable`,
      isPrivate: false,
      ttl: ONE_YEAR,
    };
  }

  const hashMethods = CACHEABLE_BY_HASH_METHODS as readonly string[];
  if (hashMethods.includes(req.method)) {
    return computeFinalizedPolicy(config);
  }

  const blockTag = extractBlockTag(req);
  if (blockTag) {
    if (blockTag === "earliest") {
      return computeFinalizedPolicy(config);
    }

    const blockNum = parseBlockTag(blockTag);
    if (blockNum !== null && blockNum <= blockState.finalized) {
      return computeFinalizedPolicy(config);
    }

    return computeLatestPolicy(blockState, config, priv);
  }

  const range = extractBlockRange(req);
  if (range) {
    const fromNum = parseBlockTag(range.fromBlock);
    const toNum = parseBlockTag(range.toBlock);
    if (fromNum !== null && toNum !== null && toNum <= blockState.finalized) {
      return computeFinalizedPolicy(config);
    }
    if (range.fromBlock === "earliest" && range.toBlock === "earliest") {
      return computeFinalizedPolicy(config);
    }
    return computeLatestPolicy(blockState, config, priv);
  }

  return computeLatestPolicy(blockState, config, priv);
};

export const generateEtag = async (
  req: JsonRpcRequest,
  responseBody: string,
  blockHash?: string
): Promise<string> => {
  const seed = blockHash ?? responseBody;
  const data = new TextEncoder().encode(`${req.method}:${JSON.stringify(req.params)}:${seed}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `"${hex.slice(0, 16)}"`;
};
