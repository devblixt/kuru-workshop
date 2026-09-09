# Kuru Baskets

All participant actions are sponsored: funding, setup, trading, pause, revocation and USDC withdrawal. No native MON is required. See [the gasless flow](docs/GASLESS.md).

An example application for policy-limited, AI-managed baskets on Monad testnet. Gold, ETH, BTC and cash are **faucet assets**, not backed RWAs. Funds stay in the participant's Kuru AccountCore balance.

## Run locally

Use Node 24.3 or newer and Foundry with Solidity 0.8.28.

```sh
npm ci
cp .env.example .env
npm run test:contracts
npm run abi
npm test
npm run typecheck
npm run build
npm run api
```

Open `http://localhost:8789`. Set WORKSHOP_USERNAME and WORKSHOP_PASSWORD in your local .env, then log in using the website form. Blank credentials disable login. The seven-day session also applies in local development. Connect and verify a wallet inside the app. The UI can run without signing keys, but trading requires your own configured policy, manager and funded relayer; see docs/OPERATIONS.md. For Vite development, set `PUBLIC_ORIGIN=http://localhost:5173`, run the API, then `npm run dev`.

The worker needs dedicated `manager` and `relayer` private keys in the file selected by `KEYS_FILE`, plus access to the private Codex runner. **Never run a local worker against the same signer keys as a running VPS worker with a different database.** The SQLite lease coordinates only workers sharing that database.

## Authority and execution

1. The workshop faucet deposits 250 test USDC directly into AccountCore. The owner signs the trading limits and a maximum 30-minute expiry.
2. The owner creates a Mera passkey signer and signs its delegation and TRADE authorization; the relayer submits both. It receives no withdrawal, transfer or administration permission.
3. Codex produces three shared basket targets. It sees numeric market snapshots, not wallet keys or participant prompts.
4. A deterministic planner creates a bounded rebalance. The manager signs it, and a separate gas-paying relayer calls the Mera EOA after simulation.
5. The contract checks the live permission, signature, authorization epoch, policy version, nonce, expiry, allowlisted markets and actual swap results.

Buy usage includes fees. Sell usage is rounded up at the first configured reference price for that UTC day. Reconfiguration preserves the day's references and usage. Price bands constrain each leg's realized average, including fees; individual fills and portfolio drawdown are not constrained. All legs revert together on failure. No resting orders are created by the policy.

Root-account balances are shared with the owner's other activity. Available balances enter basket valuation; reserved orders and passive positions are not managed. Owner transactions are outside the manager's limits.

## Repository map

- `contracts/`: policy and independent accounting tests; OpenZeppelin and forge-std source are vendored with provenance below.
- `apps/web/`: React frontend, Mera passkey setup and SDK integration.
- `apps/server/`: API, durable worker, planner and isolated Codex service.
- `packages/shared/`: canonical deployment manifest, generated policy ABI and decision schemas.
- `scripts/`: preflight, policy deployment and bounded liquidity seeding.
- `ops/`: container build and portable Compose configuration.
- `docs/`: workshop runbook and deployment operations.

The current example runs from this branch. See [docs/GASLESS.md](docs/GASLESS.md) for the delegation, policy callbacks, migration accounting and setup flow.

## Verification

```sh
npm run preflight
```

This validates chain ID, canonical proxy implementations, market tokens and units, the deployed policy code hash, and two-sided depth inside a ±3% band. Exit code 2 means the 25-person liquidity headroom is not satisfied. It does not establish Codex availability or a successful trade; see docs/OPERATIONS.md for operator checks.

The SDK is pinned to `@toxicflow-labs/ts-sdk@0.0.1`, source `3237f743363d2296460d151a333b287d74cff603`. The published ABI predates `baseSizeMultiplier()`, so the manifest contains that explicit view. Canonical protocol source used for interface checks: `d214ffb24a8f31165b494f8577173a49f63f79f3`.

References: [testnet deployments](https://kuru-testnet-docs.mintlify.site/deployments/testnet), [permissions](https://kuru-testnet-docs.mintlify.site/accounts/signers-and-permissions), [Codex non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode).

Vendored dependencies: OpenZeppelin Contracts `ef5a2d02d3706e8fa2a13e5af9a306a25d32bfac`; forge-std `c0f966cb111f621bfb283b2a388bc7be18953bba`. Their original SPDX notices and licenses apply.

Package participant downloads with `node --import tsx scripts/package-workshop.ts` before building a hosted release. Download archives are generated locally and ignored by Git.

## Publication and limitations

This repository starts from a clean source snapshot. Private deployment history, keys, authentication storage, databases, participant records and operational artifacts are not included. Public protocol addresses and ABI/code hashes are retained because they identify the testnet contracts.

The code is a workshop reference, not a production fund manager or an audited financial product. The external Kuru data adapter currently rejects some live order-book responses that differ from its expected schema; the dashboard reports unavailable data. Fix and rehearse that integration before a live workshop. Worker execution uses direct RPC and still requires fresh data and valid liquidity.

See [operator setup](docs/OPERATIONS.md), [workshop](docs/WORKSHOP.md), [implementation walkthrough](docs/IMPLEMENTATION-WALKTHROUGH.md), and [validation](docs/VALIDATION.md). Project code is MIT licensed; vendored dependencies retain their own licenses.
