import sys
from playwright.sync_api import sync_playwright

PORT = 3000
with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('pageerror', lambda e: print('PAGEERROR', e))
    pg.add_init_script('''
      localStorage.clear();
      localStorage.setItem("br_settings", JSON.stringify({devMode:true, fogOfWar:false, grain:false}));
    ''')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(9000)
    pg.evaluate('window.__engine.devJump(1)')
    pg.wait_for_timeout(2500)
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player
      p.hp = 100000; p.flashlight = true; p.battery = 100
      eng.devSpawnEntity('nguithr', 2)
      window.__ng = eng.map.entities[eng.map.entities.length - 1]
      p.x = window.__ng.x; p.y = window.__ng.y
    }''')
    for i in range(40):
        pg.wait_for_timeout(300)
        st = pg.evaluate('''() => ({ hidden: window.__ng.hidden, state: window.__ng.state })''')
        if st['state'] == 'chase':
            break
    print('chase:', st)
    # 冻结 + 挪到开阔位：在玩家附近找一块前方 3m 无障碍的空地安置蜘蛛
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__ng
      eng.webbedT = 0
      e.def = { ...e.def, speed: 0 }
      // 探测：以玩家为圆心扫 16 个方向，找 devFindSpot 可用的 3m 远空位
      let best = null
      for (let k = 0; k < 16 && !best; k++) {
        const a = k * Math.PI / 8
        const s = eng.devFindSpot(p.x + Math.cos(a) * 3, p.y + Math.sin(a) * 3)
        if (s) best = s
      }
      if (best) { e.x = best.x; e.y = best.y; e.webX = best.x; e.webY = best.y }
      window.__spot = best
    }''')
    pg.wait_for_timeout(1200)
    for i in range(3):
        dump = pg.evaluate('''() => {
          const eng = window.__engine, p = eng.player, e = window.__ng
          const fx = Math.cos(e.facing), fy = Math.sin(e.facing)
          p.x = e.x + fx * 1.5; p.y = e.y + fy * 1.5
          window.__look.yaw = Math.atan2(-(e.y - p.y), -(e.x - p.x))
          window.__look.pitch = -0.25
          eng.webbedT = 0
          return { x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2),
                   hidden: e.hidden, state: e.state, facing: +e.facing.toFixed(2), spot: window.__spot }
        }''')
        print('dump:', dump)
        pg.wait_for_timeout(400)
        pg.screenshot(path=f'.check/ng-dump-{i}.png')
    # 侧面视角
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__ng
      const fx = Math.cos(e.facing + Math.PI / 2), fy = Math.sin(e.facing + Math.PI / 2)
      p.x = e.x + fx * 1.5; p.y = e.y + fy * 1.5
      window.__look.yaw = Math.atan2(-(e.y - p.y), -(e.x - p.x))
      window.__look.pitch = -0.25
      eng.webbedT = 0
    }''')
    pg.wait_for_timeout(400)
    pg.screenshot(path='.check/ng-dump-side.png')
    b.close()
