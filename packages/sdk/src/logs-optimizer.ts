import type { JsonRpcRequest, JsonRpcResponse, RelayConfig } from "./types";
import { serializeRequest } from "./url-serializer";

const DEFAULT_CHUNK_SIZE = 1000;

type LogFilter = {
  fromBlock?: string;
  toBlock?: string;
  address?: string | string[];
  topics?: (string | string[] | null)[];
};

const parseBlockNumber = (tag: string | undefined): number | null => {
  if (!tag || !tag.startsWith("0x")) return null;
  return parseInt(tag, 16);
};

const toHex = (n: number): string => `0x${n.toString(16)}`;

export const splitLogRange = (
  filter: LogFilter,
  chunkSize = DEFAULT_CHUNK_SIZE
): LogFilter[] => {
  const from = parseBlockNumber(filter.fromBlock);
  const to = parseBlockNumber(filter.toBlock);

  if (from === null || to === null || to - from < chunkSize) {
    return [filter];
  }

  const chunks: LogFilter[] = [];
  for (let start = from; start <= to; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, to);
    chunks.push({
      ...filter,
      fromBlock: toHex(start),
      toBlock: toHex(end),
    });
  }
  return chunks;
};

export const fetchLogsOptimized = async (
  request: JsonRpcRequest,
  config: RelayConfig
): Promise<JsonRpcResponse> => {
  const filter = request.params[0] as LogFilter;
  const chunkSize = config.logsChunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunks = splitLogRange(filter, chunkSize);

  if (chunks.length === 1) {
    return fetchSingleLogRequest(request, config);
  }

  const fetchFn = config.fetchFn ?? fetch;
  const allLogs: unknown[] = [];

  const results = await Promise.all(
    chunks.map((chunk, i) => {
      const chunkReq: JsonRpcRequest = {
        jsonrpc: "2.0",
        method: "eth_getLogs",
        params: [chunk],
        id: `${request.id}_chunk_${i}`,
      };
      return fetchSingleLogRequest(chunkReq, config);
    })
  );

  for (const result of results) {
    if (result.error) {
      return {
        jsonrpc: "2.0",
        error: result.error,
        id: request.id,
      };
    }
    if (Array.isArray(result.result)) {
      allLogs.push(...result.result);
    }
  }

  return {
    jsonrpc: "2.0",
    result: allLogs,
    id: request.id,
  };
};

const fetchSingleLogRequest = async (
  req: JsonRpcRequest,
  config: RelayConfig
): Promise<JsonRpcResponse> => {
  const fetchFn = config.fetchFn ?? fetch;
  const serialized = serializeRequest(config.relayUrl, req, config.maxUrlLength);

  const headers: Record<string, string> = {};
  if (config.token) headers["Authorization"] = `Bearer ${config.token}`;
  if (config.providerId) headers["X-Provider-Id"] = config.providerId;
  if (serialized.body) headers["Content-Type"] = "application/json";

  const resp = await fetchFn(serialized.url, {
    method: serialized.method,
    headers,
    body: serialized.body,
  });

  return resp.json() as Promise<JsonRpcResponse>;
};
