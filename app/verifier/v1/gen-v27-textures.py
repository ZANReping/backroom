#!/usr/bin/env python3
# v27：按 src 中程序化兜底代码逐像素生成 exit_sign_v1.png / grass_tuft_v1.png（浏览器 canvas 渲染导出）
import base64, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TEX = os.path.join(ROOT, 'public', 'textures')

JS = """() => {
  const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return [cv, cv.getContext('2d')] }
  // exit_sign_v1（与 structures.ts 兜底同代码）
  const [cv1, c1] = mk(96, 32)
  c1.fillStyle = '#06210f'
  c1.fillRect(0, 0, 96, 32)
  c1.strokeStyle = '#1d5c33'
  c1.strokeRect(1.5, 1.5, 93, 29)
  c1.fillStyle = '#3aff72'
  c1.font = 'bold 20px monospace'
  c1.textAlign = 'center'
  c1.textBaseline = 'middle'
  c1.fillText('EXIT', 48, 17)
  // grass_tuft_v1（与 geometry.ts 兜底同代码）
  const [cv2, c2] = mk(64, 64)
  c2.clearRect(0, 0, 64, 64)
  let s = 7
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 26; i++) {
    const x0 = 4 + rnd() * 56, w = 1.5 + rnd() * 2, h = 30 + rnd() * 34, lean = (rnd() - 0.5) * 14
    const grad = c2.createLinearGradient(0, 64, 0, 64 - h)
    grad.addColorStop(0, '#3f6b2a')
    grad.addColorStop(1, '#8fc464')
    c2.strokeStyle = grad
    c2.lineWidth = w
    c2.beginPath()
    c2.moveTo(x0, 64)
    c2.quadraticCurveTo(x0 + lean * 0.4, 64 - h * 0.6, x0 + lean, 64 - h)
    c2.stroke()
  }
  return { exit_sign_v1: cv1.toDataURL('image/png'), grass_tuft_v1: cv2.toDataURL('image/png') }
}"""

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    out = pg.evaluate(JS)
    b.close()

for name, data in out.items():
    path = os.path.join(TEX, f'{name}.png')
    with open(path, 'wb') as f:
        f.write(base64.b64decode(data.split(',', 1)[1]))
    print('written', path, os.path.getsize(path), 'bytes')
