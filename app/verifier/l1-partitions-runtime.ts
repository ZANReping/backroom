import {canOccupy} from '../src/game/core/player'
import {mapSight} from '../src/game/world/mapSight'
import {L1_PHOTO_ANCHORS,L1_SHOWCASE_SEED} from '../src/game/world/l1Spatial'
import {buildL1Data} from '../src/game/world/l1Building'

/** Exercise authored fine walls through the actual stitched game map, rather
 * than assuming a rendered volume is automatically a movement/sight collider. */
export async function verifyL1Partitions(qa:any){
 const checks:string[]=[],check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);checks.push(label)}
 const a=L1_PHOTO_ANCHORS.find(a=>a.id==='parking-dim')!,e=qa.eng
 await qa.scene(1);qa.moveTo(a.x,a.y);await qa.warm()
 const occupy=(x:number,z:number)=>canOccupy(e.map,a.centerX+x-e.map.inf.ox,a.centerY+z-e.map.inf.oy,.32,{z:0})
 check(occupy(a.x-a.centerX,a.y-a.centerY),'标定机位具备正常玩家身体净空')
 for(const z of [6,15.8,16.2,20]){
  check(!occupy(3.85,z),`细墙阻止穿越：相对 Z=${z}`)
  check(occupy(3.2,z)&&occupy(4.5,z),`细墙两面保留实际通路：相对 Z=${z}`)
 }
 check(!occupy(5,3.85),'墙面转折处使用同一实体碰撞')
 const cx=Math.floor((a.centerX+3.8)/32),cy=Math.floor((a.centerY+15.8)/32)
 const left=buildL1Data(L1_SHOWCASE_SEED,cx,cy),right=buildL1Data(L1_SHOWCASE_SEED,cx,cy+1)
 const wall=(d:typeof left)=>d.boxes.find(b=>b.id.startsWith('partition:parking-dim:0:'))!
 const p=wall(left),q=wall(right)
 check(p&&q&&p.max[2]===q.min[2]&&p.min[0]===q.min[0]&&p.max[0]===q.max[0]&&p.max[1]===q.max[1],'跨区块墙面端点、厚度和顶高一致')
 qa.moveTo(a.centerX+2.7,a.centerY+6);e.player.z=0;Object.assign(qa.look,{yaw:-Math.PI/2,pitch:0,roll:0})
 const sight=mapSight(e,-Math.PI/2),middle=sight.points[Math.floor(sight.points.length/2)]
 check(Math.abs(Math.hypot(middle.x,middle.y)-1)<.03,'地图视野在细墙真实表面停止')
 await qa.warm();const front=qa.captureFrame(1280,720)
 qa.moveTo(a.centerX+6.2,a.centerY+8);Object.assign(qa.look,{yaw:1.2,pitch:-.25,roll:0});qa.r.setFov(72)
 e.player.flashlight=true;e.player.battery=100;await qa.warm()
 const back=qa.captureFrame(1280,720)
 check(canOccupy(e.map,e.player.x,e.player.y,.32,{z:0}),'背面检查位置可正常到达')
 return{checks,images:{front,backFlashlight:back},seam:{before:p,after:q}}
}
