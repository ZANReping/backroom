# 目检 Nguithr'xurh：网囊显隐 + 冻结移动后从正面/侧面截图判断模型朝向
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
      localStorage.setItem("br_settings", JSON.stringify({devMode:true}));
    ''')
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(9000)
    pg.evaluate('window.__engine.devJump(1)')
    pg.wait_for_timeout(2500)

    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player
      p.hp = 100000; p.sanity = 100; p.flashlight = true; p.battery = 100
      eng.devSpawnEntity('nguithr', 5)
      window.__ng = eng.map.entities[eng.map.entities.length - 1]
      const e = window.__ng
      window.__lookAt = (pitch) => {
        const dx = e.x - p.x, dy = e.y - p.y
        window.__look.yaw = Math.atan2(-dy, -dx)
        window.__look.pitch = pitch
        p.facing = Math.atan2(dy, dx)
      }
    }''')
    # 1) 网囊阶段：仰视天花板，手电照亮——应只见网囊不见蜘蛛
    pg.evaluate('window.__lookAt(0.55)')
    pg.wait_for_timeout(2000)
    st = pg.evaluate('''() => { const e = window.__ng; return { hidden: e.hidden, z: +e.z.toFixed(2) } }''')
    print('网囊阶段:', st)
    pg.screenshot(path='.check/ng-sac.png')

    # 2) 触发爆开并等它降下进入追逐
    pg.evaluate('''() => { const eng = window.__engine, p = eng.player, e = window.__ng; p.x = e.x; p.y = e.y }''')
    for i in range(40):
        pg.wait_for_timeout(300)
        st = pg.evaluate('''() => { const e = window.__ng; return { hidden: e.hidden, state: e.state } }''')
        if st['state'] == 'chase':
            break
    print('进入追逐:', st)

    # 3) 冻结移动（保留朝向追踪），玩家站在蜘蛛正面 2.2m —— 应看到头胸/复眼/螯牙
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__ng
      eng.webbedT = 0
      e.def = { ...e.def, speed: 0 }
      // 等半秒让 z 落地 + 朝向追到玩家
    }''')
    # 先让玩家站定一个方向让蜘蛛转过来：玩家站蜘蛛 +facing 方向
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__ng
      p.x = e.x + 2.2; p.y = e.y // 玩家在蜘蛛 +x 侧
      window.__lookAt(-0.05)
    }''')
    pg.wait_for_timeout(1500) # faceToward 追到玩家
    pg.evaluate('window.__engine.webbedT = 0; window.__lookAt(-0.05)')
    pg.wait_for_timeout(200)
    st = pg.evaluate('''() => { const e = window.__ng; return { facing: +e.facing.toFixed(2), z: +e.z.toFixed(2) } }''')
    print('正面视角（facing 应≈0）:', st)
    pg.screenshot(path='.check/ng-front.png')

    # 4) 侧面视角：玩家绕到蜘蛛左侧（+y 侧 2.2m）——应看到侧面轮廓（腹部在后、腿列侧展）
    pg.evaluate('''() => {
      const eng = window.__engine, p = eng.player, e = window.__ng
      p.x = e.x; p.y = e.y + 2.2
      window.__lookAt(-0.05)
    }''')
    pg.wait_for_timeout(1500)
    pg.evaluate('window.__engine.webbedT = 0; window.__lookAt(-0.05)')
    pg.wait_for_timeout(200)
    st = pg.evaluate('''() => { const e = window.__ng; return { facing: +e.facing.toFixed(2) } }''')
    print('侧面视角（facing 应≈+1.57）:', st)
    pg.screenshot(path='.check/ng-side.png')
    b.close()

print('console errors:', len(errors))
for e in errors[:5]:
    print('  -', e[:200])
