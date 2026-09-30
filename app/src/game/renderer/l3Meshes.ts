import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type {Structure} from '../core/types'
import {l3Material,l3WorldUV,type L3Surface} from './l3Materials'
import {l3Sculpture} from './l3Sculpture'
import {getMaterialMode} from './shared'

const prototypes=new Map<string,THREE.Group>()
const reusable=new Set(['column','statue','angelstatue','transformer','switchboard','turbinegen'])
export function l3Structure(s:Structure,H:number):THREE.Group|null {
  if(!reusable.has(s.kind))return l3StructureRaw(s,H)
  const key=JSON.stringify([getMaterialMode(),s.kind,s.w,s.h,s.data?.dmg,s.data?.deg,s.data?.l3Column])
  let source=prototypes.get(key)
  if(!source){const built=l3StructureRaw(s,H);if(!built)return null;source=built;prototypes.set(key,source)}
  const instance=source.clone(true)
  // Each streamed chunk owns its buffers, so unloading one never invalidates
  // another. Expensive draping/feather/flute generation occurs once per variant.
  instance.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.isMesh)mesh.geometry=mesh.geometry.clone()})
  return instance
}

export class L3Builder {
  root=new THREE.Group()
  parts=new Map<L3Surface,THREE.BufferGeometry[]>()
  variant:string
  constructor(variant='lit'){this.variant=variant}
  add(g:THREE.BufferGeometry,s:L3Surface,uv=true){if(uv)l3WorldUV(g,0,0,s==='brick'?.8:.5);const a=this.parts.get(s)??[];a.push(g);this.parts.set(s,a)}
  box(x:number,y:number,z:number,w:number,h:number,d:number,s:L3Surface){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);this.add(g,s)}
  cyl(x:number,y:number,z:number,r:number,h:number,s:L3Surface,axis='y',r2=r){const g=new THREE.CylinderGeometry(r,r2,h,r>.2?16:8);if(axis==='z')g.rotateX(Math.PI/2);if(axis==='x')g.rotateZ(Math.PI/2);g.translate(x,y,z);this.add(g,s)}
  tube(points:number[][],r:number,s:L3Surface){this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(8,points.length*6),r,8,false),s,false)}
  ring(x:number,y:number,z:number,r:number,s:L3Surface){const g=new THREE.TorusGeometry(r,.012,6,20);g.translate(x,y,z);this.add(g,s,false)}
  finish(){for(const [s,gs]of this.parts){
    // Extruded entrance arches are non-indexed; primitives are indexed. Normalize
    // mixed batches so a portal cannot silently discard the entire brick shell.
    const mixed=gs.some(g=>!!g.index)&&gs.some(g=>!g.index)
    const compatible=mixed?gs.map(g=>g.index?g.toNonIndexed():g):gs
    const merged=mergeGeometries(compatible,false)
    new Set([...gs,...compatible]).forEach(g=>g.dispose())
    if(merged){const mesh=new THREE.Mesh(merged,l3Material(this.variant,s));mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh)}
  }this.parts.clear();return this.root}
}

export function l3Column(){
  const b=new L3Builder('sanct')
  b.box(0,.13,0,.88,.26,.88,'marble');b.cyl(0,.36,0,.39,.22,'marble');b.cyl(0,2.24,0,.29,3.62,'marble','y',.34)
  // Helical flutes modelled in relief, with continuous capital and springing.
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2,pts:number[][]=[];for(let j=0;j<=24;j++){const y=.49+j*3.5/24,t=a+y*.56;pts.push([Math.sin(t)*(.34-y*.012),y,Math.cos(t)*(.34-y*.012)])}b.tube(pts,.018,'marble')}
  b.cyl(0,4.03,0,.32,.1,'marble');b.cyl(0,4.23,0,.49,.32,'marble','y',.32);b.box(0,4.46,0,1.0,.14,1.0,'marble')
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;b.tube([[Math.sin(a)*.32,4.05,Math.cos(a)*.32],[Math.sin(a)*.47,4.28,Math.cos(a)*.47],[Math.sin(a)*.42,4.36,Math.cos(a)*.42]],.035,'marble')}
  return b.finish()
}

/** Local structure factory; caller owns final world transform and interaction. */
function l3StructureRaw(s:Structure,H:number):THREE.Group|null {
  if(s.kind==='statue'||s.kind==='angelstatue') {const g=l3Sculpture(s.kind==='angelstatue',Number(s.data?.dmg??0));g.rotation.y=Number(s.data?.deg??0)*Math.PI/180;return g}
  if(s.kind==='column'&&s.data?.l3Column)return l3Column()
  if(s.kind==='l3service')return new THREE.Group()
  const b=new L3Builder(),k=s.kind
  if(k==='trench'){
    b.box(0,.011,0,.34,.025,1,'black')
    for(const x of [-.18,.18])b.box(x,.028,0,.025,.035,1,'iron')
    for(const x of [-.09,-.03,.04,.095])b.cyl(x,.031,0,.016,1,'black','z')
    const g=b.finish();if(s.data?.rot)g.rotation.y=Math.PI/2;return g
  }
  if(k==='cabletray'){
    const y=Math.min(H-.35,3.75)
    for(const z of [-.20,.20])b.box(0,y,z,1,.10,.024,'iron')
    for(const x of [-.36,0,.36])b.box(x,y-.045,0,.025,.025,.41,'iron')
    for(const z of [-.12,-.04,.04,.12])b.cyl(0,y-.01,z,.018,1,'black','x')
    const g=b.finish();if(s.data?.rot)g.rotation.y=Math.PI/2;return g
  }
  if(k==='transformer'){
    b.box(0,.16,0,1.60,.27,1.45,'black');b.box(0,.82,0,1.18,1.05,.92,'green');b.box(0,1.36,0,1.28,.08,1.04,'green')
    for(const side of [-1,1])for(let j=0;j<10;j++)b.box(side*.68,.82,-.43+j*.094,.12,.86,.032,'green')
    for(const x of [-.39,0,.39]){
      b.cyl(x,1.62,0,.055,.45,'paint');for(let i=0;i<6;i++)b.cyl(x,1.44+i*.065,0,.10,.032,'paint')
      b.tube([[x,1.87,0],[x,2.12,-.05],[x,2.25,-.48],[x,2.61,-.57]],.028,'black')
    }
    b.box(.61,.97,.32,.1,.24,.21,'iron');return b.finish()
  }
  if(k==='electricalriser') {
    // Reference 1: a tall, narrow faceted cover with three silver conduit bends.
    const shell=new THREE.CylinderGeometry(.19,.19,1.72,6);shell.rotateY(Math.PI/6);shell.scale(1,1,.52);shell.translate(0,1.15,-.36);b.add(shell,'paint')
    b.box(0,1.18,-.25,.29,1.59,.025,'paint')
    for(const x of [-.105,0,.105]) {
      b.tube([[x,2.02,-.38],[x,2.55,-.38],[x,2.83,-.29],[x,3.02,-.05],[x,3.05,.44]],.023,'paint')
      for(const y of [2.2,2.66])b.box(x,y,-.35,.09,.035,.07,'iron')
    }
    b.box(0,2.73,-.24,.36,.22,.18,'iron');b.box(.23,2.0,-.395,.09,.035,.05,'black')
    const g=b.finish();g.rotation.y=-Number(s.data?.wallDir??0)*Math.PI/2;return g
  }
  if(k==='barfence'||k==='bargate'||k==='hoteldoor'&&s.data?.l3Iron) {
    const ironDoor=k==='hoteldoor',gate=k!=='barfence',blackFence=!ironDoor&&s.data?.l3FenceFinish==='black',fenceSurface:L3Surface=blackFence?'blackpaint':'paint',h=ironDoor?2.65:Number(s.data?.height??H),w=gate?1:Math.max(s.w,s.h)
    if(h<H-.1)b.box(0,(H+h)/2,0,w,H-h,.22,'ceiling')
    for(const x of [-w/2+.045,w/2-.045])b.box(x,h/2,0,.09,h,.11,fenceSurface)
    b.box(0,h-.065,0,w,.13,.12,fenceSurface)
    if(blackFence)for(const x of [-w/2+.045,w/2-.045])for(const y of [.42,h-.42])b.cyl(x,y,.065,.025,.018,'blackpaint','z')
    const leaf=new L3Builder(),span=gate?.81:w-.14,offset=gate?.405:0
    if(ironDoor) {
      leaf.box(offset,1.30,0,span,2.52,.075,'green')
      for(const y of [.38,1.83])leaf.box(offset,y,.043,span-.11,.38,.018,'iron')
      for(let i=0;i<6;i++)leaf.box(offset,1.82+i*.044,.06,.42,.012,.008,'black')
    } else {
      for(let x=-span/2;x<=span/2+.001;x+=.145)leaf.cyl(x+offset,h/2,0,.017,h-.13,fenceSurface)
      for(let y=.1;y<h;y+=.61)leaf.box(offset,y,.003,span,.045,.052,fenceSurface)
      for(const x of [-span/2,span/2])leaf.box(x+offset,h/2,0,.035,h-.10,.05,fenceSurface)
    }
    if(gate) {
      leaf.box(.69,1.27,.05,.18,.26,.06,blackFence?'blackpaint':'iron');leaf.box(.69,1.28,.09,.1,.025,.04,blackFence?'blackpaint':'black')
      const g=leaf.finish();g.position.x=-.405;g.userData.lid=1;b.root.add(g)
      for(const y of [.31,h-.35])b.cyl(-.425,y,.045,.027,.16,blackFence?'blackpaint':'iron')
    } else b.root.add(leaf.finish())
    // Small rust spots and welded plates, kept within the actual fence envelope.
    for(let i=0;i<Math.ceil(w*3);i++)b.box(-w/2+.12+(i*.337)%(w-.18),.13+(i*.61)%(h-.3),.036,.026,.09,.012,'bronze')
    const g=b.finish();if(s.data?.rot)g.rotation.y=Math.PI/2;return g
  }
  if(k==='switchboard') {
    // Open, riveted switching rack, ceramic insulators and exposed cable tails.
    b.box(0,1.35,-.33,.92,2.7,.11,'black')
    for(const x of [-.44,.44])b.box(x,1.38,0,.065,2.76,.55,'green')
    for(const y of [.12,.61,1.4,2.42,2.73])b.box(0,y,.20,.95,.09,.08,'green')
    for(const x of [-.30,0,.30]) {
      b.box(x,1.31,.05,.1,1.6,.045,'bronze')
      for(const y of [.37,1.85,2.34]) {
        b.cyl(x,y,.14,.064,.19,'black');for(let j=0;j<4;j++)b.cyl(x,y-.075+j*.05,.14,.087,.025,'iron')
      }
      b.box(x,.6,.28,.11,.24,.11,'paint')
      b.tube([[x,.59,.18],[x,.22,.28],[x-.09,.13,.34],[x-.09,.06,.2]],.018,'black')
      b.tube([[x,2.53,.1],[x,2.89,.12],[x,3.06,-.28]],.031,'black')
      for(const y of [.14,1.4,2.73])b.cyl(x,y,.26,.018,.016,'iron','z')
    }
    const g=b.finish();g.rotation.y=Number(s.data?.deg??0)*Math.PI/180;return g
  }
  if(k==='sphboiler') {
    const r=.80
    b.box(0,.14,0,1.72,.28,1.76,'black')
    // Horizontal riveted copper vessel with convex endcaps and a clean aisle.
    b.cyl(0,1.08,0,r,1.04,'bronze','z')
    for(const z of [-.52,.52]){const cap=new THREE.SphereGeometry(r,32,20);cap.scale(1,1,.27);cap.translate(0,1.08,z);b.add(cap,'bronze');b.ring(0,1.08,z,r,'iron');for(let i=0;i<24;i++){const a=i/24*Math.PI*2;b.cyl(Math.sin(a)*.77,1.08+Math.cos(a)*.77,z+(z>0?.035:-.035),.018,.06,'iron','z')}}
    b.tube([[0,1.86,0],[0,2.32,0],[.51,2.49,0],[.78,2.49,0]],.055,'bronze')
    b.cyl(.55,2.49,0,.078,.20,'iron','x');b.ring(.55,2.72,0,.14,'iron')
    b.box(.55,2.72,0,.28,.018,.018,'iron');b.box(.55,2.72,0,.018,.28,.018,'iron');b.cyl(.55,2.57,0,.018,.28,'iron')
    b.cyl(-.27,1.44,.78,.105,.08,'paint','z');b.box(-.27,1.44,.826,.012,.14,.012,'black')
    b.tube([[-.25,.47,.61],[-.25,.35,.86],[.37,.35,.86],[.37,.49,.62]],.026,'bronze')
    for(const x of [-.56,.56])b.box(x,.38,0,.14,.39,1.33,'green')
    return b.finish()
  }
  if(k==='conveyor') {
    const L=Math.max(s.w,s.h)
    for(let x=-L/2+.18;x<L/2;x+=2.3)for(const z of [-.30,.30]){b.box(x,.40,z,.065,.80,.07,'green');b.box(x,.06,z,.17,.04,.19,'iron')}
    b.box(0,.72,0,L,.10,.72,'green');b.box(0,.793,0,L-.08,.025,.61,'black')
    for(const z of [-.35,.35]){b.box(0,.83,z,L,.09,.034,'iron');for(let x=-L/2+.15;x<L/2;x+=.34)b.cyl(x,.84,z+(z>0?.024:-.024),.012,.018,'iron','z')}
    for(let x=-L/2+.12;x<L/2;x+=.17)b.box(x,.809,0,.016,.012,.6,'bronze')
    for(const x of [-L/2+.12,L/2-.12])b.cyl(x,.73,0,.1,.67,'iron','z')
    b.box(-L/2+.25,.47,.41,.4,.25,.27,'green');b.cyl(-L/2+.25,.47,.59,.09,.12,'iron','z')
    for(let i=0;i<3;i++)b.box(-L*.18,.836+i*.025,0,.72,.022,.43,'paint')
    const g=b.finish();if(s.data?.rot)g.rotation.y=Math.PI/2;return g
  }
  if(k==='turbinegen') {
    b.box(0,.13,0,2.92,.26,.91,'green')
    for(const x of [-.97,.71])b.box(x,.42,0,.43,.42,.68,'green')
    b.cyl(.55,.91,0,.42,1.5,'green','x');b.cyl(-.83,.91,0,.37,.91,'iron','x')
    for(let x=-.12;x<1.22;x+=.075)b.cyl(x,.91,0,.447,.025,'green','x')
    for(const x of [-1.29,-.38,1.33])b.cyl(x,.91,0,.46,.09,'iron','x')
    b.cyl(-.31,.91,0,.095,.25,'iron','x');b.box(.40,1.39,0,.51,.22,.39,'green')
    for(const z of [-.33,.33])for(const x of [-1.24,-.88,-.38,.38,1.28])b.cyl(x,.29,z,.022,.07,'iron')
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2;b.cyl(-1.35,.91+Math.sin(a)*.32,Math.cos(a)*.32,.019,.04,'bronze','x')}
    b.tube([[.57,1.38,.14],[.73,1.53,.22],[1.19,1.46,.27],[1.41,.31,.36]],.035,'black')
    return b.finish()
  }
  if(k==='piperack') {
    for(const y of [.32,.61,1.75,2.2,2.66]){b.cyl(0,y,0,y>2?.064:.092,1.01,'bronze','z');b.ring(0,y,0,y>2?.072:.10,'iron')}
    b.box(-.15,1.43,0,.06,2.86,.07,'iron')
    if(s.data?.valve){b.cyl(.1,1.75,.18,.035,.35,'bronze','z');b.ring(.1,1.75,.35,.15,'iron');b.box(.1,1.75,.35,.30,.018,.018,'iron');b.box(.1,1.75,.35,.018,.30,.018,'iron')}
    const g=b.finish();if(s.data?.rot)g.rotation.y=Math.PI/2;return g
  }
  if(k==='busbar') {
    const L=s.w
    for(const x of [-L/2+.13,L/2-.13]){b.box(x,1.59,0,.11,3.18,.31,'green');b.box(x,1.59,-.16,.31,3.18,.035,'green');b.box(x,1.59,.16,.31,3.18,.035,'green')}
    b.box(0,3.13,0,L,.28,.38,'green')
    for(const x of [-L/2+.3,L/2-.3])for(const y of [3.07,3.20])b.cyl(x,y,.202,.027,.025,'iron','z')
    for(let x=-L/2+.55;x<L/2-.3;x+=.69) {
      b.cyl(x,2.65,0,.052,.75,'black');for(let j=0;j<6;j++)b.cyl(x,2.47+j*.078,0,.13,.035,'iron')
      b.tube([[x,3.25,0],[x,3.64,-.04],[x-.13,3.76,-.32],[x-.18,3.73,-.60]],.041,'black')
    }
    for(const z of [-.1,.1])b.box(0,2.28,z,L-.18,.07,.055,'bronze')
    return b.finish()
  }
  return null
}
