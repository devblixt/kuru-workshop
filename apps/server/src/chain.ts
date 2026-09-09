import {createPublicClient,http,custom,zeroAddress,keccak256,stringToHex,toHex,type Address,type Hex} from 'viem';
import {chain,deployment,coreAbi,bookAbi} from '../../../packages/shared/manifest.ts';
import {gaslessAbi} from '../../../packages/shared/gaslessAbi.ts';
import {meraAbi} from '../../../packages/shared/meraAbi.ts';
import {policyAbi} from '../../../packages/shared/policyAbi.ts';
import {config} from './config.ts';
import type {Snapshot} from '../../../packages/shared/model.ts';
const upstream=http(config.rpc,{timeout:12000,retryCount:0})({chain});
let nextRequest=0;
const interval=Math.max(110,Number(process.env.RPC_INTERVAL_MS||230));
export const transport=custom({request:async(args:any)=>{const wait=Math.max(0,nextRequest-Date.now());nextRequest=Date.now()+wait+interval;if(wait)await new Promise(r=>setTimeout(r,wait));return upstream.request(args);}},{retryCount:1,retryDelay:1000});
export const rpc=createPublicClient({chain,transport,pollingInterval:500});
export const multicallAddress='0xcA11bde05977b3631167028862bE2a173976CA11' as Address;
let lastVerified=0;
const slot=toHex(BigInt(keccak256(stringToHex('eip1967.proxy.implementation')))-1n,{size:32});
export async function verifyDeployment(){
 if(Date.now()-lastVerified<60000)return;
 if(await rpc.getChainId()!==chain.id)throw new Error('Wrong RPC chain');
 if(!await rpc.getCode({address:deployment.core}))throw new Error('AccountCore has no code');
 for(const [address,expected] of [[deployment.core,deployment.coreImplementation],...deployment.markets.map(m=>[m.address,deployment.bookImplementation])] as [Address,Address][]){
  const stored=await rpc.getStorageAt({address,slot});if(stored?.slice(-40).toLowerCase()!==expected.slice(2).toLowerCase())throw new Error('Implementation changed: '+address);
 }
 const calls=deployment.markets.flatMap(m=>[
  ...['accountCore','baseToken','quoteToken','baseSizeMultiplier','pricePrecision'].map(functionName=>({address:m.address,abi:bookAbi,functionName})),
  {address:deployment.core,abi:coreAbi,functionName:'verifiedSpotOrderBook',args:[m.address]},
 ]);
 const values=await rpc.multicall({multicallAddress,contracts:calls as any,allowFailure:false}) as any[];
 for(let i=0;i<3;i++){
  const m=deployment.markets[i];const [core,base,quote,multiplier,precision,verified]=values.slice(i*6,i*6+6);
  if(core.toLowerCase()!==deployment.core.toLowerCase()||base.toLowerCase()!==m.token.toLowerCase()||quote.toLowerCase()!==deployment.usdc.toLowerCase()||multiplier!==BigInt(m.multiplier)||Number(precision)!==m.pricePrecision||!verified)throw new Error('Deployment mismatch: '+m.symbol);
 }
 if(config.policy!==zeroAddress){
  const code=await rpc.getCode({address:config.policy});if(!code)throw new Error('Policy has no code');
  if(config.policyCodeHash&&keccak256(code)!==config.policyCodeHash)throw new Error('Policy runtime changed');
  const values=await rpc.multicall({multicallAddress,allowFailure:false,contracts:[{address:config.policy,abi:policyAbi,functionName:'core'},...[0,1,2].map(i=>({address:config.policy,abi:policyAbi,functionName:'markets',args:[BigInt(i)]}))] as any}) as any[];
  if(values[0].toLowerCase()!==deployment.core.toLowerCase())throw new Error('Policy core mismatch');
  for(let i=0;i<3;i++)if(values[i+1].toLowerCase()!==deployment.markets[i].address.toLowerCase())throw new Error('Policy market mismatch');
 }
 if(config.mera!==zeroAddress){
  const code=await rpc.getCode({address:config.mera});if(!code||!config.meraCodeHash||keccak256(code)!==config.meraCodeHash)throw new Error('Mera implementation runtime mismatch');
  const [core,legacy]=await rpc.multicall({multicallAddress,allowFailure:false,contracts:[{address:config.mera,abi:meraAbi,functionName:'core'},{address:config.mera,abi:meraAbi,functionName:'legacy'}]});
  if(core.toLowerCase()!==deployment.core.toLowerCase()||legacy.toLowerCase()!==(config.meraPrevious!==zeroAddress?config.meraPrevious:config.policy).toLowerCase())throw new Error('Mera deployment mismatch');
 }
 if(config.gasless!==zeroAddress){const code=await rpc.getCode({address:config.gasless});if(!code||!config.gaslessCodeHash||keccak256(code)!==config.gaslessCodeHash)throw new Error('Gasless router runtime mismatch');}
 lastVerified=Date.now();
}
export async function snapshot():Promise<Snapshot>{
 const block=await rpc.getBlock({blockTag:'latest'}); if(Date.now()/1000-Number(block.timestamp)>20)throw new Error('RPC block is stale');
 const markets=[];
 const books=await rpc.multicall({multicallAddress,allowFailure:false,blockNumber:block.number,contracts:deployment.markets.map(m=>({address:m.address,abi:bookAbi,functionName:'getL2Book' as const,args:[20n] as const}))});
 for(let i=0;i<3;i++){
  const m=deployment.markets[i];const [bp,bs,ap,as]=books[i];
  const validBid=bp[0]!==undefined&&bp[0]!==0&&bp[0]!==4294967295; const validAsk=ap[0]!==undefined&&ap[0]!==0&&ap[0]!==4294967295;
  const bid=validBid?BigInt(bp[0])*10000n:0n, ask=validAsk?BigInt(ap[0])*10000n:0n;
  const reference=bid&&ask?(bid+ask)/2n:0n;
  const value=(ps:readonly number[],ss:readonly bigint[])=>ps.reduce((n,p,i)=>{const price=BigInt(p)*10000n;return !reference||p===4294967295||price*100n<reference*97n||price*100n>reference*103n?n:n+price*(ss[i]||0n)*BigInt(m.multiplier)/(10n**BigInt(m.decimals));},0n);
  markets.push({symbol:m.symbol,bid:String(bid),ask:String(ask),reference:String(bid&&ask?(bid+ask)/2n:0n),bidValue:String(value(bp,bs)),askValue:String(value(ap,as)),available:!!bid&&!!ask&&bid<=ask});
 }
 return {block:String(block.number),at:Date.now(),markets};
}
export async function accountState(address:Address,atBlock?:bigint,selectedPolicy?:Address){
 const blockNumber=atBlock??await rpc.getBlockNumber();
 const values=await rpc.multicall({multicallAddress,blockNumber,allowFailure:false,contracts:[
  {address:deployment.core,abi:coreAbi,functionName:'userRegistry',args:[address]},
  ...[...deployment.markets.map(m=>m.token),deployment.usdc].map(token=>({address:deployment.core,abi:coreAbi,functionName:'getBalance',args:[address,token]})),
  {address:deployment.core,abi:coreAbi,functionName:'accountSignerAuthorizationNonces',args:[address]},
  {address:deployment.core,abi:coreAbi,functionName:'isAuthorizedAccountSigner',args:[address,config.policy,1]},
 ] as any}) as any[];
 const id=String(values[0]),balances=values.slice(1,5).map(String),authNonce=String(values[5]);
 let authorized=!!values[6],executor=config.policy,policyAddress=config.policy;
 const candidates=selectedPolicy?[selectedPolicy]:[config.mera,config.meraPrevious].filter(p=>p!==zeroAddress);
 for(const candidate of candidates){
  if(candidate===config.policy||id==='0')break;
  const signer=await rpc.readContract({address:candidate,abi:meraAbi,functionName:'signerForAccount',args:[Number(id)],blockNumber});
  if(signer!==zeroAddress){
   executor=signer;policyAddress=candidate;
   const allowed=await rpc.readContract({address:deployment.core,abi:coreAbi,functionName:'isAuthorizedAccountSigner',args:[address,signer,1],blockNumber});
   const code=await rpc.getCode({address:signer,blockNumber});
   authorized=allowed&&!values[6]&&code?.toLowerCase()===('0xef0100'+candidate.slice(2)).toLowerCase();
   if(candidate===config.mera&&config.meraPrevious!==zeroAddress){
    const previous=await rpc.readContract({address:config.meraPrevious,abi:meraAbi,functionName:'signerForAccount',args:[Number(id)],blockNumber});
    if(previous!==zeroAddress&&previous.toLowerCase()!==signer.toLowerCase()&&await rpc.readContract({address:deployment.core,abi:coreAbi,functionName:'isAuthorizedAccountSigner',args:[address,previous,1],blockNumber}))authorized=false;
   }
   break;
  }
 }
 const signatureVersion=policyAddress===config.mera&&config.gasless!==zeroAddress?'2':'1';
 if(config.policy===zeroAddress||id==='0')return {id,executor,policyAddress,signatureVersion,mode:policyAddress!==config.policy?'mera':'legacy',block:String(blockNumber),balances,policy:null,usage:null,nonce:'0',authorized,authNonce};
 const [policy,usage,nonce]=await rpc.multicall({multicallAddress,blockNumber,allowFailure:false,contracts:[
  {address:policyAddress,abi:policyAbi,functionName:'getPolicy',args:[Number(id)]},
  {address:policyAddress,abi:policyAbi,functionName:'getUsage',args:[Number(id)]},
  {address:policyAddress,abi:policyAbi,functionName:'nonces',args:[Number(id)]},
 ]});
 return {id,executor,policyAddress,signatureVersion,mode:policyAddress!==config.policy?'mera':'legacy',block:String(blockNumber),balances,policy,usage,nonce:String(nonce),authorized,authNonce};
}
