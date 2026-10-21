import {createServer} from 'vite'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3]
if(!Number.isInteger(port)||port<1||!profile)throw Error('Owned QA port/profile required')
const server=await createServer({root:app,configFile:path.join(app,'vite.config.ts'),cacheDir:path.join(profile,'vite-cache'),optimizeDeps:{entries:['index.html','verifier/l4-melee-wrangler-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false}})
await server.listen();server.printUrls()
