import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createWalletClient,http,keccak256,parseEther,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {keys,config} from '../apps/server/src/config.ts';
import {rpc,transport,verifyDeployment} from '../apps/server/src/chain.ts';
import {deployment,chain} from '../packages/shared/manifest.ts';
import {stringify} from '../packages/shared/model.ts';
await verifyDeployment();
const key=keys();const account=privateKeyToAccount(key.relayer);const wallet=createWalletClient({account,chain,transport});
const artifact=JSON.parse(readFileSync('contracts/out/PortfolioPolicy.sol/PortfolioPolicy.json','utf8'));
mkdirSync('artifacts',{recursive:true});
if(existsSync('artifacts/deployment.json'))throw new Error('Deployment already recorded; refusing to redeploy');
let hash:Hex;
if(existsSync('artifacts/deploy-pending.json')){
 const pending=JSON.parse(readFileSync('artifacts/deploy-pending.json','utf8'));hash=pending.hash;
 try{await rpc.getTransaction({hash});}catch{await wallet.sendRawTransaction({serializedTransaction:pending.raw});}
}else{
 const {encodeDeployData}=await import('viem');
 const data=encodeDeployData({abi:artifact.abi,bytecode:artifact.bytecode.object,args:[deployment.core,deployment.usdc,deployment.markets.map(m=>m.address)]});
 const request=await wallet.prepareTransactionRequest({to:undefined,data});
 if((request.gas||0n)*(request.maxFeePerGas||request.gasPrice||0n)>parseEther('1'))throw new Error('Deployment gas budget exceeds 1 MON');
 const raw=await wallet.signTransaction(request);hash=keccak256(raw);
 writeFileSync('artifacts/deploy-pending.json',stringify({hash,raw}),{mode:0o600});await wallet.sendRawTransaction({serializedTransaction:raw});
}
const receipt=await rpc.waitForTransactionReceipt({hash,timeout:120000});
if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('Policy deployment failed');
const code=await rpc.getCode({address:receipt.contractAddress});if(!code)throw new Error('No deployed code');
const record={policy:receipt.contractAddress,manager:privateKeyToAccount(key.manager).address,relayer:account.address,liquidity:privateKeyToAccount(key.liquidity).address,smoke:privateKeyToAccount(key.smoke).address,transaction:hash,block:String(receipt.blockNumber),codeHash:keccak256(code),chainId:chain.id};
writeFileSync('artifacts/deployment.json',JSON.stringify(record,null,2));
const env=`PUBLIC_ORIGIN=http://localhost:8789\nPOLICY_ADDRESS=${record.policy}\nMANAGER_ADDRESS=${record.manager}\nPOLICY_CODE_HASH=${record.codeHash}\n`;
if(!existsSync('.env'))writeFileSync('.env',env,{mode:0o600});
console.log(JSON.stringify(record,null,2));
