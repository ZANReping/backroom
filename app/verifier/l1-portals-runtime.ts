import {requestL1Bake} from '../src/game/renderer/l1BakeQueue'
import {l1PortalLightingStats,l1PortalVisibility} from '../src/game/renderer/l1PortalLighting'
import {canOccupy} from '../src/game/core/player'
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms))
async function frame(qa:any){
 const image=qa.captureFrame(640,360),img=new Image();img.src=image;await img.decode()
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;const g=canvas.getContext('2d')!;g.drawImage(img,0,0)
 // Meter the same central floor patch, excluding any opening newly revealed by the moving door.
 const pixels=g.getImageData(240,130,160,100).data;let sum=0
 for(let i=0;i<pixels.length;i+=4)sum+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722
 return{image,luminance:sum/(pixels.length/4)}
}
export async function verifyL1Portals(qa:any){
 await qa.scene(1,'open',1);qa.moveTo(-240,-240);qa.r.setEyeAdaptation(false);qa.freezeRenderTime(15);await qa.warm()
 const e=qa.eng,inf=e.map.inf,checks:string[]=[],assert=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
 const doors=e.map.structures.filter((s:any)=>s.data?.l1PortalId),ids=new Set(doors.map((s:any)=>s.data.l1PortalId))
 let best:any
 for(const c of inf.chunks.values()){
  if(!c.l1)continue
  const r=requestL1Bake(c.l1,'high').result;if(!r?.portalWeights||!r.portalIds)continue
  for(const m of r.meshes){
   if(m.surface!=='floor')continue
   for(let t=0;t<m.index.length;t+=3){
    const vi=[m.index[t],m.index[t+1],m.index[t+2]];if(m.normal[vi[0]*3+1]<.9)continue
    const x=vi.reduce((n,i)=>n+m.position[i*3],0)/3+c.cx*32,z=vi.reduce((n,i)=>n+m.position[i*3+2],0)/3+c.cy*32
    if(!canOccupy(e.map,x-inf.ox,z-inf.oy,.38,{z:0}))continue
    const u=vi.reduce((n,i)=>n+m.uv1[i*2],0)/3,v=vi.reduce((n,i)=>n+m.uv1[i*2+1],0)/3,p=Math.floor(v*r.size)*r.size+Math.floor(u*r.size)
    for(let d=0;d<r.portalIds.length;d++){
     const id=r.portalIds[d];if(!ids.has(id))continue
     const value=r.portalWeights[(Math.floor(d/4)*r.size*r.size+p)*4+d%4]/255
     if(value>(best?.weight??.05))best={x,z,id,weight:value}
    }
   }
  }
 }
 assert(best,'存在穿过真实门洞、受开合影响的可站立地面')
 qa.moveTo(best.x,best.z);e.player.z=0;Object.assign(qa.look,{yaw:0,pitch:-1.45,roll:0});qa.r.setFov(52);await qa.warm()
 const door=e.map.structures.find((s:any)=>s.data?.l1PortalId===best.id),groups=()=>JSON.stringify([...qa.r.chunkGroups].map(([k,v]:any)=>[k,v.group.id]))
 assert(!!door&&qa.r.animatedStructMeshes.has(door),'照明门与游戏门使用相同稳定身份')
 door.data.open=0;door.solid=true;await wait(1200);const identity=groups(),closed=await frame(qa),v0=l1PortalVisibility(inf.seed,[best.id],[1])
 door.data.open=1;door.solid=false;await wait(1200);const open=await frame(qa),v1=l1PortalVisibility(inf.seed,[best.id],[1])
 assert(v0===0&&v1>.99,'门扇动画驱动原生光通量')
 assert(open.luminance>closed.luminance+.15,'固定地面接收点在开门后变亮')
 door.data.open=0;door.solid=true;await wait(1200);const restored=await frame(qa)
 assert(Math.abs(restored.luminance-closed.luminance)<.25,'关门恢复相同地面照度')
 assert(identity===groups(),'开关门不重建建筑或烘焙')
 e.blackoutPendingDur=60;e.applyBlackout();await wait(250);const dark=await frame(qa)
 e.player.flashlight=true;e.player.battery=100;e.player.flashJamT=0;await wait(300);const flash=await frame(qa)
 assert(flash.luminance>dark.luminance+1,'闭门停电时便携光不被原生光遮罩抑制')
 return{checks,receiver:best,brightness:{closed:closed.luminance,open:open.luminance,restored:restored.luminance,dark:dark.luminance,flash:flash.luminance},portals:l1PortalLightingStats(),images:{closed:closed.image,open:open.image,restored:restored.image,dark:dark.image,flash:flash.image}}
}
