import {readFileSync,existsSync} from 'node:fs';
import {type Address,type Hex,isAddress} from 'viem';
if(existsSync('.env'))process.loadEnvFile('.env');
export const config={
 origin:process.env.PUBLIC_ORIGIN||'http://localhost:8789', port:Number(process.env.PORT||8789),
 rpc:process.env.RPC_URL||'https://testnet-rpc.monad.xyz',
 policy:(process.env.POLICY_ADDRESS||'0x0000000000000000000000000000000000000000') as Address,
 manager:(process.env.MANAGER_ADDRESS||'0x0000000000000000000000000000000000000000') as Address,
 policyCodeHash:process.env.POLICY_CODE_HASH||'',
 db:process.env.DB_PATH||'workshop.sqlite',
 siteUsername:process.env.WORKSHOP_USERNAME||'',sitePassword:process.env.WORKSHOP_PASSWORD||'',
 runner:process.env.CODEX_RUNNER_URL||'http://127.0.0.1:8790',
 model:process.env.CODEX_MODEL||'gpt-5.6-luna',
};
if(!isAddress(config.policy)||!isAddress(config.manager))throw new Error('Invalid configured address');
export function keys():Record<'manager'|'relayer'|'liquidity'|'smoke',Hex>{return JSON.parse(readFileSync(process.env.KEYS_FILE||'secrets/workshop.json','utf8'));}
