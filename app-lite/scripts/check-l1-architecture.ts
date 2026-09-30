import assert from 'node:assert/strict'
import { genL1ChunkRaw } from '../src/game/world/infiniteL1'
import { L1 } from '../src/game/levels/l1'
import { L1_PROFILES, l1VaultHeight } from '../src/game/world/l1Architecture'
import { l1District, l1LayoutVariant, l1Outpost, l1Transition, l1DistanceScale } from '../src/game/world/l1Layout'
import { l1CrateHidden, newL1Dynamics, rememberL1Container, restoreL1Container } from '../src/game/world/l1Dynamics'
import { l1Puddles } from '../src/game/world/l1Puddles'
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

  for (const s of a.structures.filter(s => s.data?.l1Column !== undefined)) {
    const tx = Math.floor(s.x - cx * 32), ty = Math.floor(s.y - cy * 32)
    assert.equal(a.tiles[ty * 32 + tx], 1, `column on floor ${seed}:${variant}:${cx},${cy}`)
    const overlaps = (x: number, y: number, w = 0, h = 0) => s.x < x + w && s.x + s.w > x && s.y < y + h && s.y + s.h > y
    assert(!a.structures.some(t => t !== s && t.data?.sid !== undefined && overlaps(t.x, t.y, t.w, t.h)), 'column overlaps sid structure')
    for (const q of [...a.exits, ...a.items, ...a.entities, ...(a.npcs ?? [])]) assert(!overlaps(q.x, q.y, 1, 1), 'column overlaps gameplay object')
  }
  for (const light of a.lights) {
    if (light.fixZ !== undefined) assert(light.fixZ <= profile.height, `light above roof ${seed}:${variant}:${cx},${cy}`)
    if (variant === 'garden' || variant === 'ouroboros') assert.equal(light.keep, 1, `persistent light ${seed}:${variant}:${cx},${cy}`)
  }
}

for (const [variant, height] of Object.entries({ parking: 3.6, storage: 6.4, gothic: 3.8, ouroboros: 4.8, garden: 6.4 })) assert.equal(L1_PROFILES[variant as keyof typeof L1_PROFILES].height, height)
assert.equal(l1VaultHeight(4.5, 4.5), 1.92)
assert.equal(l1VaultHeight(7, 7), 3.8)
for (const [x, z] of [[-12.5, -7.5], [-2.5, 2.5], [2.5, -2.5], [7.5, 12.5]]) assert.equal(l1VaultHeight(x, z), l1VaultHeight(x + 5, z + 5), 'gothic vault period')
assert(Math.abs(l1VaultHeight(4.5 - 1e-6, 4.5) - l1VaultHeight(4.5 + 1e-6, 4.5)) < 1e-3, 'gothic vault continuity')

for (const seed of seeds) for (let cy=-5;cy<=5;cy++) for (let cx=-5;cx<=5;cx++) {
  const ps=l1Puddles(seed,cx,cy); assert(ps.length<=4); assert.deepEqual(ps,l1Puddles(seed,cx,cy))
  const v=l1LayoutVariant(seed,cx,cy), t=l1Transition(seed,cx,cy)
  if(v==='aisle') assert(t&&t.a!==t.b, 'aisle transition')
  const d=l1District(seed,cx,cy), out=l1Outpost(seed,cx,cy)
  if(out) assert(['parking','storage','gothic'].includes(d.variant), 'outpost variant')
}
for(const seed of seeds) for(let gy=-2;gy<=2;gy++) for(let gx=-2;gx<=2;gx++) {
  const v=l1District(seed,gx*16,gy*16).variant
  const compact=v==='garden'||v==='ouroboros',r=compact?1:4
  for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++) assert.equal(l1District(seed,gx*16+x,gy*16+y).variant,v)
  if(compact){
    const cells=new Set<string>()
    for(let y=-16;y<=16;y++)for(let x=-16;x<=16;x++)if(l1District(seed,gx*16+x,gy*16+y).key===`${gx},${gy}`)cells.add(`${x},${y}`)
    assert(cells.size>=48&&cells.size<166,`compact district remains large but below 65% of old area: ${cells.size}`)
    const reached=new Set(['0,0']),queue=[[0,0]]
    for(const [x,y] of queue)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const k=`${x+dx},${y+dy}`
      if(cells.has(k)&&!reached.has(k)){reached.add(k);queue.push([x+dx,y+dy])}
    }
    assert.equal(reached.size,cells.size,'compact district is one connected cluster')
  }
}
for(const seed of seeds){
  for(let y=-5;y<=5;y++)for(let x=-5;x<=5;x++)assert.equal(l1LayoutVariant(seed,x,y),'parking','starting 11x11 parking cluster retained')
  let nearest=Infinity
  for(let y=-6;y<=6;y++)for(let x=-6;x<=6;x++)if(l1Outpost(seed,x,y)){
    nearest=Math.min(nearest,Math.hypot(x*32+20.5-15.5,y*32+20.5-15.5))
    const core=l1District(seed,x,y).key
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)assert.equal(l1District(seed,x+dx,y+dy).key,core,'starting base remains in district interior')
  }
  assert(nearest>=125&&nearest<150,'first landmark lies 125–150 m from spawn')
  assert(!genL1ChunkRaw(L1,seed,0,0).structures.some(s=>s.kind==='landmark'),'no base in spawn chunk')
  assert(genL1ChunkRaw(L1,seed,3,3).structures.some(s=>s.kind==='landmark'&&s.data?.outpost==='alpha'),'starting Alpha at its new anchor')
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
assert(scales.every(v=>v>=.28-1e-9&&v<=2.4+1e-9));assert(scales.some(v=>v<.6)&&scales.some(v=>v>1.8));assert.equal(l1DistanceScale(1,0,0),1)
console.log('L1 architecture / districts / anomaly / crate persistence / puddle checks passed')
