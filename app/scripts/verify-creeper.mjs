// [creeper] 爬菌（Entity 17）重制·阶段 1/2/3（阶段 3：lod / fp / spores / anim-human-lunge3 / anim-rat-drag → stage3.jpg）：无头 Chromium 截图验收（proto-creeper.html）。用法：node scripts/verify-creeper.mjs [视图名...]
// 阶段 2：anim-* 为动画网格（每格一个时刻，见 proto 的 strip 参数）；gif-* 为逐帧截图（window.__frame(t)），帧存 reports/creeper/.gif/<名>/，
// 再由 scripts/creeper-gif.py 切帧合成 reports/creeper/stage2.gif。`node scripts/verify-creeper.mjs anim` = 全部 anim-*，`gif` = 全部 gif-*。
// 输出 reports/creeper/*.png 与汇总图 stage1.jpg（ImageMagick）。同时只开一个浏览器；端口 3495（vite）/ 9495（CDP）。
// 爬菌人（10-25 修正）已改为无蒙皮的关节层级：human 走 cpu=1、humangpu 不带，两张应一致（SwiftShader 下 GPU 蒙皮会让 GPU 进程崩溃，见 qaCpuSkin.ts）。
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
const port = process.env.CRP_QA_CDP ?? '9495', out = 'reports/creeper/'
const base = process.env.CRP_QA_URL ?? 'http://127.0.0.1:3495'
mkdirSync(out, { recursive: true })
const P = (q, w = 1600, h = 620) => ['/proto-creeper.html?' + q, w, h]
const VIEWS = {
  rats: P('view=rats', 1600, 470),
  spiders: P('view=spiders', 1600, 500),
  zombie: P('view=zombie', 800, 800),
  human: P('view=human&cpu=1', 1800, 700),
  humangpu: P('view=human', 1800, 700), // 无 cpu=1：爬菌人已无蒙皮，应与 human 一致（脚本比对像素差）
  humanclose: P('view=humanclose&cpu=1', 900, 700),
  humanlow: P('view=humanclose&cpu=1&cam=2.3,0.05,0.12&look=0,0.12,0.1&title=' + encodeURIComponent('贴地侧视 · 腰下无残留'), 900, 700), // 贴地侧视：腰下不能有任何东西
  compare: P('view=compare&cpu=1', 1800, 650),
  humantop: P('view=humanclose&cpu=1&cam=0.32,0.52,0.62&look=0.03,0.35,0.45&title=' + encodeURIComponent('头顶增生团特写'), 900, 700), // 头顶增生团特写
  arms: P('view=arms', 1600, 560),
  ball: P('view=ball', 900, 500),
  'rats-close': P('view=rats&cam=0.9,0.35,0.75&look=0.62,0.07,0', 1000, 700),
  'spiders-close': P('view=spiders&cam=1.45,0.55,1.25&look=0.95,0.12,0', 1000, 700),
  headside: P('view=humanclose&cpu=1&hidearm=L&cam=-0.66,0.24,0.34&look=0.0,0.31,0.38&title=' + encodeURIComponent('头颈左侧下方（隐藏左臂）· 颈椎与筋腱'), 900, 700),
  headfront: P('view=humanclose&cpu=1&cam=0.1,0.35,0.98&look=0.005,0.31,0.45&title=' + encodeURIComponent('正脸 · 骷髅化'), 900, 700),
  // ---- 阶段 2 动画网格（1 阶 / 4 阶各一行，每行把一个循环均分 6 帧） ----
  'anim-rat-walk': P('anim=1&host=rat&clip=walk&stages=1,4&strip=6&t=0', 1800, 560),
  'anim-spider-walk': P('anim=1&host=spider&clip=walk&stages=1,4&strip=6&t=0', 1800, 560),
  'anim-rat-attack': P('anim=1&host=rat&clip=attack&stages=1,4&strip=6&t=0', 1800, 560),
  'anim-spider-attack': P('anim=1&host=spider&clip=attack&stages=1,4&strip=6&t=0', 1800, 560),
  'anim-host-twitch': P('anim=1&host=rat&clip=twitch&stages=2,4&strip=6&t=0', 1800, 560),
  'anim-spider-twitch': P('anim=1&host=spider&clip=twitch&stages=2,4&strip=6&t=0', 1800, 560),
  'anim-host-idle': P('anim=1&host=spider&clip=idle&stages=1,4&strip=6&t=0', 1800, 560),
  'anim-rat-death': P('anim=1&host=rat&clip=death&stages=4&strip=6&t=0&cam=0.15,0.45,0.85&look=0.02,0.04,0', 1800, 320),
  'anim-spider-death': P('anim=1&host=spider&clip=death&stages=4&strip=6&t=0', 1800, 320),
  'anim-human-crawl': P('anim=1&host=human&clip=crawl&strip=6&t=0', 1800, 340),
  'anim-human-idle': P('anim=1&host=human&clip=idle&strip=6&t=0&cam=0.75,0.5,1.35&look=0,0.25,0.35', 1800, 340),
  'anim-human-lunge': P('anim=1&host=human&clip=lunge&strip=6&t=0', 1800, 340),
  'anim-human-scream': P('anim=1&host=human&clip=scream&strip=6&t=0', 1800, 340),
  'anim-human-death': P('anim=1&host=human&clip=death&strip=6&t=0', 1800, 340),
  'anim-hand': P('anim=1&host=hand&clip=handTwitch&stages=3,4&strip=6&t=0', 1800, 560),
  'zombie-far': P('view=zombie&cam=1.0,-0.02,1.1', 800, 800),
  // ---- 阶段 3 ----
  lod: P('view=lod', 1800, 1050), // LOD 三档对比（尸鼠 4 阶 / 蛛形纲 4 阶 / 爬菌人 × 近 / 中 / 远）
  fp: P('view=fp&t=0.62', 1800, 820), // 第一人称手臂接入后（与 renderer 同一个 CreepViewHands + buildViewmodel）
  'fp-b': P('view=fp&t=1.55', 1800, 820), // 另一时刻的痉挛
  spores: P('view=spores', 800, 500), // 孢子团
  'anim-human-lunge3': P('anim=1&host=human&clip=lunge&strip=6&t=0&cam=2.6,0.75,1.0&look=0,0.15,0.55', 1800, 340), // 扑击带根位移
  'anim-rat-drag': P('anim=1&host=rat&clip=walk&stages=4&strip=6&t=0&cam=0.15,0.5,0.95&look=0.0,0.04,0', 1800, 320), // 拖腿脚底锁定
}
// ---- 阶段 2 GIF 段：逐帧截图（同一视口尺寸，便于拼接） ----
const GW = 640, GH = 320
const GIFS = {
  'gif-rat-walk': { q: 'anim=1&host=rat&clip=walk&stages=1,4&t=0', dur: 5.0, fps: 8 },
  'gif-spider-walk': { q: 'anim=1&host=spider&clip=walk&stages=1,4&t=0', dur: 5.0, fps: 8 },
  'gif-human-crawl': { q: 'anim=1&host=human&clip=crawl&t=0&move=1&cam=1.5,0.5,0.75&look=0,0.16,0.25', dur: 3.2, fps: 10 },
  'gif-human-idle': { q: 'anim=1&host=human&clip=idle&t=0&cam=0.85,0.48,1.25&look=0,0.24,0.35', dur: 5.0, fps: 8 },
  'gif-human-lunge': { q: 'anim=1&host=human&clip=lunge&t=0&cam=1.8,0.6,0.9&look=0,0.18,0.35', dur: 1.6, fps: 12 },
  'gif-hand': { q: 'anim=1&host=hand&clip=handTwitch&stages=3,4&t=0', dur: 2.4, fps: 10 },
}
for (const [k, g] of Object.entries(GIFS)) VIEWS[k] = P(g.q, GW, GH)
VIEWS['game-l2'] = ['/', 1280, 800] // 阶段 3：真实游戏里 L2 的感染体 / 爬菌人 + 4 阶第一人称手臂（gameShot）
let want = process.argv.slice(2).length ? process.argv.slice(2) : ['rats', 'spiders', 'zombie', 'human', 'arms']
want = want.flatMap((w) => (w === 'anim' ? Object.keys(VIEWS).filter((k) => k.startsWith('anim-')) : w === 'gif' ? Object.keys(GIFS) : [w]))
const up = async () => { try { return (await fetch(base + '/proto-creeper.html')).ok } catch { return false } }
let vite = null
if (!(await up())) {
  vite = spawn('npx', ['vite', '--port', '3495', '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore', detached: true })
  for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500))
}
const chrome = spawn(process.env.CHROME ?? '/workspace/work/.pw-libs/chromium.sh', ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${process.cwd()}/.cache/crp-qa`, '--enable-automation', '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox', '--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', 'about:blank'], { stdio: 'ignore' })
console.log('chrome pid', chrome.pid, 'vite pid', vite?.pid)
const errors = [], results = {}
try {
  let page
  for (let i = 0; i < 240 && !page; i++) { await new Promise((r) => setTimeout(r, 250)); try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((p) => p.type === 'page') } catch { /* 等浏览器起来 */ } }
  if (!page) throw Error('QA 浏览器未启动')
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }))
  let seq = 0; const pending = new Map()
  ws.addEventListener('message', (e) => { const r = JSON.parse(e.data); if (r.method === 'Runtime.exceptionThrown') { errors.push(r.params.exceptionDetails); console.log('EXC', JSON.stringify(r.params.exceptionDetails).slice(0, 800)) }; if (r.method === 'Runtime.consoleAPICalled' && (r.params.type === 'error' || r.params.type === 'warning')) { const m = r.params.args?.map((a) => a.value ?? a.description).join(' '); if (r.params.type === 'error') errors.push(m); console.log(r.params.type, String(m).slice(0, 600)) }; const p = pending.get(r.id); if (p) { pending.delete(r.id); r.error ? p.reject(r.error) : p.resolve(r.result) } })
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true }); return r.result?.value }
  await send('Runtime.enable'); await send('Page.enable')
  const ver = await send('Browser.getVersion'), cl = await send('Browser.getBrowserCommandLine')
  if (!ver.userAgent.includes('HeadlessChrome') || !cl.arguments.includes('--headless=new')) throw Error('不是本脚本的无头 QA 浏览器')
  const until = async (expr, label, ms = 180000) => { const t0 = Date.now(); for (;;) { try { if (await ev(`Boolean(${expr})`)) return } catch { /* 页面切换中 */ } if (Date.now() - t0 > ms) throw Error('超时：' + label); await new Promise((r) => setTimeout(r, 300)) } }
  const evA = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 600)); return r.result?.value }
  /** 阶段 3 实机：写一个商人之家存档 → 继续游戏 → devJump 到 L2 → 身边放 4 阶尸鼠 / 蛛形纲感染体、爬菌人、僵尸蜘蛛位置不管 → 病程 4 阶 → 截图 */
  if (want.includes('game-l2')) {
    try {
      await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
      const init = await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,dynamicExposure:false,lightMode:'classic',textureQuality:1,sceneLightLimit:12,shadowQuality:1,loadingBudgetMs:8,chunkBudgetMs:4,devMode:true,muted:true,grain:false,shake:false}))` })
      await send('Page.navigate', { url: base + '/' })
      await until(`window.__engine && document.querySelector('.title-menu')`, '标题界面', 240000)
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init.identifier })
      await evA(`(async()=>{const {snapshot}=await import('/src/game/engine/save.ts');const s=snapshot(__engine);localStorage.setItem('br_save_slot1',JSON.stringify({...s,seed:424242,level:102,mapSeed:424242,bntgLayout:4,savedAt:Date.now(),player:{...s.player,level:102,x:335.2,y:153.2,z:0,floor:0}}))})()`)
      await send('Page.reload'); await until(`document.querySelector('.title-menu')`, '存档标题', 240000)
      await new Promise((r) => setTimeout(r, 1500))
      console.log('标题菜单：', await evA(`[...document.querySelectorAll('.menu-btn,button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,20).join(' | ')`))
      await until(`[...document.querySelectorAll('.menu-btn')].some(b=>b.textContent.includes('继续游戏'))`, '继续游戏按钮', 30000)
      await evA(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('继续游戏'));if(!b)throw Error('没有继续游戏');b.click()})()`)
      await new Promise((r) => setTimeout(r, 800))
      await evA(`(()=>{const b=[...document.querySelectorAll('.hud-panel button')].find(b=>b.textContent.trim()==='继续'&&b.parentElement.textContent.includes('存档槽 1'));if(b)b.click()})()`)
      await until(`__engine.player.level===102 && !__engine.paused`, '进入游戏', 300000)
      await evA(`(()=>{__engine.devJump(2);return true})()`)
      await until(`__engine.player.level===2 && !__engine.paused && __renderer.isNearWorldReady(__engine)`, '进入 L2', 300000)
      await evA(`(()=>{const e=__engine;e.dev.god=true;e.dev.frozenAI=true;[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='▾')?.click();return true})()`)
      // 视线方向上找一段可走的走廊，放 3 只感染体 + 1 只爬菌人
      const placed = await evA(`(async()=>{const C=await import('/src/game/engine/creeperAI.ts');const {walkableAt}=await import('/src/game/world/mapgen.ts');const e=__engine,p=e.player,m=e.map;let best=null;for(const [ux,uy] of [[0,1],[0,-1],[1,0],[-1,0]]){let k=0;while(k<7&&walkableAt(m,Math.floor(p.x+ux*(k+1)),Math.floor(p.y+uy*(k+1)),0))k++;if(!best||k>best.k)best={ux,uy,k}}const {ux,uy}=best;const at=(d,s)=>({x:p.x+ux*d+(-uy)*s,y:p.y+uy*d+ux*s});const add=(h,st,d,s)=>{const q=at(d,s);if(!walkableAt(m,Math.floor(q.x),Math.floor(q.y),0)){q.x=p.x+ux*d;q.y=p.y+uy*d}const c=C.spawnCreeper(h,st,q.x,q.y,p.z,2);c.facing=Math.atan2(p.y-q.y,p.x-q.x);m.entities.push(c);return c};add('rat',4,1.6,-0.35);add('arachnid',4,2.3,0.4);add('rat',2,3.2,-0.3);add('human',5,4.6,0.1);__look.yaw=Math.atan2(-ux,-uy);__look.pitch=-0.32;const r=e.creepRun;r.infected=true;r.courseT=C.CR.STAGE_DUR[1]+C.CR.STAGE_DUR[2]+C.CR.STAGE_DUR[3]+5;r.stageShown=4;e.handsStowed=false;return best})()`)
      console.log('game placed', JSON.stringify(placed))
      await new Promise((r) => setTimeout(r, 9000))
      await until(`[...__engine.map.entities].filter(q=>q.def.type==='creeper').every(q=>!q.presentationPending)`, '感染体模型就绪', 420000).catch(() => console.log('模型就绪等待超时，继续'))
      await new Promise((r) => setTimeout(r, 2500))
      results['game-l2'] = { info: await evA(`({creep:__engine.map.entities.filter(q=>q.def.type==='creeper').map(q=>({h:q.cr?.host,st:q.cr?.stage,pend:!!q.presentationPending})),vignette:!!document.querySelector('[data-creep-vignette]'),hand:__engine.creepRun.infected})`) }
      writeFileSync(out + 'game-l2.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      console.log('game-l2', JSON.stringify(results['game-l2']))
    } catch (err) { console.log('实机截图失败：', String(err).slice(0, 300)); results['game-l2'] = { error: String(err).slice(0, 300) } }
    want = want.filter((n) => n !== 'game-l2')
  }
  for (const name of want) {
    const [path, w, h] = VIEWS[name]
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    await send('Page.navigate', { url: base + path })
    let ok = false
    for (let i = 0; i < 600 && !ok; i++) { await new Promise((r) => setTimeout(r, 200)); ok = !!(await ev(`location.href===${JSON.stringify(base + path)} && window.__ready===true`)) }
    await new Promise((r) => setTimeout(r, 300))
    results[name] = { ready: ok, info: await ev('window.__info') }
    if (GIFS[name]) {
      // 逐帧：window.__frame(t) 同步渲染，再截图
      const g = GIFS[name], dir = out + '.gif/' + name + '/', n = Math.round(g.dur * g.fps)
      mkdirSync(dir, { recursive: true })
      for (let i = 0; i < n; i++) {
        await ev(`window.__frame(${(i / g.fps).toFixed(4)})`)
        writeFileSync(dir + String(i).padStart(3, '0') + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
      }
      results[name].frames = n
      console.log(name, n, 'frames')
      continue
    }
    writeFileSync(out + name + '.png', Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    console.log(name, JSON.stringify(results[name]))
  }
  await send('Browser.close').catch(() => {})
  ws.close()
} finally {
  let prev = {}
  try { if (existsSync(out + 'verify-result.json')) prev = JSON.parse(readFileSync(out + 'verify-result.json', 'utf8')).results ?? {} } catch { /* 忽略 */ }
  writeFileSync(out + 'verify-result.json', JSON.stringify({ results: { ...prev, ...results }, errors }, null, 2) + '\n')
  try { chrome.kill('SIGKILL') } catch { /* 已退出 */ }
  if (vite) { try { process.kill(-vite.pid, 'SIGTERM') } catch { /* 已退出 */ } }
  if (errors.length) console.log('浏览器错误：', JSON.stringify(errors).slice(0, 3000))
}
// 汇总图 stage1.jpg：尸鼠 / 蛛形纲 0–4 阶各一整行；僵尸蜘蛛特写 + 爬菌人三视图一行；第一人称手臂 0–4 阶一行
const im = (args) => spawnSync('convert', args, { stdio: 'inherit' }).status
const SHEET = ['rats', 'spiders', 'zombie', 'human', 'arms']
if (SHEET.every((n) => existsSync(out + n + '.png'))) {
  const t = out + '.row3.png'
  im([out + 'zombie.png', '-resize', 'x700', out + 'human.png', '+append', '-resize', '1600x', t])
  const r = im([out + 'rats.png', out + 'spiders.png', t, out + 'arms.png', '-background', '#0c0b0a', '-gravity', 'north', '-splice', '0x6', '-append', '-quality', '88', out + 'stage1.jpg'])
  console.log('stage1.jpg', r === 0 ? 'ok' : 'convert 失败 ' + r)
}
// 爬菌人专用汇总 creeper-fix.jpg：三视图 / 与 4 阶手臂对比 / 脸部特写 + 贴地侧视
// 阶段 1 收尾（10-25）：脸部一行改为 正脸（骷髅化）/ 头颈侧下方（颈椎与筋腱）/ 贴地侧视
if (['human', 'compare', 'headfront', 'headside', 'humanlow'].every((n) => existsSync(out + n + '.png'))) {
  const t = out + '.rowface.png'
  im([out + 'headfront.png', out + 'headside.png', out + 'humanlow.png', '+append', '-resize', '1800x', t])
  const r = im([out + 'human.png', out + 'compare.png', t, '-background', '#0c0b0a', '-gravity', 'north', '-splice', '0x6', '-append', '-quality', '88', out + 'creeper-fix.jpg'])
  console.log('creeper-fix.jpg', r === 0 ? 'ok' : 'convert 失败 ' + r)
}
// 阶段 3 汇总 stage3.jpg：LOD 三档 / 第一人称各阶段接入后 / 扑击根位移 + 拖腿锁定 + 孢子团
if (['lod', 'fp', 'anim-human-lunge3', 'anim-rat-drag', 'spores'].every((n) => existsSync(out + n + '.png'))) {
  const t = out + '.row3s.png'
  im([out + 'anim-human-lunge3.png', out + 'anim-rat-drag.png', '-append', '-resize', '1400x', t])
  im([t, out + 'spores.png', '-gravity', 'center', '-background', '#0c0b0a', '+append', '-resize', '1800x', t])
  const rows = [out + 'lod.png', out + 'fp.png', t]
  if (existsSync(out + 'game-l2.png')) { const g = out + '.rowgame.png'; im([out + 'game-l2.png', '-resize', '1280x', '-gravity', 'center', '-background', '#0c0b0a', '-extent', '1800x800', g]); rows.push(g) } // 实机 L2（4 阶手臂 + 血红暗角）
  const r = im([...rows, '-background', '#0c0b0a', '-gravity', 'north', '-splice', '0x6', '-append', '-quality', '86', out + 'stage3.jpg'])
  console.log('stage3.jpg', r === 0 ? 'ok' : 'convert 失败 ' + r)
}
if (existsSync(out + 'human.png') && existsSync(out + 'humangpu.png')) {
  const c = spawnSync('compare', ['-metric', 'AE', '-fuzz', '3%', out + 'human.png', out + 'humangpu.png', 'null:'], { encoding: 'utf8' })
  console.log('human vs humangpu 差异像素（fuzz 3%）:', (c.stderr || c.stdout).trim())
}
