import {build} from 'esbuild'
import {mkdirSync,writeFileSync} from 'node:fs'
import {spawnSync} from 'node:child_process'
mkdirSync('.cache',{recursive:true})
await build({entryPoints:['scripts/check-worker-pipeline.ts'],bundle:true,platform:'node',format:'esm',packages:'bundle',external:['@napi-rs/canvas'],outfile:'.cache/check-worker-pipeline.mjs',define:{'import.meta.env':'{}'}})
const r=spawnSync(process.execPath,['.cache/check-worker-pipeline.mjs'],{encoding:'utf8'});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');
mkdirSync('reports/offscreen-20261108',{recursive:true});writeFileSync('reports/offscreen-20261108/static-checks.json',JSON.stringify({ok:r.status===0,exitCode:r.status,stdout:r.stdout,stderr:r.stderr},null,2));if(r.status!==0)process.exit(r.status??1)
