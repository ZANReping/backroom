// Isolated actual-App import QA; optional pre-import source overlay is read-only.
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3],baseline=process.argv[4]==='baseline'
if(!Number.isInteger(port)||port<1||!profile)throw Error('Owned QA port/profile required')
const files=new Set(['src/game/renderer/renderer.ts','src/game/renderer/structures.ts'])
const before={name:'pre-import-read-only',enforce:'pre',load(id){const rel=path.relative(app,id.split('?')[0]).split(path.sep).join('/');if(baseline&&files.has(rel))return readFileSync(path.join(app,'.cache/four-import-20261023/before/app',rel),'utf8')}}
const server=await createServer({root:app,configFile:false,base:'./',plugins:[before,react()],resolve:{alias:{'@':path.join(app,'src')}},cacheDir:path.join(profile,'vite-cache'),optimizeDeps:{entries:['index.html','verifier/l4-melee-wrangler-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/.cache/**','**/reports/**']}}})
await server.listen();server.printUrls()
