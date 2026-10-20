import {createServer} from 'vite'
import {readFileSync,existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3],before=process.argv[4]==='before',root=path.join(app,'.cache/l1-bake-smoothing/before')
if(!Number.isInteger(port)||!profile)throw Error('Expected owned QA port/profile')
const snapshots=before?new Map(JSON.parse(readFileSync(path.join(app,'.cache/l1-bake-smoothing/baseline.json'),'utf8').replace(/^\uFEFF/,'')).filter(v=>!v.path.startsWith('../')).map(v=>[path.resolve(app,v.path).toLowerCase(),v.snapshot])):new Map()
const plugin={name:'l1-bake-smoothing-before',enforce:'pre',load(id){const snapshot=snapshots.get(path.normalize(id.split('?')[0]).toLowerCase());if(snapshot)return readFileSync(snapshot,'utf8')},configureServer(server){if(before)server.middlewares.use((req,res,next)=>{
 const p=decodeURIComponent((req.url??'').split('?')[0]);if(!p.startsWith('/assets/l1-bakes/'))return next()
 const file=path.resolve(root,'public','.'+p),allowed=path.resolve(root,'public/assets/l1-bakes')+path.sep
 if(!file.startsWith(allowed)||!existsSync(file))return next()
 res.setHeader('Content-Type',file.endsWith('.gz')?'application/octet-stream':'application/json');res.end(readFileSync(file))
})}
}
const server=await createServer({root:app,configFile:path.join(app,'vite.config.ts'),cacheDir:path.join(profile,'vite-cache'),plugins:[plugin],optimizeDeps:{entries:['index.html','verifier/l1v2-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false}})
await server.listen();server.printUrls()
