import * as THREE from 'three'
import type {Engine} from '../src/game/engine'
import {l2Material} from '../src/game/renderer/l2Materials'
import {updateInfiniteWindow} from '../src/game/engine/level'

export async function checkL2WallStreaming(engine:Engine,groups:Map<string,{group:THREE.Group}>) {
 const settle=()=>new Promise<void>(resolve=>{let n=65;function frame(){if(--n<0)resolve();else requestAnimationFrame(frame)}frame()})
 const results:unknown[]=[]
 for(const seed of [14,34,48]){
  engine.loadLevel(2,{mapSeed:seed,firstVisit:false});engine.introT=0
  await settle()
  for(const [dx,dy] of [[0,64],[0,-64],[64,0],[-64,0]]){
   engine.player.x+=dx;engine.player.y+=dy;updateInfiniteWindow(engine);await settle()
   const result=inspectL2Walls(engine,groups)
   if(result.missing)throw new Error(JSON.stringify({seed,dx,dy,...result}))
   results.push({seed,dx,dy,faces:result.faces,missing:0})
  }
 }
 return {pass:true,checks:results.length,results}
}
export function inspectL2Walls(engine:Engine,groups:Map<string,{group:THREE.Group}>) {
 const m=engine.map,targets:THREE.Object3D[]=[],misses:{x:number;y:number;dx:number;dy:number}[]=[]
 const mats=new Set(['tidy','narrow','dim','dirty','warped'].map(v=>l2Material(v,'wall')))
 for(const {group} of groups.values()){group.updateWorldMatrix(true,true);group.traverse(o=>{if(o instanceof THREE.Mesh&&mats.has(o.material as THREE.MeshStandardMaterial))targets.push(o)})}
 const ray=new THREE.Raycaster();ray.far=.61;let faces=0
 for(let y=2;y<m.h-2;y++)for(let x=2;x<m.w-2;x++){
  if(m.tiles[y*m.w+x]!==1)continue
  if(m.exits.some(e=>Math.abs(e.x-x)<2&&Math.abs(e.y-y)<2))continue
  for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){
   if(m.tiles[(y+dy)*m.w+x+dx]===1)continue
   faces++;ray.set(new THREE.Vector3(x+.5,1.55,y+.5),new THREE.Vector3(dx,0,dy))
   if(!ray.intersectObjects(targets,false).some(h=>Math.abs(h.distance-.5)<.02))misses.push({x:x+(m.inf?.ox??0),y:y+(m.inf?.oy??0),dx,dy})
  }
 }
 return {faces,missing:misses.length,examples:misses.slice(0,12)}
}
