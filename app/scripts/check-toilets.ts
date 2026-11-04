import assert from 'node:assert/strict'
import * as THREE from 'three'
import {toiletGeometries,latrineSeatGeometry} from '../src/game/renderer/toiletGeometry'
import {toiletParts,toiletSeat,type ToiletStyle} from '../src/game/content/toiletParts'
import {l11PropShape} from '../src/game/content/l11PropShapes'
import {l11PropParts} from '../src/game/content/l11PropParts'
import {furnitureSeats} from '../src/game/content/furnitureSeats'
import {fartSamples,playToiletFart} from '../src/game/core/toiletAudio'
import {FOYER_PROPS} from '../src/game/world/foyerLayout'
import type {Structure} from '../src/game/core/types'
let checks=0
const ok=(v:unknown,label:string)=>{assert(v,label);checks++}
const material=new THREE.MeshBasicMaterial(),triangleCounts:Record<string,number>={}
const mesh=(geos:Iterable<THREE.BufferGeometry>)=>{const group=new THREE.Group();for(const g of geos)group.add(new THREE.Mesh(g,material));group.updateMatrixWorld(true);return group}
const down=(root:THREE.Object3D,x:number,z:number)=>new THREE.Raycaster(new THREE.Vector3(x,1.2,z),new THREE.Vector3(0,-1,0)).intersectObject(root,true)[0]?.point.y
for(const style of ['standard','compact','worn','stone'] as ToiletStyle[]){
 const geos=toiletGeometries(style),g=mesh(geos.values()),seat=toiletSeat(style),bounds=new THREE.Box3().setFromObject(g)
 let triangles=0
 for(const geo of geos.values()){
  for(const key of ['position','normal','uv'])ok(Array.from(geo.getAttribute(key).array).every(Number.isFinite),style+' finite '+key)
  triangles+=(geo.index?.count??geo.getAttribute('position').count)/3
 }
 triangleCounts[style]=triangles;ok(triangles<2500,style+' bounded geometry budget')
 ok(Math.abs(bounds.min.y)<.001,style+' base on the floor')
 const cavity=down(g,.025,seat.z)
 ok(cavity!==undefined&&cavity<seat.y-.11,style+' open bowl reaches visible inner floor')
 const seatMesh=g.children.find((o:any)=>o.geometry.name==='toilet-seat')!
 const sb=new THREE.Box3().setFromObject(seatMesh)
 // The upright lid can exceed the horizontal ring; check a downward ray on the front ring itself.
 const ring=down(g,0,style==='compact'?.227:style==='worn'?.307:.288)
 ok(ring!==undefined&&Math.abs(ring-seat.y)<.018,style+' seat anchor matches actual horizontal ring')
 ok(sb.max.y<.88,style+' lid stays within a realistic height')
 const another=toiletGeometries(style);let disposed=0
 for(const geo of geos.values()){geo.addEventListener('dispose',()=>disposed++);geo.dispose()}
 ok(disposed===4,style+' private geometry released exactly once')
 ok([...another.values()].every((geo,i)=>geo!==[...geos.values()][i]),style+' instances own separate geometry')
 const again=mesh(another.values());ok((down(again,.025,seat.z)??9)<seat.y-.11,style+' disposing first instance preserves second')
 for(const geo of another.values())geo.dispose()
}
const city=mesh(l11PropParts('l11_toilet').map(p=>{const shape=l11PropShape(p);return shape.geometry.clone().applyMatrix4(shape.matrix)}))
ok((down(city,.025,-.065)??9)<.34,'city model has actual hollow bowl on its -Z front')
for(const o of city.children)(o as THREE.Mesh).geometry.dispose()
const struct=(kind:string,data:Record<string,any>={}):Structure=>({kind:kind as Structure['kind'],x:0,y:0,w:1,h:1,solid:true,data})
const entries=[['l02fix',{fix:'toilet',yaw:Math.PI/2},.02],['l4prop',{detail:'toilet'},4],['l9toilet',{},9],['l11_toilet',{},11],['stoneinstruments',{rot:.8},8],['trade_counter',{tradersModel:'dressing',dressing:'wcstall'},109]] as const
for(const [kind,data,level] of entries){const seats=furnitureSeats(struct(kind,data),level);ok(seats.length===1&&seats[0].toilet,kind+' exposes one semantic toilet seat');ok(seats[0].y>.40&&seats[0].y<.50,kind+' physical seat height');ok(furnitureSeats(struct(kind,{...data,noSit:1}),level).length===0,kind+' respects disabled seat')}
const foyer=FOYER_PROPS.find(p=>p.kind==='toilet')!
const fs=furnitureSeats(struct('foyerprop',{pid:foyer.id}),900)[0]
ok(fs?.toilet&&Math.abs(fs.y-toiletSeat('compact').y)<.001,'foyer proxy shares exact fixture height and toilet action')
ok(!furnitureSeats(struct('officechair'),4)[0].toilet,'ordinary chairs never gain toilet action')
ok(furnitureSeats(struct('l02fix',{fix:'sink'}),.02).length===0,'sink is not a toilet')
ok(furnitureSeats(struct('l4prop',{detail:'pantry'}),4).length===0,'pantry is not a toilet')
const latrine=latrineSeatGeometry(1.8),latrineMesh=new THREE.Mesh(latrine,material);latrineMesh.updateMatrixWorld(true)
ok(down(latrineMesh,0,0)===undefined,'L10 latrine board has a real through hole')
ok(Math.abs((down(latrineMesh,.3,0)??9)-.04)<.001,'L10 board around hole remains solid')
latrine.dispose()
ok(furnitureSeats(struct('l10outhouse'),10)[0].toilet,'L10 wooden latrine has toilet action')
const audio=[]
for(const rate of [22050,44100,48000])for(const seed of [0,42,-7]){
 const a=fartSamples(rate,seed);let energy=0,peak=0
 ok(a.every(Number.isFinite),'finite audio samples');for(const value of a){energy+=value*value;peak=Math.max(peak,Math.abs(value))}
 ok(a.length===Math.round(rate*.7),'sample duration');ok(peak<=.5&&Math.sqrt(energy/a.length)>.015,'audible bounded sound');ok(Math.abs(a[0])+Math.abs(a.at(-1)!)<.0001,'declicked sound edges')
 const again=fartSamples(rate,seed);ok(a.every((v,i)=>v===again[i]),'deterministic noise')
 audio.push({rate,seed,samples:a.length,rms:Math.sqrt(energy/a.length),peak})
}
ok(!playToiletFart(null),'locked audio is a safe no-op')
let sources=0,gains=0,disconnected=0,started=0,stopAt=0
const node:any={connect(){return this},disconnect(){disconnected++}}
const source:any={...node,start(){started++},stop(t:number){stopAt=t}}
const fake:any={ctx:{state:'running',sampleRate:48000,currentTime:2,createBuffer:(channels:number,n:number)=>({getChannelData:()=>new Float32Array(n)}),createBufferSource(){sources++;return source},createGain(){gains++;return{...node,gain:{setValueAtTime(){}}}}},sfx:node}
ok(playToiletFart(fake,42),'unlocked context plays sound through existing bus')
ok(sources===1&&gains===1&&started===1&&Math.abs(stopAt-2.71)<.001,'one bounded source and gain per press')
source.onended();ok(disconnected===2,'audio source and gain both disconnect after completion')

console.log(JSON.stringify({checks,failures:0,triangleCounts,audio,profiles:toiletParts().length}))
