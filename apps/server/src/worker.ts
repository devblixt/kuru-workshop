import {recoverAuthorizationAddress} from 'viem/utils';
import {ownerTransaction,ownerReadback} from './owner-jobs.ts';
import {randomUUID} from 'node:crypto';
import {createWalletClient,http,keccak256,parseEther,encodeFunctionData,type Hex,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chain,domain,planTypes} from '../../../packages/shared/manifest.ts';
import {policyAbi} from '../../../packages/shared/policyAbi.ts';
import {decisionSchema,stringify,asError,type Decision,type Snapshot} from '../../../packages/shared/model.ts';
import {config,keys} from './config.ts';
import {rpc,transport,snapshot,accountState,verifyDeployment} from './chain.ts';
import {openStore,event,state,getState,lease,release,type Session} from './db.ts';
import {makeTrades} from './planner.ts';
const db=openStore(),owner=randomUUID();const key=keys();
const manager=privateKeyToAccount(key.manager),relayer=privateKeyToAccount(key.relayer);
if(manager.address.toLowerCase()!==config.manager.toLowerCase())throw new Error('Configured manager does not match signing key');
const wallet=createWalletClient({account:relayer,chain,transport});
async function capDemos(){
 for(const row of db.prepare("SELECT key FROM state WHERE key LIKE 'cap-request:%'").all() as {key:string}[]){
  db.prepare('DELETE FROM state WHERE key=?').run(row.key);const address=row.key.slice(12) as Address;
  try{
   const a=await accountState(address);if(!a.policy||!a.usage||!a.authorized||a.policy.paused)throw new Error('Authorize an active policy before demonstrating its cap');
   const c=a.policy.config,remaining=c.buyCap>a.usage.bought?c.buyCap-a.usage.bought:0n;
   const amountIn=(remaining<c.tradeCap?remaining:c.tradeCap)+10010000n;
   if(BigInt(a.balances[3])<amountIn)throw new Error('The cap demo needs '+(Number(amountIn)/1e6).toFixed(2)+' available USDC. Deposit more faucet USDC first; this simulation spends nothing.');
   const plan={accountId:Number(a.id),version:a.policy.version,authNonce:BigInt(a.authNonce),nonce:BigInt(a.nonce),deadline:BigInt(Math.min(Math.floor(Date.now()/1000)+30,Number(c.expiry))),trades:[{marketIndex:0,isBuy:true,amountIn,minAmountOut:1n}]};
   const signature=await manager.signTypedData({domain:domain(a.executor,a.signatureVersion),types:planTypes,primaryType:'Plan',message:plan});
   let rejected=false;try{await rpc.simulateContract({address:a.executor,abi:policyAbi,functionName:'executeRebalance',args:[plan,signature],account:relayer});}catch(e){if(String(e).includes('BudgetExceeded'))rejected=true;else throw e;}
   if(!rejected)throw new Error('Cap was not reached by this fill; no transaction was submitted');
   event(db,address,'simulation','Verified: the policy rejected the simulated trade with BudgetExceeded. Your balances and daily usage are unchanged.');
  }catch(e){event(db,address,'simulation',asError(e));}
 }
}
type Pending={hash:Hex,raw:Hex,address:Address,session_id:string,nonce:number,plan:string,created:number};
async function reconcile(){
 const rows=db.prepare("SELECT * FROM transactions WHERE status='pending' ORDER BY nonce").all() as unknown as Pending[];
 for(const row of rows){
  const receipt=await rpc.getTransactionReceipt({hash:row.hash}).catch(()=>null);
  if(!receipt){
   const minedNonce=await rpc.getTransactionCount({address:relayer.address,blockTag:'latest'});
   if(minedNonce>row.nonce){state(db,'relayer',{ok:false,error:'Nonce consumed without expected receipt; operator reconciliation required'});return false;}
   // Exact bytes only: a timeout never allocates a second transaction nonce.
   await wallet.sendRawTransaction({serializedTransaction:row.raw}).catch(()=>{});return false;
  }
  const finalized=await rpc.getBlock({blockTag:'finalized'});if(finalized.number<receipt.blockNumber)return false;
  const plan=JSON.parse(row.plan);
  if(receipt.status==='reverted'&&plan.kind==='owner'){
   db.prepare("UPDATE owner_jobs SET status='failed',error='Onchain action reverted' WHERE id=?").run(plan.jobId);
  }
  if(receipt.status==='reverted'&&plan.kind!=='delegation'){db.prepare("UPDATE transactions SET status='reverted',error='Onchain revert' WHERE hash=?").run(row.hash);event(db,row.address,'reverted','Relayer transaction reverted. Refresh policy usage: another relayer may have executed the same signed intent.',row.hash);continue;}
  if(plan.kind==='owner'){
   const result=await ownerReadback(row.address,plan.request,receipt);
   db.prepare("UPDATE owner_jobs SET status='confirmed',result=?,error=NULL WHERE id=?").run(stringify(result),plan.jobId);
   db.prepare("UPDATE transactions SET status='confirmed',error=NULL WHERE hash=?").run(row.hash);
   event(db,row.address,'owner',result.message,row.hash);continue;
  }
  if(plan.kind==='delegation'){
   const code=await rpc.getCode({address:plan.mera,blockNumber:receipt.blockNumber});
   const ok=code?.toLowerCase()===('0xef0100'+config.mera.slice(2)).toLowerCase();
   db.prepare('UPDATE delegations SET status=?,error=? WHERE id=?').run(ok?'confirmed':'failed',ok?null:'Delegation code read-back failed',plan.jobId);
   db.prepare('UPDATE transactions SET status=? WHERE hash=?').run(ok?'confirmed':'failed',row.hash);
   event(db,row.address,ok?'delegation':'failed',ok?'Mera delegation confirmed. Configure limits and grant its address TRADE permission.':'Mera code did not match the signed delegation.',row.hash);continue;
  }
  const a=await accountState(row.address,receipt.blockNumber,plan.policyAddress||config.policy);const nonce=BigInt(a.nonce),usage=a.usage!;
  if(nonce!==BigInt(plan.nonce)+1n)throw new Error('Policy nonce read-back did not match receipt');
  db.prepare("UPDATE transactions SET status='confirmed',error=NULL WHERE hash=?").run(row.hash);
  event(db,row.address,'trade',`Rebalance finalized. Daily buys ${(Number(usage.bought)/1e6).toFixed(2)}, sells ${(Number(usage.sold)/1e6).toFixed(2)} reference USDC.`,row.hash);
  state(db,'account:'+row.address,a);
 }
 return true;
}
async function decide(s:Snapshot):Promise<Decision>{
 const response=await fetch(config.runner+'/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:stringify(s),signal:AbortSignal.timeout(22000)});
 if(!response.ok)throw new Error('Codex runner unavailable: '+response.status);
 return decisionSchema.parse(await response.json());
}
async function execute(session:Session,s:Snapshot,d:Decision){
 const address=session.address as Address;const a=await accountState(address);
 if(!a.policy||(session.executor||config.policy).toLowerCase()!==a.executor.toLowerCase()||a.policy.paused||String(a.policy.version)!==session.version||!a.authorized||Number(a.policy.config.expiry)*1000<=Date.now()){
  db.prepare("UPDATE sessions SET status='invalidated' WHERE id=?").run(session.id);event(db,address,'paused','Policy expired, changed or was revoked. Start a new authorized session.');return;
 }
 const basket=d.baskets.find(b=>b.profile===session.profile)!;
 if(basket.action==='hold'){event(db,address,'hold',basket.explanation);return;}
 const trades=await makeTrades(a,s,basket.weights);if(!trades.length){event(db,address,'hold','No executable trade clears the drift threshold, price band and remaining limits. '+basket.explanation);return;}
 const deadline=BigInt(Math.min(Math.floor(Date.now()/1000)+30,Number(a.policy.config.expiry)));
 const plan={accountId:Number(a.id),version:a.policy.version,authNonce:BigInt(a.authNonce),nonce:BigInt(a.nonce),deadline,trades};
 // eth_call authenticates the manager signature, so signing precedes the complete simulation;
 // no transaction is submitted unless simulation and a final session check succeed.
 const signature=await manager.signTypedData({domain:domain(a.executor,a.signatureVersion),types:planTypes,primaryType:'Plan',message:plan});
 const {request}=await rpc.simulateContract({address:a.executor,abi:policyAbi,functionName:'executeRebalance',args:[plan,signature],account:relayer});
 const fresh=db.prepare("SELECT profile FROM sessions WHERE id=? AND status='active' AND expires>?").get(session.id,Date.now()) as {profile:string}|undefined;
 if(!fresh||fresh.profile!==session.profile)return;
 const {encodeFunctionData}=await import('viem');const data=encodeFunctionData({abi:policyAbi,functionName:'executeRebalance',args:request.args});
 const tx=await wallet.prepareTransactionRequest({to:a.executor,data});
 if((tx.gas||0n)*(tx.maxFeePerGas||tx.gasPrice||0n)>parseEther('0.3'))throw new Error('Relayer transaction exceeds 0.3 MON gas budget');
 const raw=await wallet.signTransaction(tx),hash=keccak256(raw);
 if(!lease(db,'worker',owner,180000))throw new Error('Worker lease lost before broadcast');
 const stillActive=db.prepare("SELECT profile FROM sessions WHERE id=? AND status='active' AND expires>?").get(session.id,Date.now()) as {profile:string}|undefined;
 if(!stillActive||stillActive.profile!==session.profile)return;
 db.prepare('INSERT INTO transactions(hash,address,session_id,nonce,raw,plan,status,created) VALUES(?,?,?,?,?,?,?,?)').run(hash,address,session.id,tx.nonce,raw,stringify({...plan,executor:a.executor,policyAddress:a.policyAddress}),'pending',Date.now());
 event(db,address,'submitted',basket.explanation,hash);
 await wallet.sendRawTransaction({serializedTransaction:raw});
 await rpc.waitForTransactionReceipt({hash,timeout:15000});await reconcile();
}
async function delegations(){
 const jobs=db.prepare("SELECT * FROM delegations WHERE status='queued' ORDER BY created LIMIT 1").all() as any[];
 for(const job of jobs){
  try{
   const authorization=JSON.parse(job.authorization);
   if(Date.now()-job.created>300000)throw new Error('Delegation request expired; retry setup');
   if(authorization.chainId!==chain.id||authorization.address.toLowerCase()!==config.mera.toLowerCase()||(await recoverAuthorizationAddress({authorization})).toLowerCase()!==job.mera.toLowerCase()||job.mera.toLowerCase()===relayer.address.toLowerCase())throw new Error('Invalid delegation authorization');
   if(await rpc.getTransactionCount({address:job.mera,blockTag:'pending'})!==authorization.nonce)throw new Error('Mera nonce changed; retry setup');
   // Getter succeeds before and after delegation; no account configuration is accepted here.
   const tx=await wallet.prepareTransactionRequest({to:config.mera,data:encodeFunctionData({abi:[{type:'function',name:'implementation',inputs:[],outputs:[{type:'address'}],stateMutability:'view'}],functionName:'implementation'}),authorizationList:[authorization]});
   if((tx.gas||0n)*(tx.maxFeePerGas||tx.gasPrice||0n)>parseEther('0.1'))throw new Error('Delegation exceeds 0.1 MON gas budget');
   const raw=await wallet.signTransaction(tx),hash=keccak256(raw);
   if(!lease(db,'worker',owner,180000))throw new Error('Worker lease lost');
   db.exec('BEGIN IMMEDIATE');try{
    db.prepare('INSERT INTO transactions(hash,address,session_id,nonce,raw,plan,status,created) VALUES(?,?,?,?,?,?,?,?)').run(hash,job.address,'delegation:'+job.id,tx.nonce,raw,stringify({kind:'delegation',jobId:job.id,mera:job.mera}),'pending',Date.now());
    db.prepare("UPDATE delegations SET status='pending',hash=? WHERE id=?").run(hash,job.id);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   // Any broadcast uncertainty is recovered using this journal's exact bytes.
   await wallet.sendRawTransaction({serializedTransaction:raw}).catch(()=>{});
  }catch(e){db.prepare("UPDATE delegations SET status='failed',error=? WHERE id=? AND status='queued'").run(asError(e),job.id);}
 }
}
async function ownerJobs(){
 const jobs=db.prepare("SELECT * FROM owner_jobs WHERE status='queued' ORDER BY created LIMIT 1").all() as any[];
 for(const job of jobs){
  try{
   if(Date.now()-job.created>300000)throw new Error('Action expired; sign again');
   const prepared=await ownerTransaction(job.address,JSON.parse(job.request));
   await rpc.call({account:relayer.address,to:prepared.to,data:prepared.data});
   const tx=await wallet.prepareTransactionRequest({to:prepared.to,data:prepared.data});
   if((tx.gas||0n)*(tx.maxFeePerGas||tx.gasPrice||0n)>parseEther('0.3'))throw new Error('Owner action exceeds 0.3 MON gas budget');
   const raw=await wallet.signTransaction(tx),hash=keccak256(raw);
   if(!lease(db,'worker',owner,180000))throw new Error('Worker lease lost');
   db.exec('BEGIN IMMEDIATE');try{
    db.prepare('INSERT INTO transactions(hash,address,session_id,nonce,raw,plan,status,created) VALUES(?,?,?,?,?,?,?,?)').run(hash,job.address,'owner:'+job.id,tx.nonce,raw,stringify({kind:'owner',jobId:job.id,request:prepared.request}),'pending',Date.now());
    db.prepare("UPDATE owner_jobs SET status='pending',hash=? WHERE id=?").run(hash,job.id);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   await wallet.sendRawTransaction({serializedTransaction:raw}).catch(()=>{});
  }catch(e){db.prepare("UPDATE owner_jobs SET status='failed',error=? WHERE id=? AND status='queued'").run(asError(e),job.id);event(db,job.address,'failed',asError(e));}
 }
}
async function cycle(){
 if(!lease(db,'worker',owner,180000))return;
 const heartbeat=setInterval(()=>lease(db,'worker',owner,180000),15000);
 try{
  state(db,'worker',{ok:true,pid:process.pid});
  await verifyDeployment();state(db,'deployment',{ok:true});
  const balance=await rpc.getBalance({address:relayer.address});state(db,'relayer',{ok:balance>parseEther('0.1'),address:relayer.address,balance});
  if(!await reconcile())return;
  await ownerJobs();if(!await reconcile())return;
  await delegations();if(!await reconcile())return;
  await capDemos();
  db.prepare("UPDATE sessions SET status='expired' WHERE status='active' AND expires<=?").run(Date.now());
  const s=await snapshot();state(db,'market',s);
  const sessions=db.prepare("SELECT * FROM sessions WHERE status='active' AND last_cycle<? ORDER BY last_cycle,rowid").all(Date.now()-60000) as unknown as Session[];
  if(!sessions.length)return;
  if(s.markets.some(m=>!m.available))throw new Error('A basket market has no two-sided liquidity');
  let cached=getState(db,'decision');let d:Decision;
  if(cached&&Date.now()-cached.at<50000){d=decisionSchema.parse(cached.value);}else{
   const last=getState(db,'model-attempt');if(last&&Date.now()-last.at<60000)return;
   state(db,'model-attempt',{at:Date.now()});try{d=await decide(s);}catch(e){state(db,'model',{ok:false,error:asError(e)});throw e;}state(db,'decision',d);state(db,'model',{ok:true,model:config.model});
  }
  for(const session of sessions){
   if(!await reconcile())break;
   db.prepare('UPDATE sessions SET last_cycle=? WHERE id=?').run(Date.now(),session.id);
   try{const fresh=Date.now()-s.at>10000?await snapshot():s;await execute(session,fresh,d);}catch(e){event(db,session.address,'skipped',asError(e));}
   const current=getState(db,'decision');if(!current||Date.now()-current.at>60000)break;
  }
 }catch(e){state(db,'worker',{ok:false,error:asError(e)});for(const s of db.prepare("SELECT address FROM sessions WHERE status='active'").all() as any[])event(db,s.address,'skipped',asError(e));}
 finally{clearInterval(heartbeat);release(db,'worker',owner);}
}
let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
while(!stopping){await cycle();await new Promise(r=>setTimeout(r,5000));}
db.close();
