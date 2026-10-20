// Real Engine, renderer, HUD and inventory from l0-remake's isolated save fixture.
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import HUD from '../src/components/HUD'
import InventoryOverlay from '../src/components/InventoryOverlay'
import { l11MapContext, fitL11Map } from '../src/game/content/l11MapModel'
import { drawL11Map } from '../src/game/content/l11Map'
import { l11MapPlanStatus, readL11MapPlans } from '../src/game/content/l11MapPlans'
import { l11CityPlan, l11World, l11Local, clearL11PlanCache } from '../src/game/world/l11Layout'
import { l11InteriorPlan } from '../src/game/world/l11Interiors'
import { canOccupy } from '../src/game/core/player'
import { updateMovement } from '../src/game/engine/movement'
import type { FloorBand } from '../src/game/core/types'
import type { L11Building } from '../src/game/world/l11Types'
import '../src/index.css'

export function attachL11MapUI(qa:any){
  if(!document.querySelector('meta[name=viewport]')){const meta=document.createElement('meta');meta.name='viewport';meta.content='width=device-width, initial-scale=1';document.head.append(meta)}
  const element=document.createElement('div');element.id='l11-map-test-root';document.body.append(element)
  const root=createRoot(element),eng=qa.eng
  let navigate=(value:boolean)=>{void value},visible=true
  function UI(){
    const [open,setOpen]=useState(false),[,refresh]=useState(0)
    navigate=setOpen
    useEffect(()=>{const id=setInterval(()=>refresh(n=>n+1),150);return ()=>clearInterval(id)},[])
    // App keeps HUD mounted beneath inventory; exercise shared map-worker ownership.
    return <><HUD engine={eng} isMobile={innerWidth<900} log={[]} toasts={[]} devMode={eng.devEnabled} fxScale={0} onPause={()=>{}} onInventory={()=>setOpen(true)} onSelectSlot={()=>{}} onUseSlot={()=>{}}/>{open&&<InventoryOverlay engine={eng} initialTab="地图" onClose={()=>setOpen(false)}/>}</>
  }
  root.render(<UI/>);qa.hide()
  const context=()=>{const c=l11MapContext(eng);return {kind:c.kind,id:c.id,floor:c.floor,title:c.title,accessible:c.building?.accessible}}
  const pose=(x:number,y:number,floor:FloorBand=0,z=floor*3)=>{qa.moveTo(x,y);eng.player.floor=floor;eng.player.z=z;eng.player.vz=0;eng.onStairs=false;eng.moveIt.acc=0;eng.input.mx=eng.input.my=0;eng.input.jump=false;eng.input.sprint=false;return context()}
  const pickBuilding=(rotated=false)=>{
    const all=l11CityPlan(eng.map.inf.seed,0,0).buildings.filter(b=>!b.sealed&&b.accessible>=2&&(!rotated||Math.abs(b.angle)>.1))
    if(!all.length)throw Error('No real accessible multi-storey building')
    return all.find(b=>rotated||b.archetype==='archive')??all[0]
  }
  const enter=(b:L11Building,floor:FloorBand=0)=>{
    const plan=l11InteriorPlan(b).floors[floor]
    for(const room of plan.rooms)for(const [u,v] of [[room.x+room.w/2,room.y+room.h/2],[room.x+.9,room.y+.9],...[...plan.doors].filter(d=>d.to===room.id).map(d=>d.center)]){
      const [x,y]=l11World(b,u,v);pose(x,y,floor,b.base+floor*3)
      if(canOccupy(eng.map,eng.player.x,eng.player.y,.32,{z:eng.player.z,band:floor}))return {...context(),building:b.id,angle:b.angle,world:[x,y],room:room.kind}
    }
    throw Error('No collision-free room pose '+b.id)
  }
  let selected:L11Building|undefined
  qa.mapUI={
    open:()=>navigate(true),close:()=>navigate(false),context,pose,
    enter:(rotated=false)=>{selected=pickBuilding(rotated);return enter(selected)},
    upper:()=>{if(!selected)throw Error('Select a building first');return enter(selected,1)},
    state:l11MapPlanStatus,
    unmount:()=>{if(visible){root.unmount();element.remove();visible=false}},
    worker:async()=>{
      const known=eng.explored.slice(),seed=eng.map.inf.seed,request={x:-1008,y:-1008,w:64,h:64}
      // A distant, previously unloaded region must use the cartography Worker.
      clearL11PlanCache();let result=readL11MapPlans(seed,request,[request])
      const started=performance.now()
      while(result.loading&&performance.now()-started<30000){await new Promise(r=>setTimeout(r,80));result=readL11MapPlans(seed,request,[request])}
      if(result.error||result.plans.length!==1)throw Error('Map Worker failed to load historical plan')
      const expected=l11CityPlan(seed,-1,-1)
      if(JSON.stringify(result.plans[0])!==JSON.stringify(expected))throw Error('Map Worker differs from gameplay planning')
      if(known.some((v:number,i:number)=>eng.explored[i]!==v))throw Error('Cartography changed exploration')
      return {ok:true,elapsed:performance.now()-started,...l11MapPlanStatus()}
    },
    doorway:async()=>{
      const buildings=l11CityPlan(eng.map.inf.seed,0,0).buildings.filter(b=>!b.sealed)
      for(const b of buildings){
        const [u,v]=b.doorLocal,center=l11Local(b,b.x+b.w/2,b.y+b.h/2),dx=center[0]-u,dy=center[1]-v,len=Math.hypot(dx,dy)
        // Entrance normal is a cardinal local axis, including concave floorplates.
        const direction=Math.abs(dx)>Math.abs(dy)?[Math.sign(dx),0]:[0,Math.sign(dy)]
        const start=l11World(b,u-direction[0]*1.2,v-direction[1]*1.2),end=l11World(b,u+direction[0]*1.2,v+direction[1]*1.2)
        if(!len)continue;pose(...start,0,b.base)
        const free=(p:number[])=>canOccupy(eng.map,p[0]-eng.map.inf.ox,p[1]-eng.map.inf.oy,.32,{z:b.base,band:0})
        if(!free(start)||!free(end)||context().kind!=='city')continue
        const modes=[context().kind]
        for(const target of [end,start]){
          for(let i=0;i<150;i++){const x=eng.player.x+eng.map.inf.ox,y=eng.player.y+eng.map.inf.oy,d=Math.hypot(target[0]-x,target[1]-y);if(d<.06)break;eng.input.mx=(target[0]-x)/d;eng.input.my=(target[1]-y)/d;updateMovement(eng,1/60,{dmg:1,drain:1},false)}
          eng.input.mx=eng.input.my=0;modes.push(context().kind)
          await new Promise(resolve=>setTimeout(resolve,300))
          if(document.querySelector<HTMLCanvasElement>('[data-l11-map-canvas]')?.dataset.mode!==context().kind)throw Error('Displayed map did not follow actual doorway movement')
        }
        if(modes.join()!=='city,interior,city')throw Error('Real doorway map transition failed: '+modes)
        return {ok:true,building:b.id,modes}
      }
      throw Error('No clear entrance for real walking test')
    },
    benchmark:()=>{
      const node=document.createElement('canvas');node.width=700;node.height=500;const g=node.getContext('2d')!,c=l11MapContext(eng),view=fitL11Map(eng,c,700,500),times=[]
      for(let i=0;i<35;i++){const t=performance.now();drawL11Map(g,eng,{context:c,view,yaw:qa.look.yaw});times.push(performance.now()-t)}
      times.sort((a,b)=>a-b);return {samples:times.length,medianMs:times[17],p95Ms:times[33],maxMs:times[34],mode:c.kind}
    },
  }
  return {ok:true,seed:eng.map.inf.seed}
}
