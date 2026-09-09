# Validation boundaries

The public snapshot includes TypeScript tests for planning, decision validation, admission, leases, login and Kuru data conversion, plus Foundry policy tests. Run `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:contracts`.

Automated unit tests do not fund accounts, contact a model or broadcast transactions. Operator preflight and model-probe commands are separate read/model checks. Deployment and liquidity commands explicitly broadcast using locally supplied keys.

Private workshop execution records, participant data and screenshots are intentionally excluded. Prior deployment results are not evidence that a new operator's environment works. Complete the rehearsal in OPERATIONS.md for each deployment.

Known external integration issue at publication: some live Kuru order-book responses do not match the strict price_x18 schema expected by the hosted-data adapter. The dashboard reports unavailable data; this integration must be checked before advertising a successful live workshop. No compatibility fallback is claimed.
