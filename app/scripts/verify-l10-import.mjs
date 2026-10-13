// Uses an independently launched local QA Chrome, never the user's browsing profile.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const mode = process.argv[2] ?? 'realistic'
const base = process.env.L10_QA_URL ?? 'http://127.0.0.1:3007'
const port = process.env.L10_QA_CDP ?? '9238'
const out = fileURLToPath(new URL('../reports/l10-import/', import.meta.url))
mkdirSync(out, { recursive: true })
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = pages.find(p => p.type === 'page' && p.url.startsWith(base))
if (!page) throw Error('Open the local verifier in a dedicated QA browser')
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
  for (let i = 0; i < 160; i++) {
    if (await evaluate(ready)) return
    await new Promise(r => setTimeout(r, 300))
  }
  throw Error('Timed out: ' + path)
}
try {
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable')
  const version = await send('Browser.getVersion'), commandLine = await send('Browser.getBrowserCommandLine')
  if (!commandLine.arguments.includes('--headless=new') || !version.userAgent.includes('HeadlessChrome')) throw Error('Requires true headless Chrome')
  if (!commandLine.arguments.some(a=>a.startsWith('--user-data-dir=')&&a.replaceAll('\\','/').endsWith('/app/.cache/l10-qa')) || !commandLine.arguments.includes(`--remote-debugging-port=${port}`)) throw Error('Browser does not belong to the dedicated L10 QA profile/port')
  save('browser.json', { version, commandLine })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: "document.addEventListener('DOMContentLoaded',()=>{const i=document.createElement('link');i.rel='icon';i.href='data:,';document.head.append(i)})" })
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false })
  if(!process.env.L10_QA_RESUME)await navigate(`/verifier/l0-remake.html?level=10&mode=${mode}`, '!!window.qa?.ready')
  // Log.enable can replay the initial pre-navigation favicon request; keep game errors only.
  for(let i=errors.length-1;i>=0;i--)if(errors[i].url===base+'/favicon.ico')errors.splice(i,1)
  await evaluate(`window.qa.hide();window.qa.r.setRealWater(true);
    window.qa.warm=async()=>{const start=performance.now();let stable=start,prev='';for(;;){const p=qa.pendingWork(),s=JSON.stringify([qa.r.chunkGroups.size,qa.r.three.info.memory,qa.r.three.info.programs.length]),now=performance.now();if(Object.values(p).some(Boolean)||s!==prev){stable=now;prev=s}if(now-start>3000&&now-stable>1000)return {elapsed:now-start,pending:p};if(now-start>180000)throw Error('L10 cold rebuild timeout '+JSON.stringify(p));await new Promise(r=>setTimeout(r,100))}}`)
  const reports = []
  if(process.env.L10_QA_WATER){
    for(const level of (process.env.L10_QA_WATER_LEVELS??'7,8,9').split(',').map(Number)){
      await evaluate(`(async()=>{await qa.scene(${level});const e=qa.eng,p=e.player;
        if(${level}===9)e.devGotoVariant('poolblock');
        const m=e.map;let best=-1,dist=Infinity;for(let i=0;i<m.liquid.length;i++)if(m.liquid[i]===1&&(${level}!==7||m.outdoor[i]===1)){const d=Math.hypot(i%m.w-p.x,Math.floor(i/m.w)-p.y);if(d<dist){best=i;dist=d}}
        if(best<0)throw Error('No water for L${level}');p.x=best%m.w+.5;p.y=Math.floor(best/m.w)+.5;p.z=.6;qa.look.pitch=-.65;qa.look.yaw=0;
        if(${level}===9){const seen=new Set([best]),todo=[best];for(let i=0;i<todo.length;i++){const n=todo[i];for(const j of[n-1,n+1,n-m.w,n+m.w])if(j>=0&&j<m.liquid.length&&m.liquid[j]===1&&!seen.has(j)){seen.add(j);todo.push(j)}}p.x=todo.reduce((s,i)=>s+i%m.w+.5,0)/todo.length;p.y=todo.reduce((s,i)=>s+Math.floor(i/m.w)+.5,0)/todo.length;p.z=1;qa.look.pitch=-.9;p.flashlight=true}
        if(${level}===8){p.x=15-m.inf.ox;p.y=31.5-m.inf.oy;p.z=1;qa.look.pitch=-.35;p.flashlight=true}
        if(${level}===10){const v=(await import('/src/proto/l10Views.ts')).__vLake(20261006);p.x=v[0]-m.inf.ox;p.y=v[1]-m.inf.oy;e.updateInfiniteWindow();p.z=(await import('/src/game/world/mapgen.ts')).floorHeight(m,p.x,p.y,0);qa.look.yaw=Math.atan2(-(v[2]-v[0]),-(v[3]-v[1]));qa.look.pitch=-.12}
        await qa.warm()})()`)
      for(const quality of [false,true]){
        const v=await evaluate(`(async()=>{qa.r.setRealWater(${quality});await qa.warm();let water=0;qa.r.scene.traverse(o=>{if(o.material?.userData?.waterApplied){water++;if(!o.geometry.getAttribute('aDepth'))throw Error('Missing water depth')}});if(!water)throw Error('Water absent');return {level:${level},quality:${quality},water,stats:qa.stats()}})()`)
        await screenshot(`${mode}-l${level}-water-${quality?'high':'low'}.png`);reports.push(v);save(`${mode}-water.json`,reports);console.log(`Water ${level}/${quality}: passed`)
      }
    }
  } else {
  for (const view of process.env.L10_QA_SKIP_VIEWS ? [] : ['Spawn', 'Farm', 'Barn', 'BarnIn', 'Lake', 'Field', 'Canola']) {
    const result = await evaluate(`(async()=>{
      const {eng,r,look,warm,stats}=window.qa;
      const views=await import('/src/proto/l10Views.ts');
      const {floorHeight}=await import('/src/game/world/mapgen.ts');
      const v=${JSON.stringify(view)}==='Spawn'?[0,5,0,40]:views['__v'+${JSON.stringify(view)}](20261006);
      if(!v)throw Error('Missing view');
      eng.player.x=v[0]-eng.map.inf.ox;eng.player.y=v[1]-eng.map.inf.oy;
      eng.updateInfiniteWindow();eng.player.z=floorHeight(eng.map,eng.player.x,eng.player.y,0);
      look.yaw=Math.atan2(-(v[2]-v[0]),-(v[3]-v[1]));look.pitch=${JSON.stringify(view)}==='Lake'?-.12:.02;
      const ready=await warm();
      const materials=new Map();r.scene.traverse(o=>{for(const m of(Array.isArray(o.material)?o.material:o.material?[o.material]:[]))if(m.userData.l10Wettable||m.userData.sharedL10CropCard)materials.set(m.uuid,m.type)});
      return {view:${JSON.stringify(view)},camera:v,z:eng.player.z,ready,materials:[...materials.values()],stats:stats()};
    })()`)
    await screenshot(`${mode}-${view.toLowerCase()}.png`)
    reports.push(result); save(`${mode}-views.json`, reports)
    console.log(`${mode}/${view}: ${result.stats.draws} draws, ${result.stats.triangles} triangles`)
  }
  if(!process.env.L10_QA_VIEWS_ONLY){
  if(!process.env.L10_QA_RESUME)save(`${mode}-gameplay.json`, await evaluate("import('/verifier/l10-import.ts').then(m=>m.verifyL10Import(qa))"))
  // Rebuild in both modes, then revisit the same scene to detect shader/cache growth.
  const modes = []
  for (const next of ['classic', 'realistic', 'classic', 'realistic', 'classic', 'realistic']) {
    const result = await evaluate(`(async()=>{const q=window.qa;q.mode('${next}');await q.warm();const m=new Set();q.r.scene.traverse(o=>{for(const a of(Array.isArray(o.material)?o.material:o.material?[o.material]:[]))if(a.userData.l10Wettable||a.userData.sharedL10CropCard)m.add(a.type)});return {mode:'${next}',materials:[...m],stats:q.stats()}})()`)
    if (result.materials.some(m=>m !== (next==='classic'?'MeshLambertMaterial':'MeshStandardMaterial'))) throw Error('Wrong material mode: '+JSON.stringify(result))
    modes.push(result); save(`${mode}-mode-rebuilds.json`, modes)
  }
  // Both modes first populate the bounded held/item and shader caches.
  for(let i=4;i<modes.length;i++){
    const a=modes[i-2].stats,b=modes[i].stats
    if(JSON.stringify(a.memory)!==JSON.stringify(b.memory)||a.programs!==b.programs)throw Error('Resources grow when returning to '+modes[i].mode)
  }
  const perf=[]
  await send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false})
  await evaluate('qa.r.resize(1920,1080,1)')
  await evaluate('qa.warm()')
  save('performance-context.json',await evaluate('({mode:qa.r.lightMode,seed:qa.eng.mapSeed,weather:{...qa.eng.l10Weather},x:qa.eng.player.x+qa.eng.map.inf.ox,y:qa.eng.player.y+qa.eng.map.inf.oy,z:qa.eng.player.z,yaw:qa.look.yaw,pitch:qa.look.pitch,fov:qa.r.camera.fov,width:1920,height:1080,deviceScale:1})'))
  for(let i=0;i<5;i++){perf.push(await evaluate('qa.sample(180)'));save('performance-realistic-rain.json',perf)}
  }
  }
  save(`${mode}-errors.json`, errors)
  if (errors.length) throw Error(`${errors.length} browser errors; see report`)
  console.log('Level 10 runtime views and material rebuilds passed')
} finally { save(`${mode}-errors.json`, errors); ws.close() }
