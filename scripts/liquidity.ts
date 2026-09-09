import {privateKeyToAccount} from 'viem/accounts';
import {encodeFunctionData,erc20Abi,parseAbi,parseUnits} from 'viem';
import {keys} from '../apps/server/src/config.ts';
import {rpc,snapshot,verifyDeployment} from '../apps/server/src/chain.ts';
import {deployment,coreAbi} from '../packages/shared/manifest.ts';
import {stringify} from '../packages/shared/model.ts';
import {send} from './transactions.ts';
import {writeFileSync} from 'node:fs';
await verifyDeployment();const key=keys().liquidity,account=privateKeyToAccount(key);const run=process.env.LIQUIDITY_RUN||'initial';
const abi=parseAbi(['function cancelAllOrders(uint40 userId)','function batch(uint40 userId,(uint8 side,uint96 quantity,uint32 price,uint8 tif,uint8 executionInstruction,uint32 minSizeAfterBlock)[] orders,uint8[] cancelSlotIdxs)']);
for(const token of [...deployment.markets.map(m=>m.token),deployment.usdc]){
 const amount=await rpc.readContract({address:token,abi:erc20Abi,functionName:'balanceOf',args:[account.address]});
 if(amount>0n){await send(key,run+'-approve-'+token,token,encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[deployment.core,amount]}));await send(key,run+'-deposit-'+token,deployment.core,encodeFunctionData({abi:coreAbi,functionName:'deposit',args:[token,amount]}));}
}
const uid=await rpc.readContract({address:deployment.core,abi:coreAbi,functionName:'userRegistry',args:[account.address]});
// Explicit educational price fixtures, not asserted fair values or external oracle data.
const centers=[339195,247500,10202554];
for(let i=0;i<3;i++)await send(key,run+'-cancel-'+i,deployment.markets[i].address,encodeFunctionData({abi,functionName:'cancelAllOrders',args:[uid]}));
const cash=await rpc.readContract({address:deployment.core,abi:coreAbi,functionName:'getBalance',args:[account.address,deployment.usdc]});
const quoteBudget=cash/3n*99n/100n<7600000000n?cash/3n*99n/100n:7600000000n;
for(let i=0;i<3;i++){
 const m=deployment.markets[i],unit=10n**BigInt(m.decimals),mult=BigInt(m.multiplier);
 const bid=Math.floor(centers[i]*0.995),ask=Math.ceil(centers[i]*1.005);
 const base=await rpc.readContract({address:deployment.core,abi:coreAbi,functionName:'getBalance',args:[account.address,m.token]});
 const bidSize=quoteBudget*unit/(BigInt(bid)*10000n)/mult;
 const askLimit=7600000000n*unit/(BigInt(ask)*10000n),askSize=(base<askLimit?base:askLimit)/mult;
 if(bidSize===0n||askSize===0n)throw new Error('Insufficient inventory: '+m.symbol);
 const orders=[{side:0,tif:0,executionInstruction:1,price:bid,quantity:bidSize,minSizeAfterBlock:0},{side:1,tif:0,executionInstruction:1,price:ask,quantity:askSize,minSizeAfterBlock:0}];
 await send(key,run+'-quote-'+i,m.address,encodeFunctionData({abi,functionName:'batch',args:[uid,orders,[]]}));
}
const result=await snapshot();writeFileSync('artifacts/liquidity.json',stringify({account:account.address,run,fixtures:centers,snapshot:result}));console.log(stringify(result));
