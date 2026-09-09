# Mera execution in the example app

The current participant experience is fully sponsored. See [GASLESS.md](GASLESS.md) for funding, signed policy actions, grants/revocation and withdrawals.

Funds remain in the connected root AccountCore balance. A separate Mera passkey-derived EOA receives TRADE permission. The relayer installs its EIP-7702 delegation and calls that EOA with manager-signed rebalances. The EOA forwards the plan to the implementation for signature, permission and accounting checks. The implementation calls a restricted `swapLeg` callback on Mera, which makes Kuru's actual `swap` calls. Kuru sees the Mera EOA as caller.

The implementation stores per-account limits, references, signer and nonces. Mera needs no initialized storage. Configuration changes invalidate old plans, and signer rotation preserves usage. MeraPortfolioV2 adds the predecessor's usage, including the original policy's daily usage. Owner transactions and raw transactions signed with a Mera private key remain outside the manager's permission boundary.

Mera is pinned to 0.2.0. Only credential metadata is persisted in browser local storage, separately for each root address. The signing session ends after delegation signing. Passkeys are hostname-bound. A compatible WebAuthn PRF authenticator is required. A lost passkey can be replaced by the root owner, who revokes the previous trading signer and configures another.

The delegation persists after the 30-minute session. Expiry, pause and AccountCore revocation stop manager execution independently of the website. A successful outer transaction does not prove delegation succeeded: the worker independently checks the exact `0xef0100 || implementation` code before setup continues.

The previous native-wallet configuration flow remains in historical source and validation records. It is no longer used by the current frontend.
