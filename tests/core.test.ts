import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {candidates,ceil} from '../apps/server/src/planner.ts';
import {openStore,newSession,lease,release,atomic} from '../apps/server/src/db.ts';
import {decisionSchema,initialWeights,profiles} from '../packages/shared/model.ts';
import {deployment} from '../packages/shared/manifest.ts';
import {createApi} from '../apps/server/src/api.ts';
const refs=[2_000_000n,2_000_000n,2_000_000n];
test('initial balanced allocation spends 200 USDC and retains 50 USDC',()=>{
 const trades=candidates([0n,0n,0n,250_000_000n],refs,initialWeights.balanced,250_000_000n,250_000_000n,100_000_000n,refs);
 assert.deepEqual(trades.map(t=>[t.marketIndex,t.amountIn]),[[0,100_000_000n],[1,50_000_000n],[2,50_000_000n]]);
});
test('sale cap uses frozen reference instead of live price; no pre-spending sales',()=>{
 const trades=candidates([100_000_000n,0n,0n,0n],refs,initialWeights.crypto,250_000_000n,100_000_000n,100_000_000n,[4_000_000n,...refs.slice(1)]);
 assert.equal(trades.length,1);assert.equal(trades[0].isBuy,false);assert.equal(trades[0].amountIn,25_000_000n);
});
test('randomized proposals conserve cash and remain within independent gross budgets',()=>{
 let seed=7;const next=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};
 for(let n=0;n<1000;n++){
  const prices=refs.map(()=>BigInt(next()%10000+100)*1000000n);
  const fixed=prices.map(p=>p*BigInt(next()%150+50)/100n);
  const balances=[...deployment.markets.map(m=>BigInt(next()%20)*(10n**BigInt(m.decimals))),BigInt(next()%500)*1000000n];
  const buy=BigInt(next()%250)*1000000n,sell=BigInt(next()%250)*1000000n,cap=100000000n;
  const trades=candidates(balances,prices,initialWeights.balanced,buy,sell,cap,fixed);
  let buyUsed=0n,sellUsed=0n,seenBuy=false;const markets=new Set<number>();
  for(const t of trades){assert(!markets.has(t.marketIndex));markets.add(t.marketIndex);if(t.isBuy){seenBuy=true;buyUsed+=t.amountIn;assert(t.amountIn<=cap);}else{assert(!seenBuy);assert(t.amountIn<=balances[t.marketIndex]);const cost=ceil(t.amountIn*fixed[t.marketIndex],10n**BigInt(deployment.markets[t.marketIndex].decimals));sellUsed+=cost;assert(cost<=cap);}}
  assert(buyUsed<=buy);assert(buyUsed<=balances[3]);assert(sellUsed<=sell);
 }
});
test('model rejects excess authority, invalid weights and duplicate profiles',()=>{
 const valid={baskets:profiles.map(profile=>({profile,weights:initialWeights[profile],action:'rebalance',explanation:'Following the basket.'}))};
 assert(decisionSchema.safeParse(valid).success);
 assert(!decisionSchema.safeParse({...valid,calldata:'0x1234'}).success);
 const bad=structuredClone(valid);bad.baskets[0].weights=[6000,1000,1000,2000];assert(!decisionSchema.safeParse(bad).success);
 const duplicate=structuredClone(valid);duplicate.baskets[1].profile='gold';assert(!decisionSchema.safeParse(duplicate).success);
});
test('25-session admission, unique active wallet, expired seats and restart durability',()=>{
 const dir=mkdtempSync(join(tmpdir(),'workshop-test-'));const path=join(dir,'test.sqlite');let db=openStore(path);
 try{
  for(let i=0;i<25;i++)newSession(db,{address:'wallet-'+i,account_id:String(i+1),profile:'balanced',version:'1',expires:Date.now()+1800000});
  assert.throws(()=>newSession(db,{address:'extra',account_id:'26',profile:'gold',version:'1',expires:Date.now()+10000}),/full/);
  db.prepare("UPDATE sessions SET status='stopped' WHERE address='wallet-0'").run();
  assert.throws(()=>newSession(db,{address:'wallet-1',account_id:'2',profile:'gold',version:'1',expires:Date.now()+10000}));
  newSession(db,{address:'replacement',account_id:'26',profile:'gold',version:'1',expires:Date.now()+10000});
  db.close();db=openStore(path);assert.equal((db.prepare("SELECT COUNT(*) n FROM sessions WHERE status='active'").get() as any).n,25);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('leases exclude a second worker and transaction insertion is atomic',()=>{
 const db=openStore(':memory:');assert(lease(db,'worker','one',60000));assert(!lease(db,'worker','two',60000));release(db,'worker','two');assert(!lease(db,'worker','two',60000));release(db,'worker','one');assert(lease(db,'worker','two',60000));
 assert.throws(()=>atomic(db,()=>{db.prepare('INSERT INTO users VALUES(?,?)').run('alice',1);throw new Error('rollback');}));assert.equal((db.prepare('SELECT COUNT(*) n FROM users').get() as any).n,0);db.close();
});
test('API requires auth and rejects cross-origin mutations',async()=>{
 const db=openStore(':memory:');const app=await createApi(db);
 try{assert.equal((await app.inject({method:'GET',url:'/api/account'})).statusCode,401);assert.equal((await app.inject({method:'POST',url:'/api/session/stop',headers:{origin:'https://another.invalid'},payload:{}})).statusCode,403);assert.equal((await app.inject({url:'/api/config'})).statusCode,401);}finally{await app.close();db.close();}
});
test('wallet challenge no longer needs an invite and does not grant an account session',async()=>{
 const db=openStore(':memory:');const app=await createApi(db);
 const {config}=await import('../apps/server/src/config.ts');
 try{
  const login=await app.inject({method:'POST',url:'/api/site/login',headers:{origin:config.origin},payload:{username:config.siteUsername,password:config.sitePassword}});const cookie=String(login.headers['set-cookie']).split(';')[0];
  const challenge=await app.inject({method:'POST',url:'/api/auth/challenge',headers:{origin:config.origin,cookie},payload:{address:'0x1111111111111111111111111111111111111111'}});
  assert.equal(challenge.statusCode,200,challenge.body);assert.equal(typeof challenge.json().nonce,'string');
  assert.equal((await app.inject({url:'/api/account'})).statusCode,401);
  const invalid=await app.inject({method:'POST',url:'/api/auth/challenge',headers:{origin:config.origin,cookie},payload:{address:'not-an-address'}});assert.equal(invalid.statusCode,400);
  const verify=await app.inject({method:'POST',url:'/api/auth/verify',headers:{origin:config.origin,cookie},payload:{nonce:'missing',signature:'0x00'}});assert.equal(verify.statusCode,401);
 }finally{await app.close();db.close();}
});
test('site cookies persist, expire and revoke without HTTP Basic challenges',async()=>{
 const {config}=await import('../apps/server/src/config.ts');const db=openStore(':memory:');let app=await createApi(db);
 try{
  const bad=await app.inject({method:'POST',url:'/api/site/login',headers:{origin:config.origin},payload:{username:'wrong',password:'wrong'}});assert.equal(bad.statusCode,401);assert.equal(bad.headers['www-authenticate'],undefined);
  const login=await app.inject({method:'POST',url:'/api/site/login',headers:{origin:config.origin},payload:{username:config.siteUsername,password:config.sitePassword}});assert.equal(login.statusCode,200);
  const header=String(login.headers['set-cookie']),cookie=header.split(';')[0];assert.match(header,/HttpOnly/);assert.match(header,/SameSite=Strict/);assert.match(header,/Max-Age=604800/);
  await app.close();app=await createApi(db);
  assert.equal((await app.inject({url:'/api/site/status',headers:{cookie}})).json().authenticated,true);
  assert.equal((await app.inject({url:'/api/config',headers:{cookie}})).statusCode,200);
  const account=await app.inject({url:'/api/account',headers:{cookie}});assert.equal(account.statusCode,401);assert.match(account.json().error,/wallet/);assert.equal(account.headers['www-authenticate'],undefined);
  db.prepare('UPDATE site_sessions SET expires=?').run(Date.now()-1);
  assert.equal((await app.inject({url:'/api/config',headers:{cookie}})).json().code,'SITE_LOGIN_REQUIRED');
  db.prepare('UPDATE site_sessions SET expires=?').run(Date.now()+60000);
  const logout=await app.inject({method:'POST',url:'/api/site/logout',headers:{origin:config.origin,cookie},payload:{}});assert.equal(logout.statusCode,200);
  assert.equal((await app.inject({url:'/api/config',headers:{cookie}})).json().code,'SITE_LOGIN_REQUIRED');
  assert.equal((await app.inject({url:'/downloads/kuru-workshop-starter.zip'})).statusCode,401);
 }finally{await app.close();db.close();}
});
