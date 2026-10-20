import assert from 'node:assert/strict'
import {Engine} from '../src/game/engine'
import {LEVELS} from '../src/game/levels'
import {genL0Architecture,l0Sample,l0WoodRects,type L0Region} from '../src/game/world/l0Architecture'
import {applyL0TestField,l0FieldContains,l0FieldIntersects,subtractL0Field} from '../src/game/world/l0TestField'
import {l0LayoutEnvironment} from '../src/game/world/l0Regions'
import {l0LightingNeighbours} from '../src/game/world/l0Neighbourhood'
import {canOccupy} from '../src/game/core/player'
import {floorHeight} from '../src/game/world/mapgen'
import {captureL0,tickL0} from '../src/game/engine/l0State'
import {updateL0EnvironmentShader,l0WorldLighting} from '../src/game/renderer/l0EnvironmentShader'
import {l0OutletPositions} from '../src/game/world/l0WallDetails'
import {buildL0Architecture} from '../src/game/renderer/l0Architecture'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'

let checks=0
const ok=(value:unknown,label:string)=>{assert.ok(value,label);checks++;console.log('PASS '+label)}
for(const x of [-50,0,43]){
 const original={x,y:-3,w:20,h:9,bottom:0,top:2.7,surface:'wall' as const},cut={x:x+4,y:-1,w:9,h:3}
 const parts=subtractL0Field(original,cut)
 ok(parts.every(p=>!l0FieldIntersects(p,cut))&&Math.abs(parts.reduce((n,p)=>n+p.w*p.h,0)-153)<1e-8,'Precise rectangle subtraction at x='+x)
 ok(parts.every(p=>p.bottom===0&&p.top===2.7),'Subtraction preserves wall height')
}
for(const region of ['maze','arch','pillarhall','pit','red','blackout','manila'] as L0Region[]){
 const raw=genL0Architecture(LEVELS[0],7391,-2,3,region),before=JSON.stringify(raw),field={x:-58,y:102,w:20,h:20}
 const clear=applyL0TestField(raw,field),a=clear.l0!
 ok(JSON.stringify(raw)===before,'Overlay leaves seeded '+region+' input unchanged')
 ok(![...a.walls,...a.pits,...a.puddles,...l0WoodRects(a)].some(p=>l0FieldIntersects(p,field)),region+' geometry and real floor openings are clear')
 ok(!clear.structures.some(s=>s.solid&&l0FieldIntersects(s,field)),region+' colliders match cleared geometry')
 const e=l0LayoutEnvironment(a,-48,112)
 ok(e.base==='open'&&e.effect==='none'&&e.red===0&&e.blackout===0&&e.arch===0,region+' has neutral local lighting/materials')
 ok(clear.tiles[16*32+16]===1&&clear.elev[16*32+16]===0&&clear.tint[16*32+16]===0,region+' map and floor samples agree')
 ok(l0OutletPositions(a).every(p=>!l0FieldContains(field,p.x,p.y)),region+' leaves no floating outlet in the clearing')
}

// Clear only half a Manila room: remaining flooring and ceiling must both stop
// at the actual field edge, even when that edge is not a tile/grid boundary.
Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>createCanvas(128,128),createElementNS:()=>{throw Error('headless texture fallback')}}})
const manilaField={x:16.3,y:8,w:80,h:80},partial=applyL0TestField(genL0Architecture(LEVELS[0],7391,0,0,'manila'),manilaField),root=new THREE.Group()
for(const _ of buildL0Architecture(partial.l0!,0,0,root))void _
let ceilingTriangles=0
root.traverse(o=>{if(!(o instanceof THREE.Mesh)||o.material.name!=='l0-manila-ceiling')return
 const p=o.geometry.getAttribute('position'),ix=o.geometry.index
 for(let i=0;i<(ix?.count??p.count);i+=3){const ids=[0,1,2].map(k=>ix?ix.getX(i+k):i+k),x=ids.reduce((v,id)=>v+p.getX(id),0)/3,y=ids.reduce((v,id)=>v+p.getZ(id),0)/3;assert.ok(!l0FieldContains(manilaField,x,y),'Manila ceiling cannot remain over the clearing');ceilingTriangles++}
})
ok(ceilingTriangles>0,'Partial Manila ceiling remains only outside the test field')
root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}})

const eng=new Engine();eng.seed=7391;eng.devEnabled=true;eng.dev.god=true;eng.dev.frozenAI=true;eng.dev.statLock=true
eng.loadLevel(0,{mapSeed:7391,firstVisit:false});eng.introT=0
let m=eng.map!,inf=m.inf!
const initialOutside={id:1999901,type:'velvetcake',x:2.5,y:2.5}
m.items.push(initialOutside)
const outsideWorld={x:initialOutside.x+inf.ox,y:initialOutside.y+inf.oy}
ok(eng.devTestField(),'Developer entry creates a real 80m clearing')
const field={...inf.l0TestField!},center={x:field.x+40,y:field.y+40}
ok(field.w===80&&field.h===80&&Math.abs(eng.player.x+inf.ox-center.x)<1e-8,'Teleports to the clearing centre in world coordinates')
function verifyField(label:string){
 m=eng.map!;inf=m.inf!
 const blocked=m.structures.filter(s=>s.solid&&l0FieldIntersects(field,{...s,x:s.x+inf.ox,y:s.y+inf.oy}))
 if(blocked.length)console.log(JSON.stringify({field,origin:[inf.ox,inf.oy],blocked:blocked.slice(0,4)},null,2))
 ok(!blocked.length,label+': no invisible collider')
 const lamps=[...inf.chunks.values()].flatMap(c=>c.l0?.lamps??[]).filter(p=>l0FieldContains(field,p.x,p.y))
 ok(lamps.length===100&&new Set(lamps.map(p=>`${p.x},${p.y}`)).size===100&&lamps.every(p=>!p.off),label+': exactly 100 unique lit fixtures')
 for(let y=field.y+1;y<field.y+79;y+=7)for(let x=field.x+1;x<field.x+79;x+=7){
  assert.ok(canOccupy(m,x-inf.ox,y-inf.oy),label+' body clearance')
  assert.equal(floorHeight(m,x-inf.ox,y-inf.oy),0,label+' solid floor')
  const e=l0Sample(m,x-inf.ox,y-inf.oy);assert.ok(e&&e.effect==='none'&&e.arch===0,label+' region neutral')
 }
 checks++;console.log('PASS '+label+': body clearance, floor and regional effects across chunk seams')
}
verifyField('Initial field')
ok(m.items.some(p=>p.id===initialOutside.id)||[...inf.state.values()].some(s=>s.extraItems.some(p=>p.id===initialOutside.id)),'Fresh drop outside the field survives window restitching')
const rawCount=[...inf.chunks.values()].filter(c=>c.l0?.walls.length).length
ok(rawCount>0,'Natural world outside the field keeps its walls')
const layout=[...inf.chunks.values()].find(c=>c.l0&&l0FieldContains(field,c.cx*32+16,c.cy*32+16))!.l0!
const neighbours=l0LightingNeighbours(eng.levelDef,inf.seed,layout,inf.l0)
ok(neighbours.every(a=>!a.walls.some(w=>l0FieldIntersects(w,field)))&&neighbours.some(a=>a.lamps.some(l=>l0FieldContains(field,l.x,l.y))),'Unloaded lighting neighbours use the same clearing')
updateL0EnvironmentShader(m,0,false,false)
const texture=l0WorldLighting.field.value.image as {data:Uint8Array;width:number;height:number}
const bounds=l0WorldLighting.bounds.value
const ix=Math.floor((center.x-bounds.x)/bounds.z*texture.width),iy=Math.floor((center.y-bounds.y)/bounds.w*texture.height)
ok(texture.data[(iy*texture.width+ix)*4]===255,'Environment shader samples full local illumination')
const drop={id:1999902,type:'velvetcake',x:eng.player.x+2,y:eng.player.y}
m.items.push(drop)
eng.player.x=center.x+320-inf.ox;eng.player.y=center.y-inf.oy;eng.updateInfiniteWindow()
ok(!inf.chunks.has(`${layout.cx},${layout.cy}`),'Streaming really unloads the test-field chunks')
eng.player.x=center.x-inf.ox;eng.player.y=center.y-inf.oy;eng.updateInfiniteWindow()
verifyField('Reloaded field')
ok(m.items.filter(p=>p.id===drop.id).length===1,'A new test-field drop survives streaming exactly once')
eng.time+=60;tickL0(eng,60)
ok(!inf.l0Pending,'Test-field observation cannot schedule an unexpected replacement wall')
ok(!JSON.stringify(captureL0(eng)).includes('testField'),'Developer geometry override is absent from the world save')
ok(eng.devTestField()&&JSON.stringify(inf.l0TestField)===JSON.stringify(field),'Repeated activation reuses one stable world-space field')
verifyField('Reused field')
eng.loadLevel(0,{mapSeed:7391,firstVisit:false})
ok(!eng.map!.inf!.l0TestField,'Rebuilding the level restores the ordinary seeded generator')
console.log(`${checks} checks passed`)
