import{createServer}from'vite'
import react from'@vitejs/plugin-react'
import path from'node:path'
import{readFileSync,existsSync}from'node:fs'
import{fileURLToPath}from'node:url'
const app=fileURLToPath(new URL('../',import.meta.url)),port=Number(process.argv[2]),profile=process.argv[3],before=process.argv[4]==='before'
if(!Number.isInteger(port)||port<1||!profile)throw Error('Owned QA port/profile required')
const historical={name:'mirror-before',enforce:'pre',load(id){if(!before)return;const key=id.replaceAll('\\','/').split('?')[0],root=app.replaceAll('\\','/').replace(/\/$/,'')+'/';if(!key.startsWith(root))return;const rel=key.slice(root.length),file=path.join(app,'.cache/mirror-reflections-20261027/before',rel);if(rel.startsWith('src/')&&existsSync(file))return readFileSync(file,'utf8')}}
const server=await createServer({root:app,configFile:false,base:'./',plugins:[historical,react()],resolve:{alias:{'@':path.join(app,'src')}},cacheDir:path.join(profile,'vite-cache'),optimizeDeps:{entries:['verifier/hound-l02-import-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/.cache/**','**/reports/**']}}})
await server.listen();server.printUrls()
