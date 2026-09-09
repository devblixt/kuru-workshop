import {deployment,bookAbi} from '../../../packages/shared/manifest.ts';
import type {Snapshot,Trade} from '../../../packages/shared/model.ts';
import {rpc,accountState,multicallAddress} from './chain.ts';
export const min=(...xs:bigint[])=>xs.reduce((a,b)=>a<b?a:b);
export const ceil=(a:bigint,b:bigint)=>(a+b-1n)/b;
export function candidates(balances:bigint[],references:bigint[],weights:number[],buyRemaining:bigint,sellRemaining:bigint,tradeCap:bigint,sellRefs:bigint[]){
 const units=deployment.markets.map(m=>10n**BigInt(m.decimals));
 const values=balances.map((b,i)=>i===3?b:b*references[i]/units[i]);const total=values.reduce((a,b)=>a+b,0n);
 if(total===0n)return [];
 const sells:Trade[]=[],buys:Trade[]=[];let cash=balances[3],buy=buyRemaining,sell=sellRemaining;
 for(const isBuy of [false,true])for(let i=0;i<3;i++){
  if(references[i]===0n||sellRefs[i]===0n)continue;
  const delta=total*BigInt(weights[i])/10000n-values[i];
  if((delta>0n)!==isBuy||((delta<0n?-delta:delta)*10000n<total*500n))continue;
  const limit=isBuy?min(delta,buy,tradeCap,cash):min(-delta,sell*references[i]/sellRefs[i],tradeCap*references[i]/sellRefs[i]);
  if(limit<10_010_000n)continue;
  if(isBuy){buys.push({marketIndex:i,isBuy,amountIn:limit,minAmountOut:1n});buy-=limit;cash-=limit;}
  else{
   const raw=min(limit*units[i]/references[i],balances[i]);const step=BigInt(deployment.markets[i].multiplier);const amountIn=raw/step*step;
   if(amountIn===0n)continue;sells.push({marketIndex:i,isBuy,amountIn,minAmountOut:1n});sell-=ceil(amountIn*sellRefs[i],units[i]);
   // Do not pre-spend unconfirmed sell proceeds. A later cycle can deploy the cash.
  }
 }
 return [...sells,...buys];
}
export async function makeTrades(a:Awaited<ReturnType<typeof accountState>>,s:Snapshot,weights:number[]):Promise<Trade[]>{
 if(!a.policy||!a.usage||!a.authorized)throw new Error('Policy is not authorized');
 const c=a.policy.config;const refs=s.markets.map(m=>BigInt(m.reference));
 if(s.markets.some(m=>!m.available)||Date.now()-s.at>20000)throw new Error('Liquidity unavailable or snapshot stale');
 const proposed=candidates(a.balances.map(BigInt),refs,weights,c.buyCap>a.usage.bought?c.buyCap-a.usage.bought:0n,c.sellCap>a.usage.sold?c.sellCap-a.usage.sold:0n,c.tradeCap,[...a.usage.references]);
 const trades:Trade[]=[];
 if(!proposed.length)return trades;
 const estimates=await rpc.multicall({multicallAddress,blockNumber:BigInt(s.block),contracts:proposed.map(t=>({address:deployment.markets[t.marketIndex].address,abi:bookAbi,functionName:'estimateSwap' as const,args:[Number(a.id),t.isBuy,t.amountIn] as const}))});
 for(let j=0;j<proposed.length;j++){
  const t=proposed[j],m=deployment.markets[t.marketIndex],estimate=estimates[j];if(estimate.status!=='success')continue;const quote=estimate.result;
  if(quote.amountInUsed===0n||quote.amountOut===0n)continue;
  const units=10n**BigInt(m.decimals);const base=t.isBuy?quote.amountOut:quote.amountInUsed;const usd=t.isBuy?quote.amountInUsed:quote.amountOut;
  if(usd<ceil(base*c.floors[t.marketIndex],units)||usd>base*c.ceilings[t.marketIndex]/units)continue;
  const minAmountOut=quote.amountOut*995n/1000n;if(minAmountOut===0n)continue;
  trades.push({...t,minAmountOut});
 }
 return trades;
}
