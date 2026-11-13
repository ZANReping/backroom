import {spawn,spawnSync} from 'node:child_process'
import {mkdirSync,writeFileSync,existsSync,realpathSync,rmSync} from 'node:fs'
import path from 'node:path'
import net from 'node:net'
const root=process.cwd(),mode=process.argv.includes('--classic')?'classic':'realistic',only=process.argv.includes('--pilot')?'pilot':process.argv.includes('--app')?'app':'all',suffix=process.argv.find(a=>a.startsWith('--label='))?.slice(8)??'fixed-'+(process.argv.includes('--before')?'before':'after')+'-'+mode
const dir=path.join(root,'reports/offscreen-20261108',suffix);mkdirSync(dir,{recursive:true})
const profile=path.join(dir,'qa-'+Date.now()+'-'+process.pid);mkdirSync(profile)
const free=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p))})})
const port=await free(),cdp=await free(),base='http://127.0.0.1:'+port
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={mode,only,checks:[],scenes:[],errors:[],console:[],httpErrors:[],port,cdp,profile}
let server,browser,ws,id=0,serverLog='';const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method))},240000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id:n,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
async function until(fn,label,ms=180000){const t=Date.now();while(Date.now()-t<ms){let v;try{v=await fn()}catch(e){if(e.fatal||report.errors.length)throw e}if(v)return v;await sleep(150)}throw Error('Timeout '+label)}
const check=(v,label)=>{if(!v)throw Error(label);report.checks.push(label);console.log(label)}
const shot=async name=>writeFileSync(path.join(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
writeFileSync(path.join(dir,'session.json'),JSON.stringify({port,cdp,profile,owner:process.pid}))
const persist=()=>writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2))
try{
 server=spawn(process.execPath,['scripts/worker-pipeline-server.mjs',String(port),path.join(profile,'vite'),process.argv.includes('--before')?'before':'after'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']})
 for(const stream of[server.stdout,server.stderr])stream.on('data',b=>serverLog=(serverLog+b).slice(-30000))
 await until(async()=>(await fetch(base)).ok,'vite')
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--enable-automation',`--remote-debugging-port=${cdp}`,`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-background-timer-throttling','--disable-renderer-backgrounding','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await until(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'chrome')
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data),job=pending.get(m.id);if(job){pending.delete(m.id);m.error?job.reject(Error(JSON.stringify(m.error))):job.resolve(m.result)}if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params);if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))report.console.push(m.params);if(m.method==='Network.responseReceived'&&m.params.response.status>=400)report.httpErrors.push(m.params.response)})
 report.command=(await send('Browser.getBrowserCommandLine')).arguments
 check(report.command.includes('--headless=new')&&report.command.includes(`--user-data-dir=${profile}`)&&report.command.includes(`--remote-debugging-port=${cdp}`),'owned native headless session')
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 await send('Profiler.enable');await send('Profiler.setSamplingInterval',{interval:1000})
 await send('Page.navigate',{url:base+'/verifier/worker-performance.html?mode='+mode})
 await until(()=>ev('!!window.workerPerf'),'performance scene')
 report.environment=await ev('workerPerf.environment')
 check(!/swiftshader|llvmpipe|software/i.test(report.environment.gpu),'native GPU performance baseline')
 for(const level of[1,5,11]){
  await send('Profiler.start')
  const row=await ev('workerPerf.measure('+level+')')
  const {profile:cpu}=await send('Profiler.stop')
  writeFileSync(path.join(dir,'level-'+level+'.cpuprofile'),JSON.stringify(cpu))
  report.scenes.push(row);persist();await shot('level-'+level)
  console.log(JSON.stringify({level,warmupMs:row.warmupMs,summary:row.summary,workers:row.workers}))
 }
 check(report.errors.length===0,'no uncaught page exceptions')
 report.ok=true
}catch(error){report.ok=false;report.failure=String(error);console.error(error);try{await shot('failure');report.failureState=await ev('({text:document.body.innerText.slice(0,2400),trial:window.renderTrial?{stats:renderTrial.view.stats,error:renderTrial.error}:null})')}catch{}process.exitCode=1}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
 for(const p of[browser,server])if(p?.pid&&p.exitCode===null)spawnSync('taskkill.exe',['/PID',String(p.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
 await sleep(600);if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(dir)+path.sep))try{rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:300})}catch{}
 report.cleanup={profileRemoved:!existsSync(profile)};writeFileSync(path.join(dir,'server.log'),serverLog);persist();console.log(JSON.stringify({ok:report.ok,dir,checks:report.checks.length}));if(!report.ok)process.exitCode=1
}
