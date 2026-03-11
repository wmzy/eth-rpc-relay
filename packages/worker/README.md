# eth-rpc-relay-worker

Cloudflare Worker that serves as the backend for [eth-rpc-relay](../sdk/). Handles request parsing, blockchain-aware cache policy computation, upstream proxying, and includes a React-based admin dashboard.

## Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Storage**: Durable Objects (SQLite)
- **Frontend**: React + React Router
- **Build**: Vite + @cloudflare/vite-plugin

## Development

```bash
# Start local dev server
npm run dev

# Run tests
npm test

# Type check
cd ../.. && npm run lint

# Deploy
npm run deploy
```

## Architecture

### API Routes

| Route | Auth | Description |
|---|---|---|
| `GET\|POST /rpc` | — | JSON-RPC relay endpoint |
| `GET\|POST /rpc/*` | — | JSON-RPC relay (path-based) |
| `GET /health` | — | Health check |
| `GET /api/relay-config` | — | Public config for SDK auto-discovery |
| `POST /api/auth/verify` | Admin | Verify admin token |
| `GET /api/providers` | Admin | List providers |
| `POST /api/providers` | Admin | Create provider |
| `PUT /api/providers/:id` | Admin | Update provider |
| `DELETE /api/providers/:id` | Admin | Delete provider |
| `GET /api/stats` | Admin | Hourly stats |
| `GET /api/stats/summary` | Admin | Aggregated stats summary |
| `GET /api/config` | Admin | Server configuration |
| `/*` | — | React SPA (Dashboard) |

### Durable Objects

| Object | Purpose |
|---|---|
| `BlockTracker` | Tracks latest and finalized block numbers per chain |
| `CacheStore` | Persistent key-value cache with TTL for RPC responses |
| `ProviderConfig` | Stores upstream provider configurations |
| `StatsCollector` | Aggregates hourly request statistics |

### Cache Policy

The cache policy engine determines `Cache-Control` headers based on blockchain state:

| Condition | Cache Policy |
|---|---|
| Static methods (`eth_chainId`, `net_version`) | `immutable`, 1 year |
| Hash-based lookups (`eth_getTransactionByHash`) | `immutable`, 1 week |
| Block number ≤ finalized height | `immutable`, 1 week |
| `earliest` tag | `immutable`, 1 week |
| `latest`/`finalized`/`safe`/`pending` tags | Short TTL based on block time, `must-revalidate` |
| Block number > finalized | Short TTL, `must-revalidate` |
| `eth_call` with `from` field | `private` scope |

### Token Passthrough

The relay does not store any authentication credentials. Instead:

1. Admin configures a provider with a **base URL** and **auth type** (how the client token maps to upstream auth)
2. Client sends their own API key via `Authorization: Bearer {token}` header
3. Worker maps the token to the upstream authentication scheme:
   - `api-key`: Appends to URL path (`{baseUrl}/{token}`)
   - `bearer`: Forwards as `Authorization: Bearer {token}`
   - `url-param`: Adds as `?key={token}`
   - `none`: Token is ignored

Different users use their own tokens while sharing the same cache.

## Dashboard

The worker serves a React SPA with three pages:

- **Monitor** — Cache hit rates, traffic stats, per-provider and per-method breakdown
- **Providers** — CRUD for upstream provider configurations
- **Test Console** — Interactive RPC testing using the SDK, with token persistence

Access requires an admin token (set via `ADMIN_TOKEN` environment variable).

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `ADMIN_TOKEN` | Admin API auth token. Empty = no auth | `""` |
| `DEFAULT_BLOCK_TIME_MS` | Block interval for cache TTL calculation | `12000` |
| `DEFAULT_FINALIZED_CACHE_TTL` | TTL (seconds) for finalized block data | `604800` |
| `MAX_URL_LENGTH` | Max GET URL length before POST fallback | `2048` |

Set sensitive values via Cloudflare Dashboard or:

```bash
wrangler secret put ADMIN_TOKEN
```

## Deployment

```bash
# Build and deploy
npm run deploy

# Or via CI — push to main triggers .github/workflows/deploy.yml
```

Required GitHub secret: `CLOUDFLARE_API_TOKEN`

## License

MIT
