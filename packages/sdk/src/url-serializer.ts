import type { JsonRpcRequest } from "./types";

const DEFAULT_MAX_URL_LENGTH = 2048;

export const serializeToGetUrl = (
  baseUrl: string,
  req: JsonRpcRequest,
  maxUrlLength = DEFAULT_MAX_URL_LENGTH
): string | null => {
  const url = new URL(`${baseUrl.replace(/\/$/, "")}/rpc`);
  url.searchParams.set("method", req.method);
  if (req.params.length > 0) {
    url.searchParams.set("params", JSON.stringify(req.params));
  }
  url.searchParams.set("id", String(req.id));

  const result = url.toString();
  return result.length <= maxUrlLength ? result : null;
};

export const serializeToPathUrl = (
  baseUrl: string,
  req: JsonRpcRequest,
  maxUrlLength = DEFAULT_MAX_URL_LENGTH
): string | null => {
  const base = baseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/rpc/${req.method}`);
  if (req.params.length > 0) {
    url.searchParams.set("params", JSON.stringify(req.params));
  }
  url.searchParams.set("id", String(req.id));

  const result = url.toString();
  return result.length <= maxUrlLength ? result : null;
};

export const serializeRequest = (
  baseUrl: string,
  req: JsonRpcRequest,
  maxUrlLength = DEFAULT_MAX_URL_LENGTH
): { url: string; method: "GET" | "POST"; body?: string } => {
  const getUrl = serializeToGetUrl(baseUrl, req, maxUrlLength);
  if (getUrl) {
    return { url: getUrl, method: "GET" };
  }

  const pathUrl = serializeToPathUrl(baseUrl, req, maxUrlLength);
  if (pathUrl) {
    return { url: pathUrl, method: "GET" };
  }

  return {
    url: `${baseUrl.replace(/\/$/, "")}/rpc`,
    method: "POST",
    body: JSON.stringify(req),
  };
};
