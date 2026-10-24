// Owned actual-App acceptance. Reuses the real ATM/legacy-save flow, then the shops and gun inputs.
export async function verifyShopsGuns({send,evaluate,at,until,key,click,shot,assert,resume}){
 const report={shops:[],guns:[],samples:[],resources:[],views:[]}
 const sleep=ms=>evaluate(`new Promise(r=>setTimeout(r,${ms}))`)
 const settle=()=>until('__renderer.tradersStream.jobs.size===0 && __renderer.tradersStream.groups.size===__engine.map.traders.chunks.size+1','all shop architecture and dressing ready')
 const fixture=await evaluate(`({hotbar:structuredClone(__engine.player.hotbar),backpack:structuredClone(__engine.player.backpack),bank:structuredClone(__engine.bntgBank),selected:__engine.player.selected,stowed:__engine.handsStowed})`)
 const shops=await evaluate(`(async()=>{const {TRADERS_SHOPS,tradersShopFrame}=await import('/src/game/content/tradersShops.ts');return TRADERS_SHOPS.map(s=>{const f=tradersShopFrame(s),h=__engine.map.traders.homes.find(h=>h.id===s.vendor);return {...s,...f,home:h}})})()`)
 for(const s of shops){
  await at(s.cx,s.r.y+s.r.h+3.5,0,-.06);await settle();await sleep(700);await shot('20-'+s.id+'-entrance')
  const h=s.home;await at(h.x,h.y+2.55,0,0)
  await until(`__engine.npcs.some(n=>n.id===${JSON.stringify(s.vendor)})`,'shop owner streamed '+s.id)
  assert(await evaluate(`(()=>{__engine.scanInteract();return __engine.interactTarget?.npc?.id===${JSON.stringify(s.vendor)}})()`),'look-at scan hits owner of '+s.name)
  await shot('21-'+s.id+'-counter');await key('KeyE','e');await until('document.querySelector(".dlg-panel")','shop conversation '+s.id)
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.dlg-panel button')].find(b=>/看看货|换点|交易|买点|买糖|有什么货/.test(b.textContent));if(!b)throw Error(document.querySelector('.dlg-panel').innerText);b.click()})()`)
  await until('document.querySelector(".bntg-payment")','shop payment '+s.id)
  report.shops.push({id:s.id,vendor:s.vendor,room:s.room,text:await evaluate('document.querySelector(".dlg-panel").innerText')})
  await shot('22-'+s.id+'-trade');await key('Escape','Escape');await until('!__engine.paused','close shop trade')
 }
 // A test account supplies credit; all eleven purchases still go through the real dialogue UI.
 const armory=shops.find(s=>s.id==='guns')
 await evaluate(`(()=>{const e=__engine;e.player.hotbar=Array(7).fill(null);e.player.backpack=e.player.backpack.map(()=>null);e.bntgBank.balance=2000;e.handsStowed=true;e.syncPassives()})()`)
 await at(armory.home.x,armory.home.y+2.55,0,0);await key('KeyE','e');await until('document.querySelector(".dlg-panel")','Kat purchase conversation')
 await click('.dlg-panel button','看看货');await until('document.querySelector(".bntg-payment")','Kat accepts bank credits');await click('.bntg-payment-options button','仅信用点')
 const stock=await evaluate(`(async()=>{const {GUNS,AMMO}=await import('/src/game/content/firearms.ts');const {ITEMS}=await import('/src/game/content/items.ts');return [...Object.keys(GUNS),...Object.keys(AMMO)].map(t=>({type:t,name:ITEMS[t].name,qty:AMMO[t]?.box??1}))})()`)
 for(const item of stock){await click('.dlg-panel button',item.name);assert(await evaluate(`__engine.countItem(${JSON.stringify(item.type)})===${item.qty}`),'credit purchase delivers '+item.qty+' '+item.type)}
 assert(await evaluate('__engine.bntgBank.balance===1287'),'five guns and six boxes debit 713 credits total')
 await shot('23-armory-purchase');await key('Escape','Escape');await until('!__engine.paused','leave gun shop dialogue')
 const L=await evaluate(`(async()=>{const {tradersGunLane}=await import('/src/game/content/tradersShops.ts');return tradersGunLane()})()`)
 async function aimAt(t){
  await evaluate(`(async()=>{const p=__engine.player,t=${JSON.stringify(t)},{seatedEyeHeight}=await import('/src/game/engine/seating.ts'),dx=t.x-p.x,dy=t.y-p.y;__look.yaw=Math.atan2(-dx,-dy);__look.pitch=Math.atan2(t.z-p.z-seatedEyeHeight(__engine),Math.hypot(dx,dy))})()`);await sleep(180)
 }
 await at(L.targets[0].x,L.booth.y+L.booth.h-.65,0,0);await settle();await aimAt(L.targets[0]);await sleep(800);if(await evaluate('__engine.handsStowed'))await key('AltLeft','Alt')
 await evaluate(`(async()=>{const {setKeybind}=await import('/src/game/core/keybinds.ts');setKeybind('attack','KeyK');setKeybind('quickuse','KeyB')})()`)
 const guns=stock.slice(0,5)
 for(let i=0;i<guns.length;i++){
  const g=guns[i];await key('Digit'+(i+1),String(i+1));await aimAt(L.targets[0]);await sleep(850)
  assert(await evaluate(`!__engine.handsStowed&&__renderer.gunView.active&&__renderer.gunView.gunType===${JSON.stringify(g.type)}`),'real view model active: '+g.type)
  await shot('30-'+g.type+'-hip');await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyB',key:'b'});await until('__engine.gun.aim>.8','hold-to-aim '+g.type)
  await shot('31-'+g.type+'-ads');await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyB',key:'b'});await sleep(350)
  await key('KeyR','r');await until('__engine.gun.act!=="idle"','R starts reload '+g.type);await sleep(180);await shot('32-'+g.type+'-reload')
  await until('__engine.gun.act==="idle"','animated reload complete '+g.type)
  const before=await evaluate(`({shotN:__engine.gun.shotN,mag:[...__engine.player.hotbar[${i}].mag],ammo:__engine.player.hotbar[${i}].ammoSel})`)
  assert(before.mag.some(c=>c&&c!=='spent'),'reload transfers real ammunition into '+g.type)
  await aimAt(L.targets[0]);await key('KeyK','k');await until(`__engine.gun.shotN===${before.shotN+1}`,'K fires '+g.type)
  await shot('33-'+g.type+'-fire');await until('__engine.gun.act==="idle"','shot and action cycling complete '+g.type)
  const state=await evaluate(`({slot:structuredClone(__engine.player.hotbar[${i}]),targetMessages:__engine.msgLog.filter(m=>m.text.includes('靶')).slice(-4).map(m=>m.text),muzzleFlash:__renderer.gunView.flashK})`)
  report.guns.push({type:g.type,before,...state})
 }
 assert(report.guns.some(g=>g.targetMessages.some(t=>t.includes('环'))),'actual paper target reports scored hits')
 // Long R uses the existing radial, and the water-gun wheel is still a separate mode.
 await key('Digit1','1');await sleep(400);await send('Input.dispatchKeyEvent',{type:'keyDown',code:'KeyR',key:'r'});await sleep(400)
 assert(await evaluate(`document.body.innerText.includes('双管猎枪 · 选弹')&&document.body.innerText.includes('爆团弹')`),'hold R displays compatible shell types in the ammo wheel');await shot('34-ammo-wheel');await send('Input.dispatchKeyEvent',{type:'keyUp',code:'KeyR',key:'r'})
 await evaluate('window.dispatchEvent(new Event("blur"))');assert(await evaluate('!__engine.input.aimHeld'),'focus loss clears aim input')
 // Turning away closes a gun, aiming downrange restores it after the configured delay.
 await evaluate('__look.yaw=Math.PI');await until('__engine.handsStowed','trial rule holsters when aiming away')
 const denied=await evaluate('__engine.gun.shotN');await key('KeyK','k');assert(await evaluate(`__engine.gun.shotN===${denied}`),'stowed firearm cannot fire')
 await aimAt(L.targets[0]);await until('!__engine.handsStowed','trial rule restores gun after returning aim to targets')
 await at(armory.cx+3,armory.r.y+armory.r.h+3.5,0,0);await until('__engine.handsStowed','leaving shooting position holsters gun');await shot('35-outside-lane-stowed')
 // Loaded/spent chambers follow this exact dropped gun through real pickup and a full reload.
 await at(L.targets[0].x,L.booth.y+L.booth.h-.65,0,0);await aimAt(L.targets[0]);await until('!__engine.handsStowed','restore gun for drop')
 const dropState=await evaluate(`(()=>{const e=__engine,s=structuredClone(e.player.hotbar[0]),x=e.player.x,y=e.player.y;e.dropSlot('hotbar',0);return {s,x,y,item:structuredClone(e.map.items.at(-1))}})()`)
 assert(JSON.stringify(dropState.s.mag)===JSON.stringify(dropState.item.mag),'drop preserves loaded and spent shotgun chambers')
 await at(dropState.x-.6,dropState.y-.6,-Math.PI*.75,-.86)
 await evaluate('__engine.scanInteract()');await key('KeyE','e');await sleep(200)
 assert(await evaluate(`__engine.player.hotbar.some(s=>s?.type==='dbshotgun'&&JSON.stringify(s.mag)===${JSON.stringify(JSON.stringify(dropState.s.mag))})`),'E pickup restores exact chamber state')
 await evaluate('__engine.persist()');const savedGuns=await evaluate(`JSON.stringify(__engine.player.hotbar.filter(s=>s&&['dbshotgun','leverrifle','revolver','musket','trapdoor'].includes(s.type)))`)
 await resume();assert(await evaluate(`JSON.stringify(__engine.player.hotbar.filter(s=>s&&['dbshotgun','leverrifle','revolver','musket','trapdoor'].includes(s.type)))===${JSON.stringify(savedGuns)}&&__engine.gun.act==='idle'&&__engine.gun.pending.length===0`),'full page reload restores all five guns while clearing transient actions')
 // Touch UI on the desktop browser; this is interaction coverage, not Android performance.
 await at(L.targets[0].x,L.booth.y+L.booth.h-.65,0,0);await aimAt(L.targets[0]);await sleep(800);if(await evaluate('__engine.handsStowed'))await key('AltLeft','Alt')
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await sleep(600)
 await until('document.querySelector(".tc-reload")','mobile reload control')
 await shot('36-touch-controls')
 assert(await evaluate(`(()=>{const r=document.querySelector('[data-gun-hud]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>0})()`),'firearm HUD fits touch viewport')
 await evaluate(`(()=>{const b=document.querySelector('.tc-quickuse');b.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,changedTouches:[]}))})()`)
 await until('__engine.gun.aim>.6','touch aim button held');await evaluate(`document.querySelector('.tc-quickuse').dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,changedTouches:[]}))`);assert(await evaluate('!__engine.input.aimHeld'),'touch cancellation clears aiming')
 await evaluate(`document.querySelector('.tc-reload').dispatchEvent(new TouchEvent('touchstart',{bubbles:true,changedTouches:[]}))`);await sleep(70);await evaluate(`document.querySelector('.tc-reload').dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,changedTouches:[]}))`);await sleep(500)
 assert(await evaluate('__engine.gun.act==="idle"'),'cancelled touch reload does not trigger a delayed action')
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await sleep(500)
 // Clear temporary shot effects. Repeat a fixed sequence, then check resources after retirement.
 await key('Digit5','5');await aimAt(L.targets[0]);await sleep(600)
 for(let round=0;round<3;round++){
  for(let n=0;n<3;n++){await key('KeyR','r');await until('__engine.gun.act==="idle"','repeat reload');await key('KeyK','k');await until('__engine.gun.act==="idle"','repeat shot')}
  await evaluate('__renderer.gunView.clearWorld();__renderer.gunWorldFx.clear()');await sleep(700)
  report.resources.push(await evaluate(`({...__renderer.three.info.memory,fly:__renderer.gunView.fly.length,decals:__renderer.gunWorldFx.decals.length,puffs:__renderer.gunWorldFx.puffs.length})`))
 }
 assert(report.resources[2].geometries===report.resources[1].geometries&&report.resources[2].textures===report.resources[1].textures,'repeated shooting/reloading returns to stable GPU resources')
 await settle();await sleep(2500)
 await evaluate(`(()=>{const r=__renderer;r.three.info.autoReset=false;window.__shopGunRender=r.render;r.render=function(...a){this.three.info.reset();return window.__shopGunRender.apply(this,a)}})()`)
 report.samples=await evaluate(`(async()=>{const q=(a,k)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*k)],rounds=[];for(let j=0;j<5;j++){let prev=performance.now();const a=[];for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const t=performance.now();a.push(t-prev);prev=t}rounds.push({medianMs:q(a,.5),p95Ms:q(a,.95),calls:__renderer.three.info.render.calls,triangles:__renderer.three.info.render.triangles,memory:{...__renderer.three.info.memory},npcs:__engine.npcs.length})}return rounds})()`)
 await shot('40-armory-final');await evaluate(`(()=>{const r=__renderer;r.render=window.__shopGunRender;r.three.info.autoReset=true;delete window.__shopGunRender})()`)
 // Leave the bank suite's original test inventory and ledger intact.
 await evaluate(`(()=>{const e=__engine,s=${JSON.stringify(fixture)};e.player.hotbar=s.hotbar;e.player.backpack=s.backpack;e.player.selected=s.selected;e.handsStowed=s.stowed;e.bntgBank=s.bank;e.syncPassives();e.persist()})()`)
 return report
}
