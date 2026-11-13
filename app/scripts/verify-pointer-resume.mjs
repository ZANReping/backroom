import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('../', import.meta.url))
const baseline = process.argv.includes('--before')
const touch = process.argv.includes('--touch')
const label = baseline ? 'before' : touch ? 'touch' : 'desktop'
const out = path.join(app, 'reports/pointer-resume-20261112', label)
mkdirSync(out, { recursive: true })
const profile = path.join(out, 'qa-' + Date.now() + '-' + process.pid)
mkdirSync(profile)

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port
      socket.close(() => resolve(port))
    })
  })
}

const port = await freePort()
const cdp = await freePort()
const base = 'http://127.0.0.1:' + port
const report = { label, port, cdp, checks: [], states: [], errors: [], warnings: [], requests: [] }
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const pending = new Map()
let server, browser, ws, serial = 0, serverLog = ''

async function waitFor(test, label, timeout = 120000) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeout) {
    if (report.errors.length) throw Error('Page error while waiting for ' + label)
    try {
      const value = await test()
      if (value) return value
    } catch (error) { lastError = error }
    await sleep(80)
  }
  throw Error('Timeout ' + label + (lastError ? ': ' + lastError : ''))
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++serial
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(Error('CDP timeout ' + method))
    }, 90000)
    pending.set(id, { resolve, reject, timer })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails))
  return r.result.value
}

async function screenshot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(path.join(out, name + '.png'), Buffer.from(data, 'base64'))
}

const snapshot = () => evaluate('({lock:!!document.pointerLockElement,raw:document.querySelector("canvas[data-mouse-input]")?.dataset.mouseInput,look:window.__look?.locked,yaw:window.__look?.yaw,paused:window.__engine?.paused,menu:!!document.querySelector(".wb-body"),focused:document.hasFocus(),active:navigator.userActivation.isActive,requests:window.pointerQA.requests.length})')
const locked = () => evaluate('document.pointerLockElement===document.querySelector("canvas[data-mouse-input]") && window.__look.locked')
const visible = selector => evaluate('!!document.querySelector(' + JSON.stringify(selector) + ')')
const hasButton = name => evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()===' + JSON.stringify(name) + ')')
const emitted = (kind, text) => evaluate('holsterApp.engine.emit(' + JSON.stringify({ kind, text }) + ')')

function check(condition, label) {
  assert.ok(condition, label)
  report.checks.push(label)
  console.log(label)
}

async function key(key, code, virtualKey) {
  const params = { key, code, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey }
  await send('Input.dispatchKeyEvent', { ...params, type: 'keyDown' })
  await send('Input.dispatchKeyEvent', { ...params, type: 'keyUp' })
}

async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

async function hit(expression) {
  await sleep(180)
  const point = await evaluate('(()=>{const el=' + expression + ';if(!el)return null;el.scrollIntoView({block:"center"});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
  assert.ok(point, 'missing click target: ' + expression)
  if (!touch) await click(point.x, point.y)
  else {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] })
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
}

const button = name => hit('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()===' + JSON.stringify(name) + ')')
const selector = name => hit('document.querySelector(' + JSON.stringify(name) + ')')
const menuLabel = name => '[...document.querySelectorAll(".menu-label")].find(b=>b.textContent.trim()===' + JSON.stringify(name) + ')'
const hasMenuLabel = name => evaluate('!!' + menuLabel(name))
const menuButton = name => hit(menuLabel(name) + '?.closest("button")')

async function waitUnlocked(isOpen, label) {
  await waitFor(async () => await isOpen() && (await snapshot()).lock === false, label)
  report.states.push({ label, ...await snapshot() })
}

async function waitRestored(label) {
  await waitFor(locked, label, 6000)
  check(await evaluate('document.querySelector("canvas[data-mouse-input]").dataset.mouseInput==="raw"'), label)
  report.states.push({ label, ...await snapshot() })
}

async function play() {
  await send('Page.navigate', { url: base + '/verifier/holster-app.html' })
  await waitFor(() => evaluate('window.holsterApp?.ready'), 'actual App')
  await waitFor(() => hasMenuLabel('继续游戏'), 'continue game menu')
  await evaluate(menuLabel('继续游戏') + '.closest("button").click()')
  await waitFor(() => hasButton('继续'), 'continue slot')
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="继续").click()')
  await waitFor(() => evaluate('holsterApp.engine.player.level===104 && !holsterApp.engine.paused && !!document.querySelector(".game-hud")'), 'game ready')
}

const beforeServer = `
  import { createServer } from 'vite'
  import { readFileSync } from 'node:fs'
  import path from 'node:path'
  const root = process.cwd(), port = Number(process.argv[1]), profile = process.argv[2]
  const original = readFileSync('.cache/pointer-resume/App.before.tsx', 'utf8')
  const plugin = { name: 'pointer-before', enforce: 'pre', load(id) {
    if (path.normalize(id.split('?')[0]) === path.join(root, 'src', 'App.tsx')) return original
  } }
  const server = await createServer({ root, plugins: [plugin], cacheDir: path.join(profile, 'vite'),
    optimizeDeps: { entries: ['verifier/holster-app.html'] }, server: { host: '127.0.0.1', port, strictPort: true, hmr: false } })
  await server.listen()
  server.printUrls()
`

const inventoryOpen = () => visible('.wb-body')
const inventoryKey = () => key('i', 'KeyI', 73)
const escape = () => key('Escape', 'Escape', 27)

try {
  const serverArgs = baseline ? ['--input-type=module', '--eval', beforeServer, String(port), profile]
    : [path.join(app, 'scripts/l11-map-server.mjs'), String(port), profile]
  server = spawn(process.execPath, serverArgs, {
    cwd: app, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) stream.on('data', data => { serverLog = (serverLog + data).slice(-24000) })
  await waitFor(async () => (await fetch(base)).ok, 'Vite')
  browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--enable-automation', '--remote-debugging-port=' + cdp, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--window-size=1920,1080', 'about:blank',
  ], { windowsHide: true, stdio: 'ignore' })
  const page = await waitFor(async () => (await (await fetch('http://127.0.0.1:' + cdp + '/json/list')).json()).find(p => p.type === 'page'), 'Chrome')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
  ws.addEventListener('message', ({ data }) => {
    const event = JSON.parse(data)
    const job = pending.get(event.id)
    if (job) {
      clearTimeout(job.timer)
      pending.delete(event.id)
      if (event.error) job.reject(Error(JSON.stringify(event.error)))
      else job.resolve(event.result)
    }
    if (event.method === 'Runtime.exceptionThrown') report.errors.push(event.params)
    if (event.method === 'Runtime.consoleAPICalled') {
      if (event.params.type === 'error') report.errors.push(event.params)
      else if (event.params.type === 'warning') report.warnings.push(event.params)
    }
    if (event.method === 'Network.responseReceived' && event.params.response.status >= 400) {
      report.requests.push({ url: event.params.response.url, status: event.params.response.status })
    }
  })
  report.command = (await send('Browser.getBrowserCommandLine')).arguments
  report.pids = { server: server.pid, browser: browser.pid }
  report.browser = await send('Browser.getVersion')
  check(report.command.includes('--headless=new') && report.command.includes('--user-data-dir=' + profile)
    && report.command.includes('--remote-debugging-port=' + cdp), 'isolated headless Chrome')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: touch ? 844 : 1920, height: touch ? 390 : 1080, deviceScaleFactor: 1, mobile: touch })
  if (touch) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: '(' + function () {
    const qa = window.pointerQA = { requests: [], events: [], failures: [], deny: false, delay: 0 }
    const native = HTMLCanvasElement.prototype.requestPointerLock
    HTMLCanvasElement.prototype.requestPointerLock = function (options) {
      qa.requests.push({ raw: options?.unadjustedMovement === true, active: navigator.userActivation.isActive, at: performance.now() })
      if (qa.deny) {
        qa.deny = false
        return Promise.reject(new DOMException('Verification rejection', 'NotAllowedError'))
      }
      const result = Promise.resolve(native.call(this, options)).catch(error => {
        qa.failures.push({ name: error.name, message: error.message })
        throw error
      })
      if (!qa.delay) return result
      const delay = qa.delay
      qa.delay = 0
      return Promise.resolve(result).then(() => new Promise(resolve => setTimeout(resolve, delay)))
    }
    for (const type of ['pointerlockchange', 'pointerlockerror']) {
      document.addEventListener(type, () => qa.events.push({ type, locked: !!document.pointerLockElement, at: performance.now() }))
    }
  }.toString() + ')()' })
  await play()
  await send('Page.bringToFront')
  check((await snapshot()).requests === 0, 'entering gameplay leaves the first capture to the player')

  if (touch) {
    await selector('[data-touch-id="backpack-top"]')
    await waitUnlocked(inventoryOpen, 'touch inventory opens')
    await selector('button.set-close[aria-label="关闭"]')
    await waitFor(async () => !await inventoryOpen(), 'touch inventory closes')
    await emitted('doc', 'meg_levels')
    await waitUnlocked(() => hasButton('放回（Esc）'), 'touch document opens')
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 12, y: 12, id: 1 }] })
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await waitFor(async () => !await hasButton('放回（Esc）'), 'touch document closes')
    check((await snapshot()).requests === 0, 'touch closes panels without asking for desktop mouse capture')
  } else {
    await click(960, 540)
    await waitRestored('native raw capture on the first canvas click')
    await inventoryKey()
    await waitUnlocked(inventoryOpen, 'inventory opens and frees the pointer')
    await screenshot('inventory')
    await inventoryKey()
    await waitFor(async () => !await inventoryOpen(), 'inventory key closes panel')
    if (baseline) {
      await sleep(300)
      const state = await snapshot()
      report.states.push({ label: 'inventory closed', ...state })
      check(!state.lock && state.requests === 1, 'original inventory close leaves the mouse unlocked')
      await screenshot('after-close')
    } else {
      await waitRestored('inventory hotkey restores raw look without a click')
      await inventoryKey()
      await waitUnlocked(inventoryOpen, 'inventory reopens')
      await selector('button.set-close[aria-label="关闭"]')
      await waitRestored('inventory close button restores raw look')
      await screenshot('after-close')

      const yaw = (await snapshot()).yaw
      for (const x of [970, 986, 1001, 1018]) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 540 })
      check(Math.abs((await snapshot()).yaw - yaw) > 0.001, 'mouse movement immediately turns the actual view')
      check(await evaluate('!holsterApp.engine.input.attackHeld && !holsterApp.engine.meleePress'), 'close click does not attack')

      await inventoryKey()
      await waitUnlocked(inventoryOpen, 'inventory opens for tab switching')
      const tabRequests = (await snapshot()).requests
      await key('m', 'KeyM', 77)
      check(await inventoryOpen() && (await snapshot()).requests === tabRequests, 'switching inventory tabs leaves the pointer free')
      await key('m', 'KeyM', 77)
      await waitRestored('map hotkey close restores raw look')

      await emitted('doc', 'meg_levels')
      await waitUnlocked(() => hasButton('放回（Esc）'), 'world document frees the pointer')
      await screenshot('document')
      await waitFor(() => evaluate('!navigator.userActivation.isActive'), 'activation expires while reading', 10000)
      const beforeEscape = (await snapshot()).requests
      const esc = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }
      await send('Input.dispatchKeyEvent', { ...esc, type: 'keyDown' })
      await waitFor(async () => !await hasButton('放回（Esc）'), 'Escape closes the document', 6000)
      check(!(await snapshot()).lock && (await snapshot()).requests === beforeEscape, 'capture waits until Escape is released')
      await send('Input.dispatchKeyEvent', { ...esc, type: 'keyUp' })
      await waitRestored('Escape restores view after the document has been open beyond transient activation')

      await key('g', 'KeyG', 71)
      await waitUnlocked(inventoryOpen, 'codex opens')
      const parentRequests = (await snapshot()).requests
      await button('文档')
      await hit('[...document.querySelectorAll(".wb-body button")].find(b=>b.textContent.includes("后室重要层级"))')
      await waitUnlocked(() => hasButton('放回（Esc）'), 'document opens inside the codex')
      await button('放回（Esc）')
      await waitFor(async () => !await hasButton('放回（Esc）'), 'inner document closes', 6000)
      check(await inventoryOpen() && (await snapshot()).requests === parentRequests, 'closing an inner document keeps the codex available')
      await selector('button.set-close[aria-label="关闭"]')
      await waitRestored('closing the codex restores raw look')

      await emitted('facility', 'meg')
      await waitUnlocked(() => hasButton('返回游戏'), 'facility interaction frees the pointer')
      await button('返回游戏')
      await waitRestored('facility return button restores raw look')

      await evaluate('import("/src/game/engine/phone.ts").then(({phoneState})=>{const e=holsterApp.engine;phoneState(e.player).docked=false;e.addItem("phone")})')
      await key('p', 'KeyP', 80)
      await waitUnlocked(() => visible('[data-phone-overlay]'), 'phone frees the pointer')
      await key('p', 'KeyP', 80)
      await waitRestored('phone key close restores raw look')

      await evaluate('document.exitPointerLock()')
      await waitFor(async () => !(await snapshot()).lock, 'explicit unlock')
      const released = (await snapshot()).requests
      await sleep(250)
      check((await snapshot()).requests === released, 'release outside a panel does not schedule a new lock')
      await escape()
      await waitUnlocked(() => visible('.pause-panel'), 'pause opens')
      await menuButton('设置')
      await waitUnlocked(() => visible('button[aria-label="关闭设置"]'), 'pause opens settings')
      await selector('button[aria-label="关闭设置"]')
      await waitUnlocked(() => visible('.pause-panel'), 'settings closes back to pause')
      check((await snapshot()).requests === released, 'returning to a parent menu does not capture')
      await menuButton('继续')
      await waitRestored('pause resume restores raw look')

      await inventoryKey()
      await waitUnlocked(inventoryOpen, 'inventory opens before simulated denial')
      const beforeDeny = (await snapshot()).requests
      await evaluate('pointerQA.deny=true')
      await inventoryKey()
      await waitFor(async () => !await inventoryOpen(), 'denied capture still closes the inventory')
      await sleep(250)
      const denied = await snapshot()
      check(!denied.lock && !denied.look && denied.requests === beforeDeny + 1, 'denied restoration leaves controls unlocked and does not loop')
      await click(960, 540)
      await waitRestored('manual capture still works after denial')

      await inventoryKey()
      await waitUnlocked(inventoryOpen, 'inventory opens before an in-flight request')
      await evaluate('pointerQA.delay=1200')
      await inventoryKey()
      await waitFor(async () => (await snapshot()).raw === 'pending', 'delayed confirmation')
      await inventoryKey()
      await waitUnlocked(inventoryOpen, 'reopening while capture is pending releases the pointer')
      await sleep(1300)
      check(!(await snapshot()).lock && !(await snapshot()).look, 'late confirmation cannot capture an open panel')
      await inventoryKey()
      await waitRestored('return after a late request restores raw look')

      await evaluate('(() => { const e = holsterApp.engine; const crate = { kind: "crate", x: e.player.x + 0.9, y: e.player.y - 0.5, w: 1, h: 1, solid: false, data: { sid: -789, lootItems: ["canned"] } }; e.map.structures.push(crate); e.finishSearch(crate) })()')
      await waitFor(() => visible('.loot-panel'), 'real loot panel opens', 6000)
      check(await locked(), 'opening a nonmodal loot panel keeps the active view')
      await inventoryKey()
      await waitUnlocked(inventoryOpen, 'inventory opens over the loot panel')
      const withLoot = (await snapshot()).requests
      await inventoryKey()
      await waitFor(async () => !await inventoryOpen() && await visible('.loot-panel'), 'inventory returns to the loot panel', 6000)
      check(!(await snapshot()).lock && (await snapshot()).requests === withLoot, 'closing inventory leaves the open loot panel available')
      await selector('.loot-leave')
      await waitRestored('leaving the last loot panel restores raw look')

      await emitted('landmark', 'el3a')
      await waitUnlocked(() => hasButton('前往 办公区EL3A →'), 'outpost landmark opens')
      const beforeEntry = (await snapshot()).requests
      await button('前往 办公区EL3A →')
      await waitFor(() => evaluate('holsterApp.engine.transition!==null'), 'outpost transition starts', 6000)
      check(!(await snapshot()).lock && (await snapshot()).requests === beforeEntry, 'game does not capture during an outpost transition')
      await waitFor(() => evaluate('holsterApp.engine.player.level===105 && !holsterApp.engine.paused'), 'outpost ready')
      await waitRestored('raw look resumes when the outpost is playable')

      await evaluate('document.exitPointerLock()')
      await waitFor(async () => !(await snapshot()).lock, 'unlock before pause', 6000)
      await escape()
      await waitUnlocked(() => visible('.pause-panel'), 'pause opens before leaving the game')
      const beforeTitle = (await snapshot()).requests
      await menuButton('保存并退出到标题')
      await waitFor(() => hasMenuLabel('继续游戏'), 'returns to title')
      check(!(await snapshot()).lock && (await snapshot()).requests === beforeTitle, 'returning to title does not capture')
    }
  }

  report.pointer = await evaluate('pointerQA')
  check(report.pointer.requests.every(r => r.raw), 'every capture requests unadjusted movement')
  check(report.errors.length === 0, 'no browser runtime errors')
  check(report.requests.every(r => r.url.endsWith('/favicon.ico')), 'no missing game resources')
  report.ok = true
} catch (error) {
  report.ok = false
  report.failure = String(error)
  console.error(error)
  process.exitCode = 1
  try {
    report.failureState = await snapshot()
    report.pointer = await evaluate('pointerQA')
    await screenshot('failure')
  } catch {}
} finally {
  if (ws?.readyState === 1) {
    try { await send('Browser.close') } catch {}
    ws.close()
  }
  for (const child of [browser, server]) {
    if (child?.pid && child.exitCode === null) {
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    }
  }
  await sleep(650)
  if (existsSync(profile) && realpathSync(profile).startsWith(realpathSync(out) + path.sep)) {
    rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
  report.cleanup = { profileRemoved: !existsSync(profile) }
  writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(out, 'server.log'), serverLog)
  console.log(JSON.stringify({ ok: report.ok, label, checks: report.checks.length, out }))
}
