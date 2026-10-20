import { canOccupy } from '../src/game/core/player'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { l11Local,l11World } from '../src/game/world/l11Layout'
import { l11FacelingActivity } from '../src/game/engine/l11FacelingAI'
import { l11PedestrianSurface } from '../src/game/world/l11PedestrianSpace'
import { floorHeight,structColliders,solidStructAtFloor } from '../src/game/world/mapgen'
import { inPolygon } from '../src/game/world/l11Geometry'
import { mapSight } from '../src/game/world/mapSight'

export function attachL11NavigationInteriors(qa:any){
  const eng=qa.eng,r=qa.r,frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
  qa.cityFix={
    async enter(){
      await qa.cityFix.view('shop')
      const m=eng.map,e=m.entities.find((e:any)=>e.l11Home?.role==='shopkeeper'),b=m.structures.find((s:any)=>s.l11?.id===e.l11Home.buildingId).l11
      const nx=Math.sin(b.doorAngle),ny=-Math.cos(b.doorAngle),wx=b.door[0]+nx*2.2,wy=b.door[1]+ny*2.2
      eng.player.x=wx-m.inf.ox;eng.player.y=wy-m.inf.oy;eng.player.z=floorHeight(m,eng.player.x,eng.player.y);eng.player.floor=0
      qa.look.yaw=Math.atan2(nx,ny);qa.look.pitch=-.08;await qa.warm()
      qa.setFrozen(false);eng.dev.god=true;eng.dev.statLock=true;eng.dev.frozenAI=false
      // Warm the real outside simulation first, then walk across the threshold.
      await new Promise(resolve=>setTimeout(resolve,1000))
      const frames:number[]=[],from=[eng.player.x,eng.player.y];let last=performance.now(),maxCPU=0,steps=0
      const update=eng.update.bind(eng);eng.update=(dt:number)=>{const t=performance.now();update(dt);maxCPU=Math.max(maxCPU,performance.now()-t);steps++}
      dispatchEvent(new KeyboardEvent('keydown',{code:'KeyW'}))
      const start=performance.now()
      try{while(performance.now()-start<5500){
        await frame();const now=performance.now();frames.push(now-last);last=now
        if(Math.hypot(eng.player.x-from[0],eng.player.y-from[1])>4.1)break
      }}finally{dispatchEvent(new KeyboardEvent('keyup',{code:'KeyW'}));eng.update=update;qa.setFrozen(true);eng.dev.frozenAI=true}
      const x=eng.player.x+m.inf.ox,y=eng.player.y+m.inf.oy
      if(!inPolygon(x,y,b.footprint)||Math.hypot(eng.player.x-from[0],eng.player.y-from[1])<3.8)throw Error('Could not walk through the building entrance')
      if(!canOccupy(m,eng.player.x,eng.player.y,.32,{z:eng.player.z,band:0}))throw Error('Entrance walk ended inside collision geometry')
      frames.sort((a,b)=>a-b)
      return {inside:true,building:b.id,world:[x,y,eng.player.z],steps,maxSimulationMs:maxCPU,frames:frames.length,median:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1)}
    },
    parity(){
      const m=eng.map;let checks=0,blocked=0,open=0
      // Compare the optimized lookup against a full scan of the actual solids
      // published by the production mesh builders, including a window rebase.
      for(const s of m.structures.filter((s:any)=>s.l11&&!s.l11.sealed).slice(0,5))for(const shift of [0,32]){
        const st={...s,x:s.x-shift,y:s.y+shift},map={...m,structures:[st]},boxes=structColliders(st,map)
        for(let f=0;f<st.l11.accessible;f++)for(let i=0;i<450;i++){
          const x=st.x+(i*.61803398875%1)*st.w,y=st.y+(i*.41421356237%1)*st.h
          const expected=x>=0&&y>=0&&x<m.w&&y<m.h&&boxes.some(b=>x>=b.x0&&x<=b.x1&&y>=b.y0&&y<=b.y1&&(!b.polygon||inPolygon(x,y,b.polygon))&&!(b.stand&&f*3>=b.top-.06)&&f*3+1.48>(b.bottom??0)+.0001&&f*3<b.top-.0001)
          const actual=solidStructAtFloor(map,x,y,f)
          if(actual!==expected)throw Error(`Collider index mismatch ${st.l11.id}:${f}:${x},${y}`)
          checks++;if(actual)blocked++;else open++
        }
      }
      const old=eng.los;let rays=0;eng.los=(...args:any[])=>{rays++;return old.apply(eng,args)}
      try{eng.computeVisibility()}finally{eng.los=old}
      if(rays)throw Error('City visibility repeated legacy LOS rays')
      const cells=new Set(mapSight(eng).cells)
      for(let i=0;i<eng.visible.length;i++){if(!!eng.visible[i]!==cells.has(i))throw Error('City map and live visibility disagree');checks++}
      if(!blocked||!open)throw Error('Collision oracle must cover walls and empty room space')
      return {checks,blocked,open,legacyVisibilityRays:rays}
    },
    async view(kind='office'){
      qa.setFrozen(true);eng.dev.invisible=true;eng.dev.frozenAI=true
      qa.moveTo(210,105);await qa.warm()
      const m=eng.map,role=kind==='office'?'office':'shopkeeper'
      const e=m.entities.find((e:any)=>e.l11Home?.role===role&&(role!=='office'||e.l11Home.floor===1))
      if(!e)throw Error('Missing natural indoor fixture '+kind)
      const h=e.l11Home,b=m.structures.find((s:any)=>s.l11?.id===h.buildingId).l11
      const room=l11InteriorPlan(b).floors[h.floor].rooms.find(v=>v.id===h.roomId)!
      const target=l11World(b,room.x+room.w/2,room.y+room.h/2)
      eng.player.x=h.position[0]-m.inf.ox;eng.player.y=h.position[1]-m.inf.oy;eng.player.z=b.base+h.floor*3+.03
      let found=false
      outer:for(const radius of [3.2,2.6,4.2,2])for(const turn of [.4,-.4,0,.8,-.8,1.5,-1.5,Math.PI]){
        const angle=h.facing+turn,x=h.position[0]+Math.cos(angle)*radius,y=h.position[1]+Math.sin(angle)*radius,[u,v]=l11Local(b,x,y)
        if(u<room.x+.4||u>room.x+room.w-.4||v<room.y+.4||v>room.y+room.h-.4||!canOccupy(m,x-m.inf.ox,y-m.inf.oy,.32,{z:eng.player.z,band:h.floor}))continue
        eng.player.x=x-m.inf.ox;eng.player.y=y-m.inf.oy;found=true;break outer
      }
      if(!found)throw Error('No clear room camera')
      if(kind==='street'){const p=b.door;eng.player.x=p[0]+Math.sin(b.doorAngle)*3-m.inf.ox;eng.player.y=p[1]-Math.cos(b.doorAngle)*3-m.inf.oy;eng.player.z=b.base+.03}
      qa.look.yaw=Math.atan2(eng.player.x+m.inf.ox-target[0],eng.player.y+m.inf.oy-target[1]);qa.look.pitch=-.12;qa.look.roll=0;r.setFov(75)
      await qa.warm()
      if(kind!=='street'&&!canOccupy(m,eng.player.x,eng.player.y,.28,{z:eng.player.z,band:h.floor}))throw Error('Camera intersects furnished room')
      return {kind,building:b.id,room:room.id,floor:h.floor,position:[eng.player.x+m.inf.ox,eng.player.y+m.inf.oy,eng.player.z],look:{...qa.look}}
    },
    async measure(){
      const values:any[]=[],old=r.render.bind(r)
      r.render=(...args:any[])=>{const t=performance.now();old(...args);values.push({cpu:performance.now()-t,draws:r.three.info.render.calls,triangles:r.three.info.render.triangles})}
      try{const stats=await qa.sample(120,2400),q=(key:string,p:number)=>values.map(v=>v[key]).sort((a,b)=>a-b)[Math.floor(values.length*p)]
        let groups=0,visible=0,empty=0;r.chunkGroups.forEach((c:any)=>{for(const g of c.l9Interiors){groups++;if(g.group.visible)visible++;if(!g.group.children.length)empty++}})
        return {stats,draws:{p50:q('draws',.5),p95:q('draws',.95)},triangles:{p50:q('triangles',.5),p95:q('triangles',.95)},interiors:{groups,visible,empty}}
      }finally{r.render=old}
    },
    async walkers(seconds=180){
      qa.moveTo(220,220);await qa.warm();eng.dev.frozenAI=false;eng.dev.invisible=true
      eng.player.z=floorHeight(eng.map,eng.player.x,eng.player.y);eng.player.floor=0
      const m=eng.map,records=new Map<number,any>()
      try{for(let i=0;i<seconds*30;i++){
        eng.updateEntities(1/30,1)
        for(const e of m.entities){if(e.l11Home?.role!=='pedestrian')continue
          let a=records.get(e.id);if(!a){a={id:e.id,home:e.l11Home.id,activities:{},travel:0,last:[e.x,e.y],stalled:0,maxStalled:0};records.set(e.id,a)}
          const activity=l11FacelingActivity(e);if(activity)a.activities[activity.activity]=(a.activities[activity.activity]??0)+1/30
          const moved=Math.hypot(e.x-a.last[0],e.y-a.last[1]);a.stalled=moved<.001?a.stalled+1/30:0;a.maxStalled=Math.max(a.maxStalled,a.stalled);a.last=[e.x,e.y];a.travel+=moved
          if(i%15===0){const wx=e.x+m.inf.ox,wy=e.y+m.inf.oy,data=m.inf.chunks.get(`${Math.floor(wx/32)},${Math.floor(wy/32)}`)?.l11
            if(!data||!l11PedestrianSurface(data,wx,wy)||!canOccupy(m,e.x,e.y,.28,{z:e.z,band:0}))throw Error('Walker left safe pavement: '+e.l11Home.id)
          }
          if(i===seconds*30-1){a.world=[e.x+m.inf.ox,e.y+m.inf.oy,e.z];a.activity=activity;const data=m.inf.chunks.get(`${Math.floor(a.world[0]/32)},${Math.floor(a.world[1]/32)}`).l11;a.surface=l11PedestrianSurface(data,a.world[0],a.world[1])}
        }
        if(i%60===0)await frame()
      }}finally{eng.dev.frozenAI=true}
      const result=[...records.values()]
      if(result.some(a=>a.maxStalled>10||a.travel<110))throw Error('A pedestrian still stalls in the runtime crossing fixture')
      return result
    },
  }
}
