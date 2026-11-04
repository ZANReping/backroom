import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3]
if(!Number.isInteger(port)||!profile)throw Error('Owned port/profile required')
const server=await createServer({root:app,configFile:false,base:'./',plugins:[react()],resolve:{alias:{'@':path.join(app,'src')}},cacheDir:path.join(profile,'vite-cache'),optimizeDeps:{entries:['index.html','verifier/hound-l02-import-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/.cache/**','**/reports/**']}}})
await server.listen();server.printUrls()
