# ETH RPC Relay

An HTTP-cache-aware acceleration layer for Ethereum JSON-RPC requests. Converts uncacheable POST requests into cacheable GET requests, applies blockchain-aware cache policies, and serves responses from a three-tier cache (Browser → CDN → Durable Objects).

## Architecture

```
┌─────────────────┐         ┌──────────────────────────────────┐
│   Browser / App  │         │  Cloudflare Workers (Edge)       │
│                  │         │                                  │
│  eth-rpc-relay   │  GET    │  RPC Router → Cache Policy Engine│
│  SDK intercepts ─┼────────►│  ↓ hit: return cached response   │
│  POST→GET, batch │  Cache  │  ↓ miss: forward to upstream RPC │
│  split, logs opt │◄────────┤  + write to DO cache             │
│                  │         │                                  │
│                  │         │  React Dashboard (SPA)           │
└─────────────────┘         └──────────────────────────────────┘
```

**Frontend SDK** (`eth-rpc-relay`) — Intercepts JSON-RPC requests, converts POST to GET, splits batches, optimises `eth_getLogs` ranges.

**Edge Worker** (`eth-rpc-relay-worker`) — Restores RPC requests, computes cache headers based on finalized/latest block state, forwards to upstream providers, and serves a React admin dashboard.

## Monorepo Structure

```
packages/
  sdk/       → npm package: eth-rpc-relay
  worker/    → Cloudflare Worker + React Dashboard
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Run tests
npm test

# Type check
npm run lint

# Start local dev server (Worker + Dashboard)
npm run dev

# Deploy to Cloudflare
npm run deploy
```

## Key Features

- **POST → GET conversion** — Makes JSON-RPC cacheable by browsers and CDNs
- **Blockchain-aware caching** — Finalized blocks get `immutable` headers; latest blocks get predictive TTLs based on block time
- **ETag / 304 support** — Conditional requests prevent bandwidth waste on unchanged data
- **Batch splitting** — Breaks batch requests into parallel cacheable singles
- **eth_getLogs optimisation** — Auto-splits large block ranges into cacheable chunks
- **Multi-provider routing** — Route requests by chain ID with configurable upstream providers
- **Token passthrough** — Each user supplies their own RPC token; cached data is shared across users
- **Admin Dashboard** — Monitor cache hit rates, manage providers, test RPC calls
- **Admin authentication** — Token-based auth for management API and Dashboard

## Configuration

### Environment Variables (Worker)

| Variable | Description | Default |
|---|---|---|
| `ADMIN_TOKEN` | Admin API authentication token | `""` (no auth) |
| `DEFAULT_BLOCK_TIME_MS` | Expected block interval (ms) | `12000` |
| `DEFAULT_FINALIZED_CACHE_TTL` | Cache TTL for finalized data (s) | `604800` |
| `MAX_URL_LENGTH` | Max GET URL length before falling back to POST | `2048` |

Set `ADMIN_TOKEN` via Cloudflare Dashboard (Settings → Variables) or `wrangler secret put ADMIN_TOKEN`.

## CI/CD

| Workflow | Trigger | Action |
|---|---|---|
| **CI** | Push / PR to `main` | Test + type check |
| **Release** | Push to `main` (sdk changes) | Publish SDK to npm via semantic-release |
| **Deploy** | Push to `main` (worker changes) | Deploy Worker to Cloudflare |

## License

MIT
