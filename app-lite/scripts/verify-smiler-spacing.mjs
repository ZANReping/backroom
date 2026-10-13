// Uses an independently launched local QA Chrome, never the user's browsing profile.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const action = process.argv[2] ?? 'proto', mode = process.argv[3] ?? 'realistic'
const level = Number(process.env.SMILER_QA_LEVEL ?? 2), suffix = level === 2 ? '' : `-level${level}`
const base = process.env.SMILER_QA_URL ?? 'http://127.0.0.1:3007'
const port = process.env.SMILER_QA_CDP ?? '9238'
const out = fileURLToPath(new URL('../reports/smiler-spacing/', import.meta.url))
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
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: action === 'proto' ? 800 : 1000, deviceScaleFactor: 1, mobile: false })
  await navigate(`/verifier/l0-remake.html?level=3&mode=${mode}`, '!!window.qa?.ready')
  await evaluate(`import('/verifier/smiler-spacing.ts').then(m=>m.verifySmilerSpacing(window.qa))`)
  for(const kind of ['common','phantom','starved','canid','great']) {
    await evaluate(`window.smilerSpacingQa.show('${kind}',false,false,true)`)
    await screenshot(`${mode}-${kind}-attack.png`)
  }
  await evaluate(`window.smilerSpacingQa.show('great',true,true)`)
  await screenshot(`${mode}-great-high-standing.png`)
  await evaluate(`window.smilerSpacingQa.show('great',true,false)`)
  await screenshot(`${mode}-great-high-attacking.png`)
  save(`${mode}-results.json`,await evaluate('window.smilerSpacingQa.results'))
  save(`${mode}-resources.json`,await evaluate('window.smilerSpacingQa.recycle()'))
  save(`${action}-${mode}${suffix}-errors.json`, errors)
  if (errors.length) throw Error(`${errors.length} browser errors; see report`)
  console.log(`${action}/${mode}: passed`)
} finally { ws.close() }

