import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'

const app=fileURLToPath(new URL('../',import.meta.url))
const args=new Set(process.argv.slice(2))
const baseline=args.has('--baseline')
const mode=args.has('--classic')?'classic':'realistic'
const label=baseline?(mode==='classic'?'before-classic':'before-realistic'):(mode==='classic'?'runtime-classic':'runtime-realistic')
const out=path.join(app,'reports/shrimp-v81',label)
mkdirSync(out,{recursive:true})
const profile=path.join(out,`qa-shrimp-${Date.now()}-${process.pid}`);mkdirSync(profile)
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const wait=async(fn,name)=>{for(let i=0;i<600;i++){try{const v=await fn();if(v)return v}catch{}await sleep(200)}throw Error('Timeout '+name)}
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`
const result={label,mode,baseline,port,cdp,poses:[],checks:null,memory:null,errors:[],failedRequests:[]}
let server,browser,ws,seq=0,log='';const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const shot=async name=>writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
try{
 server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
 server.stdout.on('data',d=>log=(log+d).slice(-20000));server.stderr.on('data',d=>log=(log+d).slice(-20000))
 await wait(async()=>(await fetch(base)).ok,'server')
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser')
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')result.errors.push(r.params);if(r.method==='Network.responseReceived'&&r.params.response.status>=400)result.failedRequests.push(r.params.response);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
 result.command=(await send('Browser.getBrowserCommandLine')).arguments
 if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`)||!result.command.includes(`--remote-debugging-port=${cdp}`))throw Error('Ownership mismatch')
 result.pids={server:server.pid,browser:browser.pid};await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 const query=`/verifier/l0-remake.html?level=104&mode=${mode}${baseline?'&baseline=shrimp-v81':''}`
 await send('Page.navigate',{url:base+query});await wait(()=>ev('!!window.qa?.ready'),'qa.ready')
 await ev('qa.hide();qa.r.resize(1920,1080,1);qa.warm()')
 result.mount=await ev(`import('/verifier/shrimp-import.ts').then(async m=>{window.shrimpQA=m;return m.mount(qa,${baseline})})`)
 const poses=baseline?['crawl','items']:['crawl','swim','rest','startle','split','held','items','handheld']
 for(const pose of poses){result.poses.push(await ev(`window.shrimpQA.view(qa,${JSON.stringify(pose)})`));await shot(pose)}
 if(!baseline){result.checks=await ev('window.shrimpQA.mechanisms(qa)');result.memory=result.checks?.memory??null}
 result.benchmark=await ev('window.shrimpQA.benchmark(qa)')
 result.gpu=await ev("(()=>{const gl=qa.r.three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)})()")
 result.stats=await ev('qa.stats?.()??null')
 result.ok=result.errors.length===0&&result.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')).length===0&&(baseline||result.checks?.checks?.length>0)
}catch(e){result.ok=false;result.failure=String(e);console.error(e);try{await shot('failure')}catch{}process.exitCode=1}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
 if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)}
 writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}
