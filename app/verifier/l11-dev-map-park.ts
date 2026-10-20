import * as THREE from 'three'
import { canOccupy } from '../src/game/core/player'
import { floorHeight } from '../src/game/world/mapgen'
import { l11CityPlan, l11World } from '../src/game/world/l11Layout'
import { l11OfficeExit } from '../src/game/world/l11ExitPlan'
import { l11BuildingExitInstance, exitDistance } from '../src/game/world/devExitSearch'
import { updateMovement } from '../src/game/engine/movement'
const assert=(v:unknown,message:string)=>{if(!v)throw Error(message)}
export function attachDevMapPark(qa:any){
  const eng=qa.eng,seed=eng.map.inf.seed
  eng.devEnabled=true;eng.dev.noclip=eng.dev.fly=false;eng.dev.frozenAI=true
  const state=()=>({x:eng.player.x+(eng.map.inf?.ox??0),y:eng.player.y+(eng.map.inf?.oy??0),z:eng.player.z,floor:eng.player.floor,level:eng.player.level,exits:eng.map.exits.length})
  const same=(a:any,b:any)=>a.x===b.x&&a.y===b.y&&a.z===b.z&&a.floor===b.floor
  const free=()=>canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:eng.player.z,band:eng.player.floor})
  const settle=async()=>{await qa.warm();qa.r.applyView(eng);await new Promise(r=>setTimeout(r,250))}
  qa.toolsQA={
    state,
    async teleport(kind:string){
      const before=state(),start=performance.now(),out=await eng.devOperateExit(kind,'teleport')
      assert(out.ok,JSON.stringify(out));assert(free(),'teleport collision: '+kind)
      const e=eng.map.exits.filter((e:any)=>e.def.kind===kind).sort((a:any,b:any)=>exitDistance(a,eng.player.x,eng.player.y,eng.player.z)-exitDistance(b,eng.player.x,eng.player.y,eng.player.z))[0]
      const actual={id:e.l11?.id,x:e.x+.5+eng.map.inf.ox,y:e.y+.5+eng.map.inf.oy,floor:e.floor??0}
      if(e.l11){
        const mx=Math.floor((before.x-16)/1024),my=Math.floor((before.y-16)/1024),all=[]
        for(let y=my-1;y<=my+1;y++)for(let x=mx-1;x<=mx+1;x++)for(const b of l11CityPlan(seed,x,y).buildings){const q=l11BuildingExitInstance(b,e.def);if(q)all.push(q)}
        if(kind==='basebeta')for(const b of l11CityPlan(seed,0,0).buildings){const q=l11BuildingExitInstance(b,e.def);if(q)all.push(q)}
        const expected=all.sort((a,b)=>exitDistance(a,before.x,before.y,before.z)-exitDistance(b,before.x,before.y,before.z))[0]
        assert(e.l11.id===expected?.l11?.id,'teleport did not choose nearest '+kind)
      }
      eng.scanInteract();await settle();return {...out,before,after:state(),actual,elapsed:performance.now()-start,safe:free(),target:eng.interactTarget?.label}
    },
    async restore(kind:string){
      const before=state(),e=eng.map.exits.find((e:any)=>e.def.kind===kind);assert(e,'missing restore target')
      const id=e.l11?.id;eng.map.exits=eng.map.exits.filter((q:any)=>q!==e)
      for(const c of eng.map.inf.chunks.values())c.exits=c.exits.filter((q:any)=>q!==e)
      const out=await eng.devOperateExit(kind,'summon');assert(out.ok,JSON.stringify(out));assert(same(before,state()),'summon moved player')
      const restored=eng.map.exits.find((q:any)=>q.l11?.id===id);assert(restored?.l11?.angle===e.l11?.angle&&restored?.floor===e.floor,'restored metadata changed')
      await settle();const duplicate=await eng.devOperateExit(kind,'summon');assert(!duplicate.ok&&same(before,state()),'duplicate summon teleported')
      return {out,duplicate,id,after:state()}
    },
    async reject(){
      qa.moveTo(26.5,26.5);eng.player.floor=0;eng.player.z=floorHeight(eng.map,eng.player.x,eng.player.y,0)+.02
      const before=state(),out=await eng.devOperateExit('l11unfinisheddoor','summon');assert(!out.ok&&same(before,state()),'ineligible summon changed position')
      const controller=new AbortController(),pending=eng.devOperateExit('l11brickdoor','teleport',controller.signal);controller.abort()
      const cancelled=await pending;assert(!cancelled.ok&&same(before,state()),'cancelled search moved player')
      const absent=await eng.devOperateExit('not-a-real-exit','teleport');assert(!absent.ok&&same(before,state()),'missing exit generated or moved')
      return {out,cancelled,absent,before,after:state()}
    },
    async office(){
      const plan=l11CityPlan(seed,0,0)
      for(const b of plan.buildings){
        if(b.exit)continue;const exit=l11OfficeExit(b,seed);if(!exit)continue
        const [x,y]=l11World(b,...exit.center),angle=b.angle+exit.angle
        qa.moveTo(x+Math.sin(angle)*1.2,y-Math.cos(angle)*1.2);eng.player.z=b.base+exit.floor*3+.02;eng.player.floor=exit.floor
        if(!free())continue
        const before=state(),out=await eng.devOperateExit('l11officedoor','summon')
        if(!out.ok)continue
        assert(same(before,state()),'new office summon moved player');qa.look.yaw=Math.atan2(-(x-state().x),-(y-state().y));qa.look.pitch=0;await settle()
        const e=eng.map.exits.find((e:any)=>e.l11?.buildingId===b.id);assert(e,'new office not attached to host')
        assert(!canOccupy(eng.map,e.x+.5,e.y+.5,.32,{z:e.z,band:e.floor}),'new door has no collision')
        return {out,host:b.id,floor:e.floor,doorCollision:true,after:state()}
      }
      throw Error('No eligible office could receive a newly summoned exit')
    },
    async sign(){
      qa.moveTo(529,540);eng.player.floor=0;eng.player.z=floorHeight(eng.map,eng.player.x,eng.player.y,0)+.02
      const before=state(),count=eng.map.exits.length,out=await eng.devOperateExit('l11roadback','summon')
      assert(out.ok,JSON.stringify(out));assert(same(before,state())&&eng.map.exits.length===count+1,'sign summon failed/moved')
      const e=eng.map.exits.at(-1),world={x:e.x+eng.map.inf.ox,y:e.y+eng.map.inf.oy}
      await settle();const repeat=await eng.devOperateExit('countrypath','summon');assert(!repeat.ok,'adjacent exit signs allowed')
      return {out,repeat,world,after:state()}
    },
    async generic(){
      await qa.scene(0,'open',seed);eng.devEnabled=true;eng.dev.fly=eng.dev.noclip=false
      const before=state(),summon=await eng.devOperateExit('flickerdoor','summon')
      assert(summon.ok&&same(before,state()),'L0 summon failed '+JSON.stringify(summon))
      const teleport=await eng.devOperateExit('flickerdoor','teleport');assert(teleport.ok&&free(),'L0 safe teleport failed '+JSON.stringify(teleport))
      await settle();return {summon,teleport,safe:free(),after:state()}
    },
    async park(view=0){
      qa.moveTo(143+view*4,-623);eng.player.floor=0;eng.player.z=floorHeight(eng.map,eng.player.x,eng.player.y,0)+.02;eng.player.crouching=view===1
      qa.look.yaw=view===2?2.2:-.75;qa.look.pitch=view===1?-.3:-.16;qa.freezeRenderTime(10);await settle();assert(free(),'park pose blocked')
      const points=[],ray=new THREE.Raycaster();qa.r.scene.updateMatrixWorld(true)
      for(let dy=-6;dy<=6;dy+=3)for(let dx=-6;dx<=6;dx+=3){
        const x=eng.player.x+dx,y=eng.player.y+dy,h=floorHeight(eng.map,x,y,0)
        ray.set(new THREE.Vector3(x,h+.25,y),new THREE.Vector3(0,-1,0));ray.far=.4
        const hits=ray.intersectObjects(qa.r.scene.children,true).filter(h=>h.object.visible&&(h.face?.normal.y??0)>.9)
        const layers=hits.map(hit=>{const mat=(hit.object as THREE.Mesh).material as THREE.Material;return {kind:mat.userData.l11Surface,y:hit.point.y}}).filter(hit=>hit.kind&&Math.abs(hit.y-h)<.08)
        if(!layers.some(l=>l.kind==='grass'))continue
        assert(!layers.some(l=>l.kind==='concrete'||l.kind==='paving'),'concrete intersects rendered park: '+JSON.stringify({dx,dy,layers}))
        points.push({x:x+eng.map.inf.ox,y:y+eng.map.inf.oy,layers})
      }
      assert(points.length>8,'insufficient park geometry samples')
      const start=state();eng.input.mx=0;eng.input.my=1
      for(let i=0;i<24;i++)updateMovement(eng,1/60,{dmg:1,drain:1},false)
      eng.input.mx=eng.input.my=0;assert(free()&&state().y>start.y+.4,'park walk blocked')
      await settle();return {view,samples:points.length,points,walk:[start,state()],stats:qa.stats()}
    },
  }
}
