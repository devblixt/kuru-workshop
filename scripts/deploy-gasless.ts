import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {encodeDeployData,encodeFunctionData,erc20Abi,keccak256,type Address} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {keys,config} from '../apps/server/src/config.ts';
import {rpc,verifyDeployment} from '../apps/server/src/chain.ts';
import {deployment,coreAbi} from '../packages/shared/manifest.ts';
import {send} from './transactions.ts';
if(existsSync('artifacts/gasless-deployment.json'))throw new Error('Gasless deployment is already recorded');
await verifyDeployment();const key=keys(),relayer=privateKeyToAccount(key.relayer),liquidity=privateKeyToAccount(key.liquidity);
async function deploy(name:string,args:unknown[],label:string){const a=JSON.parse(readFileSync(`contracts/out/${name}.sol/${name}.json`,'utf8'));const r=await send(key.relayer,label,undefined,encodeDeployData({abi:a.abi,bytecode:a.bytecode.object,args}));if(!r.contractAddress)throw new Error('Missing deployment address');const code=await rpc.getCode({address:r.contractAddress});if(!code)throw new Error('Deployment has no code');return {address:r.contractAddress,hash:r.transactionHash,codeHash:keccak256(code)};}
const mera=await deploy('MeraPortfolioV2',[deployment.core,deployment.usdc,deployment.markets.map(m=>m.address),config.mera],'deploy-mera-v2-gasless');
const gasless=await deploy('WorkshopGasless',[deployment.core,deployment.usdc,relayer.address],'deploy-workshop-gasless');
const pool=await rpc.readContract({address:deployment.usdc,abi:erc20Abi,functionName:'balanceOf',args:[gasless.address]});
if(pool<7500000000n){
 const available=await rpc.readContract({address:deployment.core,abi:coreAbi,functionName:'getBalance',args:[liquidity.address,deployment.usdc]});
 if(available<7500000000n)throw new Error('Insufficient unreserved operator USDC for faucet');
 await send(key.liquidity,'gasless-faucet-inventory-withdraw',deployment.core,encodeFunctionData({abi:coreAbi,functionName:'withdraw',args:[deployment.usdc,7500000000n]}));
 await send(key.liquidity,'gasless-faucet-inventory-transfer',deployment.usdc,encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[gasless.address,7500000000n]}));
}
const balance=await rpc.readContract({address:deployment.usdc,abi:erc20Abi,functionName:'balanceOf',args:[gasless.address]});if(balance<7500000000n)throw new Error('Faucet funding read-back failed');
const record={at:new Date().toISOString(),previous:config.mera,mera,gasless,relayer:relayer.address,faucetUSDC:String(balance)};writeFileSync('artifacts/gasless-deployment.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));
