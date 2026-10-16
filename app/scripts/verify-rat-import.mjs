import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const args=process.argv.slice(2),baseline=args.includes('--baseline'),classic=args.includes('--classic')
const rounds=Math.max(1,Math.min(5,Number(args.find(v=>v.startsWith('--rounds='))?.split('=')[1])||1))
const index=args.find(v=>v.startsWith('--round='))?.split('=')[1]
const app=fileURLToPath(new URL('../',import.meta.url)),label=`rat-runtime-${classic?'classic':'realistic'}`
const parentOut=path.join(app,'reports/rat-v80',label)
mkdirSync(parentOut,{recursive:true})
if(!index&&rounds>1){
  const runs=[]
  for(let i=1;i<=rounds;i++){
    const code=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,[fileURLToPath(import.meta.url),...args.filter(a=>!a.startsWith('--rounds=')),`--round=${i}`],{cwd:app,windowsHide:true,stdio:'inherit'});p.on('error',reject);p.on('exit',resolve)})
    runs.push(JSON.parse(readFileSync(path.join(parentOut,`round-${i}/runtime.json`),'utf8')))
    if(code!==0){process.exitCode=1;break}
  }
  writeFileSync(path.join(parentOut,'runtime.json'),JSON.stringify({coldBrowserPerRound:true,runs,ok:runs.length===rounds&&runs.every(r=>r.ok)},null,2))
}else{
const out=index?path.join(parentOut,`round-${index}`):parentOut,run=`qa-rat-runtime-${Date.now()}-${process.pid}`,profile=path.join(out,run)
mkdirSync(profile,{recursive:true})
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(v=>v&&existsSync(v))
if(!chrome)throw Error('Chrome missing')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
let browser,server,ws,seq=0,serverLog='',browserLog=''
const pending=new Map(),errors=[],networkErrors=[],result={run,baseline,classic,port,cdp,profile}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},method==='Browser.close'?3000:240000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
async function wait(fn,label,limit=120000){const start=Date.now();for(;;){try{const value=await fn();if(value)return value}catch{}if(Date.now()-start>limit)throw Error('Timeout: '+label);await sleep(200)}}
try{
  server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
  server.on('error',e=>serverLog+=String(e));server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-30000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-30000))
  await wait(async()=>(await fetch(base)).ok,'Vite',30000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.on('error',e=>browserLog+=String(e));browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-30000))
  const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'Chrome',30000)
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
  ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Network.loadingFailed'||r.method==='Network.responseReceived'&&r.params.response.status>=400)networkErrors.push(r.params);if(r.method==='Runtime.consoleAPICalled'&&r.params.args[0]?.value?.startsWith?.('ENTITY_ENTRY '))console.log(r.params.args[0].value);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  result.command=(await send('Browser.getBrowserCommandLine')).arguments
  if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`))throw Error('Chrome ownership mismatch')
  result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:`${base}/verifier/l0-remake.html?level=104&mode=${classic?'classic':'realistic'}${baseline?'&baseline=rat-v80':''}`})
  await wait(()=>ev('!!window.qa?.ready'),'game')
  await ev('qa.hide();qa.r.resize(1920,1080,1);qa.warm()')
  const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'))}
  result.registry=await ev("import('/verifier/rat-import.ts').then(async m=>{window.ratQA=m;return m.mount(qa)})")
  await capture('summon-rat-variants')
  await ev("document.getElementById('dev-tools-qa-hud').style.display='none'")
  result.views=[]
  for(const kind of ['common','hairless','hotel','capybara','cave']){
    result.views.push(await ev(`ratQA.view(qa,${JSON.stringify(kind)},'side')`));await capture(kind+'-side')
    if(kind==='capybara'||kind==='hairless'){result.views.push(await ev(`ratQA.view(qa,${JSON.stringify(kind)},'front')`));await capture(kind+'-front')}
  }
  result.gears=await ev('ratQA.gears(qa)');await capture('capybara-and-devices')
  result.data=await ev('ratQA.mechanisms(qa)')
  const gl=await ev("(()=>{const g=qa.r.three.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER)})()")
  result.gpu=gl
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,'last-entity.png'),Buffer.from(shot.data,'base64'))
  result.ok=errors.length===0&&result.data.checks.length>20
  if(!result.ok)process.exitCode=1
}catch(e){result.ok=false;result.failure=String(e);process.exitCode=1;console.error(e)}finally{
  if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
  if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill()
  await sleep(500)
  if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)}
  result.errors=errors;result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog);console.log(JSON.stringify({ok:result.ok,output:out}))
}
}
