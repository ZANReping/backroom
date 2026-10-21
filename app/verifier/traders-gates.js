// Production Engine/Renderer and real return targets, isolated headless QA only.
export async function verifyTradersGates(qa,{baseline=false}={}){
 const {engine:e,renderer:r,look}=qa,{Box3,Vector3}=await import('three')
 const {devMapTeleport}=await import('/src/game/engine/devMap.ts')
 const {TRADERS_ENTRIES}=await import('/src/game/content/tradersLayout.ts')
 const {scanInteract,doInteract}=await import('/src/game/engine/interact.ts')
 const shots=[],rows=[],frame=()=>new Promise(requestAnimationFrame)
 e.devEnabled=true;e.dev.god=true;e.dev.statLock=true;e.handsStowed=true;e.paused=true
 async function settle(x,y,yaw,pitch=-.025){
  if(!await devMapTeleport(e,{x,y,floor:0}))throw Error('Unsafe gate camera')
  look.yaw=yaw;look.pitch=pitch;const start=performance.now();let tail=0
  for(;;){await frame();r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)
   if(r.isNearWorldReady(e)){if(++tail>60)break}else tail=0
   if(performance.now()-start>60000)throw Error('Gate readiness timeout')
  }
 }
 for(const entry of TRADERS_ENTRIES){
  const nx=-Math.sin(entry.face),ny=-Math.cos(entry.face)
  await settle(entry.x+nx*4,entry.y+ny*4,Math.atan2(nx,ny))
  const ex=e.map.exits.find(x=>Math.hypot(x.x+.5-entry.x,x.y+.5-entry.y)<.01)
  const roots=[];for(const record of r.tradersStream.groups.values())record.group.traverse(o=>{if(o.userData.exitRef===ex)roots.push(o)})
  if(roots.length!==1)throw Error('Missing or duplicate '+entry.id+' gate')
  const box=new Box3().setFromObject(roots[0]),size=box.getSize(new Vector3())
  const gate=roots[0].userData.tradersGate
  rows.push({id:entry.id,position:{x:entry.x,y:entry.y},size:size.toArray(),model:gate??null,returnTarget:ex.def.dest})
  shots.push({label:entry.id+'-gate',png:r.three.domElement.toDataURL('image/png')})
  if(!baseline&&(!gate||Math.abs(gate.width-4.8)>.001||Math.abs(gate.height-3.3)>.001))throw Error('Gate does not match opening')
  if(baseline)continue
  // Real interaction from the inner approach, and from either door leaf.
  for(const lateral of [0,-.9,.9]){
   const x=entry.x+nx*1.15+ny*lateral,y=entry.y+ny*1.15-nx*lateral
   if(!await devMapTeleport(e,{x,y,floor:0}))throw Error('Blocked door approach')
   look.yaw=Math.atan2(nx,ny);look.pitch=-.1;r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60);scanInteract(e)
   if(e.interactTarget?.kind!=='exit'||e.interactTarget.e!==ex)throw Error('Return gate aim failed '+entry.id+':'+lateral+':'+e.interactTarget?.label)
  }
 }
 // Real generated furnishings must not create generic business prompts.
 await settle(23,109,Math.PI/2,-.025)
 const samples=['fitout.west.planter.0.0','fitout.west.directory','fitout.west.water','fitout.west.notices','fitout.bank.queue.71']
 const decorations=[]
 for(const id of samples){
  const s=e.map.structures.find(s=>s.data?.tradersId===id)
  if(!s)throw Error('Missing furnishing '+id)
  const x=s.x+s.w/2,y=s.y+s.h/2
  if(!await devMapTeleport(e,{x,y:y+1.8+s.h/2,floor:0}))throw Error('Unsafe furnishing approach')
  look.yaw=0;look.pitch=-.25;r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60);scanInteract(e)
  if(e.interactTarget?.s===s&&e.interactTarget.kind==='settlementstation'||e.interactTarget?.label?.includes('贸易设施'))throw Error('Decorative business interaction remains '+id)
  decorations.push({id,target:e.interactTarget?.label??null})
 }
 const s=e.map.structures.find(s=>s.data?.tradersId==='service_market')
 if(!s)throw Error('Missing real service')
 await devMapTeleport(e,{x:s.x+s.w/2,y:s.y+s.h+1.05,floor:0})
 look.yaw=0;look.pitch=-.30;r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60);scanInteract(e)
 if(e.interactTarget?.kind!=='settlementstation'||e.interactTarget.s!==s)throw Error('Configured service unavailable: '+e.interactTarget?.label)
 const service=e.interactTarget.label,events=[],emit=e.emit
 try{e.emit=function(event){events.push({kind:event.kind,text:event.text});return emit.call(this,event)};doInteract(e)}finally{e.emit=emit}
 if(!events.some(event=>event.kind==='facility'&&event.text==='bntg'))throw Error('Configured service dispatch failed')
 await settle(9.2,107.2,Math.atan2(5.2,-1.8),-.025)
 shots.push({label:'west-gate-oblique',png:r.three.domElement.toDataURL('image/png')})
 return{ok:true,baseline,rows,decorations,service,events,shots}
}
