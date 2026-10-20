import * as THREE from 'three'
import { l7GravZonesNear, l7MountCave, L7_ROPE } from '../src/game/world/infiniteL7'
import { stepL7Events, triggerL7Surge, l7SurgeShaderParams } from '../src/game/engine/l7Events'
import { updateMovement, updateClimb } from '../src/game/engine/movement'
import { scanInteract } from '../src/game/engine/interact'
import { audio } from '../src/game/core/audio'
import { l7SurgeHeight, l7SurgeUniforms } from '../src/game/renderer/water'
import { floorHeight } from '../src/game/world/mapgen'
import { buildL7Structure } from '../src/game/renderer/l7Meshes'
import { setMaterialMode } from '../src/game/renderer/shared'

export async function verifyL7Import(qa:any) {
  let checks=0
  const ok=(condition:unknown,message:string)=>{if(!condition)throw Error(message);checks++}
  const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
  const e=qa.eng,p=e.player,r=qa.r,seed=e.mapSeed
  const go=(x:number,y:number,z:number)=>{p.x=x-e.map.inf.ox;p.y=y-e.map.inf.oy;e.updateInfiniteWindow();p.z=z;p.vz=0;e.inLiquid=1;e.l7fx.gravT=0;stepL7Events(e,0)}
  const tick=(n=1)=>{for(let i=0;i<n;i++){e.time+=1/60;updateMovement(e,1/60,{dmg:1,drain:1},false)}}
  const aim=(x:number,y:number,z:number)=>{const dx=x-p.x,dy=y-p.y,dz=z-p.z-1.55,d=Math.hypot(dx,dy,dz);qa.look.rayX=dx/d;qa.look.rayY=dy/d;qa.look.rayZ=dz/d;p.facing=Math.atan2(dy,dx)}
  ok(!!r.l7Fx,'Production renderer owns L7 effects')
  const cave=l7MountCave(seed),zone=l7GravZonesNear(seed,15,15,2500)[0]
  ok(!!zone,'Reproducible gravity zone exists')
  go(30,22,-3);const z=p.z;tick(15);ok(Math.abs(p.z-z)<.01,'Neutral swimming retains depth')
  e.input.jump=true;tick(30);e.input.jump=false;ok(p.z>z+.2,'Swimming upward works')
  const z2=p.z;e.input.crouch=true;tick(30);e.input.crouch=false;ok(p.z<z2-.2,'Swimming downward works')
  go(zone.x,zone.y,4);tick();ok(!!e.l7fx.wall&&e.submerged,'Water wall detected above ordinary ocean')
  e.input.jump=true;tick(45);e.input.jump=false;ok(p.z>4.3,'Can swim up water wall')
  go(zone.x-Math.sin(zone.ang)*(zone.thick+3),zone.y+Math.cos(zone.ang)*(zone.thick+3),6);tick(150)
  ok(p.z<.2&&!e.l7fx.wallFall,'Leaving water wall falls back to ocean')
  go(220,80,.1);triggerL7Surge(e,0,70);stepL7Events(e,.1)
  const sp=l7SurgeShaderParams(e)
  ok(Math.abs(e.l7fx.surgeH-l7SurgeHeight(p.x,p.y,sp))<1e-5,'Player and shader share swell function')
  const initial=e.l7fx.surge
  p.x+=64;e.updateInfiniteWindow();stepL7Events(e,0)
  ok(e.l7fx.surge===initial,'Streaming preserves active event')
  e.l7fx.farT=600;stepL7Events(e,2);ok(e.l7fx.halluc>.9,'Remote surface exposure produces hallucination')
  go(30,22,-5);const exposure=e.l7fx.farT;stepL7Events(e,10);ok(e.l7fx.farT<exposure,'Sheltered underwater exposure decays')
  go(cave.x+.5,cave.y+.5,-cave.depth+1)
  ok(e.map.exits.some((v:any)=>v.def.kind==='l7cave'&&Math.hypot(v.x+e.map.inf.ox-cave.x,v.y+e.map.inf.oy-cave.y)<2),'Fixed L8 cave loads')
  ok(Number.isFinite(floorHeight(e.map,p.x,p.y,0)),'Cave floor is finite')
  const exit=e.map.exits.find((v:any)=>v.def.kind==='l7cave'&&Math.hypot(v.x+e.map.inf.ox-cave.x,v.y+e.map.inf.oy-cave.y)<2)
  p.x=exit.x+.5;p.y=exit.y+1.4;p.z=(exit.z??floorHeight(e.map,exit.x+.5,exit.y+.5,0))+.1
  p.crouching=false;aim(exit.x+.5,exit.y+.5,p.z+.85);scanInteract(e)
  ok(e.interactTarget?.e===exit,'Cave reachable through ordinary crosshair interaction')
  e.doInteract();ok(e.transition?.dest===8,'Cave interaction starts L8 transition');e.transition=null

  // Cached source geometry must not be disposed through another live instance.
  const models=[]
  for(const mode of ['classic','realistic'] as const){
    setMaterialMode(mode)
    for(const kind of ['l7skeleton','l7giantfish','l7carpet','l7fort','l7bubbles','l7debris'] as const){
      const s:any={kind,x:p.x,y:p.y,w:kind==='l7debris'?24:4,h:kind==='l7debris'?24:4,data:{seed:23,big:1}}
      const a=buildL7Structure(s,e.map)!,b=buildL7Structure(s,e.map)!
      let triangles=0,draws=0;const resources=new Set<THREE.BufferGeometry>()
      b.traverse(o=>{const m=o as THREE.Mesh;if(!m.geometry)return;resources.add(m.geometry);draws++;triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3
        for(const attr of Object.values(m.geometry.attributes))ok(Array.from(attr.array).every(Number.isFinite),kind+' finite geometry')
        const mat=m.material as THREE.Material
        if(!(mat instanceof THREE.ShaderMaterial))ok(mode==='classic'?mat instanceof THREE.MeshLambertMaterial:mat instanceof THREE.MeshStandardMaterial,kind+' respects material mode')
      })
      a.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry){ok(!resources.has(m.geometry),kind+' independently owned geometry');m.geometry.dispose()}})
      for(const g of resources)g.dispose();models.push({mode,kind,triangles,draws})
    }
  }
  setMaterialMode(r.lightMode)

  // Rebuild the real scene repeatedly: private effect resources must be freed.
  const cycles=[]
  for(const mode of ['classic','realistic','classic','realistic']){
    const old=r.l7Fx;let frees=0;old.shards.addEventListener('dispose',()=>frees++);old.voids.addEventListener('dispose',()=>frees++)
    qa.mode(mode);await qa.warm();ok(old!==r.l7Fx&&frees===2,'Effect rebuild disposes both instance buffers')
    cycles.push({mode,memory:{...r.three.info.memory},programs:r.three.info.programs.length})
  }
  ok(JSON.stringify(cycles[1])===JSON.stringify(cycles[3]),'Warmed mode cycles have stable resources')
  await qa.scene(10);await qa.warm();ok(!r.l7Fx&&l7SurgeUniforms.uL7Surge.value.z===0,'L10 releases ocean effects and swell')
  ok(!!r.skyMesh?.userData.sky,'Imported sky survives cross-level transition')
  await qa.scene(7);await qa.warm();ok(e.l7fx.halluc===0&&!e.l7fx.surge,'Re-entry resets transient ocean state')
  ok(e.map.structures.some((s:any)=>s.kind==='ropeanchor'&&s.x+e.map.inf.ox===L7_ROPE.anchor.x),'Entry rope anchor retained')
  const anchor=e.map.structures.find((s:any)=>s.kind==='ropeanchor')
  p.x=anchor.x+.5;p.y=anchor.y+1.3;p.z=floorHeight(e.map,p.x,p.y,1);p.crouching=false
  e.addItem('rope');aim(anchor.x+.5,anchor.y+.5,p.z+.85);scanInteract(e)
  ok(e.interactTarget?.s===anchor,'Rope anchor reachable through ordinary interaction')
  e.doInteract();ok(anchor.data.deployed===1,'Rope deploys')
  go(L7_ROPE.base.x+.5,L7_ROPE.base.y+1.2,.1);p.facing=-Math.PI/2;e.climbCd=0
  updateClimb(e,1/60,1);ok(!!e.climb?.rope,'Deployed rope starts ascent')
  for(let i=0;i<200&&e.climb;i++)updateClimb(e,1/60,1)
  ok(!e.climb&&p.z>=3,'Rope returns swimmer to porch')
  audio.ensure();audio.setDeepPressure(.8)
  ok(!!(audio as any).deepNodes,'Deep-water audio starts');audio.stopDeepPressure()
  ok(!(audio as any).deepNodes,'Deep-water audio stops and releases ownership')

  const skeleton=e.map.structures.find((s:any)=>s.kind==='l7skeleton')
  const views:any[]=[
    {id:'shallow-rays',x:30,y:22,z:-5,pitch:.55},
    {id:'snell-window',x:30,y:22,z:-5,pitch:1.3},
    {id:'cliff',x:51,y:22,z:-35,pitch:-.2,yaw:1.57,flash:true},
    {id:'cave',x:cave.x,y:cave.y+5,z:-cave.depth+.2,pitch:-.05,flash:true},
    {id:'wall-outside',x:zone.x-Math.sin(zone.ang)*18,y:zone.y+Math.cos(zone.ang)*18,z:.1,yaw:-zone.ang,pitch:.55},
    {id:'wall-inside',x:zone.x,y:zone.y,z:12,yaw:-zone.ang,pitch:.1,flash:true},
    {id:'inverted-sea',x:zone.x,y:zone.y+20,z:zone.top-10,pitch:1.15},
    {id:'shallow-classic',x:30,y:22,z:-5,pitch:.55,mode:'classic'},
    {id:'shallow-low',x:30,y:22,z:-5,pitch:.55,mode:'classic',low:true},
  ]
  if(skeleton)views.splice(3,0,{id:'skeleton',x:skeleton.x+e.map.inf.ox+2,y:skeleton.y+e.map.inf.oy+4,z:floorHeight(e.map,skeleton.x,skeleton.y,0)+1,pitch:-.35,flash:true})
  ;(window as any).l7Views=views
  ;(window as any).l7SetView=async(v:any)=>{
    qa.mode(v.mode??'realistic');r.setTextureQuality(v.low?0:2);r.setRealWater(!v.low)
    go(v.x,v.y,v.z);e.l7fx.surge=null;e.l7fx.halluc=0;p.flashlight=!!v.flash;p.battery=100;p.flashJamT=0
    qa.look.yaw=v.yaw??0;qa.look.pitch=v.pitch;qa.look.roll=0
    await qa.warm();await frame();qa.freezeRenderTime(60)
  }
  return{checks,seed,cave,zone,models,cycles}
}
