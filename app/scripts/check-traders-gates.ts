import assert from 'node:assert/strict'
import * as THREE from 'three'
import {ALL_LEVEL_DEFS,levelDefOf} from '../src/game/levels'
import {canSpawnNaturally,makeEntity} from '../src/game/entities'
import {generateLevel} from '../src/game/world/mapgen'
import {genL3ChunkRaw} from '../src/game/world/infiniteL3'
import {canOccupy} from '../src/game/core/player'
import {createTradersMap} from '../src/game/world/tradersWorld'
import {TRADERS_ENTRIES,TRADERS_ENTRY_WIDTH,TRADERS_ENTRY_HEIGHT,TRADERS_SERVICES} from '../src/game/content/tradersLayout'
import {buildTradersGate} from '../src/game/renderer/tradersGates'
import type {TradersAssets} from '../src/game/renderer/tradersMeshes'
assert(!canSpawnNaturally('arcwraith'))
assert(canSpawnNaturally('hound'))
assert.equal(makeEntity('arcwraith',4,5).def.type,'arcwraith','manual entity factory remains available')
assert(ALL_LEVEL_DEFS.every(l=>l.entities.every(e=>e.type!=='arcwraith')),'registered pools must not request natural arcwraiths')
const natural=[]
for(const seed of [23,424242,20261006]){
 const legacy={...levelDefOf(3)!,entities:[{type:'arcwraith',w:100,min:12,max:12},{type:'dryshrimp',w:1,min:2,max:2}]}
 const raw=genL3ChunkRaw(legacy,seed,4,4,'assembly')
 assert(raw.entities.some(e=>e.type==='arcwraith'),'fixture must exercise a stale generation result')
 const live=generateLevel(legacy,seed)
 assert(!live.entities.some(e=>e.def.type==='arcwraith'),'infinite world must reject cached/worker arcwraiths')
 const finite=generateLevel({...legacy,infinite:false,size:48},seed)
 assert(!finite.entities.some(e=>e.def.type==='arcwraith'),'finite world must reject natural arcwraiths')
 assert(finite.entities.some(e=>e.def.type==='dryshrimp'),'allowed natural entities remain')
 natural.push({seed,rawArcwraiths:raw.entities.filter(e=>e.type==='arcwraith').length,infiniteArcwraiths:0,finiteArcwraiths:0})
}
const m=createTradersMap(levelDefOf(102)!,424242),materials=new Map<string,THREE.Material>()
const assets={material:(surface:string,color:string)=>{const key=surface+color;let a=materials.get(key);if(!a){a=new THREE.MeshStandardMaterial({color});materials.set(key,a)}return a},labelGeometry:(_text:string,w:number,h:number)=>new THREE.PlaneGeometry(w,h)} as unknown as TradersAssets
const gates=[]
for(const entry of TRADERS_ENTRIES){
 const it=buildTradersGate(entry,assets);let step=it.next();while(!step.done)step=it.next();const root=step.value
 assert(root.userData.tradersGate)
 assert.equal(root.userData.tradersGate.width,TRADERS_ENTRY_WIDTH);assert.equal(root.userData.tradersGate.height,TRADERS_ENTRY_HEIGHT)
 assert(!root.children.some(o=>(o as THREE.Light).isLight),'no extra scene lights')
 let meshes=0,triangles=0
 root.traverse(o=>{if(!(o as THREE.Mesh).isMesh)return;meshes++;const g=(o as THREE.Mesh).geometry;triangles+=(g.index?.count??g.getAttribute('position').count)/3
  for(const name of ['position','normal','uv']){const a=g.getAttribute(name);assert(a);for(const n of a.array)assert(Number.isFinite(n),'nonfinite gate '+name)}
 })
 assert(meshes<=12,'gate details must be combined by material')
 const nx=-Math.sin(entry.face),ny=-Math.cos(entry.face)
 for(const offset of [-1.1,0,1.1])assert(canOccupy(m,entry.x+nx*1.15+ny*offset,entry.y+ny*1.15-nx*offset,.3,{z:.02,band:0}),'clear gate approach')
 gates.push({id:entry.id,meshes,triangles})
 root.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.dispose()})
 // Cancellation must retire partial merged buffers and keep shared materials alive.
 const cancel=buildTradersGate(entry,assets);cancel.next();cancel.return(new THREE.Group())
 assert(materials.size>0)
}
for(const mat of materials.values())mat.dispose()
assert.equal(TRADERS_SERVICES.length,8,'configured services remain')
console.log(JSON.stringify({ok:true,natural,manualArcwraith:true,gates,services:8},null,2))
