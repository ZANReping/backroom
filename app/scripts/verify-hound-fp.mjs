// 猎犬 E8 扑倒压制：游戏本体（verifier/hound-pin-app.html = 生产 App + 内存存档）第一人称实机截图。
// 用法：node scripts/verify-hound-fp.mjs [--level=0] [--gif] [--held=类型] [--label=名字]
// 输出 reports/hound/fp/<label>/{1-hit,2-bite,3-half,4-stagger}.png、state.json，--gif 时另存逐帧 frames/NNN.png。
// 同时只开一个浏览器（端口 3496 vite / 9496 CDP），结束按 pid 关闭。无头 SwiftShader 必须 cpu=1。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d
const level = Number(arg('level', 0)), gif = process.argv.includes('--gif'), held = arg('held', ''), label = arg('label', `l${level}`)
const W = Number(arg('w', 1280)), H = Number(arg('h', 720)), FPS = Number(arg('fps', 15)), K = 30 / FPS // 步数按 30 fps 写，K 倍压缩
const out = `reports/hound/fp/${label}/`, port = '9496', base = 'http://127.0.0.1:3496'
mkdirSync(out, { recursive: true }); if (gif) { rmSync(out + 'frames', { recursive: true, force: true }); mkdirSync(out + 'frames') }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const up = async () => { try { return (await fetch(base + '/verifier/hound-pin-app.html')).ok } catch { return false } }
let vite = null
if (!(await up())) { vite = spawn('npx', ['vite', '--port', '3496', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true, env: { ...process.env, L0_VERIFY: '1' } }); for (let i = 0; i < 240 && !(await up()); i++) await sleep(500) }
const profile = `${process.cwd()}/.cache/hd-fp-qa`
rmSync(profile, { recursive: true, force: true })
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--mute-audio', 'about:blank'], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'vite pid', vite?.pid)
const errors = [], res = { level, held, label, shots: {} }
const t0 = Date.now(), log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(1) + 's', ...a)
try {
  let page
  for (let i = 0; i < 240 && !page; i++) { await sleep(250); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 600)) } if (r.method === 'Runtime.consoleAPICalled' && r.params.type === 'error') { const m = r.params.args?.map((a) => a.value ?? a.description).join(' '); errors.push(m); console.log('error', String(m).slice(0, 400)) } const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; const t = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout ' + method)) }, 900000); pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v) }, reject: (e) => { clearTimeout(t); reject(e) } }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 800)); return r.result?.value }
  const wait = async (expr, what, ms = 900000) => { const s = Date.now(); while (Date.now() - s < ms) { try { const v = await ev(expr); if (v) return v } catch (e) { if (!String(e).includes('Cannot read')) console.log('wait', what, String(e).slice(0, 200)) } await sleep(400) } throw Error('超时：' + what) }
  const shot = async (name) => { writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64')); const st = await ev('hdPin.state()'); res.shots[name] = st; log('shot', name, JSON.stringify(st)) }
  let fi = 0
  const frame = async () => { if (gif) writeFileSync(out + `frames/${String(fi++).padStart(3, '0')}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })).data, 'base64')) }
  const steps = async (n0, pred = 'false') => { const n = Math.max(1, Math.round(n0 / K)); for (let i = 0; i < n; i++) { if (await ev(`!!(${pred})`)) return i; await ev('hdPin.step(1)'); await frame() } return n }
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: `${base}/verifier/hound-pin-app.html?cpu=1&fps=${FPS}&level=${level}${held ? '&held=' + held : ''}` })
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('继续游戏'))", 'title'); log('title')
  await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('继续游戏')).click()")
  await wait("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='继续')", 'slot')
  await ev("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='继续').click()")
  await wait('window.hdPin?.ready', 'level ready'); log('in level')
  await sleep(1500)
  res.aim = await ev('hdPin.aim()'); log('aim', JSON.stringify(res.aim))
  await ev('hdPin.settle(3)')
  await ev(`hdPin.free()`); await sleep(3000) // 让世界 / 光照稳定
  await ev('hdPin.settle(2)'); await shot('0-before')
  res.spawn = await ev('hdPin.spawn(2.6)'); log('spawn', JSON.stringify(res.spawn))
  const toPin = await steps(90, 'hdPin.state().pinned'); log('pinned after', toPin)
  if (!(await ev('hdPin.state().pinned'))) throw Error('猎犬没有扑倒玩家')
  await steps(6); await ev('hdPin.settle(2)'); await shot('1-hit') // 扑中后约 0.2 s：扑击→压住的交叉淡入刚过，脸已抬起朝向镜头，扑中红闪还在
  // 等它自然咬下一口（每 1 s 一口，前 0.28 s 蓄力张嘴、后仰），咬中那一步后再走一步：扑咬前探 + 红闪
  await steps(40, 'hdPin.hound.hd.pinT > 0.5 && hdPin.state().overlay?.bite > 0.95'); await steps(2); await ev('hdPin.settle(2)'); await shot('2-bite')
  await steps(14)
  for (let i = 0; i < 5; i++) { await ev('engine=hdPin.engine;engine.input.interact=true'); await steps(2); await ev('hdPin.engine.input.interact=false'); await steps(2) }
  await ev('hdPin.settle(2)'); await shot('3-half')
  for (let i = 0; i < 12 && (await ev('hdPin.state().pinned')); i++) { await ev('hdPin.engine.input.interact=true'); await steps(2); await ev('hdPin.engine.input.interact=false'); await steps(2) }
  await steps(8); await ev('hdPin.settle(2)'); await shot('4-stagger')
  if (gif) await steps(20)
  await send('Browser.close').catch(() => {})
  ws.close()
} catch (e) { res.failure = String(e); console.error(e) } finally {
  res.errors = errors; writeFileSync(out + 'state.json', JSON.stringify(res, null, 2) + '\n')
  try { process.kill(chrome.pid, 'SIGTERM') } catch { /* 已退出 */ }
  if (vite) try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ }
  log('done', res.failure ?? 'ok')
}
