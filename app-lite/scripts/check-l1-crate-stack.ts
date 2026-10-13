import assert from 'node:assert/strict'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
import {buildL1Prop} from '../src/game/renderer/l1Props'
import {disposeL1Owned} from '../src/game/renderer/l1Materials'
import {L1_CRATE,l1CrateCount} from '../src/game/world/l1Crate'
import {structColliders} from '../src/game/world/mapgen'
import {genL1ChunkRaw} from '../src/game/world/infiniteL1'
import {L1} from '../src/game/levels/l1'
import {L1_PHOTO_ANCHORS,L1_SHOWCASE_SEED} from '../src/game/world/l1Spatial'

Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128),createElementNS:()=>({})}})
const anchor=L1_PHOTO_ANCHORS.find(a=>a.id==='crate')!,cx=Math.floor(anchor.centerX/32),cy=Math.floor(anchor.centerY/32)
const make=()=>genL1ChunkRaw(L1,L1_SHOWCASE_SEED,cx,cy).structures.filter(s=>s.data?.l1Number===1&&s.data?.l1UpperNumber===11)
const first=make(),second=make();assert.equal(first.length,1,'one consignment, not two regenerated loot containers')
const a=first[0],b=second[0]
assert.equal(a.data?.sid,((cx&255)<<24)|((cy&255)<<16)|(250<<4)|1,'original persistent identity');assert.equal(a.data?.loot,1)
assert.equal(a.x+a.w/2,anchor.centerX+.5);assert.equal(a.y+a.h/2,anchor.centerY-.5)
for(const seed of [1,42,7391])for(let x=-3;x<=3;x++)for(let y=-3;y<=3;y++){
 const stacks=()=>genL1ChunkRaw(L1,seed,x,y).structures.filter(s=>s.data?.l1Crate).map(s=>({x:s.x,y:s.y,w:s.w,h:s.h,data:s.data}))
 assert.deepEqual(stacks(),stacks(),`generated stack identities ${seed}:${x},${y}`)
}
assert.equal(l1CrateCount(a),2); assert.deepEqual(a.data,b.data,'same seed stack content')
const ga=buildL1Prop(a)!,gb=buildL1Prop(b)!; assert(ga&&gb)
const measure=(g:THREE.Group)=>{g.updateMatrixWorld(true);let tris=0,meshes=0;g.traverse(o=>{const m=o as THREE.Mesh;if(!m.geometry)return;meshes++;const p=m.geometry.attributes.position;const uv=m.geometry.attributes.uv;assert(uv&&Array.from(uv.array).every(Number.isFinite));assert(Array.from(p.array).every(Number.isFinite));tris+=(m.geometry.index?.count??p.count)/3});return {box:new THREE.Box3().setFromObject(g),tris,meshes}}
const ma=measure(ga),mb=measure(gb)
for(const m of [ma,mb]){assert(m.tris<=700);assert(m.meshes<=3);assert(Math.abs(m.box.max.x-m.box.min.x-L1_CRATE.width)<1e-6);assert(Math.abs(m.box.max.z-m.box.min.z-L1_CRATE.depth)<1e-6);assert(Math.abs(m.box.max.y-m.box.min.y-L1_CRATE.height*2)<1e-6)}
const ca=structColliders(a); assert(ca.length>0,'crate collider fallback'); const c=ca[0]; assert(Math.abs((c.x1-c.x0)-a.w)<1e-6&&Math.abs((c.y1-c.y0)-a.h)<1e-6,'crate collider footprint')
const ag:THREE.BufferGeometry[]=[];const am:THREE.Material[]=[];const bg:THREE.BufferGeometry[]=[];const bm:THREE.Material[]=[];ga.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry){ag.push(m.geometry);am.push(...(Array.isArray(m.material)?m.material:[m.material]))}});gb.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry){bg.push(m.geometry);bm.push(...(Array.isArray(m.material)?m.material:[m.material]))}})
assert(ag.every(g=>!bg.includes(g)));assert(am.every(m=>!bm.includes(m)))
const disposedB=new Set<THREE.BufferGeometry>();for(const g of bg)g.addEventListener('dispose',()=>disposedB.add(g));ga.traverse(disposeL1Owned);ag.forEach(g=>g.dispose());assert.equal(disposedB.size,0)
gb.traverse(disposeL1Owned);bg.forEach(g=>g.dispose())
console.log('L1 crate stack checks passed')
