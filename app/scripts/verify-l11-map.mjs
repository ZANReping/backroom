// Owns every server/browser/profile it creates. Uses the production HUD and inventory.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-map'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.L11_CHROME,path.join(process.env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Set L11_CHROME to Chrome/Edge executable')
const server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={run,port,cdp,profile,seed:20261006}
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-20000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-20000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(f,label,limit=120000){const t=Date.now();for(;;){try{const v=await f();if(v)return v}catch{}if(Date.now()-t>limit)throw Error(`Timeout: ${label}`);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,`${name}.png`),Buffer.from(r.data,'base64'))}
const assert=(condition,message)=>{if(!condition)throw Error(message)}
const click=async(selector)=>{const p=await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control');el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});await sleep(300)}
const mode=async(kind,selector='[data-l11-map-canvas]')=>waitFor(()=>evaluate(`(()=>{const c=document.querySelector('${selector}');return c?.dataset.mode===${JSON.stringify(kind)}&&(${JSON.stringify(kind)}!=='interior'||c.dataset.building===qa.mapUI.context().id)})()`),kind+' map',25000)
try{
  console.log(`L11 map QA: owned Vite ${port}, headless CDP ${cdp}`)
  await waitFor(async()=>(await fetch(base)).ok,'Vite',20000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-20000))
  const pages=await waitFor(async()=>{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();return p.length?p:null},'Chrome')
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  const command=await send('Browser.getBrowserCommandLine');assert(command.arguments.includes('--headless=new')&&command.arguments.includes(`--user-data-dir=${profile}`),'Browser ownership/headless');result.command=command.arguments;result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l11-map.html?level=11&mode=realistic`})
  await waitFor(()=>evaluate('window.qa?.ready'),'game ready')
  await evaluate("qa.hide();qa.r.setDetailDistance(.55);qa.r.setSceneLightLimit(8);qa.r.setLightShadows(0);qa.r.setShadows(false);qa.r.setBloomFx(false);qa.eng.dev.frozenAI=true;qa.eng.player.flashlight=false;qa.look.yaw=-2.55;qa.freezeRenderTime(10)")
  await evaluate("import('/verifier/l11-map.tsx').then(m=>m.attachL11MapUI(qa))")
  await mode('city','[data-l11-minimap]');await evaluate('qa.warm()');result.render=await evaluate('qa.stats()')
  console.log('L11 map QA: production minimap / explored exterior')
  await evaluate('qa.eng.computeVisibility()');await sleep(350);await capture('01-minimap-city')
  await evaluate('qa.mapUI.open()');await mode('city');await capture('02-city-explored')
  result.sharedClients=await evaluate('qa.mapUI.state().clients');assert(result.sharedClients===2,'HUD and full map must share two retained clients')
  result.explored=await evaluate('({pixels:qa.eng.explored.reduce((a,b)=>a+Number(b>0),0),canvas:document.querySelector("[data-l11-map-canvas]").dataset,legend:document.querySelector("[aria-label=地图图例]").textContent})')
  result.cityPaint=await evaluate('qa.mapUI.benchmark()')
  console.log('L11 map QA: real collision doorway transitions')
  result.doorway=await evaluate('qa.mapUI.doorway()');await mode('city')
  console.log('L11 map QA: indoor floor plan and manual/automatic floors')
  result.interior=await evaluate('qa.mapUI.enter()');await mode('interior')
  assert(await evaluate('Number(document.querySelector("[data-l11-map-canvas]").dataset.rooms)>0'),'Room plan missing');await capture('03-interior-1f')
  await click('[aria-label="查看 2 楼地图"]');assert(await evaluate('document.querySelector("[data-l11-map-canvas]").dataset.floor==="1"&&qa.eng.player.floor===0'),'Floor browsing changed player floor');await capture('04-interior-browse-2f')
  await click('.l11-map-floors button:first-child');result.upper=await evaluate('qa.mapUI.upper()');await waitFor(()=>evaluate('document.querySelector("[data-l11-map-canvas]")?.dataset.floor==="1"'),'automatic upper floor');await capture('05-interior-auto-2f')
  result.rotated=await evaluate('qa.mapUI.enter(true)');await mode('interior');await capture('06-rotated-interior');result.interiorPaint=await evaluate('qa.mapUI.benchmark()')
  await evaluate('qa.mapUI.close()');await mode('interior','[data-l11-minimap]');assert(await evaluate('qa.mapUI.state().clients===1'),'Closing inventory must retain the HUD map');await evaluate('qa.warm()');await capture('06b-minimap-interior');await evaluate('qa.mapUI.open()');await mode('interior')
  await click('.l11-map-buttons button[aria-pressed]');await mode('city');await click('.l11-map-buttons button[aria-pressed]');await mode('interior')
  // Exercise pointer pan, keyboard reset and anchored wheel zoom through browser events.
  result.viewBefore=await evaluate('JSON.parse(document.querySelector("[data-l11-map-canvas]").dataset.view)')
  const rect=await evaluate('(()=>{const r=document.querySelector("[data-l11-map-canvas]").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:rect.x+70,y:rect.y+40});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:rect.x+70,y:rect.y+40});await sleep(250)
  result.viewPanned=await evaluate('JSON.parse(document.querySelector("[data-l11-map-canvas]").dataset.view)');assert(Math.abs(result.viewPanned.x-result.viewBefore.x)>1,'Pointer pan had no effect')
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:rect.x,y:rect.y,deltaX:0,deltaY:-200});await sleep(300);await capture('07-pan-zoom')
  result.viewZoomed=await evaluate('JSON.parse(document.querySelector("[data-l11-map-canvas]").dataset.view)');assert(result.viewZoomed.scale>result.viewPanned.scale,'Wheel zoom had no effect')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home',windowsVirtualKeyCode:36});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Home',code:'Home',windowsVirtualKeyCode:36})
  await sleep(250);result.viewReset=await evaluate('JSON.parse(document.querySelector("[data-l11-map-canvas]").dataset.view)');assert(Math.abs(result.viewReset.x-result.viewBefore.x)<.01&&Math.abs(result.viewReset.scale-result.viewBefore.scale)<.01,'Keyboard follow reset failed')
  console.log('L11 map QA: canal overview, underground and historical Worker')
  await evaluate('qa.mapUI.pose(700,300);qa.eng.devEnabled=true');await mode('city');await click('.l11-map-dev input');await sleep(1000)
  await click('button[aria-label="缩小地图"]');await click('button[aria-label="缩小地图"]');await click('button[aria-label="缩小地图"]');await sleep(1000)
  await capture('08-canal-city-overview');await click('.l11-map-district-legend summary');result.districts=await evaluate('({open:document.querySelector(".l11-map-district-legend").open,entries:document.querySelectorAll(".l11-map-district-legend .l11-map-key").length})');assert(result.districts.open&&result.districts.entries===7,'District legend missing');await capture('08b-district-legend');await click('.l11-map-district-legend summary');result.worker=await evaluate('qa.mapUI.worker()')
  await evaluate('qa.mapUI.pose(16,133,-1,-5);qa.eng.explored.fill(1)');await mode('metro');await capture('09-metro-b1')
  await evaluate('qa.mapUI.pose(26.5,26.5);qa.eng.devEnabled=false');await mode('city')
  await sleep(250);result.returnToCity=await evaluate('JSON.parse(document.querySelector("[data-l11-map-canvas]").dataset.view)');assert(Math.abs(result.returnToCity.x-26.5)<.01&&Math.abs(result.returnToCity.y-26.5)<.01,'Old pan returned after leaving underground')
  console.log('L11 map QA: phone portrait, landscape and retina')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await sleep(650);await capture('10-mobile-portrait')
  result.mobile=await evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth,canvas:[document.querySelector("[data-l11-map-canvas]").width,document.querySelector("[data-l11-map-canvas]").clientWidth],overflow:[...document.querySelectorAll(".l11-map-panel,.l11-map-legend")].map(e=>e.scrollWidth>e.clientWidth+1)})')
  assert(result.mobile.width===390&&result.mobile.scroll<=result.mobile.width&&result.mobile.overflow.every(v=>!v),'Mobile viewport incorrect or map overflows')
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1})
  const touch=await evaluate('(()=>{const c=document.querySelector("[data-l11-map-canvas]"),r=c.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,view:JSON.parse(c.dataset.view)}})()')
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch.x,y:touch.y}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x+45,y:touch.y-25}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250)
  result.touch=await evaluate('JSON.parse(document.querySelector("[data-l11-map-canvas]").dataset.view)');assert(Math.abs(result.touch.x-touch.view.x)>1,'Touch pan had no effect');await click('.l11-map-buttons button:nth-child(3)')
  await evaluate('qa.mapUI.enter(true)');await mode('interior');await capture('10b-mobile-interior');await evaluate('qa.mapUI.pose(26.5,26.5)');await mode('city')
  await send('Emulation.setTouchEmulationEnabled',{enabled:false})
  await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await evaluate('qa.mapUI.close()');await sleep(500)
  await click('button[aria-label="展开地图"]');await mode('city');await capture('11-mobile-expanded')
  result.closeButton=await evaluate('(()=>{const r=document.querySelector("button[aria-label=关闭地图]").getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom}})()');assert(result.closeButton.y>=0&&result.closeButton.right<=844&&result.closeButton.bottom<=390,'Expanded map close control outside viewport')
  await click('button[aria-label="关闭地图"]');await mode('city','[data-l11-minimap]');await capture('12-mobile-mini')
  console.log('L11 map QA: lifecycle cleanup and existing level map route')
  result.beforeDispose=await evaluate('qa.mapUI.state()');await evaluate('qa.mapUI.unmount()');await sleep(300);result.afterDispose=await evaluate('qa.mapUI.state()');assert(result.afterDispose.clients===0&&!result.afterDispose.worker&&result.afterDispose.pending===0&&result.afterDispose.cached===0,'Map Worker/cache leaked')
  await evaluate('qa.scene(0)');await evaluate("import('/verifier/l11-map.tsx').then(m=>m.attachL11MapUI(qa))");await sleep(500);result.legacy=await evaluate('({minimap:!!document.querySelector("[data-minimap]"),l11:!!document.querySelector("[data-l11-minimap]")})');assert(result.legacy.minimap&&!result.legacy.l11,'Non-L11 minimap route regressed')
  result.errors=errors;assert(!errors.length,`${errors.length} runtime errors`);result.ok=true
  console.log('L11 map QA passed')
}catch(error){result.ok=false;result.failure=String(error);result.errors=errors;console.error(error);process.exitCode=1;try{if(ws?.readyState===WebSocket.OPEN)await capture('failure')}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser&&browser.exitCode===null)browser.kill();if(server.exitCode===null)server.kill()
  await sleep(800)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server.signalCode}
  try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}
  result.cleanup.profileRemoved=!existsSync(profile)
  result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
}
