// Uses an independently launched local QA Chrome, never the user's browsing profile.
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const action = process.argv[2] ?? 'proto', mode = process.argv[3] ?? 'realistic'
const level = Number(process.env.DULLER_QA_LEVEL ?? 2), suffix = level === 2 ? '' : `-level${level}`
const base = process.env.DULLER_QA_URL ?? 'http://127.0.0.1:3007'
const port = process.env.DULLER_QA_CDP ?? '9238'
const out = fileURLToPath(new URL('../reports/duller-import/', import.meta.url))
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
  const browser = await send('Browser.getVersion')
  const commandLine = await send('Browser.getBrowserCommandLine').catch(error=>({unavailable:error.message}))
  save('browser.json', { version: browser, commandLine, headlessNew: commandLine.arguments?.includes('--headless=new') ?? null })
  if (commandLine.arguments && !commandLine.arguments.includes('--headless=new')) throw Error('QA browser is not launched with --headless=new')
  if (!browser.userAgent.includes('HeadlessChrome')) throw Error('QA browser is not headless')
  await send('Page.addScriptToEvaluateOnNewDocument', {source:"document.addEventListener('DOMContentLoaded',()=>{const icon=document.createElement('link');icon.rel='icon';icon.href='data:,';document.head.append(icon)})"})
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: action === 'proto' ? 800 : 1000, deviceScaleFactor: 1, mobile: false })
  if (action === 'proto') {
    for (const view of ['poses', 'close', 'wall']) {
      await navigate(`/proto-duller.html?mode=${view}`, '!!window.__ready')
      await screenshot(`prototype-${view}.png`)
    }
  } else {
    await navigate(`/verifier/l0-remake.html?level=${level}&mode=${mode}`, '!!window.qa?.ready')
    save(`game-${mode}${suffix}.json`, await evaluate(`import('/verifier/duller-import.ts').then(m=>m.verifyDullerImport(window.qa,${level}))`))
    for (const kind of ['roam', 'reach', 'hold', 'flee']) {
      await evaluate(`window.dullerQa.show('${kind}')`)
      await screenshot(`game-${mode}${suffix}-${kind}.png`)
    }
  }
  save(`${action}-${mode}${suffix}-errors.json`, errors)
  if (errors.length) throw Error(`${errors.length} browser errors; see report`)
  console.log(`${action}/${mode}: passed`)
} finally { ws.close() }
