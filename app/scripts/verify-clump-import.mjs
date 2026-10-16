import {mkdirSync,writeFileSync} from 'node:fs'
const base=process.env.ENTITY_QA_URL??'http://127.0.0.1:3012',port=process.env.ENTITY_QA_CDP??'9243',out='reports/clump-import/'
mkdirSync(out,{recursive:true})
const page=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(p=>p.type==='page'&&p.url.startsWith(base))
if(!page)throw Error('Missing owned QA page')
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let seq=0;const pending=new Map(),errors=[]
ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params);if(r.method==='Log.entryAdded'&&r.params.entry.level==='error')errors.push(r.params.entry);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const save=(n,v)=>writeFileSync(out+n,JSON.stringify(v,null,2)+'\n')
const shot=async n=>writeFileSync(out+n,Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'))
async function navigate(path,ready){await send('Page.navigate',{url:base+path});for(let i=0;i<400;i++){await new Promise(r=>setTimeout(r,300));if(await ev(`location.href===${JSON.stringify(base+path)}&&(${ready})`))return}throw Error('Navigation timeout '+path)}

try {
 await send('Runtime.enable');await send('Log.enable');await send('Page.enable')
 const version=await send('Browser.getVersion'),commandLine=await send('Browser.getBrowserCommandLine')
 if(!version.userAgent.includes('HeadlessChrome')||!commandLine.arguments.includes('--headless=new')||!commandLine.arguments.includes('--remote-debugging-port='+port)||!commandLine.arguments.some(a=>a.replaceAll('\\','/').endsWith('/app/.cache/clump-qa')))throw Error('Wrong QA browser')
 save('browser.json',{version,commandLine})
 if(process.argv[2]==='cleanup')await send('Browser.close')
 else if(process.argv[2]==='probe')console.log(await ev(process.argv[3]))
 else {
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await navigate('/verifier/l0-remake.html?level=104&mode=realistic','!!window.qa?.ready')
  await ev('qa.hide();qa.r.resize(1920,1080,1);qa.warm()')
  save('runtime.json',await ev("import('/verifier/clump-import.ts').then(m=>m.verifyClump(qa))"))
  for(const view of ['normal','fasting','grab','devour','l3-brick','l3-squirt','l3-ceiling','death']){
    save('view-'+view+'.json',await ev('window.clumpView('+JSON.stringify(view)+')'));await shot('game-'+view+'.png')
  }
  await ev('qa.mode("classic");window.clumpView("normal").then(()=>qa.warm())');await shot('game-classic.png')
  save('cycles.json',await ev('window.clumpCycles()'))
  await ev('qa.mode("realistic");window.clumpView("l3-brick").then(()=>qa.warm())')
  const samples=[];for(let i=0;i<5;i++)samples.push(await ev('qa.sample(180)'));save('performance.json',samples)
  save('level-3.json',await ev("import('/verifier/clump-import.ts').then(m=>m.levelThree(qa))"));await shot('game-level-3.png')
  if(errors.filter(e=>!e.url?.endsWith('/favicon.ico')).length)throw Error('Browser errors')
 }
}finally{save((process.argv[2]??'after')+'-errors.json',errors);ws.close()}
