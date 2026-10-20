import * as THREE from 'three'
import type {Engine} from '../src/game/engine'
import type {Structure} from '../src/game/core/types'
import {canOccupy} from '../src/game/core/player'
import {buildL2Architecture} from '../src/game/renderer/l2Architecture'
import {l2DoorMaterial} from '../src/game/renderer/l2Door'
import {l2Material} from '../src/game/renderer/l2Materials'

export function checkL2Placement(eng:Engine,roots:Map<Structure,THREE.Group>) {
 let props=0,elbows=0,paints=0
 const fail=(message:string)=>{throw new Error(message)}
 const m=eng.map
 if(!canOccupy(m,m.spawn.x+.5,m.spawn.y+.5))fail('Rendered spawn is obstructed')
 for(const [s,g] of roots){
  if(!s.data?.l2WallProp)continue
  g.updateWorldMatrix(true,true)
  const b=new THREE.Box3().setFromObject(g),d=s.data.l2WallDir,tx=Math.floor(s.x+s.w/2),tz=Math.floor(s.y+s.h/2)
  const gap=d===0?b.min.z-tz:d===2?tz+1-b.max.z:d===3?b.min.x-tx:tx+1-b.max.x
  if(gap<.005||gap>.025)fail(`${s.kind} wall gap ${gap}`)
  props++
 }
 // Build production bends in a bounded fixture. Verify their entire outer
 // surfaces stay behind the corner, rather than only checking centre lines.
 for(const [v,width,length] of [['tidy',.72,2],['narrow',1.16,3],['dim',.38,1]] as const){
  const structures:Structure[]=Array.from({length},(_,i)=>({kind:'pipes',solid:true,x:3-width,y:2+i,w:width,h:1,data:{l2Service:v,side:1,phase:2+i}}))
  const tiles=new Uint8Array(5*8).fill(2);for(let y=0;y<8;y++)for(let x=0;x<3;x++)tiles[y*5+x]=1
  const fixture={...m,w:5,h:8,inf:undefined,tiles,structures},g=new THREE.Group()
  for(const _ of buildL2Architecture(fixture,{x0:0,y0:0,x1:5,y1:8,variant:v},g,structures,[],[])){}
  const pipe=g.getObjectByName(`l2-${v}-${v==='dim'?'steel':'insulation'}`) as THREE.Mesh
  if(!pipe)fail(`${v} bent pipes missing`)
  const pos=pipe.geometry.getAttribute('position')
  let closeToWall=0
  for(let i=0;i<pos.count;i++){
   if(pos.getZ(i)<2-.001||pos.getZ(i)>2+length+.001)fail(`${v} outer bend protrudes past wall corner`)
   if(pos.getX(i)>3-.035)closeToWall++
  }
  if(closeToWall<24)fail(`${v} pipe does not return to wall`)
  elbows+=2
  g.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose()})
 }
 for(const v of ['tidy','narrow','dim','dirty','warped'])for(let hue=0;hue<4;hue++){
  const wall=l2Material(v,'wall'),door=l2DoorMaterial(v,hue)
  if(door.map!==wall.map)fail(`${v} door uses different wall palette`)
  if(Math.abs(door.color.r-wall.color.r)>.12||Math.abs(door.color.g-wall.color.g)>.12||Math.abs(door.color.b-wall.color.b)>.12)fail('Door tint is too strong')
  paints++
 }
 return {pass:true,props,elbows,paints,spawn:true}
}
