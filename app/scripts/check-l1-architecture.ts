import assert from 'node:assert/strict'
import { genL1ChunkRaw } from '../src/game/world/infiniteL1'
import { L1 } from '../src/game/levels/l1'
import { L1_PROFILES, l1VaultHeight } from '../src/game/world/l1Architecture'
import { l1District, l1LayoutVariant, l1Outpost, l1Transition, l1DistanceScale } from '../src/game/world/l1Layout'
import { l1CrateHidden, newL1Dynamics, rememberL1Container, restoreL1Container } from '../src/game/world/l1Dynamics'
import { l1Puddles, l1PuddleContains } from '../src/game/world/l1Puddles'
import { L1_SHOWCASE_SEED, l1FindReference, l1ReferenceAt, l1SkylightAt } from '../src/game/world/l1Spatial'
import {l1PlanRegions,l1RegionAt,l1PlanTile} from '../src/game/world/l1Plan'
import {l1OutpostSite} from '../src/game/world/l1OutpostSites'
import * as THREE from 'three'
import { buildL1RoofClosure } from '../src/game/renderer/l1RoofGeometry'
import type { GameMap } from '../src/game/world/mapgen'

const seeds = [1, 42, 424242]
const variants = ['parking', 'storage', 'gothic', 'ouroboros', 'garden', 'maintenance'] as const
const coords = [[0, 0], [5, 7], [-3, -2]] as const
for (const seed of seeds) for (const variant of variants) for (const [cx, cy] of coords) {
  const a = genL1ChunkRaw(L1, seed, cx, cy, variant)
  const b = genL1ChunkRaw(L1, seed, cx, cy, variant)
  assert.deepEqual(a, b, `determinism ${seed}:${variant}:${cx},${cy}`)
  const profile = L1_PROFILES[variant]
  assert.equal(profile.height, ({ parking: 3.6, storage: 6.4, gothic: 3.8, ouroboros: 4.8, garden: 6.4, maintenance: 3.6 } as const)[variant])
  assert.equal(a.l1?.version, 4, `L1 architecture version ${seed}:${variant}:${cx},${cy}`)
  for (const b of a.l1?.boxes ?? []) for (const v of [...b.min, ...b.max]) assert(Number.isFinite(v), 'non-finite L1 box geometry')
  for (const e of a.l1?.emitters ?? []) for (const v of [...e.position, ...e.normal, ...e.tangent, e.width, e.height, e.power, e.range]) assert(Number.isFinite(v), 'non-finite L1 light geometry')

  for (const s of a.structures.filter(s => s.data?.l1Column !== undefined)) {
    const tx = Math.floor(s.x + s.w / 2 - cx * 32), ty = Math.floor(s.y + s.h / 2 - cy * 32)
    if(variant==='gothic')assert([-.49,0,.49].some(dx=>[-.49,0,.49].some(dy=>{const x=Math.floor(s.x+s.w/2+dx-cx*32),y=Math.floor(s.y+s.h/2+dy-cy*32);return x>=0&&x<32&&y>=0&&y<32&&a.tiles[y*32+x]===1})),`engaged column exposes a shaft to hall floor ${seed}:${cx},${cy}`)
    else assert.equal(a.tiles[ty * 32 + tx], 1, `column on floor ${seed}:${variant}:${cx},${cy}`)
    const overlaps = (x: number, y: number, w = 0, h = 0) => s.x < x + w && s.x + s.w > x && s.y < y + h && s.y + s.h > y
    assert(!a.structures.some(t => t !== s && t.data?.sid !== undefined && overlaps(t.x, t.y, t.w, t.h)), 'column overlaps sid structure')
    for (const q of [...a.exits, ...a.items, ...a.entities, ...(a.npcs ?? [])]) assert(!overlaps(q.x - .17, q.y - .17, .34, .34), 'column overlaps gameplay object')
  }
  for (const [i, light] of a.lights.entries()) {
    const emitter=a.l1?.emitters[i]
    if (emitter) { assert.equal(light.fixZ, emitter.position[1] + .2); assert.equal(light.r, emitter.range / 2.6) }
    if (emitter?.kind === 'emergency') { assert.equal(light.keep, 1); assert(emitter.color[1] > emitter.color[0]) }
  }
}

for (const [variant, height] of Object.entries({ parking: 3.6, storage: 6.4, gothic: 3.8, ouroboros: 4.8, garden: 6.4 })) assert.equal(L1_PROFILES[variant as keyof typeof L1_PROFILES].height, height)
assert.equal(l1VaultHeight(4.5, 4.5), 1.92)
assert.equal(l1VaultHeight(7, 7), 3.8)
for (const [x, z] of [[-12.5, -7.5], [-2.5, 2.5], [2.5, -2.5], [7.5, 12.5]]) assert.equal(l1VaultHeight(x, z), l1VaultHeight(x + 5, z + 5), 'gothic vault period')
assert(Math.abs(l1VaultHeight(4.5 - 1e-6, 4.5) - l1VaultHeight(4.5 + 1e-6, 4.5)) < 1e-3, 'gothic vault continuity')

for (const seed of seeds) for (let cy=-5;cy<=5;cy++) for (let cx=-5;cx<=5;cx++) {
  const ps=l1Puddles(seed,cx,cy); assert(ps.length<=40); assert.deepEqual(ps,l1Puddles(seed,cx,cy)); for(const p of ps){assert(Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.rx)&&Number.isFinite(p.ry));assert(p.rx>0&&p.ry>0)}
  const v=l1LayoutVariant(seed,cx,cy), t=l1Transition(seed,cx,cy)
  if(v==='aisle') assert(t&&t.a!==t.b, 'aisle transition')
  const d=l1District(seed,cx,cy), out=l1Outpost(seed,cx,cy)
  if(out) assert(['parking','storage','gothic'].includes(d.variant), 'outpost variant')
}
// v2 halls are BSP rectangles, with path belts replacing the old 16-chunk districts.
for(const seed of seeds)for(const r of l1PlanRegions(seed,-960,-960,960,960)){
  for(const [x,y] of [[r.ix0+1,r.iy0+1],[r.ix1-1,r.iy1-1],[(r.ix0+r.ix1)/2,(r.iy0+r.iy1)/2]]){
    assert.equal(l1RegionAt(seed,x,y)?.id,r.id,'hall keeps one region identity')
    assert.equal(l1PlanTile(seed,x,y).style,r.section,'hall section is continuous')
  }
}
for(const seed of seeds){
  const spawn=l1RegionAt(seed,15,15)!;assert.equal(spawn.section,'parking')
  assert(Math.min(15-spawn.ix0,spawn.ix1-15,15-spawn.iy0,spawn.iy1-15)>=18,'arrival clearance')
  const bases=[]
  for(let y=-7;y<=7;y++)for(let x=-7;x<=7;x++)if(l1Outpost(seed,x,y)==='alpha'&&l1RegionAt(seed,x*32+16,y*32+16)?.id===spawn.id)bases.push({x,y})
  assert.equal(bases.length,1,'one Alpha landmark in the arrival hall')
  const base=bases[0]
  assert(Math.hypot(base.x*32+20.5-15.5,base.y*32+20.5-15.5)<300,'arrival landmark remains nearby')
  assert(!genL1ChunkRaw(L1,seed,0,0).structures.some(s=>s.kind==='landmark'&&Math.hypot(s.x-15.5,s.y-15.5)<12),'arrival stays clear of entrance structures')
  const site=l1OutpostSite(seed,spawn)!;assert(site,'arrival hall has a path-wall entrance')
  assert(genL1ChunkRaw(L1,seed,Math.floor((site.x+.5)/32),Math.floor((site.z+.5)/32)).structures.some(s=>s.kind==='landmark'&&s.data?.outpost==='alpha'&&s.data.l1EntranceId===site.id),'Alpha entrance survives actual placement in its exterior-wall owner')
}

// Real mesh raycasts: front-facing fascia from both directions and a visible back above the low roof.
for(const low of ['maintenance','parking','gothic','ouroboros'] as const)for(const axis of ['x','z'] as const)for(const reverse of [false,true]){
  const n=64,blank=()=>new Uint8Array(n*n)
  const chunks=new Map()
  for(let cy=0;cy<2;cy++)for(let cx=0;cx<2;cx++)chunks.set(`${cx},${cy}`,{variant:((axis==='x'?cx:cy)===0)!==reverse?low:'storage',structures:[]})
  const m={w:n,h:n,tiles:new Uint8Array(n*n).fill(1),outdoor:blank(),up:blank(),up2:blank(),lights:[],structures:[],l1Architecture:true,inf:{ox:0,oy:0,seed:1,chunks}} as unknown as GameMap
  const geo=buildL1RoofClosure(m,{x0:0,y0:0,x1:n,y1:n},3.6)!
  const mat=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geo,mat)
  const h=(L1_PROFILES[low].height+6.4)/2
  for(const sign of [-1,1]){
    const origin=axis==='x'?new THREE.Vector3(32+sign*4,h,16.5):new THREE.Vector3(16.5,h,32+sign*4)
    const dir=axis==='x'?new THREE.Vector3(-sign,0,0):new THREE.Vector3(0,0,-sign)
    assert(new THREE.Raycaster(origin,dir,0,8).intersectObject(mesh).length>0,`closed ${low} ${axis} boundary from ${sign}`)
  }
  const pos=reverse?48.5:16.5
  const origin=axis==='x'?new THREE.Vector3(pos,5.5,16.5):new THREE.Vector3(16.5,5.5,pos)
  assert(new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,4).intersectObject(mesh).length>0,'low ceiling has an upper face')
  geo.dispose();mat.dispose()
}
for(const seed of seeds) {
  const all=[...Array(100)].map((_,i)=>l1Puddles(seed,i-50,-i+25).length)
  assert(all.some(n=>n===0)&&all.some(n=>n>0), 'puddle empty/occupied spread')
  for(const variant of ['parking','storage','gothic','ouroboros','garden','maintenance','aisle'] as const) {
    const a=genL1ChunkRaw(L1,seed,0,0,variant)
    assert(!a.structures.some(s=>s.kind==='car'), 'no car structures')
    if(variant==='maintenance'||variant==='aisle')assert(a.structures.filter(s=>s.data?.loot!==undefined).length<=1)
  }
}
let appeared=0,vanished=0
for(let i=0;i<100;i++){const a=l1CrateHidden(1,0,i,-i),b=l1CrateHidden(1,1,i,-i);if(a&&!b)appeared++;if(!a&&b)vanished++}
assert(appeared>0&&vanished>0)
const dyn=newL1Dynamics(),original:import('../src/game/core/types').Structure={kind:'crate',x:1,y:2,w:1,h:1,solid:true,looted:true,data:{sid:17,l1Crate:1,lootItems:[],searched:1}}
rememberL1Container(dyn,0,0,original);dyn.epoch=99
const fresh:import('../src/game/core/types').Structure={kind:'crate',x:1,y:2,w:1,h:1,solid:true,data:{sid:17,l1Crate:1}}
restoreL1Container(dyn,1,0,0,fresh,0,0)
assert.deepEqual(fresh.data?.lootItems,[]);assert.equal(fresh.looted,true)
const scales:number[]=[]
for(const seed of seeds)for(let cx=-40;cx<=40;cx++)for(let cy=-40;cy<=40;cy++)scales.push(l1DistanceScale(seed,cx*32+16,cy*32+16))
assert(scales.every(v=>v>=.72-1e-9&&v<=1.35+1e-9));assert(scales.some(v=>v<.95)&&scales.some(v=>v>1.1))
assert(scales.some(v=>v>=.72&&v<.95)&&scales.some(v=>v>1.1&&v<=1.35),'anomaly distance range sampled')
for(const id of ['parking-common','parking-round','storage','gothic','garden','ouroboros','power-out']){
  const a=l1FindReference(L1_SHOWCASE_SEED,id,2400);assert(a,`generated reference bay ${id}`)
  assert.equal(l1ReferenceAt(L1_SHOWCASE_SEED,a.centerX,a.centerY)?.id,id,'actual reference identity')
}
const puddleHitFrom=(seed:number,cx:number,cy:number,x:number,y:number)=>l1Puddles(seed,cx,cy).some(p=>l1PuddleContains(p,x,y))
let puddleTrue=0,puddleFalse=0
for(const seed of [1,42,L1_SHOWCASE_SEED])for(const [x,y] of [[31.99,12.5],[32.01,12.5],[-32.01,-12.5],[-31.99,-12.5],[63.99,-24.01],[-64.01,24.01]] as const){
  const cx=Math.floor(x/32),cy=Math.floor(y/32),a=puddleHitFrom(seed,cx,cy,x,y),b=puddleHitFrom(seed,cx+(x>=0?1:-1),cy,x,y)
  assert.equal(a,b,`puddle shared query at ${seed}:${x},${y}`); if(a)puddleTrue++;else puddleFalse++
}
assert(puddleTrue>0&&puddleFalse>0,'puddle shared query samples true and false')
for(const [x,y] of [[3,3],[11,3],[-5,-5],[-13,-5]] as const){ assert.equal(l1SkylightAt(x,y),l1SkylightAt(x+8,y),`skylight x period ${x},${y}`); assert.equal(l1SkylightAt(x,y),l1SkylightAt(x,y+8),`skylight y period ${x},${y}`) }
assert.equal(l1SkylightAt(3,3),l1SkylightAt(-5,-5),'skylight signed period')
console.log('L1 architecture / districts / anomaly / crate persistence / puddle checks passed')
