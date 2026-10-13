// Uses a dedicated, already-running Chrome CDP tab. Never connects to a user's normal profile.
// node scripts/verify-six-items.mjs visuals|bench [classic|realistic] [before|after]
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const [action='visuals',mode='classic',version='after']=process.argv.slice(2)
const base=process.env.SIX_ITEM_URL??'http://127.0.0.1:3004',port=process.env.SIX_ITEM_CDP??'9234'
const out=fileURLToPath(new URL('../reports/six-items/',import.meta.url));mkdirSync(out,{recursive:true})
const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page=pages.find(p=>p.type==='page'&&p.url.startsWith(base))
if(!page)throw Error('Open the local verifier in the dedicated CDP browser first')
const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}))
let next=0;const pending=new Map(),errors=[]
ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails);const p=pending.get(r.id);if(p){pending.delete(r.id);r.error?p.reject(r.error):p.resolve(r.result)}})
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value}
const save=(name,data)=>writeFileSync(out+name,JSON.stringify(data,null,2)+'\n')
const shot=async name=>{await evaluate('window.__six.render()');const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(out+name,Buffer.from(r.data,'base64'))}
const open=async extra=>{await send('Page.navigate',{url:`${base}/verifier/six-items.html?mode=${mode}${version==='before'?'&baseline':''}${extra??''}`});await new Promise(r=>setTimeout(r,1200));for(let i=0;i<80;i++){if(await evaluate('!!window.__six?.ready'))return;await new Promise(r=>setTimeout(r,250))}throw Error('Verifier did not become ready')}
try{
  await send('Runtime.enable');await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride',{width:action==='visuals'?1440:960,height:action==='visuals'?1000:640,deviceScaleFactor:1,mobile:false})
  await open('')
  if(action==='visuals'){
    save(`${version}-${mode}-models.json`,await evaluate('window.__six.metrics()'))
    for(const [name,angle]of [['front',0],['back',Math.PI],['side',Math.PI/2]]){await evaluate(`window.__six.setAngle(${angle})`);await shot(`${version}-${mode}-${name}.png`)}
    await evaluate('window.__six.setAngle(.3);window.__six.dark(true)');await shot(`${version}-${mode}-dark.png`)
    await open('&held');await shot(`${version}-${mode}-held.png`)
    save(`${version}-${mode}-lifecycle.json`,await evaluate('window.__six.lifecycle()'))
  }else if(action==='bench'){
    const results=[]
    // Each case warms 60 frames, then records five rounds of 180 frames.
    results.push(await evaluate('window.__six.bench(5,60,180,60)'));console.log(`${version}/${mode}: mixed complete`)
    save(`${version}-${mode}-performance.json`,results)
    for(let type=0;type<6;type++){
      results.push(await evaluate(`window.__six.bench(5,60,180,1,${type})`));console.log(`${version}/${mode}: ${results.at(-1).type} complete`);save(`${version}-${mode}-performance.json`,results)
    }
  }else if(action==='runtime'){
    save('runtime.json',await evaluate("import('/verifier/six-items-runtime.ts').then(m=>m.verifySixItemRuntime())"))
    save('icons.json',await evaluate("import('/verifier/six-icons.tsx').then(m=>m.verifySixIcons())"))
  }
  else throw Error('Unknown action')
  save(`${action}-${version}-${mode}-errors.json`,errors)
  if(errors.length)throw Error(`${errors.length} browser exceptions`)
}finally{ws.close()}
