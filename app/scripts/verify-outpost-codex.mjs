import {spawn,spawnSync} from 'node:child_process'
import {existsSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import path from 'node:path'
import net from 'node:net'
const app=fileURLToPath(new URL('../',import.meta.url)),out=path.join(app,'reports/codex-outpost-levels-20261110'),baseline=process.argv.includes('--before')
if(process.argv.includes('--serve')){
  const port=Number(process.argv[process.argv.indexOf('--serve')+1]),profile=process.argv[process.argv.indexOf('--serve')+2]
  if(!Number.isInteger(port)||!profile)throw Error('Owned port/profile required')
  const {createServer}=await import('vite'),{default:react}=await import('@vitejs/plugin-react')
  const original={name:'outpost-codex-baseline',enforce:'pre',load(id){
    if(baseline&&id.split('?')[0].replaceAll('\\','/').endsWith('/src/components/InventoryOverlay.tsx'))return readFileSync(path.join(out,'InventoryOverlay.before.tsx'),'utf8')
  }}
  const server=await createServer({root:app,configFile:false,base:'./',plugins:[original,react()],resolve:{alias:{'@':path.join(app,'src')}},cacheDir:path.join(profile,'vite'),
    optimizeDeps:{entries:['verifier/entity-codex-app.html']},server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:{ignored:['**/reports/**','**/.cache/**']}}})
  await server.listen();server.printUrls()
}else{
  const label=baseline?'before':'after',dir=path.join(out,label);mkdirSync(dir,{recursive:true})
  const profile=path.join(dir,'qa-'+Date.now()+'-'+process.pid);mkdirSync(profile)
  const free=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port))})})
  const port=await free(),cdp=await free(),base='http://127.0.0.1:'+port,report={label,port,cdp,checks:[],errors:[],console:[],requests:[],scenes:[]}
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))
  let server,browser,ws,serial=0,log='';const pending=new Map()
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method))},120000);pending.set(id,{resolve:x=>{clearTimeout(timer);resolve(x)},reject:x=>{clearTimeout(timer);reject(x)}});ws.send(JSON.stringify({id,method,params}))})
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
  const until=async(fn,label)=>{const start=Date.now();while(Date.now()-start<150000){if(report.errors.length)throw Error('Page exception: '+label);try{const v=await fn();if(v)return v}catch(e){if(report.errors.length)throw e}await sleep(150)}throw Error('Timeout '+label)}
  const ok=(value,label)=>{if(!value)throw Error(label);report.checks.push(label)}
  const shot=async name=>writeFileSync(path.join(dir,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
  const click=async text=>{const literal=JSON.stringify(text);await ev('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+literal+')?.click()');await sleep(100)}
  const cards=()=>ev('[...document.querySelectorAll(".hud-panel.relative.overflow-hidden.p-3")].map(el=>({title:el.querySelector(".font-title")?.textContent.trim(),hint:[...el.querySelectorAll("div")].find(x=>x.textContent.startsWith("尚未发现这处据点"))?.textContent.trim()??null,intro:[...el.querySelectorAll("p")].map(p=>p.textContent)}))')
  const records=async ids=>{await ev('entityCodexApp.memory.set("br_codex",JSON.stringify(Object.fromEntries('+JSON.stringify(ids)+'.map(id=>["outpost_"+id,true]))))');await click('层级');await click('据点')}
  try{
    server=spawn(process.execPath,[fileURLToPath(import.meta.url),'--serve',String(port),profile,...(baseline?['--before']:[])],{cwd:app,windowsHide:true,stdio:['ignore','pipe','pipe']})
    for(const stream of[server.stdout,server.stderr])stream.on('data',data=>log=(log+data).slice(-30000))
    await until(async()=>(await fetch(base)).ok,'server')
    browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--enable-automation','--remote-debugging-port='+cdp,'--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--window-size=1920,1080','about:blank'],{windowsHide:true,stdio:'ignore'})
    const page=await until(async()=>(await(await fetch('http://127.0.0.1:'+cdp+'/json/list')).json()).find(p=>p.type==='page'),'browser')
    ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}))
    ws.addEventListener('message',e=>{const m=JSON.parse(e.data),job=pending.get(m.id);if(job){pending.delete(m.id);m.error?job.reject(Error(JSON.stringify(m.error))):job.resolve(m.result)}
      if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params)
      if(m.method==='Runtime.consoleAPICalled'&&['error','warning'].includes(m.params.type))report.console.push(m.params)
      if(m.method==='Network.responseReceived'&&m.params.response.status>=400)report.requests.push({url:m.params.response.url,status:m.params.response.status})
    })
    report.command=(await send('Browser.getBrowserCommandLine')).arguments
    report.pids={server:server.pid,browser:browser.pid}
    ok(report.command.includes('--headless=new')&&report.command.includes('--user-data-dir='+profile)&&report.command.includes('--remote-debugging-port='+cdp),'owned native headless browser')
    await send('Runtime.enable');await send('Network.enable');await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
    await send('Page.navigate',{url:base+'/verifier/entity-codex-app.html'})
    await until(()=>ev('window.entityCodexApp?.ready===true'),'App ready')
    await until(()=>ev('[...document.querySelectorAll("button")].some(b=>b.textContent.includes("继续游戏"))'),'title')
    await ev('[...document.querySelectorAll("button")].find(b=>b.textContent.includes("继续游戏")).click()')
    await until(()=>ev('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="继续")'),'slot')
    await click('继续')
    await until(()=>ev('entityCodexApp.level===104&&!entityCodexApp.paused&&!document.querySelector(".loading-screen")'),'game')
    const defs=await ev('Promise.all([import("/src/game/content/outposts.ts"),import("/src/game/levels/index.ts")]).then(([a,b])=>Object.values(a.OUTPOSTS).map(o=>({id:o.id,name:o.name,faction:o.faction,parent:o.parent,number:b.levelNo(o.parent),intro:o.intro})))')
    report.definitions=defs
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'g',code:'KeyG',windowsVirtualKeyCode:71,nativeVirtualKeyCode:71})
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'g',code:'KeyG',windowsVirtualKeyCode:71,nativeVirtualKeyCode:71})
    await until(()=>ev('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="据点")'),'actual codex')
    await records([])
    const all=await cards();ok(all.length===defs.length,'all registered outposts are rendered')
    const mismatches=[]
    for(let i=0;i<defs.length;i++){
      const o=defs[i],card=all[i],expected='尚未发现这处据点（在 Level '+o.number+' 寻找定居点地标）'
      ok(card.title==='？？？'&&card.intro.length===0,'locked name and description: '+o.id)
      if(card.hint!==expected)mismatches.push({id:o.id,parent:o.parent,hint:card.hint,expected})
      if(!baseline)ok(card.hint===expected,'correct undiscovered level: '+o.id)
    }
    report.scenes.push({state:'undiscovered',cards:all,mismatches})
    await shot('undiscovered-top')
    await ev('document.querySelector(".wb-body").scrollTop=document.querySelector(".wb-body").scrollHeight');await sleep(150);await shot('undiscovered-bottom')
    if(baseline){
      ok(mismatches.length===defs.filter(o=>o.number!==1).length&&mismatches.length>0,'original hardcoded Level 1 bug reproduced')
      ok(all.every(c=>c.hint==='尚未发现这处据点（在 Level 1 寻找定居点地标）'),'original undiscovered hints all use Level 1')
    }else{
      await records(defs.map(o=>o.id))
      const found=await cards();ok(found.length===defs.length,'discovery does not change the registered card count')
      for(let i=0;i<defs.length;i++)ok(found[i].title===defs[i].name&&found[i].hint===null&&JSON.stringify(found[i].intro)===JSON.stringify(defs[i].intro),'discovered content preserved: '+defs[i].id)
      report.scenes.push({state:'discovered',cards:found});await shot('discovered')
      const selected=['gamma','omega','jerry'];await records(selected)
      const mixed=await cards()
      ok(mixed.every((c,i)=>c.title===(selected.includes(defs[i].id)?defs[i].name:'？？？')),'mixed discovery retains hidden names')
      const factions=[...new Set(defs.map(o=>o.faction))]
      for(const faction of factions){
        await ev('(()=>{const s=[...document.querySelectorAll("select")].find(x=>[...x.options].some(o=>o.textContent==="全部团体"));s.value='+JSON.stringify(faction)+';s.dispatchEvent(new Event("change",{bubbles:true}))})()');await sleep(100)
        const filtered=await cards(),expected=defs.filter(o=>o.faction===faction)
        ok(filtered.length===expected.length&&filtered.every((c,i)=>selected.includes(expected[i].id)?c.title===expected[i].name&&c.hint===null:c.title==='？？？'&&c.hint==='尚未发现这处据点（在 Level '+expected[i].number+' 寻找定居点地标）'),'faction filter keeps correct levels: '+faction)
      }
      await ev('(()=>{const s=document.querySelector(".wb-body select");s.value="all";s.dispatchEvent(new Event("change",{bubbles:true}))})()');await sleep(100)
      await send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true})
      await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5})
      const mobile=await cards();ok(mobile.length===defs.length&&mobile.every((c,i)=>selected.includes(defs[i].id)?c.hint===null:c.hint==='尚未发现这处据点（在 Level '+defs[i].number+' 寻找定居点地标）'),'touch viewport retains correct undiscovered hints')
      await ev('document.querySelector(".wb-body").scrollTop=document.querySelector(".wb-body").scrollHeight');await sleep(150);await shot('touch-bottom')
      report.scenes.push({state:'mixed',cards:mixed})
    }
    ok(report.errors.length===0,'no uncaught page exceptions')
    ok(report.console.every(x=>x.type!=='error'),'no console errors')
    ok(report.requests.every(x=>x.url.endsWith('/favicon.ico')),'no missing game resources')
    report.ok=true
  }catch(error){report.ok=false;report.failure=String(error);console.error(error);process.exitCode=1;try{await shot('failure')}catch{}}
  finally{
    if(ws?.readyState===1){try{await send('Browser.close')}catch{}ws.close()}
    for(const process of[browser,server])if(process?.pid&&process.exitCode===null)spawnSync('taskkill.exe',['/PID',String(process.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})
    await sleep(700)
    if(existsSync(profile)&&realpathSync(profile).startsWith(realpathSync(dir)+path.sep))try{rmSync(profile,{recursive:true,force:true,maxRetries:6,retryDelay:300})}catch{}
    report.cleanup={profileRemoved:!existsSync(profile)}
    writeFileSync(path.join(dir,'result.json'),JSON.stringify(report,null,2));writeFileSync(path.join(dir,'server.log'),log)
    console.log(JSON.stringify({ok:report.ok,checks:report.checks.length,dir}))
    if(!report.ok)process.exitCode=1
  }
}
