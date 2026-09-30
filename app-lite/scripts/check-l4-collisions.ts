import assert from 'node:assert/strict'
import {generateLevel,structStandTopAt,enableRuntimeStructCollisionIndex} from '../src/game/world/mapgen'
import {canOccupy,moveStep} from '../src/game/core/player'
import {L4} from '../src/game/levels/l4'
import type {Structure} from '../src/game/core/types'

const original=generateLevel(L4,424242),m={...original,inf:undefined,structures:[] as Structure[]}
m.tiles=new Uint8Array(m.w*m.h).fill(1);m.elev=new Uint8Array(m.w*m.h);m.tint=new Uint8Array(m.w*m.h).fill(51);m.stair=new Int32Array(m.w*m.h);m.crawl=new Uint8Array(m.w*m.h)
let checks=0
const check=(v:unknown,message:string)=>{assert.ok(v,message);checks++}
for(const deg of [90,270]){
  m.structures=[{kind:'cubicle',x:20,y:20,w:4,h:2,solid:true,data:{l4:1,deg}}]
  for(const z of [0,.75,1.2])check(!canOccupy(m,22,20.04,.32,{z,band:0}),'panel blocks below its real top')
  for(const y of [19.70,19.98,20.05,20.38]){
    const top=structStandTopAt(m,22,y,1.34,0)
    check(top===1.37,'partition supports the complete foot radius, even outside its tile')
    check(canOccupy(m,22,y,.32,{z:top,band:0}),'landing never embeds the body')
  }
  const q={x:22,y:19.45};let z=.02,vz=5.4
  for(let n=0;n<180;n++){
    moveStep(m,q,0,.012,.32,{z,band:0})
    const g=Math.max(0,structStandTopAt(m,q.x,q.y,z,0));vz-=11/120;z+=vz/120
    if(z<=g){z=g;vz=0}
    check(canOccupy(m,q.x,q.y,.32,{z,band:0}),'jump and landing remain occupiable')
  }
  check(q.y>20.8,'jumped partition can be left without sticking')
  for(const [x,y]of [[22,20.04],[deg===270?20.06:23.94,21],[deg===270?20.06:23.94,20.04]]){
    const stuck={x,y};check(!canOccupy(m,x,y),'legacy embedded sample')
    moveStep(m,stuck,.01,.01)
    check(canOccupy(m,stuck.x,stuck.y),'embedded edge/corner recovers to a valid nearby point')
    check(Math.hypot(stuck.x-x,stuck.y-y)<.6,'recovery stays local')
  }
}
for(const axis of ['x','y']){
  const d:Structure={kind:'glassdoor',x:20,y:20,w:1,h:1,solid:true,data:{l4:1,axis,open:0}}
  m.structures=[d];enableRuntimeStructCollisionIndex(m)
  const dx=axis==='y'?1:0,dy=dx?0:1
  check(!canOccupy(m,20.5,20.5),'closed door blocks its leaf')
  for(const sign of [-1,1])check(canOccupy(m,20.5+dx*.45*sign,20.5+dy*.45*sign),'no metre-wide invisible glass door box')
  d.solid=false;d.data!.open=1
  check(!canOccupy(m,20.5+(axis==='x'?.46:0),20.5+(axis==='y'?.46:0),.01),'open door retains its thin jamb collision')
  // Rebuild while open, like restoring an open door from a save.
  enableRuntimeStructCollisionIndex(m);check(canOccupy(m,20.5,20.5),'open door clear')
  d.solid=true;d.data!.open=0
  check(!canOccupy(m,20.5,20.5),'door closed after open-state index rebuild blocks again')
  d.solid=false
  for(const sign of [-1,1]){
    const p={x:20.5-dx*sign,y:20.5-dy*sign}
    for(let i=0;i<80;i++)moveStep(m,p,dx*sign*.025,dy*sign*.025)
    check((p.x-20.5)*dx*sign+(p.y-20.5)*dy*sign>.9,'open door crosses from either side')
  }
}
console.log(JSON.stringify({checks,cubicleOrientations:2,glassDoorAxes:2}))
