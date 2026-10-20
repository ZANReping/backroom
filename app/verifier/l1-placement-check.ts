import * as THREE from 'three'
import {canOccupy} from '../src/game/core/player'
import {l1BakeStats} from '../src/game/renderer/l1BakeQueue'
import {l1PlanTile} from '../src/game/world/l1Plan'
import {l1BuildingRoof} from '../src/game/world/l1Building'
const L1_WALL_NORMALS=[[0,-1],[1,0],[0,1],[-1,0]] as const

const sleep=(ms=100)=>new Promise(r=>setTimeout(r,ms))
export async function mount(app:any,before:boolean,cases:any){
 const e=app.engine,r=app.renderer(),checks:string[]=[],records:any[]=[]
 const ok=(v:unknown,m:string)=>{if(!v)throw Error(m);checks.push(m)}
 const status=()=>({world:[e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy,e.player.z],yaw:app.look.yaw,pitch:app.look.pitch,fov:r.camera.fov,draws:r.three.info.render.calls,triangles:r.three.info.render.triangles,memory:{...r.three.info.memory},bakes:l1BakeStats()})
 const until=async(f:()=>unknown,label:string)=>{const start=performance.now();while(!f()){if(performance.now()-start>180000)throw Error('Timeout '+label);await sleep()}}
 const original=r.render.bind(r);r.three.info.autoReset=false;r.render=(...args:any[])=>{r.three.info.reset();return original(...args)}
 const warm=async()=>{await until(()=>{const b=l1BakeStats();return r.isNearWorldReady(e)&&!b.active&&!b.queued&&!r.chunkBuilds.size&&!r.retiredWorld.length&&!r.precompileRunning&&r.precompileTimer===null},'world/bake/compile');await sleep(600)}
 const pose=(x:number,z:number,yaw:number,pitch=0,fov=70,height=0)=>{
  let inf=e.map.inf;e.player.x=x-inf.ox;e.player.y=z-inf.oy;e.updateInfiniteWindow();inf=e.map.inf
  Object.assign(e.player,{x:x-inf.ox,y:z-inf.oy,z:height,vz:0,floor:0,flashlight:false});Object.assign(app.look,{yaw,pitch,roll:0});r.setFov(fov,35);e.time=15;e.input.mx=e.input.my=0
 }
 const prepare=async()=>{e.devEnabled=true;e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=true;e.dev.phenOff.add('flicker');e.handsStowed=true;e.blackoutT=e.blackoutWarnT=0;e.introT=0;document.querySelector<HTMLButtonElement>('[aria-label="收起开发者面板"]')?.click();await warm();ok(e.player.level===1&&!r.three.getContext().isContextLost(),'Actual App enters L1');return status()}
 const scene=async(name:string)=>{
  e.endBlackout();e.player.flashlight=false
  let target:any
  if(name==='gothic'){
   const p=cases.gothic;pose(p.x,p.y,p.yaw,p.pitch,p.fov,p.z);target=p
  }else if(name==='gothic-boundary'){
   const p=cases.gothic,x=p.centerX+59,z=p.centerY-1;pose(x+2,z+4,-.13,-.08,72);target={x,z}
  }else if(name==='wall-column'){
   const p=cases.wallColumn,options=[[2.3,2.7],[-2.3,2.7],[2.3,-2.7],[-2.3,-2.7]]
   const [dx,dz]=options.find(([dx,dz])=>{const t=l1PlanTile(20261006,p.x+dx,p.z+dz);return t.floor&&t.style==='gothic'})??options[0]
   pose(p.x+dx,p.z+dz,Math.atan2(dx,dz),-.08,76);target=p
  }else if(name==='stairs'||name==='unlockeddoor'){
   const p=cases[name],[dx,dz]=L1_WALL_NORMALS[p.dir];pose(p.x+.5-dx*.7,p.z+.5-dz*.7,Math.atan2(-dx,-dz),-.08,76);target=p
  }else if(name==='outpost'){
   const p=cases.alpha,[dx,dz]=L1_WALL_NORMALS[p.dir];pose(p.x+.5-dx*.65,p.z+.5-dz*.65,Math.atan2(-dx,-dz),-.08,86);target=p
  }else if(name==='wall-dressing'){
   await scene('outpost');const inf=e.map.inf
   const s=e.map.structures.find((s:any)=>['vent','socket','wallsign'].includes(s.kind)&&(before||typeof s.data?.l1WallDir==='number')&&r.structMeshes.has(s))
   ok(!!s,'Actual wall decoration is generated');const dir=typeof s.data?.l1WallDir==='number'?Number(s.data.l1WallDir):0,[dx,dz]=L1_WALL_NORMALS[dir],x=s.x+.5+inf.ox,z=s.y+.5+inf.oy
   const cx=x-dx*.6+dz*.45,cz=z-dz*.6-dx*.45,tx=x+dx*.47,tz=z+dz*.47,height=s.kind==='socket'?.5:s.kind==='vent'?1.3:1.65
   pose(cx,cz,Math.atan2(cx-tx,cz-tz),Math.atan2(height-1.62,Math.hypot(cx-tx,cz-tz)),78);target={kind:s.kind,x,z,dir}
  }
  await warm()
  if(!before){
   ok(canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:0}),name+' camera has real player clearance')
   if(name==='gothic-boundary'||name==='wall-column'){
    const inf=e.map.inf
    for(const c of inf.chunks.values())for(const b of c.l1?.boxes??[])if(b.style==='gothic'&&b.id.startsWith('column:')){
     const x=(b.min[0]+b.max[0])/2,z=(b.min[2]+b.max[2])/2
     ok(Math.abs(b.max[1]-l1BuildingRoof(inf.seed,x,z,true))<1e-6,'Loaded column reaches its own vault')
    }
   }
   if(name==='stairs'||name==='unlockeddoor'){
    const exit=e.map.exits.find((q:any)=>q.def.kind===name&&q.l1&&Math.hypot(q.x+e.map.inf.ox-target.x,q.y+e.map.inf.oy-target.z)<.01)
    ok(!!exit,'Correct '+name+' instance is in its owning chunk');e.scanInteract();ok(e.interactTarget?.kind==='exit'&&e.interactTarget.e===exit,'Actual sight interaction finds '+name)
    const root=[...r.chunkGroups.values()].flatMap((g:any)=>g.exitRoots).find((o:any)=>o.userData.exitRef===exit)
    ok(!!root,'Exit has a rendered interaction root');const position=new THREE.Vector3();root.getWorldPosition(position)
    const [dx,dz]=L1_WALL_NORMALS[exit.l1.wallDir]
    ok(Math.hypot(position.x-exit.x-.5-dx,position.z-exit.y-.5-dz)<.001,'Rendered portal is aligned with carved wall')
   }
   if(name==='outpost'){
    const s=e.map.structures.find((s:any)=>s.data?.l1EntranceId===target.id)
    ok(!!s,'Outpost is generated at the exterior path wall');e.scanInteract()
    ok(e.interactTarget?.kind==='landmark'&&e.interactTarget.s===s,'Actual sight interaction finds the shutter entrance')
    const root=r.structMeshes.get(s);ok(!!root,'Shutter has a normal rendered structure root')
    const mesh=new THREE.Box3().setFromObject(root),size=mesh.getSize(new THREE.Vector3())
    ok(Math.min(size.x,size.z)<.21&&mesh.max.y<=2.51,'Shutter is thin and fits under the path ceiling')
   }
  }
  const record={name,target,...status()};records.push(record);return record
 }
 return {prepare,scene,result:()=>({checks,records})}
}
