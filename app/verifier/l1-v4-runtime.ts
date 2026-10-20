import {captureL1,restoreL1} from '../src/game/engine/l1State'
import {restoreSavedPlayerPosition} from '../src/game/engine/level'
import {canOccupy} from '../src/game/core/player'
import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial'
import {l1NativePower,l1ProbeIlluminance} from '../src/game/renderer/l1Probes'
import {l1BakeStats} from '../src/game/renderer/l1BakeQueue'
import {l1BuildMetrics} from '../src/game/renderer/l1BuildMetrics'
import {l1ContainerKey} from '../src/game/world/l1Dynamics'
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms))
async function imageStats(qa:any){
 const url=qa.captureFrame(640,360),img=new Image();img.src=url;await img.decode()
 const c=document.createElement('canvas');c.width=640;c.height=360;const g=c.getContext('2d')!;g.drawImage(img,0,0)
 const p=g.getImageData(0,180,640,180).data;let r=0,green=0,b=0;for(let i=0;i<p.length;i+=4){r+=p[i];green+=p[i+1];b+=p[i+2]}const n=p.length/4
 return{image:url,r:r/n,g:green/n,b:b/n,luminance:(r*.2126+green*.7152+b*.0722)/n}
}
export async function verifyL1V4(qa:any){
 const e=qa.eng,checks:string[]=[],assert=(v:unknown,s:string)=>{if(!v)throw Error(s);checks.push(s)}
 const a=L1_PHOTO_ANCHORS.find(a=>a.id==='parking-common')!
 await qa.scene(1);qa.moveTo(a.x,a.y);Object.assign(qa.look,{yaw:a.yaw,pitch:-.17,roll:0});qa.r.setEyeAdaptation(false);qa.freezeRenderTime(15);await qa.warm()
 const groups=()=>[...qa.r.chunkGroups].map(([k,v]:any)=>[k,v.group.id])
 const before=JSON.stringify(groups()),native=await imageStats(qa),inf=e.map.inf
 const nativeProbe=l1ProbeIlluminance(inf.seed,e.player.x+inf.ox,e.player.y+inf.oy)
 assert(nativeProbe>0,'原生探针照度非零')
 const materials:any[]=[];qa.r.scene.traverse((o:any)=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.userData?.l1Baked)materials.push(m)})
 assert(materials.some(m=>m.lightMap?.channel===1&&m.lightMap.type===1016),'独立 UV1 线性 HalfFloat 光照图已安装')
 e.blackoutPendingDur=60;e.applyBlackout();await delay(250)
 const dark=await imageStats(qa)
 assert(l1NativePower.value===0&&l1ProbeIlluminance(inf.seed,e.player.x+inf.ox,e.player.y+inf.oy)===0,'停电关闭原生烘焙与探针')
 assert(dark.luminance<native.luminance*.55,'实际帧停电显著变暗')
 e.player.flashlight=true;e.player.battery=100;e.player.flashJamT=0;await delay(200)
 const flash=await imageStats(qa);assert(flash.luminance>dark.luminance+1,'实际帧手电仍照亮静态建筑')
 e.player.flashlight=false
 // A real physical dropped glowstick goes through the normal light derivation.
 const id=9876543210,item={id,type:'glowstick',x:e.player.x-.5,y:e.player.y-1.2,z:0}
 e.map.items.push(item);await delay(400);const glow=await imageStats(qa)
 assert(glow.g>dark.g+.3&&glow.g-glow.r>dark.g-dark.r,'实际掉落荧光棒在停电中呈绿色照明')
 e.map.items=e.map.items.filter((v:any)=>v.id!==id);e.endBlackout();await delay(200)
 assert(l1NativePower.value===1&&JSON.stringify(groups())===before,'供电变化未重建区块')
 const spot={x:e.player.x+inf.ox,y:e.player.y+inf.oy},chunk=[...inf.chunks.values()].find((c:any)=>c.structures.some((s:any)=>s.data?.l1Crate)) as any
 const box=chunk.structures.find((s:any)=>s.data?.l1Crate);box.looted=true;box.data.searched=1;box.data.lootItems=[];const key=l1ContainerKey(chunk.cx,chunk.cy,box)
 const old=captureL1(e)!;old.generation=3;delete old.migration;old.taken.push(1234567);old.runtime={blackout:0,warning:0,pending:0,plant:.23,stage:1}
 const copy=JSON.stringify(old),inventory=JSON.stringify([e.player.backpack,e.player.hotbar,e.player.hp]);e.l1World=old;restoreL1(e)
 assert(JSON.stringify(old)===copy,'迁移不改写输入旧存档')
 assert(e.l1World.generation===4&&e.l1World.migration?.from===3,'记录 v3→v4 单次迁移')
 assert(e.map.inf.taken.has(1234567)&&e.map.inf.l1Dynamics.containers[key].looted&&e.map.inf.l1Dynamics.containers[key].data.lootItems.length===0,'保留物品身份和空箱搜刮记录')
 const migration=JSON.stringify(e.l1World.migration);e.l1World=captureL1(e);restoreL1(e)
 assert(JSON.stringify(e.l1World.migration)===migration&&JSON.stringify([e.player.backpack,e.player.hotbar,e.player.hp])===inventory,'重复迁移幂等，背包与属性不变')
 assert(restoreSavedPlayerPosition(e,spot)==='exact','合法旧坐标原位恢复')
 const column=e.map.structures.find((s:any)=>s.data?.l1Static&&s.data?.l1Column)
 assert(!!column,'迁移碰撞测试柱体存在')
 const result=restoreSavedPlayerPosition(e,{x:column.x+column.w/2+inf.ox,y:column.y+column.h/2+inf.oy})
 assert(result!=='exact'&&canOccupy(e.map,e.player.x,e.player.y,.32,{z:0}),'被新柱体覆盖的坐标迁移至合法通路')
 const images={native:native.image,blackout:dark.image,flashlight:flash.image,glowstick:glow.image}
 const brightness=[native,dark,flash,glow].map(({image,...values})=>values)
 return{checks,brightness,images,bake:l1BakeStats(),mainStages:l1BuildMetrics()}
}
export async function verifyL1Movement(qa:any){
 const e=qa.eng;await qa.scene(1,'open',7391);await qa.warm();qa.r.setEyeAdaptation(false)
 const events:any[]=[],frames:number[]=[],start=performance.now();let last=start,running=true
 function sample(t:number){frames.push(t-last);last=t;if(running)requestAnimationFrame(sample)}requestAnimationFrame(sample)
 // 128m at 4m/s; collision-aware stepping follows free space. Stream changes and
 // final settling are measured separately from warmed stationary samples.
 for(let i=0;i<160;i++){
  const t=performance.now(),inf=e.map.inf,wx=e.player.x+inf.ox,wy=e.player.y+inf.oy
  let placed=false
  for(const [dx,dy]of [[.8,0],[.57,.57],[.57,-.57],[0,.8],[0,-.8]])if(canOccupy(e.map,e.player.x+dx,e.player.y+dy,.32,{z:0})){qa.moveTo(wx+dx,wy+dy);qa.look.yaw=-Math.atan2(dx,-dy);placed=true;break}
  if(!placed)events.push({step:i,blocked:true})
  if(i%8===0)events.push({step:i,x:e.player.x+e.map.inf.ox,y:e.player.y+e.map.inf.oy,cpuMove:performance.now()-t,pending:qa.pendingWork(),cache:l1BakeStats(),resources:qa.stats().memory})
  await delay(Math.max(0,200-(performance.now()-t)))
 }
 running=false;const moveElapsed=performance.now()-start;const warm=await qa.warm();frames.sort((a,b)=>a-b)
 return{requestedDistance:128,moveElapsed,median:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1),frames:frames.length,events,settle:warm,mainStages:l1BuildMetrics(),end:qa.stats()}
}
