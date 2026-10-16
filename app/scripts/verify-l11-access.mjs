// Owns every server/browser/profile it creates. Exercises the production engine and renderer.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const bankOnly=process.argv.includes('--bank-only')
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-access-fixes',bankOnly?'runtime-props':'runtime-final'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
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
  console.log(`L11 access QA: owned Vite ${port}, headless CDP ${cdp}`)
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
  await evaluate("import('/verifier/l11-waterways.ts').then(m=>m.attachWaterways(qa))")
  await evaluate("import('/verifier/l11-map.tsx').then(m=>m.attachL11MapUI(qa));import('/verifier/l11-access.ts').then(m=>m.attachAccess(qa))")
  await waitFor(()=>evaluate('!!qa.mapUI&&!!qa.access'),'QA tools')
  if(bankOnly){
    await evaluate('qa.mapUI.unmount()')
    result.left=await evaluate('qa.access.ladder(-1)');await capture('05-ladder-left')
    result.right=await evaluate('qa.access.ladder(1)');await capture('06-ladder-right')
    result.drain=await evaluate('qa.access.drain()');await capture('07-sewer-outlet')
  }else{
  await evaluate('qa.eng.devEnabled=true;qa.eng.explored.fill(0);qa.eng.map.inf.explored.clear();qa.eng.dev.mapReveal=false;qa.mapUI.open()')
  await waitFor(()=>evaluate("!!document.querySelector('[data-l11-map-canvas]')"),'Map panel')
  await sleep(700)
  const mapState=()=>evaluate(`(()=>{const c=document.querySelector('[data-l11-map-canvas]'),p=c.parentElement,r=p.getBoundingClientRect(),a=c.getBoundingClientRect();const hash=n=>{if(!n)return null;const p=n.getContext('2d').getImageData(0,0,n.width,n.height).data;let h=2166136261;for(let i=0;i<p.length;i+=13)h=Math.imul(h^p[i],16777619);return h>>>0};return{canvas:[a.width,a.height],host:[r.width,r.height],gap:r.bottom-a.bottom,hash:hash(c),mini:hash(document.querySelector('[data-l11-minimap]')),checked:document.querySelector('.l11-map-dev input')?.checked,explored:qa.eng.explored.reduce((n,v)=>n+v,0),loading:qa.mapUI.state()}})()`)
  const hidden=await mapState();assert(hidden.gap<3,'Blank map area: '+hidden.gap)
  await evaluate('qa.eng.dev.mapReveal=true')
  await waitFor(async()=>{const s=await mapState();return s.checked&&s.hash!==hidden.hash&&s.mini!==hidden.mini},'Console reveal affects both maps',45000)
  const revealed=await mapState();assert(revealed.explored===hidden.explored,'Reveal altered exploration');await capture('01-map-desktop')
  await send('Emulation.setDeviceMetricsOverride',{width:820,height:950,deviceScaleFactor:1,mobile:false});await sleep(800)
  const small=await mapState();assert(small.gap<3,'Narrow map has blank area');await capture('02-map-narrow')
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});await sleep(600)
  await evaluate('qa.eng.dev.mapReveal=false');await sleep(600);const restored=await mapState();assert(!restored.checked&&restored.hash===hidden.hash&&restored.mini===hidden.mini,'Reveal off failed to restore exploration')
  result.map={hidden,revealed,small,restored};await evaluate('qa.mapUI.unmount()')
  console.log('Map passed; testing actual metro descent and retaining walls')
  result.metro=await evaluate('qa.access.metro()');await capture('03-metro-underground')
  result.metroSides=await evaluate('qa.access.metroSides()');await capture('04-metro-closure')
  console.log('Metro passed; climbing both canal banks')
  result.left=await evaluate('qa.access.ladder(-1)');await capture('05-ladder-left')
  result.right=await evaluate('qa.access.ladder(1)');await capture('06-ladder-right')
  result.drain=await evaluate('qa.access.drain()');await capture('07-sewer-outlet')
  console.log('Banks passed; highrise generation and rendered population')
  result.highrise=await evaluate('qa.access.highrise()');await capture('08-highrise');result.highrise.steady=await evaluate('qa.sample(90,1500)')
  console.log('Testing deep dwell reset and ordinary Level 7 transition')
  result.deep=await evaluate('qa.access.deep()');await capture('09-canal-deep')
  result.travel=await evaluate('qa.access.finishDeep()');result.arrival=await evaluate('qa.access.finishTravel()');await capture('10-level7-arrival')
  }
  result.errors=errors;assert(!errors.length,`${errors.length} runtime errors`);result.ok=true
  console.log('L11 access QA passed')
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
