import {verifyDeployment,snapshot,rpc} from '../apps/server/src/chain.ts';
import {config} from '../apps/server/src/config.ts';
import {stringify} from '../packages/shared/model.ts';
await verifyDeployment();const s=await snapshot();
const readiness=s.markets.map(m=>({symbol:m.symbol,twoSided:m.available,cohortDepth:BigInt(m.bidValue)>=7500000000n&&BigInt(m.askValue)>=7500000000n,bidUSDC:Number(m.bidValue)/1e6,askUSDC:Number(m.askValue)/1e6}));
console.log(stringify({deployment:'verified',policy:config.policy,readiness,snapshot:s}));
if(readiness.some(m=>!m.twoSided||!m.cohortDepth))process.exitCode=2;
