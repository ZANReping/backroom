import {l11CityPlan,l11World,l11Local} from '../src/game/world/l11Layout'
import {L11} from '../src/game/levels/l11'
import {genL11ChunkRaw} from '../src/game/world/l11Raw'
import {canOccupy} from '../src/game/core/player'
import {updateMovement} from '../src/game/engine/movement'
import {captureL11} from '../src/game/engine/l11State'
import {storage} from '../src/game/core/storage'
import {persist,readSaveSlot} from '../src/game/engine/save'
import type {L11Building} from '../src/game/world/l11Types'
import {inPolygon} from '../src/game/world/l11Geometry'
const assert=(v:unknown,msg:string)=>{if(!v)throw Error(msg)}
export function attachL11Exits(qa:any){
  const e=qa.eng,seed=e.map.inf.seed,dm={dmg:1,drain:1}
  const buildings=[...l11CityPlan(seed,0,0).buildings,...l11CityPlan(seed,-1,-1).buildings,...l11CityPlan(seed,1,-1).buildings]
  const find=(kind:string)=>{const b=buildings.find(b=>b.exit?.kind===kind);assert(b,kind+' absent in QA regions');return b!}
  const reset=()=>{e.transition=null;e.paused=true;e.input.mx=e.input.my=0;e.input.jump=e.input.interact=e.input.crouch=e.input.sprint=false;e.player.vz=0;e.player.crouching=false;e.dev.noclip=e.dev.fly=false;e.onStairs=false;e.climb=e.ride=null;qa.freezeRenderTime(10)}
  const pose=(x:number,y:number,z:number,floor=0)=>{qa.moveTo(x,y);reset();e.player.z=z;e.player.floor=floor}
  const aim=(x:number,y:number,z:number)=>{const dx=x-e.player.x-e.map.inf.ox,dy=y-e.player.y-e.map.inf.oy;qa.look.yaw=Math.atan2(-dx,-dy);qa.look.pitch=Math.atan2(z-e.player.z-1.55,Math.hypot(dx,dy));qa.r.applyView(e)}
  const render=()=>{for(let i=0;i<6;i++)qa.r.render(document.querySelector('canvas'),e,{grain:false,flicker:0,shake:false},.02)}
  const free=()=>canOccupy(e.map,e.player.x,e.player.y,.32,{z:e.player.z,band:e.player.floor})
  const portal=(b:L11Building)=>e.map.exits.find((q:any)=>q.l11?.buildingId===b.id)
  const tick=(n=1)=>{for(let i=0;i<n;i++)updateMovement(e,1/60,dm,false)}
  async function doorPose(kind:string,distance=1.25){
    const b=find(kind),q=b.exit!,[x,y]=l11World(b,...q.center),angle=b.angle+q.angle
    pose(x+Math.sin(angle)*distance,y-Math.cos(angle)*distance,b.base+q.floor*3,q.floor);await qa.warm();aim(x,y,b.base+q.floor*3+1.25);render();e.scanInteract()
    assert(free(),kind+' cannot stand in front of door');assert(portal(b),kind+' not streamed')
    return {b,exit:portal(b),target:e.interactTarget?.label,world:[x,y],angle}
  }
  qa.portals={
    async worker(){
      const worker=new Worker(new URL('../src/game/world/l11.worker.ts',import.meta.url),{type:'module'})
      try{const checks=[];for(const kind of ['l11unfinisheddoor','l11liftshaft','l11brickdoor','l11officedoor','basebeta']){const b=find(kind),[x,y]=l11World(b,...b.exit!.center),cx=Math.floor(x/32),cy=Math.floor(y/32),raw=genL11ChunkRaw(L11,seed,cx,cy)
        const result:any=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('worker timeout')),30000);worker.onmessage=r=>{clearTimeout(timer);resolve(r.data)};worker.onerror=reject;worker.postMessage({key:kind,def:L11,seed,cx,cy,revision:0})})
        assert(!result.error,result.error);assert(JSON.stringify(raw.exits)===JSON.stringify(result.raw.exits),'Worker exit mismatch');checks.push({kind,cx,cy})}return checks
      }finally{worker.terminate()}
    },
    async door(kind:string){const {b,exit,target,world,angle}=await doorPose(kind);assert(e.interactTarget?.kind==='exit'&&e.interactTarget.e===exit,kind+' not targetable: '+target);return {id:b.id,kind,archetype:b.archetype,accessible:b.accessible,floor:b.exit!.floor,world,angle,target}},
    async photoDoor(kind:string,distance=3.1){const {b,world}=await doorPose(kind,distance);aim(world[0],world[1],b.base+b.exit!.floor*3+1.4);render();return {world,id:b.id}},
    async shaftPit(){const {b,world,angle}=await doorPose('l11liftshaft',.7);aim(world[0]-Math.sin(angle)*1.2,world[1]+Math.cos(angle)*1.2,b.base-2.5);render();return {world,id:b.id,pitDepth:3.5}},
    use(){const kind=e.interactTarget?.e?.def.kind;e.doInteract();return {kind,transition:e.transition?{...e.transition}:null,tapes:e.countItem('tape'),unlocked:e.l11World?.archiveUnlocked}},
    async travel(dest:number){
      e.paused=false;for(let i=0;i<800&&e.player.level===11;i++){e.update(.05);await new Promise(r=>setTimeout(r,40))}
      assert(e.player.level===dest,'Actual transition failed: '+e.player.level+' expected '+dest);e.paused=true;await qa.warm();return {level:e.player.level,x:e.player.x,y:e.player.y,z:e.player.z,stats:qa.stats()}
    },
    async back(){await qa.scene(11,'open',seed);reset();await qa.warm();return e.player.level},
    async exterior(kind:string,rear=false){const b=find(kind),a=b.doorAngle,nx=Math.sin(a),ny=-Math.cos(a),center=l11World(b,b.width/2,b.depth/2),sign=rear?-1:1
      const candidates=[]
      for(const distance of [25,20,15,10,7])for(const t of [0,6,-6,12,-12]){const edge=Math.max(b.width,b.depth)/2,x=center[0]+nx*(edge+distance)*sign+Math.cos(a)*t,y=center[1]+ny*(edge+distance)*sign+Math.sin(a)*t;if(!buildings.some(q=>inPolygon(x,y,q.footprint)))candidates.push({x,y,distance,t})}
      assert(candidates.length,'No exterior camera location');const p=candidates[0]
      // The inspection overview is elevated enough to see slabs/core without occupying another building.
      pose(p.x,p.y,b.base+4);await qa.warm();aim(center[0],center[1],b.base+b.floors*1.3);render();return {id:b.id,front:b.front,angle:b.angle,position:[p.x,p.y,e.player.z],floors:b.floors,stats:qa.stats()}
    },
    async shaft(){const b=find('l11liftshaft'),q=b.exit!,a=b.angle+q.angle,[x,y]=l11World(b,...q.center),nx=Math.sin(a),ny=-Math.cos(a)
      // Walk the full bare ground-floor route, from outside the facade to the shaft.
      const [doorX,doorY]=b.door;pose(doorX+nx*1.5,doorY+ny*1.5,b.base);await qa.warm();assert(free(),'Shaft building main entrance blocked')
      aim(x,y,b.base+1.3);render();const travel=Math.hypot(x-doorX,y-doorY)+2.4;e.input.mx=-nx;e.input.my=-ny
      for(let i=0;i<Math.ceil(travel*30)&&!e.transition;i++)tick();e.input.mx=e.input.my=0
      assert(e.transition?.dest===2,'Walking into shaft failed at '+JSON.stringify(l11Local(b,e.player.x+e.map.inf.ox,e.player.y+e.map.inf.oy)))
      return {building:b.id,kind:q.kind,transition:{...e.transition},walked:true}
    },
    async stairs(){const b=find('l11officedoor'),st=b.stairs[0],along=st.axis==='x',start=l11World(b,st.x+(along?-.6:st.width/2),st.y+(along?st.width/2:-.6)),end=l11World(b,st.x+(along?st.length+.5:st.width/2),st.y+(along?st.width/2:st.length+.5))
      pose(...start,b.base);await qa.warm();assert(free(),'Office lower stair landing blocked');const dx=(end[0]-start[0]),dy=end[1]-start[1],len=Math.hypot(dx,dy);e.input.mx=dx/len;e.input.my=dy/len
      for(let i=0;i<420&&e.player.z<b.base+2.95;i++)tick();e.input.mx=e.input.my=0;assert(e.player.z>=b.base+2.95,'Cannot climb office stairs '+e.player.z);return {id:b.id,feet:e.player.z,base:b.base}
    },
    async archive(tapes:number){
      e.player.hotbar=e.player.hotbar.map((s:any)=>s?.type==='tape'?null:s);e.player.backpack=e.player.backpack.map((s:any)=>s?.type==='tape'?null:s)
      if(tapes)e.player.backpack[0]={type:'tape',count:tapes};e.player.tapes=tapes
      const p=await doorPose('basebeta');assert(e.interactTarget?.e===p.exit,'Archive not targetable '+p.target)
      const before=e.countItem('tape');e.doInteract();render();const seals=[...qa.r.chunkGroups.values()].flatMap((c:any)=>c.exitRoots).find((r:any)=>r.userData.exitRef?.def.kind==='basebeta')?.getObjectByName('l11-archive-seals')
      assert(!e.transition,'First submission entered immediately');assert(e.countItem('tape')===(tapes>=6?tapes-6:before),'Wrong tape consumption');assert(!!e.l11World.archiveUnlocked===(tapes>=6),'Wrong archive unlock');assert(seals?.visible===(tapes<6),'Seal visibility did not follow state')
      return {before,after:e.countItem('tape'),unlocked:e.l11World.archiveUnlocked,sealsVisible:seals.visible,label:e.interactTarget?.label}
    },
    async reloadArchive(){
      const before=e.snapshot();persist(e,'slot3');const saved=readSaveSlot('slot3')!;assert(saved?.l11World?.archiveUnlocked,'Save lost archive unlock');assert(saved.player.tapes===before.player.tapes,'Save changed tapes')
      e.l11World=JSON.parse(JSON.stringify(saved.l11World));e.loadLevel(11,{mapSeed:saved.mapSeed,firstVisit:false});reset();await doorPose('basebeta')
      assert(captureL11(e)?.archiveUnlocked,'Reload lost unlock');assert(e.interactTarget?.label.includes('进入'),'Reload still requests tapes');assert(!e.interactTarget.label.includes('提交'),'Wrong resumed interaction')
      storage.remove('br_save_slot3');return {persisted:true,unlocked:e.l11World.archiveUnlocked,tapes:e.countItem('tape'),label:e.interactTarget.label}
    }
  }
}
