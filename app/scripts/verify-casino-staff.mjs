// [casino] Level 5.1 赌场员工 阶段 2 截图：node scripts/verify-casino-staff.mjs [视图...] | sheet
//   视图：sheet-<who> / face-<who> / turn-<who> / lineup / scene / bar（who = louie|prosthetic|billy|bartender|dealer|waiter|guard）
//   输出 reports/casino/staff/*.png；sheet → reports/casino/staff-stage2.jpg、staff-compare.jpg、staff-in-scene.jpg。
//   端口 3509（vite）/ 9509（chromium 调试），只开一个浏览器，结束按 pid SIGKILL。默认 ?cpu=1。
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
const port = '9509', out = 'reports/casino/staff/', base = 'http://127.0.0.1:3509', REF = '/workspace/work/casino/ref/'
mkdirSync(out, { recursive: true })
const view = (name) => {
  const [v, who] = name.split('-')
  if (v === 'sheet') return [`/proto-casino-staff.html?cpu=1&view=sheet&who=${who}`, 1500, 900]
  if (v === 'face') return [`/proto-casino-staff.html?cpu=1&view=face&who=${who}&nolab=1`, 700, 700]
  if (v === 'turn') return [`/proto-casino-staff.html?cpu=1&view=turn&who=${who}&ang=${process.env.ANG ?? 30}&nolab=1`, 700, 900]
  if (v === 'close') { const part = name.split('-')[2], a = name.split('-')[3]; return [`/proto-casino-staff.html?cpu=1&view=close&who=${who}&part=${part}&nolab=1${a ? '&ang=' + a.replace('m', '-') : ''}`, 640, 640] }
  if (v === 'lineup') return ['/proto-casino-staff.html?cpu=1&view=lineup', 1800, 820]
  if (v === 'l5') return ['/proto-casino-staff.html?cpu=1&view=l5', 1800, 900]
  if (v === 'scene' || v === 'bar') return [`/proto-casino-staff.html?cpu=1&view=${v}&nolab=1`, 1280, 760]
  return null
}
const args = process.argv.slice(2), want = args.filter((a) => a !== 'sheet'), results = {}
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
    for (const name of want) {
      const V = view(name)
      if (!V || Date.now() > deadline) { console.log('skip', name); continue }
      const [path, w, h] = V
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
      const s2 = JSON.stringify(new URL(base + path).search)
      await send('Page.navigate', { url: 'about:blank' }); await new Promise((r) => setTimeout(r, 300))
      await send('Page.navigate', { url: base + path })
      let ok = false
      while (Date.now() < deadline + 8000) { await new Promise((r) => setTimeout(r, 400)); try { if (await ev(`window.__ready===true && location.search===${s2}`)) { ok = true; break } } catch {} }
      const info = await ev('window.__info'); results[name] = { info, ok }
      console.log(name, ok ? '' : 'TIMEOUT', JSON.stringify(info)?.slice(0, 400))
      if (ok) writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    }
  } finally { chrome.kill('SIGKILL') }
  const f = out + 'verify-result.json'; let old = {}; try { old = JSON.parse(readFileSync(f, 'utf8')) } catch {} writeFileSync(f, JSON.stringify({ ...old, ...results }, null, 1))
}
if (args.includes('sheet')) {
  const font = ['-font', '/workspace/work/fonts/NotoSansSC-Bold.otf']
  const HERO = ['louie', 'prosthetic', 'billy', 'bartender'], CREW = ['dealer', 'waiter', 'guard']
  // staff-stage2.jpg：每人一行三视图（脚本页已带中文标注 + 身高标尺）
  const rows = [...HERO, ...CREW].map((w) => out + `sheet-${w}.png`).filter(existsSync)
  const tmp = rows.map((r, i) => { const d = `/tmp/cs_row${i}.png`; spawnSync('convert', [r, '-resize', '1500x900', d]); return d })
  // 拼成两列
  const half = Math.ceil(tmp.length / 2), c1 = tmp.slice(0, half), c2 = tmp.slice(half)
  spawnSync('convert', [...c1, '-append', '/tmp/cs_c1.png']); if (c2.length) spawnSync('convert', [...c2, '-append', '/tmp/cs_c2.png'])
  spawnSync('convert', ['/tmp/cs_c1.png', ...(c2.length ? ['/tmp/cs_c2.png'] : []), '-background', '#1a1216', '+append', '-resize', '2400x', '+repage', '-gravity', 'north', '-splice', '0x60', '-gravity', 'northwest', ...font, '-fill', '#f3e6c8', '-pointsize', '34', '-annotate', '+30+12', 'Level 5.1 赌场员工 · 阶段 2 建模（静态 + 骨架 + LOD）· 正 / 侧 / ¾ 三视图与身高', '-quality', '88', 'reports/casino/staff-stage2.jpg'])
  // staff-compare.jpg：修前（work/casino-stage2/views 上一版）/ 修后 / 参考图 三列
  const PREV = '/workspace/projects/e0cd64b2-425c-4ea5-8bdb-bc0f453e036c/work/casino-stage2/views-v4/prev/'
  const pairs = [['ref2.jpg', 'louie', 'Louie（ref2）'], ['ref3.jpg', 'prosthetic', '假肢人（ref3）'], ['ref4.jpg', 'billy', '台球先生 Billy（ref4）']]
  const cells = []
  pairs.forEach(([r, w, l], i) => {
    const a = `/tmp/cs_prev${i}.png`, b = `/tmp/cs_our${i}.png`, c = `/tmp/cs_ref${i}.png`
    const prev = existsSync(PREV + `turn-${w}.png`) ? PREV + `turn-${w}.png` : PREV + `sheet-${w}.png`
    spawnSync('convert', [prev, '-resize', '540x720^', '-gravity', 'center', '-extent', '540x720', a])
    spawnSync('convert', [out + `turn-${w}.png`, '-resize', '540x720^', '-gravity', 'center', '-extent', '540x720', b])
    spawnSync('convert', [REF + r, '-resize', '520x700', '-gravity', 'center', '-background', '#d8d4cc', '-extent', '540x720', c])
    const d = `/tmp/cs_pair${i}.png`
    spawnSync('convert', [a, b, c, '+append', '+repage', '-gravity', 'south', '-background', '#120806', '-splice', '0x46', '-gravity', 'southwest', ...font, '-fill', '#f3e6c8', '-pointsize', '26', '-annotate', '+20+8', `${l}：左 上一版（第三轮）/ 中 新版（第四轮）/ 右 参考图`, d])
    cells.push(d)
  })
  spawnSync('convert', [...cells, '-append', '-quality', '86', 'reports/casino/staff-compare.jpg'])
  // staff-closeup.jpg：每人头部 + 手部近景
  const ZH = { louie: 'Louie', prosthetic: '假肢人', billy: 'Billy' }
  const crow = Object.keys(ZH).map((w, i) => { const hs = (w === 'louie' ? ['head', 'hand', 'facef', 'faces'] : ['head', 'hand']).map((p) => out + `close-${w}-${p}.png`).filter(existsSync); if (!hs.length) return null; const d = `/tmp/cs_cl${i}.png`; spawnSync('convert', [...(hs.length === 4 ? ['(', hs[0], hs[1], '+append', ')', '(', hs[2], hs[3], '+append', ')', '-append'] : [...hs, '+append']), '+repage', '-resize', hs.length === 4 ? 'x1040' : 'x520', '-gravity', 'north', '-background', '#120806', '-splice', '0x40', '-gravity', 'northwest', ...font, '-fill', '#f3e6c8', '-pointsize', '26', '-annotate', '+16+6', w === 'louie' ? 'Louie：头部 / 手部近景 / 脸部特写正面 / 侧面（2048² 程序皮肤 + 照片细节）' : `${ZH[w]}：头部 / 手部近景`, d]); return d }).filter(Boolean)
  if (crow.length) spawnSync('convert', [...crow, '-append', '-quality', '86', 'reports/casino/staff-closeup.jpg'])
  if (existsSync(out + 'l5.png')) spawnSync('convert', [out + 'l5.png', '+repage', '-gravity', 'south', '-background', '#120806', '-splice', '0x46', '-gravity', 'southwest', ...font, '-fill', '#f3e6c8', '-pointsize', '26', '-annotate', '+20+8', 'Louie（第三轮，身体复用爵士脑人体 / 西装 SDF）与行李员 / 看门人 / 管家：同光同比例', '-quality', '88', 'reports/casino/louie-vs-l5.jpg'])
  // staff-in-scene.jpg
  const sc = ['scene', 'bar'].map((v) => out + v + '.png').filter(existsSync)
  const lab = { scene: '前厅：全员站在赌场里（假肢人 / Louie / Billy / 背景员工 / 酒保）', bar: '环形酒吧：酒保 E164 在吧台后，Louie 与侍应在吧台前' }
  const sct = sc.map((s, i) => { const d = `/tmp/cs_sc${i}.png`; const k = s.endsWith('bar.png') ? 'bar' : 'scene'; spawnSync('convert', [s, '+repage', '-gravity', 'south', '-background', '#120806', '-splice', '0x44', '-gravity', 'southwest', ...font, '-fill', '#f3e6c8', '-pointsize', '26', '-annotate', '+20+8', lab[k], d]); return d })
  if (sct.length) spawnSync('convert', [...sct, '-append', '-quality', '86', 'reports/casino/staff-in-scene.jpg'])
  console.log('sheet done')
}
