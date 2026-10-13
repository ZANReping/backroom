import {loadImage} from '@napi-rs/canvas'
import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial.ts'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const appDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const out=path.join(appDir,'reports/l1-remake/iteration-8/reference-aspects.json')
const rows=[]
const mismatches=[]
for(const ref of L1_PHOTO_ANCHORS){
 const file=path.join(appDir,'reference/L1',...ref.file.split('/'))
 const image=await loadImage(file)
 const actual={width:image.width,height:image.height}
 if(ref.width!==actual.width||ref.height!==actual.height)mismatches.push(`${ref.id}: metadata ${ref.width}x${ref.height}, source ${actual.width}x${actual.height}`)
 rows.push({id:ref.id,file:ref.file,width:actual.width,height:actual.height})
}
if(mismatches.length)throw new Error(mismatches.join('\n'))
await mkdir(path.dirname(out),{recursive:true})
await writeFile(out,JSON.stringify({generatedAt:new Date().toISOString(),references:rows},null,2)+'\n')
console.log(`checked ${rows.length} L1 references; wrote ${path.relative(appDir,out)}`)
