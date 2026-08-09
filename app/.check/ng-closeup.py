# Nguithr 特写目检：蜘蛛冻结在玩家正前方 1.4m，手电照亮，正面/侧面特写
import sys
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)))
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

    # 爆开并降下（同前），然后冻结并把蜘蛛摆到玩家正前方 1.4m
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player
      p.hp = 100000; p.sanity = 100; p.flashlight = true; p.battery = 100
      eng.devSpawnEntity('nguithr', 2)
      window.__ng = eng.map.entities[eng.map.entities.length - 1]
      const e = window.__ng
      p.x = e.x; p.y = e.y // 触发爆开
    }''')
    for i in range(40):
        pg.wait_for_timeout(300)
        st = pg.evaluate('''() => ({ hidden: window.__ng.hidden, state: window.__ng.state })''')
        if st['state'] == 'chase':
            break
    print('进入追逐:', st)

    # 冻结：速度 0；蜘蛛摆到开阔处玩家正前 1.4m，面向玩家
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__ng
      eng.webbedT = 0
      e.def = { ...e.def, speed: 0 }
      p.x = e.x; p.y = e.y // 保持同格让 facing 追玩家
    }''')
    pg.wait_for_timeout(800)
    # 特写 1：玩家在蜘蛛 facing 正前方 1.4m（应看到头胸/复眼/螯牙正面）
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__ng
      const fx = Math.cos(e.facing), fy = Math.sin(e.facing)
      p.x = e.x + fx * 1.4; p.y = e.y + fy * 1.4
      p.facing = Math.atan2(e.y - p.y, e.x - p.x)
      window.__look.yaw = Math.atan2(-(e.y - p.y), -(e.x - p.x))
      window.__look.pitch = -0.28
      eng.webbedT = 0
    }''')
    pg.wait_for_timeout(400)
    pg.evaluate('window.__engine.webbedT = 0')
    pg.screenshot(path='.check/ng-front.png')
    # 特写 2：侧面（应看到 6 腿侧列 + 后拖腹部）
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__ng
      const fx = Math.cos(e.facing + Math.PI / 2), fy = Math.sin(e.facing + Math.PI / 2)
      p.x = e.x + fx * 1.4; p.y = e.y + fy * 1.4
      window.__look.yaw = Math.atan2(-(e.y - p.y), -(e.x - p.x))
      window.__look.pitch = -0.28
      eng.webbedT = 0
    }''')
    pg.wait_for_timeout(400)
    pg.evaluate('window.__engine.webbedT = 0')
    pg.screenshot(path='.check/ng-side.png')
    b.close()

print('console errors:', len(errors))
for e in errors[:5]:
    print('  -', e[:200])
