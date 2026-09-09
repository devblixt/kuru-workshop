import {readFileSync,writeFileSync} from 'node:fs';
const artifact=JSON.parse(readFileSync('contracts/out/PortfolioPolicy.sol/PortfolioPolicy.json','utf8'));
writeFileSync('packages/shared/policyAbi.ts',`// Generated from the tested contract; run npm run abi after contract changes.\nexport const policyAbi = ${JSON.stringify(artifact.abi,null,2)} as const;\n`);

const mera=JSON.parse(readFileSync("contracts/out/MeraPortfolio.sol/MeraPortfolio.json","utf8"));
writeFileSync("packages/shared/meraAbi.ts",`// Generated from MeraPortfolio.sol.\nexport const meraAbi = ${JSON.stringify(mera.abi,null,2)} as const;\n`);
for(const [name,variable] of [['MeraPortfolioV2','meraV2Abi'],['WorkshopGasless','gaslessAbi']]){
 const a=JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`,'utf8'));
 writeFileSync(`packages/shared/${variable}.ts`,`// Generated from ${name}.sol.\nexport const ${variable} = ${JSON.stringify(a.abi,null,2)} as const;\n`);
}
