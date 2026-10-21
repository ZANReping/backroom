// Focused production-renderer views after final sign depth / fixed-contact adjustments.
export async function verifyTradersFitoutDetails(qa){
 const {engine:e,renderer:r,look}=qa,shots=[],rows=[],frame=()=>new Promise(requestAnimationFrame)
 const {devMapTeleport}=await import('/src/game/engine/devMap.ts')
 e.devEnabled=true;e.dev.god=true;e.dev.statLock=true;e.handsStowed=true
 const cases=[['bazaar-final',100,42.4,-Math.PI/2,-.02],['waiting-final',21,101,0,-.1],['bank-final',108,94,0,-.04],['vault-final',190,82.6,-Math.PI/2,-.02],['workstation-final',353.5,219,.55,-.05]]
 for(const [label,x,y,yaw,pitch] of cases){
  if(!await devMapTeleport(e,{x,y,floor:0}))throw Error('Invalid detail camera '+label)
  look.yaw=yaw;look.pitch=pitch;e.paused=true
  const start=performance.now();let tail=0
  for(;;){await frame();e.time+=1/60;e.updateNpcs(1/60);r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)
   if(r.isNearWorldReady(e)){if(++tail>80)break}else tail=0
   if(performance.now()-start>60000)throw Error('Detail timeout '+label)
  }
  let seated=0,drift=0
  for(const n of e.npcs){const d=e.map.traders.duties.get(n.id);if(d?.seatHeight)seated++;if(d?.activity!=='walk'&&Math.hypot(n.x-n.homeX,n.y-n.homeY)>.001)drift++}
  if(drift)throw Error('Fixed duty position drift')
  rows.push({label,x:e.player.x,y:e.player.y,yaw,pitch,readyMs:performance.now()-start,active:e.npcs.length,seated,drift,memory:{...r.three.info.memory}})
  shots.push({label,png:r.three.domElement.toDataURL('image/png')})
 }
 return{ok:true,rows,shots}
}
