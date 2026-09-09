import {z} from 'zod';
import {deployment} from '../../../packages/shared/manifest.ts';
import type {HostedMarkets,HostedTrades} from '../../../packages/shared/hosted-data.ts';
const uint=z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
const address=z.string().regex(/^0x[0-9a-f]{40}$/);
const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const seq=z.number().int().nonnegative().safe();
const token=z.object({tokenAddress:address,decimals:z.number().int().min(0).max(36)});
const catalogSchema=z.object({data:z.array(z.object({marketAddress:address,symbol:z.string().regex(/^[A-Za-z0-9]+$/).max(40),baseToken:token,quoteToken:token,pricePrecision:uint,sizePrecision:uint})).max(500),pagination:z.object({nextCursor:z.string().nullable()})});
const level=z.object({price_x18:uint,total_base_x18:uint});
const depthSchema=z.object({feedEpoch:seq,data:z.object({market_id:address,symbol:z.string(),state:z.literal('finalized'),served_view:z.literal('finalized'),market_seq:seq,global_seq:seq,bids:z.array(level).max(200),asks:z.array(level).max(200)})});
const tradesSchema=z.object({feedEpoch:seq.nullable(),globalUserSeq:uint.nullable(),data:z.array(z.object({tradeId:uint,recordIdx:seq,marketAddress:address,isMaker:z.boolean(),isBuy:z.boolean(),price:uint,filledSize:uint,blockTimestamp:seq,blockNumber:uint,transactionHash:hash})).max(20),pagination:z.object({nextCursor:z.string().nullable()})});
const dataOrigin='https://api.testnet.kuru.io',gatewayOrigin='https://gateway.testnet.kuru.io';
const x18=10n**18n;
// All arithmetic stays integral; only the presentation layer formats decimal strings.
export function normalizeDepth(input:unknown,market:typeof deployment.markets[number],symbol:string){
 const {feedEpoch,data:d}=depthSchema.parse(input);
 if(d.market_id!==market.address.toLowerCase()||d.symbol!==symbol)throw new Error('Kuru depth market mismatch');
 for(const [levels,bids] of [[d.bids,true],[d.asks,false]] as const)for(let i=0;i<levels.length;i++){
  if(BigInt(levels[i].price_x18)===0n||BigInt(levels[i].total_base_x18)===0n)throw new Error('Invalid Kuru depth level');
  if(i&&((bids&&BigInt(levels[i-1].price_x18)<=BigInt(levels[i].price_x18))||(!bids&&BigInt(levels[i-1].price_x18)>=BigInt(levels[i].price_x18))))throw new Error('Kuru depth is not ordered');
 }
 const bid=BigInt(d.bids[0]?.price_x18||0),ask=BigInt(d.asks[0]?.price_x18||0),available=bid>0n&&ask>=bid;
 const midpoint=available?(bid+ask)/2n:0n;
 const depth=(levels:typeof d.bids)=>levels.reduce((sum,l)=>{const p=BigInt(l.price_x18);return midpoint&&p*100n>=midpoint*97n&&p*100n<=midpoint*103n?sum+p*BigInt(l.total_base_x18)*1000000n/(x18*x18):sum;},0n);
 return {symbol:market.symbol,marketAddress:market.address,bid:String(bid/1000000000000n),ask:String(ask/1000000000000n),reference:String(midpoint/1000000000000n),bidValue:String(depth(d.bids)),askValue:String(depth(d.asks)),available,feedEpoch,marketSeq:String(d.market_seq)};
}
export function createKuruData(fetcher:typeof fetch=fetch,now=Date.now){
 const cache=new Map<string,{until:number,promise:Promise<any>}>();
 let status:{ok:boolean,at:number,error?:string}|null=null;
 function cached<T>(key:string,ttl:number,fn:()=>Promise<T>):Promise<T>{
  const old=cache.get(key);if(old&&old.until>now())return old.promise;
  const entry={until:Infinity,promise:Promise.resolve().then(fn)};
  entry.promise=entry.promise.then(value=>{entry.until=now()+ttl;return value;}).catch(e=>{entry.until=now()+5000;throw e;});cache.set(key,entry);return entry.promise;
 }
 async function json(url:string){
  const r=await fetcher(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(5000),redirect:'error'});
  if(!r.ok)throw new Error('Kuru API returned HTTP '+r.status);
  const text=await r.text();if(text.length>2000000)throw new Error('Kuru API response too large');return JSON.parse(text);
 }
 async function catalog(){return cached('catalog',60000,async()=>{
  const c=catalogSchema.parse(await json(dataOrigin+'/api/v1/markets'));
  return deployment.markets.map(m=>{
   const matches=c.data.filter(v=>v.marketAddress===m.address.toLowerCase());if(matches.length!==1)throw new Error('Canonical Kuru market missing or duplicated');
   const v=matches[0];
   if(v.baseToken.tokenAddress!==m.token.toLowerCase()||v.quoteToken.tokenAddress!==deployment.usdc.toLowerCase()||v.baseToken.decimals!==m.decimals||v.quoteToken.decimals!==6||BigInt(v.pricePrecision)!==BigInt(m.pricePrecision)||BigInt(v.sizePrecision)*BigInt(m.multiplier)!==10n**BigInt(m.decimals))throw new Error('Kuru market metadata mismatch');
   return v;
  });
 });}
 async function markets():Promise<HostedMarkets>{return cached('markets',10000,async()=>{
  try{
   const c=await catalog();
   const markets=await Promise.all(deployment.markets.map(async(m,i)=>normalizeDepth(await json(gatewayOrigin+'/api/depth?'+new URLSearchParams({symbol:c[i].symbol,state:'finalized',levels:'20'})),m,c[i].symbol)));
   const fetchedAt=now();status={ok:true,at:fetchedAt};return {source:'kuru-rest' as const,fetchedAt,markets};
  }catch(e){status={ok:false,at:now(),error:e instanceof Error?e.message.slice(0,160):'Kuru API unavailable'};throw e;}
 });}
 async function trades(userId:string):Promise<HostedTrades>{
  if(!/^[1-9][0-9]*$/.test(userId))throw new Error('Invalid Kuru user ID');
  return cached('trades:'+userId,15000,async()=>{
   const c=await catalog(),t=tradesSchema.parse(await json(dataOrigin+'/api/v1/users/'+userId+'/trades?limit=20'));
   const rows=t.data.flatMap(r=>{
    const i=deployment.markets.findIndex(m=>m.address.toLowerCase()===r.marketAddress);if(i<0)return [];
    const m=deployment.markets[i];return [{id:r.tradeId+':'+r.recordIdx,marketAddress:r.marketAddress,symbol:m.symbol,isBuy:r.isBuy,isMaker:r.isMaker,price:String(BigInt(r.price)/1000000000000n),amount:String(BigInt(r.filledSize)*10n**BigInt(m.decimals)/BigInt(c[i].sizePrecision)),decimals:m.decimals,at:r.blockTimestamp,block:r.blockNumber,hash:r.transactionHash}];
   });
   return {source:'kuru-data-source' as const,fetchedAt:now(),feedEpoch:t.feedEpoch,userSeq:t.globalUserSeq,hasMore:t.pagination.nextCursor!==null,trades:rows};
  });
 }
 return {markets,trades,status:()=>status};
}
