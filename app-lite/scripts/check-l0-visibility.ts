import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {createCanvas} from '@napi-rs/canvas'
import * as THREE from 'three'
import {mapSight,revealMapSight} from '../src/game/world/mapSight'
import {drawMapPlayer,mapVision} from '../src/game/content/mapPlayer'
import {l0StaticPointMask,syncL0PointMask} from '../src/game/renderer/l0PointMask'
import type {Engine} from '../src/game/engine'
import type {GameMap} from '../src/game/world/mapgen'

const out='reports/l0-remake/iteration-20';mkdirSync(out,{recursive:true})
const w=120,n=w*w,bytes=()=>new Uint8Array(n)
const m={w,h:w,structures:[],tiles:bytes().fill(1),tint:bytes(),elev:bytes(),step:bytes(),stair:bytes(),up:bytes(),upWall:bytes(),up2:bytes(),upWall2:bytes(),dn:bytes(),dnWall:bytes(),liquid:bytes(),seaFloor:bytes()} as unknown as GameMap
const e={map:m,player:{x:60.5,y:100.5,z:0,floor:0},time:0,mapRev:0,explored:bytes()} as Engine
mapVision.range=60;mapVision.fov=Math.PI/2
const wall={id:1,kind:'wall',x:25,y:75.25,w:70,h:.24,solid:true,data:{l0Wall:1,bottom:0,top:2.7}} as GameMap['structures'][number]
const query=()=>{e.mapRev++;return mapSight(e,0)}
const middle=(s:ReturnType<typeof mapSight>)=>s.points[Math.floor(s.points.length/2)]
const checks:string[]=[]
assert(Math.abs(middle(query()).y+60)<.01)
m.structures=[wall];const blocked=query();assert(Math.abs(middle(blocked).y+25.01)<.01)
assert(blocked.points.every(p=>p.y>=-25.011));assert(!e.explored.some(Boolean),'preview changed exploration')
revealMapSight(e);assert(e.explored[75*w+60]);assert(!e.explored[74*w+60])
// A thin wall splits the visible fan at its actual face, even within a tile.
const canvas=createCanvas(600,600),g=canvas.getContext('2d')
drawMapPlayer(g as unknown as CanvasRenderingContext2D,300,540,0,{scale:5,sight:blocked})
assert(g.getImageData(300,430,1,1).data[3]>0)
assert.equal(g.getImageData(300,400,1,1).data[3],0)
writeFileSync(out+'/map-clipped-fan.png',canvas.toBuffer('image/png'))
checks.push('Preview and exploration share exact thin-wall hits; fan pixels beyond wall stay transparent; preview is read-only')

wall.solid=false;assert(Math.abs(middle(query()).y+60)<.01)
wall.solid=true;wall.floor=1;assert(Math.abs(middle(query()).y+60)<.01)
wall.floor=0;wall.data!.noSight=1;assert(Math.abs(middle(query()).y+60)<.01)
delete wall.data!.noSight;wall.data!.top=.8;assert(Math.abs(middle(query()).y+60)<.01)
wall.data!.top=2.7
// Nearer collider wins regardless of list order, not whichever is visited first.
const near={...wall,y:75.6,h:.1};m.structures=[wall,near]
assert(Math.abs(middle(query()).y+24.8)<.01)
m.structures=[near,wall];assert(Math.abs(middle(query()).y+24.8)<.01)
m.structures=[];for(let x=0;x<w;x++)m.tiles[80*w+x]=0
assert(Math.abs(middle(query()).y+19.5)<.01)
checks.push('Open doors, other floors, low furniture, noSight, nearest hit and tile walls obey the same sight rules')

// Use real Three objects: the unrelated lighter precedes pool slots and shadows
// reorder the final uniforms. Check every pool position, not just nearest light.
for(const count of [8,16,48])for(const shadows of [0,2])for(const portable of [0,1,2,count-1]){
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),lighter=new THREE.PointLight(),pool=Array.from({length:count},(_,i)=>{
  const p=new THREE.PointLight();p.castShadow=i<shadows;p.userData.l0Baked=i!==portable;return p
 })
 scene.add(lighter,...pool);syncL0PointMask(scene,camera)
 const sorted=[lighter,...pool].sort((a,b)=>Number(b.castShadow)-Number(a.castShadow))
 for(let i=0;i<sorted.length;i++)assert.equal(l0StaticPointMask.value[i],sorted[i]===lighter||sorted[i]===pool[portable]?0:1)
 assert(l0StaticPointMask.value.slice(sorted.length).every(v=>v===0))
}
checks.push('24 light configurations: all portable slots retained, baked fixtures filtered, unrelated lighter/shadow ordering correct, unused slots clear')
const scene=new THREE.Scene(),group=new THREE.Group(),live=new THREE.PointLight(),hidden=new THREE.PointLight(),camera=new THREE.PerspectiveCamera()
hidden.visible=false;hidden.userData.l0Baked=true;group.add(live);scene.add(hidden,group);syncL0PointMask(scene,camera);assert(l0StaticPointMask.value.every(v=>v===0))
checks.push('Nested live lights and invisible lights preserve correct shader ordering')
m.tiles.fill(1);m.structures=[wall];const times:number[]=[]
for(let i=0;i<120;i++){const t=performance.now();query();if(i>=20)times.push(performance.now()-t)}times.sort((a,b)=>a-b)
const report={pass:true,checks,mapCpu:{median:times[50],p95:times[95],samples:100,scenario:'120x120, thin wall, 60m, forced uncached query; Node CPU'}}
writeFileSync(out+'/visibility.json',JSON.stringify(report,null,2));console.log(report)

