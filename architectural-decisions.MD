# Architecture decisions

## 2026-09-09 — Public source distribution

Publish a curated source snapshot with new Git history. Exclude operational artifacts, screenshots, databases, keys, authentication storage and private deployment configuration. Retain canonical public protocol addresses and dependency provenance. Use an MIT license for project code and preserve dependency licenses. Historical internal decisions remain in the private workspace; this file records the public baseline.

## 2026-09-09 — Execution and custody

Funds stay in AccountCore. Owners authorize the policy for TRADE only. The policy verifies a manager-signed plan and enforces caps, price bands, expiry and replay protection. A separate workshop relayer pays gas; using the hosted Kuru relay was considered and not adopted. The planner, manager and durable transaction reconciliation remain in our worker.

## 2026-09-09 — Login and deployment defaults

Use a seven-day server-side site session, separate from wallet signature authentication. Require operator-selected credentials; no deployed credentials or manager defaults are distributed. Container deployment binds the API to localhost and uses its own network. Operators supply HTTPS and their own credentials, keys and model authentication.

## 2026-09-09 — Shared decisions and reference valuation

One structured model decision covers all three baskets each minute. Per-account deterministic planning and contract enforcement bound execution. Owner-approved daily sell references are testnet fixtures, not oracle valuations. Missing liquidity, stale snapshots and invalid model output skip execution.
