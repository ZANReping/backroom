// Dedicated local QA Chrome only; supply REFINED_ITEM_CDP and REFINED_ITEM_URL to override.
// node scripts/verify-refined-items.mjs visuals|bench|runtime classic|realistic before|after
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const [action = 'visuals', mode = 'realistic', version = 'after'] = process.argv.slice(2)
const base = process.env.REFINED_ITEM_URL ?? 'http://127.0.0.1:3007', port = process.env.REFINED_ITEM_CDP ?? '9238'
const out = fileURLToPath(new URL('../reports/refined-items/', import.meta.url)); mkdirSync(out, { recursive: true })
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = pages.find(p => p.type === 'page' && p.url.startsWith(base))
if (!page) throw Error('Open the verifier in a dedicated local QA browser first')
const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r, { once: true }))
let next = 0; const pending = new Map(), errors = []
ws.addEventListener('message', e => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async expression => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result?.value }
const save = (name, data) => writeFileSync(out + name, JSON.stringify(data, null, 2) + '\n')
const shot = async name => { await evaluate('window.__refined.render()'); const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(out + name, Buffer.from(r.data, 'base64')) }
try {
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: action === 'bench' ? 1168 : 1200, deviceScaleFactor: 1, mobile: false })
  const game = action === 'game'
  await send('Page.navigate', { url: `${base}/verifier/${game ? 'l0-remake' : 'refined-items'}.html?mode=${mode}${version === 'before' ? '&baseline' : ''}` })
  await new Promise(r => setTimeout(r, 800))
  let ready = false
  for (let i = 0; i < 240; i++) { if (await evaluate(game ? '!!window.qa?.ready' : '!!window.__refined?.ready')) { ready = true; break } await new Promise(r => setTimeout(r, 250)) }
  if (!ready) throw Error('Verifier did not become ready: ' + JSON.stringify(errors))
  if (game) {
    save(`game-${mode}.json`, await evaluate("import('/verifier/refined-items-game.ts').then(m=>m.verifyRefinedModelsInGame(window.qa))"))
    for (const type of ['wrench', 'timber', 'citywater']) {
      await evaluate(`window.qa.eng.player.hotbar[0]={type:'${type}',count:1};window.qa.warm()`)
      const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); writeFileSync(out + `game-${mode}-${type}.png`, Buffer.from(r.data, 'base64'))
    }
  } else if (action === 'visuals') {
    await shot(`${version}-${mode}-all.png`)
    save(`${version}-${mode}-textures.json`, await evaluate('window.__refined.textures()'))
    if (version === 'after') for (const atlas of ['tools', 'gear', 'food', 'paper']) {
      await evaluate(`window.__refined.gallery('${atlas}');window.__refined.warm()`)
      await shot(`${version}-${mode}-${atlas}-front.png`)
      await evaluate('window.__refined.rotate(Math.PI)'); await shot(`${version}-${mode}-${atlas}-back.png`)
      await evaluate(`window.__refined.gallery('${atlas}',true);window.__refined.warm()`); await shot(`${version}-${mode}-${atlas}-held.png`)
    }
    await evaluate('window.__refined.gallery();window.__refined.dark(true);window.__refined.warm()')
    await shot(`${version}-${mode}-torch.png`)
    await evaluate('window.__refined.dark(false)')
    save(`${version}-${mode}-lifecycle.json`, await evaluate('window.__refined.lifecycle()'))
  } else if (action === 'bench') save(`${version}-${mode}-performance.json`, await evaluate('window.__refined.bench(550)'))
  else if (action === 'runtime') save('runtime.json', await evaluate("import('/verifier/refined-items-runtime.ts').then(m=>m.verifyRefinedItemRuntime())"))
  else throw Error('Unknown action')
  save(`${action}-${version}-${mode}-errors.json`, errors)
  if (errors.length) throw Error(`${errors.length} browser exceptions`)
  console.log(`${action}/${version}/${mode}: passed`)
} finally { ws.close() }
