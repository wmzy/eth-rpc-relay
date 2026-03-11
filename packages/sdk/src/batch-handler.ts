import type { JsonRpcRequest, JsonRpcResponse, RelayConfig } from "./types";
import { serializeRequest } from "./url-serializer";

export const splitBatch = (
  requests: JsonRpcRequest[]
): JsonRpcRequest[] => requests.map((req, i) => ({
  ...req,
  id: req.id ?? i + 1,
}));

export const sendBatchAsSplitRequests = async (
  requests: JsonRpcRequest[],
  config: RelayConfig
): Promise<JsonRpcResponse[]> => {
  const fetchFn = config.fetchFn ?? fetch;
  const split = splitBatch(requests);

  const promises = split.map(async (req) => {
    const serialized = serializeRequest(
      config.relayUrl,
      req,
      config.maxUrlLength
    );

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
  });

  return Promise.all(promises);
};
