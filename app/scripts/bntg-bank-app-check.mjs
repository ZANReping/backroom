// Actual React terminal, live Engine, streamed world and real save slots in an owned headless profile.
export async function verifyBntgBank({send,evaluate,capture,base,waitFor,mode,checkpoint=()=>{},extraChecks}){
 const report={checks:[],shots:[],payments:[],metrics:[]},assert=(ok,label)=>{if(!ok)throw Error(label);report.checks.push(label);checkpoint(report)}
 const until=(expression,label)=>waitFor(()=>evaluate(`Boolean(${expression})`),label,90000)
 const click=async(selector,text)=>evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click()})()`)
 const shot=async(name)=>{await capture(name);report.shots.push(name);checkpoint(report)}
 const key=async(code,keyText)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',code,key:keyText});await send('Input.dispatchKeyEvent',{type:'keyUp',code,key:keyText})}
 const init=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,dynamicExposure:false,lightMode:${JSON.stringify(mode)},textureQuality:1,sceneLightLimit:16,shadowQuality:1,loadingBudgetMs:6,chunkBudgetMs:3,devMode:true,muted:true,grain:false,shake:false}))`})
 await send('Page.navigate',{url:base});await until(`window.__engine && document.querySelector(".title-menu")`,'actual title')
 await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier})
 await evaluate(`(async()=>{const {snapshot}=await import('/src/game/engine/save.ts');const s=snapshot(__engine),hotbar=new Array(7).fill(null);hotbar[0]={type:'presses',count:60};hotbar[1]={type:'presses',count:60};hotbar[2]={type:'presses',count:30};localStorage.setItem('br_save_slot1',JSON.stringify({...s,seed:424242,level:102,mapSeed:424242,bntgLayout:4,bntgBank:undefined,savedAt:Date.now(),player:{...s.player,level:102,x:103,y:103.4,z:0,floor:0,hotbar,backpack:new Array(24).fill(null)}}))})()`)
 async function resume(){
  await send('Page.reload');await until(`document.querySelector(".title-menu") && document.querySelector('canvas[data-title-level="102"][data-title-ready=true]')`,'saved scene title')
  await click('.menu-btn','继续游戏');await evaluate(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.trim()==='继续'&&b.parentElement.textContent.includes('存档槽 1'));if(!b)throw Error('Missing slot1');b.click()})()`)
  await until(`__engine.player.level===102 && document.querySelector(".hud-location-cluster") && !__engine.paused && __renderer.isNearWorldReady(__engine)`,'playable Traders Keep')
  await evaluate(`(()=>{const e=__engine;e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true;e.handsStowed=true;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='▾')?.click()})()`)
 }
 await resume();assert(await evaluate('__engine.bntgBank.balance===0'),'old save with no bank field initializes zero credit')
 const population=await evaluate(`(()=>{const homes=__engine.map.traders.homes;return {all:homes.length,fixed:homes.filter(h=>h.slot===undefined&&!h.id.startsWith('mkt_')&&!h.id.startsWith('shop_')).map(h=>h.id).sort(),present:__engine.npcs.map(n=>n.id),chunks:__engine.map.traders.chunks.size}})()`)
 report.population=population;assert(JSON.stringify(population.fixed)===JSON.stringify(['candyman','kui','lan','laozhangfang','shen','tang']),'only original six named Keep NPCs are instantiated from homes')
 assert(!population.present.some(id=>['vesper','dorian'].includes(id))&&population.all===189,'outside BNTG NPCs absent; 18 market, 11 shop and 154 local residents retained')
 async function at(x,y,yaw=Math.PI,pitch=-.13){
  assert(await evaluate(`(async()=>{const {devMapTeleport}=await import('/src/game/engine/devMap.ts');const ok=await devMapTeleport(__engine,{x:${x},y:${y},floor:0});__look.yaw=${yaw};__look.pitch=${pitch};return ok})()`),'safe QA position '+x+','+y)
  await until(`__renderer.isNearWorldReady(__engine)`,'streamed bank or merchant geometry');await evaluate('new Promise(r=>setTimeout(r,700))')
 }
 async function openAtm(x=103){
  await at(x,103.65)
  const target=await evaluate(`(()=>{__engine.scanInteract();return __engine.interactTarget?{kind:__engine.interactTarget.kind,label:__engine.interactTarget.label,can:__engine.interactTarget.can}:null})()`);report.lastTarget=target;checkpoint(report)
  assert(target?.kind==='bntgAtm','look-at scan selects real bank terminal')
  await key('KeyE','e');await until(`document.querySelector('[data-atm-screen="home"]')`,'ATM opened with E');assert(await evaluate('__engine.paused'),'terminal pauses game inputs')
 }
 await at(105,101.8,Math.PI,-.07);await shot('01-bank-machines')
 await openAtm();await shot('02-atm-home')
 await click('.atm-menu button','存入压印币');await click('.atm-quick button','100');await shot('03-deposit-amount')
 await click('.atm-actions button','下一步');await shot('04-deposit-confirm')
 await evaluate(`(()=>{const b=document.querySelector('[data-atm-confirm]');b.click();b.click()})()`)
 await until(`document.querySelector('[data-atm-screen="receipt"]')`,'deposit receipt')
 assert(await evaluate('__engine.bntgBank.balance===100 && __engine.countItem("presses")===50 && __engine.bntgBank.history.length===1'),'double confirm commits once: 100 credits / 50 cash')
 await shot('05-deposit-receipt');await click('.atm-actions button','继续办理')
 await click('.atm-menu button','取出压印币');await send('Input.insertText',{text:'20'});await click('.atm-actions button','下一步');await click('[data-atm-confirm]','确认')
 await until(`document.querySelector('[data-atm-screen="receipt"]')`,'withdrawal receipt')
 assert(await evaluate('__engine.bntgBank.balance===80 && __engine.countItem("presses")===70'),'withdrawal gives physical coins at 1:1')
 await shot('06-withdrawal-receipt');await click('.atm-actions button','继续办理');await click('.atm-menu button','交易明细');await shot('07-statement');await key('Escape','Escape');await until(`document.querySelector('[data-atm-screen="home"]')`,'Escape returns to terminal home')
 // Same interface remains legible at touch widths; no claim about Android performance.
 for(const [width,height,name] of [[390,844,'08-atm-mobile'],[844,390,'09-atm-landscape']]){
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await evaluate('new Promise(r=>setTimeout(r,300))')
  const bounds=await evaluate(`(()=>{const d=document.querySelector('.bntg-atm'),b=d.getBoundingClientRect();return {x:b.x,right:b.right,w:innerWidth,overflow:d.scrollWidth>d.clientWidth+1,buttons:[...d.querySelectorAll('button')].filter(x=>x.offsetParent).length}})()`)
  assert(bounds.x>=0&&bounds.right<=bounds.w&&!bounds.overflow,'ATM fits '+width+'px width without horizontal clipping');assert(await evaluate(`(()=>{const r=document.querySelector('.atm-lcd').getBoundingClientRect();return [...document.querySelectorAll('.atm-menu button')].every(b=>{const a=b.getBoundingClientRect();return a.top>=r.top&&a.bottom<=r.bottom&&a.bottom<=innerHeight})})()`),'all four services visible at '+width+'×'+height);await shot(name)
 }
 await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await click('.atm-close','×');await until(`!__engine.paused`,'ATM close resumes game')
 async function merchant(id){
  const home=await evaluate(`__engine.map.traders.homes.find(h=>h.id===${JSON.stringify(id)})`),angle=id==='candyman'?Math.PI/2:id.startsWith('mkt_')?home.facing:0,d=id==='candyman'||id.startsWith('mkt_')?2.55:1.5;await at(home.x+Math.cos(angle)*d,home.y+Math.sin(angle)*d,Math.PI/2-angle,0)
  await evaluate(`(()=>{const n=__engine.npcs.find(n=>n.id===${JSON.stringify(id)});if(!n)throw Error('NPC not streamed');__look.yaw=${Math.PI/2-angle};__look.pitch=0})()`)
  await evaluate('new Promise(r=>setTimeout(r,250))');await key('KeyE','e');await until('document.querySelector(".dlg-panel")','actual NPC dialog '+id)
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.dlg-panel button')].find(b=>/看看货|换点|交易|买点|买糖|有什么货/.test(b.textContent));if(!b)throw Error('Missing trade entry: '+document.querySelector('.dlg-panel').innerText);b.click()})()`)
  await until('document.querySelector(".bntg-payment")','credit payment selector '+id)
 }
 await merchant('candyman');await click('.bntg-payment-options button','仅信用点');await shot('10-candy-credit-payment')
 await evaluate(`document.querySelector('.dlg-panel button.flex.items-center.gap-2.border').click()`)
 assert(await evaluate('__engine.bntgBank.balance===75 && __engine.countItem("presses")===70'),'original candy bulk deal accepts credit only')
 await key('Escape','Escape');await until(`!__engine.paused`,'close merchant')
 await merchant('mkt_moore');await click('.bntg-payment-options button','仅信用点');await click('.dlg-panel button','头灯')
 assert(await evaluate('__engine.bntgBank.balance===49 && __engine.countItem("headlamp")===1 && __engine.countItem("presses")===70'),'Market lighting purchase uses credits and preserves physical coins')
 await shot('11-merchant-credit-receipt');await key('Escape','Escape');await until(`!__engine.paused`,'close merchant')
 await openAtm(107);await click('.atm-menu button','取出压印币');await send('Input.insertText',{text:'44'});await click('.atm-actions button','下一步');await click('[data-atm-confirm]','确认');await until(`document.querySelector('[data-atm-screen="receipt"]')`,'second terminal receipt');await click('.atm-actions button','结束服务');await until(`!__engine.paused`,'close ATM')
 await merchant('mkt_ramos');await click('.bntg-payment-options button','优先信用点');await click('.dlg-panel button','户外医疗箱')
 assert(await evaluate('__engine.bntgBank.balance===0 && __engine.countItem("presses")===101 && __engine.countItem("outdoorkit")===1'),'automatic payment splits 18 into 5 credits + 13 cash')
 await shot('12-mixed-payment');await key('Escape','Escape');await until(`!__engine.paused`,'close merchant')
 const saved=await evaluate(`(()=>{__engine.persist();return {bank:__engine.bntgBank,cash:__engine.countItem('presses'),headlamp:__engine.countItem('headlamp'),outdoorkit:__engine.countItem('outdoorkit'),snapshot:JSON.parse(localStorage.getItem('br_save_slot1')).bntgBank}})()`)
 report.saved=saved;checkpoint(report);assert(JSON.stringify(saved.bank)===JSON.stringify(saved.snapshot),'transaction balances and receipts written to real save slot')
 await resume();assert(await evaluate(`JSON.stringify(__engine.bntgBank)===${JSON.stringify(JSON.stringify(saved.bank))} && __engine.countItem('presses')===101 && __engine.countItem('headlamp')===1 && __engine.countItem('outdoorkit')===1`),'save/reload preserves money and purchased goods without duplication')
 await openAtm();await click('.atm-menu button','交易明细');await shot('13-restored-ledger');await click('.atm-close','×');await until(`!__engine.paused`,'close saved terminal')
 // Keyboard validation and cancellation do not deduct money.
 await openAtm();await click('.atm-menu button','存入压印币');await key('Enter','Enter')
 assert(await evaluate(`document.querySelector('.atm-error').textContent.includes('大于零') && __engine.bntgBank.balance===0`),'zero amount rejected by keyboard confirmation')
 await click('.atm-keypad button','1');await click('.atm-keypad button','0');await click('.atm-function-keys button','更正')
 assert(await evaluate(`document.querySelector('.atm-amount input').value==='1'`),'physical keypad correction removes one digit')
 await click('.atm-actions button','下一步');await click('.atm-actions button','修改金额');await key('Escape','Escape');await key('Escape','Escape');await until('!__engine.paused','cancel terminal')
 assert(await evaluate(`__engine.bntgBank.balance===0 && __engine.countItem('presses')===101 && __engine.bntgBank.history.length===6`),'cancel/back never transfers funds')
 if(extraChecks){report.market=await extraChecks({send,evaluate,at,until,key,click,shot,assert,resume});checkpoint(report);await at(103,103.65)}
 await until('__renderer.tradersStream.jobs.size===0 && __renderer.tradersStream.groups.size===__engine.map.traders.chunks.size+1','all loaded chunks have finished their streamed dressing')
 await evaluate(`(()=>{const e=__engine,r=__renderer;e.updateNpcs=()=>{};r.three.info.autoReset=false;const render=r.render;r.render=function(...a){this.three.info.reset();return render.apply(this,a)}})()`)
 await evaluate('new Promise(r=>setTimeout(r,2500))')
 report.openCloseResources=[]
 for(let i=0;i<3;i++){
  for(let n=0;n<4;n++){await key('KeyE','e');await until('document.querySelector(".bntg-atm")','repeated open');await click('.atm-close','×');await until('!__engine.paused','repeated close')}
  await evaluate('new Promise(r=>setTimeout(r,800))');report.openCloseResources.push(await evaluate(`({...__renderer.three.info.memory,chunks:__engine.map.traders.chunks.size,built:__renderer.tradersStream.groups.size,jobs:__renderer.tradersStream.jobs.size})`));checkpoint(report)
 }
 const mem=report.openCloseResources;assert(mem[2].geometries===mem[1].geometries&&mem[2].textures===mem[1].textures,'12 ATM open/close cycles keep GPU resource counts stable')
 report.samples=await evaluate(`(async()=>{const q=(a,k)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*k)],rounds=[];for(let j=0;j<5;j++){const a=[];let last=performance.now();for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const t=performance.now();a.push(t-last);last=t}rounds.push({medianMs:q(a,.5),p95Ms:q(a,.95),calls:__renderer.three.info.render.calls,triangles:__renderer.three.info.render.triangles,memory:{...__renderer.three.info.memory}})}return rounds})()`)
 report.gpu=await evaluate(`(()=>{const gl=__renderer.three.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unavailable'})()`)
 await shot('14-bank-final-scene')

 // New game and legacy optional-field behavior must not leak the prior account.
 assert(await evaluate(`(()=>{__engine.newRun(808080,'normal','slot2',true);return __engine.bntgBank.balance===0 && !__engine.bntgBank.history.length})()`),'new game starts with no previous account balance')
 return report
}
