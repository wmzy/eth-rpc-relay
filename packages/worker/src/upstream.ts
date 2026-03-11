import type { JsonRpcRequest, JsonRpcResponse } from "./types";
import type { AuthType } from "./provider-config";

export type UpstreamTarget = {
  url: string;
  authType: AuthType;
};

export const buildUpstreamUrl = (target: UpstreamTarget, clientToken?: string): string => {
  const base = target.url.replace(/\/$/, "");
  if (!clientToken) return base;
  switch (target.authType) {
    case "api-key":
      return `${base}/${clientToken}`;
    case "url-param": {
      const u = new URL(base);
      u.searchParams.set("key", clientToken);
      return u.toString();
    }
    default:
      return base;
  }
};

export const buildHeaders = (target: UpstreamTarget, clientToken?: string): Record<string, string> => {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (target.authType === "bearer" && clientToken) {
    headers["Authorization"] = `Bearer ${clientToken}`;
  }
  return headers;
};

export const forwardToUpstream = async (
  target: UpstreamTarget,
  rpcRequest: JsonRpcRequest | JsonRpcRequest[],
  clientToken?: string
): Promise<JsonRpcResponse | JsonRpcResponse[]> => {
  const url = buildUpstreamUrl(target, clientToken);
  const headers = buildHeaders(target, clientToken);

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(rpcRequest),
  });

  if (!response.ok) {
    throw new UpstreamError(
      `Upstream responded with ${response.status}`,
      response.status
    );
  }

  return response.json() as Promise<JsonRpcResponse | JsonRpcResponse[]>;
};

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const ALLOWED_UPSTREAM_PROTOCOLS = ["https:"];

export const validateUpstreamUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_UPSTREAM_PROTOCOLS.includes(parsed.protocol)) return false;
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") return false;
    if (parsed.hostname.startsWith("10.") || parsed.hostname.startsWith("192.168.")) return false;
    return true;
  } catch {
    return false;
  }
};
