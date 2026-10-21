import {createServer} from 'vite'
import {readFileSync,existsSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),repo=path.dirname(app.replace(/[\\/]$/,'')),port=Number(process.argv[2]),profile=process.argv[3],before=process.argv[4]==='before'
if(!Number.isInteger(port)||port<1||!profile)throw Error('Expected owned QA port/profile')
const imp=path.join(app,'.cache/imports/ouro-v34-20261021'),snapshots=new Map()
if(before){const rows=JSON.parse(readFileSync(path.join(imp,'before.json'),'utf8'));for(const row of rows)if(row.existed&&row.path.startsWith('app/src/')&&row.path.endsWith('.ts'))snapshots.set(path.resolve(repo,row.path).toLowerCase(),path.join(imp,'before',row.path))}
const assetRoot=path.join(imp,'before/app/public/assets/l1-bakes')
const plugin={name:'ouro-task-baseline',enforce:'pre',load(id){const snapshot=snapshots.get(path.normalize(id.split('?')[0]).toLowerCase());if(snapshot)return readFileSync(snapshot,'utf8')},configureServer(server){if(!before)return;server.middlewares.use((req,res,next)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(!pathname.startsWith('/assets/l1-bakes/'))return next();const name=pathname.slice('/assets/l1-bakes/'.length),target=path.resolve(assetRoot,name);if(!target.startsWith(path.resolve(assetRoot)+path.sep)||!existsSync(target))return next();res.setHeader('Content-Type',target.endsWith('.json')?'application/json':'application/gzip');res.setHeader('Cache-Control','no-store');res.end(readFileSync(target))})}}
const server=await createServer({root:app,configFile:path.join(app,'vite.config.ts'),cacheDir:path.join(profile,'vite-cache'),plugins:[plugin],optimizeDeps:{entries:['index.html','verifier/l1v2-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false}})
await server.listen();server.printUrls()