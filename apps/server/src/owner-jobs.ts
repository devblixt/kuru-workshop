import {encodeFunctionData,parseEventLogs,zeroAddress,erc20Abi,type Address,type Hex} from 'viem';
import {config} from './config.ts';
import {rpc,accountState} from './chain.ts';
import {deployment,coreAbi} from '../../../packages/shared/manifest.ts';
import {meraAbi} from '../../../packages/shared/meraAbi.ts';
import {meraV2Abi} from '../../../packages/shared/meraV2Abi.ts';
import {gaslessAbi} from '../../../packages/shared/gaslessAbi.ts';
import {ownerRequestSchema,contractConfig,configHash,ownerTypes,ownerDomain,authorizeTypes,revokeTypes,coreDomain,withdrawalTypes,withdrawalDomain,type OwnerRequest} from '../../../packages/shared/gasless.ts';
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export async function ownerTransaction(address:Address,input:unknown){
 const r=ownerRequestSchema.parse(input);
 if(config.gasless===zeroAddress)throw new Error('Gasless actions are not configured');
 const now=(await rpc.getBlock()).timestamp;
 const a=await accountState(address);
 const verify=async(definition:any,signature:string)=>{if(!await rpc.verifyTypedData({...definition,address,signature:signature as Hex}))throw new Error('Invalid owner signature');};
 if(r.kind==='fund'){
  const next=await rpc.readContract({address:config.gasless,abi:gaslessAbi,functionName:'nextClaimAt',args:[address]});
  if(next>now)throw new Error('Workshop faucet available again '+new Date(Number(next)*1000).toISOString());
  return {to:config.gasless,data:encodeFunctionData({abi:gaslessAbi,functionName:'fund',args:[address]}),request:r};
 }
 if(a.id==='0')throw new Error('Fund your Kuru account first');
 if(r.kind==='policy'){
  const c=contractConfig(r.config),p=r.action;
  if(p.accountId!==Number(a.id)||!same(c.manager,config.manager)||configHash(c)!==p.configHash||BigInt(p.authNonce)!==BigInt(a.authNonce))throw new Error('Policy action does not match this account or configuration');
  const action={...p,signer:p.signer as Address,configHash:p.configHash as Hex,nonce:BigInt(p.nonce),authNonce:BigInt(p.authNonce),deadline:BigInt(p.deadline)};
  await verify({domain:ownerDomain(config.mera),types:ownerTypes,primaryType:'OwnerAction',message:action},r.signature);
  return {to:config.mera,data:encodeFunctionData({abi:meraV2Abi,functionName:'executeOwnerAction',args:[action,c,r.signature as Hex]}),request:r};
 }
 if(r.kind==='authorize'||r.kind==='revoke'){
  const p=r.permission,nonce=BigInt(p.nonce),deadline=BigInt(p.deadline),signer=p.signer as Address;
  if(nonce!==BigInt(a.authNonce)||deadline<now||deadline>now+300n)throw new Error('Permission signature is stale');
  if(r.kind==='authorize'){
   const current=await rpc.readContract({address:config.mera,abi:meraAbi,functionName:'signerForAccount',args:[Number(a.id)]});
   const policy=await rpc.readContract({address:config.mera,abi:meraAbi,functionName:'getPolicy',args:[Number(a.id)]});
   const expiry=BigInt(p.expiry||'0');
   if(!same(current,signer)||expiry!==policy.config.expiry||expiry<=now||expiry>now+1800n)throw new Error('Authorize the currently configured Mera signer only');
   const message={account:address,authorizer:address,signer,permissions:1,expiry,nonce,deadline};
   await verify({domain:coreDomain,types:authorizeTypes,primaryType:'AuthorizeAccountSigner',message},p.signature);
   return {to:deployment.core,data:encodeFunctionData({abi:coreAbi,functionName:'authorizeAccountSignerBySig',args:[address,address,signer,1,expiry,nonce,deadline,p.signature as Hex]}),request:r};
  }
  const known=[config.policy,a.executor];
  for(const policy of [config.mera,config.meraPrevious])if(policy!==zeroAddress)known.push(await rpc.readContract({address:policy,abi:meraAbi,functionName:'signerForAccount',args:[Number(a.id)]}));
  if(!known.some(s=>same(s,signer)))throw new Error('Only workshop trading signers can be revoked through this relay');
  await verify({domain:coreDomain,types:revokeTypes,primaryType:'RevokeAccountSigner',message:{account:address,authorizer:address,signer,nonce,deadline}},p.signature);
  return {to:deployment.core,data:encodeFunctionData({abi:coreAbi,functionName:'revokeAccountSignerBySig',args:[address,address,signer,nonce,deadline,p.signature as Hex]}),request:r};
 }
 const w=r.withdrawal;
 if(!same(w.account,address)||BigInt(w.authNonce)!==BigInt(a.authNonce)||BigInt(w.amount)>BigInt(a.balances[3]))throw new Error('Withdrawal exceeds this account balance or uses a stale authorization');
 const withdrawal={account:address,amount:BigInt(w.amount),nonce:BigInt(w.nonce),authNonce:BigInt(w.authNonce),expiry:BigInt(w.expiry),deadline:BigInt(w.deadline)};
 await verify({domain:withdrawalDomain(config.gasless),types:withdrawalTypes,primaryType:'Withdrawal',message:withdrawal},r.ownerSignature);
 const auth={account:address,authorizer:address,signer:config.gasless,permissions:8,expiry:withdrawal.expiry,nonce:withdrawal.authNonce,deadline:withdrawal.deadline};
 await verify({domain:coreDomain,types:authorizeTypes,primaryType:'AuthorizeAccountSigner',message:auth},r.authorizeSignature);
 await verify({domain:coreDomain,types:revokeTypes,primaryType:'RevokeAccountSigner',message:{account:address,authorizer:address,signer:config.gasless,nonce:withdrawal.authNonce+1n,deadline:withdrawal.deadline}},r.revokeSignature);
 return {to:config.gasless,data:encodeFunctionData({abi:gaslessAbi,functionName:'withdraw',args:[withdrawal,r.ownerSignature as Hex,r.authorizeSignature as Hex,r.revokeSignature as Hex]}),request:r};
}
export async function ownerReadback(address:Address,r:OwnerRequest,receipt:any){
 const blockNumber=receipt.blockNumber as bigint;
 const a=await accountState(address,blockNumber);
 if(r.kind==='fund'){
  const e=parseEventLogs({abi:gaslessAbi,logs:receipt.logs,eventName:'Funded'}).find(e=>same(e.address,config.gasless)&&same(e.args.account,address));
  if(!e||e.args.amount!==250000000n||a.id==='0'||await rpc.readContract({address:config.gasless,abi:gaslessAbi,functionName:'nextClaimAt',args:[address],blockNumber})!==e.args.nextClaim)throw new Error('Funding read-back failed');
  return {message:'250 test USDC deposited directly into your Kuru account. No MON was spent by your wallet.',account:a};
 }
 if(r.kind==='policy'){
  const nonce=await rpc.readContract({address:config.mera,abi:meraV2Abi,functionName:'ownerNonces',args:[Number(a.id)],blockNumber});
  if(nonce!==BigInt(r.action.nonce)+1n||!a.policy||a.policy.paused!==(r.action.action===1)||a.policyAddress!==config.mera)throw new Error('Policy read-back failed');
  if(r.action.action===0&&(configHash(a.policy.config)!==r.action.configHash||!same(a.executor,r.action.signer)))throw new Error('Configured limits read-back failed');
  return {message:r.action.action===0?'Trading limits configured.':'Policy paused onchain.',account:a};
 }
 if(r.kind==='authorize'||r.kind==='revoke'){
  const allowed=await rpc.readContract({address:deployment.core,abi:coreAbi,functionName:'isAuthorizedAccountSigner',args:[address,r.permission.signer as Address,1],blockNumber});
  if(allowed!==(r.kind==='authorize')||BigInt(a.authNonce)!==BigInt(r.permission.nonce)+1n)throw new Error('Permission read-back failed');
  return {message:r.kind==='authorize'?'Mera TRADE permission authorized.':'TRADE permission revoked onchain.',account:a};
 }
 const nonce=await rpc.readContract({address:config.gasless,abi:gaslessAbi,functionName:'withdrawalNonces',args:[address],blockNumber});
 const permission=await rpc.readContract({address:deployment.core,abi:coreAbi,functionName:'isAuthorizedAccountSigner',args:[address,config.gasless,8],blockNumber});
 const e=parseEventLogs({abi:gaslessAbi,logs:receipt.logs,eventName:'Withdrawn'}).find(e=>same(e.address,config.gasless)&&same(e.args.account,address));
 if(!e||e.args.amount!==BigInt(r.withdrawal.amount)||nonce!==BigInt(r.withdrawal.nonce)+1n||permission||BigInt(a.authNonce)!==BigInt(r.withdrawal.authNonce)+2n)throw new Error('Withdrawal read-back failed');
 const walletBalance=await rpc.readContract({address:deployment.usdc,abi:erc20Abi,functionName:'balanceOf',args:[address],blockNumber});
 return {message:'USDC returned to your root wallet. Temporary withdrawal permission was revoked in the same transaction.',walletBalance,account:a};
}
