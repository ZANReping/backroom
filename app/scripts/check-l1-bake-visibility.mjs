// Compare the current bake against the same kernel with closest-hit traversal.
// Only the temporary Node test bundle changes; production sources stay intact.
import {build} from 'esbuild'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
const entry='scripts/check-l1-bake-visibility.ts'
for(const mode of ['baseline','verify']){
 const outfile=`.cache/check-l1-bake-visibility-${mode}.mjs`
 await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',plugins:mode==='baseline'?[{
  name:'closest-hit-reference',setup(b){b.onLoad({filter:/[\\/]world[\\/]l1Bake\.ts$/},args=>{
   const text=readFileSync(args.path,'utf8'),needle='len-.025,true'
   if(text.split(needle).length!==2)throw Error('Expected one direct visibility query')
   return{contents:text.replace(needle,'len-.025,false'),loader:'ts'}
  })}
 }]:[]})
 execFileSync(process.execPath,[outfile,mode],{stdio:'inherit'})
}
