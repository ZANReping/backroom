import {spawn} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const app=fileURLToPath(new URL('../',import.meta.url)),label=process.argv[2]??'after'
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label')
const out=path.join(app,'reports/people-ui',label);mkdirSync(out,{recursive:true})
const profile=path.join(out,`qa-people-${Date.now()}-${process.pid}`);mkdirSync(profile)
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
 await send('Page.navigate',{url:base+'/verifier/ui-import.html'});await wait(()=>ev('!!window.__ui?.ready'),'production UI')
 result.setup=await ev("import('/verifier/people-ui-check.ts').then(m=>m.setupPeopleUI())")
 result.cold=await ev('peopleUI.people()');await shot('people-cold')
 await ev('peopleUI.close()');result.warm=await ev('peopleUI.people()');await shot('people-warm')
 result.scroll=await ev('peopleUI.scrollPeople()');await shot('people-scrolled')
 result.special=await ev('peopleUI.special()');await shot('people-tiny')
 result.cycles=await ev('peopleUI.cycles()')
 result.cancellation=await ev('peopleUI.cleanupChecks()')
 const examples=await ev('peopleUI.examples()');for(const p of examples)writeFileSync(path.join(out,'portrait-'+p.id+'.png'),Buffer.from(p.src.split(',')[1],'base64'))
 result.editor=await ev('peopleUI.editor()');await shot('editor')
 result.editorChecks=await ev('peopleUI.editorChecks()');await shot('editor-head')
 const previewRect=await ev('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return{x:r.x+r.width*.5,y:r.y+r.height*.5}})()')
 const dragBefore=await ev('peopleUI.matrix()')
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:previewRect.x,y:previewRect.y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:previewRect.x,y:previewRect.y,button:'left',clickCount:1})
 for(let i=1;i<=8;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:previewRect.x+i*10,y:previewRect.y,button:'left',buttons:1})
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:previewRect.x+80,y:previewRect.y,button:'left',clickCount:1});await sleep(250)
 const dragAfter=await ev('peopleUI.matrix()');if(dragAfter.every((v,i)=>Math.abs(v-dragBefore[i])<.001))throw Error('Drag did not rotate preview');result.drag={before:dragBefore,after:dragAfter};await shot('editor-dragged')
 await ev('peopleUI.findButton("身体").click()');await sleep(250);await shot('editor-body')
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1})
 await ev('peopleUI.close()');await ev('peopleUI.editor()');await shot('editor-mobile')
 result.mobile=await ev('(()=>{const p=document.querySelector("[role=tabpanel]"),r=p.getBoundingClientRect();return{width:innerWidth,height:innerHeight,panel:r.toJSON(),overflow:document.documentElement.scrollWidth>innerWidth}})()');if(result.mobile.overflow)throw Error('Mobile editor overflows viewport')
 const touch=await ev('(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()'),touchBefore=await ev('peopleUI.matrix()')
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touch,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch.x+40,y:touch.y,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(250)
 result.touch=await ev('peopleUI.matrix()');if(result.touch.every((v,i)=>Math.abs(v-touchBefore[i])<.001))throw Error('Touch drag did not rotate preview');await shot('editor-mobile-dragged')
 await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});await sleep(250);await shot('editor-landscape')
 await send('Emulation.setTouchEmulationEnabled',{enabled:false});await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
 await send('Page.navigate',{url:base+'/verifier/retro-avatar-ui.html'});await wait(()=>ev('window.retroUIReady'),'existing avatar UI regression');result.regression=await ev('window.retroUIResult');if(result.regression.error)throw Error(result.regression.error);await shot('avatar-regression')
 await send('Page.navigate',{url:base+'/'});await wait(()=>ev('[...document.querySelectorAll("button .menu-label")].some(b=>b.textContent?.trim()==="形象编辑")'),'main title')
 await ev('[...document.querySelectorAll("button .menu-label")].find(b=>b.textContent?.trim()==="形象编辑").closest("button").click()');await wait(()=>ev('!!document.querySelector("canvas[data-focus=head]")'),'main editor');await sleep(500);await shot('main-editor')
 result.main=await ev('({titleReady:document.querySelector("canvas[data-title-ready]")?.dataset.titleReady,focus:document.querySelector("canvas[data-focus]")?.dataset.focus,tabs:[...document.querySelectorAll("[role=tab]")].map(t=>t.textContent)})')
 result.ok=result.errors.length===0&&result.failedRequests.filter(r=>!r.url.endsWith('/favicon.ico')).length===0
}catch(e){result.ok=false;result.failure=String(e);console.error(e);process.exitCode=1;try{await shot('failure')}catch{}}
finally{
 if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
 if(browser?.exitCode===null)browser.kill();if(server?.exitCode===null)server.kill();await sleep(500)
 if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(out)+path.sep)){try{rmSync(profile,{recursive:true,force:true,maxRetries:8,retryDelay:300})}catch{}}
 result.cleanup={browser:browser?.exitCode??browser?.signalCode,server:server?.exitCode??server?.signalCode,profileRemoved:!existsSync(profile)}
 writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'server.log'),log);console.log(JSON.stringify({ok:result.ok,out}));if(!result.ok)process.exitCode=1
}

