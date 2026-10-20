import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const app=fileURLToPath(new URL('../',import.meta.url)),label=process.argv[2]??'after'
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label')
const out=path.join(app,'reports/npc-faces-v6',label);mkdirSync(out,{recursive:true})
const profile=path.join(out,`qa-faces-${Date.now()}-${process.pid}`);mkdirSync(profile)
const free=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<600;i++){try{const v=await fn();if(v)return v}catch{}await sleep(200)}throw Error('Timeout '+label)}
const port=await free(),cdp=await free(),base=`http://127.0.0.1:${port}`,result={label,port,cdp,models:[],errors:[],failedRequests:[]}
let server,browser,ws,seq=0,log='';const pending=new Map()
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},180000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const shot=async name=>writeFileSync(path.join(out,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
try{
 server=spawn(process.execPath,[path.join(app,'scripts/l11-map-server.mjs'),String(port),profile],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>log=(log+d).slice(-20000));server.stderr.on('data',d=>log=(log+d).slice(-20000))
 await wait(async()=>(await fetch(base)).ok,'server')
 browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
 const page=await wait(async()=>(await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json()).find(p=>p.type==='page'),'browser')
 ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')result.errors.push(r.params);if(r.method==='Network.responseReceived'&&r.params.response.status>=400)result.failedRequests.push(r.params.response);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
 result.command=(await send('Browser.getBrowserCommandLine')).arguments
 if(!result.command.includes('--headless=new')||!result.command.includes(`--user-data-dir=${profile}`)||!result.command.includes(`--remote-debugging-port=${cdp}`))throw Error('Ownership mismatch')
 result.pids={server:server.pid,browser:browser.pid};await send('Runtime.enable');await send('Network.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 await send('Page.navigate',{url:base+'/verifier/npc-faces.html'});await wait(()=>ev('window.faceReady'),'gallery')
 const ids=await ev('faceQA.ids');for(let i=0;i<ids.length;i+=8){result.models.push(...await ev(`faceQA.show(${JSON.stringify(ids.slice(i,i+8))})`));await shot('catalog-'+String(i/8).padStart(2,'0'));console.log('NPC_FACES '+i+'/'+ids.length)}
 for(const [name,ids,angle,blink] of [['close',['lan','otis','irene','nightingale'],.22,false],['blink',['lan','otis','irene','nightingale'],.22,true],['accessories',['tom','morel','amelia','faust'],.4,false]]){await ev(`faceQA.show(${JSON.stringify(ids)},${angle},${blink})`);await shot(name)}
 await ev('faceQA.hair()');await shot('hair-colors')
 if(label!=='before'){
  result.checks=await ev('faceQA.checks()');for(const p of result.checks.portraits)writeFileSync(path.join(out,'portrait-'+p.id+'.png'),Buffer.from(p.image.split(',')[1],'base64'));delete result.checks.portraits
 }
 result.memory=await ev('faceQA.stats()')
 await send('Page.navigate',{url:base+'/verifier/l0-remake.html?level=101&mode=realistic'});await wait(()=>ev('!!window.qa?.ready'),'actual game')
 result.game=await ev(`(async()=>{
  qa.hide();qa.r.resize(1920,1080,1);const e=qa.eng,n=e.npcs.find(n=>n.id==='nightingale');if(!n)throw Error('Alpha nightingale missing');e.player.x=n.x;e.player.y=n.y+1.5;e.player.z=0;n.facing=Math.PI/2;qa.look.yaw=0;qa.look.pitch=.02;qa.r.setFov(48);await qa.warm();qa.freezeRenderTime(1.25);
  const rec=qa.r.npcMeshes.get(n.id);let root;rec.grp.traverse(o=>{if(o.userData.retro)root=o});if(!root)throw Error('Production NPC mesh missing');const rig=root.userData.retro,path=rig.mesh.material[1].map.image.src;
  ${label!=='before'?"if(!path.includes('/named/nightingale/'))throw Error('Production renderer did not use named face');":''}
  return {id:n.id,path,gear:root.userData.npcGear,stats:qa.stats()};})()`)
 result.samples=[];for(const mode of ['realistic','classic']){await ev(`qa.mode(${JSON.stringify(mode)});qa.warm()`);await shot('game-'+mode);for(let i=0;i<5;i++)result.samples.push({mode,...await ev('qa.sample(100,1200)')})}
 result.ok=result.errors.length===0&&result.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')).length===0
}catch(e){result.ok=false;result.failure=String(e);console.error(e);process.exitCode=1;try{await shot('failure')}catch{}}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
 if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)}
 writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}
