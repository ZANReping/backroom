import { writeFileSync,mkdirSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { l11CityPlan } from '../src/game/world/l11Layout'
import { buildL11Structure } from '../src/game/renderer/l11Meshes'
import { CityBatch } from '../src/game/renderer/l11Batch'
import { l11PlateSolid } from '../src/game/world/l11Solid'
// Recorded pre-optimization method, only used by the interleaved benchmark.
function oldQuad(this:any,mat:THREE.Material,points:number[][],normal:number[],scale=1,uvs?:number[][]){
  let b=this.buckets.get(mat);if(!b){b={p:[],n:[],uv:[],idx:[]};this.buckets.set(mat,b)}
  const start=b.p.length/3,target=new THREE.Vector3(...normal).normalize()
  const geometric=(a:number[],bb:number[],c:number[])=>new THREE.Vector3().crossVectors(new THREE.Vector3().fromArray(bb).sub(new THREE.Vector3().fromArray(a)),new THREE.Vector3().fromArray(c).sub(new THREE.Vector3().fromArray(a)))
  const first=geometric(points[0],points[1],points[2]),second=geometric(points[0],points[2],points[3]);let gn=first.lengthSq()>=1e-10?first:second
  const valid=gn.lengthSq()>=1e-10;let reverse=false;if(valid){reverse=gn.dot(target)<0;gn.normalize();if(reverse)gn.negate()}else gn.copy(target)
  const nx=target.x,nz=target.z,horizontal=Math.hypot(nx,nz)>1e-6;let tx=1,tz=0
  if(horizontal){tx=-nz/Math.hypot(nx,nz);tz=nx/Math.hypot(nx,nz);if(Math.abs(tx)>=Math.abs(tz)?tx<0:tz<0){tx=-tx;tz=-tz}}
  for(const [i,v]of points.entries()){b.p.push(...v);b.n.push(gn.x,gn.y,gn.z);const fallback=horizontal?[(v[0]*tx+v[2]*tz)*scale,v[1]*scale]:[v[0]*scale,v[2]*scale];b.uv.push(...(uvs?.[i]??fallback))}
  if(reverse)b.idx.push(start,start+2,start+1,start,start+3,start+2);else b.idx.push(start,start+1,start+2,start,start+2,start+3)
  if(this.capture&&valid)for(const ids of [[0,1,2],[0,2,3]]){const solid=l11PlateSolid(ids.map(i=>points[i] as [number,number,number]));if(solid)this.solids.push(solid)}
}
Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128)}})
const label=process.argv[2]??'baseline',out='reports/l11-access-fixes',plan=l11CityPlan(74911,0,0,'highrise')
const buildings=plan.buildings.filter(b=>b.district==='highrise').slice(0,12),runs=[],optimized=CityBatch.prototype.quad
for(let pass=0;pass<(label==='paired'?8:4);pass++){
  const variant=label==='paired'&&pass%2===0?'baseline':'optimized'
  if(label==='paired')CityBatch.prototype.quad=variant==='baseline'?oldQuad:optimized
  const hash=createHash('sha256'),start=performance.now();let triangles=0
  for(const b of buildings){const root=buildL11Structure({kind:'l11building',x:b.x,y:b.y,w:b.w,h:b.h,solid:true,l11:b})!
    root.traverse(o=>{const g=(o as THREE.Mesh).geometry;if(!g)return;for(const key of ['position','normal','uv']){const a=g.getAttribute(key).array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength))}if(g.index){const a=g.index.array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength))}triangles+=(g.index?.count??g.attributes.position.count)/3;g.dispose()})
  }
  runs.push({pass,variant,ms:performance.now()-start,triangles,hash:hash.digest('hex')})
}
mkdirSync(out,{recursive:true});writeFileSync(`${out}/mesh-${label}.json`,JSON.stringify({label,buildings:buildings.length,runs},null,2));console.log(JSON.stringify(runs))
