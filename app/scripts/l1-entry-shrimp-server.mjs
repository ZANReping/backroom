import {createServer} from 'vite'
import {readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3],before=process.argv[4]==='before'
if(!Number.isInteger(port)||!profile)throw Error('Expected owned QA port/profile')
const snapshots=before?new Map(JSON.parse(readFileSync(path.join(app,'.cache/l1-entry-shrimp/baseline.json'),'utf8').replace(/^\uFEFF/,'')).filter(v=>!v.path.startsWith('../')&&!v.path.startsWith('verifier/')).map(v=>[path.resolve(app,v.path).toLowerCase(),v.snapshot])):new Map()
const plugin={name:'l1-entry-shrimp-baseline',enforce:'pre',load(id){const snapshot=snapshots.get(path.normalize(id.split('?')[0]).toLowerCase());if(snapshot)return readFileSync(snapshot,'utf8')}}
const server=await createServer({root:app,configFile:path.join(app,'vite.config.ts'),cacheDir:path.join(profile,'vite-cache'),plugins:[plugin],optimizeDeps:{entries:['index.html','verifier/l1v2-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false}})
await server.listen();server.printUrls()
