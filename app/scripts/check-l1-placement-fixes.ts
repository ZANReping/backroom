import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import * as THREE from 'three'
import {genL1ChunkRaw} from '../src/game/world/infiniteL1'
import {L1} from '../src/game/levels/l1'
import {buildL1Data,l1BuildingRoof,l1ModuleAt} from '../src/game/world/l1Building'
import {l1PlanRegions,l1PlanTile} from '../src/game/world/l1Plan'
import {l1OutpostSite,l1OutpostSites} from '../src/game/world/l1OutpostSites'
import {l1RegionOutpost} from '../src/game/world/l1Layout'
import {l1WallMounts,L1_WALL_NORMALS} from '../src/game/world/l1WallFixtures'
import {l1FindReference,L1_SHOWCASE_SEED} from '../src/game/world/l1Spatial'
import {regionHost} from '../src/game/world/infinite'
import {layoutL1BakeCharts} from '../src/game/world/l1Bake'
import {buildL1OutpostEntrance,type L1OutpostOrg} from '../src/game/renderer/l1OutpostEntrance'

let checks=0;const counts={chunks:0,columns:0,wallColumns:0,exits:0,wallProps:0,outposts:0},cases:Record<string,unknown>={}
function ok(value:unknown,message:string){assert(value,message);checks++}
const overlap=(b:any,x:number,z:number,r=.2)=>b.solid&&b.min[1]<1.8&&b.max[1]>.05&&x+r>b.min[0]&&x-r<b.max[0]&&z+r>b.min[2]&&z-r<b.max[2]
for(const seed of [20261006,7,424242]){
 for(let cy=-7;cy<=7;cy++)for(let cx=-7;cx<=7;cx++){
  const c=genL1ChunkRaw(L1,seed,cx,cy),a=c.l1!;counts.chunks++
  ok(!c.structures.some(s=>s.kind==='pillar'&&!s.data?.l1Static&&!s.data?.l1Prop),'no retired random pillars')
  for(const b of a.boxes.filter(b=>b.style==='gothic'&&b.id.startsWith('column:'))){
   const x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2
   ok(Math.abs(b.max[1]-l1BuildingRoof(seed,x,z,true))<1e-6,`shaft meets vault ${seed}:${x},${z}`);counts.columns++
   if(![-.65,0,.65].every(dx=>[-.65,0,.65].every(dz=>l1PlanTile(seed,x+dx,z+dz).floor)))counts.wallColumns++
   if(seed===L1_SHOWCASE_SEED&&![-.65,0,.65].every(dx=>[-.65,0,.65].every(dz=>l1PlanTile(seed,x+dx,z+dz).floor))&&(!cases.wallColumn||Math.hypot(x,z)<Math.hypot((cases.wallColumn as any).x,(cases.wallColumn as any).z)))cases.wallColumn={seed,cx,cy,x,z}
  }
  const mounts=l1WallMounts(a)
  for(const s of c.structures.filter(s=>typeof s.data?.l1WallDir==='number'&&!s.data?.l1Entrance)){
   ok(mounts.some(p=>p.x===s.x&&p.z===s.y&&p.dir===s.data!.l1WallDir),'wall dressing has a real full-height mounting face');counts.wallProps++
  }
  for(const e of c.exits){
   ok(e.x===a.exit?.x&&e.y===a.exit?.z&&e.l1?.wallDir===a.exit?.dir,'exit keeps its carved frame after fitting');counts.exits++
  }
 }
 for(let ry=-3;ry<=3;ry++)for(let rx=-3;rx<=3;rx++){
  const host=regionHost(seed,rx,ry),c=genL1ChunkRaw(L1,seed,host.cx,host.cy),a=c.l1!,p=a.exit!
  ok(c.exits.length===1&&!!p,`one accessible exit per guaranteed host ${seed}:${rx},${ry}`)
  const [dx,dz]=L1_WALL_NORMALS[p.dir],x=p.x+.5,z=p.z+.5
  ok(!a.boxes.some(b=>overlap(b,x,z)),'portal approach clears the player body')
  ok(!a.boxes.some(b=>overlap(b,x+dx,z+dz,.36)),'no original solid wall covers the portal')
  ok(c.exits[0].def.dest===2,'both exits retain their Level 2 destination')
  if(seed===L1_SHOWCASE_SEED&&(!cases[p.kind]||Math.hypot(p.x,p.z)<Math.hypot((cases[p.kind] as any).x,(cases[p.kind] as any).z)))cases[p.kind]={seed,...host,...p}
  if(p.kind==='stairs'&&!cases.stairCharts){
   const f=layoutL1BakeCharts(a,'low').faces
   ok(!f.some(f=>f.surface==='floor'&&f.p.every(v=>v[1]===0)&&x+dx>Math.min(...f.p.map(v=>v[0]))&&x+dx<Math.max(...f.p.map(v=>v[0]))&&z+dz>Math.min(...f.p.map(v=>v[2]))&&z+dz<Math.max(...f.p.map(v=>v[2]))),'floor does not cover descending steps');cases.stairCharts=true
  }
 }
 const regs=l1PlanRegions(seed,-1100,-1100,1100,1100),orgs=new Set<string>()
 for(const r of regs){
  const org=l1RegionOutpost(seed,r);if(!org)continue
  const p=l1OutpostSite(seed,r);ok(!!p,`quota has a usable exterior shutter ${seed}:${r.id}`);if(!p)continue
  const x=p.x+.5,z=p.z+.5,[dx,dz]=L1_WALL_NORMALS[p.dir],tile=l1PlanTile(seed,x,z),wall=l1PlanTile(seed,x+dx,z+dz)
  ok(tile.floor&&tile.style==='maintenance'&&!tile.room,'entrance stands in the path, outside rooms')
  ok(!wall.floor&&wall.region?.id===r.id,'entrance backs onto its own hall boundary')
  const owner={cx:Math.floor(x/32),cy:Math.floor(z/32)},sites=l1OutpostSites(seed,owner.cx*32,owner.cy*32,owner.cx*32+32,owner.cy*32+32)
  ok(sites.filter(q=>q.id===p.id).length===1,'one owning chunk per shutter')
  const c=genL1ChunkRaw(L1,seed,owner.cx,owner.cy)
  ok(c.structures.filter(s=>s.data?.l1EntranceId===p.id&&s.x===p.x&&s.y===p.z).length===1,'actual content emits the shutter in its new owner')
  counts.outposts++;orgs.add(org);if(seed===L1_SHOWCASE_SEED&&(!cases[org]||Math.hypot(p.x,p.z)<Math.hypot((cases[org] as any).x,(cases[org] as any).z)))cases[org]={seed,...owner,...p}
 }
 cases[`orgs:${seed}`]=[...orgs]
}
const ref=l1FindReference(L1_SHOWCASE_SEED,'gothic')!;cases.gothic=ref
const hall=l1PlanTile(L1_SHOWCASE_SEED,ref.centerX,ref.centerY).region!
for(let cy=Math.floor(hall.iy0/32);cy<=Math.floor(hall.iy1/32);cy++)for(let cx=Math.floor(hall.ix0/32);cx<=Math.floor(hall.ix1/32);cx++){
 if(cx>Math.floor(hall.ix0/32)&&cx<Math.floor(hall.ix1/32)&&cy>Math.floor(hall.iy0/32)&&cy<Math.floor(hall.iy1/32))continue
 const a=buildL1Data(L1_SHOWCASE_SEED,cx,cy)
 for(const b of a.boxes.filter(b=>b.style==='gothic'&&b.id.startsWith('column:'))){
  const x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2
  if(![-.6,0,.6].every(dx=>[-.6,0,.6].every(dz=>l1PlanTile(L1_SHOWCASE_SEED,x+dx,z+dz).floor))&&(!cases.wallColumn||Math.hypot(x-ref.x,z-ref.y)<Math.hypot((cases.wallColumn as any).x-ref.x,(cases.wallColumn as any).z-ref.y)))cases.wallColumn={seed:L1_SHOWCASE_SEED,cx,cy,x,z}
 }
}
ok(!!cases.wallColumn,'reference hall includes an exposed engaged column')
for(const dx of [-58,-56.1,-55.9,0,55.9,56.1,58]){
 const x=ref.centerX+dx,z=ref.centerY
 if(l1PlanTile(L1_SHOWCASE_SEED,x,z).style!=='gothic')continue
 const p=l1ModuleAt(L1_SHOWCASE_SEED,x,z),base=l1ModuleAt(L1_SHOWCASE_SEED,ref.centerX,ref.centerY)
 ok(p.phaseX===base.phaseX&&p.phaseZ===base.phaseZ&&p.springHeight===base.springHeight,'photographic bay edge cannot change the gothic structural grid')
}
for(const org of ['alpha','tom','bntg','ariane','cornucopia'] as L1OutpostOrg[]){
 const g=buildL1OutpostEntrance(org),a=new THREE.Box3().setFromObject(g),size=a.getSize(new THREE.Vector3())
 ok(size.x<=1.95&&size.y<=2.51&&a.min.y>=-.001,'shutter fits a real two-metre path and ceiling')
 ok(g.children.filter(o=>o instanceof THREE.Mesh).length<=4,'shutter batches are bounded')
 g.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}})
}
ok(counts.columns>200&&counts.wallColumns>0,'includes engaged gothic columns')
ok(counts.wallProps>100&&counts.outposts>10,'wall decoration and settlement coverage')
const coordinates=[[-2,-4],[6,5],[2,-7],[-6,1]]
const order=coordinates.map(([x,z])=>JSON.stringify(genL1ChunkRaw(L1,7,x,z)))
coordinates.toReversed().forEach(([x,z],i)=>ok(JSON.stringify(genL1ChunkRaw(L1,7,x,z))===order[order.length-1-i],'negative coordinates and load order deterministic'))
mkdirSync('reports/l1-placement-fixes',{recursive:true});writeFileSync('reports/l1-placement-fixes/static.json',JSON.stringify({checks,counts,cases},null,2))
console.log(JSON.stringify({checks,counts,cases},null,2))
