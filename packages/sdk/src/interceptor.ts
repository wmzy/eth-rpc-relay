import type { JsonRpcRequest, JsonRpcResponse, RelayConfig } from "./types";
import { sendBatchAsSplitRequests } from "./batch-handler";
import { fetchLogsOptimized } from "./logs-optimizer";
import { serializeRequest } from "./url-serializer";

const isJsonRpcRequest = (body: unknown): body is JsonRpcRequest =>
  typeof body === "object" &&
  body !== null &&
  "jsonrpc" in body &&
  "method" in body;

const isJsonRpcBatch = (body: unknown): body is JsonRpcRequest[] =>
  Array.isArray(body) && body.length > 0 && isJsonRpcRequest(body[0]);

export const createRelayFetch = (config: RelayConfig) => {
  const fetchFn = config.fetchFn ?? fetch;

  return async (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> => {
    if (!init?.body || init.method?.toUpperCase() !== "POST") {
      return fetchFn(input, init);
    }

    const bodyText = typeof init.body === "string" ? init.body : await new Response(init.body).text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      return fetchFn(input, init);
    }

    if (isJsonRpcBatch(parsed) && config.batchSplitEnabled !== false) {
      const results = await sendBatchAsSplitRequests(parsed, config);
      return new Response(JSON.stringify(results), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isJsonRpcRequest(parsed)) {
      return fetchFn(input, init);
    }

    if (parsed.method === "eth_getLogs") {
      const result = await fetchLogsOptimized(parsed, config);
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const serialized = serializeRequest(
      config.relayUrl,
      parsed,
      config.maxUrlLength
    );

    const headers: Record<string, string> = {};
    if (config.token) headers["Authorization"] = `Bearer ${config.token}`;
    if (config.providerId) headers["X-Provider-Id"] = config.providerId;
    if (serialized.body) headers["Content-Type"] = "application/json";

    return fetchFn(serialized.url, {
      method: serialized.method,
      headers,
      body: serialized.body,
    });
  };
};
