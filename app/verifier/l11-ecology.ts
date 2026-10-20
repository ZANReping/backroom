import { L11 } from '../src/game/levels/l11'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { canOccupy } from '../src/game/core/player'
import { l11PedestrianSurface } from '../src/game/world/l11PedestrianSpace'
import { l11Local } from '../src/game/world/l11Layout'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11FacelingActivity } from '../src/game/engine/l11FacelingAI'
import type { Entity } from '../src/game/entities'
import type { L11FacelingHome } from '../src/game/world/l11FacelingTypes'

export function attachL11Ecology(qa:any){
  const eng=qa.eng,frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()))
  let checks=0,subject:Entity|undefined
  const ok=(v:unknown,label:string)=>{if(!v)throw Error(label);checks++}
  const state=()=>({checks,entities:eng.map.entities.map((e:Entity)=>({id:e.id,home:e.l11Home,world:[e.x+eng.map.inf.ox,e.y+eng.map.inf.oy,e.z],state:e.state,activity:l11FacelingActivity(e)})),stats:qa.stats()})
  const pose=(e:Entity)=>{
    const m=eng.map,h=e.l11Home!,b=m.structures.find((s:any)=>s.l11?.id===h.buildingId)?.l11
    const room=b&&l11InteriorPlan(b).floors[h.floor]?.rooms.find(r=>r.id===h.roomId)
    let found=false
    camera:for(const radius of [3.2,2.6,2.1,4.2])for(const turn of [.4,-.4,0,.8,-.8,1.5,-1.5,Math.PI]){
      const angle=h.facing+turn,x=e.x+Math.cos(angle)*radius,y=e.y+Math.sin(angle)*radius
      if(room){const [u,v]=l11Local(b,x+m.inf.ox,y+m.inf.oy);if(u<room.x+.4||u>room.x+room.w-.4||v<room.y+.4||v>room.y+room.h-.4)continue}
      if(!canOccupy(m,x,y,.32,{z:e.z,band:h.floor}))continue
      eng.player.x=x;eng.player.y=y;eng.player.z=e.z;qa.look.yaw=Math.atan2(x-e.x,y-e.y);qa.look.pitch=-.09;qa.look.roll=0;qa.r.setFov(68);found=true;break camera
    }
    ok(found,'safe same-room camera position');return {player:[eng.player.x+m.inf.ox,eng.player.y+m.inf.oy,eng.player.z],look:{...qa.look},entity:h.id}
  }
  qa.ecology={state,
    async worker(){
      const q={key:'ecology-qa',def:L11,seed:20261006,cx:5,cy:2,revision:0}
      const w=new Worker(new URL('../src/game/world/l11.worker.ts',import.meta.url),{type:'module'})
      try{const raw:any=await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('Worker timeout')),30000);w.onmessage=e=>{clearTimeout(t);e.data.error?reject(Error(e.data.error)):resolve(e.data.raw)};w.onerror=e=>{clearTimeout(t);reject(Error(e.message))};w.postMessage(q)})
        const direct=genL11ChunkRaw(L11,q.seed,q.cx,q.cy)
        ok(JSON.stringify(raw.entities)===JSON.stringify(direct.entities),'real Worker/main ecology parity')
        ok(JSON.stringify(raw.l11.crosswalks)===JSON.stringify(direct.l11!.crosswalks),'real Worker/main crosswalk parity')
        return {checks,entities:raw.entities.length,crosswalks:raw.l11.crosswalks.length}
      }finally{w.terminate()}
    },
    async setup(home?:L11FacelingHome){
      qa.setFrozen(true);eng.dev.invisible=true;eng.dev.frozenAI=true
      qa.moveTo(home?.position[0]??220,home?.position[1]??220)
      eng.map.entities=eng.map.entities.filter((e:Entity)=>!!e.l11Home)
      subject=home?eng.map.entities.find((e:Entity)=>e.l11Home?.id===home.id):eng.map.entities.find((e:Entity)=>e.l11Home?.role==='pedestrian')
      ok(subject,'naturally generated subject exists');eng.player.z=subject!.z
      const view=pose(subject!);await qa.warm()
      for(const e of eng.map.entities)ok(canOccupy(eng.map,e.x,e.y,.28,{z:e.z,band:e.l11Home.floor}),'spawn remains clear after production meshes publish colliders: '+e.l11Home.id)
      return {...state(),view}
    },
    async simulate(seconds=90){
      const m=eng.map,entities=m.entities as Entity[],ids=entities.map(e=>e.l11Home!.id),samples:number[]=[],activities=new Set<string>()
      eng.dev.frozenAI=false
      try{for(let i=0;i<seconds*30;i++){
        const t=performance.now();eng.updateEntities(1/30,1);samples.push(performance.now()-t)
        for(const e of m.entities){const a=l11FacelingActivity(e);if(a)activities.add(a.activity)}
        if(i%15===0)for(const e of m.entities){
          const h=e.l11Home!
          ok(!e.provoked,'unprovoked city inhabitants stay neutral')
          ok(canOccupy(m,e.x,e.y,.28,{z:e.z,band:h.floor}),'production AI body collision: '+h.id)
          if(h.role==='pedestrian'){const x=e.x+m.inf.ox,y=e.y+m.inf.oy,data=m.inf.chunks.get(`${Math.floor(x/32)},${Math.floor(y/32)}`)?.l11;ok(data&&l11PedestrianSurface(data,x,y),'production AI stays on sidewalk/crossing')}
          else {const b=m.structures.find((s:any)=>s.l11?.id===h.buildingId)?.l11;ok(b,'indoor building retained');const room=l11InteriorPlan(b).floors[h.floor].rooms.find(r=>r.id===h.roomId)!,[x,y]=l11Local(b,e.x+m.inf.ox,e.y+m.inf.oy);ok(x>room.x&&x<room.x+room.w&&y>room.y&&y<room.y+room.h,'remains in assigned room/floor')}
        }
        if(i%60===0)await frame()
      }}finally{eng.dev.frozenAI=true}
      ok(ids.length===m.entities.length,'simulation does not duplicate population')
      samples.sort((a,b)=>a-b)
      const result={...state(),seconds,activities:[...activities],aiMs:{p50:samples[Math.floor(samples.length*.5)],p95:samples[Math.floor(samples.length*.95)],max:samples.at(-1)}}
      const walkers=m.entities.filter((e:Entity)=>e.l11Home.role==='pedestrian')
      ok(walkers.some((e:Entity)=>(l11FacelingActivity(e)?.travel??0)>10),'street walkers progress in actual game')
      if(subject&&m.entities.includes(subject))pose(subject)
      await frame();return result
    },
    async crossingView(){
      eng.dev.frozenAI=false;const m=eng.map
      try{for(let i=0;i<1800;i++){
        eng.updateEntities(1/30,1)
        const e=m.entities.find((e:Entity)=>{if(e.l11Home?.role!=='pedestrian')return false;const x=e.x+m.inf.ox,y=e.y+m.inf.oy,data=m.inf.chunks.get(`${Math.floor(x/32)},${Math.floor(y/32)}`)?.l11;return data&&l11PedestrianSurface(data,x,y)==='crosswalk'&&data.crosswalks.some((c:any)=>Math.abs((x-c.center[0])*c.axis[1]-(y-c.center[1])*c.axis[0])<c.width/2-1.5)}) as Entity|undefined
        if(e){const view=pose(e);await qa.warm();ok(true,'natural pedestrian visibly occupies marked crossing');return {checks,view,world:[e.x+m.inf.ox,e.y+m.inf.oy,e.z],activity:l11FacelingActivity(e)}}
        if(i%60===0)await frame()
      }}finally{eng.dev.frozenAI=true}
      throw Error('No pedestrian reached middle of a marked crossing')
    },
    async rebase(){
      const m=eng.map,tracked=m.entities.filter((e:Entity)=>e.l11Home.role==='pedestrian'&&e.x>40&&e.x<150) as Entity[]
      ok(tracked.length>0,'tracked pedestrian for chunk shift')
      const before=tracked.map(e=>({e,x:e.x+m.inf.ox,y:e.y+m.inf.oy,home:JSON.stringify(e.l11Home)}))
      qa.moveTo(m.inf.ox+112,m.inf.oy+80)
      for(const {e,x,y,home}of before){ok(m.entities.includes(e),'walking entity survives chunk shift');ok(Math.hypot(e.x+m.inf.ox-x,e.y+m.inf.oy-y)<1e-6,'world position stable after shift');ok(JSON.stringify(e.l11Home)===home,'job anchors are not rebased twice')}
      ok(new Set(m.entities.filter((e:Entity)=>e.l11Home).map((e:Entity)=>e.l11Home!.id)).size===m.entities.filter((e:Entity)=>e.l11Home).length,'no duplicated ecological IDs after shift')
      await qa.warm();return {checks,tracked:before.length}
    },
    async retaliation(){
      const m=eng.map,e=m.entities.find((e:Entity)=>e.l11Home?.role==='pedestrian') as Entity
      ok(e,'retaliation subject');m.entities=[e];eng.dev.invisible=false;eng.dev.frozenAI=false
      e.provoked=true;e.state='chase';e.stateT=0;eng.player.x=e.x+3;eng.player.y=e.y;eng.player.z=e.z
      eng.updateEntities(1/30,1);ok(e.provoked&&(e.state==='chase'||e.state==='attack'),'provocation overrides civilian routine')
      eng.dev.invisible=true;e.state='chase';e.stateT=-9
      eng.updateEntities(1/30,1);ok(!e.provoked,'existing passive calm-down preserved')
      eng.dev.frozenAI=true;return {checks,state:e.state,activity:l11FacelingActivity(e)}
    },
  }
}
