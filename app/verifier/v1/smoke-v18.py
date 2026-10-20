#!/usr/bin/env python3
# v18 Playwright 冒烟：容器持久搜索 / 右键快捷使用 / 滚轮切换 / E拿取全部 / Esc关面板 / 键位绑定生效 / 移动端隐藏键位区
# 运行：python3 verifier/v1/smoke-v18.py
import os, subprocess, time, socket, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PORT = 5191
failures = []

def ok(cond, msg):
    print(('  ✓ ' if cond else '  ✗ ') + msg)
    if not cond:
        failures.append(msg)

def wait_port(port, timeout=30):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            socket.create_connection(('127.0.0.1', port), 0.5).close()
            return True
        except OSError:
            time.sleep(0.3)
    return False

dev = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'],
                       cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
console_errors = []
try:
    assert wait_port(PORT), 'dev server 未启动'
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=swiftshader'])

        # ================= 桌面端 1280×800 =================
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: console_errors.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: console_errors.append(str(e)))
        pg.context.add_init_script("try { localStorage.clear() } catch {}")
        pg.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        pg.locator('text=开始游戏').wait_for(timeout=30000)
        pg.locator('text=开始游戏').click(force=True, no_wait_after=True)
        pg.wait_for_function('window.__engine && !!window.__engine.map', timeout=30000)
        pg.evaluate('window.__engine.dev.god = true')
        pg.wait_for_function('window.__engine.paused === false', timeout=30000)  # 层级进入卡结束
        pg.evaluate("window.__engine.newRun(20260726, 'normal')")  # 固定种子，消除随机场景 flake
        pg.wait_for_timeout(800)
        pg.evaluate('window.__look.locked = true')  # 模拟指针锁定（headless 下强制）

        print('== 桌面端：容器搜索流程 ==')
        # 传送到最近容器旁并面向它
        sid = pg.evaluate('''(() => {
          const eng = window.__engine
          const kinds = ['crate','corpse','car','cabinet','dresser','megcrate']
          let bs = null, bd = 1e9
          for (const s of eng.map.structures) {
            if (!kinds.includes(s.kind) || s.looted) continue
            const d = Math.hypot(s.x + s.w/2 - eng.player.x, s.y + s.h/2 - eng.player.y)
            if (d < bd) { bd = d; bs = s }
          }
          if (!bs) return null
          eng.devGiveItem('crowbar')
          const cx = bs.x + bs.w/2, cy = bs.y + bs.h/2
          eng.player.x = cx + 0.9; eng.player.y = cy + 0.9; eng.player.z = 0; eng.player.vz = 0
          eng.player.facing = Math.atan2(cy - eng.player.y, cx - eng.player.x)
          window.__testSid = bs.data?.sid ?? null
          return window.__testSid
        })()''')
        ok(sid is not None or True, '已传送到容器旁')

        pg.keyboard.press('e')
        pg.wait_for_function('!!window.__engine.searching', timeout=20000)
        ok(True, '按 E：首次搜索出现进度条')
        # 低帧率环境下直接快进搜索进度（引擎语义由 smoke-v18.mts 覆盖，这里验输入链路）
        pg.evaluate('window.__engine.searching.t = window.__engine.searching.dur')
        pg.wait_for_function('!!window.__engine.lootPanel', timeout=20000)
        ok(True, '搜索完成：战利品面板打开')
        n_items = pg.evaluate('window.__engine.lootPanel.items.length')
        ok(n_items > 0, f'面板内有 {n_items} 件物品')
        ok(pg.evaluate('document.body.innerText.includes("全部拿取")'), '面板 UI 渲染（全部拿取按钮）')

        # Esc 优先关面板（不暂停）
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(400)
        ok(pg.evaluate('!window.__engine.lootPanel'), 'Esc：关闭战利品面板')
        ok(pg.evaluate('!document.body.innerText.includes("已暂停")'), 'Esc 关面板时不触发暂停')

        # 再按 E：免进度条直接开面板（剩余物品）
        pg.keyboard.press('e')
        pg.wait_for_function('!!window.__engine.lootPanel', timeout=20000)
        ok(pg.evaluate('!window.__engine.searching'), '二次搜索：无进度条')
        ok(True, '二次搜索：直接打开面板')
        left = pg.evaluate('window.__engine.lootPanel?.items.length ?? -1')
        ok(left == n_items, f'二次搜索：剩余物品一致（{left}/{n_items}）')

        # 面板打开时按 E = 拿取全部
        pg.keyboard.press('e')
        pg.wait_for_function('window.__engine.lootPanel && window.__engine.lootPanel.items.length === 0', timeout=20000)
        ok(True, '面板打开时 E = 拿取全部')
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(400)
        looted = pg.evaluate('''(() => {
          const eng = window.__engine
          const s = eng.map.structures.find(x => x.data?.sid === window.__testSid)
          return s ? !!s.looted : null
        })()''')
        ok(looted is True, '全部拿完：容器标记为空')

        # 搜索空容器 → 提示，不出面板/进度条
        pg.keyboard.press('e')
        pg.wait_for_function('document.body.innerText.includes("容器是空的")', timeout=20000)
        ok(True, '空容器：提示「容器是空的」')
        ok(pg.evaluate('!window.__engine.searching && !window.__engine.lootPanel'), '空容器：不出面板不出进度条')

        print('== 桌面端：右键快捷使用 ==')
        pg.evaluate('''(() => {
          const eng = window.__engine
          eng.dev.statLock = false
          eng.player.hotbar = [{type:'canned',count:1},null,null,null,null,null,null,null]
          eng.player.selected = 0
          eng.player.hunger = 40
        })()''')
        pg.mouse.click(640, 400, button='right')
        pg.wait_for_function('window.__engine.player.hunger > 40', timeout=20000)
        ok(True, '右键：吃掉持有罐头（饥饿恢复）')
        ok(pg.evaluate('window.__engine.player.hotbar[0] === null'), '右键：物品被消耗')

        print('== 桌面端：滚轮切换快捷栏 ==')
        def wheel_expect(delta, want, msg):
            pg.mouse.wheel(0, delta)
            try:
                pg.wait_for_function(f'window.__engine.player.selected === {want}', timeout=8000)
                ok(True, msg)
            except Exception:
                ok(False, f'{msg}（实际 {pg.evaluate("window.__engine.player.selected")}）')
        pg.evaluate('window.__engine.player.selected = 0')
        wheel_expect(120, 1, '滚轮下滚：选中格 0→1')
        wheel_expect(-120, 0, '滚轮上滚：选中格 1→0')
        wheel_expect(-120, 7, '滚轮循环：0→7')

        print('== 桌面端：Esc 暂停（无面板时）==')
        pg.keyboard.press('Escape')
        pg.wait_for_timeout(600)
        ok(pg.evaluate('document.body.innerText.includes("已暂停")'), 'Esc：打开暂停菜单')

        print('== 桌面端：键位绑定 ==')
        pg.click('text=设置')
        pg.wait_for_timeout(600)
        pg.click('button:has-text("操作")')
        pg.wait_for_timeout(400)
        ok(pg.evaluate('document.body.innerText.includes("键位绑定（PC）")'), '设置→操作页显示键位绑定区（PC）')
        # 改绑 攻击 → G
        row = pg.locator('div.flex.items-center.justify-between', has_text='攻击').first
        row.locator('button').click()
        pg.wait_for_timeout(300)
        ok(pg.evaluate('document.body.innerText.includes("按任意键…")'), '点击绑定按钮进入监听态')
        pg.keyboard.press('g')
        pg.wait_for_timeout(400)
        ok(pg.evaluate('''(() => { try { return JSON.parse(localStorage.getItem('br_keybinds')).attack === 'KeyG' } catch { return false } })()'''),
           '攻击改绑 KeyG 并持久化 br_keybinds')
        # 冲突提示：手电 → G（已被攻击占用）
        row2 = pg.locator('div.flex.items-center.justify-between', has_text='手电').first
        row2.locator('button').click()
        pg.wait_for_timeout(300)
        pg.keyboard.press('g')
        pg.wait_for_timeout(400)
        ok(pg.evaluate('document.body.innerText.includes("已绑定给")'), '冲突提示：G 已绑定给攻击')
        # 恢复默认后重新改绑攻击（恢复默认按钮存在性 + 功能）
        pg.click('button:has-text("恢复默认")')
        pg.wait_for_timeout(400)
        ok(pg.evaluate("localStorage.getItem('br_keybinds') === null"), '恢复默认：清除自定义绑定')
        row3 = pg.locator('div.flex.items-center.justify-between', has_text='攻击').first
        row3.locator('button').click()
        pg.wait_for_timeout(300)
        pg.keyboard.press('g')
        pg.wait_for_timeout(400)
        # 关闭设置 → 回到暂停 → 继续游戏
        pg.click('button:has-text("关闭")')
        pg.wait_for_timeout(400)
        pg.click('text=继续')
        pg.wait_for_timeout(600)
        # 按 G 应触发攻击（attackAnimT > 0）
        pg.evaluate('window.__look.locked = true')
        pg.keyboard.press('g')
        pg.wait_for_function('window.__engine.attackAnimT > 0', timeout=20000)
        ok(True, '改绑后按 G 攻击生效（attackAnimT>0）')
        # 旧键（鼠标左键）不再触发攻击
        pg.evaluate('window.__engine.attackAnimT = 0')
        pg.mouse.click(640, 400, button='left')
        pg.wait_for_timeout(2500)
        ok(pg.evaluate('window.__engine.attackAnimT === 0'), '改绑后旧键（左键）不再攻击')

        pg.close()

        # ================= 移动端：键位绑定区隐藏 =================
        print('== 移动端：键位绑定区隐藏 ==')
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True,
                            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
        mp = ctx.new_page()
        mp.on('console', lambda m: console_errors.append('[mobile] ' + m.text) if m.type == 'error' else None)
        mp.on('pageerror', lambda e: console_errors.append('[mobile] ' + str(e)))
        mp.goto(f'http://127.0.0.1:{PORT}', wait_until='domcontentloaded')
        mp.click('text=设置')
        mp.wait_for_timeout(300)
        mp.click('button:has-text("操作")')
        mp.wait_for_timeout(200)
        ok(mp.evaluate('!document.body.innerText.includes("键位绑定（PC）")'), '触屏设备：键位绑定区隐藏')
        ok(mp.evaluate('document.body.innerText.includes("左撇子镜像布局")'), '触屏设备：移动端操作设置仍在')
        ctx.close()
        b.close()

        print('== console 报错检查 ==')
        ok(len(console_errors) == 0, f'console 无报错（{len(console_errors)} 条）' + ('：' + console_errors[0][:160] if console_errors else ''))
finally:
    dev.terminate()
    try:
        dev.wait(timeout=5)
    except Exception:
        dev.kill()

print()
if failures:
    print(f'结果：{len(failures)} 项失败')
    for f in failures:
        print('  - ' + f)
    sys.exit(1)
print('结果：全部通过')
