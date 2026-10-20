import * as THREE from 'three'
import { l11CanalX,l11TerrainHeight } from '../src/game/world/l11Layout'
import { L11_WATER_SURFACE,L11_WATER_DEPTH,L11_CANAL_BED,L11_BRIDGE_THICKNESS } from '../src/game/world/l11Hydrology'
import { l11MapWater,liquidSurfaceH,waterItemZ,l11HeadCeilingAt } from '../src/game/world/mapgen'
import { canOccupy } from '../src/game/core/player'
import { updateMovement } from '../src/game/engine/movement'

const assert=(v:unknown,msg:string)=>{if(!v)throw Error(msg)}
const close=(a:number,b:number,tolerance=.025)=>assert(Math.abs(a-b)<tolerance,`${a} != ${b}`)
export function attachWaterways(qa:any){
  const eng=qa.eng,seed=20261006,dm={dmg:1,drain:1}
  const reset=()=>{eng.input.mx=eng.input.my=0;eng.input.jump=false;eng.input.crouch=false;eng.input.sprint=false;eng.player.crouching=false;eng.player.vz=0;eng.moveIt.acc=0;eng.ride=eng.climb=null;eng.onStairs=false;eng.dev.noclip=false}
  const tick=(n=1)=>{for(let i=0;i<n;i++)updateMovement(eng,1/60,dm,false)}
  const settleView=()=>{for(let i=0;i<30;i++)qa.r.render(document.querySelector('canvas'),eng,{grain:false,flicker:0,shake:false},.05)}
  const place=(y:number,z=L11_CANAL_BED)=>{qa.moveTo(l11CanalX(seed,0,y),y);reset();eng.player.z=z;eng.player.floor=0;qa.look.yaw=0;qa.look.pitch=.08;qa.look.roll=0;qa.freezeRenderTime(10)}
  const current=()=>l11MapWater(eng.map,eng.player.x,eng.player.y)
  const ray=(x:number,y:number,z:number,dir:number)=>{
    const caster=new THREE.Raycaster(new THREE.Vector3(x,z,y),new THREE.Vector3(0,dir,0));qa.r.scene.updateMatrixWorld(true)
    return caster.intersectObject(qa.r.scene,true).filter(h=>(h.object as THREE.Mesh).isMesh&&!['l11-canal-water','l11-canal-reflection','skybox'].includes(h.object.name)&&h.object.type!=='Sprite')
  }
  qa.hydro={
    async surface(){
      place(558,l11TerrainHeight(seed,l11CanalX(seed,0,558),558)+.2);qa.r.setRealWater(true);await qa.warm()
      const w=current();assert(w&&!w.bridge,'Need open canal');close(w.depth,L11_WATER_DEPTH)
      eng.player.z=w.surface+.2;tick();assert(eng.inLiquid===0,'Entered liquid above visible surface')
      tick(160);assert(eng.inLiquid===1&&!eng.submerged,'Surface swimming differs from visible water')
      const p=eng.player,tx=Math.floor(p.x),ty=Math.floor(p.y)
      close(liquidSurfaceH(eng.map,tx,ty)!,w.surface);close(waterItemZ(eng.map,tx,ty,'almond')!,w.surface);close(waterItemZ(eng.map,tx,ty,'wrench')!,w.bottom)
      const meshes:THREE.Mesh[]=[];qa.r.scene.traverse((o:THREE.Object3D)=>{if(o.name==='l11-canal-water')meshes.push(o as THREE.Mesh)})
      const waterRay=new THREE.Raycaster(new THREE.Vector3(p.x,1,p.y),new THREE.Vector3(0,-1,0)),waterHit=waterRay.intersectObjects(meshes)[0];assert(waterHit,'No visible water under player');close(waterHit.point.y,w.surface)
      const bedHit=ray(p.x,p.y,w.surface-.05,-1)[0];assert(bedHit,'No riverbed mesh');close(bedHit.point.y,w.bottom)
      for(const mesh of meshes){const depths=mesh.geometry.getAttribute('aDepth');for(let i=0;i<depths.count;i++)close(depths.getX(i),L11_WATER_DEPTH,.0001)}
      eng.input.crouch=true;tick(240);close(eng.player.z,w.bottom);settleView();assert(eng.submerged&&qa.r.uwK>.95,'Dived head should be below visible water');const underwater={eye:qa.r.camera.position.y,filter:qa.r.uwK}
      eng.input.crouch=false;eng.input.jump=true;tick(150);eng.input.jump=false;tick(1);settleView();assert(!eng.submerged&&qa.r.uwK<.05,'Surfaced head is above visible water but filter persists')
      assert(qa.r.scene.getObjectByName('l11-canal-reflection'),'Existing real reflection was removed')
      eng.rippleParticles(p.x,p.y);const rippleZ=eng.particles.at(-1).z;close(rippleZ,w.surface+.03)
      return {surface:waterHit.point.y,physicsSurface:w.surface,bed:bedHit.point.y,feet:p.z,depth:w.depth,underwater,standingEye:qa.r.camera.position.y,standingFilter:qa.r.uwK,rippleZ,reflection:true}
    },
    async underBridge(){
      place(549);await qa.warm();eng.input.crouch=true;eng.input.my=-1
      let samples=0
      while(eng.player.y+eng.map.inf.oy>529&&samples++<1800){tick();assert(!eng.over,'Deep water below bridge was treated as a fatal void');assert(eng.player.z<=L11_CANAL_BED+.03,'Bridge entry snapped player onto road');assert(eng.inLiquid===1,'Water ended beneath bridge')}
      eng.input.my=0;assert(samples<1800,'Could not travel beneath bridge');await qa.warm()
      const p=eng.player,w=current();assert(w?.bridge,'Expected bridge overhead');assert(p.floor===0,'Canal incorrectly became metro floor')
      const h=l11HeadCeilingAt(eng.map,p.x,p.y,p.z,.95,0),hit=ray(p.x,p.y,p.z+1,1).find(h=>h.point.y>L11_WATER_SURFACE)
      assert(hit,'Bridge underside invisible from below');close(hit.point.y,h);close(w.bridge.top-hit.point.y,L11_BRIDGE_THICKNESS)
      const mid=(w.bridge.top+w.bridge.bottom)/2;assert(!canOccupy(eng.map,p.x,p.y,.2,{z:mid-.2,crouch:true,band:0}),'Bridge slab has no volume')
      eng.input.crouch=false;eng.input.jump=true;let peak=-Infinity;for(let i=0;i<100;i++){tick();peak=Math.max(peak,p.z+1.55)}
      eng.input.jump=false;assert(peak<=w.bridge.bottom+.035,`Head passed bridge underside: ${peak}/${w.bridge.bottom}`)
      p.z=L11_CANAL_BED;p.vz=0;eng.input.crouch=true;tick(2);qa.look.pitch=.4;settleView()
      return {samples,world:[p.x+eng.map.inf.ox,p.y+eng.map.inf.oy],surface:w.surface,deck:w.bridge.top,underside:hit.point.y,collisionCeiling:h,thickness:w.bridge.top-hit.point.y,peakHead:peak,feet:p.z,liquid:eng.inLiquid,floor:p.floor,underwater:eng.submerged,alive:!eng.over}
    },
    async overBridge(){
      const cy=528,cx=l11CanalX(seed,0,cy);qa.moveTo(cx-8,cy);reset();eng.player.z=l11TerrainHeight(seed,cx-8,cy)+.12;await qa.warm();tick(15);eng.input.mx=1
      for(let i=0;i<250;i++){tick();assert(eng.inLiquid===0,'Road player incorrectly entered canal');assert(eng.player.z>-.5,'Bridge deck failed to support player')}
      eng.input.mx=0;assert(eng.player.x+eng.map.inf.ox>cx+5,'Bridge crossing was blocked');qa.look.yaw=Math.PI/2;qa.look.pitch=-.18;settleView()
      return {world:[eng.player.x+eng.map.inf.ox,eng.player.y+eng.map.inf.oy],feet:eng.player.z,liquid:eng.inLiquid,reflection:!!qa.r.scene.getObjectByName('l11-canal-reflection')}
    },
    async stream(){
      const samples=[]
      for(const y of [1023.8,1024.2,1039.8,1040.2,1056.2,1072]){place(y);eng.input.crouch=true;tick(4);const w=current();assert(w,'Canal gap after window shift');close(eng.player.z,L11_CANAL_BED);assert(eng.inLiquid===1,'Water state lost on seam');samples.push({world:[eng.player.x+eng.map.inf.ox,y],origin:[eng.map.inf.ox,eng.map.inf.oy],surface:w.surface,bottom:w.bottom,bridge:!!w.bridge})}
      await qa.warm();eng.input.crouch=false;tick(2);qa.look.pitch=.06;settleView()
      const p=eng.player,waterMeshes:THREE.Object3D[]=[];qa.r.scene.traverse((o:THREE.Object3D)=>{if(o.name==='l11-canal-water')waterMeshes.push(o)})
      const caster=new THREE.Raycaster(new THREE.Vector3(p.x,1,p.y),new THREE.Vector3(0,-1,0)),hit=caster.intersectObjects(waterMeshes)[0];assert(hit,'Streamed water mesh gap');close(hit.point.y,L11_WATER_SURFACE)
      return {samples,renderedSurface:hit.point.y,reflection:!!qa.r.scene.getObjectByName('l11-canal-reflection')}
    }
  }
}
