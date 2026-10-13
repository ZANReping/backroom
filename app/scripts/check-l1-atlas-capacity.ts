import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {buildL1Data} from '../src/game/world/l1Building'
import {bakeL1,layoutL1BakeCharts} from '../src/game/world/l1Bake'
import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial'

const rows:any[]=[],seen=new Set<string>()
for(const seed of [20261006,1,42,7391]){
 const centres=seed===20261006?L1_PHOTO_ANCHORS.map(a=>[Math.floor(a.x/32),Math.floor(a.y/32)]):[[-1,-1],[0,0],[8,-7]]
 for(const [cx,cy]of centres)for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
  const key=`${seed}:${cx+dx},${cy+dz}`;if(seen.has(key))continue;seen.add(key)
  const data=buildL1Data(seed,cx+dx,cy+dz)
  for(const quality of ['low','high'] as const){
   const atlas=layoutL1BakeCharts(data,quality),occupied=new Uint8Array(atlas.size*atlas.size)
   assert(atlas.size<=1024&&Number.isInteger(Math.log2(atlas.size)))
   for(const f of atlas.faces){
    if(f.surface==='leaf')continue
    assert(f.x>=1&&f.y>=1&&f.x+f.w<atlas.size&&f.y+f.h<atlas.size)
   const edgeA=Math.hypot(f.p[1][0]-f.p[0][0],f.p[1][1]-f.p[0][1],f.p[1][2]-f.p[0][2]),edgeB=Math.hypot(f.p[3][0]-f.p[0][0],f.p[3][1]-f.p[0][1],f.p[3][2]-f.p[0][2])
   if(!f.detail&&(f.surface==='floor'||f.surface==='ground'||f.surface==='ceiling')&&edgeA>=1&&edgeB>=1)assert(f.w>=2&&f.h>=2,`broad ${f.surface} chart below 2x2 ${key} ${quality}`)
    // Check padding too: adjacent charts must not share border texels.
    for(let y=f.y-1;y<=f.y+f.h;y++)for(let x=f.x-1;x<=f.x+f.w;x++){
     const i=y*atlas.size+x;assert.equal(occupied[i],0,`overlap ${key} ${quality}`);occupied[i]=1
    }
   }
   rows.push({seed,cx:data.cx,cy:data.cy,quality,size:atlas.size,faces:atlas.faces.length,fallback:atlas.fallback})
  }
 }
}
const failedBefore=rows.find(r=>r.quality==='low'&&r.fallback)
assert(failedBefore,'must cover the dense classic-mode failure')
const a=bakeL1(failedBefore.seed,failedBefore.cx,failedBefore.cy,'low'),b=bakeL1(failedBefore.seed,failedBefore.cx,failedBefore.cy,'low')
assert.deepEqual(a.irradiance,b.irradiance);assert.deepEqual(a.direction,b.direction)
for(const m of a.meshes){
 assert(m.position.every(Number.isFinite));assert(m.uv1.every(v=>Number.isFinite(v)&&v>0&&v<1))
}
const result={passed:true,layouts:rows.length,fallbacks:rows.filter(r=>r.fallback),repeatedBake:failedBefore,maxSize:Math.max(...rows.map(r=>r.size))}
const iteration=process.env.L1_QA_ITERATION??'iteration-9';assert(/^iteration-\d+$/.test(iteration))
mkdirSync(`reports/l1-remake/${iteration}`,{recursive:true})
writeFileSync(`reports/l1-remake/${iteration}/atlas-capacity.json`,JSON.stringify(result,null,2)+'\n')
console.log(JSON.stringify(result))
