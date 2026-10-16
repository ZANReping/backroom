import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const app=fileURLToPath(new URL('../',import.meta.url)),label=process.argv[2]??'after'
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label')
const out=path.join(app,'reports/npc-gear',label);mkdirSync(out,{recursive:true})
const profile=path.join(out,`qa-gear-${Date.now()}-${process.pid}`);mkdirSync(profile)
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<600;i++){try{const v=await fn();if(v)return v}catch{}await sleep(200)}throw Error('Timeout '+label)}
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`,result={label,port,cdp,models:[],errors:[]}
let server,browser,ws,seq=0,log='';const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const shot=async name=>writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
try{
 server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log=(log+d).slice(-20000));server.stderr.on('data',d=>log=(log+d).slice(-20000))
 await wait(async()=>(await fetch(base)).ok,'server')
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser')
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')result.errors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
 result.command=(await send('Browser.getBrowserCommandLine')).arguments
 if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`))throw Error('Ownership mismatch')
 result.pids={server:server.pid,browser:browser.pid};await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 await send('Page.navigate',{url:base+'/verifier/npc-gear.html'});await wait(()=>ev('window.gearReady'),'gallery')
 const ids=await ev('gearQA.ids');for(let i=0;!process.argv.includes('--details-only')&&i<ids.length;i+=8){const batch=ids.slice(i,i+8);result.models.push(...await ev(`gearQA.show(${JSON.stringify(batch)})`));await shot('catalog-'+String(i/8).padStart(2,'0'));console.log('NPC_GEAR catalog '+i+'/'+ids.length)}
 for(const [name,ids,angle,pose,close] of [
  ['hats',['tom','amelia','dorothy','martin'],.25,'idle',true],['medical',['morel','dupont','faust','nightingale'],.3,'idle',true],
  ['hands',['aiko','petra','margot','kowalski'],.55,'walk',false],['back',['joey','lan','tom','aiko'],Math.PI,'walk',false],['seated',['tom','aiko','otis','bluebird'],.7,'seated',false],['performing',['joey','tiny'],.3,'playing',false]]){
  await ev(`gearQA.show(${JSON.stringify(ids)},${angle},${JSON.stringify(pose)},${close})`);await shot(name)
 }
 if(process.argv.includes('--isolate')){await ev(`gearQA.show(['tom','aiko','otis','bluebird'],.7,'seated-isolated')`);await shot('isolated')}
 result.memory=await ev('gearQA.stats()')
 if(label!=='before'&&!process.argv.includes('--gallery-only')){
  await send('Page.navigate',{url:base+'/verifier/l0-remake.html?level=101&mode=realistic'});await wait(()=>ev('!!window.qa?.ready'),'actual game')
  await ev('qa.hide();qa.r.resize(1920,1080,1);qa.warm()');result.game=await ev("import('/verifier/npc-gear-runtime.ts').then(m=>m.checkNpcGearRuntime(qa))")
  for(const mode of ['realistic','classic']){await ev(`gearRuntimeView(${JSON.stringify(mode)})`);await shot('game-'+mode)}
  result.performance=await ev('gearRuntimePerformance()');await shot('game-performing')
 }
 result.ok=result.errors.length===0
}catch(e){result.ok=false;result.failure=String(e);console.error(e);process.exitCode=1;try{await shot('failure')}catch{}}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
 if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)}
 writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}
