// Owns every server/browser/profile it creates. Exercises the production engine and renderer.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const parkOnly=process.argv.includes('--park-only'),summonOnly=process.argv.includes('--summon-only')
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-dev-map-park',parkOnly?'park':summonOnly?'summon':'runtime'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
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
try{
  console.log(`L11 map/dev/park QA: owned Vite ${port}, headless CDP ${cdp}`)
  await waitFor(async()=>(await fetch(base)).ok,'Vite',20000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-20000))
  const pages=await waitFor(async()=>{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();return p.length?p:null},'Chrome')
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Owned QA browser closed'));pending.clear()})
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  const command=await send('Browser.getBrowserCommandLine');assert(command.arguments.includes('--headless=new')&&command.arguments.includes(`--user-data-dir=${profile}`),'Browser ownership/headless');result.command=command.arguments;result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l11-map.html?level=11&mode=realistic`})
  await waitFor(()=>evaluate('window.qa?.ready'),'game ready')
  await evaluate("qa.hide();qa.r.setDetailDistance(.55);qa.r.setSceneLightLimit(8);qa.r.setLightShadows(0);qa.r.setShadows(false);qa.r.setBloomFx(false);qa.eng.dev.frozenAI=true;qa.eng.player.flashlight=false;qa.look.yaw=-2.55;qa.freezeRenderTime(10)")
  await evaluate("import('/verifier/l11-dev-map-park.ts').then(m=>m.attachDevMapPark(qa))")
  if(!parkOnly&&!summonOnly){
  await evaluate("import('/verifier/l11-map.tsx').then(m=>{m.attachL11MapUI(qa);qa.eng.dev.mapReveal=true})")
  await sleep(500);await evaluate('qa.mapUI.open()');await sleep(1500)
  const legend=()=>evaluate(`(()=>{const c=document.querySelector('[data-l11-map-canvas]'),l=document.querySelector('[data-l11-map-symbols]');const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom}};return {canvas:box(c),legend:box(l),keys:[...l.children].map(e=>({text:e.textContent,...box(e)})),mode:c.dataset.mode,overflow:document.documentElement.scrollWidth>innerWidth}})()`)
  result.legend={desktop:await legend()};assert(result.legend.desktop.legend.y>=result.legend.desktop.canvas.b,'legend not below canvas');assert(new Set(result.legend.desktop.keys.map(k=>k.y)).size===1,'desktop symbols not horizontal');await capture('map-desktop')
  await send('Emulation.setDeviceMetricsOverride',{width:820,height:950,deviceScaleFactor:1,mobile:false});await sleep(700)
  result.legend.narrow=await legend();assert(!result.legend.narrow.overflow,'narrow map overflow');assert(result.legend.narrow.legend.y>=result.legend.narrow.canvas.b,'narrow legend not below');await capture('map-narrow')
  await evaluate('qa.mapUI.enter(true)');await sleep(500);result.legend.indoor=await legend();assert(result.legend.indoor.mode==='interior'&&result.legend.indoor.keys.length===4,'indoor symbol filtering');await capture('map-indoor')
  await evaluate('qa.mapUI.pose(16,137,-1,-5)');await sleep(500);result.legend.metro=await legend();assert(result.legend.metro.mode==='metro'&&result.legend.metro.keys.length===4,'metro symbol filtering');await capture('map-metro')
  await evaluate('qa.mapUI.close()');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  result.reject=await evaluate('qa.toolsQA.reject()')
  await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='传送')?.click()`);await sleep(300)
  assert(await evaluate(`document.querySelector('[data-dev-exit-tools]')!==null`),'actual HUD exit tools missing')
  await capture('dev-summon')
  await evaluate(`document.querySelector('[data-exit-mode="teleport"]').click()`);await sleep(100)
  await evaluate(`document.querySelector('[data-exit-kind="l11unfinisheddoor"]').click()`)
  await waitFor(()=>evaluate(`!document.querySelector('[data-exit-kind="l11unfinisheddoor"]').disabled`),'UI nearest teleport',45000)
  result.ui=await evaluate(`({status:document.querySelector('[data-dev-exit-tools] [role="status"]')?.textContent,state:qa.toolsQA.state()})`)
  assert(result.ui.status?.includes('已传送'),'UI teleport failed: '+result.ui.status);await evaluate('qa.warm()');await capture('dev-teleport')
  result.teleports=[];result.summons=[]
  for(const kind of ['l11unfinisheddoor','l11liftshaft','l11brickdoor','l11officedoor','basebeta']){
    console.log('Nearest exit and valid summon: '+kind)
    result.teleports.push(await evaluate(`qa.toolsQA.teleport('${kind}')`));await capture(kind+'-safe-landing')
    result.summons.push(await evaluate(`qa.toolsQA.restore('${kind}')`))
  }
  result.office=await evaluate('qa.toolsQA.office()');await capture('summoned-office')
  result.sign=await evaluate('qa.toolsQA.sign()');await capture('summoned-road-sign')
  await evaluate('qa.mapUI.unmount()')
  }
  if(summonOnly){result.office=await evaluate('qa.toolsQA.office()');await capture('summoned-office');result.sign=await evaluate('qa.toolsQA.sign()');await capture('summoned-road-sign')}
  if(!summonOnly){result.parks=[]
  for(let view=0;view<3;view++){console.log('Park view '+view);result.parks.push(await evaluate(`qa.toolsQA.park(${view})`));await capture('park-'+view)}}
  if(!parkOnly){result.generic=await evaluate('qa.toolsQA.generic()');await capture('generic-exit')}
  result.errors=errors;assert(!errors.length,`${errors.length} runtime errors`);result.ok=true
  console.log('L11 map/dev/park QA passed')
}catch(error){result.ok=false;result.failure=String(error);result.errors=errors;console.error(error);process.exitCode=1;try{if(ws?.readyState===WebSocket.OPEN)await capture('failure')}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser&&browser.exitCode===null)browser.kill();if(server.exitCode===null)server.kill()
  await sleep(800)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server.signalCode}
  try {
    if (realpathSync(profile).startsWith(realpathSync(out)+path.sep)) {
      rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})
    }
  } catch {}
  result.cleanup.profileRemoved=!existsSync(profile)
  result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
}
