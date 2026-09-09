# Architecture decisions

## 2026-09-09 — Public source distribution

Publish a curated source snapshot with new Git history. Exclude operational artifacts, screenshots, databases, keys, authentication storage and private deployment configuration. Retain canonical public protocol addresses and dependency provenance. Use an MIT license for project code and preserve dependency licenses. Historical internal decisions remain in the private workspace; this file records the public baseline.

## 2026-09-09 — Execution and custody

Funds stay in AccountCore. Owners authorize the policy for TRADE only. The policy verifies a manager-signed plan and enforces caps, price bands, expiry and replay protection. A separate workshop relayer pays gas; using the hosted Kuru relay was considered and not adopted. The planner, manager and durable transaction reconciliation remain in our worker.

## 2026-09-09 — Login and deployment defaults

Use a seven-day server-side site session, separate from wallet signature authentication. Require operator-selected credentials; no deployed credentials or manager defaults are distributed. Container deployment binds the API to localhost and uses its own network. Operators supply HTTPS and their own credentials, keys and model authentication.

## 2026-09-09 — Shared decisions and reference valuation

One structured model decision covers all three baskets each minute. Per-account deterministic planning and contract enforcement bound execution. Owner-approved daily sell references are testnet fixtures, not oracle valuations. Missing liquidity, stale snapshots and invalid model output skip execution.

## 2026-09-09 — Approved Mera trading signer and EIP-7702 execution

The original decision to grant the standalone PortfolioPolicy contract TRADE is reverted for new sessions. Existing sessions retain their legacy executor until the owner opts into migration. Funds remain in the root AccountCore balance. A separate browser-derived Mera passkey EOA delegates to non-upgradeable MeraPortfolio; the existing private worker sponsors that authorization, then calls the EOA with manager-signed rebalance parameters. The connected root wallet configures the policy and grants the Mera EOA TRADE. No backend receives the passkey key.

MeraPortfolio has two execution contexts. At its implementation address it stores per-account signer, policy, nonces and daily counters. At the delegated EOA it forwards signed plans to that implementation and executes only typed swap callbacks from it. Kuru therefore observes the Mera EOA as swap caller. This deliberately keeps accounting out of EOA storage: signer rotation preserves daily usage, and there is no first-caller initializer or constructor-state assumption. The additional callback costs gas, but avoids duplicating budget state for each passkey and simplifies migration. Manager signatures bind the Mera EOA, chain, account, policy version and AccountCore authorization nonce.

The new policy adds legacy usage to its own daily usage and requires legacy TRADE to be revoked before execution. The first Mera configuration adopts the legacy sell references if present; subsequent UTC days use the newly approved references. Reconfiguration, pause and Mera rotation preserve current-day usage and references. Owner actions outside manager policy remain outside these guarantees. Configuration and revocation are still root-wallet transactions, not sponsored root meta-transactions in this version.

Only authenticated wallets may queue chain-10143 authorizations targeting the pinned implementation. Sponsorship is bounded to five requests per wallet per day and 0.1 MON per delegation. Delegation and rebalances share the worker lease, nonce sequence and durable raw-transaction journal. A successful receipt alone is insufficient: check the exact EIP-7702 code indicator before reporting delegation complete. The 7702 delegation persists independently of the 30-minute session; root revocation and contract expiry stop trading.

## 2026-09-09 — Fully sponsored participant actions

The user requires participants to need zero native MON. The earlier root-wallet transaction setup is reverted for the application. Replace the public faucet/approval/deposit sequence with a workshop-funded 250-USDC grant deposited directly through AccountCore.depositForAccount. The existing faucet is caller-only; pretending to relay its claim for a different EOA would fund the wrong address. The new fixed grant uses existing operator test inventory, has a 12-hour onchain cooldown per account and requires authenticated admission. It does not pull existing wallet tokens.

MeraPortfolioV2 accepts owner-signed configuration and pause actions, bound to chain, implementation, account, full configuration hash, owner nonce, AccountCore authorization nonce and a five-minute deadline. Core signer grants/revocations use its native BySig methods. Manager plan domain version 2 distinguishes the new implementation while retaining the Mera EOA as verifying address. Previous Mera and original policy usage are aggregated; existing sessions remain on their current executor until the owner migrates.

WorkshopGasless handles withdrawals separately from Mera. The owner signs an exact USDC withdrawal, an AccountCore authorization granting only WITHDRAW to this helper, and the subsequent revocation. One sponsored transaction grants that temporary permission, withdraws the specified amount, sends it only to the root account, and revokes permission. Any failure reverts all state and transfers. Mera remains TRADE-only. Three signatures are a deliberate tradeoff: no root-EOA delegation and no permanent withdrawal authority are needed.

All owner actions, Mera delegation and trading share the existing worker's nonce lease and durable raw-transaction journal. No browser eth_sendTransaction path remains. API input is a closed union of typed actions; target addresses and calldata are constructed server-side, with wallet ownership, current nonces and complete simulation checked before signing the outer transaction. Gas budgets and per-wallet sponsorship limits bound operator exposure. Native gas is paid by the existing workshop relayer, not supplied to participant wallets.
