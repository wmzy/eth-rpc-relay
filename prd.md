# ETH RPC Relay 加速服务产品需求文档 (PRD)

## 1. 产品背景与目标

### 1.1 背景
以太坊 RPC 请求存在响应延迟高、节点负载大、带宽成本高的问题。虽然 HTTP 缓存机制成熟，但 JSON-RPC 标准通常使用 POST 请求，导致浏览器及 CDN 无法有效利用 HTTP 缓存。此外，区块链数据的特性（最终确定性、区块生成周期）为缓存策略的优化提供了独特的切入点。

### 1.2 目标
构建一套基于 HTTP 缓存标准的 ETH RPC 加速系统，通过将 POST 请求转换为符合缓存语义的 GET 请求，结合区块链数据特性（Finalized/Latest 状态），实现三级缓存架构（浏览器、CDN、DB），显著降低延迟、减少上游节点压力并优化前端体验。

---

## 2. 产品架构概览

系统采用 **前端代理 SDK + 边缘计算后端** 的架构。

*   **前端**：拦截 RPC 请求，转换为带参数的 GET 请求，处理大范围查询拆分。
*   **后端**：运行于边缘节点，负责请求还原、缓存策略计算、上游代理及缓存存储。

---

## 3. 功能需求详细说明

### 3.1 请求转换与 URL 优化

**需求描述**：
将前端 JSON-RPC 的 POST 请求转换为可缓存的 GET 请求，并解决 URL 长度限制问题。

**功能细则**：
1.  **POST 转 GET**：将 RPC 方法名（如 `eth_call`）及参数序列化为 URL Query 参数或 Path 参数。
2.  **长 URL 压缩与映射**：
    *   对于参数过大（如 `eth_getLogs` 中的复杂 filter）导致 URL 超限的风险，前端 SDK 支持生成短 Key。
    *   支持将大参数映射为短 URL 路径（如 `/rpc/short/{hash}`），后端通过 Key 检索完整参数进行请求。
3.  **缓存键生成**：确保 URL 及参数唯一对应缓存键，支持前端指定供应商 ID 作为缓存键的一部分。

### 3.2 智能缓存过期策略

**需求描述**：
基于区块链出块机制与数据状态，动态设置 HTTP 缓存头（`Cache-Control`），最大化缓存命中率。

**功能细则**：
1.  **区块状态监控**：后端实时监控目标链的 `latest` 和 `finalized` 区块高度。
2.  **Finalized 区块缓存**：
    *   对于请求参数中明确指定了区块高度且高度小于等于当前 `finalized` 区块高度的请求，设置长效缓存。
    *   策略：设置 `Cache-Control: public, max-age=604800`（1周）或 `immutable`。
3.  **Latest 区块预测缓存**：
    *   对于 `latest` 或 pending 状态的请求，依据链的出块速率（如 ETH 约 12s，L2 各异）预测下一个区块生成时间。
    *   策略：设置 `Cache-Control: public, max-age=<预测剩余时间>`，确保缓存在新区块产生前有效，减少对上游的惊群效应。
4.  **协商缓存支持**：
    * 对于非   `finalized` 区块的请求
    * 响应头携带 `ETag`（基于 Block Hash 防止 reorg）。
    *   当缓存过期时，支持发送条件请求，若数据未变更则返回 `304 Not Modified`，节省带宽。

### 3.3 Batch 请求拆分与并发

**需求描述**：
解决 JSON-RPC Batch 请求无法被 HTTP 缓存命中的问题。

**功能细则**：
1.  **智能拆分**：前端 SDK 识别 Batch 请求，将其拆分为多个独立的单次 GET 请求并发送。
2.  **并发聚合**：前端并行处理返回结果，聚合后通过 Promise 返回给调用方。
3.  **优势**：利用浏览器 HTTP 并发限制（通常 6 个）及已缓存资源的即时响应，避免单个慢请求阻塞整个 Batch 响应。

### 3.4 `eth_getLogs` 深度优化

**需求描述**：
针对 `eth_getLogs` 大范围查询导致的超时与去缓存问题进行专项优化。

**功能细则**：
1.  **范围自动拆分**：
    *   前端 SDK 自动将大区块范围（如 Block 100 - 10000）拆分为标准化的整块区间（如每 1000 块一段）。
    *   拆分策略可配置，适配不同链节点对日志查询的范围限制。
2.  **分页查询支持**：
    *   支持在前端传入分页参数，后端配合 Durable Objects 存储分页状态，实现海量日志数据的高效流转。

### 3.5 供应商与认证

**需求描述**：
支持多供应商路由与用户级认证透传。Relay 本身不做鉴权，多人共用同一 Relay 实例，各自使用自己的 Token 访问上游节点，同时共享缓存数据。

**功能细则**：
1.  **供应商指定**：前端可在请求头（`X-Provider-Id`）或查询参数（`?provider=`）中指定 Provider ID，后端根据管理员配置的授信供应商列表路由请求。
2.  **供应商配置**：管理员通过 Dashboard 配置供应商，包括：
    *   `upstreamUrl`：上游 RPC 的 base URL（不含 API key），如 `https://eth-mainnet.g.alchemy.com/v2`。
    *   `authType`：客户端 Token 的映射方式，决定 Token 如何传递给上游：
        *   `none`：不传递 Token，直接请求上游。
        *   `api-key`：将 Token 拼接到 URL 路径末尾（如 `{baseUrl}/{token}`），适用于 Alchemy 等。
        *   `bearer`：将 Token 放入 `Authorization: Bearer {token}` 请求头。
        *   `url-param`：将 Token 作为查询参数 `?key={token}` 传递。
    *   供应商配置中**不存储任何认证凭据**，所有认证信息均来自客户端。
3.  **Token 透传**：前端通过 `Authorization` 请求头携带自己的 RPC Token（如 Alchemy API key），后端根据供应商的 `authType` 配置将其映射为上游请求的认证信息。不同用户使用各自的 Token，但共享同一份缓存数据。

### 3.6 长时间任务处理

**需求描述**：
处理复杂的 RPC 请求（如归档节点的大范围查询），避免前端连接超时。

**功能细则**：
1.  **异步轮询机制**：后端检测到长任务请求时，立即返回 `202 Accepted` 及 `Retry-After` 时间头。
2.  **后台执行**：任务在边缘节点后台分批执行（防止 Cloudflare worker 超时），结果存入 Durable Objects 。
3.  **结果获取**：前端根据返回的时间间隔重试，最终获取完整数据。

### 3.7 三级缓存体系

**需求描述**：
构建多层次缓存防护，逐级减少回源压力。

**功能细则**：
1.  **第一级：浏览器缓存**：利用强缓存机制，在用户本地拦截请求，实现 0 延迟响应。
2.  **第二级：CDN 缓存**：利用边缘节点的共享缓存，实现跨用户、跨地域的数据复用，对私有数据（如指定了 from 的 eth_call） 应避免 cdn 缓存。
3.  **第三级：DO 缓存**：对于复杂计算或长时存储的数据，使用 Cloudflare Durable Objects 进行持久化存储，作为最后的缓存防线。

### 3.8 监控与管理后台

**需求描述**：
提供可视化界面配置与管理缓存服务。

**功能细则**：
1.  **缓存命中率监控**：展示各级缓存的命中率、流量节省比例。
2.  **配置管理**：动态调整各链的出块时间、缓存过期策略、供应商权重。
3.  **实时日志**：查看错误请求、慢请求追踪。

---

## 4. 技术实现方案

### 4.1 前端代理库
*   **技术栈**：TypeScript + Vite + Vitest + pnpm
*   **npm 包名**：eth-rpc-relay
*   **核心模块**：
    *   `RequestInterceptor`：拦截 `window.fetch` 或 `web3.provider` 发送的请求。
    *   `BatchHandler`：负责 Batch 请求的拆分与结果聚合。
    *   `LogsOptimizer`：专门处理 `eth_getLogs` 的区块范围切分算法。
    *   `UrlSerializer`：处理 JSON-RPC 对象到 URL 参数的序列化与压缩。

### 4.2 后端 Workers (Edge Backend) + Dashboard 页面
*   **技术栈**：Cloudflare Workers + Vite + Workers Vite Plugin + Hono + Durable Objects + React
*   **核心逻辑**：
    *   **Cache API Layer**：优先检查 `caches.default.match(request)`，命中则直接返回。
    *   **RPC Router**：解析 URL，还原为标准的 JSON-RPC POST 请求体。
    *   **Cache Policy Engine**：
        *   解析请求中的 Block Number。
        *   查询当前链状态。
        *   计算 `Cache-Control` 头部值。
    *   **Upstream Proxy**：使用 `fetch` 转发请求至上游节点，注入认证 Token。
    *   **Response Handler**：写入 Durable Objects，返回前端。

---

## 5. 非功能性需求

1.  **性能**：
    *   缓存命中场景下，P95 延迟 < 50ms。
    *   回源场景下，增加的代理转发延迟 < 20ms。
2.  **兼容性**：
    *   前端 SDK 需兼容主流浏览器及 Node.js 环境（可选）。
    *   完全兼容 JSON-RPC 2.0 规范。
3.  **安全性**：
    *   防止 SSRF 攻击，严格校验上游 URL 配置。
    *   敏感 Token 不应记录在日志中。
4.  **GitHub action 集成**:
    *   支持 npm 发布（OIDC 认证）： https://semantic-release.gitbook.io/semantic-release/recipes/ci-configurations/github-actions
    *   支持 Cloudflare 发布
