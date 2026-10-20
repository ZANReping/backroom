import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import { L1 } from '../src/game/levels/l1'
import { genL1ChunkRaw } from '../src/game/world/infiniteL1'
import { l1RoomDressing,l1HallDressing } from '../src/game/world/l1Dressing'
import {buildL1Data} from '../src/game/world/l1Building'
import { l1FindReference } from '../src/game/world/l1Spatial'
import { l1PlanRooms,type L1RoomType } from '../src/game/world/l1Plan'
import { buildL1Prop } from '../src/game/renderer/l1Props'
import {disposeL1Owned} from '../src/game/renderer/l1Materials'
Object.defineProperty(globalThis, 'document', { value: { createElement: () => createCanvas(128, 128), createElementNS: () => ({}) } })

const samples:[number,number,number][]=[]
const seen=new Set<L1RoomType>()
for(const seed of [1,42,7391,20261006])for(let cy=-12;cy<=12;cy++)for(let cx=-12;cx<=12;cx++){
  const rooms=l1PlanRooms(seed,cx*32,cy*32,cx*32+32,cy*32+32).filter(r=>Math.floor((r.x0+r.x1)/2/32)===cx&&Math.floor((r.y0+r.y1)/2/32)===cy)
  for(const r of rooms){if(['office','sickbay','rubber','gallery','mattress'].includes(r.type)){seen.add(r.type);samples.push([seed,cx,cy] as [number,number,number])}}
}
for(const type of ['office','sickbay','rubber','gallery','mattress'] as const)assert(seen.has(type),`room type sampled: ${type}`)
const selected:[number,number,number][]=[]
const sickbayKinds=new Set<string>()
for(const type of ['office','sickbay','rubber','gallery','mattress'] as const){
  const candidates=samples.filter(([seed,cx,cy])=>l1PlanRooms(seed,cx*32,cy*32,cx*32+32,cy*32+32).some(r=>r.type===type&&Math.floor((r.x0+r.x1)/2/32)===cx&&Math.floor((r.y0+r.y1)/2/32)===cy))
  selected.push(...[candidates.find(s=>s[1]<0),candidates.find(s=>s[1]>=0),...candidates].filter((s,i,a):s is [number,number,number]=>!!s&&a.findIndex(t=>t[0]===s[0]&&t[1]===s[1]&&t[2]===s[2])===i).slice(0,2))
}
for(const [seed,cx,cy] of selected){
  const rooms=l1PlanRooms(seed,cx*32,cy*32,cx*32+32,cy*32+32).filter(r=>Math.floor((r.x0+r.x1)/2/32)===cx&&Math.floor((r.y0+r.y1)/2/32)===cy)
  const roomById=new Map(rooms.map(r=>[r.id,r])); const expected=l1RoomDressing(seed,cx,cy)
  for(const s of expected){const r=roomById.get(String(s.data?.l1Room));assert(r,`dressing room id ${s.data?.l1Room} exists`);assert(s.x>=r.x0&&s.x<r.x1&&s.y>=r.y0&&s.y<r.y1,`dressing coordinate in room ${r.id}`)}
  const chunk=genL1ChunkRaw(L1,seed,cx,cy),raw=chunk.structures.filter(s=>s.data?.l1RoomDressing)
  assert.equal(raw.length,expected.length,`dressing count ${seed}:${cx},${cy}`)
  for(const [actual,want] of raw.map((s,i)=>[s,expected[i]] as const)){assert.equal(actual.kind,want.kind);assert.equal(actual.data?.l1Room,want.data?.l1Room);assert.equal(actual.data?.l1RoomDressing,1);assert.equal(actual.w, want.w);assert.equal(actual.h,want.h);assert.equal(actual.solid,want.solid)}
  for(const s of raw){const r=roomById.get(String(s.data?.l1Room));assert(r,`raw dressing room id ${s.data?.l1Room} exists`);assert(s.x>=r.x0&&s.x+s.w<=r.x1&&s.y>=r.y0&&s.y+s.h<=r.y1,`raw dressing footprint in room ${r.id}`);if(s.solid){for(let y=Math.floor(s.y);y<Math.ceil(s.y+s.h);y++)for(let x=Math.floor(s.x);x<Math.ceil(s.x+s.w);x++){const i=(y-cy*32)*32+(x-cx*32);assert.equal(chunk.tiles[i],1,`solid dressing on floor ${x},${y}`)}const hit=(chunk.l1?.boxes??[]).find(b=>b.solid&&b.min[1]<1.5&&b.max[1]>0&&s.x<b.max[0]&&s.x+s.w>b.min[0]&&s.y<b.max[2]&&s.y+s.h>b.min[2]);assert(!hit,`solid dressing intersects building ${r.id}: ${s.kind}@${s.x},${s.y} with ${hit?.style} [${hit?.min}]..[${hit?.max}]`)}}
  for(const r of rooms){const items=expected.filter(s=>s.data?.l1Room===r.id);if(r.type==='office'){assert(items.some(s=>s.kind==='desk'));assert(items.some(s=>s.kind==='officechair'))}if(r.type==='sickbay'){const barber=items.filter(s=>s.kind==='barberchair').length;if(barber){assert(barber>=1&&barber<=3);assert.equal(items.filter(s=>s.kind==='table').length,1);assert(!items.some(s=>s.kind==='bed'));sickbayKinds.add('barber')}else{assert.equal(items.filter(s=>s.kind==='table').length,3);assert(items.some(s=>s.kind==='bed'));sickbayKinds.add('bed')}}if(r.type==='rubber')assert(items.some(s=>s.kind==='officechair'));if(r.type==='gallery')assert.equal(items.filter(s=>s.kind==='photo').length,3);if(r.type==='mattress')assert(items.some(s=>s.kind==='bed'))}
}
assert.equal(sickbayKinds.size,2,'samples cover barberchair and bed sickbay variants')
for (const kind of ['airunit', 'paintcan']) {
  const a = buildL1Prop({ kind: 'pillar', x: 0, y: 0, w: 1, h: 1, solid: true, data: { l1Prop: kind } })!, b = buildL1Prop({ kind: 'pillar', x: 2, y: 2, w: 1, h: 1, solid: true, data: { l1Prop: kind } })!
  for (const g of [a, b]) { g.updateMatrixWorld(true); const box = new THREE.Box3().setFromObject(g); assert(box.min.y >= -.00001); let meshes = 0; g.traverse(o => { const m = o as THREE.Mesh; if (!m.geometry) return; meshes++; for (const k of ['position', 'uv']) assert(Array.from(m.geometry.getAttribute(k).array).every(Number.isFinite)) }); assert(meshes <= 3) }
  const geometryA=new Set<THREE.BufferGeometry>(),geometryB=new Set<THREE.BufferGeometry>(),materialA=new Set<THREE.Material>(),materialB=new Set<THREE.Material>()
  for(const [g,geos,mats]of [[a,geometryA,materialA],[b,geometryB,materialB]] as const)g.traverse(o=>{const m=o as THREE.Mesh;if(!m.geometry)return;geos.add(m.geometry);for(const mat of Array.isArray(m.material)?m.material:[m.material])mats.add(mat)})
  assert([...geometryA].every(g=>!geometryB.has(g)));assert([...materialA].every(m=>!materialB.has(m)))
  let releasedB=0;for(const resource of [...geometryB,...materialB])resource.addEventListener('dispose',()=>releasedB++)
  a.traverse(disposeL1Owned);for(const g of geometryA)g.dispose();assert.equal(releasedB,0)
  b.traverse(disposeL1Owned);for(const g of geometryB)g.dispose();assert.equal(releasedB,geometryB.size+materialB.size)
}
console.log('L1 room dressing checks passed')
const hallAnchor=l1FindReference(20261006,'parking-props',2400)!,hallCx=Math.floor(hallAnchor.centerX/32),hallCy=Math.floor(hallAnchor.centerY/32),architecture=buildL1Data(20261006,hallCx,hallCy),expectedHall=l1HallDressing(architecture),hall=genL1ChunkRaw(L1,20261006,hallCx,hallCy)
const actualHall=hall.structures.filter(s=>s.data?.l1HallDressing)
assert.equal(actualHall.length,7,'table, three chairs, two louvers, extinguisher survive completed architecture')
assert.deepEqual(actualHall,expectedHall,'authored hall dressing is not silently moved by legacy placement')
assert(architecture.emitters.some(e=>e.id.startsWith('bay-wall-lamp:')&&e.power>0),'rear-wall fixtures have real native emitters')
assert(!architecture.emitters.some(e=>e.id.includes('column:')&&e.power>0),'work bay foreground columns are not luminous')
console.log('L1 hall dressing checks passed')
