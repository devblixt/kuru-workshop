import {existsSync,readFileSync,writeFileSync,mkdirSync,renameSync} from 'node:fs';
import {createWalletClient,http,keccak256,parseEther,type Hex,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {chain} from '../packages/shared/manifest.ts';
import {rpc,transport} from '../apps/server/src/chain.ts';
import {config} from '../apps/server/src/config.ts';
import {stringify} from '../packages/shared/model.ts';
// Operator scripts persist exact signed bytes before broadcast, just like the service.
export async function send(key:Hex,label:string,to:Address|undefined,data:Hex='0x',value=0n,authorizationList?:any[]){
 mkdirSync('artifacts/private',{recursive:true});const path='artifacts/private/'+label.replace(/[^a-zA-Z0-9_-]/g,'_')+'.json';
 const account=privateKeyToAccount(key),wallet=createWalletClient({account,chain,transport});
 let saved:any;
 if(existsSync(path)){saved=JSON.parse(readFileSync(path,'utf8'));}
 else{
  const request=await wallet.prepareTransactionRequest({to,data,value,...(authorizationList?{authorizationList}:{})});
  if((request.gas||0n)*(request.maxFeePerGas||request.gasPrice||0n)>parseEther('1')||value>parseEther('12'))throw new Error('Operator gas or funding transfer exceeds its budget');
  const raw=await wallet.signTransaction(request);saved={hash:keccak256(raw),raw};writeFileSync(path,stringify(saved),{mode:0o600});
 }
 let receipt=await rpc.getTransactionReceipt({hash:saved.hash}).catch(()=>null);
 if(!receipt){await wallet.sendRawTransaction({serializedTransaction:saved.raw});receipt=await rpc.waitForTransactionReceipt({hash:saved.hash,timeout:120000});}
 if(receipt.status!=='success')throw new Error(label+' reverted: '+saved.hash);
 const deadline=Date.now()+30000;
 while((await rpc.getBlock({blockTag:'finalized'})).number<receipt.blockNumber){if(Date.now()>deadline)throw new Error('Awaiting finality for '+saved.hash);await new Promise(r=>setTimeout(r,500));}
 console.log(label,saved.hash);return receipt;
}
