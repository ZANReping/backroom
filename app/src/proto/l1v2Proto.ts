/* eslint-disable @typescript-eslint/no-explicit-any -- 原型页：简化替身，不进生产包 */
// Level 1 v2 预览页（阶段 A：地图结构审查）。点光源近似烘焙光照。
// ?scene=spawn|hall:<区段>|door|path|room:<类型>|top   ?x=&z=&yaw=&pitch=  ?seed=
import * as THREE from 'three'
import '../game/world/mapgen'
import '../game/renderer/renderer'
import {buildL1Data} from '../game/world/l1Building'
import {layoutL1BakeCharts} from '../game/world/l1Bake'
import {genL1ChunkRaw} from '../game/world/infiniteL1'
import {L1} from '../game/levels/l1'
import {l1Material} from '../game/renderer/l1Materials'
import {buildL1Prop} from '../game/renderer/l1Props'
import {buildStructure} from '../game/renderer/structures'
import {buildL1EmitterMeshes} from '../game/renderer/l1BakedScene'
import {setMaterialMode} from '../game/renderer/shared'
import {l1PlanTile,l1PlanRegions,l1PlanDoors,l1PlanRooms,L1_SECTION_NAMES,type L1Section} from '../game/world/l1Plan'
import type {L1ArchitectureData} from '../game/world/l1BuildingTypes'

const q=new URLSearchParams(location.search),seed=Number(q.get('seed')??20261006),sceneId=q.get('scene')??'spawn'
try{(setMaterialMode as any)?.(q.get('mode')??'realistic')}catch{/* optional */}
const floor=(x:number,z:number)=>l1PlanTile(seed,x,z).floor
function run(x:number,z:number,dx:number,dz:number){let n=0;while(n<60&&floor(x+dx*n,z+dz*n))n++;return n}
function pickScene():{x:number;z:number;yaw:number;pitch:number;label:string}{
 const regs=l1PlanRegions(seed,-900,-900,900,900).sort((a,b)=>Math.hypot((a.ix0+a.ix1)/2,(a.iy0+a.iy1)/2)-Math.hypot((b.ix0+b.ix1)/2,(b.iy0+b.iy1)/2))
 if(sceneId.startsWith('hall:')){
  const sec=sceneId.slice(5) as L1Section,r=regs.find(r=>r.section===sec)!
  const x=r.ix0+6.5,z=Math.floor((r.iy0+r.iy1)/2)+.5
  return {x,z,yaw:-Math.PI/2,pitch:-.03,label:`${L1_SECTION_NAMES[sec]} 过道（${r.ix1-r.ix0}×${r.iy1-r.iy0} m）`}
 }
 if(sceneId==='door'){
  const r=regs[0],d=l1PlanDoors(seed,r.ix0-1,r.iy0-1,r.ix1+2,r.iy1+2).filter(d=>d.region===r.id)[1]
  const nx=d.dir===0?1:d.dir===1?-1:0,nz=d.dir===2?1:d.dir===3?-1:0
  const cx=d.x+(d.axis==='x'?.5:1),cz=d.y+(d.axis==='x'?1:.5)
  return {x:cx+nx*8+(nz?2.5:0),z:cz+nz*8+(nx?2.5:0),yaw:Math.atan2(nx,nz)+(nz?.25:-.25)*(nx||nz),pitch:-.02,label:'过道墙上通往小径的门（绿色应急灯）'}
 }
 if(sceneId==='path'){
  for(const r of regs)for(const d of l1PlanDoors(seed,r.ix0-1,r.iy0-1,r.ix1+2,r.iy1+2).filter(d=>d.region===r.id)){
   const nx=d.dir===0?1:d.dir===1?-1:0,nz=d.dir===2?1:d.dir===3?-1:0
   const px=d.x-nx*2+(d.axis==='x'?.5:1),pz=d.y-nz*2+(d.axis==='x'?1:.5)
   for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    if(dx===nx&&dz===nz)continue
    if(run(px,pz,dx,dz)>=13)return {x:px,z:pz,yaw:Math.atan2(-dx,-dz),pitch:-.02,label:'小径：2 m 宽混凝土迷宫走廊'}
   }
  }
 }
 if(sceneId.startsWith('room:')){
  const type=sceneId.slice(5),r=l1PlanRooms(seed,-900,-900,900,900).filter(r=>r.type===type).sort((a,b)=>Math.hypot(a.x0,a.y0)-Math.hypot(b.x0,b.y0))[0]
  const d=r.door,nx=d.dir===0?1:d.dir===1?-1:0,nz=d.dir===2?1:d.dir===3?-1:0
  const NAMES:Record<string,string>={office:'办公室',cell:'砖墙小间',sickbay:'医务室',rubber:'橡胶房',gallery:'挂画房间',mattress:'床垫房间',empty:'空房间'}
  return {x:d.x+(d.dir<2?0:1)+(nz?0:-nx*1.2)+.5*(nz?1:0),z:d.y+(nx?1:0)-nz*1.2+.5*(nx?1:0),yaw:Math.atan2(nx,nz),pitch:-.12,label:`小径房间：${NAMES[type]}（${r.x1-r.x0}×${r.y1-r.y0} m）`}
 }
 return {x:15.5,z:15.5,yaw:Number(q.get('yaw')??0),pitch:-.03,label:'出生点：天鹰段'}
}
const pick=pickScene()
const cam0={x:Number(q.get('x')??pick.x),z:Number(q.get('z')??pick.z),yaw:Number(q.get('yaw')??pick.yaw)}
const W=innerWidth,H=innerHeight
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(W,H);renderer.outputColorSpace=THREE.SRGBColorSpace
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=Number(q.get('exp')??1.1)
document.body.appendChild(renderer.domElement)
const scene=new THREE.Scene();scene.background=new THREE.Color('#050505');scene.fog=new THREE.Fog('#0b0b0a',22,90)
const cam=new THREE.PerspectiveCamera(Number(q.get('fov')??68),W/H,.05,600)
const top=sceneId==='top'
if(top){cam.position.set(cam0.x,Number(q.get('h')??70),cam0.z+.01);cam.lookAt(cam0.x,0,cam0.z)}
else{cam.position.set(cam0.x,1.6,cam0.z);cam.rotation.order='YXZ';cam.rotation.y=cam0.yaw;cam.rotation.x=Number(q.get('pitch')??pick.pitch)}
const surfaceFor=(style:string,surface:string)=>surface==='paint'?(style==='maintenance'?['maintenance-plaster','wall']:[style,'columnPaint']):[style,surface]
function chunk(a:L1ArchitectureData){
 const faces=layoutL1BakeCharts(a,'low').faces,groups=new Map<string,{p:number[];n:number[];uv:number[];ix:number[];style:string;surface:string}>()
 for(const f of faces){
  if(f.surface==='leaf'||top&&f.surface==='ceiling')continue
  const key=f.style+':'+f.surface,b=groups.get(key)??{p:[],n:[],uv:[],ix:[],style:f.style,surface:f.surface};groups.set(key,b)
  const o=b.p.length/3,scale=f.surface==='ground'?1.05:f.surface==='floor'?.22:f.surface==='ceiling'?(f.style==='storage'?.45:.24):f.surface==='brick'||f.style==='maintenance'&&f.surface==='wall'?.18:.32
  for(let i=0;i<4;i++){const p=f.p[i],n=f.n[i],topF=Math.abs(n[1])>.55,xFace=Math.abs(n[0])>Math.abs(n[2]);b.p.push(...p);b.n.push(...n);b.uv.push((topF?p[0]:xFace?p[2]:p[0])*scale,(topF?p[2]:p[1])*scale)}
  b.ix.push(o,o+1,o+2,o,o+2,o+3)
 }
 for(const b of groups.values()){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setIndex(b.ix)
  const [v,s]=surfaceFor(b.style,b.surface);const m=new THREE.Mesh(g,l1Material(v,s as any));m.material.side=THREE.DoubleSide;scene.add(m)
 }
 buildL1EmitterMeshes(a,0,0,scene as any,[],[])
}
const lights:{p:THREE.Vector3;c:THREE.Color;power:number;range:number}[]=[]
const fakeMap:any={w:1<<20,h:1<<20,tiles:new Proxy({},{get:()=>1}),inf:{ox:0,oy:0,seed},structures:[]}
const R=Number(q.get('r')??(top?2:2)),ccx=Math.floor(cam0.x/32),ccz=Math.floor(cam0.z/32)
for(let dz=-R;dz<=R;dz++)for(let dx=-R;dx<=R;dx++){
 const a=buildL1Data(seed,ccx+dx,ccz+dz);chunk(a)
 for(const e of a.emitters)if(e.power>0&&e.kind!=='sky')lights.push({p:new THREE.Vector3(e.position[0],e.position[1]-.1,e.position[2]),c:new THREE.Color(e.color[0],e.color[1],e.color[2]),power:e.power*(e.kind==='panel'?2.2:e.kind==='emergency'?2.5:1),range:e.kind==='emergency'?4:e.range})
 else if(e.kind==='sky')lights.push({p:new THREE.Vector3(e.position[0],e.position[1]-1,e.position[2]),c:new THREE.Color(1,.95,.8),power:e.power*1.6,range:22})
 let c
 try{c=genL1ChunkRaw(L1,seed,ccx+dx,ccz+dz)}catch(err){console.error(err);continue}
 for(const s of c.structures){
  if(s.data?.l1Static||s.data?.l1Hidden)continue
  let o:THREE.Object3D|null=null
  try{o=s.data?.l1Prop?buildL1Prop(s):buildStructure(s,L1,fakeMap,3.25)}catch{o=null}
  if(o)scene.add(o)
 }
}
lights.sort((a,b)=>a.p.distanceToSquared(cam.position)-b.p.distanceToSquared(cam.position))
for(const l of lights.slice(0,Number(q.get('lights')??(top?60:30)))){const L=new THREE.PointLight(l.c,l.power*Number(q.get('lk')??9),l.range*1.4,1.6);L.position.copy(l.p);scene.add(L)}
scene.add(new THREE.HemisphereLight('#8a8c88','#2a2926',Number(q.get('amb')??(top?1.2:.35))))
const lab=document.getElementById('lab')
if(lab)lab.innerHTML=`<div class="l" style="left:50%;top:12px">${top?'俯视（去天花板）':pick.label}<div class="s">L1 v2 · seed ${seed} · (${cam0.x.toFixed(0)}, ${cam0.z.toFixed(0)}) · 阶段 A：结构审查，材质/烘焙未重做，点光源近似</div></div>`
let frames=0
function tick(){renderer.render(scene,cam);if(++frames===8){(window as any).__ready=true}requestAnimationFrame(tick)}
setTimeout(tick,2500)
