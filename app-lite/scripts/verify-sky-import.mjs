// Dedicated, true-headless CDP verification of the production Engine/Renderer.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const stage = process.argv[2] ?? 'after'
const base = process.env.SKY_QA_URL ?? 'http://127.0.0.1:3008'
const port = process.env.SKY_QA_CDP ?? '9239'
const out = fileURLToPath(new URL('../reports/sky-import/', import.meta.url))
mkdirSync(out, { recursive: true })
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = pages.find(p => p.type === 'page' && p.url.startsWith(base)) ?? pages.find(p => p.type === 'page' && p.url === 'chrome-error://chromewebdata/')
if (!page) throw Error('Missing dedicated local QA page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let next = 0
const pending = new Map(), errors = []
ws.addEventListener('message', e => {
  const r = JSON.parse(e.data)
  if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') errors.push(r.params)
  if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails)
  if (r.method === 'Log.entryAdded' && r.params.entry.level === 'error') errors.push(r.params.entry)
  const p = pending.get(r.id)
  if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++next; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails))
  return r.result?.value
}
const save = (name, data) => writeFileSync(out + name, JSON.stringify(data, null, 2) + '\n')
const screenshot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(out + name, Buffer.from(r.data, 'base64'))
}
async function navigate(path, ready) {
  await send('Page.navigate', { url: base + path }); await new Promise(r => setTimeout(r, 700))
  for (let i = 0; i < 240; i++) {
    if (await evaluate(`location.href === ${JSON.stringify(base+path)} && (${ready})`)) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw Error('Timed out: ' + path)
}
async function profiles() {
  for(const mode of ['realistic','classic']) {
    await navigate(`/proto-sky.html?grid=1&t=60&freeze=1&mode=${mode}`, 'window.__frames>12')
    const info=await evaluate('__skyInfo()')
    if(info.some(s=>s.quality.w!==(mode==='classic'?256:512)))throw Error('Wrong preview quality: '+mode)
    save(`profiles-${mode}.json`,info)
    await screenshot(`after-profiles${mode==='classic'?'-classic':''}.png`)
  }
}
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable')
  const version = await send('Browser.getVersion'), commandLine = await send('Browser.getBrowserCommandLine')
  if (!commandLine.arguments.includes('--headless=new') || !version.userAgent.includes('HeadlessChrome')) throw Error('Requires true headless Chrome')
  if (!commandLine.arguments.some(a=>a.startsWith('--user-data-dir=')&&a.replaceAll('\\','/').endsWith('/app/.cache/sky-qa')) || !commandLine.arguments.includes(`--remote-debugging-port=${port}`)) throw Error('Wrong QA profile/port')
  save('browser.json', { version, commandLine })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded',()=>{const i=document.createElement('link');i.rel='icon';i.href='data:,';document.head.append(i)})" })
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  if(stage==='profiles')await profiles()
  else {
  await navigate('/verifier/l0-remake.html?level=10&mode=realistic'+(stage==='before'?'&baseline=sky':''), '!!window.qa?.ready')
  for(let i=errors.length-1;i>=0;i--)if(errors[i].url===base+'/favicon.ico')errors.splice(i,1)
  await evaluate(`qa.hide();qa.r.resize(1920,1080,1);qa.look.yaw=0;qa.look.pitch=.28;
    qa.warm=async()=>{const start=performance.now();let stable=start,prev='';for(;;){const p=qa.pendingWork(),s=JSON.stringify([qa.r.chunkGroups.size,qa.r.three.info.memory,qa.r.three.info.programs.length]),now=performance.now();if(Object.values(p).some(Boolean)||s!==prev){stable=now;prev=s}if(now-start>3000&&now-stable>1000)return {elapsed:now-start,pending:p};if(now-start>180000)throw Error('Cold rebuild timeout '+JSON.stringify(p));await new Promise(r=>setTimeout(r,100))}}`)
  await evaluate('qa.warm()')
  if(stage==='textures') {
    save('sky-textures.json',await evaluate("window.perfQA={renderer:qa.r};import('/verifier/sky-textures.js').then(m=>m.verifySkyTextures())"))
  }
  await evaluate('qa.freezeRenderTime(60)')
  await screenshot(`${stage}-l10-realistic.png`)
  save(`${stage}-context.json`, await evaluate('({mode:qa.r.lightMode,seed:qa.eng.mapSeed,weather:qa.eng.l10Weather,player:{x:qa.eng.player.x,y:qa.eng.player.y,z:qa.eng.player.z},look:qa.look,fov:qa.r.camera.fov,width:1920,height:1080})'))
  const perf=[]
  if(!process.env.SKY_QA_TEST_ONLY && stage!=='textures'){
  for(let i=0;i<5;i++){perf.push(await evaluate('qa.sample(180)'));save(`${stage}-performance.json`,perf)}
  console.log(`${stage}: five L10 samples captured`)
  }
  if(stage==='after'){
    if(!process.env.SKY_QA_VIEWS_ONLY){
    save('runtime.json', await evaluate("import('/verifier/sky-import.ts').then(m=>m.verifySkyImport(qa))"))
    await evaluate("qa.mode('classic');qa.warm()")
    await screenshot('after-l10-classic.png')
    await evaluate("qa.mode('realistic');qa.warm()")
    }
    for(const level of (process.env.SKY_QA_VIEWS_ONLY?[4,7]:[4,6,7,9,11])){
      await evaluate(`(async()=>{await qa.scene(${level});qa.look.pitch=.3;qa.look.yaw=0;
        if(${level}===7){const e=qa.eng,p=e.player;p.x=64-e.map.inf.ox;p.y=64-e.map.inf.oy;e.updateInfiniteWindow();p.z=.6;qa.look.pitch=.2}
        if(${level}===6)qa.eng.devGotoVariant('tundra');
        if(${level}===4){const m=qa.eng.map,p=qa.eng.player;let best=-1,d=Infinity;for(let i=0;i<m.outdoor.length;i++)if(m.outdoor[i]){const dd=Math.hypot(i%m.w-p.x,Math.floor(i/m.w)-p.y);if(dd<d){best=i;d=dd}}if(best>=0){p.x=best%m.w+.5;p.y=Math.floor(best/m.w)+.5;qa.eng.updateInfiniteWindow()}p.z=6;qa.look.pitch=.3}
        await qa.warm();if(!qa.r.skyMesh?.userData.sky)throw Error('No game sky L${level}');qa.freezeRenderTime(60)})()`)
      await screenshot(`after-l${level}-realistic.png`)
      save(`l${level}-stats.json`,await evaluate('qa.stats()'))
      save(`l${level}-camera.json`,await evaluate('({x:qa.eng.player.x+(qa.eng.map.inf?.ox??0),y:qa.eng.player.y+(qa.eng.map.inf?.oy??0),z:qa.eng.player.z,yaw:qa.look.yaw,pitch:qa.look.pitch,fov:qa.r.camera.fov})'))
    }
    await profiles()
  }
  }
  if(errors.length)throw Error(`${errors.length} browser errors (see report)`)
} finally {save(`${stage}-errors.json`,errors);ws.close()}
