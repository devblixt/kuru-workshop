# Mera execution in the example app

Funds stay in the connected root Kuru account. Mera supplies a separate passkey-derived EOA; it receives TRADE permission, never withdrawal permission. The manager key and gas-paying relayer stay in the private worker.

## Setup and execution

1. Connect and verify the root wallet, then fund AccountCore as usual.
2. Review limits and choose **Set up Mera & enable trading**. Create or unlock a PRF-capable passkey on this hostname.
3. Mera signs a chain-10143 EIP-7702 authorization for the configured implementation. The authenticated API queues it; the worker sponsors it and verifies the installed code.
4. The root wallet revokes the old signer if necessary, calls `configureMeraPolicy(accountId, config, meraAddress)` on the implementation, then grants Mera TRADE in AccountCore.
5. The worker signs a bounded plan and calls `executeRebalance(plan, signature)` at the Mera EOA. That call forwards to `executeFor` on the implementation, which authenticates and accounts for the plan and calls `swapLeg` on Mera. Only the implementation can make this callback. Mera makes the actual Kuru `swap` calls.
6. Stop submits an owner pause; revoke removes Mera's AccountCore permission. An already submitted transaction can still settle. Delegation persists after session expiry, but cannot bypass the manager policy.

The implementation stores per-account budgets, references, signer and nonces. The Mera EOA needs no initialized storage. Rotation increments the policy version and preserves usage. The first configuration adopts existing legacy references where present, and new usage is added to the legacy policy's daily usage. Legacy TRADE must be revoked before any delegated rebalance. Root-owner actions and raw transactions signed with the Mera key remain outside the manager's permission boundary.

## Operator setup

Deploy the legacy PortfolioPolicy first if running a new installation, then `node --import tsx scripts/deploy-mera.ts`. Set `MERA_IMPLEMENTATION` and its exact runtime `MERA_CODE_HASH`, retaining `POLICY_ADDRESS` as the legacy contract. Run `npm run abi` after compiling contracts. App and worker must use the same configuration and database. Keep one worker; delegation and trade transactions share its lease, nonce sequence and durable journal.

Five delegation sponsorship requests per authenticated wallet per rolling day are allowed. Requests expire after five minutes if not submitted. Transactions are bounded to 0.1 MON for delegation and 0.3 MON for a rebalance. Never run operator scripts using the same relayer key concurrently with the worker. Reconcile pending broadcasts before release; retain the previous images and database backup.

A successful EIP-7702 outer transaction does not prove its authorization was applied. The worker independently checks the exact `0xef0100 || implementation` code. It recovers uncertain broadcasts with the original signed bytes; it does not allocate replacement nonces automatically.

Mera is pinned to 0.2.0. Only credential metadata is persisted in browser local storage, separately for each root address; the signing session is ended after delegation signing. Passkeys are hostname-bound. A device/browser without WebAuthn PRF must use a compatible authenticator. The backend cannot recover a lost passkey; the root owner can revoke the old signer and configure another.

## Validation

`forge test --root contracts` runs both the legacy and delegated accounting suites. `npm test` covers API authentication and signed authorization binding. `scripts/acceptance-mera.ts` is an operator-only live test using dedicated test keys: it verifies delegation, a real swap, independent balances, cap/replay rejection, pause and revocation. It is not a physical passkey acceptance test. Never commit its keys or pending raw transaction files.
