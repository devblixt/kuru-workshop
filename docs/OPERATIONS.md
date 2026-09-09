# Operator setup

## Local application

Use Node 24.3+ and Foundry. Run `npm ci`, copy `.env.example` to `.env`, and choose WORKSHOP_USERNAME and WORKSHOP_PASSWORD. Blank credentials disable site login. Keep `.env` private. Run the checks in README, then `npm run api`. The compiled frontend and API share port 8789. Use PUBLIC_ORIGIN matching the browser origin exactly.

The checked-in manifest identifies public Monad testnet contracts. Policy and manager addresses are intentionally unset. The UI can be inspected before deploying, but account setup and trading need an operator deployment.

## Dedicated testnet deployment

1. Run `node --import tsx scripts/create-keys.ts`. This creates fresh manager, relayer, liquidity and smoke keys in ignored `secrets/workshop.json`, mode 0600, and prints only addresses. Never use production keys.
2. Fund the generated relayer address with native testnet MON (chain 10143). Native gas and Kuru faucet tokens are separate.
3. Build the policy with `npm run test:contracts`, then run `npm run deploy:contract`. This broadcasts a deployment using the relayer. It records public deployment metadata in ignored `artifacts/deployment.json` and a private signed-transaction recovery file. A prior deployment record prevents accidental redeployment.
4. Copy policy, manager and codeHash from the deployment record into POLICY_ADDRESS, MANAGER_ADDRESS and POLICY_CODE_HASH in your existing `.env`. The deployment script does not overwrite an existing `.env`.
5. Set up your private AI runner before starting `npm run worker`. Only one worker database should control a given relayer key. Independent databases do not share nonce leases.
6. Run `npm run preflight`. Exit 2 means the configured cohort liquidity threshold is not satisfied; it is not a successful end-to-end rehearsal.

The optional `npm run liquidity` script deposits the dedicated liquidity wallet's token balances, cancels that wallet's existing orders on the three configured markets, and places workshop fixture liquidity. Review its fixed example prices and inventory before running it. It broadcasts transactions and is not required for unit tests. Obtain tokens through legitimate faucet claims and respect the cooldown.

## Model runner

The included runner targets Codex CLI 0.149.1 and defaults to gpt-5.6-luna. Compatibility and model entitlement must be verified with your own account. No binary, account login, auth file or paid API credential is included. Obtain the matching Linux binary for your container architecture and mount it as `runtime/codex`; authenticate your own dedicated private Codex home at `secrets/codex`. Keep permissions restricted and never commit either directory.

The runner uses ephemeral schema-constrained requests, disables tools, enforces a 20-second deadline, and receives numeric market snapshots. It has no wallet-key mount. Do not expose port 8790 publicly. After startup, create the local artifacts directory and run `node --import tsx scripts/model-probe.ts` to verify actual output. An installation or health response alone does not prove model compatibility.

## Containers and hosting

Build with `docker build -f ops/Dockerfile -t kuru-workshop:local .`. Create `data`, `secrets/codex` and `runtime`, with persistent directory access for container UID 1000. Supply `secrets/worker.json` containing only your manager and relayer keys; do not mount the full operator key file into the worker. Set file mode 0600 and ownership so UID 1000 can read it.

Run `docker compose --env-file .env -f ops/compose.yaml up -d`. The API is bound to 127.0.0.1:8789, the worker and runner use the private Compose network, and no existing host network or DNS setup is required. Configure your own HTTPS reverse proxy and PUBLIC_ORIGIN. The cookie is Secure on HTTPS, HttpOnly and SameSite=Strict, with a seven-day expiry. Wallet authentication remains separate and lasts four hours.

Back up SQLite using its backup API, including outstanding transaction state. Preserve private signed-transaction journals and the previous image before replacing a release. Reconcile uncertain broadcasts before sending replacements. Successful broadcast alone does not prove successful execution; require receipt and policy-event/state read-back. Never restore an old database over live nonce state without reconciling chain activity.

## Workshop rehearsal

Verify a fresh wallet can claim tokens, deposit, configure the policy, grant TRADE, observe a real rebalance, see an over-cap simulation rejected, and revoke. Confirm actual model output, available market depth, funded relayer, expired-policy handling and restart recovery. Shared baskets reduce model calls; each participant still has independent balances and policy limits. Missing liquidity or incompatible hosted API data must be visible and must not be replaced with fabricated success.
