# Facilitator runbook — 45–60 minutes

## Before admission

Run preflight and confirm at least 7,500 USDC of depth on each side of each basket market inside the approved bands. Check relayer MON, the workshop faucet reserve, an empty pending transaction queue, correct HTTPS/login and valid model decisions within 20 seconds. Keep operator keys and credentials private.

Participants bring a browser wallet and a WebAuthn PRF-capable passkey authenticator. **They do not need native MON.** All available UI actions are sponsored; their wallets sign messages and typed approvals. The funding button deposits 250 test USDC directly into AccountCore. This is a workshop grant with a 12-hour cooldown.

## Run of show

| Time | Activity |
|---|---|
| 0–5 | Show the example app, assets, account balances and a completed rebalance |
| 5–12 | Explain AccountCore custody, Mera delegation, signed policies and the relayer |
| 12–20 | Connect and verify wallets; request the gasless USDC grant |
| 20–35 | Trace the API and contract calls in the example source; configure and authorize a session |
| 35–42 | Observe execution, simulate an over-budget trade, pause and revoke |
| 42–45 | Discuss project ideas and changes participants could build |
| Optional 15 | Change a basket objective or inspect signed withdrawal execution |

The repository is a complete example application. Use its source to explain each building block; no starter branch or TODO exercise is required.

## Calls to explain

- Funding: authenticated request → workshop grant → `depositForAccount`.
- Identity: SIWE challenge, nonce, wallet signature and secure cookie.
- Mera: passkey PRF derivation → signed 7702 authorization → sponsored installation.
- Limits: owner-signed configuration → `executeOwnerAction`.
- Permissions: AccountCore `authorizeAccountSignerBySig` and `revokeAccountSignerBySig`.
- Trading: shared AI targets → deterministic per-account planner → manager signature → simulation → Mera EOA → Kuru swap.
- Recovery: signed bytes persisted before broadcasting; finalized receipt and independent state read-back.
- Withdrawal: amount signature, temporary helper permission and revocation bundled atomically; proceeds go only to the root account.

## Demonstrations and troubleshooting

Run the cap simulation before the first rebalance while sufficient USDC is available, or set a lower daily buy cap such as 180 USDC so enough cash remains after trading to demonstrate an over-budget rejection. The simulation never broadcasts. Do not fake liquidity or completed trades.

If passkey setup is unavailable, check authenticator PRF support and the site hostname. If signatures expire, refresh state and sign again; do not reuse stale authorization nonces. If a submitted action is uncertain, wait for journal reconciliation rather than requesting another transaction. The faucet cooldown is independent of the public Kuru faucet. Existing wallet USDC is not used by the grant button.

Stop first disables worker scheduling, then the root signs an onchain pause. Revocation removes TRADE permission. A previously submitted transaction can settle before either lands. An owner withdrawal uses three signatures, spends no participant MON, and revokes the temporary helper permission in its own transaction.
