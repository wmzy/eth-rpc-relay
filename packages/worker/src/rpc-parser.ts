import type { JsonRpcRequest } from "./types";

export const parseGetRequest = (url: URL): JsonRpcRequest | null => {
  const method = url.searchParams.get("method");
  if (!method) return null;

  const paramsRaw = url.searchParams.get("params");
  const params: unknown[] = paramsRaw ? JSON.parse(paramsRaw) : [];
  const id = url.searchParams.get("id") ?? "1";

  return {
    jsonrpc: "2.0",
    method,
    params,
    id: /^\d+$/.test(id) ? Number(id) : id,
  };
};

export const parsePathRequest = (url: URL): JsonRpcRequest | null => {
  const segments = url.pathname.split("/").filter(Boolean);
  const rpcIdx = segments.indexOf("rpc");
  if (rpcIdx === -1 || rpcIdx + 1 >= segments.length) return null;

  const method = segments[rpcIdx + 1];
  const paramsRaw = url.searchParams.get("params");
  const params: unknown[] = paramsRaw ? JSON.parse(paramsRaw) : [];
  const id = url.searchParams.get("id") ?? "1";

  return {
    jsonrpc: "2.0",
    method,
    params,
    id: /^\d+$/.test(id) ? Number(id) : id,
  };
};

export const serializeToUrl = (
  baseUrl: string,
  req: JsonRpcRequest
): string => {
  const url = new URL(baseUrl);
  url.searchParams.set("method", req.method);
  if (req.params.length > 0) {
    url.searchParams.set("params", JSON.stringify(req.params));
  }
  url.searchParams.set("id", String(req.id));
  return url.toString();
};

export const generateCacheKey = (
  req: JsonRpcRequest,
  providerId?: string
): string => {
  const parts = [req.method, JSON.stringify(req.params)];
  if (providerId) parts.push(providerId);
  return parts.join(":");
};

export const parseRequest = async (
  request: Request,
  url: URL
): Promise<JsonRpcRequest | JsonRpcRequest[] | null> => {
  if (request.method === "GET") {
    return parseGetRequest(url) ?? parsePathRequest(url);
  }

  if (request.method === "POST") {
    const body = await request.json();
    return body as JsonRpcRequest | JsonRpcRequest[];
  }

  return null;
};
