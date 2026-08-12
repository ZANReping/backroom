# v54 设计模式第二/三批实机验证：
#   收尾：楼梯箭头与编辑 / 同位循环点选 / 灯具编辑 / 随机样例重采样 + onRandomSample + customNote /
#         随机物 chance 编辑 / 区域矩形编辑 / 随机与新建 NPC 标记 / 地面物品新增
#   任务1：评分并入条目 + CodexWidgets 预览（实体 CECS / 层级三维 / 物品 IOTS）
#   任务2：新建条目三模式导出（new:true / generate）
#   任务4：框选多选 + Ctrl+C/V 复制粘贴导出
# 用法：先启动 npm run dev（:3000），再 python .check/v54-design2.py
import json
import sys
sys.stdout.reconfigure(encoding='utf-8')  # Windows 控制台默认 GBK
from playwright.sync_api import sync_playwright

PORT = 3000
errors = []
fails = []

def check(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        fails.append(msg)

def tile_xy(pg, tx, ty):
    """瓦片坐标 → 画布屏幕坐标（读画布容器 data-zoom/cx/cy）"""
    el = pg.locator('div[data-zoom]')
    box = el.bounding_box()
    z = float(el.get_attribute('data-zoom'))
    cx = float(el.get_attribute('data-cx'))
    cy = float(el.get_attribute('data-cy'))
    return box['x'] + box['width'] / 2 + (tx - cx) * z, box['y'] + box['height'] / 2 + (ty - cy) * z

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={'width': 1400, 'height': 900})
    pg.on('console', lambda m: errors.append(m.text[:200]) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
    pg.add_init_script("localStorage.setItem('br_settings', JSON.stringify({devMode:true}))")
    pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
    pg.wait_for_timeout(1500)
    pg.locator('button:has-text("设计模式")').first.click()
    pg.wait_for_selector('text=据点（7）', timeout=30000)
    pg.wait_for_timeout(300)

    # ========== A. Gemma 基地：楼梯 / 灯具 / 循环点选 / 框选复制粘贴 / 区域矩形 / NPC 标记 ==========
    pg.locator('button:has-text("M.E.G. Gemma 基地")').first.click()
    pg.wait_for_timeout(600)

    # A1. 楼梯：点击楼梯间A 坡道格（x57..61, y36）→ 面板出现楼梯编辑；切换坡向
    sx, sy = tile_xy(pg, 59.5, 36.5)
    pg.mouse.click(sx, sy)
    pg.wait_for_timeout(200)
    check(pg.locator('text=/楼梯 #\\d+/').count() > 0, '点击楼梯格 → 面板显示楼梯编辑（dir/lo/hi）')
    dir_btn = pg.locator('button:has-text("（点击切换）")')
    if dir_btn.count():
        t0 = dir_btn.inner_text()
        dir_btn.click()
        pg.wait_for_timeout(150)
        check(dir_btn.inner_text() != t0, f'楼梯坡向循环切换（{t0.strip()} → {dir_btn.inner_text().strip()}）')
    else:
        check(False, '未找到楼梯坡向切换按钮')
    pg.screenshot(path='.check/v54d2-stair.png')

    # A2. 灯具：先点选结构列表首项（居中并读出坐标），放一盏灯到结构中心 → 同位 → 循环点选
    import re
    row0 = pg.locator('button:text-matches("^#0 ")').first
    m0 = re.search(r'\((\d+),(\d+)\)', row0.inner_text())
    fx, fy = int(m0.group(1)), int(m0.group(2))
    row0.click()
    pg.wait_for_timeout(200)
    pg.locator('button:has-text("+ 灯")').click()
    lx, ly = tile_xy(pg, fx + 1.5, fy + 0.5)  # 结构 (fx,fy) 3×1 的中心点（瓦片角点有浮点边界误差，点中心最稳）
    pg.mouse.click(lx, ly)
    pg.wait_for_timeout(200)
    pg.mouse.click(lx, ly)  # 第一次：选中结构
    pg.wait_for_timeout(150)
    c1 = pg.locator('text=同位对象').inner_text() if pg.locator('text=同位对象').count() else ''
    pg.mouse.click(lx, ly)  # 第二次：循环到灯
    pg.wait_for_timeout(150)
    c2 = pg.locator('text=同位对象').inner_text() if pg.locator('text=同位对象').count() else ''
    check('1/2' in c1 and '2/2' in c2, f'同位循环点选（{c1.strip()} → {c2.strip()}）')
    light_panel = pg.locator('text=/灯 #\\d+/').count() > 0
    check(light_panel, '循环切换到灯后面板显示灯具编辑')
    # A3. 灯具编辑：r=8、颜色 #ff2211
    r_in = pg.locator('xpath=//span[normalize-space(text())="r"]/following-sibling::input')
    if r_in.count():
        r_in.fill('8')
        pg.locator('input[type=color]').fill('#ff2211')
        pg.wait_for_timeout(150)
        check(True, '灯具半径/颜色已编辑（导出校验）')
    else:
        check(False, '未找到灯具 r 输入')
    pg.screenshot(path='.check/v54d2-light.png')

    # A4. 区域矩形：选「大厅」→ 改 x0=9
    pg.locator('button:has-text("大厅")').first.click()
    pg.wait_for_timeout(200)
    x0_in = pg.locator('xpath=//span[normalize-space(text())="x0"]/following-sibling::input')
    check(x0_in.count() > 0, '区域选中后面板显示矩形范围输入')
    if x0_in.count():
        x0_in.fill('9')
        pg.wait_for_timeout(150)
    pg.screenshot(path='.check/v54d2-zone.png')

    # A5. 随机居民槽 + 新建固定 NPC 标记
    pg.locator('select').nth(1).select_option('__random__')  # 第二个下拉=NPC
    pg.locator('button:text-is("NPC")').click()
    nx, ny = tile_xy(pg, 40, 25)
    pg.mouse.click(nx, ny)
    pg.wait_for_timeout(150)
    pg.locator('select').nth(1).select_option('__new__')
    pg.locator('input[placeholder="姓名"]').fill('测试员小赵')
    pg.locator('input[placeholder="职业"]').fill('仓库盘点员')
    pg.locator('input[placeholder="描述"]').fill('总是抱着一摞清单，见人就问库存。')
    pg.locator('button:text-is("NPC")').click()
    nx, ny = tile_xy(pg, 42, 25)
    pg.mouse.click(nx, ny)
    pg.wait_for_timeout(150)
    check(True, '随机居民槽 + 新建固定 NPC 已放置（导出校验标记）')

    # A6. 框选多选 + Ctrl+C/V 复制粘贴（前厅区域框一把）
    x0, y0 = tile_xy(pg, 33, 8)
    x1, y1 = tile_xy(pg, 46, 15)
    pg.keyboard.down('Shift')
    pg.mouse.move(x0, y0); pg.mouse.down(); pg.mouse.move(x1, y1, steps=8); pg.mouse.up()
    pg.keyboard.up('Shift')
    pg.wait_for_timeout(200)
    multi_txt = pg.locator('text=/多选 \\d+ 个对象/').inner_text() if pg.locator('text=/多选 \\d+ 个对象/').count() else ''
    check('多选' in multi_txt, f'框选多选（{multi_txt.strip()}）')
    pg.keyboard.press('Control+c')
    pg.wait_for_timeout(100)
    pg.keyboard.press('Control+v')
    pg.wait_for_timeout(200)
    check(pg.locator('text=/已粘贴 \\d+ 个对象/').count() > 0, 'Ctrl+C/V 复制粘贴（+1 格偏移）')
    pg.screenshot(path='.check/v54d2-multisel.png')

    # ========== B. l3:sanct：随机样例重采样 + onRandomSample + customNote + 物品新增 ==========
    pg.locator('button:has-text("圣所")').first.click()
    pg.wait_for_timeout(500)
    check(pg.locator('text=/随机样例（种子 424242/').count() > 0 or pg.locator('text=随机样例').count() > 0, '变体显示「随机样例（种子 N）」')
    pg.locator('input[placeholder="种子"]').fill('999')
    pg.locator('button:has-text("重采样")').click()
    pg.wait_for_timeout(400)
    check(pg.locator('text=已按种子 999 重采样').count() > 0, '换种子重采样（浏览器内 genL*ChunkRaw）')
    # 放置固定结构（应带 onRandomSample）
    pg.locator('button:text-is("放置")').first.click()
    px, py = tile_xy(pg, 5, 5)
    pg.mouse.click(px, py)
    pg.wait_for_timeout(150)
    # 放置物品
    pg.locator('button:text-is("物品")').click()
    px, py = tile_xy(pg, 7, 5)
    pg.mouse.click(px, py)
    pg.wait_for_timeout(150)
    # customNote
    pg.locator('textarea[placeholder*="自定义修改要求"]').fill('圣所大门改成双开')
    pg.wait_for_timeout(150)
    check(True, '随机样例固定对象 + 物品 + customNote（导出校验）')
    pg.screenshot(path='.check/v54d2-sanct.png')

    # ========== C. l0:pillars：随机物「随」标记与 chance 编辑 ==========
    pg.locator('button:has-text("柱群")').first.click()
    pg.wait_for_timeout(400)
    rand_row = pg.locator('button:text-matches("随$")').first
    check(pg.locator('button:text-matches("随$")').count() > 0, '随机生成物在结构列表带「随」标记')
    if rand_row.count():
        rand_row.click()
        pg.wait_for_timeout(200)
        ch = pg.locator('xpath=//span[contains(text(),"生成率")]/following-sibling::input')
        check(ch.count() > 0, '随机对象面板显示生成率（chance）输入')
        if ch.count():
            ch.fill('0.5')
            pg.wait_for_timeout(150)

    # ========== D. 任务1：评分内嵌编辑 + 组件预览 ==========
    pg.locator('button:has-text("猎犬")').first.click()
    pg.wait_for_timeout(400)
    check(pg.locator('text=统合实体分类系统').count() > 0, '实体条目内嵌 CecsBox 预览')
    cls_sel = pg.locator('xpath=//span[contains(text(),"形态 cecs.class")]/following-sibling::select')
    if cls_sel.count():
        cls_sel.select_option('Chimeric')
    th_in = pg.locator('xpath=//span[contains(text(),"威胁 cecs.threat")]/following-sibling::input')
    if th_in.count():
        th_in.fill('5')
    chip = pg.locator('button:has-text("NCR")').first
    if chip.count():
        chip.click()
    pg.wait_for_timeout(150)
    check(pg.locator('text=/已修改 \\d+ 字段/').count() > 0, 'CECS 编辑标记已修改')
    pg.screenshot(path='.check/v54d2-cecs.png')
    # 层级三维评分
    pg.locator('button:has-text("教学关卡")').first.click()
    pg.wait_for_timeout(400)
    check(pg.locator('text=生存难度').count() > 0, '层级条目内嵌 LevelClassBanner 预览')
    ext_in = pg.locator('xpath=//span[contains(text(),"逃离 scores.ext")]/following-sibling::input')
    if ext_in.count():
        ext_in.fill('5')
        pg.wait_for_timeout(150)
    pg.screenshot(path='.check/v54d2-level.png')
    # 物品 IOTS
    pg.locator('button:has-text("杏仁水")').first.click()
    pg.wait_for_timeout(400)
    freq_sel = pg.locator('xpath=//span[contains(text(),"罕见度 iots.frequency")]/following-sibling::select')
    check(freq_sel.count() > 0, '物品条目内嵌 IOTS 编辑')
    if freq_sel.count():
        freq_sel.select_option('少见')
        pg.wait_for_timeout(150)

    # ========== E. 任务2：新建条目（Agent 依描述生成） ==========
    pg.locator('xpath=//span[contains(.,"图鉴 · 实体")]/following-sibling::button').click()
    pg.wait_for_timeout(300)
    check(pg.locator('text=新建实体条目').count() > 0, '新建条目表单打开')
    pg.locator('text=Agent 依描述生成').click()
    pg.locator('input[placeholder="名称"]').fill('夜行者')
    pg.locator('textarea[placeholder*="描述"]').fill('只在完全黑暗的层级边缘游走的人形轮廓，目击报告极少。')
    pg.locator('button:has-text("创建")').click()
    pg.wait_for_timeout(300)
    check(pg.locator('text=新建条目').count() > 0, '新建条目创建并选中')
    pg.screenshot(path='.check/v54d2-newentry.png')

    # ========== F. 导出校验 ==========
    with pg.expect_download() as dl_info:
        pg.locator('button:has-text("导出 JSON")').first.click()
    path = '.check/v54-design2-export.json'
    dl_info.value.save_as(path)
    d = json.load(open(path, encoding='utf-8'))
    lids = [e['id'] for e in d.get('layouts', [])]
    gamma = next((e for e in d['layouts'] if e['id'] == 'gamma'), None)
    sanct = next((e['id'] for e in d['layouts'] if e['id'] == 'l3:sanct'), None)
    pillars = next((e for e in d['layouts'] if e['id'] == 'l0:pillars'), None)
    check(gamma is not None and sanct is not None, f'导出布局 {lids}')
    if gamma:
        ls = [l for l in gamma.get('lights', []) if l.get('r') == 8 and l.get('color') == '#ff2211']
        check(len(ls) >= 1, '导出含编辑后的灯（r=8 color=#ff2211；框选复制体会再多一盏）')
        check(sum(1 for n in gamma.get('npcs', []) if n.get('id') == 'random' and n.get('flavor') == 'meg') >= 3, '导出含新放置的随机居民槽（random/meg，≥3=提取2+新1）')
        check(any(n.get('id') == 'new:测试员小赵' and n.get('newNpc', {}).get('role') == '仓库盘点员' for n in gamma.get('npcs', [])), '导出含新建固定 NPC（new:<名字>+newNpc）')
        hall = next((z for z in gamma.get('zones', []) if z['name'] == '大厅'), None)
        check(hall is not None and hall.get('x0') == 9, '导出含编辑后的区域矩形（大厅 x0=9）')
        check(len(gamma.get('structures', [])) > 146, f'框选粘贴计入导出（结构 {len(gamma.get("structures", []))} > 146）')
        st = [t for t in gamma.get('stair', []) if t.get('dir') != 1]
        check(len(st) > 0, '导出含改朝向的楼梯格')
    sanct_e = next((e for e in d['layouts'] if e['id'] == 'l3:sanct'), None)
    if sanct_e:
        check(sanct_e.get('customNote') == '圣所大门改成双开', '导出含 customNote')
        check(any(s.get('onRandomSample') for s in sanct_e.get('structures', [])), '导出含 onRandomSample 固定结构')
        check(any(i.get('onRandomSample') and i.get('type') == 'almond' for i in sanct_e.get('items', [])), '导出含 onRandomSample 物品')
    if pillars:
        check(any(s.get('chance') == 0.5 for s in pillars.get('structures', [])), '导出含编辑后的随机物 chance=0.5')
    hound = next((e for e in d['codex'] if e['kind'] == 'entity' and e['id'] == 'hound'), None)
    check(hound is not None and hound['fields'].get('cecs.class') == 'Chimeric' and hound['fields'].get('cecs.threat') == 5,
          f'实体条目导出 CECS 编辑（{hound and hound["fields"].get("cecs.class")}）')
    lv0 = next((e for e in d['codex'] if e['kind'] == 'level' and e['id'] == '0'), None)
    check(lv0 is not None and lv0['fields'].get('scores.ext') == 5, '层级条目导出 scores.ext=5')
    alm = next((e for e in d['codex'] if e['kind'] == 'item' and e['id'] == 'almond'), None)
    check(alm is not None and alm['fields'].get('iots.frequency') == '少见', '物品条目导出 iots.frequency=少见')
    newe = next((e for e in d['codex'] if e.get('new')), None)
    check(newe is not None and newe.get('generate') == 'fromDescription' and newe['fields'].get('name') == '夜行者',
          '新建条目导出（new:true + generate:fromDescription）')

    print('console errors:', len(errors))
    for e in errors[:5]: print('  !', e)
    b.close()

if fails:
    print(f'\n✗ {len(fails)} 项失败')
    raise SystemExit(1)
print('\n✓ 设计模式第二/三批实机验证全部通过 -> .check/v54d2-*.png / v54-design2-export.json')
