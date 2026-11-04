// [concierge] 看门人（Entity 131）阶段 3 场景预览截图：node scripts/verify-concierge3.mjs [shot...]
// 输出 reports/concierge/s3-<shot>.png；全部齐了再拼 reports/concierge/stage3-preview.jpg（实机格另由 verify-concierge-game.mjs 产出）。
// 端口 3500（与 verify-concierge.mjs 同一个 vite），同时只开一个浏览器；proto-concierge3.html 必须 ?cpu=1（无头 SwiftShader 不能画 GPU 蒙皮）。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = '9501', out = 'reports/concierge/', base = 'http://127.0.0.1:3500'
mkdirSync(out, { recursive: true })
const SHOTS = { desk: 'shot=desk', eye: 'shot=eye', talk: 'shot=talk', tackle: 'shot=tackle', bind: 'shot=bind', drag: 'shot=drag', stuff: 'shot=stuff', rope: 'shot=rope', black: 'shot=black', wake: 'shot=wake', codex0: 'shot=codex&part=0', codex1: 'shot=codex&part=1' }
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS)
const up = async () => { try { return (await fetch(base + '/proto-concierge3.html')).ok } catch { return false } }
if (!(await up())) { spawn('npx', ['vite', '--port', '3500', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/concierge3-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
const results = {}
try {
  let page
  for (let i = 0; i < 80 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 960, height: 720, deviceScaleFactor: 1, mobile: false })
  for (const name of want) {
    const path = '/proto-concierge3.html?cpu=1&' + SHOTS[name]
    try { await ev('window.__ready=false') } catch {}
    await send('Page.navigate', { url: base + path })
    const s = JSON.stringify(new URL(base + path).search)
    let ok = false
    for (let i = 0; i < 600; i++) { await new Promise((r) => setTimeout(r, 300)); try { if (await ev(`window.__ready===true && location.search===${s}`)) { ok = true; break } } catch {} }
    const info = await ev('window.__info'); results[name] = { ok, info }
    console.log(name, ok, JSON.stringify(info))
    writeFileSync(out + 's3-' + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
writeFileSync(out + 's3-result.json', JSON.stringify(results, null, 1))
process.exit(0)
