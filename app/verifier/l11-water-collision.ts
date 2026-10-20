import * as THREE from 'three'
import { l11CityPlan,l11SurfaceAt,l11TerrainHeight,l11World } from '../src/game/world/l11Layout'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import { L11 } from '../src/game/levels/l11'
import { l11PropColliders } from '../src/game/world/l11Collision'
import { l11SolidSurface } from '../src/game/world/l11Solid'
import { floorHeight,structStandTopAt,l11HeadCeilingAt } from '../src/game/world/mapgen'
import { canOccupy } from '../src/game/core/player'
import { updateMovement } from '../src/game/engine/movement'
import { l11Material } from '../src/game/renderer/l11Materials'
import { waterUniforms } from '../src/game/renderer/water'
import { circlePolygon } from '../src/game/world/l11Geometry'

const assert=(v:unknown,msg:string)=>{if(!v)throw Error(msg)}
const dm={dmg:1,drain:1}
export function attachWaterCollision(qa:any){
  const eng=qa.eng,seed=20261006,plan=l11CityPlan(seed,0,0)
  const reset=()=>{eng.input.mx=eng.input.my=0;eng.input.jump=false;eng.input.sprint=false;eng.input.crouch=false;eng.player.crouching=false;eng.player.vz=0;eng.onStairs=false;eng.ride=eng.climb=null;eng.moveIt.acc=0;eng.dev.noclip=false}
  const tick=(n=1,dt=1/60)=>{for(let i=0;i<n;i++)updateMovement(eng,dt,dm,false)}
  let originals=new Map<THREE.Mesh,THREE.Material|THREE.Material[]>()
  qa.wc={
    async water(){
      for(const canal of plan.canals)for(let i=1;i<canal.points.length;i++){
        const a=canal.points[i-1],b=canal.points[i],len=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/len,dy=(b[1]-a[1])/len
        for(const t of [.35,.5,.65])for(const side of [-1,1]){
          const tx=a[0]+(b[0]-a[0])*t,ty=a[1]+(b[1]-a[1])*t,x=tx-dy*(canal.width/2+5)*side,y=ty+dx*(canal.width/2+5)*side
          if(x<32||y<32||x>980||y>980||l11SurfaceAt(seed,tx,ty).kind!=='canal'||plan.buildings.some(b=>circlePolygon(x,y,1,b.footprint)))continue
          qa.moveTo(x,y);reset();eng.player.z=l11TerrainHeight(seed,x,y)+.25;qa.look.yaw=Math.atan2(x-tx,y-ty);qa.look.pitch=-.19;qa.look.roll=0;qa.r.setRealWater(true);qa.freezeRenderTime(10);await qa.warm()
          return {x,y,target:[tx,ty],yaw:qa.look.yaw,pitch:qa.look.pitch,state:this.waterState()}
        }
      }throw Error('No canal viewpoint')
    },
    waterState(){const meshes:THREE.Mesh[]=[];qa.r.scene.traverse((o:THREE.Object3D)=>{if(o.name==='l11-canal-water')meshes.push(o as THREE.Mesh)});assert(meshes.length,'Missing real canal water mesh');return {meshes:meshes.length,reflection:!!qa.r.scene.getObjectByName('l11-canal-reflection'),exposure:qa.r.three.toneMappingExposure,materials:[...new Set(meshes.map(m=>(m.material as THREE.Material).name))],depth:[Math.min(...meshes.flatMap(m=>Array.from(m.geometry.getAttribute('aDepth').array))),Math.max(...meshes.flatMap(m=>Array.from(m.geometry.getAttribute('aDepth').array)))],time:waterUniforms.uWaterTime.value,rain:waterUniforms.uWaterRain.value,origin:waterUniforms.uWaterOrigin.value.toArray(),transparent:meshes.every(m=>(m.material as THREE.Material).transparent),depthWrite:meshes.some(m=>(m.material as THREE.Material).depthWrite)}},
    legacy(on:boolean){const mirror=qa.r.scene.getObjectByName('l11-canal-reflection');if(mirror)mirror.visible=!on;if(on){originals=new Map();qa.r.scene.traverse((o:THREE.Object3D)=>{if(o.name==='l11-canal-water'){const mesh=o as THREE.Mesh;originals.set(mesh,mesh.material);mesh.material=l11Material('sealedglass','#244b52')}})}else{for(const [mesh,mat]of originals)mesh.material=mat;originals.clear()}},
    watchReflection(){const mirror=qa.r.scene.getObjectByName('l11-canal-reflection');assert(mirror,'Missing mirror to dispose');const disposed={geometry:0,target:0,material:0};mirror.geometry.addEventListener('dispose',()=>disposed.geometry++);mirror.getRenderTarget().addEventListener('dispose',()=>disposed.target++);mirror.material.addEventListener('dispose',()=>disposed.material++);qa.wc.disposed=disposed;return disposed},
    async stairs(){
      const b=plan.buildings.find(b=>b.stairs.length&&Math.abs(b.angle)>.1)??plan.buildings.find(b=>b.stairs.length)!,s=b.stairs[0],along=s.axis==='x',start=l11World(b,s.x+(along?.25:s.width/2),s.y+(along?s.width/2:.25))
      qa.moveTo(...start);reset();eng.player.z=b.base+.15;await qa.warm()
      const end=l11World(b,s.x+(along?s.length-.15:s.width/2),s.y+(along?s.width/2:s.length-.15)),dx=end[0]-start[0],dy=end[1]-start[1],len=Math.hypot(dx,dy)
      eng.input.mx=dx/len;eng.input.my=dy/len
      for(let i=0;i<260&&Math.hypot(eng.player.x+eng.map.inf.ox-end[0],eng.player.y+eng.map.inf.oy-end[1])>.2;i++)tick()
      eng.input.mx=eng.input.my=0
      const distance=Math.hypot(eng.player.x+eng.map.inf.ox-end[0],eng.player.y+eng.map.inf.oy-end[1]);assert(distance<.25&&eng.player.z>b.base+2.7,`Stairs blocked: distance=${distance},z=${eng.player.z-b.base}`)
      return {building:b.id,angle:b.angle,flight:0,distance,height:eng.player.z-b.base}
    },
    async drop(kind:string){
      let sample:any
      outer:for(let cy=0;cy<20;cy++)for(let cx=0;cx<20;cx++){sample=genL11ChunkRaw(L11,seed,cx,cy).structures.find(s=>s.kind===kind);if(sample)break outer}
      assert(sample,'No generated '+kind)
      const wx=sample.x+sample.w/2,wy=sample.y+sample.h/2;qa.moveTo(wx,wy);reset();await qa.warm()
      const s=eng.map.structures.find((s:any)=>s.data?.instanceId===sample.data.instanceId);assert(s,'Streamed prop missing')
      const x=s.x+s.w/2,y=s.y+s.h/2,base=floorHeight(eng.map,x,y,s.floor??0)+Number(s.data?.mount??0)
      const modelTop=base+Math.max(...l11PropColliders(s).map(b=>l11SolidSurface(b,x,y,.32)))
      Object.assign(eng.player,{x,y,z:modelTop+.4,vz:-24});const supported=structStandTopAt(eng.map,x,y,eng.player.z,s.floor??0)
      assert(Math.abs(supported-modelTop)<.025,`${kind} neighbouring support ${supported}/${modelTop}`)
      tick(1,.05);assert(Math.abs(eng.player.z-modelTop)<.025,`${kind} drop crossed model: ${eng.player.z}/${modelTop}`)
      tick(10);assert(Math.abs(eng.player.z-modelTop)<.025,`${kind} top did not remain supporting`)
      assert(canOccupy(eng.map,x,y,.32,{z:modelTop+.03,band:eng.player.floor}),kind+' own surface blocks standing body')
      const blocked=!canOccupy(eng.map,x,y,.32,{z:base,band:s.floor??0});assert(blocked,kind+' body passed through prop')
      qa.look.yaw=.45;qa.look.pitch=-.55;qa.freezeRenderTime(10)
      return {kind,id:s.data.instanceId,world:[wx,wy],base,modelTop,landed:eng.player.z,blockedAtBase:blocked}
    },
    async canopy(){
      let sample:any
      outer:for(let cy=0;cy<20;cy++)for(let cx=0;cx<20;cx++){sample=genL11ChunkRaw(L11,seed,cx,cy).structures.find(s=>s.kind==='l11_bus_shelter');if(sample)break outer}
      assert(sample,'No generated shelter');qa.moveTo(sample.x+sample.w/2,sample.y+sample.h/2);reset();await qa.warm()
      const s=eng.map.structures.find((s:any)=>s.data?.instanceId===sample.data.instanceId),a=-Number(s.data.deg)*Math.PI/180
      let pos:any
      for(const dx of [0,-.7,.7])for(const dz of [-.35,-.65,0]){const x=s.x+s.w/2+dx*Math.cos(a)-dz*Math.sin(a),y=s.y+s.h/2+dx*Math.sin(a)+dz*Math.cos(a),z=floorHeight(eng.map,x,y,0);if(canOccupy(eng.map,x,y,.32,{z,band:0})){const h=l11HeadCeilingAt(eng.map,x,y,z,1.55);if(h<z+2.9&&h>z+1.8){pos={x,y,z,h};break}}}
      assert(pos,'No clear shelter headroom');Object.assign(eng.player,{x:pos.x,y:pos.y,z:pos.z,vz:0});eng.input.jump=true
      let peak=pos.z,stopped=false;for(let i=0;i<65;i++){tick();peak=Math.max(peak,eng.player.z);if(Math.abs(eng.player.z+1.55-pos.h)<.025&&eng.player.vz===0)stopped=true}
      assert(stopped&&peak+1.55<=pos.h+.025,'Head crossed canopy underside')
      return {kind:s.kind,underside:pos.h,peakHead:peak+1.55,stopped}
    },
    async roof(){
      const b=plan.buildings.find(b=>b.volumes.some(v=>v.shape==='gable'))!,v=b.volumes.find(v=>v.shape==='gable')!,world=l11World(b,v.x+v.w*.12,v.y+v.d*.34)
      qa.moveTo(...world);reset();eng.player.z=b.base+v.hi+5;await qa.warm()
      const x=eng.player.x,y=eng.player.y,h=structStandTopAt(eng.map,x,y,eng.player.z,2)
      assert(h>b.base+v.hi+.2&&h<b.base+v.hi+3,'Gabled roof did not supply its sloping top')
      Object.assign(eng.player,{z:h+1.2,vz:-30});tick(1,.05);tick(10)
      assert(Math.abs(eng.player.z-h)<.025,'Fell through actual building roof')
      assert(canOccupy(eng.map,x,y,.32,{z:h+.03,band:2}),'Building roof uses old full-height wall')
      const roots:THREE.Object3D[]=[];qa.r.scene.traverse((o:THREE.Object3D)=>{if(o.userData.l11Instance===b.id)roots.push(o)})
      const lod=roots[0]?.children.find(o=>o instanceof THREE.LOD) as THREE.LOD;assert(lod,'Roof model not loaded')
      roots[0].updateWorldMatrix(true,true);const ray=new THREE.Raycaster(),heights:number[]=[]
      for(let i=0;i<48;i++){const a=i*Math.PI/24;ray.set(new THREE.Vector3(x+.32*Math.cos(a),h+5,y+.32*Math.sin(a)),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(lod.levels[0].object,true)[0];if(hit)heights.push(hit.point.y)}
      const meshTop=Math.max(...heights);assert(Math.abs(meshTop-h)<.025,`Roof support/model discrepancy ${h}/${meshTop}`)
      qa.look.yaw=-.8;qa.look.pitch=-.45;qa.freezeRenderTime(10)
      const timings:number[]=[];for(let i=0;i<60;i++){const t=performance.now();tick();timings.push(performance.now()-t)}timings.sort((a,b)=>a-b)
      return {building:b.id,shape:v.shape,angle:b.angle,collisionTop:h,meshTop,landed:eng.player.z,physicsMs:{median:timings[30],p95:timings[57],max:timings[59]}}
    }
  }
}
