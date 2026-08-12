# v54 设计模式第四批实机验证：
#   任务1：WASD/方向键平移画布 + 鼠标中键拖平移（不清除选中）
#   任务2：玩家设计 JSON 落地后的 alpha / jerry 据点实机截图（devJumpOutpost）
# 用法：先启动 npm run dev（:3000），再 python .check/v54-design3.py
import sys
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []
fails = []

def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        fails.append(msg)

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    pg.on('console', lambda m: errors.append(m.text[:200]) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    pg.add_init_script("localStorage.setItem('br_settings', JSON.stringify({devMode:true}))")
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1500)

    # ---------- 任务1：画布平移 ----------
    pg.locator('button:has-text("设计模式")').first.click()
    pg.wait_for_selector('text=据点（7）', timeout=30000)
    pg.locator('button:has-text("M.E.G. Gemma 基地")').first.click()
    pg.wait_for_timeout(500)
    el = pg.locator('div[data-zoom]')
    c0 = (float(el.get_attribute('data-cx')), float(el.get_attribute('data-cy')))
    # WASD 持续平移（按住 d 约 0.5s → 视野中心 x 增大）
    for _ in range(8):  # headless 定时器节流严重；每次 keydown 立即平移一步（真实环境另有持续平移）
        pg.keyboard.press('d')
    pg.wait_for_timeout(150)
    pg.wait_for_timeout(100)
    c1 = (float(el.get_attribute('data-cx')), float(el.get_attribute('data-cy')))
    check(c1[0] > c0[0] + 1, f'按住 D 平移视图（cx {c0[0]} → {c1[0]}）')
    for _ in range(8):
        pg.keyboard.press('ArrowUp')
    pg.wait_for_timeout(150)
    c2 = (float(el.get_attribute('data-cx')), float(el.get_attribute('data-cy')))
    check(c2[1] < c1[1] - 1, f'按住 ↑ 平移视图（cy {c1[1]} → {c2[1]}）')
    # 文本域聚焦时不劫持按键（customNote 里输入 wasd 不应平移）
    pg.locator('textarea[placeholder*="自定义修改要求"]').click()
    pg.keyboard.type('wasd')
    pg.wait_for_timeout(200)
    c3 = (float(el.get_attribute('data-cx')), float(el.get_attribute('data-cy')))
    check(abs(c3[0] - c2[0]) < 0.01 and abs(c3[1] - c2[1]) < 0.01, '文本域聚焦时 WASD 不劫持')
    # 中键拖动平移且不清除选中：先点选一个结构
    pg.locator('textarea[placeholder*="自定义修改要求"]').fill('')  # 清空 customNote（避免计入导出）
    pg.locator('button:text-matches("^#0 ")').first.click()
    pg.wait_for_timeout(200)
    sel0 = pg.locator('text=/结构 #0/').count()
    box = el.bounding_box()
    pg.mouse.move(box['x'] + 400, box['y'] + 300)
    pg.mouse.down(button='middle')
    pg.mouse.move(box['x'] + 300, box['y'] + 300, steps=5)
    pg.mouse.up(button='middle')
    pg.wait_for_timeout(150)
    c4 = (float(el.get_attribute('data-cx')), float(el.get_attribute('data-cy')))
    check(c4[0] > c3[0] + 1, f'中键拖动平移（cx {c3[0]} → {c4[0]}）')
    check(sel0 > 0 and pg.locator('text=/结构 #0/').count() > 0, '中键平移不清除当前选中')
    pg.screenshot(path='.check/v54d3-canvas-pan.png')

    # ---------- 任务2：实机进据点截图 ----------
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1200)
    pg.locator('button:has-text("开始游戏")').first.click()
    pg.wait_for_timeout(2500)
    sk = pg.locator('text=进入').first
    if sk.count():
        try: sk.click()
        except Exception: pass
    pg.wait_for_timeout(2500)
    # 收起开发者面板（打开状态会暂停引擎，transition 不推进——参考 v54-fix-verify.py 写法）
    try:
        pg.locator('button[aria-label="收起开发者面板"]').first.click()
        pg.wait_for_timeout(300)
    except Exception:
        pass
    for op, lid, shot in [('alpha', 101, '.check/v54d3-alpha.png'), ('jerry', 274, '.check/v54d3-jerry.png')]:
        pg.evaluate(f'() => window.__engine.devJumpOutpost("{op}")')
        ok2 = False
        for _ in range(25):
            pg.wait_for_timeout(400)
            if pg.evaluate('window.__engine.player.level') == lid and not pg.evaluate('!!window.__engine.transition'):
                ok2 = True
                break
        check(ok2, f'devJumpOutpost {op} → level {lid}')
        pg.wait_for_timeout(600)
        pg.screenshot(path=shot)
    # 游戏运行无控制台错误
    check(len(errors) == 0, f'控制台无错误（{len(errors)}）')
    for e in errors[:5]: print('  !', e)
    b.close()

if fails:
    print(f'\n✗ {len(fails)} 项失败')
    raise SystemExit(1)
print('\n✓ 第四批实机验证全部通过 -> .check/v54d3-*.png')
