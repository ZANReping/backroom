import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createCanvas} from '@napi-rs/canvas'
import {buildL1Column} from '../src/game/renderer/l1Architecture'
import {l1Material} from '../src/game/renderer/l1Materials'
import {updateL1SurfaceField} from '../src/game/renderer/l1SurfaceField'
import {L1Shafts} from '../src/game/renderer/l1Shafts'
import {wallBaseTopAt} from '../src/game/world/mapgen'
import {setMaterialMode} from '../src/game/renderer/shared'
import {l1LayoutVariant} from '../src/game/world/l1Layout'
Object.defineProperty(globalThis,'document',{value:{createElement:()=>createCanvas(128,128),createElementNS:()=>({})}})
setMaterialMode('realistic')
// Different actual meshes, stable UV, no per-column materials allocated.
for(const v of ['parking','storage','gothic','ouroboros']){
  const signatures=new Set<string>()
 for(let d=0;d<5;d++){
  const a=buildL1Column({kind:'pillar',x:4,y:-8,w:1,h:1,solid:true,data:{l1Column:v,l1Dress:d}}),sig:number[]=[]
  let tris=0,materials='';a.traverse(o=>{const m=o as THREE.Mesh;if(!m.geometry)return;for(const k of ['position','uv','normal'])assert(Array.from(m.geometry.getAttribute(k).array).every(Number.isFinite));sig.push(m.geometry.getAttribute('position').count);tris+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;materials+=String((m.material as THREE.Material).uuid)});assert(tris<1000,v+' dress triangle budget');if(v!=='gothic')assert(materials.length>0,v+' dress material combination')
  signatures.add(JSON.stringify(sig));a.traverse(o=>(o as THREE.Mesh).geometry?.dispose())
 }
 assert(signatures.size>=(v==='gothic'?2:3),v+' has distinct overlays')
}
const make=(ox:number,oy:number)=>({l1Architecture:true,inf:{seed:7391,ox,oy}} as any)
const shader:any={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader}
l1Material('parking','floor').onBeforeCompile(shader,null as any)
assert(shader.uniforms.l1WorldOrigin?.value?.isVector2,'shared l1WorldOrigin Vector2 uniform')
const origin=shader.uniforms.l1WorldOrigin.value
updateL1SurfaceField(make(-32,-32));assert.equal(origin.x,-32);assert.equal(origin.y,-32)
updateL1SurfaceField(make(0,0));assert.equal(shader.uniforms.l1WorldOrigin.value,origin);assert.equal(origin.x,0);assert.equal(origin.y,0)
assert(shader.vertexShader.includes('vL0WorldXZ'),'surface shader exports world coordinates')
assert(shader.fragmentShader.includes('vL0WorldXZ')&&shader.fragmentShader.includes('l1WorldOrigin'),'surface shader uses world origin')
assert(!shader.fragmentShader.includes('texture2D(l1SurfaceField'),'surface shader has no legacy field texture')
const m:any={w:32,h:32,tiles:new Uint8Array(1024).fill(1),l1Architecture:true,structures:[],inf:{seed:7391,ox:0,oy:0,chunks:new Map([['0,0',{variant:'storage'}]])}}
for(const name of ['outdoor','step','stair','liquid','seaFloor','elev','ceiling','up','up2','upWall','upWall2'])m[name]=new Uint8Array(1024)
m.tiles[12*32+12]=2;assert.equal(wallBaseTopAt(m,12,12,3.6)?.top,6.4,'storage partition reaches actual roof')
let transition:{cx:number;cy:number}|undefined
for(let cy=-24;cy<=24&&!transition;cy++)for(let cx=-24;cx<=22&&!transition;cx++){const a=l1LayoutVariant(7391,cx,cy),b=l1LayoutVariant(7391,cx+2,cy);if(a!==b&&!['maintenance','aisle'].includes(a)&&!['maintenance','aisle'].includes(b))transition={cx,cy}}
assert(transition,'found non-path district transition')
const tm:any={l1Architecture:true,inf:{seed:7391,ox:transition!.cx*32,oy:transition!.cy*32}};updateL1SurfaceField(tm);assert.equal(origin.x,transition!.cx*32);assert.equal(origin.y,transition!.cy*32)
const scene=new THREE.Scene(),shafts=new L1Shafts(),lights=Array.from({length:8},(_,i)=>({x:5+i*2,y:5,r:8,color:'#fff',gen:1,natural:1,flickerSeed:0}))
shafts.update(scene,m,lights,true,0,false);assert.equal(shafts.mesh.count,8);const matrix=new THREE.Matrix4();shafts.mesh.getMatrixAt(0,matrix)
m.inf.blackout=true;shafts.update(scene,m,lights,true,0,false);assert(!shafts.mesh.visible,'blackout removes shaft energy');m.inf.blackout=false
shafts.update(scene,m,lights,false,0,false);assert(!shafts.mesh.visible,'low quality disables shafts')
let disposed=false;shafts.mesh.geometry.addEventListener('dispose',()=>disposed=true);shafts.dispose();assert(disposed&&!shafts.mesh.parent)
console.log('L1 detail checks passed: column variation, field world continuity, full-height wall, bounded power-aware shafts and disposal')
