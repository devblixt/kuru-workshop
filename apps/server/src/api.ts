import {recoverAuthorizationAddress} from 'viem/utils';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticPlugin from '@fastify/static';
import {randomUUID,randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {getAddress,isAddress,zeroAddress,type Address,type Hex} from 'viem';
import {createSiweMessage} from 'viem/siwe';
import {z} from 'zod';
import {createKuruData} from './kuru-data.ts';
import {config} from './config.ts';
import {rpc,accountState} from './chain.ts';
import {openStore,atomic,event,getState,newSession,type Session} from './db.ts';
import {chain,deployment} from '../../../packages/shared/manifest.ts';
import {profiles,initialWeights,stringify,asError} from '../../../packages/shared/model.ts';
const digest=(s:string)=>createHash('sha256').update(s).digest();
export async function createApi(db=openStore(),kuruData=createKuruData()){
 const accountCache=new Map<string,{until:number,value:ReturnType<typeof accountState>}>();
 function cachedAccount(address:Address){const old=accountCache.get(address);if(old&&old.until>Date.now())return old.value;const value=accountState(address).catch(e=>{accountCache.delete(address);throw e;});accountCache.set(address,{until:Date.now()+12000,value});return value;}
 const app=Fastify({logger:{redact:['req.headers.cookie','req.headers.authorization','req.body']},trustProxy:(_address,hop)=>hop===0,bodyLimit:8192});
 await app.register(cookie);await app.register(rateLimit,{max:(req)=>req.method==='GET'?1000:120,timeWindow:60000});
 app.addHook('onSend',async(_,reply,payload)=>{reply.header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer').header('Cache-Control','no-store').header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://testnet-rpc.monad.xyz; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'");return payload;});
 function siteSession(req:any){const token=req.cookies.workshop_site;return typeof token==='string'&&!!db.prepare('SELECT token FROM site_sessions WHERE token=? AND expires>?').get(digest(token).toString('hex'),Date.now());}
 app.addHook('preHandler',async(req,reply)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'&&req.headers.origin!==config.origin)return reply.code(403).send({error:'Origin rejected'});
  const path=req.url.split('?')[0];
  if((path.startsWith('/api/')||path.startsWith('/downloads/'))&&!['/api/site/login','/api/site/status','/api/site/logout'].includes(path)&&!siteSession(req))return reply.code(401).send({code:'SITE_LOGIN_REQUIRED',error:'Sign in to the workshop'});
 });
 async function user(req:any,reply:any){
  const token=req.cookies.workshop;const row=typeof token==='string'?db.prepare('SELECT address FROM auth WHERE token=? AND expires>?').get(digest(token).toString('hex'),Date.now()) as any:null;
  if(!row){reply.code(401).send({error:'Sign in with your wallet'});return null;}return row.address as Address;
 }
 app.setErrorHandler((error,_req,reply)=>reply.code(error instanceof z.ZodError?400:400).send({error:asError(error)}));
 app.get('/api/site/status',async req=>({authenticated:siteSession(req)}));
 app.post('/api/site/login',{config:{rateLimit:{max:60,timeWindow:60000}}},async(req,reply)=>{
  if(!config.siteUsername||!config.sitePassword)return reply.code(503).send({error:'Website login is not configured'});
  const body=z.object({username:z.string().max(100),password:z.string().max(200)}).parse(req.body);
  const userOK=timingSafeEqual(digest(body.username),digest(config.siteUsername));const passOK=timingSafeEqual(digest(body.password),digest(config.sitePassword));
  if(!userOK||!passOK)return reply.code(401).send({error:'Incorrect username or password'});
  const token=randomBytes(32).toString('hex'),ttl=7*24*3600;
  db.prepare('DELETE FROM site_sessions WHERE expires<?').run(Date.now());
  if(req.cookies.workshop_site)db.prepare('DELETE FROM site_sessions WHERE token=?').run(digest(req.cookies.workshop_site).toString('hex'));
  db.prepare('INSERT INTO site_sessions VALUES(?,?)').run(digest(token).toString('hex'),Date.now()+ttl*1000);
  reply.setCookie('workshop_site',token,{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'strict',path:'/',maxAge:ttl});return {authenticated:true};
 });
 app.post('/api/site/logout',async(req,reply)=>{
  if(req.cookies.workshop_site)db.prepare('DELETE FROM site_sessions WHERE token=?').run(digest(req.cookies.workshop_site).toString('hex'));
  if(req.cookies.workshop)db.prepare('DELETE FROM auth WHERE token=?').run(digest(req.cookies.workshop).toString('hex'));
  reply.clearCookie('workshop_site',{path:'/'}).clearCookie('workshop',{path:'/'});return {authenticated:false};
 });
 app.get('/api/markets',async(_req,reply)=>{try{return await kuruData.markets();}catch{return reply.code(503).send({error:'Kuru market API unavailable. Retry shortly.'});}});
 app.get('/api/trades',async(req,reply)=>{const address=await user(req,reply);if(!address)return;const a=await cachedAccount(address);if(a.id==='0')return {source:'kuru-data-source',fetchedAt:Date.now(),feedEpoch:null,userSeq:null,hasMore:false,trades:[]};try{const result=await kuruData.trades(a.id);return {...result,trades:result.trades.map(t=>({...t,managerExecution:!!db.prepare("SELECT hash FROM transactions WHERE address=? AND hash=? AND status='confirmed'").get(address,t.hash)}))};}catch{return reply.code(503).send({error:'Kuru trade history unavailable. Retry shortly.'});}});
 app.get('/api/config',async()=>({deployment,policy:config.policy,meraImplementation:config.mera,manager:config.manager,chainId:chain.id,initialWeights,origin:config.origin}));
 app.get('/api/health',async()=>({deployment:getState(db,'deployment'),worker:getState(db,'worker'),market:getState(db,'market'),model:getState(db,'model'),relayer:getState(db,'relayer'),queue:db.prepare("SELECT COUNT(*) n, MIN(created) oldestCreated FROM transactions WHERE status='pending'").get(),configured:config.policy!==zeroAddress,hostedData:kuruData.status()}));
 app.post('/api/auth/challenge',{config:{rateLimit:{max:10,timeWindow:60000}}},async(req,reply)=>{
  const body=z.object({address:z.string()}).parse(req.body);
  if(!isAddress(body.address))return reply.code(400).send({error:'Invalid wallet address'});
  const nonce=randomBytes(16).toString('hex'),expires=Date.now()+300000;
  const message=createSiweMessage({domain:new URL(config.origin).host,address:getAddress(body.address),statement:'Sign in to Kuru Baskets. This message grants no trading or spending permissions.',uri:config.origin,version:'1',chainId:chain.id,nonce,issuedAt:new Date(),expirationTime:new Date(expires)});
  db.prepare('DELETE FROM challenges WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO challenges VALUES(?,?,?,?)').run(nonce,body.address.toLowerCase(),message,expires);return {nonce,message};
 });
 app.post('/api/auth/verify',{config:{rateLimit:{max:10,timeWindow:60000}}},async(req,reply)=>{
  const body=z.object({nonce:z.string().max(100),signature:z.string().regex(/^0x[0-9a-fA-F]+$/).max(4096)}).parse(req.body);
  const row=db.prepare('SELECT * FROM challenges WHERE nonce=? AND expires>?').get(body.nonce,Date.now()) as any;
  if(!row||!await rpc.verifyMessage({address:row.address,message:row.message,signature:body.signature as Hex}))return reply.code(401).send({error:'Invalid or expired signature'});
  const token=randomBytes(32).toString('hex');
  atomic(db,()=>{
   if(!db.prepare('DELETE FROM challenges WHERE nonce=?').run(body.nonce).changes)throw new Error('Challenge already used');
   const existing=db.prepare('SELECT address FROM users WHERE address=?').get(row.address);
   if(!existing&&Number((db.prepare('SELECT COUNT(*) n FROM users').get() as any).n)>=25)throw new Error('All 25 workshop places are filled');
   db.prepare('INSERT OR IGNORE INTO users VALUES(?,?)').run(row.address,Date.now());
   db.prepare('INSERT INTO auth VALUES(?,?,?)').run(digest(token).toString('hex'),row.address,Date.now()+4*3600000);
  });
  reply.setCookie('workshop',token,{httpOnly:true,secure:config.origin.startsWith('https:'),sameSite:'strict',path:'/',maxAge:14400});return {address:row.address};
 });
 app.post('/api/auth/logout',async(req,reply)=>{if(req.cookies.workshop)db.prepare('DELETE FROM auth WHERE token=?').run(digest(req.cookies.workshop).toString('hex'));reply.clearCookie('workshop',{path:'/'});return {ok:true};});
 app.get('/api/account',async(req,reply)=>{const address=await user(req,reply);if(!address)return;return JSON.parse(stringify({address,...await cachedAccount(address),session:db.prepare("SELECT * FROM sessions WHERE address=? ORDER BY rowid DESC LIMIT 1").get(address),market:getState(db,'market'),decision:getState(db,'decision')}));});
 app.get('/api/events',async(req,reply)=>{const address=await user(req,reply);if(!address)return;return db.prepare('SELECT * FROM events WHERE address=? ORDER BY id DESC LIMIT 60').all(address);});
 app.get('/api/stream',async(req,reply)=>{
  const address=await user(req,reply);if(!address)return;reply.hijack();
  reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  let cursor=0;const push=()=>{const rows=db.prepare('SELECT * FROM events WHERE address=? AND id>? ORDER BY id LIMIT 60').all(address,cursor) as any[];for(const row of rows){reply.raw.write(`id: ${row.id}\ndata: ${JSON.stringify(row)}\n\n`);cursor=row.id;}reply.raw.write(': heartbeat\n\n');};
  push();const timer=setInterval(()=>{if(!siteSession(req)){clearInterval(timer);reply.raw.end();return;}push();},5000);req.raw.on('close',()=>clearInterval(timer));
 });
 app.post('/api/mera/delegation',{config:{rateLimit:{max:5,timeWindow:60000}}},async(req,reply)=>{
  const address=await user(req,reply);if(!address)return;
  if(config.mera===zeroAddress)throw new Error('Mera deployment is not configured');
  const b=z.object({mera:z.string().regex(/^0x[0-9a-fA-F]{40}$/),authorization:z.object({address:z.string().regex(/^0x[0-9a-fA-F]{40}$/),chainId:z.literal(chain.id),nonce:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),yParity:z.union([z.literal(0),z.literal(1)]),r:z.string().regex(/^0x[0-9a-fA-F]{64}$/),s:z.string().regex(/^0x[0-9a-fA-F]{64}$/)})}).parse(req.body);
  const recovered=await recoverAuthorizationAddress({authorization:b.authorization as any});
  if(recovered.toLowerCase()!==b.mera.toLowerCase()||b.authorization.address.toLowerCase()!==config.mera.toLowerCase()||b.mera.toLowerCase()===address.toLowerCase())throw new Error('Authorization must delegate a separate Mera wallet to the workshop implementation');
  if(await rpc.getTransactionCount({address:recovered,blockTag:'pending'})!==b.authorization.nonce)throw new Error('Mera authorization nonce changed; unlock and retry');
  const id=atomic(db,()=>{
   const old=db.prepare("SELECT id FROM delegations WHERE address=? AND status IN ('queued','pending')").get(address) as any;if(old)return old.id;
   const n=db.prepare('SELECT COUNT(*) n FROM delegations WHERE address=? AND created>?').get(address,Date.now()-86400000) as any;
   if(n.n>=5)throw new Error('Daily delegation sponsorship limit reached');
   const id=randomUUID();db.prepare("INSERT INTO delegations(id,address,mera,authorization,status,created) VALUES(?,?,?,?,'queued',?)").run(id,address,recovered,stringify(b.authorization),Date.now());return id;
  });return {id};
 });
 app.get('/api/mera/delegation/:id',async(req,reply)=>{const address=await user(req,reply);if(!address)return;const {id}=req.params as {id:string};const row=db.prepare('SELECT id,mera,status,hash,error FROM delegations WHERE id=? AND address=?').get(id,address);if(!row)return reply.code(404).send({error:'Delegation job not found'});return row;});
 app.post('/api/sessions',async(req,reply)=>{
  const address=await user(req,reply);if(!address)return;
  const {profile}=z.object({profile:z.enum(profiles)}).parse(req.body);const a=await accountState(address);
  if(!a.policy||!a.authorized||a.policy.paused||a.policy.config.manager.toLowerCase()!==config.manager.toLowerCase()||Number(a.policy.config.expiry)*1000<=Date.now())throw new Error('Configure and authorize the policy first');
  const id=newSession(db,{address,account_id:a.id,executor:a.executor,profile,version:String(a.policy.version),expires:Math.min(Number(a.policy.config.expiry)*1000,Date.now()+1800000)});
  event(db,address,'session','Manager enabled for '+profile+'. It will check once per minute.');return {id};
 });
 app.post('/api/session/profile',async(req,reply)=>{const address=await user(req,reply);if(!address)return;const {profile}=z.object({profile:z.enum(profiles)}).parse(req.body);db.prepare("UPDATE sessions SET profile=? WHERE address=? AND status='active'").run(profile,address);event(db,address,'profile','Following '+profile+' within your existing policy.');return {ok:true};});
 app.post('/api/session/stop',async(req,reply)=>{const address=await user(req,reply);if(!address)return;db.prepare("UPDATE sessions SET status='stopped' WHERE address=? AND status='active'").run(address);event(db,address,'stopped','Worker stopped. Confirm pause or revoke in your wallet to disable onchain execution. A submitted transaction may still settle.');return {ok:true};});
 app.post('/api/simulate-cap',{config:{rateLimit:{max:2,timeWindow:60000}}},async(req,reply)=>{const address=await user(req,reply);if(!address)return;db.prepare('INSERT INTO state VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,at=excluded.at').run('cap-request:'+address,'{}',Date.now());event(db,address,'simulation','Queued a read-only cap demonstration. No transaction will be submitted.');return {ok:true};});
 if(existsSync('dist/web')){await app.register(staticPlugin,{root:resolve('dist/web')});app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.code(404).send({error:'Not found'}):reply.sendFile('index.html'));}
 return app;
}
if(process.argv[1]?.endsWith('/api.ts')){const app=await createApi();await app.listen({host:'0.0.0.0',port:config.port});}
