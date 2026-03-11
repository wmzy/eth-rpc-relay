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

export type RelayConfig = {
  relayUrl: string;
  providerId?: string;
  /** RPC token passed through to the upstream provider for authentication */
  token?: string;
  batchSplitEnabled?: boolean;
  logsChunkSize?: number;
  maxUrlLength?: number;
  fetchFn?: typeof fetch;
};

export type BlockTag = "latest" | "earliest" | "pending" | "safe" | "finalized" | string;
