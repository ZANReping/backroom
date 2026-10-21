// Complete production scene: no preview-only meshes or materials.
export async function verifyTradersDressing(qa,{labels}={}){
 const {engine:e,renderer:r,look}=qa,{devMapTeleport}=await import('/src/game/engine/devMap.ts')
 const {TRADERS_VAULT_CELLS}=await import('/src/game/content/tradersLayout.ts'),{enableRuntimeStructCollisionIndex}=await import('/src/game/world/mapgen.ts')
 const frame=()=>new Promise(requestAnimationFrame),shots=[],rows=[]
 e.devEnabled=true;e.dev.god=true;e.dev.statLock=true;e.handsStowed=true;e.paused=true
 const ordinary=TRADERS_VAULT_CELLS[0],cold=TRADERS_VAULT_CELLS.find(c=>c.storage==='cold')
 for(const room of [ordinary,cold]){const door=e.map.structures.find(s=>s.data?.tradersId==='door_'+room.id);door.data.open=1;door.solid=false}
 enableRuntimeStructCollisionIndex(e.map)
 const cases=[
 ['west-waiting',21,101,0,-.10],['arrival-guide',18,99.3,0,.03],['bank-layout',108,94,0,-.04],
 ['archive-detail',81,51.8,0,-.08],['copy-detail',89,51.3,0,-.12],['tea-detail',83,103.8,Math.PI,-.23],
 ['food-court',325,100,0,-.04],['tray-return',311,122.6,Math.PI,-.10],
 ['wash-basins',82,111.7,Math.PI,-.07],['wash-cubicles',86.2,112.4,0,-.10],
 ['office-detail',353.5,219,.55,-.05],['office-layout',370,232,.60,-.04],
 ['monitor-room',338,246.4,0,.03],['security-desk',307.7,216.4,0,-.06],
 ['meeting-room',364.6,266,0,-.08],['dorm-bed',394.8,220.1,.75,-.14],
 ['packing-bench',239,148,-.896,-.10],
 ['vault-storage',ordinary.x+ordinary.w/2,ordinary.y+1.2,Math.PI,-.10],
 ['cold-storage',cold.x+cold.w/2,cold.y+1.2,Math.PI,-.14]
 ]
 for(const [label,x,y,yaw,pitch] of cases.filter(c=>!labels||labels.includes(c[0]))){
  window.tradersDressingProgress={label,complete:rows.length,total:cases.length}
  if(!await devMapTeleport(e,{x,y,floor:0}))throw Error('Unsafe dressing view '+label)
  look.yaw=yaw;look.pitch=pitch;const start=performance.now();let tail=0
  for(;;){await frame();e.time+=1/60;e.updateNpcs(1/60);r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)
   if(r.isNearWorldReady(e)){if(++tail>65)break}else tail=0
   if(performance.now()-start>60000)throw Error('Dressing timeout '+label)
  }
  let drift=0;for(const n of e.npcs){const duty=e.map.traders.duties.get(n.id);if(duty?.activity!=='walk'&&Math.hypot(n.x-n.homeX,n.y-n.homeY)>.001)drift++}
  if(drift)throw Error('Fixed duty drift '+label)
  rows.push({label,x:e.player.x,y:e.player.y,yaw,pitch,readyMs:performance.now()-start,npcs:e.npcs.length,drift,memory:{...r.three.info.memory}})
  shots.push({label,png:r.three.domElement.toDataURL('image/png')})
 }
 return{ok:true,rows,shots}
}
