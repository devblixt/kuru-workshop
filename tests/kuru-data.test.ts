import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createKuruData,normalizeDepth} from '../apps/server/src/kuru-data.ts';
import {createApi} from '../apps/server/src/api.ts';
import {openStore} from '../apps/server/src/db.ts';
import {deployment} from '../packages/shared/manifest.ts';
const symbols=['XAUTUSDC','WETHUSDC','CBBTCUSDC'];
const precisions=['1000000','10000000000','100000000'];
const catalog={data:deployment.markets.map((m,i)=>({marketAddress:m.address.toLowerCase(),symbol:symbols[i],baseToken:{tokenAddress:m.token.toLowerCase(),decimals:m.decimals},quoteToken:{tokenAddress:deployment.usdc.toLowerCase(),decimals:6},pricePrecision:'100',sizePrecision:precisions[i]})),pagination:{nextCursor:null}};
const book=(i=1)=>({feedEpoch:1,data:{market_id:deployment.markets[i].address.toLowerCase(),symbol:symbols[i],state:'finalized',served_view:'finalized',market_seq:11,global_seq:42,bids:[{price_x18:'2000000000000000000000',total_base_x18:'2500000000000000000'}],asks:[{price_x18:'2020000000000000000000',total_base_x18:'3000000000000000000'}]}});
const response=(v:unknown)=>new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}});
test('Gateway x18 units normalize independently of token decimals',()=>{
 for(const i of [0,1,2]){const m=normalizeDepth(book(i),deployment.markets[i],symbols[i]);assert.equal(m.bid,'2000000000');assert.equal(m.ask,'2020000000');assert.equal(m.reference,'2010000000');assert.equal(m.bidValue,'5000000000');assert.equal(m.askValue,'6060000000');}
});
test('empty and crossed books never provide usable valuation; bad identity, finality and cursors reject',()=>{
 const empty=book();empty.data.bids=[];empty.data.asks=[];assert.equal(normalizeDepth(empty,deployment.markets[1],symbols[1]).available,false);
 const crossed=book();crossed.data.asks[0].price_x18='1000000000000000000000';assert.equal(normalizeDepth(crossed,deployment.markets[1],symbols[1]).reference,'0');
 const wrong=book();wrong.data.market_id=deployment.markets[0].address.toLowerCase();assert.throws(()=>normalizeDepth(wrong,deployment.markets[1],symbols[1]),/mismatch/);
 const unfinalized=book();unfinalized.data.served_view='proposed';assert.throws(()=>normalizeDepth(unfinalized,deployment.markets[1],symbols[1]));
 const unsafe=book();unsafe.data.market_seq=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>normalizeDepth(unsafe,deployment.markets[1],symbols[1]));
});
test('25 concurrent dashboard reads share four upstream requests and expire without stale fallback',async()=>{
 let calls=0,time=1000,fail=false;
 const service=createKuruData((async(input)=>{calls++;if(fail)return new Response('',{status:403});const u=new URL(String(input));return response(u.pathname.endsWith('markets')?catalog:book(symbols.indexOf(u.searchParams.get('symbol')!)));}) as typeof fetch,()=>time);
 const results=await Promise.all(Array.from({length:25},()=>service.markets()));assert.equal(calls,4);assert(results.every(r=>r.fetchedAt===1000));
 fail=true;time=12000;await assert.rejects(service.markets(),/HTTP 403/);assert.equal(service.status()?.ok,false);
 const failedCalls=calls;await assert.rejects(service.markets(),/HTTP 403/);assert.equal(calls,failedCalls);
 fail=false;time=18000;assert.equal((await service.markets()).fetchedAt,18000);
});
test('catalog token and precision mismatches reject hosted data',async()=>{
 const invalid=structuredClone(catalog);invalid.data[1].sizePrecision='1000000';const service=createKuruData((async()=>response(invalid)) as typeof fetch);
 await assert.rejects(service.markets(),/metadata mismatch/);
});
test('history converts native size precision for all supported assets and preserves attribution fields',async()=>{
 const data=deployment.markets.map((m,i)=>({tradeId:String(i+1),recordIdx:0,marketAddress:m.address.toLowerCase(),isMaker:false,isBuy:true,price:'2000000000000000000000',filledSize:precisions[i],blockTimestamp:1000000,blockNumber:'100',transactionHash:'0x'+'1'.repeat(64)}));
 const service=createKuruData((async(input)=>response(String(input).endsWith('/markets')?catalog:{feedEpoch:2,globalUserSeq:'123',data,pagination:{nextCursor:'opaque'}})) as typeof fetch);
 const history=await service.trades('2');assert.deepEqual(history.trades.map(r=>r.amount),['1000000','1000000000000000000','100000000']);assert(history.trades.every(r=>r.price==='2000000000'&&r.managerExecution===undefined));assert.equal(history.hasMore,true);
 await assert.rejects(service.trades('../other'),/Invalid Kuru user ID/);
});
test('history route requires wallet authentication and upstream failures are explicit 503',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'kuru-api-test-'));const db=openStore(join(dir,'db.sqlite'));
 const service=createKuruData((async()=>new Response('',{status:403})) as typeof fetch);
 const app=await createApi(db,service);
 try{assert.equal((await app.inject({url:'/api/trades'})).statusCode,401);const {config}=await import('../apps/server/src/config.ts');const login=await app.inject({method:'POST',url:'/api/site/login',headers:{origin:config.origin},payload:{username:config.siteUsername,password:config.sitePassword}});const cookie=String(login.headers['set-cookie']).split(';')[0];const market=await app.inject({url:'/api/markets',headers:{cookie}});assert.equal(market.statusCode,503);assert.match(market.body,/unavailable/);}finally{await app.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
