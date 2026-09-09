import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {decisionSchema,initialWeights} from '../../../packages/shared/model.ts';
const schema={type:'object',additionalProperties:false,required:['baskets'],properties:{baskets:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['profile','weights','action','explanation'],properties:{profile:{type:'string',enum:['gold','balanced','crypto']},weights:{type:'array',minItems:4,maxItems:4,items:{type:'integer',minimum:0,maximum:10000}},action:{type:'string',enum:['hold','rebalance']},explanation:{type:'string',maxLength:500}}}}}};
const snapshotSchema=z.object({block:z.string().regex(/^\d+$/),at:z.number(),markets:z.array(z.object({symbol:z.enum(['XAUt0','WETH','cbBTC']),bid:z.string().regex(/^\d+$/),ask:z.string().regex(/^\d+$/),reference:z.string().regex(/^\d+$/),bidValue:z.string().regex(/^\d+$/),askValue:z.string().regex(/^\d+$/),available:z.boolean()}).strict()).length(3)}).strict();
let busy=false;
const model=process.env.CODEX_MODEL||'gpt-5.6-luna';
export async function runModel(input:unknown){
 const s=snapshotSchema.parse(input);if(Date.now()-s.at>20000||s.at>Date.now()+5000||new Set(s.markets.map(m=>m.symbol)).size!==3)throw new Error('Invalid or stale snapshot');
 const dir=await mkdtemp(join(tmpdir(),'basket-'));await writeFile(join(dir,'schema.json'),JSON.stringify(schema));
 const prompt=`You operate three shared TESTNET educational baskets. Return only schema JSON, exactly one per profile. Weights order: gold XAUt0, WETH, cbBTC, cash USDC. Sum exactly 10000; each risky asset <=5000; cash >=1000. Baselines: ${JSON.stringify(initialWeights)}. Preserve each profile's tilt. No external facts, tools, price forecasts or claims of real RWA backing. Use the numeric snapshot below; quote values use 6 USDC decimals. With valid two-sided markets and spreads below 2%, recommend rebalance to the baseline or a modest more-cash allocation when depth is weak; this permits new subscribers to catch up. Hold means nobody trades this cycle and is appropriate for unavailable or crossed markets. Keep explanations below 160 characters. A separate contract enforces each owner's limits. Snapshot: ${JSON.stringify(s)}`;
 const disabled=['code_mode_host','shell_tool','unified_exec','plugins','apps','hooks','browser_use','browser_use_external','computer_use','multi_agent','multi_agent_v2','skill_search','skill_mcp_dependency_install','image_generation','view_image','memories'];
 const args=['exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only','-m',model,'-c','model_reasoning_effort="low"','-c','web_search="disabled"','--json','--output-schema',join(dir,'schema.json'),'-o',join(dir,'output.json'),'-C',dir,...disabled.flatMap(f=>['--disable',f]),'-'];
 try{
  const output=await new Promise<string>((resolve,reject)=>{
   const child=spawn(process.env.CODEX_BINARY||'/usr/local/bin/codex',args,{stdio:['pipe','pipe','pipe'],detached:true,env:{PATH:'/usr/local/bin:/usr/bin:/bin',HOME:'/home/runner',CODEX_HOME:'/home/runner/.codex',SSL_CERT_FILE:'/etc/ssl/certs/ca-certificates.crt'}});
   let log='',err='',failed=false;const kill=()=>{if(child.pid)try{process.kill(-child.pid,'SIGKILL');}catch{}};
   const timeout=setTimeout(()=>{failed=true;kill();reject(new Error('Codex exceeded 20-second deadline'));},20000);
   child.stdout.on('data',d=>{log+=d.toString();if(log.length>262144){failed=true;kill();reject(new Error('Codex output limit exceeded'));}});
   child.stderr.on('data',d=>{err=(err+d.toString()).slice(-2000);});
   child.on('error',e=>{clearTimeout(timeout);reject(e);});
   child.on('close',code=>{clearTimeout(timeout);if(failed)return;if(code!==0)return reject(new Error('Codex failed or quota unavailable (exit '+code+')'));resolve(log);});
   child.stdin.end(prompt);
  });
  for(const line of output.split('\n').filter(Boolean)){
   const e=JSON.parse(line);if(e.item&&['command_execution','mcp_tool_call','web_search','file_change','tool_call'].includes(e.item.type))throw new Error('Unexpected tool activity rejected');
  }
  return decisionSchema.parse(JSON.parse(await readFile(join(dir,'output.json'),'utf8')));
 }finally{await rm(dir,{recursive:true,force:true});}
}
createServer(async(req,res)=>{
 if(req.method==='GET'&&req.url==='/health'){res.end(JSON.stringify({ok:true,busy,model}));return;}
 if(req.method!=='POST'||req.url!=='/decide'){res.writeHead(404).end();return;}
 if(busy){res.writeHead(429).end();return;}busy=true;
 try{let body='';for await(const part of req){body+=part;if(body.length>16384)throw new Error('Request too large');}const result=await runModel(JSON.parse(body));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));}
 catch(e){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e instanceof Error?e.message:'Model unavailable'}));}
 finally{busy=false;}
}).listen(8790,'0.0.0.0');
