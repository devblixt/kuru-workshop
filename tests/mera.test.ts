import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {toHex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {config} from '../apps/server/src/config.ts';
import {rpc} from '../apps/server/src/chain.ts';
import {openStore} from '../apps/server/src/db.ts';
import {createApi} from '../apps/server/src/api.ts';
import {chain} from '../packages/shared/manifest.ts';
test('delegation sponsorship binds chain, implementation, signer, wallet session and nonce',async()=>{
 const db=openStore(':memory:'),app=await createApi(db),oldMera=config.mera,oldNonce=rpc.getTransactionCount;
 config.mera='0x2222222222222222222222222222222222222222';
 rpc.getTransactionCount=async()=>0;
 const mera=privateKeyToAccount(toHex(11n,{size:32})),root='0x3333333333333333333333333333333333333333';
 const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
 db.prepare('INSERT INTO site_sessions VALUES(?,?)').run(digest('site'),Date.now()+60000);
 db.prepare('INSERT INTO auth VALUES(?,?,?)').run(digest('wallet'),root,Date.now()+60000);
 const headers={origin:config.origin,cookie:'workshop_site=site; workshop=wallet'};
 const signed=await mera.signAuthorization({chainId:chain.id,contractAddress:config.mera,nonce:0});
 const auth={address:signed.address,chainId:signed.chainId,nonce:signed.nonce,yParity:signed.yParity,r:signed.r,s:signed.s};
 const payload={mera:mera.address,authorization:auth};
 try{
  assert.equal((await app.inject({method:'POST',url:'/api/mera/delegation',headers:{origin:config.origin},payload})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/mera/delegation',headers:{...headers,origin:'https://invalid.example'},payload})).statusCode,403);
  const wrongChain=await app.inject({method:'POST',url:'/api/mera/delegation',headers,payload:{...payload,authorization:{...auth,chainId:1}}});assert.equal(wrongChain.statusCode,400);
  const wrongSigner=await app.inject({method:'POST',url:'/api/mera/delegation',headers,payload:{...payload,mera:root}});assert.equal(wrongSigner.statusCode,400);
  const accepted=await app.inject({method:'POST',url:'/api/mera/delegation',headers,payload});assert.equal(accepted.statusCode,200,accepted.body);
  const id=accepted.json().id,row=db.prepare('SELECT * FROM delegations WHERE id=?').get(id) as any;assert.equal(row.address,root);assert.equal(row.status,'queued');assert.equal(row.hash,null);
  const response=await app.inject({url:'/api/mera/delegation/'+id,headers});assert.equal(response.statusCode,200);assert.equal(response.json().authorization,undefined);
  db.prepare('UPDATE auth SET address=?').run('0x4444444444444444444444444444444444444444');assert.equal((await app.inject({url:'/api/mera/delegation/'+id,headers})).statusCode,404);
 }finally{config.mera=oldMera;rpc.getTransactionCount=oldNonce;await app.close();db.close();}
});
