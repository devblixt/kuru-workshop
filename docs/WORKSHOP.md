# Facilitator runbook

## Before attendees arrive

Run the full preflight and confirm at least 7,500 USDC of depth on each side of every basket market inside the displayed band. Verify Codex produces valid decisions inside 20 seconds, sufficient relayer MON, empty pending transaction queue, correct HTTPS, and the website login. Keep the operator view private.

Ask participants to bring a browser wallet on Monad testnet, chain 10143, with native test MON. The Kuru token faucet supplies 10,000 USDC, 1 WETH, 0.1 cbBTC and 1 XAUt0 per address every 12 hours; it does not supply MON. Do not direct participants to production token addresses.

Distribute the `starter` branch and the operator-selected website login. Require Node 24+, `npm ci`, and `.env.example`. The hosted app remains available if a laptop cannot run the starter.

## 45 minutes

| Minute | Facilitator action | Participant outcome |
|---|---|---|
| 0–5 | Show a funded account, trade receipt and pause/revoke controls | Understand the product |
| 5–12 | Draw owner → policy → Kuru, with separate manager and relayer | Distinguish custody, permission and gas |
| 12–20 | Connect, sign in, claim, approve exactly 250 USDC and deposit | Fund their AccountCore account |
| 20–35 | Complete the three SDK exercises; review caps and authorize | Enable a bounded session |
| 35–42 | Observe allocation and receipts; try the cap guard; stop and revoke | Verify execution and revocation |
| 42–45 | Explain extension ideas and limitations | Choose a hackathon direction |

For 60 minutes, add 15 minutes to modify a basket objective and discuss calendar rebalancing, better valuation or alternative interfaces.

## Exercise checkpoints

1. **SDK client:** connect the public/wallet client to the canonical AccountCore.
2. **Read:** obtain an available USDC balance and read the ETH market's best bid/ask. Convert price ticks with the manifest's price precision. Inspect market parameters as an extension.
3. **Permission:** authorize the policy address with `permissions: 1` and the configured expiry. Grant no other permissions.

Each checkpoint has an implementation on `solution`. The policy contract and signing infrastructure are prebuilt so the exercise fits the slot.

## Demonstrations

- Explain why an agent's promise to respect a cap differs from the contract checking actual fills.
- Show that 250 USDC deposited into a root account is not a segregated subaccount. Point out other available assets and owner activity.
- Try the cap guard while sufficient USDC is available, preferably before the first rebalance. The worker signs and simulates an oversized trade but never submits it. If available cash is below the required demonstration amount, deposit more faucet USDC or use the facilitator account.
- Point out `BudgetExceeded`, the unchanged balances, and the unchanged daily usage. A revert for insufficient funds or empty liquidity is not a successful cap demonstration.
- Stop the worker, confirm the onchain pause, then revoke TRADE. A transaction already submitted can settle before the pause lands.
- Refresh or close the tab during a session: the backend remains responsible for the schedule and the onchain expiry remains the final bound.

## Troubleshooting

- **Faucet cooldown:** display the next claim time; use already claimed funds. Do not create wallets just to evade the cooldown.
- **No trades:** inspect liquidity, price bands, minimum notional, drift and remaining caps. Holding is a legitimate outcome.
- **Waiting on model:** timeout/quota failures skip the cycle. Do not present a canned decision as live AI output.
- **No place available:** admission is capped at 25 wallets. The operator can reset admission between cohorts after confirming all sessions have ended.
- **Configuration expired during wallet prompts:** configure a new policy and reauthorize. Daily usage remains.
- **Pending transaction:** inspect the persisted hash; do not send a fresh-nonce duplicate.

Extension ideas: recurring cash allocation, transparent manager comparisons, a user-owned subaccount, independent reference pricing, or an eligibility-aware RWA interface. They are separate projects, not capabilities claimed by this demo.

## Participant development server

After the hosted deployment passes preflight, participants put `WORKSHOP_API_PROXY=https://your-workshop.example` in their local `.env` and run `npm run dev`. Open **http://localhost:5173** (use localhost for the development browser's secure-cookie exception). The Vite development proxy forwards `/api` to the supplied workshop backend; the owner still signs every wallet operation locally. Log in through the website form with the credentials supplied by the facilitator. Participants do not run the transaction worker, copy server authentication storage or receive manager keys. The proxy's Origin rewrite is development-only and explicitly enabled by this setting. If the browser refuses the secure cookie on localhost, use the hosted app for the execution portion.

### One-button test funding

Choose **Connect wallet & fund my account** (or **Get faucet funds & deposit 250 USDC** when connected). Approve the faucet claim, USDC allowance and deposit in your wallet. The hosted site asks for username/password first. Funding does not require wallet verification; account sessions do. The app claims only when eligible and deposits exactly 250 USDC; remaining faucet tokens stay in your wallet. During the 12-hour cooldown it can deposit existing USDC. Each successful run adds another 250 USDC. Get native test MON from the linked Monad faucet first. If you reject a wallet prompt, retry; already completed claim and allowance steps are read from chain.
