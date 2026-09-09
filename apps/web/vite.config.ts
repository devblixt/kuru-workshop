import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig(({mode})=>{
 const env=loadEnv(mode,process.cwd(),'WORKSHOP_');
 const target=env.WORKSHOP_API_PROXY||'http://127.0.0.1:8789';
 return {root:resolve('apps/web'),plugins:[react()],build:{outDir:resolve('dist/web'),emptyOutDir:true},server:{host:'localhost',port:5173,proxy:{'/api':{target,changeOrigin:true,...(env.WORKSHOP_API_PROXY?{headers:{origin:new URL(target).origin}}:{})}}}};
});
