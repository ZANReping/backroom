import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'

const args=process.argv.slice(2)
const baseline=args.includes('--baseline')
const classic=args.includes('--classic')
const skipRuntime=args.includes('--skip-runtime')
const casesArg=args.find(v=>v.startsWith('--cases='))?.slice('--cases='.length)
const requestedCases=casesArg===undefined?null:casesArg.split(',').map(v=>v.trim()).filter(Boolean)
const labelArg=args.find(v=>v.startsWith('--label='))?.slice('--label='.length) ?? ''
if(labelArg&&!/^[a-z0-9-]+$/.test(labelArg))throw Error('--label must match /^[a-z0-9-]+$/')
const app=fileURLToPath(new URL('../',import.meta.url))
const mode=classic?'classic':'realistic'
const out=path.join(app,'reports','smiler-trees',`${baseline?'before':'after'}-${mode}${labelArg?`-${labelArg}`:''}`)
mkdirSync(out,{recursive:true})
const run=`qa-smiler-trees-${Date.now()}-${process.pid}`
const profile=path.join(out,run);mkdirSync(profile,{recursive:true})
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const wait=async(fn,label,limit=120000)=>{const start=Date.now();for(;;){try{const value=await fn();if(value)return value}catch{}if(Date.now()-start>limit)throw Error(`Timeout: ${label}`);await sleep(200)}}

const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`
const chrome=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(v=>v&&existsSync(v))
if(!chrome)throw Error('Chrome missing')
let browser,server,ws,seq=0,serverLog='',browserLog=''
const pending=new Map(),errors=[],networkErrors=[]
const result={run,baseline,classic,skipRuntime,label:labelArg||null,requestedCases,mode,port,cdp,profile,cases:[],views:[],runtime:null}
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout ${method}`))},method==='Browser.close'?3000:240000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const capture=async name=>{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(path.join(out,`${name}.png`),Buffer.from(shot.data,'base64'))}

try{
  server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
  server.on('error',e=>serverLog+=String(e));server.stdout.on('data',d=>serverLog=(serverLog+d).slice(-30000));server.stderr.on('data',d=>serverLog=(serverLog+d).slice(-30000))
  await wait(async()=>(await fetch(base)).ok,'Vite',30000)
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  browser.on('error',e=>browserLog+=String(e));browser.stderr.on('data',d=>browserLog=(browserLog+d).slice(-30000))
  const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'Chrome',30000)
  ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}))
  ws.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown'||message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params);if(message.method==='Network.loadingFailed'||message.method==='Network.responseReceived'&&message.params.response.status>=400)networkErrors.push(message.params);if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='log'){const text=message.params.args?.map(a=>a.value??a.description??'').join(' ');if(text?.startsWith('SMILER_TREES_QA'))console.log(text)}const p=pending.get(message.id);if(p){pending.delete(message.id);message.error?p.reject(message.error):p.resolve(message.result)}})
  result.command=(await send('Browser.getBrowserCommandLine')).arguments
  if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`))throw Error('Chrome ownership mismatch')
  result.browser=await send('Browser.getVersion');result.pids={server:server.pid,browser:browser.pid}
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"(()=>{const add=()=>{const l=document.createElement('link');l.rel='icon';l.href='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';(document.head||document.documentElement).appendChild(l)};if(document.head)add();else document.addEventListener('DOMContentLoaded',add,{once:true})})()"})
  await send('Page.navigate',{url:`${base}/verifier/l0-remake.html?level=3&mode=${mode}${baseline?'&baseline=smiler-trees':''}`})
  await wait(()=>evaluate('!!window.qa?.ready'),'game')
  await evaluate('qa.hide();qa.r.resize(1920,1080,1);qa.warm()')
  const helper=await evaluate("import('/verifier/smiler-trees.ts').then(async m=>{window.smilerTreesQA=m;return m.setup(qa)})")
  const available=Array.isArray(helper)?helper:[]
  if(requestedCases){const unknown=requestedCases.filter(id=>!available.includes(id));if(unknown.length)throw Error(`Unknown smiler-trees case(s): ${unknown.join(', ')}`)}
  const ids=requestedCases?requestedCases.slice():available
  result.cases=ids
  await evaluate("document.getElementById('dev-tools-qa-hud')?.style.setProperty('display','none')")
  for(const id of ids){
    console.log(`SMILER_TREES_QA view:start ${id}`)
    const view=await evaluate(`smilerTreesQA.view(qa,${JSON.stringify(id)})`)
    result.views.push({id,view})
    await capture(`case-${String(id).replace(/[^a-z0-9_-]+/gi,'_')}`)
    if(id==='l9-street'&&args.includes('--profile-trees'))result.treeProfile=await evaluate('smilerTreesQA.profileTrees(qa)')
    console.log(`SMILER_TREES_QA view:done ${id}`)
  }
  if(!baseline&&!skipRuntime){console.log('SMILER_TREES_QA runtime:start');result.runtime=await evaluate('smilerTreesQA.runtime(qa)');console.log('SMILER_TREES_QA runtime:done')}
  result.gpu=await evaluate("(()=>{const g=qa.r.three.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return g.getParameter(e?e.UNMASKED_RENDERER_WEBGL:g.RENDERER)})()")
  result.ok=errors.length===0&&networkErrors.length===0&&result.views.length===ids.length&&(baseline||skipRuntime||result.runtime!=null)
  if(!result.ok)process.exitCode=1
}catch(error){
  result.ok=false;result.failure=String(error);process.exitCode=1;console.error(error)
  try{result.failureState=await evaluate(`(()=>{const q=window.qa,e=q?.eng,r=q?.r;return {level:e?.player?.level,player:e?.player&&{x:e.player.x,y:e.player.y,z:e.player.z},pendingWork:typeof q?.pendingWork==='function'?q.pendingWork():null,memory:r?.three?.info.memory,time:r?.time}})()`);try{await capture('failure')}catch(captureError){result.failureStateCaptureError=String(captureError)}}catch(stateError){result.failureStateError=String(stateError)}
}finally{
  if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
  if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
  if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
  result.cleanup={browserExit:browser?.exitCode??browser?.signalCode,serverExit:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)}
  result.errors=errors;result.networkErrors=networkErrors
  writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),serverLog);writeFileSync(path.join(out,'browser.log'),browserLog)
  console.log(JSON.stringify({ok:result.ok,output:out}))
}
