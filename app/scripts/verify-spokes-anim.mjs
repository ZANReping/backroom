// [spokes stage 2] 迎宾女郎（Entity 28）动画截图：node scripts/verify-spokes-anim.mjs <模式> <片段,…>
//   模式 grid  → reports/spokes/anim-<clip>.png（8 帧网格，标时间；自查用）
//   模式 sheet → reports/spokes/sheet-<clip>.png（SHEET_TS 里的 4 个关键时刻，不标字；spokes-gif.py sheet 拼图）
//   模式 gif   → reports/spokes/gif-<clip>.png（按 fps 全部帧，不标字；spokes-gif.py gif 切帧）。默认每格 480×552、10 fps（S_TILE / S_FPS 可改）
// 端口 3505（vite）/ 9506（chromium 调试）；chrome profile 放 /tmp；同时只开一个浏览器（结束时 SIGKILL 自己起的那个）。默认 ?cpu=1。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
const port = '9506', out = 'reports/spokes/', base = 'http://127.0.0.1:3505'
mkdirSync(out, { recursive: true })
export const SHEET_TS = {
  idle: [0.2, 1.8, 3.6, 4.6], greetSpin: [0.5, 1.45, 2.6, 3.4], bowInvite: [0.5, 1.5, 2.9, 3.4], speakerTalk: [0.2, 0.9, 2.0, 3.3],
  innerFreeze: [0.2, 1.0, 3.0, 4.6], drawPoster: [0.5, 2.0, 3.6, 4.6], dropPoster: [0.6, 1.6, 2.6, 3.7], windRabbit: [1.4, 2.5, 4.3, 5.1],
  walk: [0, 0.275, 0.55, 0.825], guidePoint: [0.2, 0.9, 1.5, 2.0], sitDesk: [0.5, 1.5, 2.6, 3.6], seatedIdle: [0.5, 2.6, 4.1, 5.0],
  shoulderTap: [0.3, 0.9, 2.3, 3.6], photoRecall: [1.0, 3.8, 5.0, 6.0], rabbitHop: [0.0, 0.11, 0.21, 0.32], rabbitStop: [0.2, 1.0, 1.5, 2.2],
}
/** GIF 里每段播放时长（秒；循环片段 × 重复次数） */
const DURS = { idle: 6, greetSpin: 4.6, bowInvite: 4.2, speakerTalk: 5, innerFreeze: 5, drawPoster: 6, dropPoster: 5, windRabbit: 7, walk: 1.1, guidePoint: 2.2, sitDesk: 4.6, seatedIdle: 6, shoulderTap: 4.2, photoRecall: 7.4, rabbitHop: 0.42, rabbitStop: 2.4 }
const REPS = { walk: 3, guidePoint: 2, rabbitHop: 6 }
const mode = process.argv[2] ?? 'grid', clips = (process.argv[3] ?? 'idle').split(',')
const EXTRA = process.env.S_Q ? '&' + process.env.S_Q : ''
const job = (c) => {
  if (mode === 'sheet') return [`/proto-spokes.html?cpu=1&anim=1&clip=${c}&ts=${SHEET_TS[c].join(',')}&cols=4${EXTRA}`, 4 * 360, 440, 'sheet-']
  if (mode === 'gif') { const tile = Number(process.env.S_TILE ?? 480), thh = Math.round(tile * 1.15)
    return [`/proto-spokes.html?cpu=1&anim=1&clip=${c}&gif=1&fps=${process.env.S_FPS ?? 10}&tile=${tile}&reps=${REPS[c] ?? 1}${EXTRA}`, tile * 10, thh, 'gif-', thh] }
  return [`/proto-spokes.html?cpu=1&anim=1&clip=${c}&grid=8&cols=4${EXTRA}`, 1440, 1000, 'anim-']
}
const up = async () => { try { return (await fetch(base + '/proto-spokes.html')).ok } catch { return false } }
if (!(await up())) { spawn('npx', ['vite', '--port', '3505', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/spokes-anim-qa', '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { chrome.kill('SIGKILL') } catch {} process.exit(1) })
const results = {}
try {
  let page
  for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') console.log('ERR', JSON.stringify(r.params.args).slice(0, 400)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
  await send('Runtime.enable'); await send('Page.enable')
  for (const c of clips) {
    let [path, w, h, pre, rowH] = job(c)
    if (mode === 'gif') {
      // 帧数 → 行数（每行 10 格）
      const fps = Number(process.env.S_FPS ?? 10), DUR = DURS[c] * (REPS[c] ?? 1)
      const n = Math.max(1, Math.round(DUR * fps)); h = Math.ceil(n / 10) * rowH
    }
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    const ws2 = JSON.stringify(new URL(base + path).search)
    let ok = false
    await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 300))
    await send('Page.navigate', { url: base + path })
    for (let i = 0; i < 1500; i++) { await new Promise((r) => setTimeout(r, 200)); try { if (await ev(`window.__ready===true && location.search===${ws2}`)) { ok = true; break } } catch {} }
    const info = await ev('window.__info'); results[pre + c] = { info, ok }
    console.log(pre + c, ok ? '' : 'TIMEOUT', JSON.stringify(info).slice(0, 260))
    writeFileSync(out + pre + c + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  }
} finally { chrome.kill('SIGKILL') }
{ const f = out + 'anim-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1)) }
