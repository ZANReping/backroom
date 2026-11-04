// [chef stage 2] 厨师（Entity 800）动画截图：node scripts/verify-chef-anim.mjs <模式> <片段,…>
//   模式 grid  → reports/chef/anim-<clip>.png（8 帧网格，标时间；自查用）
//   模式 sheet → reports/chef/sheet-<clip>.png（SHEET_TS 里的 4 个关键时刻，不标字；chef-gif.py sheet 拼图）
//   模式 gif   → reports/chef/gif-<clip>.png（按 fps 全部帧，不标字；chef-gif.py gif 切帧）。默认每格 480×552、10 fps（S_TILE / S_FPS 可改）
// 端口 3506（vite）/ 9507（chromium 调试）；chrome profile 放 /tmp；同时只开一个浏览器（结束时 SIGKILL 自己起的那个，不 pkill 别人的）。默认 ?cpu=1。
// 字体丢失：cp /workspace/work/fonts/* ~/.fonts && fc-cache
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
const port = '9507', out = 'reports/chef/', base = 'http://127.0.0.1:3506'
mkdirSync(out, { recursive: true })
export const SHEET_TS = {
  idle: [0.3, 1.8, 3.9, 5.2], waddle: [0, 0.35, 0.7, 1.05], humWalk: [0, 0.5, 1.0, 1.5], serve: [0.5, 2.2, 3.0, 4.5], earTwitch: [0.3, 0.55, 1.2, 3.2],
  tapTable: [0.6, 1.5, 1.65, 3.6], potSwing: [0.3, 1.33, 1.42, 1.9], grabDrag: [0, 0.55, 1.1, 1.65], sniffCrouch: [0.7, 2.3, 3.4, 5.0], takeKnife: [1.6, 2.6, 3.7, 4.7],
  barricade: [1.6, 3.9, 4.9, 6.6], stuffedStagger: [0.3, 1.0, 1.7, 2.3], stoveLean: [0.3, 1.2, 2.4, 3.3], vomitPot: [0.6, 1.6, 2.9, 5.4], flashFreeze: [0.2, 0.5, 2.0, 3.6],
  standFromChair: [0.5, 1.45, 2.9, 4.6], holdCabbage: [0.5, 2.0, 2.9, 4.4],
}
/** GIF 里每段播放时长（秒；循环片段 × 重复次数） */
const DURS = { idle: 6, waddle: 1.4, humWalk: 2, serve: 5.6, earTwitch: 3.6, tapTable: 4, potSwing: 3.4, grabDrag: 2.2, sniffCrouch: 6, takeKnife: 6.4, barricade: 8, stuffedStagger: 2.6, stoveLean: 4, vomitPot: 6, flashFreeze: 4, standFromChair: 5, holdCabbage: 5 }
const REPS = { waddle: 3, humWalk: 2, grabDrag: 2, stuffedStagger: 2 }
const mode = process.argv[2] ?? 'grid', clips = (process.argv[3] ?? 'idle').split(',')
const EXTRA = process.env.S_Q ? '&' + process.env.S_Q : ''
const job = (c) => {
  if (mode === 'sheet') return [`/proto-chef.html?cpu=1&anim=1&clip=${c}&ts=${SHEET_TS[c].join(',')}&cols=4${EXTRA}`, 4 * 360, 440, 'sheet-']
  if (mode === 'gif') { const tile = Number(process.env.S_TILE ?? 480), thh = Math.round(tile * 1.15)
    return [`/proto-chef.html?cpu=1&anim=1&clip=${c}&gif=1&fps=${process.env.S_FPS ?? 10}&tile=${tile}&reps=${REPS[c] ?? 1}${EXTRA}`, tile * 10, thh, 'gif-', thh] }
  return [`/proto-chef.html?cpu=1&anim=1&clip=${c}&grid=8&cols=4${EXTRA}`, 1440, 1000, 'anim-']
}
const up = async () => { try { return (await fetch(base + '/proto-chef.html')).ok } catch { return false } }
if (!(await up())) { spawn('node_modules/.bin/vite', ['--port', '3506', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }).unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
// 上次被 SIGKILL 的浏览器会留下 Singleton 锁，下一个起不来（静默超时）：先清掉
for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) { try { rmSync('/tmp/chef-anim-qa/' + f, { force: true }) } catch {} }
const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, '--user-data-dir=/tmp/chef-anim-qa', '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
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
