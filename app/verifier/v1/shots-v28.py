#!/usr/bin/env python3
# v28：53 件原创像素画物品图标验证——背包全量图标 / 容器搜刮面板 / console 无报错、贴图无 404
# 桌面 1280×800；dist 静态服务（根路径）
# 用法：python3 verifier/v1/shots-v28.py [输出子目录名]
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'verifier', 'runs', sys.argv[1] if len(sys.argv) > 1 else 'shots-v28')
os.makedirs(OUT, exist_ok=True)
DIST = os.path.join(ROOT, 'dist')


def wait_port(port: int, timeout: float = 20):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


def run(tag: str):
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        pg = ctx.new_page()
        pg.set_default_timeout(90000)
        errs, fails = [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('response', lambda r: fails.append(f'{r.status} {r.url}') if r.status >= 400 else None)

        pg.goto(BASE, wait_until='domcontentloaded')
        pg.locator('text=开始游戏').wait_for(state='attached')
        pg.wait_for_timeout(1000)
        pg.locator('text=开始游戏').dispatch_event('click')
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true')
        pg.wait_for_timeout(1500)

        # 给予全部物品（背包扩容为 53 格，全部像素图标同屏可见）
        n_items = pg.evaluate('''(() => {
          const e = window.__engine, p = e.player
          // 53 件 id 清单（与 public/textures/icons/pixel/ 对齐）
          const IDS = ['almond','axe','bandage','battery','canned','capacitor','carkey','cashew','cavingsuit','chalkstub','citywater','coffee','crowbar','divemask','driedfruit','endnote','flashlight','fuse','fuyouyu','gas','gloves','glowstick','headlamp','housekey','keycard','knife','lighter','megfolder','nails','notebook','oddbook','pamphlet','pockets','presses','rabbit','rope','royalration','sedative','silverware','skeleton','squirtgun','stapler','stonekazoo','suit','tape','thingmeat','timber','uvlamp','wallpaper','warpberry','wheatgrain','wrench','xenonmarble']
          p.hotbar = new Array(7).fill(null)
          p.backpack = IDS.map((t) => ({ type: t, count: 1 }))
          e.syncPassives()
          return IDS.length
        })()''')
        assert n_items == 53, f'物品数异常: {n_items}'

        # 1) 打开背包（Tab），截图
        pg.keyboard.press('Tab')
        pg.wait_for_timeout(1500)
        stats = pg.evaluate('''(() => {
          const imgs = [...document.querySelectorAll('img')]
          const px = imgs.filter((i) => i.src.includes('textures/icons/pixel/item_'))
          const legacy = imgs.filter((i) => /textures\\/icons\\/(?!pixel\\/)[a-z]+\\.png/.test(i.src))
          const broken = px.filter((i) => !i.naturalWidth)
          const svgs = [...document.querySelectorAll('svg')].length
          return { px: px.length, pxBroken: broken.map((i) => i.src), legacy: legacy.length, svgs }
        })()''')
        pg.screenshot(path=os.path.join(OUT, f'{tag}-inventory-53pixel.png'))
        # 关闭背包：再按背包键切换关闭（Escape 会落到暂停覆盖层导致 lootPanel 不渲染）
        pg.keyboard.press('Tab')
        pg.wait_for_timeout(600)

        # 2) 容器搜刮面板（lootPanel 放入 12 件代表物品）
        # 引擎每帧校验 lootPanel 对应容器在 2.5m 半径内，否则自动关闭；
        # 且 L0 无限模式远距离传送会触发 chunk 窗口平移清空 lootPanel。
        # 因此：先传送到最近容器旁 → 等窗口稳定 → 再借用真实 sid 打开面板（并拦住距离自动关闭）
        pg.evaluate('''(() => {
          const e = window.__engine, m = e.map, p = e.player
          const sts = m.structures.filter((x) => x.data && x.data.sid != null)
          if (!sts.length) throw new Error('当前层级无可搜刮容器')
          sts.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))
          const st = sts[0]
          p.x = st.x + st.w / 2 + 1.6; p.y = st.y + st.h / 2
          window.__lootSid = st.data.sid
        })()''')
        pg.wait_for_timeout(2000)
        pg.evaluate('''(() => {
          const e = window.__engine
          e.closeLootPanel = () => {} // 验证期间禁用距离自动关闭（截图后页面即销毁，不影响真实逻辑）
          e.lootPanel = { sid: window.__lootSid, label: '补给箱（v28 验证）', items: ['almond','canned','flashlight','crowbar','rope','keycard','cashew','royalration','headlamp','fuyouyu','notebook','xenonmarble'] }
        })()''')
        pg.wait_for_timeout(1200)
        pg.screenshot(path=os.path.join(OUT, f'{tag}-lootpanel.png'))
        loot_stats = pg.evaluate('''(() => {
          const imgs = [...document.querySelectorAll('img')]
          const px = imgs.filter((i) => i.src.includes('textures/icons/pixel/item_'))
          return { px: px.length, broken: px.filter((i) => !i.naturalWidth).length }
        })()''')
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(400)

        b.close()
        print(f'[{tag}] 背包像素图标: {stats["px"]}/53 broken={len(stats["pxBroken"])} legacyImg={stats["legacy"]} | '
              f'lootPanel 像素图标: {loot_stats["px"]} broken={loot_stats["broken"]} | '
              f'console errors: {len(errs)}, http>=400: {len(fails)}')
        for e in errs[:8]:
            print('  ERR:', e)
        for f in fails[:8]:
            print('  HTTP:', f)
        ok = (not errs and not fails and stats['px'] >= 53 and not stats['pxBroken']
              and stats['legacy'] == 0 and loot_stats['px'] >= 12 and loot_stats['broken'] == 0)
        return ok


srv = subprocess.Popen(['python3', '-m', 'http.server', '8903', '--bind', '127.0.0.1'],
                       cwd=DIST, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
BASE = 'http://127.0.0.1:8903/'
okd = False
try:
    assert wait_port(8903), 'http.server 未启动'
    okd = run('d')
finally:
    srv.terminate()
print('DESKTOP OK' if okd else 'DESKTOP FAIL')
print('done ->', OUT)
sys.exit(0 if okd else 1)
