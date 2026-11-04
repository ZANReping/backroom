// [spokes E28] 脚部特写截图（鞋穿模排查）：node scripts/verify-spokes-feet.mjs <输出目录> <前缀>
//   一次只开一个浏览器（端口 9506，vite 3505），每个视角一张 PNG：<目录>/<前缀>-<名>.png（600×500）
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
const port = '9506', base = process.env.S_BASE ?? 'http://127.0.0.1:3505'
const outDir = process.argv[2] ?? '.cache/feet', pre = process.argv[3] ?? 'cur'
mkdirSync(outDir, { recursive: true })
export const FEET_VIEWS = [
  ['side', 'view=side&cam=0.78,0.11,0.07&at=0.08,0.045,0.05&fov=19'],
  ['three', 'view=three&cam=0.42,0.3,0.72&at=0.0,0.045,0.06&fov=22'],
  ['walk', 'anim=1&clip=walk&t=0.55&cam=0.8,0.13,-0.1&at=0.02,0.05,-0.15&fov=22'],
  ['greet', 'anim=1&clip=greetSpin&t=1.45&cam=-0.72,0.12,0.32&at=-0.06,0.075,0.12&fov=22'],
  ['wind', 'anim=1&clip=windRabbit&t=2.5&cam=0.62,0.28,0.62&at=0.02,0.07,0.02&fov=26'],
  ['sit', 'anim=1&clip=sitDesk&t=3.6&cam=0.62,0.2,0.95&at=0.0,0.05,0.35&fov=24'],
]
if (process.env.S_VIEWS) FEET_VIEWS.push(...JSON.parse(process.env.S_VIEWS)) // 额外视角 [[名, 查询串], …]
const only = process.env.S_ONLY ? process.env.S_ONLY.split(',') : null
const up = async () => { try { return (await fetch(base + '/proto-spokes.html')).ok } catch { return false } }
if (!(await up())) { spawn('npx', ['vite', '--port', '3505', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/spokes-feet-qa', '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { chrome.kill('SIGKILL') } catch {} process.exit(1) })
try {
  let page
  for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 600)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 600, height: 500, deviceScaleFactor: 1, mobile: false })
  for (const [nm, qs] of FEET_VIEWS) {
    if (only && !only.includes(nm)) continue
    const path = `/proto-spokes.html?cpu=1&nolabel=1&${qs}`, srch = JSON.stringify(new URL(base + path).search)
    await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 300))
    await send('Page.navigate', { url: base + path })
    let ok = false
    for (let i = 0; i < 1200; i++) { await new Promise((r) => setTimeout(r, 200)); try { if (await ev(`window.__ready===true && location.search===${srch}`)) { ok = true; break } } catch {} }
    await ev(`document.getElementById('lab').innerHTML=''`)
    writeFileSync(`${outDir}/${pre}-${nm}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    console.log(nm, ok ? 'ok' : 'TIMEOUT')
  }
} finally { chrome.kill('SIGKILL') }
