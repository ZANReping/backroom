// Production renderer resource / cancellation checks for the streamed outpost.
export async function verifyTradersQuality(qa){
 const {engine:e,renderer:r,look}=qa,frame=()=>new Promise(requestAnimationFrame),rows=[],screenshots=[]
 const draw=()=>{r.three.info.reset();r.render(r.three.domElement,e,{grain:false,flicker:0,shake:false},1/60)}
 async function ready(label,all=false){
  e.paused=true;const start=performance.now()
  for(;;){await frame();draw();if(r.isNearWorldReady(e)&&(!all||r.tradersStream?.jobs.size===0&&r.tradersStream.groups.size===e.map.traders.chunks.size+1))break;if(performance.now()-start>90000)throw Error('Quality readiness timeout '+label)}
  await frame();draw();await frame();draw()
  let bad=0,geos=new Set(),proxies=0
  for(const entry of r.chunkGroups.values())entry.group.traverse(o=>{
   if(o.userData.colliderProxy){proxies++;if(o.visible)bad++}
   if(o.geometry&&!geos.has(o.geometry)){geos.add(o.geometry);for(const a of Object.values(o.geometry.attributes))for(const n of a.array)if(!Number.isFinite(n))bad++}
  })
  if(bad)throw Error('Invalid geometry / duplicate visible proxies '+bad)
  const row={label,readyMs:performance.now()-start,groups:r.tradersStream?.groups.size,jobs:r.tradersStream?.jobs.size,memory:{...r.three.info.memory},programs:r.three.info.programs.length,proxies,geometriesChecked:geos.size,calls:r.three.info.render.calls,triangles:r.three.info.render.triangles}
  rows.push(row);return row
 }
 look.yaw=-Math.PI/2;look.pitch=0
 for(const [mode,texture] of [['classic',0],['realistic',1],['classic',1],['realistic',0],['realistic',1]]){
  r.setLightMode(mode);r.setTextureQuality(texture);await ready(mode+'-texture-'+texture);screenshots.push({label:mode+'-'+texture,png:r.three.domElement.toDataURL('image/png')})
 }
 // Cancel a destination while its cooperative jobs and shader polls are live.
 e.player.x=403;e.player.y=241
 for(let i=0;i<3;i++){await frame();draw()}
 e.loadLevel(104,{mapSeed:424242,firstVisit:false});await ready('cancel-to-other-outpost')
 e.loadLevel(102,{mapSeed:424242,firstVisit:false});await ready('return-after-cancel',true)
 // Opening/closing after a restored open state must also update collision indexing.
 const {canOccupy}=await import('/src/game/core/player.ts'),{enableRuntimeStructCollisionIndex}=await import('/src/game/world/mapgen.ts')
 const d=e.map.structures.find(s=>s.data?.tradersDoor);d.data.open=1;d.solid=false;enableRuntimeStructCollisionIndex(e.map)
 if(!canOccupy(e.map,d.x+d.w/2,d.y,.30,{z:.02,band:0}))throw Error('Open restored door blocks body')
 d.data.open=0;d.solid=true;enableRuntimeStructCollisionIndex(e.map)
 if(canOccupy(e.map,d.x+d.w/2,d.y,.30,{z:.02,band:0}))throw Error('Closed restored door fails collision')
 const {storage}=await import('/src/game/core/storage.ts'),memory=new Map()
 // The performance harness intentionally disables persistence. Supply a private
 // in-memory slot store for these real Engine save/restore checks.
 Object.assign(storage,{get:k=>memory.get(k)??null,set:(k,v)=>memory.set(k,v),remove:k=>memory.delete(k)})
 const {route}=await import('/src/game/engine/career.ts'),{factionState}=await import('/src/game/engine/factionMissions.ts'),{migrateBntg}=await import('/src/game/engine/bntg.ts')
 factionState(e,'bntg');const career=route(e,'bntg');career.joined=true;career.rank=3;career.task=4;career.active=false
 const progress=migrateBntg(e);progress.proofs['1']=['package','quantity'];progress.vault.sequence=7;progress.vault.slots=[3,4,5]
 e.player.hp=73;e.player.thirst=61;e.player.backpack[0]={type:'almond',count:1};e.player.hotbar[0]={type:'battery',count:2}
 if(!e.warehouseDeposit('bntg',{w:'hotbar',i:0}))throw Error('Existing warehouse deposit failed')
 e.persist();const saved=e.snapshot(),seed=e.seed
 e.newRun(seed,'normal','slot1')
 if(e.warehouses.bntg[0]?.type!=='battery'||e.warehouses.bntg[0]?.count!==2||e.player.backpack[0]?.type!=='almond'||e.player.hp!==73||e.player.thirst!==61)throw Error('Items, warehouse or attributes lost during reload')
 if(e.career.routes.bntg.rank!==3||e.career.routes.bntg.task!==4||e.career.bntg.vault.sequence!==7||e.career.bntg.proofs['1'].join()!=='package,quantity')throw Error('Business progress lost during reload')
 saved.bntgLayout=3;saved.player.x=35;saved.player.y=35;storage.set('br_save_slot1',JSON.stringify(saved));e.newRun(seed,'normal','slot1')
 if(e.player.x!==9||e.player.y!==109||e.warehouses.bntg[0]?.count!==2||e.player.backpack[0]?.type!=='almond'||e.player.hp!==73||e.career.routes.bntg.rank!==3||e.career.bntg.vault.sequence!==7)throw Error('Legacy migration lost items, stats or progress')
 if(!e.warehouseWithdraw('bntg',0)||e.player.hotbar[0]?.type!=='battery'||e.player.hotbar[0]?.count!==2)throw Error('Existing warehouse withdraw failed')
 await ready('nonempty-save-and-legacy-migration')
 return{ok:true,rows,screenshots,stateChecks:['actual deposit and withdrawal','nonempty warehouse and inventory reload','attributes and rank/task/proofs/vault progress reload','same records preserved by old-layout migration']}
}
