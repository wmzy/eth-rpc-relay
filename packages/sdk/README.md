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
import {
  createRelay,
  createFetchForChain,
  createFetch,
} from "eth-rpc-relay";

// Different providers may require different tokens
const relay = await createRelay({
  relayUrl: "https://your-relay.workers.dev",
  tokens: {
    1: "alchemy-eth-mainnet-key",      // Ethereum Mainnet
    137: "alchemy-polygon-key",         // Polygon
    42161: "infura-arbitrum-key",       // Arbitrum
  },
});

// Check which chains are supported
console.log(relay.chainIds); // [1, 137, 42161, ...]

// All functions are standalone — tree-shakeable
const ethFetch = createFetchForChain(relay, 1);

// Override token per-call
const polyFetch = createFetchForChain(relay, 137, "override-token");

// Smart fetch: auto-detects chain ID from the RPC endpoint,
// routes through relay if supported, falls back to direct fetch otherwise
const smartFetch = createFetch(relay, "https://eth-mainnet.g.alchemy.com/v2/key");
```

If all chains share the same token, pass a string instead:

```typescript
const relay = await createRelay({
  relayUrl: "https://your-relay.workers.dev",
  tokens: "shared-api-key",
});
```

### With ethers.js

```typescript
import { createRelayFetch } from "eth-rpc-relay";
import { ethers } from "ethers";

const relayFetch = createRelayFetch({
  relayUrl: "https://your-relay.workers.dev",
  providerId: "alchemy-eth",
  token: "your-alchemy-api-key",
});

const provider = new ethers.FetchRequest("https://your-relay.workers.dev/rpc");
provider.getUrlFunc = () => relayFetch;
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
  transport: http("https://any-rpc-url.com", {
    fetchFn: relayFetch,
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

Fetches configuration from the relay server and returns a `Relay` data object. Use the standalone functions below to operate on it.

```typescript
type TokenMap = Record<number, string>;  // { [chainId]: "token" }

type RelayOptions = {
  relayUrl: string;
  tokens?: TokenMap | string; // Per-chain tokens, or a single shared token
  batchSplitEnabled?: boolean;
  logsChunkSize?: number;
  fetchFn?: typeof fetch;
};

type Relay = {
  config: RelayRemoteConfig;
  options: RelayOptions;
  chainIds: number[];
  chainMap: Map<number, ChainRoute>;
};
```

### Relay helper functions

All functions take `relay: Relay` as the first argument for tree-shaking support.

| Function | Description |
|---|---|
| `supportsChain(relay, chainId)` | Whether the relay supports a given chain |
| `isTokenRequired(relay, chainId)` | Whether the chain's provider requires a client token |
| `getProviderForChain(relay, chainId)` | Get `ChainRoute` for a chain |
| `createFetchForChain(relay, chainId, token?)` | Create a relay `fetch` for a specific chain; returns `null` if unsupported or token missing when required |
| `createFetch(relay, originalUrl?, token?)` | Smart `fetch` that auto-detects chain ID, routes via relay if supported, falls back to direct otherwise |
| `resolveToken(tokens, chainId)` | Resolve the effective token from a `TokenMap \| string` |

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
