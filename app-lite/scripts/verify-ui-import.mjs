// Dedicated headless Chrome with its own profile; never attach to a user's browser.
// UI_IMPORT_URL=http://127.0.0.1:3007 UI_IMPORT_CDP=9238 node scripts/verify-ui-import.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const base=process.env.UI_IMPORT_URL??'http://127.0.0.1:3007',port=process.env.UI_IMPORT_CDP??'9238'
const out=fileURLToPath(new URL('../reports/ui-import/',import.meta.url));mkdirSync(out,{recursive:true})
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page=pages.find(p=>p.type==='page'&&p.url.startsWith(base));if(!page)throw Error('Open the local app in a dedicated QA Chrome first')
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
const finishOnly=process.argv.includes('--finish')
const endsOnly=process.argv.includes('--ends')
const prior=finishOnly||endsOnly?JSON.parse(readFileSync(out+'verification.json','utf8')):{checks:[],layouts:[]}
let next=0,complete=false;const pending=new Map(),errors=[],checks=prior.checks,layouts=prior.layouts
ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)}
async function until(expression){for(let i=0;i<160;i++){if(await ev(expression))return;await wait(250)}throw Error(`Timeout: ${expression}`)}
async function click(selector,text){const p=await ev(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>${text?`e.textContent.includes(${JSON.stringify(text)})`:'true'});if(!e)throw Error('Missing button '+${JSON.stringify(text??selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await wait(180)}
async function shot(name){await wait(300);const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(out+name+'.png',Buffer.from(r.data,'base64'))}
async function size(width,height,mobile=false){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await send('Emulation.setTouchEmulationEnabled',{enabled:mobile});await wait(250)}
async function layout(name,selector){const result=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,viewport:[innerWidth,innerHeight],horizontalOverflow:e.scrollWidth-e.clientWidth}})()`);layouts.push({name,...result});check(result&&result.x>=-1&&result.y>=-1&&result.x+result.width<=result.viewport[0]+1&&result.y+result.height<=result.viewport[1]+1,`${name}: panel fits viewport`)}
try{
 await send('Runtime.enable');await send('Page.enable');await size(1440,900)
 if(!finishOnly&&!endsOnly){
 // Actual app entry: title -> settings -> graphics -> close -> codex.
 await send('Page.navigate',{url:base});await until("!!document.querySelector('.title-col')")
 await shot('app-title-desktop')
 await click('.menu-btn','设置');await layout('app settings','.set-modal');await click('.set-tab','画面')
 await shot('app-settings-desktop');await click('[aria-label="关闭设置"]')
 await click('.menu-btn','图鉴');await layout('app codex','.wb-panel');await shot('app-codex-desktop')
 // Isolated components cover rare states without finishing/killing a player run.
 await send('Page.navigate',{url:base+'/verifier/ui-import.html'});await until('window.__ui?.ready')
 for(const [label,w,h,mobile] of [['desktop',1440,900,false],['portrait',390,844,true],['landscape',844,390,true]]){
  await size(w,h,mobile)
  for(const [screen,selector] of [['title','.title-col'],['settings','.set-modal'],['hud',null],['pause','.pause-panel'],['inventory','.wb-panel'],['dialog','.dlg-panel'],['loot','.loot-panel'],['death','.end-card'],['victory','.end-victory > .relative'],['loading','.hud-panel']]){
   await ev(`window.__ui.show('${screen}')`);await wait(screen==='victory'?5000:screen==='death'?2400:screen==='title'?1600:500)
   if(selector&&screen!=='title')await layout(`${label} ${screen}`,selector)
   await shot(`${label}-${screen}`)
  }
 }
 await size(1440,900);await ev("window.__ui.show('settings')");await wait(250)
 await click('.set-seg-btn','轻松');check(await ev("window.__ui.settings.difficulty==='easy'"),'difficulty click updates state')
 const old=await ev('window.__ui.settings.autoSprint');await click('[role="switch"]');check(await ev(`window.__ui.settings.autoSprint===${!old}`),'switch updates once')
 for(const name of ['画面','音频','操作','主题','API','游戏']){await click('.set-tab',name);check(await ev(`document.querySelector('.set-tab.is-active').textContent.includes('${name}')`),`${name} category activates`)}
 await click('.set-tab','画面');for(const name of ['光影','性能','氛围','基础'])await click('[aria-label="画面设置分类"] button',name)
 check(!(await ev("document.querySelector('.set-content').textContent")).includes('场景灯投影'),'removed scene shadow option stays absent')
 await ev("window.__ui.show('inventory')");await wait(200)
 for(const name of ['图鉴','状态','地图','日志','任务','背包']){await click('.wb-tab',name);await layout(`inventory ${name}`,'.wb-panel')}
 await ev("window.__ui.show('loot')");await wait(200)
 const count=await ev("window.__ui.engine.countItem('almond')");await click('.loot-cell')
 check(await ev(`window.__ui.engine.countItem('almond')===${count+1}&&window.__ui.engine.lootPanel.items.length===3`),'take one updates inventory and container')
 check(await ev("document.querySelector('.loot-kicker').textContent.includes('3 件')"),'loot count rerenders after engine event')
 await click('.loot-take');check(await ev('window.__ui.engine.lootPanel.items.length===0'),'take all drains container');check(await ev("document.body.textContent.includes('已经搜空了')"),'empty loot state renders')
 await click('.loot-leave');check(await ev('window.__ui.engine.lootPanel===null'),'leave closes container')
 }else{
  await send('Page.navigate',{url:base+'/verifier/ui-import.html'});await until('window.__ui?.ready')
 }
 if(!endsOnly){
 await ev("window.__ui.show('pause')");await wait(200);await click('.menu-btn','保存游戏');await shot('desktop-save-picker')
 check(await ev("document.body.textContent.includes('选择写入的存档槽')"),'save picker opens')
 await click('.menu-btn','存档槽 1')
 check(await ev("document.body.textContent.includes('已保存到存档槽 1')&&window.__ui.memory.size>0"),'manual save persists to isolated storage and confirms')
 await ev("window.__ui.show('title')");await wait(1800);await click('.menu-btn','继续游戏');await shot('desktop-continue-picker')
 check(await ev("document.body.textContent.includes('废弃办公室')"),'title continue displays saved level')
 await ev("window.__ui.show('settings')");await wait(200);await click('.set-tab','主题')
 const themes=await ev("import('/src/components/SettingsModal.tsx').then(m=>m.THEMES.map(t=>({id:t.id,name:t.name})))")
 for(const theme of themes){await click('.set-content button',theme.name);check(await ev(`document.documentElement.dataset.theme===${JSON.stringify(theme.id)}`),`theme ${theme.id} activates`);await shot(`theme-${theme.id}`)}
 }
 await ev("document.documentElement.dataset.theme='amber'")
 const endViews=endsOnly?[['narrow',320,568,true],['landscape',844,390,true]]:[['desktop',1440,900,false],['portrait',390,844,true],['narrow',320,568,true],['landscape',844,390,true]]
 for(const [label,w,h,mobile] of endViews){
  await size(w,h,mobile)
  await ev("window.__ui.show('victory')");await wait(5200);await layout(`${label} complete victory stamp`,'.end-stamp');await shot(`${label}-victory`)
  await ev("window.__ui.show('death')");await wait(2600);await layout(`${label} complete death`,'.end-card');await shot(`${label}-death`)
 }
 await ev("window.__ui.show('settings')");await wait(200)
 check(await ev("[...document.querySelectorAll('[role=switch]')].every(e=>e.hasAttribute('aria-checked')&&!e.hasAttribute('aria-pressed'))"),'switch uses a single accessible state')
 check(errors.length===0,'no uncaught browser exceptions')
 complete=true
 console.log(JSON.stringify({passed:checks.length,checks,layouts},null,2))
}finally{writeFileSync(out+'verification.json',JSON.stringify({status:complete?'passed':'incomplete',checks:[...new Set(checks)],layouts:[...new Map(layouts.map(row=>[row.name,row])).values()],errors},null,2)+'\n');ws.close()}
