# eth-rpc-relay

[![npm](https://img.shields.io/npm/v/eth-rpc-relay)](https://www.npmjs.com/package/eth-rpc-relay)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

Frontend SDK that accelerates Ethereum JSON-RPC requests by converting POST to cacheable GET, splitting batches, and optimising `eth_getLogs` ranges — all transparently via a `fetch` wrapper.

## Install

```bash
npm install eth-rpc-relay
```

## Usage

### Basic — Drop-in `fetch` replacement

```typescript
import { createRelayFetch } from "eth-rpc-relay";

const relayFetch = createRelayFetch({
  relayUrl: "https://your-relay.workers.dev",
  providerId: "alchemy-eth",
  token: "your-alchemy-api-key",
});

// Use as a drop-in fetch replacement — POST requests are
// automatically converted to cacheable GET requests
const response = await relayFetch("https://any-rpc-url.com", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    method: "eth_getBlockByNumber",
    params: ["0x1234", false],
    id: 1,
  }),
});
```

### Auto-config — Multi-chain routing

```typescript
import { createRelay } from "eth-rpc-relay";

const relay = await createRelay({
  relayUrl: "https://your-relay.workers.dev",
  token: "your-api-key",
});

// Check which chains are supported
console.log(relay.chainIds); // [1, 137, 42161, ...]

// Create a fetch function for a specific chain
const ethFetch = relay.createFetchForChain(1);

// Or create a smart fetch that auto-detects chain ID
// and falls back to direct fetch for unsupported chains
const smartFetch = relay.createFetch("https://eth-mainnet.g.alchemy.com/v2");
```

### With ethers.js

```typescript
import { createRelayFetch } from "eth-rpc-relay";
import { ethers } from "ethers";

const relayFetch = createRelayFetch({
  relayUrl: "https://your-relay.workers.dev",
  token: "your-api-key",
});

const provider = new ethers.JsonRpcProvider("https://your-relay.workers.dev/rpc", undefined, {
  staticNetwork: true,
  batchStallTime: 0,
});
```

### With viem

```typescript
import { createRelayFetch } from "eth-rpc-relay";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const relayFetch = createRelayFetch({
  relayUrl: "https://your-relay.workers.dev",
  providerId: "alchemy-eth",
  token: "your-api-key",
});

const client = createPublicClient({
  chain: mainnet,
  transport: http("https://your-relay.workers.dev/rpc", {
    fetchOptions: {},
    onFetchRequest(request) { /* uses relayFetch internally */ },
  }),
});
```

## API Reference

### `createRelayFetch(config: RelayConfig)`

Returns a `fetch`-compatible function that intercepts JSON-RPC POST requests and routes them through the relay.

```typescript
type RelayConfig = {
  relayUrl: string;        // Relay worker URL
  providerId?: string;     // Provider to route to (sent as X-Provider-Id header)
  token?: string;          // RPC token (sent as Authorization: Bearer header)
  batchSplitEnabled?: boolean;  // Split batch requests (default: true)
  logsChunkSize?: number;  // eth_getLogs block range chunk size (default: 1000)
  maxUrlLength?: number;   // Max URL length before POST fallback (default: 2048)
  fetchFn?: typeof fetch;  // Custom fetch implementation
};
```

### `createRelay(options: RelayOptions)`

Fetches configuration from the relay server and returns a `Relay` object with multi-chain routing.

```typescript
type RelayOptions = {
  relayUrl: string;
  token?: string;
  batchSplitEnabled?: boolean;
  logsChunkSize?: number;
  fetchFn?: typeof fetch;
};

type Relay = {
  config: RelayRemoteConfig;
  chainIds: number[];
  supportsChain: (chainId: number) => boolean;
  getProviderForChain: (chainId: number) => ChainRoute | undefined;
  createFetchForChain: (chainId: number) => FetchFn | null;
  createFetch: (originalUrl?: string) => FetchFn;
};
```

### Lower-level utilities

| Export | Description |
|---|---|
| `serializeToGetUrl(baseUrl, req, maxLen?)` | Serialize JSON-RPC to GET URL with query params |
| `serializeToPathUrl(baseUrl, req, maxLen?)` | Serialize JSON-RPC to GET URL with path params |
| `serializeRequest(baseUrl, req, maxLen?)` | Auto-select best serialization strategy |
| `sendBatchAsSplitRequests(reqs, config)` | Split batch into parallel single requests |
| `splitBatch(reqs)` | Split batch array, assigning IDs |
| `fetchLogsOptimized(req, config)` | Split large `eth_getLogs` into chunks |
| `splitLogRange(filter, chunkSize?)` | Split a log filter into range chunks |
| `fetchRelayConfig(relayUrl, fetchFn?)` | Fetch relay server configuration |

## How It Works

1. **POST → GET**: JSON-RPC method and params are serialized into URL query parameters, enabling browser and CDN caching
2. **Batch splitting**: Batch requests are split into individual requests that can be cached independently
3. **eth_getLogs optimization**: Large block ranges are split into fixed-size chunks for better cache granularity
4. **Token passthrough**: Your RPC API key is sent via `Authorization` header and transparently mapped to the upstream provider's authentication scheme

## License

MIT
