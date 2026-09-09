# Workshop: building Kuru Baskets

Teach one account's lifecycle: fund → read → authorize → estimate → execute → revoke. Start with the running app, then show the code responsible for each observed result. The goal is for participants to reuse the Kuru integration in another app.

## What belongs to Kuru?

| Layer | Provided capability | Workshop implementation |
|---|---|---|
| Kuru SDK and deployed contracts | AccountCore balances, deposits, signer permissions, market reads and spot swaps | SDK client configuration and UI integration |
| Custom policy contract | Not a built-in Kuru portfolio-manager feature | Allowed markets, budgets, price bands, plan signatures, expiry and replay protection |
| Custom backend | Not a Kuru AI or relay API | Shared AI target weights, deterministic trade planning, simulations, signing, gas payment and transaction recovery |

In this app, “Kuru APIs” primarily means SDK methods and contract interfaces read through Monad RPC. The UI's `/api/*` routes belong to our Fastify server. We use direct RPC market reads; public REST endpoints returned 403 during preparation. Do not present that past observation as a permanent API limitation.

## 45-minute teaching sequence

| Time | Demonstration and explanation | Participant action |
|---|---|---|
| 0–5 | Show an account balance, a decision, a receipt and the stop control. Draw the three layers above. | Open the app and starter. |
| 5–12 | Explain AccountCore versus wallet balances; trace claim, approve and deposit. | Connect, fund 250 test USDC, sign in. Obtain native MON beforehand. |
| 12–20 | Create the SDK client; read available USDC and the ETH market best bid/ask. | Complete starter exercises 1, 2 and 2b; compare output with UI. |
| 20–28 | Explain account owner, policy, manager signer and relayer. Show TRADE authorization and expiry. | Complete exercise 3; configure and authorize the policy. |
| 28–35 | Trace AI weights → planner → estimateSwap → policy simulation → signed transaction. | Observe a decision and, if executable, a real rebalance receipt. |
| 35–42 | Read actual execution amounts and usage; demonstrate a rejected over-limit simulation; pause and revoke. | Inspect the receipt and revoke their own permission. |
| 42–45 | Identify reusable integration points. | Choose an extension: scheduled orders, another basket objective or a different interface. |

For 60 minutes, add a guided trade-estimation exercise and have participants modify a basket objective. Keep the planner, policy and relayer prepared; implementing them from scratch will not fit this slot. Wallet delays come out of optional discussion time. If a trade is skipped, explain its actual reason; use a clearly labeled previous receipt to explain execution rather than imply a live trade occurred.

## Code walkthrough

Paths below are relative to the repository root. Snippets use the deployed addresses in `packages/shared/manifest.ts` and the pinned SDK version 0.0.1.

### 1. Connect the SDK

Open `apps/web/src/workshop.ts` and `packages/shared/manifest.ts`.

```ts
const kuru = createKuruClient({
  publicClient,
  walletClient,
  account: owner,
  addresses: { accountCore: deployment.core },
});
```

The public client reads Monad; the wallet client requests owner signatures. Creating this client does not deposit funds or authorize trading. Resolve the active wallet client when an action begins and verify its chain and account.

### 2. Fund AccountCore

Open `fundAccount()` in `apps/web/src/main.tsx`.

The button reads `faucet.nextClaimAt(owner)` and chain time, calls `faucet.claim()` when eligible, checks USDC balance and allowance, approves exactly 250 USDC when needed, then calls:

```ts
const hash = await kuru.account.deposit({
  token: deployment.usdc,
  amount: 250_000_000n,
});
```

These are separate owner transactions. Faucet claim puts tokens in the wallet; deposit moves USDC into AccountCore. USDC has six decimals. Native MON is separate from the token faucet. During cooldown the flow can use existing wallet USDC. A successful receipt is followed by a balance read.

### 3. Read balances and prices

Open `apps/web/src/workshop.ts`.

```ts
const available = await kuru.account.getBalance({
  user: owner,
  token: deployment.usdc,
});
const [bid, ask] = await kuru.spot.bestBidAsk({
  market: deployment.markets[1].address,
});
```

`getBalance` reads available AccountCore funds, not ERC20 wallet funds. Convert raw USDC with `formatUnits(available, 6)`. Convert market price ticks using the manifest's price precision. Handle empty books before displaying a quote. Best bid/ask is not a guarantee that a proposed order can fill at that price.

For the backend's richer view, show `snapshot()` in `apps/server/src/chain.ts`: one block-pinned multicall reads `getL2Book(20)` for all three markets, handles empty sentinels, normalizes sizes and calculates references/depth. These are testnet book-derived references, not oracle prices.

### 4. Grant a bounded trading session

Open `authorizeManager()` in `apps/web/src/workshop.ts` and the confirmation handler in `main.tsx`.

```ts
await kuru.account.authorizeAccountSigner({
  account: owner,
  signer: policyAddress,
  permissions: 1, // TRADE
  expiry,
});
```

The owner first configures our policy, then gives the policy contract TRADE permission in Kuru. The manager key is recognized by our policy; it is not given direct Kuru permission in this flow. Kuru enforces the signer permission. Our policy separately enforces spending limits, price bands, allowed markets, signatures and replay protection. The relayer pays execution gas. Neither the AI nor the relayer receives the owner's wallet key.

### 5. Convert a decision into an executable trade

Open `apps/server/src/planner.ts` and `worker.ts`.

The AI produces weights, hold/rebalance and an explanation. It does not produce arbitrary calldata. The planner calculates account-specific quantities using available balances, five-percentage-point drift, token units, market precision and remaining budgets. Sell legs precede buys; the current planner does not spend anticipated sell proceeds until a later cycle.

The planner calls the book's `estimateSwap(accountId, isBuy, amountIn)` through RPC. It checks estimated amounts against bands and sets minimum output. An estimate is not execution. The worker refreshes state, builds a versioned plan, signs it with the dedicated manager key and simulates `PortfolioPolicy.executeRebalance(plan, signature)` from the relayer address. After simulation, it persists the signed transaction and hash before broadcasting.

### 6. Explain the actual Kuru swap

Open `contracts/src/PortfolioPolicy.sol`, function `executeRebalance`.

```solidity
IBook.SwapResult memory r = IBook(markets[m]).swap(
    p.accountId,
    t.isBuy,
    t.amountIn,
    t.minAmountOut,
    p.deadline
);
```

This is the Kuru execution call. The policy checks authorization, signed plan, nonce, expiry and allowed markets, then validates actual input/output, average price and budgets. All legs and counters revert together on failure. These are immediate swaps, not resting orders.

For buys, the input is USDC including fees; for sells, the input is the base asset. Show `TradeExecuted` and `RebalanceExecuted`, the Kuru receipt logs, and the independent policy/balance read-back in the worker. Distinguish a transaction hash, a successful receipt and verified state.

### 7. Stop and revoke

Open the stop/revoke handlers in `main.tsx`.

```ts
await kuru.account.revokeAccountSigner({
  account: owner,
  signer: policyAddress,
});
```

The stop action first stops the server session, then requests an onchain policy pause. Revocation removes Kuru TRADE permission for the policy. Already submitted transactions can settle before the owner's pause/revocation lands. Daily policy usage survives session restarts; owner-initiated trades are outside manager limits.

## Live teaching materials

- Use the `starter` download for participants and `solution` for the facilitator. Four TODO functions cover three integration topics: client setup, reads and permission.
- Keep these editor tabs ready: `workshop.ts`, `manifest.ts`, `main.tsx`, `planner.ts`, `PortfolioPolicy.sol`, `worker.ts`.
- Keep a receipt, account address and current policy usage visible side by side.
- Show the three-layer architecture once; return to it when moving from SDK to policy to worker.
- Use **Simulate an over-limit trade** while the account has enough cash for the demonstration. Confirm `BudgetExceeded`; insufficient funds or no liquidity demonstrates a different failure.
- Finish with participant revocation, not a slide. The observable outcome is that delegated execution is disabled.

## Preparation still worth doing

The existing starter covers the basic Kuru integration. A short deck should explain the account model, permission flow, execution lifecycle and extension points. A guided code tour is more useful than documenting every server route. An optional fifth exercise can add `estimateSwap`; prepare and test it before advertising it as part of the starter. It is not currently a starter TODO.

## Hosted REST integration added to the workshop

The UI now uses two Kuru hosted services through `apps/server/src/kuru-data.ts`:

| Our route | Kuru request | Visible result |
|---|---|---|
| `GET /api/markets` | `GET https://api.testnet.kuru.io/api/v1/markets` | Canonical pair, token/decimal and size-precision validation; symbol discovery |
| `GET /api/markets` | `GET https://gateway.testnet.kuru.io/api/depth?symbol=…&state=finalized&levels=20` | Bid, ask, bounded depth and portfolio value estimates |
| Authenticated `GET /api/trades` | `GET https://api.testnet.kuru.io/api/v1/users/{id}/trades?limit=20` | Supported-asset fills, native-size conversion, maker/taker side and receipt links |

Show this client immediately after the SDK market-read exercise: compare the contract price ticks with Gateway x18 prices, then compare both to the displayed USDC value. `scripts/check-kuru-apis.ts` performs that read-only comparison. The initial live check matched both prices and depth for all three markets.

The earlier note about REST 403s describes Python requests during preparation. The actual Node runtime on the VPS successfully reads these APIs. Use normal Node fetch and check the deployed environment rather than infer access from a different HTTP client.

For clarity during teaching: balances and transaction-critical state still come from RPC. The hosted API does not decide spending limits or prove a transaction succeeded. History includes unrelated owner trades; only an exact confirmed worker-journal match is labeled manager execution. Indexer lag and API failures do not become fabricated zero balances or successful trades.

Catalogs cache for 60 seconds, market views for 10 seconds, and each user's recent history for 15 seconds. Concurrent callers share one in-flight request. Upstream failures return HTTP 503 from our read routes and the UI shows unavailable; it does not silently revert to RPC pricing. Failed reads have a five-second retry cooldown. History is the supported-asset subset of the latest 20 account fills, not a complete portfolio ledger. WebSocket migration is intentionally outside this version.
