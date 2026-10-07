import type {Engine} from '../src/game/engine'
import {canOccupy,PLAYER_RADIUS} from '../src/game/core/player'
import {scanInteract,doInteract,updateContainerSearch,takeLoot,closeLootPanel} from '../src/game/engine/interact'
import {captureL0,restoreL0,l0RevisionSafe,enterL0Red,tickL0} from '../src/game/engine/l0State'
import {genL0Architecture} from '../src/game/world/l0Architecture'
import {redZonesNear,insideRedZone} from '../src/game/world/l0RedZone'
import {requestDevMapPreview,devMapTeleport} from '../src/game/engine/devMap'

export async function verifyMapPreview(qa:any){
 const e:Engine=qa.eng;await qa.scene(0);await qa.warm();e.devEnabled=true
 const m=e.map!,inf=m.inf!,snapshot=()=>JSON.stringify({player:e.player,items:m.items,entities:m.entities,chunks:[...inf.chunks.keys()],explored:[...e.explored],state:inf.l0})
 const before=snapshot(),view={x:e.player.x+inf.ox+2048,y:e.player.y+inf.oy+2048,span:256,floor:0},abort=new AbortController()
 const cancelled=requestDevMapPreview(e,view,abort.signal).then(()=>false,error=>error.name==='AbortError');abort.abort();if(!await cancelled)throw Error('Stale preview was not cancelled')
 const start=performance.now(),preview=await requestDevMapPreview(e,view,new AbortController().signal),elapsedMs=performance.now()-start
 if(snapshot()!==before)throw Error('Preview modified the runtime world or explored map')
 const position={...e.player},ledger=JSON.stringify(inf.l0),failed=await devMapTeleport(e,{x:position.x+inf.ox,y:position.y+inf.oy,floor:2})
 if(failed||JSON.stringify(e.player)!==JSON.stringify(position)||JSON.stringify(e.map!.inf!.l0)!==ledger)throw Error('Unsupported floor teleport failed to roll back')
 return{pass:true,elapsedMs,cells:preview.cells.length,span:view.span,distance:2048,cancelled:true,worldUnchanged:true,failedTeleportRolledBack:true}
}

/** Exercise production collision, interaction and the live GPU revision swap. */
export async function verifyL0Runtime(qa:any){
 const e:Engine=qa.eng,r=qa.r,look=qa.look,checks:string[]=[]
 const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message);checks.push(message)}
 const next=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
 const animated=async(s:any,count:number)=>{
  const model=r.structMeshes.get(s),pivots:any[]=[];model?.traverse((o:any)=>{if(o.userData.lid)pivots.push(o)})
  check(pivots.length===count,'replacement model preserves '+count+' animated pivots for '+s.kind)
  for(let i=0;i<240&&pivots.some(p=>Math.abs(p.rotation.y)<.4);i++)await next()
  check(pivots.every(p=>Math.abs(p.rotation.y)>=.4),'replacement '+s.kind+' visibly opens through production animation')
 }
 const aim=async(x:number,y:number,z=1.3)=>{const dx=x-e.player.x,dy=y-e.player.y,dz=z-1.55;look.yaw=Math.atan2(-dx,-dy);look.pitch=Math.atan2(dz,Math.hypot(dx,dy));await next();scanInteract(e)}
 await qa.anchor('manila-inside');await qa.warm()
 const m=e.map!,inf=m.inf!,doors=m.structures.filter(s=>s.data?.l0Door&&s.x+inf.ox>576&&s.x+inf.ox<608)
 check(doors.length===4,'Manila has four physical doors')
 for(const door of doors){
  const x=door.x+door.w/2,y=door.y+door.h/2,dx=592-inf.ox-x,dy=16-inf.oy-y,n=Math.hypot(dx,dy)
  e.player.x=x+dx/n*1.25;e.player.y=y+dy/n*1.25;e.player.z=0
  check(!canOccupy(m,x,y,PLAYER_RADIUS,{z:0}),'closed door blocks movement')
  await aim(x,y);check(e.interactTarget?.s===door,'crosshair selects the corresponding door');doInteract(e)
  check(door.data?.open===1&&!door.solid&&canOccupy(m,x,y,PLAYER_RADIUS,{z:0}),'opening door releases its collision')
  await animated(door,1)
  e.player.x=x;e.player.y=y;await aim(x+dx/n,y+dy/n);check(e.interactTarget?.s===door,'open door can be selected while in its doorway');doInteract(e)
  check(!door.data?.open&&canOccupy(m,e.player.x,e.player.y,PLAYER_RADIUS,{z:0}),'closing inside doorway pushes player clear of the actual jambs')
 }
 const cabinet=m.structures.find(s=>s.data?.manilaTable&&s.x+inf.ox>576)!
 e.player.x=cabinet.x+.4;e.player.y=cabinet.y-1.05
 await aim(cabinet.x+.4,cabinet.y+.1,.5);check(e.interactTarget?.s===cabinet,'cabinet selectable below tabletop');doInteract(e)
 check(!!e.searching,'cabinet search starts through ordinary interaction')
 for(let i=0;i<120&&e.searching;i++)updateContainerSearch(e,.1)
 check(e.lootPanel?.items.length===4,'cabinet contains the four fixed supplies')
 await animated(cabinet,2)
 check(takeLoot(e,0),'cabinet supply can be taken');closeLootPanel(e)
 const sid=cabinet.data!.sid;e.l0World=captureL0(e);restoreL0(e)
 check(e.map!.structures.find(s=>s.data?.sid===sid)?.data?.lootItems?.length===3,'partial cabinet loot survives rebuild')
 const exit=e.map!.exits.find(v=>v.def.kind==='flickerdoor'&&v.x+inf.ox>576&&v.x+inf.ox<608)!
 check(exit,'Manila wall exit still exists')
 e.player.x=exit.x+.9;e.player.y=exit.y+.5;e.player.z=0
 await aim(exit.x+.5,exit.y+.5,1.05)
 check(e.interactTarget?.e===exit,'opaque flickering wall retains ordinary exit targeting');doInteract(e)
 check(e.transition?.dest===exit.def.dest,'opaque flickering wall retains exit transition')
 e.loadLevel(0,{mapSeed:763,firstVisit:false});look.yaw=0;await qa.warm()
 const current=e.map!,world=current.inf!
 let candidate:any
 for(const c of world.chunks.values()){
  if(!c.l0||!['maze','open','pillarhall','blackout'].includes(c.l0.region))continue
  const layout=genL0Architecture(e.levelDef,world.seed,c.cx,c.cy,undefined,1).l0!
  if(r.chunkGroups.has(c.key)&&l0RevisionSafe(e,layout)){candidate={key:c.key,revision:1,layout,affected:[...world.chunks.values()].filter(n=>Math.abs(n.cx-c.cx)<=1&&Math.abs(n.cy-c.cy)<=1).map(n=>n.key)};break}
 }
 check(!!candidate,'an unobserved connected revision is available')
 const group=r.chunkGroups.get(candidate.key).group,old=group.getObjectByName('l0-static')
 world.l0Pending=candidate;let frames=0
 while(world.l0Pending&&frames++<1200){await next();const changed=world.l0!.revisions[candidate.key]===1;checkSwap(changed,group.getObjectByName('l0-static')!==old)}
 function checkSwap(collision:boolean,visual:boolean){if(collision!==visual)throw Error('geometry and collision were switched in different frames')}
 check(world.l0!.revisions[candidate.key]===1,'live prepared revision commits geometry and collision atomically')
 await qa.anchor('red');await qa.warm()
 const redMap=e.map!,redWorld=redMap.inf!,position=[e.player.x,e.player.y],wx=e.player.x+redWorld.ox,wy=e.player.y+redWorld.oy
 const zone=redZonesNear(redWorld.seed,Math.floor(wx/32),Math.floor(wy/32)).find(z=>insideRedZone(z,wx,wy))!
 check(!!zone,'reference red room belongs to a physical enclosure');enterL0Red(e)
 const swaps=[]
 for(let turn=0;turn<12&&redWorld.l0!.redProgress?.[zone.id]?.closed.length!==zone.gates.length;turn++){
  look.yaw=turn*Math.PI/3;e.time+=1;tickL0(e,.1)
  const pending=redWorld.l0Pending;if(!pending)continue
  const oldClosed=redWorld.l0!.redProgress![zone.id].closed.length,roots=(pending.affected??[]).flatMap(key=>{const group=r.chunkGroups.get(key)?.group;return group?[{group,old:group.getObjectByName('l0-static')}]:[]})
  let n=0
  while(redWorld.l0Pending&&n++<3000){await next();const changed=redWorld.l0!.redProgress![zone.id].closed.length!==oldClosed;for(const root of roots)checkSwap(changed,root.group.getObjectByName('l0-static')!==root.old)}
  check(!redWorld.l0Pending,'red closure GPU preparation completes');swaps.push({frames:n,affected:roots.length,closed:redWorld.l0!.redProgress![zone.id].closed.length})
 }
 check(redWorld.l0!.redProgress![zone.id].closed.length===zone.gates.length&&redWorld.l0!.trapped,'turning away eventually seals every opening')
 check(e.map===redMap&&e.player.x===position[0]&&e.player.y===position[1],'sealing neither replaces the world nor teleports the player')
 check(zone.gates.every(g=>!canOccupy(redMap,g.x+g.w/2-redWorld.ox,g.y+g.h/2-redWorld.oy,PLAYER_RADIUS,{z:0})),'all sealed openings have solid collision')
 return{checks,revision:{key:candidate.key,frames},red:{gates:zone.gates.length,swaps},limits:'Single-player production interaction, observation-driven enclosure and atomic GPU/collision swaps.'}
}
