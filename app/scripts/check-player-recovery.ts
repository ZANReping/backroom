import {mkdirSync,writeFileSync} from 'node:fs'
import {canOccupy,createIntegrator,integrateMove,resolvePlayerPenetration} from '../src/game/core/player'
import {structStandTopAt,setStructModelColliders,type GameMap} from '../src/game/world/mapgen'
import {L1_CRATE,l1CrateCollider} from '../src/game/world/l1Crate'

let checks=0,sweeps=0
const ok=(v:unknown,m:string)=>{checks++;if(!v)throw Error(m)}
const blank=()=>new Uint8Array(32*32)
const map=(structures:any[]=[])=>({w:32,h:32,tiles:blank().fill(1),structures,tint:blank(),elev:blank(),step:blank(),stair:blank(),liquid:blank(),wet:blank(),crawl:blank(),up:blank(),upWall:blank(),up2:blank(),upWall2:blank(),dn:blank(),dnWall:blank()}as unknown as GameMap)
for(const deg of [0,30,45,90,180])for(const stack of [1,2])for(const hz of [30,60,144])for(let a=0;a<8;a++){
 const s:any={kind:'crate',x:10,y:10,w:L1_CRATE.width,h:L1_CRATE.depth,solid:true,data:{l1Crate:1,l1Stack:stack,deg}},m=map([s]),c=l1CrateCollider(s)
 const start={x:s.x+s.w/2,y:s.y+s.h/2},p={...start,z:c.top,vz:0},it=createIntegrator(),dx=Math.cos(a*Math.PI/4),dy=Math.sin(a*Math.PI/4),dt=1/hz
 for(let i=0;i<hz*3;i++){
  integrateMove(m,p,dx,dy,1.3,dt,it,{z:p.z,band:0})
  const top=Math.max(0,structStandTopAt(m,p.x,p.y,p.z,0))
  if(p.z>top){p.vz-=11*dt;p.z+=p.vz*dt;if(p.z<=top){p.z=top;p.vz=0}}else{p.z=top;p.vz=0}
  resolvePlayerPenetration(m,p,.32,{z:p.z,band:0})
  ok(canOccupy(m,p.x,p.y,.32,{z:p.z,band:0}),`Lid/side agree: ${deg} stack ${stack} ${hz}Hz ${a} frame ${i}`)
 }
 ok(Math.hypot(p.x-start.x,p.y-start.y)>3.8,'Walk off without sticking or early loss of motion');ok(p.z===0,'Falls to real floor after clearing body footprint');sweeps++
}
// Late model bounds, ordinary props, rotated boxes and a closed door all use
// the same bounded recovery. Never alter altitude to escape an overlap.
for(const kind of ['crate','table','hoteldoor'] as const)for(const deg of [0,45,90]){
 const s:any={kind,x:10,y:10,w:1.2,h:.8,solid:true,data:{deg}},m=map([s])
 setStructModelColliders(s,[{x0:-.6,y0:-.4,x1:.6,y1:.4,bottom:0,top:2,stand:false}])
 const p={x:10.6,y:10.4},before={...p},d=resolvePlayerPenetration(m,p,.32,{z:0,band:0})
 ok(canOccupy(m,p.x,p.y,.32,{z:0,band:0}),kind+' late collider recovery clears the full body')
 ok(Math.hypot(d.x,d.y)<=2&&Math.hypot(p.x-before.x,p.y-before.y)>0,'Recovery remains local')
 const again=resolvePlayerPenetration(m,p,.32,{z:0,band:0});ok(again.x===0&&again.y===0,'No continuous drift after recovery')
}
const empty=map(),p={x:15.5,y:15.5};empty.tiles[15*32+15]=0
ok(resolvePlayerPenetration(empty,p,.32,{z:-1,band:0}).x===0&&p.x===15.5&&p.y===15.5,'Void/fall does not cause rescue teleport')
const walls=map();walls.tiles[15*32+15]=2
const q={x:15.9,y:15.5};resolvePlayerPenetration(walls,q,.32,{z:0,band:0});ok(canOccupy(walls,q.x,q.y,.32,{z:0,band:0}),'A body embedded in a wall gets a valid nearby exit')
mkdirSync('reports/hotbar-collision-shadow',{recursive:true});const result={passed:true,checks,sweeps}
writeFileSync('reports/hotbar-collision-shadow/collision.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result))
