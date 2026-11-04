// [casino] Level 5.1 赌场员工 阶段 3 动画出帧：node scripts/verify-casino-staff-anim.mjs [who…]（vite 3509 / CDP 9509，一次一个浏览器，结束按 pid SIGKILL）
//   每片段 6–14 帧 → reports/casino/staff-anim/<who>/<clip>_NN.png + frames.json；拼图见 scripts/casino-staff-anim-sheet.py
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
const port = '9509', out = 'reports/casino/staff-anim/', base = 'http://127.0.0.1:3509', REF = '/workspace/work/casino/ref/'
mkdirSync(out, { recursive: true })
const STAFF = ['louie', 'prosthetic', 'billy', 'bartender', 'dealer', 'waiter', 'guard']
const args = process.argv.slice(2), want = args.length ? args : STAFF, results = {}
const FW = 300, FH = 380
if (want.length) {

  const up = async () => { try { return (await fetch(base + '/proto-casino-staff.html')).ok } catch { return false } }
  let vite = null
  if (!(await up())) { vite = spawn('node_modules/.bin/vite', ['--port', '3509', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true }); vite.unref(); for (let i = 0; i < 160 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500)) }
  const chrome = spawn('/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/casino-staff-qa`, '--no-first-run', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
  console.log('pids chrome', chrome.pid, 'vite', vite?.pid)
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { try { chrome.kill('SIGKILL') } catch {} process.exit(1) })
  const deadline = Date.now() + Number(process.env.C_BUDGET ?? 600) * 1000
  try {
    let page
    for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch {} }
    const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
    let seq = 0; const pending = new Map()
    ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 900)); if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') console.log('ERR', JSON.stringify(r.params.args).slice(0, 400)); const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
    const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id, method, params })) })
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.value
    await send('Runtime.enable'); await send('Page.enable')
    await send('Emulation.setDeviceMetricsOverride', { width: FW, height: FH, deviceScaleFactor: 1, mobile: false })
    for (const who of want) {
      if (Date.now() > deadline) { console.log('skip', who); continue }
      mkdirSync(out + who, { recursive: true })
      const path = `/proto-casino-staff.html?cpu=1&view=anim&who=${who}&lod=1&nolab=1`, s2 = JSON.stringify(new URL(base + path).search)
      await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 300))
      await send('Page.navigate', { url: base + path })
      let ok = false
      while (Date.now() < deadline + 8000) { await new Promise((r) => setTimeout(r, 400)); try { if (await ev(`window.__ready===true && location.search===${s2}`)) { ok = true; break } } catch {} }
      if (!ok) { console.log(who, 'TIMEOUT'); continue }
      const clips = await ev(`Object.entries(window.__clips||{})`)
      const list = []
      for (const [clip, info] of clips) {
        const N = Math.max(6, Math.min(14, Math.round(info.dur * 5)))
        for (let k = 0; k < N; k++) {
          const t = info.loop ? (k / N) * info.dur : (k / (N - 1)) * info.dur
          await ev(`window.__frame(${JSON.stringify(clip)}, ${t})`)
          const f = `${out}${who}/${clip}_${String(k).padStart(2, '0')}.png`
          writeFileSync(f, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
        }
        list.push({ clip, zh: info.zh, n: N })
        console.log(who, clip, N)
      }
      results[who] = list
    }
  } finally { chrome.kill('SIGKILL') }
  const f = out + 'frames.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1))
}
