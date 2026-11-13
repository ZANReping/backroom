import {createServer} from 'vite'
import path from 'node:path'
import fs from 'node:fs'
const root=process.cwd(),port=Number(process.argv[2]),cache=process.argv[3],original=process.argv[4]==='before'
if(!Number.isInteger(port)||!cache)throw Error('Owned port/cache required')
const baseline={name:'worker-before-sources',enforce:'pre',load(id){
 if(!original)return
 const file=id.split('?')[0],rel=path.relative(root,file).replaceAll('\\','/')
 if(rel.startsWith('..'))return
 const saved=path.join(root,'reports/offscreen-20261108/source-before',rel.replaceAll('/','__'))
 if(fs.existsSync(saved))return fs.readFileSync(saved,'utf8')
}}
const server=await createServer({root,plugins:[baseline],configFile:path.join(root,'vite.config.ts'),cacheDir:cache,optimizeDeps:{entries:['index.html','verifier/worker-pipeline-app.html','verifier/worker-render.html','verifier/worker-performance.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false}})
await server.listen();server.printUrls()
