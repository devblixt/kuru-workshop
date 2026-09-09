import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {encodeFunctionData,hashTypedData,parseEventLogs,type Hex} from 'viem';
import {keys,config} from '../apps/server/src/config.ts';
import {rpc,snapshot,accountState,verifyDeployment} from '../apps/server/src/chain.ts';
import {deployment,coreAbi,domain,planTypes,chain} from '../packages/shared/manifest.ts';
import {meraAbi} from '../packages/shared/meraAbi.ts';
import {stringify} from '../packages/shared/model.ts';
import {send} from './transactions.ts';
if(existsSync('artifacts/mera-acceptance.json'))throw new Error('Mera acceptance already recorded');
await verifyDeployment();
const key=keys(),user=privateKeyToAccount(key.smoke),manager=privateKeyToAccount(key.manager),relayer=privateKeyToAccount(key.relayer);
const keyFile='secrets/mera-test.json';if(!existsSync(keyFile))writeFileSync(keyFile,JSON.stringify({privateKey:generatePrivateKey()}),{mode:0o600});
const mera=privateKeyToAccount(JSON.parse(readFileSync(keyFile,'utf8')).privateKey);
if((await rpc.getCode({address:mera.address}))?.toLowerCase()!==('0xef0100'+config.mera.slice(2)).toLowerCase()){
 const authorization=await mera.signAuthorization({chainId:chain.id,contractAddress:config.mera,nonce:await rpc.getTransactionCount({address:mera.address})});
 await send(key.relayer,'mera-test-delegate',config.mera,encodeFunctionData({abi:meraAbi,functionName:'implementation'}),0n,[authorization]);
}
assert.equal((await rpc.getCode({address:mera.address}))?.toLowerCase(),('0xef0100'+config.mera.slice(2)).toLowerCase());
let a=await accountState(user.address);const start=a.balances.map(BigInt),priorBuy=a.usage!.bought;
const s=await snapshot(),refs=s.markets.map(m=>BigInt(m.reference)) as [bigint,bigint,bigint];assert(s.markets.every(m=>m.available));
const expiry=(await rpc.getBlock()).timestamp+1800n;
const c={manager:manager.address,expiry,buyCap:priorBuy+25000000n,sellCap:25000000n,tradeCap:15000000n,references:refs,floors:refs.map(p=>p*97n/100n) as [bigint,bigint,bigint],ceilings:refs.map(p=>p*103n/100n) as [bigint,bigint,bigint]};
await send(key.smoke,'mera-test-configure',config.mera,encodeFunctionData({abi:meraAbi,functionName:'configureMeraPolicy',args:[Number(a.id),c,mera.address]}));
await send(key.smoke,'mera-test-authorize',deployment.core,encodeFunctionData({abi:coreAbi,functionName:'authorizeAccountSigner',args:[user.address,mera.address,1,expiry]}));
a=await accountState(user.address);assert.equal(a.authorized,true);assert.equal(a.executor.toLowerCase(),mera.address.toLowerCase());assert.equal(a.usage!.bought,priorBuy);
async function signed(amountIn:bigint){const a=await accountState(user.address);const plan={accountId:Number(a.id),version:a.policy!.version,authNonce:BigInt(a.authNonce),nonce:BigInt(a.nonce),deadline:(await rpc.getBlock()).timestamp+60n,trades:[{marketIndex:1,isBuy:true,amountIn,minAmountOut:1n}]};const signature=await manager.signTypedData({domain:domain(mera.address),types:planTypes,primaryType:'Plan',message:plan});assert.equal(hashTypedData({domain:domain(mera.address),types:planTypes,primaryType:'Plan',message:plan}),await rpc.readContract({address:config.mera,abi:meraAbi,functionName:'hashPlan',args:[plan]}));return {plan,signature};}
async function reject(p:Awaited<ReturnType<typeof signed>>,error:string){await assert.rejects(rpc.simulateContract({account:relayer,address:mera.address,abi:meraAbi,functionName:'executeRebalance',args:[p.plan,p.signature]}),new RegExp(error));}
await reject(await signed(20000000n),'BudgetExceeded');
const p=await signed(10010000n);await rpc.simulateContract({account:relayer,address:mera.address,abi:meraAbi,functionName:'executeRebalance',args:[p.plan,p.signature]});
const receipt=await send(key.relayer,'mera-test-trade',mera.address,encodeFunctionData({abi:meraAbi,functionName:'executeRebalance',args:[p.plan,p.signature]}));
const fills=parseEventLogs({abi:meraAbi,logs:receipt.logs,eventName:'TradeExecuted'});assert.equal(fills.length,1);assert.equal(fills[0].address.toLowerCase(),config.mera.toLowerCase());const t=fills[0].args;
a=await accountState(user.address);assert.equal(BigInt(a.nonce),p.plan.nonce+1n);assert.equal(BigInt(a.balances[3]),start[3]-t.amountInUsed);assert.equal(BigInt(a.balances[1]),start[1]+t.amountOut);assert.equal(a.usage!.bought,priorBuy+t.amountInUsed);await reject(p,'InvalidPlan');
const stale=await signed(10010000n);
await send(key.smoke,'mera-test-revoke',deployment.core,encodeFunctionData({abi:coreAbi,functionName:'revokeAccountSigner',args:[user.address,mera.address]}));await reject(stale,'Unauthorized');
await send(key.smoke,'mera-test-pause',config.mera,encodeFunctionData({abi:meraAbi,functionName:'pausePolicy',args:[Number(a.id)]}));
a=await accountState(user.address);assert.equal(a.authorized,false);assert.equal(a.policy!.paused,true);
const result={at:new Date().toISOString(),user:user.address,accountId:a.id,mera:mera.address,implementation:config.mera,trade:receipt.transactionHash,block:receipt.blockNumber,start,ending:a.balances,usage:a.usage,checks:['7702 delegation code read-back','Mera domain signature matches contract','over-cap simulation rejected','actual testnet swap through Mera EOA','independent AccountCore balance reconciliation','legacy usage preserved','replay rejected','revocation rejected','pause and permission read-back'],passkey:false};writeFileSync('artifacts/mera-acceptance.json',stringify(result));console.log(stringify(result));
