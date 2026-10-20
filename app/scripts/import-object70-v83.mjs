// Apply only the reviewed Object 70 incremental hunks to the current dirty tree.
// Stage the supplied ZIP under .cache/object70-v83-import first; never overlay old source.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const root=fileURLToPath(new URL('../',import.meta.url)),stage=path.join(root,'.cache/object70-v83-import')
const targets=new Set(['scripts/gen-item-icons.py','src/components/HUD.tsx','src/game/content/codexScores.ts','src/game/content/items.ts','src/game/decorations/containers.ts','src/game/renderer/itemsMesh.ts','src/game/renderer/renderer.ts','src/game/renderer/structures.ts','src/game/world/infinite.ts','src/game/world/mapgen.ts'])
const lf=s=>s.replace(/\r\n/g,'\n'),sha=b=>createHash('sha256').update(b).digest('hex')
const patch=lf(fs.readFileSync(path.join(stage,'backroom-object70-v83-incremental-vs-49a7ead.patch'),'utf8')),changes=[]
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
// Validate every original hunk before writing any source file.
for(const c of changes)if(c.hunks)fs.writeFileSync(c.file,c.next)
const report={baseline:'.cache/object70-v83-before',files:changes.map(({path,before,next,hunks})=>({path,before,after:sha(next),hunks}))}
fs.mkdirSync(path.join(root,'reports/object70-v83'),{recursive:true});fs.writeFileSync(path.join(root,'reports/object70-v83/text-import.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify(report))
