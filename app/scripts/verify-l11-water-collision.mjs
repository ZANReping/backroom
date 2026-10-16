// Owns every server/browser/profile it creates. Exercises the production engine and renderer.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-water-collision'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
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
  console.log(`L11 water/collision QA: owned Vite ${port}, headless CDP ${cdp}`)
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
  await evaluate("import('/verifier/l11-water-collision.ts').then(m=>m.attachWaterCollision(qa))")
  console.log('Water: actual canal, low/high quality, rain and stable animation')
  result.water=await evaluate('qa.wc.water()');assert(result.water.state.reflection,'Missing high quality reflection');await evaluate('qa.wc.legacy(true)');await sleep(350);await capture('01-water-before');await evaluate('qa.wc.legacy(false)');await sleep(350);await capture('02-water-high');
  await evaluate('qa.freezeRenderTime(13)');await sleep(250);await capture('03-water-motion');result.high=await evaluate('qa.wc.waterState()');result.highPerformance=await evaluate('qa.sample(120,1200)');await evaluate('qa.wc.watchReflection()')
  await evaluate("Object.assign(qa.eng.l11Weather,{kind:'rain',k:1,wetness:1,t:120});qa.freezeRenderTime(14)");await sleep(800);result.rain=await evaluate('qa.wc.waterState()');assert(result.rain.rain===1,'Canal missed L11 rain');await capture('04-water-rain')
  await evaluate("Object.assign(qa.eng.l11Weather,{kind:'calm',k:0,wetness:0,t:120});qa.r.setRealWater(false);qa.freezeRenderTime(10);qa.warm()");result.low=await evaluate('qa.wc.waterState()');result.reflectionDisposal=await evaluate('qa.wc.disposed');assert(!result.low.reflection&&Object.values(result.reflectionDisposal).every(n=>n===1),'Reflection target/material/geometry not disposed');await capture('05-water-low');assert(result.low.materials.every(m=>m.endsWith(':false')),'Low quality water not rebuilt')
  console.log('Collision: generated furniture and vehicles, fast falling, underside jump')
  result.drops=[]
  for(const kind of ['l11_cafe_table','l11_sedan','l11_box_truck']){result.drops.push(await evaluate(`qa.wc.drop(${JSON.stringify(kind)})`));await sleep(200);await capture('drop-'+kind)}
  result.stairs=await evaluate('qa.wc.stairs()');await capture('06-stairs');
  result.canopy=await evaluate('qa.wc.canopy()');await capture('06-canopy-head')
  console.log('Collision: roof meshes, actual slope support and movement cost')
  result.roof=await evaluate('qa.wc.roof()');await capture('07-roof-support');result.render=await evaluate('qa.stats()')
  console.log('Collision: real interior doorway regression')
  result.rooms=await evaluate("import('/verifier/l11-urban.ts').then(m=>m.verifyL11UrbanRooms(qa,4))")
  await evaluate("qa.mode('classic');qa.wc.water()");await capture('08-water-classic');result.classic=await evaluate('qa.wc.waterState()')
  result.errors=errors;assert(!errors.length,`${errors.length} runtime errors`);result.ok=true
  console.log('L11 water/collision QA passed')
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
