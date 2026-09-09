import {mkdirSync,writeFileSync} from 'node:fs';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
mkdirSync('secrets',{recursive:true,mode:0o700});
const roles=['manager','relayer','liquidity','smoke'] as const;
const keys=Object.fromEntries(roles.map(role=>[role,generatePrivateKey()]));
writeFileSync('secrets/workshop.json',JSON.stringify(keys,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(Object.fromEntries(roles.map(role=>[role,privateKeyToAccount(keys[role]).address])));
