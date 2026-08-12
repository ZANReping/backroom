# v54 设计模式实机验证：devMode 下标题屏出「设计模式」→ 进入 → Gemma 基地三层查看 →
# 拖拽移动结构 → 改生成概率 → 图鉴改文本 → 导出 JSON（download 捕获并校验内容）
# 用法：先启动 npm run dev（:3000），再 python .check/v54-design.py
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')  # Windows 控制台默认 GBK，✓/✗ 需 UTF-8
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
    # 开发者模式开启（与 HUD DevPanel 同一开关 br_settings.devMode）
    pg.add_init_script("localStorage.setItem('br_settings', JSON.stringify({devMode:true}))")
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1500)

    # 1) 标题屏出现「设计模式」按钮
    btn = pg.locator('button:has-text("设计模式")')
    check(btn.count() > 0, '标题屏出现「设计模式」按钮')
    pg.screenshot(path='.check/v54-design-title.png')
    btn.first.click()
    pg.wait_for_selector('text=据点（7）', timeout=30000)  # 提取完成，条目树就绪
    pg.wait_for_timeout(300)
    check(pg.locator('text=未生效——导出 JSON 交给 Agent 复刻').count() > 0, '顶栏常驻「未生效」提示')
    check(pg.locator('button:has-text("导出 JSON")').first.is_disabled(), '无修改时导出按钮置灰')

    # 2) 选 Gemma 基地，看三层布局
    pg.locator('button:has-text("M.E.G. Gemma 基地")').first.click()
    pg.wait_for_timeout(600)
    pg.screenshot(path='.check/v54-design-gamma-1f.png')
    pg.locator('button:text-is("2F")').click(); pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v54-design-gamma-2f.png')
    pg.locator('button:text-is("3F")').click(); pg.wait_for_timeout(300)
    pg.screenshot(path='.check/v54-design-gamma-3f.png')
    pg.locator('button:text-is("1F")').click(); pg.wait_for_timeout(300)
    check(True, 'Gemma 基地 1F/2F/3F 楼层切换截图')

    # 3) 点选结构列表第一项 → 画布拖拽移动 2 格 → x 输入框随之变化
    pg.locator('button:text-matches("^#\\\\d+ ")').first.click()  # 列表点选并居中
    pg.wait_for_timeout(300)
    x_in = pg.locator('input[type=number]').first
    x0 = float(x_in.input_value())
    box = pg.locator('div[data-zoom]').bounding_box()
    zoom = float(pg.locator('div[data-zoom]').get_attribute('data-zoom'))
    cx = box['x'] + box['width'] / 2; cy = box['y'] + box['height'] / 2
    pg.mouse.move(cx, cy); pg.mouse.down()
    pg.mouse.move(cx + 2 * zoom, cy, steps=6); pg.mouse.up()
    pg.wait_for_timeout(200)
    x1 = float(pg.locator('input[type=number]').first.input_value())
    check(abs(x1 - x0 - 2) <= 1, f'结构拖拽移动：x {x0} → {x1}（预期 +2 瓦片）')
    pg.screenshot(path='.check/v54-design-gamma-moved.png')

    # 4) 改一条生成概率（l3:sanct 的大幅画作 0.25 → 0.5）
    pg.locator('button:has-text("圣所")').first.click()
    pg.wait_for_timeout(500)
    rule = pg.locator('xpath=//span[contains(text(),"infiniteL3.bigpainting.chance")]/following-sibling::input')
    check(rule.count() > 0, 'spawnRules 列出 infiniteL3.bigpainting.chance')
    rule.fill('0.5')
    pg.wait_for_timeout(200)

    # 5) 图鉴：实体「猎犬」改 codex.behavior
    pg.locator('button:has-text("猎犬")').first.click()
    pg.wait_for_timeout(300)
    ta = pg.locator('xpath=//div[contains(text(),"codex.behavior")]/following-sibling::textarea[1]')
    check(ta.count() > 0, '图鉴字段编辑器渲染 codex.behavior 文本域')
    orig = ta.input_value()
    ta.fill(orig + '（设计模式试改）')
    pg.wait_for_timeout(200)
    check(pg.locator('text=已修改').count() > 0, '图鉴改动标记「已修改」')
    pg.screenshot(path='.check/v54-design-codex.png')

    # 6) 导出 JSON 并校验内容
    check(not pg.locator('button:has-text("导出 JSON")').first.is_disabled(), '有修改后导出按钮可用')
    with pg.expect_download() as dl_info:
        pg.locator('button:has-text("导出 JSON")').first.click()
    dl = dl_info.value
    path = '.check/v54-design-export.json'
    dl.save_as(path)
    data = json.load(open(path, encoding='utf-8'))
    check(data.get('format') == 'backroom-design/v1', f'导出 format={data.get("format")}')
    ids = [e['id'] for e in data.get('layouts', [])]
    check('gamma' in ids and 'l3:sanct' in ids, f'导出仅含被修改布局 {ids}')
    sanct = next(e for e in data['layouts'] if e['id'] == 'l3:sanct')
    bp = next(r for r in sanct['spawnRules'] if r['key'] == 'infiniteL3.bigpainting.chance')
    check(bp['value'] == 0.5, f'导出含改后概率 bigpainting.chance={bp["value"]}')
    ce = [e for e in data.get('codex', []) if e['kind'] == 'entity' and e['id'] == 'hound']
    check(len(ce) == 1 and 'codex.behavior' in ce[0]['fields'] and '试改' in ce[0]['fields']['codex.behavior'],
          '导出图鉴条目仅含改动字段（hound codex.behavior）')
    check(len(data.get('codex', [])) == 1, f'导出图鉴仅 1 条被修改条目（实际 {len(data.get("codex", []))}）')

    print('console errors:', len(errors))
    for e in errors[:5]: print('  !', e)
    b.close()

if fails:
    print(f'\n✗ {len(fails)} 项失败')
    raise SystemExit(1)
print('\n✓ 设计模式实机验证全部通过 -> .check/v54-design-*.png / v54-design-export.json')
