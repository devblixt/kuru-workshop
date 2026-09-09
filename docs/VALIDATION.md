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

## Fully gasless flow — September 9, 2026

54 Solidity tests and 18 TypeScript tests pass, plus the production frontend build. The contract suites cover legacy and V2 accounting, sponsored policy authorization, replay/expiry/configuration tampering, funding cooldown and atomic withdrawal rollback if revocation fails.

A fresh browser wallet completed funding, Mera delegation, signed configuration, TRADE authorization, an autonomous rebalance, over-cap simulation, pause, revocation and withdrawal. Its MON balance and Ethereum transaction nonce remained zero throughout; the injected test wallet rejected participant transaction methods, and none were attempted. It made eight root-wallet signatures, including three for withdrawal. Mera used the actual SDK with Chrome's virtual PRF authenticator; physical authenticator compatibility was not tested.

- Root: `0xbA3F4E2c3a726A00bf0231b70621DE02c2Eca9d1`, AccountCore ID 41.
- MeraPortfolioV2: `0x97e191fe4dc5df2fc559340df8dcf0e6ea311afa`.
- WorkshopGasless: `0xe319ad749e8d6877d3dbc83e759d2f169c3696a5`, initially funded with 7,500 existing test USDC.
- Funding receipt: `0x46a9a00300d0f80f1bb8113024b02b6112771c680e137230d2884c6c4071cad0` credited 250 USDC directly to AccountCore.
- Rebalance receipt: `0xbf70a4b41d19c4ad0a037d4941d5a73561946d1a5cd26a0a3f70f7d2c891d6cf`.
- Withdrawal receipt: `0xaed540ae06e300c9126458790c0e46537428131c66b5a1124ad136c50dc77791` returned exactly 70.014098 USDC to the root wallet, independently checked against its ERC20 balance increase and the AccountCore debit.

The test deliberately used a 180-USDC daily buy cap so enough cash remained to demonstrate an over-cap rejection after trading. Final state: policy paused, Mera TRADE revoked, helper WITHDRAW revoked, no browser errors. This was a dedicated live flow, not a new 25-wallet live gasless load rehearsal.
