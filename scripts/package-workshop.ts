import {mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
mkdirSync('apps/web/public/downloads',{recursive:true});
for(const branch of ['starter','solution'])execFileSync('git',['archive','--format=zip','--prefix=kuru-workshop/','--output=apps/web/public/downloads/kuru-workshop-'+branch+'.zip',branch]);
console.log('Packaged starter and solution branches without ignored secrets.');
