# Gasless participant flow

Participants need a wallet and a PRF-capable passkey authenticator, but **no native MON**. The workshop relayer pays transaction fees for funding, delegation, configuration, authorization, trading, pausing, revocation and USDC withdrawals. Wallet prompts request signatures, not transactions.

## Funding

The funding button connects and verifies the root wallet, then requests a workshop grant. `WorkshopGasless.fund(account)` approves exactly 250 USDC from its own inventory and calls `AccountCore.depositForAccount(account, USDC, 250e6)`. The recipient's Kuru account is registered automatically if needed. The recipient pays no approval or deposit gas and starts with USDC already available in AccountCore.

This is a workshop-funded faucet with a 12-hour onchain cooldown, not a relayed claim against Kuru's caller-only public faucet. It uses existing operator test tokens. It does not transfer existing wallet USDC. The initial reserve is 7,500 USDC, sufficient for the 25-person cohort plus headroom; monitor and refill it from legitimate operator inventory.

## Trading setup and controls

Mera signs the EIP-7702 delegation, as before. The root wallet signs an `OwnerAction` binding account ID, action, Mera signer, complete configuration hash, owner nonce, AccountCore authorization nonce and deadline. `MeraPortfolioV2.executeOwnerAction` verifies it and configures or pauses the policy. Owner signatures use domain `KuruPortfolioOwner`, version 1, with the implementation address as verifying contract.

TRADE grants and revocations use AccountCore's native `authorizeAccountSignerBySig` and `revokeAccountSignerBySig`. Their domain is `KuruAccountCore`, version 1. The relay constructs the fixed calls from validated typed fields; it does not accept arbitrary target addresses or calldata.

Manager rebalances still enter through the Mera EOA. Their `KuruPortfolioPolicy` domain uses version 2 for this implementation. Previous Mera and original policy daily usage are included in the new policy. Replacing a passkey or implementation does not replenish the day's allowance. Existing sessions can continue on the prior implementation until the owner migrates.

## Withdrawals

Withdrawals send available USDC only to the connected root account. The user supplies three signatures:

1. The exact amount, account, withdrawal nonce and deadline.
2. Temporary AccountCore WITHDRAW permission for `WorkshopGasless`.
3. Revocation of that permission at the next AccountCore authorization nonce.

One transaction validates the owner request, grants the temporary permission, withdraws USDC, transfers it to the root account, and revokes permission. Any failure reverts the whole transaction, including permissions, counters and transfers. Mera never receives WITHDRAW permission. Three signature prompts avoid requiring delegation of the root EOA or retaining permanent withdrawal authority.

## Queue and operations

All actions use the same worker lease and Ethereum nonce journal as rebalances. Exact signed transaction bytes and hashes are persisted before broadcasting. Restart reconciliation never allocates another nonce for an uncertain submission. Finalized receipts and action-specific state read-back are required before the UI reports success.

Only wallet-authenticated accounts can submit jobs or read their results. Funding is addressed to the authenticated account. Permission changes are restricted to the workshop's configured signers. Each wallet may request at most 100 sponsored owner actions per rolling day; delegation has its separate five-per-day bound. Owner signatures expire within five minutes. Complete simulation precedes broadcast, with a 0.3 MON outer-transaction budget.

Compile and test contracts, then run `scripts/deploy-gasless.ts` with the worker stopped and its pending queue reconciled. The script deploys MeraPortfolioV2 using the current Mera implementation as predecessor and deploys/funds WorkshopGasless. Set `MERA_PREVIOUS_IMPLEMENTATION`, the new `MERA_IMPLEMENTATION`/`MERA_CODE_HASH`, and `GASLESS_ADDRESS`/`GASLESS_CODE_HASH`. Keep `POLICY_ADDRESS` for original policy accounting. Do not run deployment scripts concurrently with a worker using the same relayer key.

The zero-MON browser acceptance script refuses participant transaction requests and asserts both native balance and Ethereum transaction nonce remain zero after the entire flow. It uses the real Mera SDK and a Chrome virtual PRF authenticator, which does not establish compatibility with a physical authenticator.
