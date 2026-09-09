# Validation boundaries

The public snapshot includes TypeScript tests for planning, decision validation, admission, leases, login and Kuru data conversion, plus Foundry policy tests. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:contracts`.

Automated unit tests do not fund accounts, contact a model or broadcast transactions. Operator preflight and model-probe commands are separate read/model checks. Deployment and liquidity commands explicitly broadcast using locally supplied keys.

Private workshop execution records, participant data and screenshots are intentionally excluded. Prior deployment results are not evidence that a new operator's environment works. Complete the rehearsal in OPERATIONS.md for each deployment.

Known external integration issue at publication: some live Kuru order-book responses do not match the strict price_x18 schema expected by the hosted-data adapter. The dashboard reports unavailable data; this integration must be checked before advertising a successful live workshop. No compatibility fallback is claimed.

## Mera integration — September 9, 2026

- 30 Solidity tests pass: the legacy suite plus delegated accounting, callback caller identity, owner-only configuration, signer rotation, migration usage and concurrent legacy-permission rejection. Fuzz accounting runs 512 cases per implementation.
- 16 TypeScript tests pass, including authenticated sponsorship binding to the chain, implementation, signer and nonce, plus the existing 25-session admission and persistence tests.
- Monad testnet implementation: `0x2aad73ed4646485321215dd95d1720af02a353ea`, deployment transaction `0x7e921e0343ce3b3c1cc5454a3b6bb5fe5ccab95e5eba72f5ba92aa90272641f5`.
- Dedicated CLI acceptance completed a real delegated swap and independently reconciled AccountCore balance deltas and fee-inclusive usage. Over-cap, replay and revoked-permission simulations rejected; the account was paused and revoked afterward.
- Live browser acceptance used Chrome's virtual PRF authenticator with the actual Mera 0.2.0 SDK. It completed a USDC deposit, passkey creation, sponsored delegation, root configuration and TRADE authorization, an autonomous rebalance, over-cap simulation, pause and revocation. Browser errors: none.
- Autonomous Mera receipt: `0xa8a2183e11c185192fff871674239788db72f027540f9f2a7419570c5fd35430`. Mera signer `0xC871616A25C449530F0db3D9BbBEF919b136B467`; AccountCore account 14. Daily usage carried over from the legacy policy and reached approximately 249.99 USDC, rather than resetting on migration.
- Physical authenticator compatibility is not established by the virtual-authenticator test. A new 25-wallet live Mera rehearsal was not run; existing admission/persistence tests cover 25 sessions, and the live Mera acceptance used dedicated test accounts.
- The previously documented hosted Gateway price-schema mismatch remains outside this migration. Onchain execution and balance reads use direct RPC; no successful hosted quote is fabricated.
