const PETALS=8
import {rng,type Ctx,type PbrDraw,type PhonoRecipe} from './pbrDraw'
const CJK = '\"Noto Serif SC\",\"Noto Sans SC\",\"Source Han Sans SC\",\"PingFang SC\",serif'
type PhonoVariant='new'|'old'
function recipe(_key:string,d:PbrDraw):PbrDraw{return d}
function woodSet(v: PhonoVariant) {
  const old = v === 'old'
  const base = old ? ['#4a2618', '#5e321f', '#3a1c12'] : ['#6e2414', '#8a3420', '#561a0e']
  const grain = (x: Ctx, s: number, R: () => number, mode: 'c' | 'h') => {
    // 年轮纹：沿 u（横向）流动的正弦纹 + 节疤
    for (let y = 0; y < s; y += 1) {
      const k = Math.sin(y * .09 + Math.sin(y * .013) * 6) * .5 + .5, k2 = Math.sin(y * .41 + Math.sin(y * .05) * 3) * .5 + .5
      if (mode === 'c') { x.fillStyle = `rgba(${k > .6 ? '30,10,4' : '255,190,140'},${(Math.abs(k - .6) * .22 + k2 * .05).toFixed(3)})` }
      else x.fillStyle = `rgba(255,255,255,${(.08 + k * .14 + k2 * .05).toFixed(3)})`
      x.fillRect(0, y, s, 1)
    }
    for (let i = 0; i < 1400; i++) { // 导管孔
      const px = R() * s, py = R() * s, l = 6 + R() * 26
      x.fillStyle = mode === 'c' ? `rgba(20,6,2,${.06 + R() * .1})` : 'rgba(0,0,0,.18)'; x.fillRect(px, py, l, 1)
    }
    for (let i = 0; i < 3; i++) { // 节疤
      const cx = R() * s, cy = R() * s
      for (let r = 26; r > 2; r -= 3) { x.strokeStyle = mode === 'c' ? `rgba(30,10,4,${.05 + (26 - r) * .006})` : 'rgba(0,0,0,.06)'; x.beginPath(); x.ellipse(cx, cy, r * 2.6, r, 0, 0, Math.PI * 2); x.stroke() }
    }
  }
  const joinery = (x: Ctx, s: number, col: string, w: number) => { // 盒面四周榫接线 + 45° 斜接角
    x.strokeStyle = col; x.lineWidth = w; const m = s * .055
    x.strokeRect(m, m, s - 2 * m, s - 2 * m)
    x.beginPath(); for (const [a, b, c, d] of [[0, 0, m, m], [s, 0, s - m, m], [0, s, m, s - m], [s, s, s - m, s - m]]) { x.moveTo(a, b); x.lineTo(c, d) } x.stroke()
  }
  return recipe('phono-wood-' + v, {
    size: 512, normalStrength: 1.1,
    color: (x, s) => {
      const R = rng(old ? 77 : 18), g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, base[0]); g.addColorStop(.5, base[1]); g.addColorStop(1, base[2])
      x.fillStyle = g; x.fillRect(0, 0, s, s); grain(x, s, R, 'c')
      joinery(x, s, 'rgba(20,6,2,.55)', 3)
      if (old) { // 磨损：边缘露出浅色木、划痕、积灰
        x.strokeStyle = 'rgba(190,130,80,.35)'; x.lineWidth = 10; x.strokeRect(4, 4, s - 8, s - 8)
        for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(200,150,100,${.1 + R() * .25})`; x.lineWidth = .8 + R(); const px = R() * s, py = R() * s, a = R() * Math.PI; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * (10 + R() * 60), py + Math.sin(a) * (10 + R() * 60)); x.stroke() }
        for (let i = 0; i < 26; i++) { x.fillStyle = `rgba(160,150,130,${.05 + R() * .08})`; x.beginPath(); x.ellipse(R() * s, R() * s, 20 + R() * 60, 10 + R() * 30, R() * 3, 0, Math.PI * 2); x.fill() }
      } else { // 清漆高光带
        const h = x.createLinearGradient(0, 0, 0, s); h.addColorStop(0, 'rgba(255,220,190,.10)'); h.addColorStop(.3, 'rgba(255,220,190,0)'); h.addColorStop(1, 'rgba(0,0,0,.08)'); x.fillStyle = h; x.fillRect(0, 0, s, s)
      }
    },
    height: (x, s) => { const R = rng(old ? 78 : 19); x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); grain(x, s, R, 'h'); joinery(x, s, '#000', 4); if (old) for (let i = 0; i < 120; i++) { x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(R() * s, R() * s, 4 + R() * 30, 1.5) } },
    rough: (x, s) => { const R = rng(5); x.fillStyle = old ? '#9a9a9a' : '#3c3c3c'; x.fillRect(0, 0, s, s); for (let i = 0; i < 600; i++) { x.fillStyle = `rgba(255,255,255,${R() * (old ? .25 : .08)})`; x.fillRect(R() * s, R() * s, 8, 2) } if (old) { x.strokeStyle = 'rgba(255,255,255,.4)'; x.lineWidth = 12; x.strokeRect(4, 4, s - 8, s - 8) } },
  })
}
function brassSet(v: PhonoVariant, inner = false) {
  const old = v === 'old'
  const seams = (x: Ctx, s: number, col: string, w: number, rivet: string) => {
    for (let k = 0; k <= PETALS; k++) {
      const u = (k / PETALS) * s; x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(u, 0); x.lineTo(u, s); x.stroke()
      for (let j = 1; j < 12; j++) { x.fillStyle = rivet; x.beginPath(); x.arc(u + (j % 2 ? 5 : -5), (j / 12) * s, 3.2, 0, Math.PI * 2); x.fill() }
    }
    x.strokeStyle = col; x.lineWidth = w * 2.2; x.beginPath(); x.moveTo(0, 6); x.lineTo(s, 6); x.stroke() // 口沿卷边（v=1 在画布顶）
  }
  return recipe(`phono-brass-${v}${inner ? '-in' : ''}`, {
    size: 512, normalStrength: 3,
    color: (x, s) => {
      const R = rng(old ? 91 : 31)
      const g = x.createLinearGradient(0, 0, s, 0)
      const stops = inner ? ['#3a2a10', '#5a4218', '#2a1e0a'] : old ? ['#8a6a2a', '#b08a40', '#6e5222'] : ['#f6d478', '#d9a83e', '#fbe7a0']
      for (let i = 0; i < 9; i++) g.addColorStop(i / 8, stops[i % 3])
      x.fillStyle = g; x.fillRect(0, 0, s, s)
      for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(${R() < .5 ? '255,245,210' : '60,40,8'},${.05 + R() * .08})`; x.lineWidth = .6; const px = R() * s, py = R() * s; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (R() - .5) * 40, py + R() * 6); x.stroke() }
      if (old && !inner) { // 氧化：暗斑 + 铜绿
        for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(40,25,8,${.08 + R() * .15})`; x.beginPath(); x.ellipse(R() * s, R() * s, 10 + R() * 50, 6 + R() * 30, R() * 3, 0, Math.PI * 2); x.fill() }
        for (let i = 0; i < 22; i++) { x.fillStyle = `rgba(70,140,110,${.15 + R() * .3})`; x.beginPath(); x.ellipse(R() * s, s * (.5 + R() * .5), 4 + R() * 18, 3 + R() * 10, R() * 3, 0, Math.PI * 2); x.fill() }
      }
      seams(x, s, inner ? 'rgba(10,6,0,.6)' : 'rgba(80,50,10,.65)', 2.5, inner ? 'rgba(90,70,30,.8)' : old ? 'rgba(200,170,90,.9)' : 'rgba(255,240,190,.95)')
    },
    height: (x, s) => { x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); if (old) { const R = rng(4); for (let i = 0; i < 160; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); void g; x.fillStyle = 'rgba(0,0,0,.18)'; x.beginPath(); x.arc(R() * s, R() * s, 4 + R() * 8, 0, Math.PI * 2); x.fill() } } seams(x, s, '#202020', 4, '#ffffff') },
    rough: (x, s) => { const R = rng(9); x.fillStyle = inner ? '#b0b0b0' : old ? '#7a7a7a' : '#2a2a2a'; x.fillRect(0, 0, s, s); for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${R() * .12})`; x.fillRect(R() * s, R() * s, 12, 1) } },
    metal: (x, s) => { x.fillStyle = inner ? '#aaaaaa' : '#ffffff'; x.fillRect(0, 0, s, s); if (old && !inner) { const R = rng(91); for (let i = 0; i < 22; i++) { x.fillStyle = 'rgba(0,0,0,.8)'; x.beginPath(); x.ellipse(R() * s, s * (.5 + R() * .5), 4 + R() * 18, 3 + R() * 10, R() * 3, 0, Math.PI * 2); x.fill() } } },
  })
}
function recordSet(label = '陌生又熟悉', key = 'phono-record') {
  const groove = (x: Ctx, s: number, col: (r: number) => string) => { const c = s / 2; for (let r = s * .47; r > s * .17; r -= 1.5) { x.strokeStyle = col(r); x.lineWidth = 1; x.beginPath(); x.arc(c, c, r, 0, Math.PI * 2); x.stroke() } }
  return recipe(key, {
    size: 512, normalStrength: .45,
    color: (x, s) => {
      const c = s / 2, R = rng(66); x.fillStyle = '#121112'; x.fillRect(0, 0, s, s)
      groove(x, s, (r) => `rgba(255,255,255,${(.02 + (Math.sin(r * 1.7) * .5 + .5) * .03 + (r % 40 < 2 ? .06 : 0)).toFixed(3)})`)
      const sh = x.createLinearGradient(0, 0, s, s); sh.addColorStop(.35, 'rgba(255,255,255,0)'); sh.addColorStop(.5, 'rgba(255,255,255,.07)'); sh.addColorStop(.65, 'rgba(255,255,255,0)'); x.fillStyle = sh; x.fillRect(0, 0, s, s)
      // 标签
      x.fillStyle = '#7a1418'; x.beginPath(); x.arc(c, c, s * .16, 0, Math.PI * 2); x.fill()
      x.strokeStyle = '#d8b25a'; x.lineWidth = 2; x.beginPath(); x.arc(c, c, s * .15, 0, Math.PI * 2); x.stroke(); x.beginPath(); x.arc(c, c, s * .105, 0, Math.PI * 2); x.stroke()
      x.fillStyle = '#e8c56a'; x.textAlign = 'center'; x.textBaseline = 'middle'
      if (label) { x.font = `bold ${Math.round(s * .034)}px ${CJK}`; x.fillText(label, c, c - s * .06); x.font = `${Math.round(s * .02)}px ${CJK}`; x.fillText('无尽圆舞曲 · 78 r.p.m.', c, c + s * .06) }
      x.fillStyle = '#d8d0c0'; x.beginPath(); x.arc(c, c, s * .012, 0, Math.PI * 2); x.fill()
      for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(255,255,255,${R() * .05})`; x.fillRect(R() * s, R() * s, 1, 1) }
    },
    height: (x, s) => { x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); groove(x, s, (r) => (Math.floor(r / 1.5) % 2 ? '#8c8c8c' : '#747474')) },
    rough: (x, s) => { x.fillStyle = '#4a4a4a'; x.fillRect(0, 0, s, s); x.fillStyle = '#909090'; x.beginPath(); x.arc(s / 2, s / 2, s * .16, 0, Math.PI * 2); x.fill() },
  })
}
function feltSet() {
  return recipe('phono-felt', {
    size: 256, normalStrength: 1,
    color: (x, s) => { const R = rng(12); x.fillStyle = '#2e4a2e'; x.fillRect(0, 0, s, s); for (let i = 0; i < 4000; i++) { x.fillStyle = `rgba(${R() < .5 ? '10,20,10' : '90,120,80'},${R() * .25})`; x.fillRect(R() * s, R() * s, 1, 1) } },
    height: (x, s) => { const R = rng(13); x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); for (let i = 0; i < 5000; i++) { x.fillStyle = R() < .5 ? '#000' : '#fff'; x.globalAlpha = .15; x.fillRect(R() * s, R() * s, 1, 1) } x.globalAlpha = 1 },
  })
}
function plateSet(v: PhonoVariant) {
  return recipe('phono-plate-' + v, {
    size: 256, normalStrength: 2,
    color: (x, s) => {
      const g = x.createLinearGradient(0, 0, s, s); g.addColorStop(0, v === 'old' ? '#9a7a3a' : '#f2d27a'); g.addColorStop(1, v === 'old' ? '#6a5020' : '#b8892e'); x.fillStyle = g; x.fillRect(0, 0, s, s)
      x.strokeStyle = 'rgba(60,40,8,.8)'; x.lineWidth = 6; x.strokeRect(10, 60, s - 20, s - 120)
      x.save(); x.translate(s / 2, s / 2); x.scale(1 / 3.6 * 1.6, 1); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = 'rgba(50,30,6,.95)'
      x.font = `bold 46px ${CJK}`; x.fillText('HOTEL GRAMOPHONE', 0, -14); x.font = `30px ${CJK}`; x.fillText('恐怖旅馆 · 第五层', 0, 30); x.restore()
    },
    height: (x, s) => { x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); x.strokeStyle = '#000'; x.lineWidth = 6; x.strokeRect(10, 60, s - 20, s - 120) },
  })
}


export function phonoTextureRecipe(r:PhonoRecipe):PbrDraw{const v=r.variant??'new';switch(r.surface){case 'wood':return woodSet(v);case 'brass':return brassSet(v,!!r.inner);case 'record':return recordSet(r.label);case 'felt':return feltSet();case 'plate':return plateSet(v)}}
