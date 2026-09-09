import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const git=(args:string[],input?:string,env=process.env)=>execFileSync('git',args,{encoding:'utf8',input,env}).trim();
if(git(['status','--porcelain']))throw new Error('Commit the solution before creating participant branches');
const solution=git(['rev-parse','HEAD']);
git(['branch','solution',solution]);
const dir=mkdtempSync(join(tmpdir(),'workshop-index-'));
try{
 const env={...process.env,GIT_INDEX_FILE:join(dir,'index')};
 git(['read-tree',solution],undefined,env);
 const source=`import {createKuruClient,type KuruClientConfig} from '@toxicflow-labs/ts-sdk';
import {deployment} from '../../../packages/shared/manifest.ts';
// Exercise 1: create the SDK client with config and canonical AccountCore.
export function connectKuru(config:KuruClientConfig):ReturnType<typeof createKuruClient>{throw new Error('TODO 1: connect the Kuru SDK');}
// Exercise 2: read available USDC (raw six-decimal units), not the wallet balance.
export async function readAvailableBalance(client:ReturnType<typeof connectKuru>,user:\`0x\${string}\`):Promise<bigint>{throw new Error('TODO 2: read the AccountCore balance');}
// Exercise 2b: read the ETH market best bid/ask; values are in market price ticks.
export async function readMarket(client:ReturnType<typeof connectKuru>):Promise<readonly [bigint,bigint]>{throw new Error('TODO 2b: read the ETH market');}
// Exercise 3: authorize only TRADE (1), for this account and expiry.
export async function authorizeManager(client:ReturnType<typeof connectKuru>,account:\`0x\${string}\`,policy:\`0x\${string}\`,expiry:bigint):Promise<\`0x\${string}\`>{throw new Error('TODO 3: authorize the policy');}
`;
 const blob=git(['hash-object','-w','--stdin'],source);
 git(['update-index','--cacheinfo','100644',blob,'apps/web/src/workshop.ts'],undefined,env);
 const tree=git(['write-tree'],undefined,env);
 const commit=git(['commit-tree',tree,'-p',solution,'-m','Prepare three SDK integration exercises']);
 git(['branch','starter',commit]);console.log({solution,starter:commit});
}finally{rmSync(dir,{recursive:true,force:true});}
