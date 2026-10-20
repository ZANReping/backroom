import * as THREE from 'three'
import { l11CityPlan,l11CanalX,l11TerrainHeight,l11MetroRamp } from '../src/game/world/l11Layout'
import { l11CanalAccess } from '../src/game/world/l11CanalAccess'
import { L11_CANAL_BED,L11_WATER_SURFACE } from '../src/game/world/l11Hydrology'
import { L11_METRO_CEILING } from '../src/game/world/l11Metro'
import { l11MapWater,ceilingHeightAt,bandOfPlayerZ } from '../src/game/world/mapgen'
import { canOccupy } from '../src/game/core/player'
import { updateMovement } from '../src/game/engine/movement'

const assert=(v:unknown,msg:string)=>{if(!v)throw Error(msg)}
const close=(a:number,b:number,label:string,t=.04)=>assert(Math.abs(a-b)<t,`${label}: ${a} / ${b}`)
export function attachAccess(qa:any){
  const e=qa.eng,seed=e.map.inf.seed,dm={dmg:1,drain:1}
  const tick=(n=1)=>{for(let i=0;i<n;i++)updateMovement(e,1/60,dm,false)}
  const reset=()=>{e.input.mx=e.input.my=0;e.input.jump=e.input.crouch=e.input.sprint=false;e.player.crouching=false;e.player.vz=0;e.moveIt.acc=0;e.ride=e.climb=null;e.climbCd=0;e.onStairs=false;e.dev.noclip=e.dev.fly=false;e.transition=null;e.breathT=0}
  const pose=(x:number,y:number,z:number)=>{qa.moveTo(x,y);reset();e.player.z=z;e.player.floor=bandOfPlayerZ(e.map,z,e.player.x,e.player.y);qa.look.roll=0;qa.freezeRenderTime(10)}
  const world=()=>({x:e.player.x+e.map.inf.ox,y:e.player.y+e.map.inf.oy,z:e.player.z,floor:e.player.floor,liquid:e.inLiquid})
  const render=()=>{for(let i=0;i<12;i++){qa.r.three.info.reset();qa.r.render(document.querySelector('canvas'),e,{grain:false,flicker:0,shake:false},.05)}}
  const ray=(x:number,z:number,y:number,dx:number,dz:number,dy:number)=>{
    qa.r.scene.updateMatrixWorld(true)
    return new THREE.Raycaster(new THREE.Vector3(x,z,y),new THREE.Vector3(dx,dz,dy)).intersectObject(qa.r.scene,true).filter(h=>(h.object as THREE.Mesh).isMesh&&!['skybox','l11-canal-water','l11-canal-reflection'].includes(h.object.name))
  }
  const spots=l11CityPlan(seed,0,0).canals.flatMap(c=>l11CanalAccess(seed,c,l11CityPlan(seed,0,0).roads,32,1024))
  qa.access={
    async metro(){
      pose(27.5,118.5,l11TerrainHeight(seed,27.5,120));await qa.warm();tick(2)
      const checks=[]
      e.input.my=1
      for(let i=0;i<350&&world().y<132;i++){tick();checks.push(world());assert(e.player.z>-5.1&&e.player.z<.7,'Invalid stair height')}
      e.input.my=0;assert(world().y>131,'Cannot descend metro ramp: '+JSON.stringify(world()));close(e.player.z,-5,'Metro floor')
      const ceil=ceilingHeightAt(e.map,e.player.x,e.player.y,3,-1);close(ceil,L11_METRO_CEILING,'Metro ceiling')
      await qa.warm()
      const hits=ray(e.player.x,-4,e.player.y,0,1,0),hit=hits[0];assert(hit,'Underground ceiling missing')
      qa.accessDebug={position:world(),dn:e.map.dn[Math.floor(e.player.y)*e.map.w+Math.floor(e.player.x)],hits:hits.slice(0,8).map(h=>({y:h.point.y,name:h.object.name,parent:h.object.parent?.name}))}
      close(hit.point.y,-2,'Ceiling underside '+JSON.stringify(qa.accessDebug))
      qa.look.yaw=0;qa.look.pitch=.48;render()
      const descent={end:world(),samples:checks.length,ceiling:hit.point.y}
      return {descent}
    },
    async metroSides(){
      const samples=[]
      for(const y of [120.5,123,126,129.3])for(const side of [-1,1]){
        pose(27.5,y,l11MetroRamp(27.5,y,seed)!);tick(1);e.input.mx=side
        tick(80);e.input.mx=0
        const p=world();assert(p.x>26.3&&p.x<28.7,'Entered metro retaining wall: '+JSON.stringify(p))
        const target=side<0?25.8:29.2,band=bandOfPlayerZ(e.map,p.z,e.player.x,e.player.y)
        assert(!canOccupy(e.map,target-e.map.inf.ox,y-e.map.inf.oy,.32,{z:p.z,band}),'Wall is not solid');samples.push(p)
      }
      pose(27.5,131.4,-5);e.input.my=-1
      for(let i=0;i<450&&world().y>118.7;i++)tick()
      e.input.my=0;assert(world().y<119,'Cannot ascend metro ramp: '+JSON.stringify(world()));assert(e.player.z>-.2,'Ascended player remains underground')
      // Ground/ceiling edge must be a solid face through the gap, not a thin plane.
      pose(27.5,126,-3);await qa.warm();const p=e.player
      const face=ray(p.x,-1,p.y,0,0,1)[0];assert(face,'Shaft end has no floor/ceiling closure');close(face.point.z,130-e.map.inf.oy,'Shaft closure position',.05)
      qa.look.yaw=Math.PI;qa.look.pitch=.55;render();return {sideSamples:samples,closure:{y:face.point.y,z:face.point.z},ascent:true}
    },
    async ladder(side:number){
      const s=spots.find(p=>p.key==='canal_ladder'&&p.side===side);assert(s,'No ladder on bank '+side)
      const dx=s.landX-s.x,dy=s.landY-s.y,len=Math.hypot(dx,dy),nx=dx/len,ny=dy/len
      pose(s.x-nx*.75,s.y-ny*.75,L11_WATER_SURFACE-.45);await qa.warm();tick(1)
      assert(e.map.structures.some((q:any)=>q.data?.instanceId===s.id),'Ladder not streamed')
      e.player.facing=Math.atan2(dy,dx);e.input.mx=nx;e.input.my=ny
      let began=false,frames=0
      for(;frames<300;frames++){tick();began||=!!e.climb;if(began&&!e.climb)break}
      e.input.mx=e.input.my=0;tick(5)
      assert(began&&frames<300,'Could not climb bank ladder')
      const p=world();close(p.x,s.landX,'Ladder landing X');close(p.y,s.landY,'Ladder landing Y');close(p.z,l11TerrainHeight(seed,s.landX,s.landY),'Dry landing height',.08)
      assert(e.inLiquid===0&&!e.submerged,'Landing retains underwater state');assert(canOccupy(e.map,e.player.x,e.player.y,.32,{z:p.z,band:0}),'Ladder landing is obstructed')
      // Hold forward again to prove the landing is a usable walkway.
      e.input.mx=nx;e.input.my=ny;tick(20);e.input.mx=e.input.my=0
      assert(Math.hypot(world().x-p.x,world().y-p.y)>.4,'Cannot walk away from ladder')
      pose(s.x-nx*3.8,s.y-ny*3.8,L11_WATER_SURFACE-.2);tick(1);qa.look.yaw=Math.atan2(-nx,-ny);qa.look.pitch=.25;render()
      return {side,station:s,frames,landing:p,walkAway:true}
    },
    async drain(){
      const s=spots.find(p=>p.key==='sewer_outlet');assert(s,'No sewer outlet')
      const dx=s.landX-s.x,dy=s.landY-s.y,len=Math.hypot(dx,dy),nx=dx/len,ny=dy/len
      pose(s.x-nx*3.5,s.y-ny*3.5,L11_WATER_SURFACE-.4);await qa.warm();tick(1);qa.look.yaw=Math.atan2(-nx,-ny);qa.look.pitch=-.1;render();return s
    },
    async deep(){
      const y=558,x=l11CanalX(seed,0,y);pose(x,y,L11_WATER_SURFACE-.3);await qa.warm();tick(1)
      const w=l11MapWater(e.map,e.player.x,e.player.y)!;close(w.depth,5,'Canal depth')
      tick(180);assert(!e.transition,'Shallow swimming triggered exit');close(e.player.z,L11_WATER_SURFACE-.3,'Neutral buoyancy')
      e.input.crouch=true;tick(210);e.input.crouch=false;tick(1);close(e.player.z,L11_CANAL_BED,'Real riverbed')
      const bed=ray(e.player.x,w.surface-.1,e.player.y,0,-1,0)[0];assert(bed,'No bed mesh');close(bed.point.y,L11_CANAL_BED,'Rendered bed')
      tick(900);assert(!e.transition,'Deep exit happened too soon')
      e.player.z=w.surface-.3;tick(1);assert(!e.transition,'Surfacing should reset deep dwell')
      e.player.z=L11_CANAL_BED;e.player.hp=100;e.breathT=0;e.dev.god=e.dev.statLock=false
      tick(1490);assert(!e.transition,'Reset dwell was not continuous')
      qa.look.yaw=1;qa.look.pitch=.15;render();return {depth:w.depth,bed:bed.point.y,shallowSafe:true,reset:true,seconds:1490/60}
    },
    finishDeep(){tick(12);assert(e.transition?.dest===7,'Deep water did not request Level 7');assert(e.arriveL7SafeWater,'No safe water arrival');assert(e.player.hp>0,'Normal player drowned before exit');return {transition:{...e.transition},safeWater:e.arriveL7SafeWater,hp:e.player.hp}},
    async finishTravel(){
      // The ordinary Engine update resolves the existing exit transition.
      e.paused=false
      for(let i=0;i<100&&e.player.level===11;i++){e.update(.05);await new Promise(r=>setTimeout(r,40))}
      assert(e.player.level===7,'Actual level transition did not finish');e.update(.05);e.paused=true
      assert(e.inLiquid===1,'Level 7 safe arrival is not in water');assert(e.player.z>-.5,'Arrival left player on deep seabed')
      await qa.warm();return {level:e.player.level,position:world(),safeFlagConsumed:!e.arriveL7SafeWater}
    },
    async highrise(){
      reset();const start=performance.now();assert(e.devGotoVariant('highrise'),'No highrise district');const generationMs=performance.now()-start;tick(1)
      const warm=await qa.warm();qa.look.yaw=-.6;qa.look.pitch=.16;render()
      const inf=e.map.inf;return {generationMs,warm,world:world(),loaded:inf.chunks.size,buildings:e.map.structures.filter((s:any)=>s.kind==='l11building').length,stats:qa.stats()}
    }
  }
}
