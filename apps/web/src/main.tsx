import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {WagmiProvider,createConfig,http,useAccount,useConnect,useDisconnect,usePublicClient,useSwitchChain,useSignMessage} from 'wagmi';
import {getWalletClient} from 'wagmi/actions';
import {injected} from 'wagmi/connectors';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {formatUnits,parseUnits,type Address,type Hex} from 'viem';
import {chain,deployment,coreAbi} from '../../../packages/shared/manifest.ts';
import {unlockMera,endMeraSession} from './mera.ts';
import {meraV2Abi} from '../../../packages/shared/meraV2Abi.ts';
import {gaslessAbi} from '../../../packages/shared/gaslessAbi.ts';
import {ownerTypes,ownerDomain,configHash,authorizeTypes,revokeTypes,coreDomain,withdrawalTypes,withdrawalDomain} from '../../../packages/shared/gasless.ts';
import {meraAbi} from '../../../packages/shared/meraAbi.ts';
import {initialWeights,labels,profiles,type Profile} from '../../../packages/shared/model.ts';
import {connectKuru,readMarket} from './workshop.ts';
import type {HostedMarkets,HostedTrades} from '../../../packages/shared/hosted-data.ts';
import './style.css';
const wagmi=createConfig({chains:[chain],connectors:[injected()],transports:{[chain.id]:http()}});
const queryClient=new QueryClient();
async function api(path:string,body?:unknown){const r=await fetch('/api'+path,{credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});const result=await r.json();if(!r.ok){if(result.code==='SITE_LOGIN_REQUIRED')window.dispatchEvent(new Event('site-session-expired'));throw new Error(result.error||'Request failed');}return result;}
const money=(v:string|number|bigint|undefined)=>v===undefined?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v)/1e6);
const short=(s?:string)=>s?s.slice(0,6)+'…'+s.slice(-4):'';
const colors=['#b89d4b','#8c8edc','#e99158','#6caa98'];
function SiteGate(){
 const [allowed,setAllowed]=useState<boolean|null>(null),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{let current=true;void api('/site/status').then(r=>{if(current)setAllowed(r.authenticated);}).catch(()=>{if(current){setAllowed(false);setError('Unable to check login. Please retry.');}});const expired=()=>setAllowed(false);window.addEventListener('site-session-expired',expired);return()=>{current=false;window.removeEventListener('site-session-expired',expired);};},[]);
 if(allowed)return <App/>;
 return <main className="site-login"><div className="brand"><span className="brand-icon">k</span>KURU / baskets</div><h1>Workshop login</h1><p>Sign in to open the testnet portfolio manager.</p>{allowed===null?<p>Checking your session…</p>:<form onSubmit={e=>{e.preventDefault();setBusy(true);setError('');void api('/site/login',{username,password}).then(()=>{setPassword('');setAllowed(true);}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}><label>Username<input name="username" autoComplete="username" required value={username} onChange={e=>setUsername(e.target.value)}/></label><label>Password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary full" disabled={busy}>{busy?'Signing in…':'Log in'}</button>{error&&<p role="alert">{error}</p>}<p className="fine">This login lasts seven days. You will connect and verify your wallet inside the app.</p></form>}</main>;
}
function App(){
 const {address,isConnected,chainId}=useAccount(),{connect,connectAsync,connectors}=useConnect(),{disconnect}=useDisconnect();
 const publicClient=usePublicClient(),{switchChainAsync}=useSwitchChain(),{signMessageAsync}=useSignMessage();
 const [hosted,setHosted]=useState<HostedMarkets>(),[hostedError,setHostedError]=useState(''),[history,setHistory]=useState<HostedTrades>(),[historyError,setHistoryError]=useState('');
 const [cfg,setCfg]=useState<any>(),[data,setData]=useState<any>(),[health,setHealth]=useState<any>(),[events,setEvents]=useState<any[]>([]);
 const [profile,setProfile]=useState<Profile>('balanced'),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [buyCap,setBuyCap]=useState('250'),[sellCap,setSellCap]=useState('250'),[tradeCap,setTradeCap]=useState('100');
 const [review,setReview]=useState(false),[refs,setRefs]=useState<bigint[]>([]),[clock,setClock]=useState(Date.now());
 async function refresh(){const [h,c]=await Promise.all([api('/health'),api('/config')]);setHealth(h);setCfg(c);if(address){try{const a=await api('/account');if(a.address.toLowerCase()===address.toLowerCase()){setData(a);setEvents(await api('/events'));}else setData(undefined);}catch{setData(undefined);}}}
 useEffect(()=>{setData(undefined);void refresh();const id=setInterval(()=>void refresh(),10000);return()=>clearInterval(id);},[address]);
 useEffect(()=>{const id=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(id);},[]);
 useEffect(()=>{let disposed=false;const update=async()=>{try{const result=await api('/markets');if(!disposed){setHosted(result);setHostedError('');}}catch{if(!disposed){setHosted(undefined);setHostedError('Kuru market data is unavailable. Trading checks continue using onchain data.');}}};void update();const id=setInterval(()=>void update(),10000);return()=>{disposed=true;clearInterval(id);};},[]);
 useEffect(()=>{let disposed=false;setHistory(undefined);setHistoryError('');if(!data?.address)return;const update=async()=>{try{const result=await api('/trades');if(!disposed){setHistory(result);setHistoryError('');}}catch{if(!disposed){setHistory(undefined);setHistoryError('Kuru trade history is unavailable. Manager receipts remain in the activity feed.');}}};void update();const id=setInterval(()=>void update(),15000);return()=>{disposed=true;clearInterval(id);};},[data?.address]);

 useEffect(()=>{if(!data?.address)return;const s=new EventSource('/api/stream');s.onmessage=()=>void api('/events').then(setEvents);return()=>s.close();},[data?.address]);
 async function run(label:string,fn:()=>Promise<void>){setBusy(label);setError('');setNotice('');try{await fn();await refresh();}catch(e){setError(e instanceof Error?e.message.split('\n')[0]:'Action failed');}finally{setBusy('');}}
 async function ownerWallet(){
  if(!isConnected||!address)throw new Error('Connect your wallet first');
  if(chainId!==chain.id)throw new Error('Switch to Monad testnet first');
  const signer=await getWalletClient(wagmi,{chainId:chain.id});
  if(signer.account.address.toLowerCase()!==address.toLowerCase())throw new Error('Your wallet account changed. Select the signed-in account and retry.');
  return signer;
 }
 async function readyWallet(){
  const signer=await ownerWallet();
  if(!publicClient)throw new Error('Monad RPC client is not ready. Retry in a moment.');
  return connectKuru({publicClient:publicClient as any,walletClient:signer as any,account:signer.account.address});
 }
 async function sponsored(request:unknown){
  const body=JSON.parse(JSON.stringify(request,(_,v)=>typeof v==='bigint'?v.toString():v));
  const job=await api('/owner/actions',body);setBusy('Relayer is confirming your action');
  for(let i=0;i<60;i++){
   const status=await api('/owner/actions/'+job.id);
   if(status.status==='failed')throw new Error(status.error||'Gasless action failed');
   if(status.status==='confirmed'){setNotice(status.result?.message||'Action confirmed');if(status.result?.account)setData((old:any)=>({...old,...status.result.account}));return status;}
   await new Promise(r=>setTimeout(r,3000));
  }
  throw new Error('Action is still pending. Wait for its confirmation before retrying.');
 }
 async function permission(kind:'authorize'|'revoke',signer:Address,expiry?:bigint){
  const owner=await ownerWallet();const account=owner.account.address;
  const nonce=await publicClient!.readContract({address:deployment.core,abi:coreAbi,functionName:'accountSignerAuthorizationNonces',args:[account]});
  const deadline=(await publicClient!.getBlock()).timestamp+300n;
  setBusy(kind==='authorize'?'Sign Mera TRADE authorization':'Sign TRADE revocation');
  const message={account,authorizer:account,signer,nonce,deadline};
  const signature=kind==='authorize'?await owner.signTypedData({domain:coreDomain,types:authorizeTypes,primaryType:'AuthorizeAccountSigner',message:{...message,permissions:1,expiry:expiry!}}):await owner.signTypedData({domain:coreDomain,types:revokeTypes,primaryType:'RevokeAccountSigner',message});
  await sponsored({kind,permission:{signer,nonce,deadline,...(expiry?{expiry}:{}),signature}});
 }
 async function signedPolicy(action:0|1,c:any,signer:Address){
  const owner=await ownerWallet();const accountId=Number(data.id);
  const nonce=await publicClient!.readContract({address:cfg.meraImplementation,abi:meraV2Abi,functionName:'ownerNonces',args:[accountId]});
  const authNonce=await publicClient!.readContract({address:deployment.core,abi:coreAbi,functionName:'accountSignerAuthorizationNonces',args:[owner.account.address]});
  const deadline=(await publicClient!.getBlock()).timestamp+300n;
  const message={accountId,action,signer,configHash:configHash(c),nonce,authNonce,deadline};
  setBusy(action===0?'Sign your trading limits':'Sign policy pause');
  const signature=await owner.signTypedData({domain:ownerDomain(cfg.meraImplementation),types:ownerTypes,primaryType:'OwnerAction',message});
  await sponsored({kind:'policy',action:message,config:c,signature});
 }
 async function stopManager(){
  await api('/session/stop',{});
  if(data.policyAddress?.toLowerCase()===cfg.meraImplementation.toLowerCase()){
   const p=await publicClient!.readContract({address:cfg.meraImplementation,abi:meraV2Abi,functionName:'getPolicy',args:[Number(data.id)]});
   const signer=await publicClient!.readContract({address:cfg.meraImplementation,abi:meraV2Abi,functionName:'signerForAccount',args:[Number(data.id)]});
   await signedPolicy(1,p.config,signer);
  }else await permission('revoke',data.executor||cfg.policy);
 }
 async function withdrawUSDC(){
  await api('/session/stop',{});const owner=await ownerWallet(),account=owner.account.address;
  const amount=await publicClient!.readContract({address:deployment.core,abi:coreAbi,functionName:'getBalance',args:[account,deployment.usdc]});if(!amount)throw new Error('No available USDC');
  const nonce=await publicClient!.readContract({address:cfg.gasless,abi:gaslessAbi,functionName:'withdrawalNonces',args:[account]});
  const authNonce=await publicClient!.readContract({address:deployment.core,abi:coreAbi,functionName:'accountSignerAuthorizationNonces',args:[account]});
  const deadline=(await publicClient!.getBlock()).timestamp+300n,expiry=deadline;
  const withdrawal={account,amount,nonce,authNonce,expiry,deadline};
  setBusy('Sign withdrawal amount (1 of 3 signatures)');
  const ownerSignature=await owner.signTypedData({domain:withdrawalDomain(cfg.gasless),types:withdrawalTypes,primaryType:'Withdrawal',message:withdrawal});
  setBusy('Sign temporary withdrawal permission (2 of 3)');
  const authorizeSignature=await owner.signTypedData({domain:coreDomain,types:authorizeTypes,primaryType:'AuthorizeAccountSigner',message:{account,authorizer:account,signer:cfg.gasless,permissions:8,expiry,nonce:authNonce,deadline}});
  setBusy('Sign withdrawal permission revocation (3 of 3)');
  const revokeSignature=await owner.signTypedData({domain:coreDomain,types:revokeTypes,primaryType:'RevokeAccountSigner',message:{account,authorizer:account,signer:cfg.gasless,nonce:authNonce+1n,deadline}});
  await sponsored({kind:'withdraw',withdrawal,ownerSignature,authorizeSignature,revokeSignature});
 }
 async function fundAccount(){
  if(!isConnected)await connectAsync({connector:connectors[0]});
  await switchChainAsync({chainId:chain.id});
  const owner=await getWalletClient(wagmi,{chainId:chain.id});const account=owner.account.address;
  if(data?.address?.toLowerCase()!==account.toLowerCase()){
   setBusy('Verify your wallet with a signature');const challenge=await api('/auth/challenge',{address:account});
   const signature=await owner.signMessage({message:challenge.message});await api('/auth/verify',{nonce:challenge.nonce,signature});
  }
  await sponsored({kind:'fund'});
 }
 const snap=health?.market?.value;
 const currentWeights=data?.decision?.value?.baskets?.find((b:any)=>b.profile===profile)?.weights||initialWeights[profile];
 const active=data?.session?.status==='active'&&data.session.expires>clock;
 const remaining=active?Math.max(0,Math.ceil((data.session.expires-clock)/1000)):0;
 const available=cfg?.gasless&&cfg.gasless!=='0x0000000000000000000000000000000000000000';
 const marketReady=snap?.markets?.every((m:any)=>m.available)&&clock-snap.at<60000;
 async function choose(p:Profile){setProfile(p);if(active)await run('Changing basket',async()=>{await api('/session/profile',{profile:p});});}
 const displayReady=hosted&&clock-hosted.fetchedAt<20000&&hosted.markets.every(m=>m.available);
 const portfolio=data?.balances?.reduce((n:number,b:string,i:number)=>n+(i===3?Number(b):Number(b)/(10**deployment.markets[i].decimals)*Number(hosted?.markets?.[i]?.reference||0)),0);
 return <div className="shell">
  <header><a className="brand" href="/"><span className="brand-icon">k</span>KURU <span className="brand-sub">/ baskets</span></a><nav><button onClick={()=>void run('Signing out of site',async()=>{await api('/site/logout',{});window.dispatchEvent(new Event('site-session-expired'));})}>Sign out</button><a href="https://kuru-testnet-docs.mintlify.site/" target="_blank" rel="noreferrer">Builder docs ↗</a><span className="network"><i/>Monad testnet</span><button className="wallet" disabled={!!busy} onClick={()=>isConnected?void run('Signing out',async()=>{await api('/auth/logout',{});disconnect();setData(undefined);}):connect({connector:connectors[0]})}>{isConnected?short(address):'Connect wallet ↗'}</button></nav></header>
  <main><div className="eyebrow"><span className="pill">KURU SPOT WORKSHOP</span><span>Portfolio management demo</span></div>
  <section className="intro"><div><h1>Kuru Baskets</h1><p>Deposit test USDC and authorize an AI manager to trade XAUt0, WETH and cbBTC on Kuru. Choose a target allocation and set onchain trading limits.</p></div><div className="intro-note"><span className="spark">✳</span><p>Sessions last up to 30 minutes.</p><span>The manager checks allocations every minute. Funds remain in your Kuru account.</span></div></section>
  <div className="test-banner"><span>TEST ASSETS</span> Faucet assets only. This is a prototype for managed RWA baskets, with no real asset backing.</div>
  <section className="workspace"><div className="left-column">
   <div className="section-title"><h2>Select an initial allocation</h2><span>01 — ALLOCATION</span></div>
   <div className="baskets">{profiles.map((p,i)=><button className={'basket '+(profile===p?'selected':'')} onClick={()=>void choose(p)} key={p} disabled={!!busy}><div className="basket-top"><span className="basket-icon">{['◉','◈','↗'][i]}</span><span className="radio">{profile===p?'●':'○'}</span></div><h3>{labels[p]}</h3><p>{['50% gold · 10% ETH · 10% BTC · 30% cash','40% gold · 20% ETH · 20% BTC · 20% cash','20% gold · 30% ETH · 30% BTC · 20% cash'][i]}</p><div className="allocation">{initialWeights[p].map((w,j)=><span key={j} style={{width:w/100+'%',background:colors[j]}}/>)}</div></button>)}</div>
   <div className="legend">{['Gold','ETH','BTC','Cash'].map((name,i)=><span key={name}><i style={{background:colors[i]}}/>{name}<b>{currentWeights[i]/100}%</b></span>)}</div>
   <section className="api-markets"><div className="section-title"><h2>Market prices and depth</h2><span>KURU API</span></div>
   {hosted&&clock-hosted.fetchedAt<20000?<><table><thead><tr><th>Market</th><th>Bid (USDC)</th><th>Ask (USDC)</th></tr></thead><tbody>{hosted.markets.map(m=><tr key={m.marketAddress}><td>{m.symbol}</td><td>{m.bid!=='0'?money(m.bid):'No bids'}<small>Depth {money(m.bidValue)}</small></td><td>{m.ask!=='0'?money(m.ask):'No asks'}<small>Depth {money(m.askValue)}</small></td></tr>)}</tbody></table><p className="fine">Finalized Gateway quotes. Depth shows up to 20 levels within ±3% of each midpoint. Retrieved {new Date(hosted.fetchedAt).toLocaleTimeString()}; the API can lag chain state.</p></>:<p className="fine">{hostedError||'Loading market data from Kuru…'}</p>}
   </section>
   <div className="section-title limits-heading"><h2>Set manager trading limits</h2><span>02 — LIMITS</span></div>
   <div className="limits"><label>Daily buy limit<div className="input-wrap"><span>$</span><input aria-label="Daily buy limit" inputMode="decimal" value={buyCap} onChange={e=>setBuyCap(e.target.value)}/><small>USDC</small></div></label><label>Daily sell limit<div className="input-wrap"><span>$</span><input aria-label="Daily sell limit" inputMode="decimal" value={sellCap} onChange={e=>setSellCap(e.target.value)}/><small>REF. USDC</small></div></label><label>Per-trade limit<div className="input-wrap"><span>$</span><input aria-label="Per-trade limit" inputMode="decimal" value={tradeCap} onChange={e=>setTradeCap(e.target.value)}/><small>USDC</small></div></label></div>
   <div className="policy-facts"><span>Price band <b>±3%</b></span><span>Session <b>30 minutes</b></span><span>Daily reset <b>00:00 UTC</b></span></div>
   <p className="fine">Caps constrain the manager’s trades across your available root-account balances. Owner trades remain unrestricted. Sell limits use fixed daily reference prices; average execution bounds include fees.</p>
   <div className="onboarding"><div className="section-title"><h2>{data?'Fund account and enable trading':'Connect and verify your wallet'}</h2><span>03 — SETUP</span></div>
   <button className="primary full" disabled={!!busy} onClick={()=>void run('Connecting wallet for funding',fundAccount)}>{isConnected?'Get 250 test USDC in my Kuru account':'Connect wallet & get 250 test USDC'} <span>↗</span></button>
   <p className="fine">The workshop faucet deposits 250 test USDC directly into AccountCore once every 12 hours. Our relayer pays all gas. Your wallet needs no MON; it only signs approvals.</p>

   {!data&&<p className="fine">After connecting, verify your wallet with a signature to view its account and manage a session. This does not grant trading permission.</p>}
   {!isConnected?<button className="primary full" disabled={!!busy} onClick={()=>connect({connector:connectors[0]})}>Connect your wallet <span>↗</span></button>:chainId!==chain.id?<button className="primary full" onClick={()=>void run('Switching network',async()=>{await switchChainAsync({chainId:chain.id});})}>Switch to Monad testnet</button>:!data?<div className="join"><button className="primary full" disabled={!!busy} onClick={()=>void run('Signing in',async()=>{const c=await api('/auth/challenge',{address});const signature=await signMessageAsync({message:c.message});await api('/auth/verify',{nonce:c.nonce,signature});})}>Verify wallet →</button></div>:<>

   {!active?<button className="primary full" disabled={!!busy||!available||!marketReady||!Number(data.id)} onClick={()=>{setRefs(snap.markets.map((m:any)=>BigInt(m.reference)));setReview(true);}}>Review & enable manager <span>→</span></button>:<button className="stop full" disabled={!!busy} onClick={()=>void run('Stopping manager',stopManager)}>Stop manager & pause policy</button>}
   <div className="secondary-actions"><button disabled={!!busy||!available} onClick={()=>void run('Revoking permission',async()=>{await api('/session/stop',{});await permission('revoke',data.executor||cfg.policy);})}>Revoke TRADE access</button><button disabled={!!busy} onClick={()=>void run('Withdrawing available USDC',withdrawUSDC)}>Withdraw available USDC ↗</button></div>
   </>}
   {!available&&<p className="fine">Policy deployment is being prepared.</p>}{available&&!marketReady&&<p className="warning">Waiting for two-sided market liquidity. Funding is available; starting the manager is paused.</p>}
   </div>
  </div><aside>
   <div className="portfolio-card"><div className="section-title"><span>KURU ACCOUNT BALANCES</span><span className={'status '+(active?'live':'')}>{active?'● Manager active':'○ Not active'}</span></div><div className="portfolio-value">{data&&displayReady?money(portfolio):'—'}<span>ESTIMATED TESTNET VALUE</span></div><div className="holdings">{['XAUt0','WETH','cbBTC','USDC'].map((symbol,i)=><div key={symbol}><span><i style={{background:colors[i]}}/>{symbol}</span><b>{data?Number(formatUnits(BigInt(data.balances[i]),i===3?6:deployment.markets[i].decimals)).toLocaleString(undefined,{maximumFractionDigits:5}):'—'}</b></div>)}</div>{data?.mode==='mera'&&<p className="fine">Mera trading signer: <a href={chain.blockExplorers.default.url+'/address/'+data.executor} target="_blank" rel="noreferrer">{short(data.executor)}</a><br/>Root Kuru account: {data.id}</p>}<div className="budget-row"><span>Today’s manager buys</span><b>{money(data?.usage?.bought)} / {money(data?.policy?.config?.buyCap)}</b></div><div className="budget-row"><span>Today’s reference sells</span><b>{money(data?.usage?.sold)} / {money(data?.policy?.config?.sellCap)}</b></div>{active&&<div className="countdown">Session ends in {Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</div>}</div>
   <div className="activity"><div className="section-title"><h2>Manager activity</h2><span className="ai-label">AI</span></div><div className="message"><span className="avatar">✳</span><div><b>Kuru manager</b><p>The AI proposes target weights for each basket. Trades execute only when allocation drift, liquidity and your policy limits permit.</p><small>Basket targets are shared. Balances and limits are per account.</small></div></div><div className="feed">{events.length?events.map(e=><div className="event" key={e.id}><span className={'event-dot '+e.kind}/><div><small>{new Date(e.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · {e.kind}</small><p>{e.message}</p>{e.hash&&<a target="_blank" rel="noreferrer" href={chain.blockExplorers.default.url+'/tx/'+e.hash}>View transaction ↗</a>}</div></div>):<div className="empty-feed">No activity yet.<br/><span>Fund your account, verify your wallet and enable the manager to receive decisions here.</span></div>}</div><div className="chat-actions">{data&&<button disabled={!!busy} onClick={()=>void run('Reading ETH market',async()=>{const quotes=await readMarket(await readyWallet());const bid=BigInt(quotes[0]),ask=BigInt(quotes[1]);if(!bid||!ask||ask===4294967295n)throw new Error('ETH market has no two-sided quote');setNotice('ETH market: bid '+(Number(bid)/deployment.markets[1].pricePrecision).toFixed(2)+' USDC · ask '+(Number(ask)/deployment.markets[1].pricePrecision).toFixed(2)+' USDC');})}>Read ETH market</button>}{data&&<button disabled={!!busy} onClick={()=>void run("Simulating cap",async()=>{await api("/simulate-cap",{});})}>Simulate an over-limit trade</button>}<button onClick={()=>setNotice('The AI sets shared target weights. Your wallet follows them only when drift exceeds 5 percentage points and the policy permits the trade.')}>How does this work?</button><button onClick={()=>setNotice('Buying includes USDC fees. Selling uses the first owner-approved reference for the UTC day. Restarting does not reset either budget.')}>Explain my limits</button></div></div>
   <section className="api-history"><div className="section-title"><h2>Account trade history</h2><span>KURU API</span></div>
   {!data?<p className="fine">Connect and verify your wallet to view finalized account fills.</p>:historyError?<p className="fine">{historyError}</p>:!history?<p className="fine">Loading finalized fills…</p>:<><p className="fine">Supported assets from your latest 20 account fills. Includes trades outside the manager.{history.hasMore?' Older fills are not shown.':''}</p>{history.trades.length?<div className="api-history-list">{history.trades.map(t=><div className="history-row" key={t.id+':'+t.marketAddress}><div><b>{t.isBuy?'Buy':'Sell'} {t.symbol}</b><small>{formatUnits(BigInt(t.amount),t.decimals)} at {money(t.price)} · {t.isMaker?'Maker':'Taker'}</small><small>{new Date(t.at).toLocaleString()} · {t.managerExecution?'Confirmed manager execution':'Account trade'}</small></div><a href={chain.blockExplorers.default.url+'/tx/'+t.hash} target="_blank" rel="noreferrer">Receipt ↗</a></div>)}</div>:<p className="fine">No fills for the supported assets were returned.</p>}<p className="fine">Data Source API · retrieved {new Date(history.fetchedAt).toLocaleTimeString()}. Recent transactions may appear after indexing.</p></>}
   </section>
  </aside></section>
  {(busy||notice||error)&&<div role="status" className={'toast '+(error?'error':'')}>{busy&&<span className="spinner"/>}{error||busy||notice}<button onClick={()=>{setNotice('');setError('');}}>×</button></div>}
  {review&&<div className="modal-backdrop"><div className="modal"><div className="section-title"><h2>Review trading permissions</h2><button onClick={()=>setReview(false)} disabled={!!busy}>×</button></div><p>A Mera passkey creates a separate trading signer. Our relayer installs its 7702 delegation. Your root wallet signs the limits and TRADE authorization; our relayer submits them. No MON is needed. Funds stay in AccountCore.</p><table><thead><tr><th>Asset</th><th>Reference</th><th>Average price band</th></tr></thead><tbody>{refs.map((r,i)=><tr key={i}><td>{deployment.markets[i].symbol}</td><td>{money(r)}</td><td>{money(r*97n/100n)} – {money(r*103n/100n)}</td></tr>)}</tbody></table><p>Buy cap {buyCap} USDC · Sell cap {sellCap} reference USDC · Per trade {tradeCap} USDC. Expires in at most 30 minutes.</p><p className="fine">Existing daily sell references and usage remain unchanged. These references are testnet market prices, not oracle valuations.</p><button className="primary full" disabled={!!busy} onClick={()=>void run('Configuring policy',async()=>{await api('/session/stop',{});
const useMera=cfg.meraImplementation&&cfg.meraImplementation!=='0x0000000000000000000000000000000000000000';
let executor=cfg.policy as Address;
if(useMera){
 setBusy('Create or unlock your Mera passkey');
 try{
  const mera=await unlockMera(address!);executor=mera.address;
  const code=await publicClient!.getCode({address:executor});
  if(code?.toLowerCase()!==('0xef0100'+cfg.meraImplementation.slice(2)).toLowerCase()){
   if(!mera.signAuthorization)throw new Error('Mera authorization signing is unavailable');
   const nonce=await publicClient!.getTransactionCount({address:executor,blockTag:'pending'});
   const signed=await mera.signAuthorization({chainId:chain.id,nonce,contractAddress:cfg.meraImplementation});
   const job=await api('/mera/delegation',{mera:executor,authorization:{address:signed.address,chainId:signed.chainId,nonce:signed.nonce,yParity:signed.yParity,r:signed.r,s:signed.s}});
   setBusy('Relayer is confirming your Mera delegation');
   let done=false;
   for(let i=0;i<60;i++){
    const status=await api('/mera/delegation/'+job.id);
    if(status.status==='failed')throw new Error(status.error||'Delegation failed');
    if(status.status==='confirmed'){done=true;break;}
    await new Promise(r=>setTimeout(r,3000));
   }
   if(!done)throw new Error('Delegation is still pending. Retry setup after it confirms.');
   const installed=await publicClient!.getCode({address:executor});
   if(installed?.toLowerCase()!==('0xef0100'+cfg.meraImplementation.slice(2)).toLowerCase())throw new Error('Mera delegation read-back failed');
  }
 }finally{endMeraSession();}
}
await ownerWallet();
if(useMera){
 for(const previous of [...new Set([cfg.policy,data.executor].filter(Boolean))] as Address[]){
  if(previous.toLowerCase()===executor.toLowerCase())continue;
  const allowed=await publicClient!.readContract({address:deployment.core,abi:coreAbi,functionName:'isAuthorizedAccountSigner',args:[address!,previous,1]});
  if(allowed)await permission('revoke',previous);
 }
}
const expiry=(await publicClient!.getBlock()).timestamp+1800n;
const config={manager:cfg.manager as Address,expiry,buyCap:parseUnits(buyCap,6),sellCap:parseUnits(sellCap,6),tradeCap:parseUnits(tradeCap,6),references:refs as [bigint,bigint,bigint],floors:refs.map(r=>r*97n/100n) as [bigint,bigint,bigint],ceilings:refs.map(r=>r*103n/100n) as [bigint,bigint,bigint]};
await signedPolicy(0,config,executor);
await permission('authorize',executor,expiry);
await api('/sessions',{profile});setReview(false);})}>Set up Mera & enable trading →</button></div></div>}
  <footer><span>Built on Kuru Spot · Monad testnet</span><span>Sessions expire automatically. You can pause or revoke access at any time.</span><a href="https://github.com/devblixt/kuru-workshop" target="_blank" rel="noreferrer">Example app source ↗</a></footer>
 </main></div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><WagmiProvider config={wagmi}><QueryClientProvider client={queryClient}><SiteGate/></QueryClientProvider></WagmiProvider></React.StrictMode>);
