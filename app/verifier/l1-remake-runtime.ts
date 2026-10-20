import {captureL1,restoreL1,tickL1Dynamics} from '../src/game/engine/l1State'
import {updateMovement} from '../src/game/engine/movement'
import {l1ContainerKey} from '../src/game/world/l1Dynamics'
import {canOccupy} from '../src/game/core/player'
import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial'
import {mapSight} from '../src/game/world/mapSight'
import {stableAt} from '../src/game/engine/career'
export async function verifyL1Runtime(qa:any){
 const e=qa.eng,passed:string[]=[],check=(ok:unknown,name:string)=>{if(!ok)throw Error(name);passed.push(name)}
 await qa.scene(1)
 check(canOccupy(e.map,e.player.x,e.player.y,.32,{z:0,crouch:false,band:0}),'出生身体净空')
 e.map.lights.push({x:e.player.x,y:e.player.y,r:5,color:'#27ff71',flickerSeed:0,intensityMul:1})
 e.blackoutPendingDur=60;e.applyBlackout()
 check(e.map.inf.blackout&&e.blackoutT===60,'停电实际生效')
 check(e.map.lights.every((l:any)=>l.keep===1||!l.gen),'停电剔除全部原生照明')
 check(e.map.lights.some((l:any)=>l.color==='#27ff71'&&!l.gen),'停电保留玩家投出光源')
 e.plantK=.51;e.plantStage=2;e.l1World=captureL1(e)
 e.blackoutT=0;e.plantK=0;restoreL1(e)
 check(e.blackoutT===60&&e.map.inf.blackout&&e.plantK===.51,'读档保持停电与异变')
 e.endBlackout();check(!e.map.inf.blackout,'恢复照明')
 const state=e.map.inf.l1Dynamics;state.powerWait=.1;tickL1Dynamics(e,.2)
 check(e.blackoutWarnT>0&&e.blackoutPendingDur>=45&&e.blackoutPendingDur<=90,'45–90秒停电预警')
 check(state.powerWait>=300&&state.powerWait<=600,'5–10分钟间隔')
 e.blackoutWarnT=0;e.blackoutT=0;e.dev.phenOff.add('flicker')
 const chunk=[...e.map.inf.chunks.values()].find((c:any)=>c.structures.some((s:any)=>s.data?.l1Crate)) as any
 const box=chunk?.structures.find((s:any)=>s.data?.l1Crate)
 check(!!box,'板条箱生成')
 box.looted=true;box.data.searched=1;box.data.lootItems=[];const key=l1ContainerKey(chunk.cx,chunk.cy,box)
 e.l1World=captureL1(e);restoreL1(e)
 check(e.map.inf.l1Dynamics.containers[key]?.looted===true&&e.map.inf.l1Dynamics.containers[key]?.data.lootItems.length===0,'搜刮记录不因切换刷新')
 const visible=new Set(mapSight(e).cells)
 const candidates=[...e.map.inf.chunks.values()].flatMap((c:any)=>c.structures.filter((s:any)=>s.data?.l1Crate).map((s:any)=>({c,s}))) as any[]
 const unseen=candidates.filter(({s})=>Math.hypot(s.x-e.player.x,s.y-e.player.y)>14&&!visible.has(Math.floor(s.y+s.h/2)*e.map.w+Math.floor(s.x+s.w/2))&&!stableAt(e,s.x,s.y))
 check(unseen.length>1,'视线外板条箱候选存在')
 const stored=unseen[0];stored.s.data.playerStored=1;const storedHidden=Number(stored.s.data.l1Hidden??0)
 const changing=unseen[1];changing.s.looted=true;changing.s.data.searched=1;changing.s.data.lootItems=[]
 await qa.warm()
 const rootsBefore=new Map([...qa.r.chunkGroups].map(([key,value]:any)=>[key,value.group])),redoBefore=e.map.inf.redo??0
 const hiddenBefore=Number(changing.s.data.l1Hidden??0);let shifted=false
 for(let i=0;i<40&&!shifted;i++){
  e.time+=31;e.map.inf.l1Dynamics.crateWait=0;tickL1Dynamics(e,.01)
  shifted=Number(changing.s.data.l1Hidden??0)!==hiddenBefore
 }
 check(shifted,'未被看见的箱子低频变化')
 check(Number(stored.s.data.l1Hidden??0)===storedHidden,'玩家存放物品的箱子保持稳定')
 check(changing.s.looted&&changing.s.data.lootItems.length===0,'箱子异常变化不刷新已搜刮物资')
 await qa.warm()
 check((e.map.inf.redo??0)===redoBefore,'箱子变化不触发整层重建')
 check([...rootsBefore].every(([key,root])=>qa.r.chunkGroups.get(key)?.group===root),'箱子变化保持已加载区块对象身份')
 check([...qa.r.structMeshes].filter(([s]:any)=>s.data?.l1Crate).every(([s,root]:any)=>root.visible===!s.data.l1Hidden),'隐藏及重现箱子的独立模型状态正确')
 const visibleBox=candidates.find(({s})=>!s.data.l1Hidden&&qa.r.structMeshes.has(s))?.s
 check(visibleBox&&canOccupy(e.map,visibleBox.x+.5,visibleBox.y+visibleBox.h+.4,.25,{z:0}),'长方体箱后方不残留旧正方体碰撞')
 e.dev.phenOn.add('plantcancer');e.plantK=0;e.plantStage=0
 for(let i=0;i<150;i++)updateMovement(e,1)
 check(Math.abs(e.plantK-.5)<.001,'150秒达到异变一半')
 e.dev.phenOn.delete('plantcancer');e.dev.phenOff.add('plantcancer')
 for(let i=0;i<75;i++)updateMovement(e,1)
 check(e.plantK<.001,'离开后异变恢复')
 e.dev.phenOff.delete('plantcancer');e.dev.phenOff.delete('flicker')
 await qa.scene(1);qa.moveTo(175,48)
 const door=e.map.structures.find((s:any)=>s.kind==='inkdoor')
 check(!!door,'各区段小径门生成')
 const mx=door.x+door.w/2,my=door.y+door.h/2
 check(!canOccupy(e.map,mx,my,.32,{z:0}),'关闭的小径门阻挡身体')
 const offsets=door.data?.rot?[[0,1.7],[0,-1.7]]:[[1.7,0],[-1.7,0]]
 const side=offsets.find(([x,y])=>canOccupy(e.map,mx+x,my+y,.32,{z:0}))
 check(!!side,'小径门外保留可通行入口')
 e.player.x=mx+side![0];e.player.y=my+side![1];e.player.z=0
 qa.look.yaw=Math.atan2(e.player.x-mx,e.player.y-my);qa.look.pitch=0
 // Publish the same centre ray used by the live renderer before the interaction scan.
 qa.look.rayX=-Math.sin(qa.look.yaw);qa.look.rayY=-Math.cos(qa.look.yaw);qa.look.rayZ=0
 e.scanInteract();check(e.interactTarget?.s===door,'准星识别小径门')
 e.doInteract();check(door.data.open&&!door.solid&&canOccupy(e.map,mx,my,.32,{z:0}),'实际交互开门后可通行')
 e.scanInteract();e.doInteract();check(!door.data.open&&door.solid,'实际交互关门')
 await qa.scene(1);qa.moveTo(116.5,116.5)
 check(e.map.structures.some((s:any)=>s.kind==='landmark'&&s.data?.outpost==='alpha'),'Alpha 工业入口与既有目的地连接')
 check(e.enterOutpost('alpha')&&e.transition?.dest===101,'原有据点进入流程仍可用');e.transition=null
 const blocked=[]
 for(const a of L1_PHOTO_ANCHORS){await qa.scene(1);qa.moveTo(a.x,a.y);if(!canOccupy(e.map,e.player.x,e.player.y,.32,{z:0}))blocked.push(a.id)}
 check(!blocked.length,'18 个参考位置身体净空'+(blocked.length?': '+blocked.join(', '):''))
 for(const id of ['storage','gothic','ouroboros','garden','path-corridor']){
  const a=L1_PHOTO_ANCHORS.find(a=>a.id===id)!;await qa.scene(1);qa.moveTo(a.x,a.y)
  check(e.map.lights.some((l:any)=>l.gen&&!l.keep),id+' 原生照明存在')
  e.blackoutPendingDur=60;e.applyBlackout();check(e.map.lights.every((l:any)=>l.keep===1||!l.gen),id+' 停电清除原生光源')
 }
 await qa.scene(1);return {passed}
}
