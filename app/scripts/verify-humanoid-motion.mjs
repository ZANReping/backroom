import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'

const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/humanoid-motion'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})})
const port=await freePort(),cdp=await freePort(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.L11_CHROME,path.join(process.env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Chrome/Edge not found')
const server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
let browser,ws,seq=0,serverLog='',browserLog='';const errors=[],networkErrors=[],pending=new Map(),result={ok:false,run,port,cdp,profile}
server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-18000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-18000))
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
async function waitFor(f,label,limit=120000){const t=Date.now();for(;;){try{const v=await f();if(v)return v}catch{}if(Date.now()-t>limit)throw Error('Timeout: '+label);await sleep(200)}}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'))}
try{
  await waitFor(async()=>(await fetch(base)).ok,'Vite',20000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-18000))
  const pages=await waitFor(async()=>{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();return p.length?p:null},'Chrome')
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Owned browser closed'));pending.clear()})
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  result.command=(await send('Browser.getBrowserCommandLine')).arguments
  if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`))throw Error('Headless ownership validation')
  result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l11-map.html?level=11&mode=realistic`});await waitFor(()=>evaluate('window.qa?.ready'),'game')
  await evaluate("qa.hide();qa.r.setDetailDistance(.55);qa.r.setSceneLightLimit(8);qa.r.setLightShadows(0);qa.r.setShadows(false);qa.r.setBloomFx(false);qa.eng.player.flashlight=false;qa.freezeRenderTime(10)")
  await evaluate("import('/verifier/humanoid-motion.ts').then(m=>m.attachHumanoidMotion(qa))")
  const tripod=async name=>{const data=await evaluate('qa.motion.tripod()');writeFileSync(path.join(out,name+'.png'),Buffer.from(data.split(',')[1],'base64'))}
  result.street=await evaluate('qa.motion.street()');console.log('Natural faceling animation ready')
  result.streetFrames=[]
  for(let i=0;i<8;i++){result.streetFrames.push(await evaluate('qa.motion.walk(.16)'));await capture('faceling-walk-'+i)}
  result.streetStopped=await evaluate('qa.motion.stopped()')
  for(const kind of ['faceling','npc','tool']){
    if(kind==='npc'){result.npc=await evaluate('qa.motion.npc()');console.log('Settlement NPC animation ready');result.npcFrames=[];for(let i=0;i<8;i++){result.npcFrames.push(await evaluate('qa.motion.walk(.16)'));await capture('npc-walk-'+i)}result.npcStopped=await evaluate('qa.motion.stopped()')}
    if(kind==='tool')result.toolNpc=await evaluate('qa.motion.toolNpc()')
    result[kind+'Attack']=[await evaluate('qa.motion.attackStart()')];await tripod(kind+'-attack-0')
    for(const [i,count,hits]of [[1,8,0],[2,7,0],[3,5,1],[4,8,1],[5,10,1]]){result[kind+'Attack'].push(await evaluate('qa.motion.attackStep('+count+','+hits+')'));await tripod(kind+'-attack-'+i)}
    result[kind+'Evade']=await evaluate('qa.motion.evade()');console.log(kind+' attack contact / recovery / evade passed')
  }
  result.stats=await evaluate('qa.stats()');result.errors=errors;result.networkErrors=networkErrors
  if(errors.length)throw Error(errors.length+' console/runtime errors')
  result.ok=true
}catch(error){result.failure=String(error);result.errors=errors;result.networkErrors=networkErrors;process.exitCode=1;console.error(error);try{if(ws?.readyState===WebSocket.OPEN)await capture('failure')}catch{}}
finally{
  if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}
  if(browser&&browser.exitCode===null)browser.kill();if(server.exitCode===null)server.kill();await sleep(900)
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server.exitCode??server?.signalCode}
  try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:300})}catch{}
  result.cleanup.profileRemoved=!existsSync(profile);writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
}
