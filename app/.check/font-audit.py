# 字体审计：图鉴各处的计算字体是否符合主题/阵营定义
import sys, time, subprocess, json
from playwright.sync_api import sync_playwright

PORT = 3000  # 直接用开发服务器
errors, report = [], {}

def probe(pg, selector, note):
    el = pg.locator(selector).first
    if not el.count():
        report[note] = '<未找到元素>'
        return
    report[note] = el.evaluate('(el) => getComputedStyle(el).fontFamily')

with sync_playwright() as pw:
    b = pw.chromium.launch()

    def new_page(theme, extra=''):
        pg = b.new_page(viewport={'width': 1280, 'height': 800})
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        pg.add_init_script(f'localStorage.setItem("br_settings", JSON.stringify({{theme:"{theme}"}}));{extra}')
        pg.goto(f'http://localhost:{PORT}/', wait_until='networkidle')
        pg.wait_for_timeout(1200)
        pg.locator('button:has-text("图鉴档案")').first.click()
        pg.wait_for_timeout(500)
        return pg

    # 1) 阈限主题：层级详情 lore 正文应为主题 body 字体（Inter, Noto Sans SC）
    pg = new_page('liminal', 'localStorage.setItem("br_codex", JSON.stringify({level_8:true}))')
    pg.locator('button:has-text("Level 8 ·")').first.click()
    pg.wait_for_timeout(400)
    probe(pg, 'div.hud-panel p', 'liminal·层级详情 lore 正文')
    pg.close()

    # 2) M.E.G. 主题：正文应为全等宽（Overpass Mono）
    pg = new_page('meg', 'localStorage.setItem("br_codex", JSON.stringify({level_8:true}))')
    pg.locator('button:has-text("Level 8 ·")').first.click()
    pg.wait_for_timeout(400)
    probe(pg, 'div.hud-panel p', 'meg·层级详情 lore 正文')
    pg.close()

    # 3) 杰瑞实体页：正文应为阵营 body（Metropolis），标题应为 Fantasque Sans Mono
    pg = new_page('amber', 'localStorage.setItem("br_codex_seen", JSON.stringify({jerry:6}))')
    pg.locator('button:has-text("实体")').first.click()
    pg.wait_for_timeout(400)
    pg.locator('button:has-text("杰瑞")').first.click()
    pg.wait_for_timeout(400)
    probe(pg, 'div.hud-panel p', 'jerry 实体页 lore 正文')
    probe(pg, 'span.font-title', 'jerry 实体页标题')
    pg.close()

    # 4) 团体页：BNTG 卡正文应为 PT Serif，名称应为 Staatliches（精确文本定位避免匹配到外层容器）
    pg = new_page('amber')
    pg.locator('button:has-text("团体")').first.click()
    pg.wait_for_timeout(400)
    probe(pg, 'span.font-title:text-is("不结盟贸易集团")', '团体页 BNTG 卡名称')
    probe(pg, 'span.font-title:text-is("不结盟贸易集团") >> xpath=ancestor::div[contains(@class,"hud-panel")][1]//p', '团体页 BNTG 卡正文')
    # 5) 装修公司卡：名称应为 Share Tech Mono/字魂扁桃体（版头字体），正文应为 Anonymous Pro/未来荧黑
    probe(pg, 'span.font-title:text-is("后室装修公司")', '团体页 BRC 卡名称')
    probe(pg, 'span.font-title:text-is("后室装修公司") >> xpath=ancestor::div[contains(@class,"hud-panel")][1]//p', '团体页 BRC 卡正文')
    pg.close()

    b.close()

print(json.dumps(report, ensure_ascii=False, indent=1))
print('console errors:', errors if errors else 'none')
