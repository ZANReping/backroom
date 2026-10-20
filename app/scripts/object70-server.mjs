import {createServer} from 'vite'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3],before=process.argv[4]==='before'
if(!Number.isInteger(port)||!profile)throw Error('Expected owned QA port and profile directory')
// The baseline App imports through @ as well as relative paths. Both must
// resolve into its snapshot, including the engine singleton and storage.
const server=await createServer({root:app,configFile:path.join(app,'vite.config.ts'),cacheDir:path.join(profile,'vite-cache'),
 resolve:before?{alias:{'@':path.join(app,'.cache/object70-v83-before/src')}}:{},
 optimizeDeps:{entries:['index.html','verifier/l11-map.html','verifier/l11-map.tsx','verifier/object70-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false}})
await server.listen();server.printUrls()
