import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3],before=process.argv[4]==='baseline'
if(!Number.isInteger(port)||!profile)throw Error('Owned port and profile required')
const files=new Set(['src/game/renderer/l02Props.ts','src/game/renderer/remodelSites.ts','src/game/renderer/l02Scene.ts'])
const overlay={name:'l02-props-read-only-baseline',enforce:'pre',load(id){const file=path.relative(app,id.split('?')[0]).replaceAll('\\','/');if(before&&files.has(file))return readFileSync(path.join(app,'.cache/l02-props-20261030/before',file),'utf8')}}
const server=await createServer({root:app,configFile:false,base:'./',plugins:[overlay,react()],resolve:{alias:{'@':path.join(app,'src')}},cacheDir:path.join(profile,'vite-cache'),optimizeDeps:{entries:['index.html','verifier/hound-l02-import-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/.cache/**','**/reports/**']}}})
await server.listen();server.printUrls()
