import {build} from 'vite'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'.cache/entry-speed-20261029/cold-dist')
if(!out.startsWith(path.join(app,'.cache')+path.sep))throw Error('QA build outside owned cache')
await build({root:app,configFile:false,base:'./',publicDir:false,resolve:{alias:{'@':path.join(app,'src')}},build:{outDir:out,emptyOutDir:true,target:['es2018','chrome87'],rollupOptions:{input:path.join(app,'verifier/entry-cold.html')}}})
