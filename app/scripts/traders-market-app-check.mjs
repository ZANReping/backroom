// Actual-game market acceptance, piggybacking on the bank/save/merchant UI flow.
export async function verifyTradersMarket({evaluate,at,until,key,click,shot,assert,resume}){
 const result={views:[],vendors:[],held:[],samples:[],resources:[]}
 const settle=()=>until('__renderer.tradersStream.jobs.size===0 && __renderer.tradersStream.groups.size===__engine.map.traders.chunks.size+1','market chunk dressing complete')
 const view=async(name,x,y,yaw,pitch=-.08)=>{await at(x,y,yaw,pitch);await settle();await evaluate('new Promise(r=>setTimeout(r,1100))');await shot(name);result.views.push({name,x,y,yaw,pitch})}
 await view('20-market-entry',43,91,0,0)
 assert(await evaluate('__engine.npcs.length<=32'),'market stays within the 32 active residents budget')
 const depts=await evaluate(`(async()=>{const {MARKET_DEPTS,marketVendorSpot}=await import('/src/game/content/tradersMarket.ts');return MARKET_DEPTS.map(d=>({...d,...marketVendorSpot(d)}))})()`)
 for(const d of depts){
  const distance=2.55,yaw=d.facing+Math.PI/2
  await at(d.x+Math.cos(d.facing)*distance,d.y+Math.sin(d.facing)*distance,yaw,0)
  const target=await evaluate(`(()=>{__engine.scanInteract();const t=__engine.interactTarget;return {kind:t?.kind,id:t?.npc?.id,label:t?.label}})()`)
  await key('KeyE','e');await until('document.querySelector(".dlg-panel")','stall conversation '+d.vendor)
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.dlg-panel button')].find(b=>/看看货|换点|交易|买点|买糖|有什么货/.test(b.textContent));if(!b)throw Error('Missing market trade '+document.querySelector('.dlg-panel').innerText);b.click()})()`)
  await until('document.querySelector(".bntg-payment")','market credit checkout '+d.vendor)
  const text=await evaluate(`document.querySelector('.dlg-panel').innerText`)
  assert(text.includes('信用点'),'credit payment available at '+d.name)
  result.vendors.push({id:d.vendor,target,text})
  if(['liquids','medkits','fuel'].includes(d.id))await shot('21-trade-'+d.id)
  await key('Escape','Escape');await until('!__engine.paused','close '+d.vendor)
 }
 await view('22-left-stalls',44,69,Math.PI/2,-.12)
 await view('23-right-stalls',41,49,-Math.PI/2,-.1)
 await view('24-rack-aisle',13.5,71,0,-.05)
 await view('25-receiving',43,25,0,-.10)
 await view('26-checkout',43,88,Math.PI/2,-.12)
 await view('27-market-credit-notice',48.9,91.4,Math.PI,-.15)
 // Isolate inventory exercises, then restore the player before the existing save/regression flow continues.
 const inventoryBefore=await evaluate(`({hotbar:structuredClone(__engine.player.hotbar),backpack:structuredClone(__engine.player.backpack),hp:__engine.player.hp,selected:__engine.player.selected,stowed:__engine.handsStowed,squirtAmmo:__engine.squirtAmmo,squirtTank:__engine.squirtTank})`)
 await at(43,82,0,-.12)
 const types=['memoryjuice','laughrepellent','babelbalm','outdoorkit','traumakit','saltbox']
 await evaluate(`(()=>{const e=__engine;e.player.hotbar=Array(7).fill(null);e.player.backpack=e.player.backpack.map(()=>null);for(const t of ${JSON.stringify(types)})e.addItem(t);e.handsStowed=false;e.syncPassives()})()`)
 for(let i=0;i<types.length;i++){
  await key('Digit'+(i+1),String(i+1));await evaluate('new Promise(r=>setTimeout(r,650))')
  assert(await evaluate(`(()=>{let n=0,ready=true;__renderer.vmItem?.traverse(o=>{for(const m of [].concat(o.material??[])){for(const t of [m.map,m.normalMap,m.roughnessMap])if(t){n++;ready=ready&&!!t.userData.loadedImage}}});return n>0&&ready})()`),'held textures ready at first selection: '+types[i])
  await shot('30-held-'+types[i]);result.held.push(types[i])
 }
 for(const [index,max,heal] of [[3,4,30],[4,8,40]]){
  await evaluate(`(()=>{const e=__engine;e.dev.statLock=false;e.player.hp=20;e.useSlot('hotbar',${index})})()`)
  await until('!__engine.usingItem','medical use animation')
  assert(await evaluate(`__engine.player.hotbar[${index}].dur===${max-1} && __engine.player.hp===${20+heal}`),'animated '+types[index]+' use deducts one charge and heals')
 }
 await evaluate(`(()=>{const e=__engine;e.dropSlot('hotbar',3);const item=e.map.items.at(-1);window.__marketDropId=item.id})()`)
 assert(await evaluate(`__engine.map.items.find(i=>i.id===window.__marketDropId)?.dur===3`),'dropped medical kit retains three charges')
 await at(42.4,81.4,-Math.PI*.75,-.86)
 await evaluate('new Promise(r=>setTimeout(r,250))')
 assert(await evaluate(`(()=>{__engine.scanInteract();return __engine.interactTarget?.kind==='item'&&__engine.interactTarget.it.id===window.__marketDropId})()`),'dropped kit selected by actual look-at scan')
 await key('KeyE','e');await evaluate('new Promise(r=>setTimeout(r,150))')
 assert(await evaluate(`!__engine.map.items.some(i=>i.id===window.__marketDropId)&&__engine.player.hotbar.some(s=>s?.type==='outdoorkit'&&s.dur===3)`),'actual item interaction picks up without refilling charges')
 await evaluate(`(()=>{const e=__engine;e.useSlot('hotbar',5)})()`)
 assert(await evaluate(`__engine.countItem('firesalt')===5&&__engine.countItem('saltbox')===0`),'salt box produces exactly five crystals in live game')
 await evaluate(`(()=>{const e=__engine;e.addItem('squirtgun');e.squirtAmmo=0;e.squirtTank='none';e.loadSquirt('memoryjuice')})()`)
 assert(await evaluate(`__engine.squirtTank==='memoryjuice'&&__engine.squirtAmmo===3`),'new liquid fills the existing water pistol')
 await evaluate(`(()=>{const e=__engine;e.persist();window.__marketSaved=JSON.parse(localStorage.getItem('br_save_slot1'))})()`)
 assert(await evaluate(`__marketSaved.player.hotbar.some(s=>s?.type==='outdoorkit'&&s.dur===3)&&__marketSaved.player.hotbar.some(s=>s?.type==='traumakit'&&s.dur===7)`),'remaining medical charges written to player save')
 await resume()
 assert(await evaluate(`__engine.player.hotbar.some(s=>s?.type==='outdoorkit'&&s.dur===3)&&__engine.player.hotbar.some(s=>s?.type==='traumakit'&&s.dur===7)&&__engine.countItem('firesalt')===5`),'full page reload restores used kits and split salt without duplication')
 await evaluate(`(()=>{const e=__engine,s=${JSON.stringify(inventoryBefore)};Object.assign(e.player,{hotbar:s.hotbar,backpack:s.backpack,hp:s.hp,selected:s.selected});e.dev.statLock=true;e.handsStowed=s.stowed;e.squirtAmmo=s.squirtAmmo;e.squirtTank=s.squirtTank;e.syncPassives();e.persist();delete window.__marketSaved;delete window.__marketDropId})()`)
 // Fixed market view: normal residents remain active; collect full-frame render counts.
 await view('40-market-final',43,89,0,-.04)
 await evaluate(`(()=>{const r=__renderer;if(r.three.info.autoReset){r.three.info.autoReset=false;window.__marketRender=r.render;r.render=function(...a){this.three.info.reset();return window.__marketRender.apply(this,a)}}})()`)
 await evaluate('new Promise(r=>setTimeout(r,2500))')
 result.samples=await evaluate(`(async()=>{const q=(a,k)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*k)],rounds=[];for(let j=0;j<5;j++){const a=[];let last=performance.now();for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const t=performance.now();a.push(t-last);last=t}rounds.push({medianMs:q(a,.5),p95Ms:q(a,.95),calls:__renderer.three.info.render.calls,triangles:__renderer.three.info.render.triangles,memory:{...__renderer.three.info.memory},npcs:__engine.npcs.length,chunks:__engine.map.traders.chunks.size})}return rounds})()`)
 await evaluate(`(()=>{const r=__renderer;if(window.__marketRender){r.render=window.__marketRender;r.three.info.autoReset=true;delete window.__marketRender}})()`)
 // Three round trips force distant chunks to leave the streaming window.
 for(let round=0;round<3;round++){
  await at(344,255,Math.PI/2);await settle();await at(43,89,0,-.04);await settle();await evaluate('new Promise(r=>setTimeout(r,1500))')
  result.resources.push(await evaluate(`({...__renderer.three.info.memory,npcs:__engine.npcs.length,chunks:__engine.map.traders.chunks.size,built:__renderer.tradersStream.groups.size,jobs:__renderer.tradersStream.jobs.size})`))
 }
 const r=result.resources;assert(r[2].textures===r[1].textures&&Math.abs(r[2].geometries-r[1].geometries)<=32,'market round trips retain stable textures and bounded resident geometry')
 return result
}
