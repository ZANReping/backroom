// Runs against the isolated production UI fixture; never changes player saves.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const base = process.env.SMILER_QA_URL ?? 'http://127.0.0.1:3007', port = process.env.SMILER_QA_CDP ?? '9238'
const out = fileURLToPath(new URL('../reports/smiler-forms/', import.meta.url))
mkdirSync(out, { recursive: true })
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
const page = pages.find(p => p.type === 'page' && p.url.startsWith(base))
if (!page) throw Error('Open the local verifier in a dedicated QA browser')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let id = 0
const pending = new Map(), errors = [], checks = []
ws.addEventListener('message', e => {
  const r = JSON.parse(e.data)
  if (r.method === 'Runtime.exceptionThrown') errors.push(r.params.exceptionDetails)
  const p = pending.get(r.id)
  if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) }
})
const send = (method, params = {}) => new Promise((resolve, reject) => {
  pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }))
})
const ev = async expression => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails))
  return r.result?.value
}
const wait = ms => new Promise(r => setTimeout(r, ms))
const check = (v, message) => { if (!v) throw Error(message); checks.push(message) }
async function clickText(text) {
  await ev(`(()=>{const text=${JSON.stringify(text)};const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.matches('.wb-tab')&&b.querySelector('span')?.textContent.trim()===text);if(!b)throw Error('Missing button: '+text);b.click()})()`)
  await wait(150)
}
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(out + name + '.png', Buffer.from(r.data, 'base64'))
}
try {
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: base + '/verifier/ui-import.html?dev' })
  for (let n = 0; n < 160; n++) { if (await ev('!!window.__ui?.ready')) break; await wait(250) }
  await ev("window.__ui.engine.player.level=2;window.__ui.engine.dev.frozenAI=true;window.__ui.show('hud')")
  await wait(300)
  const selector = '[aria-label="笑魇子变种"]'
  check(await ev(`document.querySelector('${selector}')?.options.length===5`), 'developer dropdown contains five forms')
  check(await ev(`document.querySelector('${selector}').value==='common'`), 'default selection is common')
  for (const kind of ['common', 'phantom', 'starved', 'canid', 'great']) {
    await ev(`(()=>{const s=document.querySelector('${selector}');s.value='${kind}';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await wait(80)
    const n = await ev('window.__ui.engine.map.entities.length')
    await ev(`document.querySelector('${selector}').parentElement.querySelector('button').click()`)
    await wait(100)
    check(await ev(`(()=>{const es=window.__ui.engine.map.entities,e=es.at(-1);return es.length===${n + 1}&&e.def.type==='smiler'&&e.def.smilerKind==='${kind}'&&e.sm.kind==='${kind}'})()`), `${kind}: actual click creates one selected form with frozen AI`)
  }
  await shot('developer-selection')
  await ev(`(()=>{const s=document.querySelector('[aria-label="死亡飞蛾子变种"]');s.value='female';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await wait(80)
  await ev(`document.querySelector('[aria-label="死亡飞蛾子变种"]').parentElement.querySelector('button').click()`)
  check(await ev("window.__ui.engine.map.entities.at(-1).def.mothForm==='female'"), 'moth selection still works independently')
  async function codex(seen) {
    await ev(`window.__ui.show('title');window.__ui.memory.set('br_codex_seen',JSON.stringify({smiler:${seen}}))`)
    await wait(100)
    await ev("window.__ui.show('inventory')"); await wait(200)
    await clickText('图鉴'); await clickText('实体')
    await ev("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.querySelector('.font-title')?.textContent==='笑魇');if(!b)throw Error('Missing smiler codex');b.click()})()")
    await wait(200)
  }
  await codex(1)
  const names = ['普通笑魇', '幽影笑魇', '饥饿笑魇', '犬形笑魇', '巨笑魇']
  check(await ev(`${JSON.stringify(names)}.every(name=>document.body.textContent.includes(name))`), 'five forms are shown within the parent codex')
  check(await ev("(document.body.textContent.match(/【行为未解锁】/g)||[]).length===5"), 'all five behaviors remain locked at first encounter')
  await shot('codex-locked')
  await codex(3)
  check(await ev("!document.body.textContent.includes('【行为未解锁】')&&document.body.textContent.includes('自然遭遇时成群包抄')"), 'parent encounter progress unlocks all form behaviors')
  await shot('codex-unlocked')
  check(errors.length === 0, 'no browser exceptions')
  console.log(`Smiler UI: ${checks.length} checks passed`)
} finally {
  writeFileSync(out + 'verification.json', JSON.stringify({ checks, errors }, null, 2) + '\n')
  ws.close()
}
