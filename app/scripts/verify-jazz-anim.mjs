// [jazz stage 2] 爵士脑（Entity 197）动画截图：node scripts/verify-jazz-anim.mjs <模式> <片段[@who],…>
//   模式 grid  → reports/jazz/anim-<clip>@<who>.png（8 帧网格，标时间；自查用）
//   模式 sheet → reports/jazz/sheet-<clip>@<who>.png（SHEET_TS 里的 4 个关键时刻，不标字；jazz-gif.py sheet 拼图）
//   模式 gif   → reports/jazz/gif-<clip>@<who>.png（按 fps 全部帧，不标字；jazz-gif.py gif 切帧）。默认每格 480×552、10 fps（S_TILE / S_FPS 可改）
//   S_TS=0.5,1.2,…：sheet 模式改截这些时刻（默认 SHEET_TS）；S_MAP：逐项相机 / 时刻（见下）；S_LOD=0..2（默认 gif 用 1，其余 0）；S_T0 / S_T1：gif 只截 [t0, t1) 秒（长片段分两次截，文件名加 _p0 / _p1）
// 端口 3507（vite）/ 9507（chromium 调试）；chrome profile 放 /tmp；同时只开一个浏览器（结束时 SIGKILL 自己起的那个，不 pkill 别人的）。默认 ?cpu=1。
// 字体丢失：mkdir -p ~/.fonts && cp /workspace/work/fonts/* ~/.fonts && fc-cache -f
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
const port = '9507', out = 'reports/jazz/', base = 'http://127.0.0.1:3507'
mkdirSync(out, { recursive: true })
export const SHEET_TS = {
  trumpetPlay: [0.2, 1.0, 2.1, 3.3], trumpetSolo: [0.7, 2.6, 3.8, 5.6], saxPlay: [0.2, 1.1, 2.3, 3.4], saxSolo: [0.8, 2.8, 4.3, 5.7],
  bassPlay: [0.05, 0.55, 1.5, 2.6], drumPlay: [0.0, 0.52, 1.25, 1.52], pianoPlay: [0.1, 0.9, 1.6, 2.6], bow: [0.3, 0.9, 1.9, 3.3],
  tuneUp: [0.6, 1.5, 2.6, 3.8], fakeSoulSuck: [0.5, 1.3, 2.7, 3.6], idleSway: [0.2, 1.1, 2.0, 3.0], walk: [0, 0.29, 0.58, 0.86],
  drinkBeer: [0.8, 2.0, 3.2, 4.5], holdHead: [0.3, 1.25, 2.5, 3.75], talkGesture: [0.3, 1.0, 2.0, 3.0], leanFamiliar: [0.3, 1.2, 2.0, 3.0],
  pointDirection: [0.3, 1.2, 2.2, 3.3], glanceCamera: [0.3, 1.2, 2.3, 3.0], argueReconcile: [0.6, 2.0, 3.3, 5.0],
  packUp: [0.8, 1.9, 2.6, 3.9], trueSoulSuck: [0.3, 0.95, 1.6, 2.95],
}
const REPS = { walk: 2 }
const mode = process.argv[2] ?? 'grid', items = (process.argv[3] ?? 'idleSway').split(',')
const EXTRA0 = process.env.S_Q ? '&' + process.env.S_Q : ''
// S_MAP='{"<clip>[@who]": {"q": "cam=…&at=…", "ts": "0.5,1.4,…"}}'：sheet 模式逐项给相机 / 时刻（一次开一个浏览器截多段特写）
const SMAP = process.env.S_MAP ? JSON.parse(process.env.S_MAP) : {}
let EXTRA = EXTRA0, TSX = null
const DURS = { trumpetPlay: 4, trumpetSolo: 6, saxPlay: 4, saxSolo: 6, bassPlay: 4, drumPlay: 4, pianoPlay: 4, bow: 3.6, tuneUp: 4.8, fakeSoulSuck: 4, idleSway: 4, walk: 2.3, drinkBeer: 6, holdHead: 5, talkGesture: 4, leanFamiliar: 4, pointDirection: 3.6, glanceCamera: 4, argueReconcile: 6, packUp: 4.4, trueSoulSuck: 4 }
const job = (c, who) => {
  const wq = who ? `&who=${who}` : ''
  const lod = process.env.S_LOD ?? (mode === 'gif' ? 1 : 0)
  if (mode === 'sheet') return [`/proto-jazz-anim.html?cpu=1&lod=${lod}&clip=${c}${wq}&ts=${TSX ?? process.env.S_TS ?? SHEET_TS[c].join(',')}&cols=4${EXTRA}`, 4 * 360, 440, 'sheet-']
  if (mode === 'gif') {
    const tile = Number(process.env.S_TILE ?? 480), thh = Math.round(tile * 1.15), fps = Number(process.env.S_FPS ?? 10)
    const t0 = Number(process.env.S_T0 ?? 0), t1 = process.env.S_T1 ? Number(process.env.S_T1) : null
    let ts = ''
    if (t1 !== null) { const a = []; for (let k = Math.round(t0 * fps); k < Math.round(t1 * fps); k++) a.push((k / fps).toFixed(3)); ts = '&ts=' + a.join(',') }
    return [`/proto-jazz-anim.html?cpu=1&lod=${lod}&clip=${c}${wq}&gif=1&fps=${fps}&tile=${tile}&reps=${REPS[c] ?? 1}${ts}${EXTRA}`, tile * 10, thh, 'gif-', thh, t1 !== null ? (Math.round(t1 * fps) - Math.round(t0 * fps)) : null]
  }
  return [`/proto-jazz-anim.html?cpu=1&lod=${lod}&clip=${c}${wq}&grid=8&cols=4${EXTRA}`, 1440, 1000, 'anim-']
}
const up = async () => { try { return (await fetch(base + '/proto-jazz-anim.html')).ok } catch { return false } }
if (!(await up())) { spawn('node_modules/.bin/vite', ['--port', '3507', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { rmSync('/tmp/jazz-anim-qa/' + f, { force: true }) } catch {} }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/jazz-anim-qa', '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { chrome.kill('SIGKILL') } catch {} process.exit(1) })
const results = {}
const deadline = Date.now() + Number(process.env.S_BUDGET ?? 105) * 1000
try {
  let page
  for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') console.log('ERR', JSON.stringify(r.params.args).slice(0, 400)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  for (const it of items) {
    if (Date.now() > deadline) { console.log('BUDGET skip', it); continue }
    const [c, who] = it.split('@')
    { const m = SMAP[it]; EXTRA = m?.q ? '&' + m.q : EXTRA0; TSX = m?.ts ?? null }
    let [path, w, h, pre, rowH, nfix] = job(c, who)
    if (mode === 'gif') { const fps = Number(process.env.S_FPS ?? 10); const n = nfix ?? Math.max(1, Math.round(Number(process.env.S_DUR ?? DURS[c] ?? 4) * fps)); h = Math.ceil(n / 10) * rowH }
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    const ws2 = JSON.stringify(new URL(base + path).search)
    let ok = false
    await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 300))
    await send('Page.navigate', { url: base + path })
    while (Date.now() < deadline + 5000) { await new Promise((r) => setTimeout(r, 200)); try { if (await ev(`window.__ready===true && location.search===${ws2}`)) { ok = true; break } } catch {} }
    const info = await ev('window.__info')
    const name = pre + c + (who ? '@' + who : '') + (process.env.S_PART ? '_' + process.env.S_PART : '')
    results[name] = { info, ok }
    console.log(name, ok ? '' : 'TIMEOUT', JSON.stringify(info).slice(0, 220))
    if (ok) writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
{ const f = out + 'anim-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1)) }
process.exit(0)
