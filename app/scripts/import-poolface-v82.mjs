// One-time merge of the reviewed v81 → v82 text changes into the dirty workspace.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const root=fileURLToPath(new URL('../',import.meta.url)),stage=path.join(root,'.cache/poolface-v82-import')
const targets=new Set(['scripts/gen-retro-avatar-textures.py','scripts/retro_face_clean.py','src/game/renderer/retroNpc.ts','src/proto/retroNpcProto.ts'])
const lf=s=>s.replace(/\r\n/g,'\n'),sha=b=>createHash('sha256').update(b).digest('hex')
const patch=lf(fs.readFileSync(path.join(stage,'incremental-v81-to-v82.patch'),'utf8')),changes=[]
for(const block of patch.split(/(?=^diff --git )/m)){
 const name=block.match(/^\+\+\+ b\/app\/(.+)$/m)?.[1]
 if(!targets.has(name))continue
 const file=path.join(root,name),raw=fs.readFileSync(file,'utf8');let next=lf(raw),hunks=0
 for(const hunk of block.split(/^@@[^\n]*\n/m).slice(1)){
  let before='',after=''
  for(const line of hunk.split('\n')){const p=line[0];if(![' ','-','+'].includes(p))continue;if(p!=='+')before+=line.slice(1)+'\n';if(p!=='-')after+=line.slice(1)+'\n'}
  if(next.includes(after))continue
  const at=next.indexOf(before)
  if(at<0||next.indexOf(before,at+1)>=0)throw Error('Changed or ambiguous source hunk: '+name)
  next=next.slice(0,at)+after+next.slice(at+before.length);hunks++
 }
 changes.push({path:name,file,before:sha(raw),next:raw.includes('\r\n')?next.replace(/\n/g,'\r\n'):next,hunks})
}
if(changes.length!==targets.size)throw Error('Incomplete text patch')
// Validate all original hunks before writing any source file.
for(const c of changes)if(c.hunks)fs.writeFileSync(c.file,c.next)
const report={zipSha256:'e6a7ebfb6065b1d43bef9d62c05212aa8b19da5b4d2633201e8126eb7d1cc87a',baseline:'.cache/poolface-v82-holster-before',files:changes.map(({path,before,next,hunks})=>({path,before,after:sha(next),hunks}))}
fs.mkdirSync(path.join(root,'reports/poolface-v82'),{recursive:true});fs.writeFileSync(path.join(root,'reports/poolface-v82/text-import.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
