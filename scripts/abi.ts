import {readFileSync,writeFileSync} from 'node:fs';
const artifact=JSON.parse(readFileSync('contracts/out/PortfolioPolicy.sol/PortfolioPolicy.json','utf8'));
writeFileSync('packages/shared/policyAbi.ts',`// Generated from the tested contract; run npm run abi after contract changes.\nexport const policyAbi = ${JSON.stringify(artifact.abi,null,2)} as const;\n`);

const mera=JSON.parse(readFileSync("contracts/out/MeraPortfolio.sol/MeraPortfolio.json","utf8"));
writeFileSync("packages/shared/meraAbi.ts",`// Generated from MeraPortfolio.sol.\nexport const meraAbi = ${JSON.stringify(mera.abi,null,2)} as const;\n`);
