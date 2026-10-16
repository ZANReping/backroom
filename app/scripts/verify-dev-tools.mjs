// Scripted production HUD, renderer and physics verification in an owned headless browser.
import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const followup=process.argv.includes('--followup'), uiOnly=process.argv.includes('--ui-only'), flightOnly=process.argv.includes('--flight-only')
const label='dev-tools', app=fileURLToPath(new URL('../',import.meta.url)), out=path.join(app,'reports/dev-forms-flight',uiOnly?'mobile':flightOnly?'flight':''),run=`qa-dev-tools-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Chrome missing')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={run,label,port,cdp,profile,views:[]}
const server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-30000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-30000))
async function waitFor(fn,label,limit=120000){const t=Date.now();for(;;){try{const v=await fn();if(v)return v}catch{}if(Date.now()-t>limit)throw Error('Timeout: '+label);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},method==='Browser.close'?3000:120000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))}
try{
  console.log(`${run}: server ${port}, headless CDP ${cdp}`)
  await waitFor(async()=>(await fetch(base)).ok,'Vite',30000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-30000))
  const page=await waitFor(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'Chrome')
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  result.command=(await send('Browser.getBrowserCommandLine')).arguments
  if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`))throw Error('Headless/ownership mismatch')
  result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l0-remake.html?level=104&mode=realistic`})
  await waitFor(()=>evaluate('!!window.qa?.ready'),'game')
  await evaluate('qa.hide();qa.r.resize(1920,1080,1);qa.warm()')
  result.followup=followup
  const manifest=await evaluate("import('/verifier/dev-tools.tsx').then(m=>{window.devQA=m;return m.mount(qa)})")
  if(!uiOnly){
  result.variants=[]
  for(const f of manifest.forms.filter(f=>!flightOnly&&(!followup||f.type==='deathmoth'||f.id==='corpserat-ceiling'))){
    const row=await evaluate(`devQA.summon(qa,${JSON.stringify(f.type)},${JSON.stringify(f.id)})`)
    result.variants.push(row);await capture(f.id)
    console.log('verified '+f.type+' / '+f.id)
  }
  result.flight=await evaluate('devQA.flightChecks(qa)');await capture('flight-collision')
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='世界').click()")
  await waitFor(()=>evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='飞行')"),'world tab')
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='飞行').click();document.activeElement.blur();qa.setFrozen(false);qa.eng.dev.frozenAI=true;qa.eng.dev.god=true")
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32})
  await sleep(1100)
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32})
  const raised=await evaluate('qa.eng.player.z');await sleep(400)
  const hovered=await evaluate('qa.eng.player.z')
  if(!(raised>.5&&Math.abs(raised-hovered)<.001))throw Error('Keyboard flight/hover failed')
  await capture('world-flight-active')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17})
  await sleep(800)
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17})
  const lowered=await evaluate('qa.eng.player.z');if(!(lowered<raised-.3))throw Error('Keyboard descent failed')
  result.keyboard={raised,hovered,lowered}
  await evaluate('qa.setFrozen(true);qa.eng.devSetFlight(false);qa.eng.map.entities=[];qa.warm()')
  if(!flightOnly){
  result.resources=[]
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='召唤').click();window.recyclePool=[]")
  // Rebuild the same appearances without changing entity IDs: shared cloth/face caches
  // intentionally retain each newly encountered style, so new randomized humans are not a leak test.
  for(const f of [{type:'wretch',id:'wretch-smart'},{type:'hound',id:'hound-neutral'},{type:'skinstealer',id:'skinstealer-skinned'},{type:'duller',id:undefined}]){
    await evaluate(`devQA.summon(qa,${JSON.stringify(f.type)},${JSON.stringify(f.id)})`)
    await evaluate('recyclePool.push(qa.eng.map.entities.at(-1))')
  }
  for(let i=0;i<4;i++){
    await evaluate('qa.eng.map.entities=[...recyclePool];qa.warm()');await sleep(200)
    await evaluate('qa.eng.map.entities=[];qa.warm()');await sleep(200)
    result.resources.push(await evaluate('({...qa.r.three.info.memory})'))
  }
  if(!result.resources.slice(1).every(v=>v.geometries===result.resources[1].geometries&&v.textures===result.resources[1].textures))throw Error('Entity resource counts did not stabilize')
  }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await evaluate('qa.r.resize(390,844,1);devQA.mount(qa,true,true)')
  await evaluate("document.querySelector('[aria-label=展开开发者面板]').click()")
  await sleep(300);await capture('mobile-spawn')
  result.mobile=await evaluate("({viewport:[innerWidth,innerHeight],overflow:[...document.querySelectorAll('[data-entity]')].some(e=>e.scrollWidth>e.clientWidth+1),cards:document.querySelectorAll('[data-entity]').length})")
  if(result.mobile.viewport[0]!==390||result.mobile.overflow)throw Error('Mobile entity card overflow')
  await evaluate('qa.eng.devSetFlight(true)');await sleep(200)
  await evaluate(`document.querySelector('[aria-label="下降（按住）"]').dispatchEvent(new TouchEvent('touchstart',{bubbles:true,changedTouches:[],touches:[]}))`)
  const touchDown=await evaluate('qa.eng.input.crouch')
  await evaluate(`document.querySelector('[aria-label="下降（按住）"]').dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,changedTouches:[],touches:[]}))`)
  result.touch={held:touchDown,released:await evaluate('!qa.eng.input.crouch')}
  if(!result.touch.held||!result.touch.released)throw Error('Touch descent hold/cancel failed')
  if(errors.length)throw Error(`${errors.length} runtime/console errors`)
  result.ok=true
}catch(e){result.ok=false;result.failure=String(e);console.error(e);process.exitCode=1;try{await capture('failure')}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser?.exitCode===null)browser.kill();if(server.exitCode===null)server.kill();await sleep(800)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server.signalCode}
  try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}
  result.cleanup.profileRemoved=!existsSync(profile);result.errors=errors;result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
  console.log(JSON.stringify({ok:result.ok,failure:result.failure,cleanup:result.cleanup,output:out}))
}
