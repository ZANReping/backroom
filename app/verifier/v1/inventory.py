#!/usr/bin/env python3
# v15 任务3 验收：背包点击（短按）仅打开详情卡、不发生交换；拖拽才交换
import os, subprocess, sys, time, socket
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 5192
fails = []


def check(name, cond, info=''):
    print(f'{"PASS" if cond else "FAIL"} {name}' + (f' — {info}' if info else ''))
    if not cond:
        fails.append(name)


def wait_port(port, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close(); return True
        except OSError:
            time.sleep(0.3)
    return False


dev = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    assert wait_port(PORT)
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader'])
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        pg.click('text=开始游戏')
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true')
        pg.wait_for_timeout(2600)
        # 布置物品
        pg.evaluate("""(() => {
          const p = window.__engine.player
          p.hotbar[0] = { type: 'almond', count: 1 }
          p.hotbar[1] = { type: 'bandage', count: 2 }
          p.backpack[0] = { type: 'rabbit', count: 1 }
        })()""")
        pg.keyboard.press('i')
        pg.wait_for_selector('button[data-w="hotbar"][data-i="0"]', state='attached', timeout=15000)
        pg.wait_for_timeout(400)

        # ---- 1. 点击 hotbar0 → 仅详情卡（杏仁水），无交换 ----
        pg.click('button[data-w="hotbar"][data-i="0"]')
        pg.wait_for_timeout(250)
        body = pg.inner_text('body')
        check('点击格1弹出详情卡（杏仁水+使用/丢弃）', '杏仁水' in body and '使用' in body and '丢弃' in body)
        # ---- 2. 再点击 hotbar1 → 详情切换为绷带，两格物品不动 ----
        pg.click('button[data-w="hotbar"][data-i="1"]')
        pg.wait_for_timeout(250)
        body = pg.inner_text('body')
        state = pg.evaluate("JSON.stringify(window.__engine.player.hotbar.slice(0,2))")
        check('点击格2详情切换为绷带', '绷带' in body)
        check('两次点击后未发生交换', '"type":"almond"' in state.split(',')[0] and '"type":"bandage"' in state, state)
        # ---- 3. 点击空格 → 详情收起，无变化 ----
        pg.click('button[data-w="hotbar"][data-i="5"]')
        pg.wait_for_timeout(250)
        state = pg.evaluate("JSON.stringify(window.__engine.player.hotbar.slice(0,2))")
        check('点击空格后物品仍未动', '"type":"almond"' in state.split(',')[0] and '"type":"bandage"' in state, state)
        # ---- 4. 拖拽 hotbar0 → hotbar1 → 交换 ----
        s0 = pg.locator('button[data-w="hotbar"][data-i="0"]').bounding_box()
        s1 = pg.locator('button[data-w="hotbar"][data-i="1"]').bounding_box()
        x0, y0 = s0['x'] + s0['width'] / 2, s0['y'] + s0['height'] / 2
        x1, y1 = s1['x'] + s1['width'] / 2, s1['y'] + s1['height'] / 2
        pg.mouse.move(x0, y0); pg.mouse.down()
        for k in range(1, 6):
            pg.mouse.move(x0 + (x1 - x0) * k / 5, y0 + (y1 - y0) * k / 5)
            pg.wait_for_timeout(40)
        pg.mouse.up()
        pg.wait_for_timeout(300)
        state = pg.evaluate("JSON.stringify(window.__engine.player.hotbar.slice(0,2))")
        check('拖拽后两格交换', '"type":"bandage"' in state.split(',')[0] and '"type":"almond"' in state, state)
        # ---- 5. 拖拽到背包格（跨区移动）----
        bp = pg.locator('button[data-w="backpack"][data-i="3"]').bounding_box()
        s0 = pg.locator('button[data-w="hotbar"][data-i="0"]').bounding_box()
        x0, y0 = s0['x'] + s0['width'] / 2, s0['y'] + s0['height'] / 2
        x1, y1 = bp['x'] + bp['width'] / 2, bp['y'] + bp['height'] / 2
        pg.mouse.move(x0, y0); pg.mouse.down()
        for k in range(1, 7):
            pg.mouse.move(x0 + (x1 - x0) * k / 6, y0 + (y1 - y0) * k / 6)
            pg.wait_for_timeout(40)
        pg.mouse.up()
        pg.wait_for_timeout(300)
        hb = pg.evaluate("window.__engine.player.hotbar[0] ? window.__engine.player.hotbar[0].type : 'empty'")
        bk = pg.evaluate("window.__engine.player.backpack[3] ? window.__engine.player.backpack[3].type : 'empty'")
        check('拖拽跨区移动（快捷栏→背包）', hb == 'empty' and bk == 'bandage', f'hotbar0={hb} backpack3={bk}')
        pg.screenshot(path=os.path.join(ROOT, 'verifier', 'runs', 'inventory-v15.png'))
        b.close()
        check('console 无报错', len(errs) == 0, '; '.join(errs[:3]))
finally:
    dev.terminate()

print(f'\n结果：{"全部通过" if not fails else "失败 " + ",".join(fails)}')
sys.exit(1 if fails else 0)
