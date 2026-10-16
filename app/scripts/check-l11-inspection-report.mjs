import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/l11-reference/inspection-ui'),run=`qa-${Date.now()}-${process.pid}`,profile=path.join(out,run)
const notesPath=path.join(app,'reports/l11-reference/inspection/notes.json'),notes=JSON.parse(readFileSync(notesPath,'utf8'))
if(!Array.isArray(notes.sources)||!notes.sources.length||notes.sources.some(source=>!Array.isArray(source.regions)))throw Error(`Invalid inspection notes sources/regions: ${notesPath}`)
const expectedImageCount=notes.sources.length+notes.sources.reduce((total,source)=>total+source.regions.length,0)
mkdirSync(out,{recursive:true});mkdirSync(profile,{recursive:true})
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p))})})
const cdp=await freePort(),chrome=[process.env.L11_CHROME,path.join(process.env.PROGRAMFILES??'C:/Program Files','Google/Chrome/Application/chrome.exe'),path.join(process.env['PROGRAMFILES(X86)']??'C:/Program Files (x86)','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&existsSync(p))
if(!chrome)throw Error('Set L11_CHROME to Chrome/Edge executable')
let browser,ws,seq=0;const pending=new Map(),errors=[],result={cdp,profile,page:'inspection/index.html'}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},30000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});ws.send(JSON.stringify({id,method,params}))});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const assert=(v,m)=>{if(!v)throw Error(m)}
try{
  browser=spawn(chrome,[`--user-data-dir=${profile}`,`--remote-debugging-port=${cdp}`,'--headless=new','--enable-automation','--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:['ignore','pipe','pipe']})
  const pages=await (async()=>{for(let i=0;i<100;i++){try{const p=await(await fetch(`http://127.0.0.1:${cdp}/json/list`)).json();if(p.length)return p}catch{}await sleep(100)}throw Error('Chrome CDP timeout')})()
  ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown'||(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error'))errors.push(r.params);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
  const command=await send('Browser.getBrowserCommandLine');assert(command.arguments.includes('--headless=new')&&command.arguments.includes(`--user-data-dir=${profile}`),'headless/profile ownership failed');result.command=command.arguments
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url:`file://${path.join(app,'reports/l11-reference/inspection/index.html').replaceAll('\\','/')}`});await sleep(700)
  await evaluate(`(async()=>{const imgs=[...document.querySelectorAll('img:not(#viewer-image)')];for(const i of imgs)i.loading='eager';for(let y=0;y<document.body.scrollHeight;y+=900){scrollTo(0,y);await new Promise(r=>setTimeout(r,40))}scrollTo(0,0);await new Promise(r=>setTimeout(r,500))})()`)
  result.images=await evaluate(`(()=>{const imgs=[...document.querySelectorAll('img:not(#viewer-image)')];return {total:imgs.length,complete:imgs.filter(i=>i.complete&&i.naturalWidth>0).length}})()`);assert(result.images.total===expectedImageCount&&result.images.complete===expectedImageCount,`not all ${expectedImageCount} inspection images loaded`)
  await evaluate("document.querySelector('.image-button').click()");await evaluate(`(async()=>{for(let i=0;i<100;i++){const x=document.querySelector('#viewer-image');if(x.complete&&x.naturalWidth>0)return true;await new Promise(r=>setTimeout(r,50))}throw Error('viewer crop did not load')})()`)
  result.scale100=await evaluate(`(()=>{const i=document.querySelector('#viewer-image');return {width:i.getBoundingClientRect().width,natural:i.naturalWidth}})()`);assert(Math.abs(result.scale100.width-result.scale100.natural)<1,'100% is not natural pixel width')
  await evaluate("document.querySelector('#zoom').value=200;document.querySelector('#zoom').dispatchEvent(new Event('input',{bubbles:true}))")
  result.scale200=await evaluate(`(()=>{const i=document.querySelector('#viewer-image');return {width:i.getBoundingClientRect().width,natural:i.naturalWidth}})()`);assert(Math.abs(result.scale200.width-result.scale200.natural*2)<2,'200% did not double natural width')
  await evaluate("document.querySelector('[data-mode=original]').click()");await evaluate(`(async()=>{for(let i=0;i<100;i++){const x=document.querySelector('#viewer-image');if(x.complete&&x.naturalWidth>0)return true;await new Promise(r=>setTimeout(r,50))}throw Error('viewer original did not load')})()`)
  result.original=await evaluate(`(()=>{const i=document.querySelector('#viewer-image');return {src:i.src,width:i.naturalWidth}})()`);assert(result.original.src.includes('/reference/L11/11iconic.jpg'),'original switch failed')
  result.pan=await evaluate(`(()=>{const p=document.querySelector('.viewer');p.scrollLeft=20;p.scrollTop=20;return {scrollLeft:p.scrollLeft,scrollTop:p.scrollTop}})()`);assert(result.pan.scrollLeft>0||result.pan.scrollTop>0,'viewer scrolling unavailable')
  await send('Page.captureScreenshot',{format:'png'}).then(r=>writeFileSync(path.join(out,'inspection.png'),Buffer.from(r.data,'base64')))
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  result.closed=await evaluate('!document.querySelector("#viewer").open');assert(result.closed,'Escape/close failed');assert(!errors.length,`${errors.length} console errors`);result.ok=true;console.log('L11 inspection report QA passed')
}catch(e){result.ok=false;result.failure=String(e);result.errors=errors;console.error(e);process.exitCode=1}
finally{if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close')}catch{}ws.close()}if(browser&&browser.exitCode===null)browser.kill();await sleep(500);try{if(realpathSync(profile).startsWith(realpathSync(out)+path.sep))rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200})}catch{}result.cleanup={profileRemoved:!existsSync(profile),browserExit:browser?.exitCode??browser?.signalCode};result.errors??=errors;writeFileSync(path.join(out,'runtime.json'),JSON.stringify(result,null,2));writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2))}
