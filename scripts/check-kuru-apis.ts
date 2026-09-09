import {createKuruData} from '../apps/server/src/kuru-data.ts';
import {snapshot} from '../apps/server/src/chain.ts';
import {writeFileSync} from 'node:fs';
const service=createKuruData();
const [hosted,onchain]=await Promise.all([service.markets(),snapshot()]);
const comparison=hosted.markets.map((m,i)=>({symbol:m.symbol,apiBid:m.bid,apiAsk:m.ask,rpcBid:onchain.markets[i].bid,rpcAsk:onchain.markets[i].ask,apiDepth:[m.bidValue,m.askValue],rpcDepth:[onchain.markets[i].bidValue,onchain.markets[i].askValue]}));
const result={at:new Date().toISOString(),source:hosted.source,onchainBlock:onchain.block,comparison,scope:'Read-only comparison at nearby times. API retrieval time does not prove upstream freshness; these quotes are display-only.'};
console.log(JSON.stringify(result,null,2));
if(process.env.SAVE_API_CHECK==='1')writeFileSync('artifacts/kuru-api-check.json',JSON.stringify(result,null,2));
