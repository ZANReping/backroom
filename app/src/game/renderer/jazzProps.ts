// [jazz] 爵士脑（Entity 197）道具：立式钢琴（鼓头弹的，演出时放在餐厅舞台）、谱架（带乐谱）、啤酒杯（场间喝酒）、
// 哈瓦那辣椒酱瓶（低音提琴手的最爱 / 之后做成物品）、监控探头（乐队讨厌监控，餐厅墙角）。
// three 基础几何 + 车削 + 画布贴图（木纹 / 乐谱 / 标签），原点 = 底面中心（探头 = 墙面安装点，+Z 朝外），+Y 向上，正面 +Z。
import * as THREE from 'three'
import { litMaterial } from './shared'

let seed = 197
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const tex = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, rep = false) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
/** 胡桃木清漆木纹 */
function walnutTex(s0 = 11) {
  seed = s0
  return tex(512, 512, (g) => {
    g.fillStyle = '#3a1f12'; g.fillRect(0, 0, 512, 512)
    for (let k = 0; k < 140; k++) {
      const y = rnd() * 512, a = 0.04 + rnd() * 0.12, w = 1 + rnd() * 4
      g.strokeStyle = `rgba(${rnd() < 0.5 ? '18,8,4' : '96,56,30'},${a})`; g.lineWidth = w
      g.beginPath(); g.moveTo(0, y)
      for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + k) * 6 + (rnd() - 0.5) * 3)
      g.stroke()
    }
  }, true)
}
const M = (o: THREE.MeshLambertMaterialParameters & { roughness?: number; metalness?: number }) => litMaterial(o)
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; return o }
const lathe = (pts: [number, number][], seg = 32) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg)

/** 立式钢琴：宽 1.48、高 1.26、深 0.6；88 键（52 白 + 36 黑，实例化）、谱架、打开的琴盖、三个铜踏板、上门板雕花镂空（贴图） */
export function buildUprightPiano(): THREE.Group {
  const g = new THREE.Group(); g.name = 'uprightPiano'
  const wt = walnutTex(); wt.repeat.set(2, 2)
  const wood = M({ color: '#ffffff', map: wt, roughness: 0.35 })
  const dark = M({ color: '#1a0e08', roughness: 0.4 })
  const brass = M({ color: '#d4a64a', roughness: 0.25, metalness: 1, emissive: '#3a2a08' })
  const W = 1.48, Hh = 1.26, D = 0.6, kbY = 0.72, kbZ = 0.12
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = wood) => { const o = mesh(new THREE.BoxGeometry(w, h, d), m, x, y, z); g.add(o); return o }
  // 侧板（带琴腿托）、顶盖、背板
  for (const s of [1, -1]) { box(0.045, Hh, D * 0.62, s * (W / 2 - 0.0225), Hh / 2, -D * 0.19); box(0.06, kbY + 0.05, 0.1, s * (W / 2 - 0.03), (kbY + 0.05) / 2, kbZ + 0.08); box(0.07, 0.06, 0.12, s * (W / 2 - 0.035), 0.03, kbZ + 0.1) }
  box(W + 0.02, 0.03, D * 0.66, 0, Hh + 0.015, -D * 0.19)
  box(W - 0.09, Hh - 0.05, 0.02, 0, Hh / 2, -D * 0.49)
  // 上门板（雕花镂空：贴图画出卷草纹）
  const fret = tex(512, 256, (gg) => {
    gg.fillStyle = '#3a1f12'; gg.fillRect(0, 0, 512, 256)
    gg.strokeStyle = '#120804'; gg.lineWidth = 7
    for (let k = 0; k < 4; k++) { const cx = 70 + k * 124; gg.beginPath(); gg.ellipse(cx, 128, 46, 70, 0, 0, Math.PI * 2); gg.stroke(); gg.beginPath(); gg.arc(cx, 128, 18, 0, Math.PI * 2); gg.stroke(); gg.beginPath(); gg.moveTo(cx - 46, 128); gg.bezierCurveTo(cx - 20, 40, cx + 20, 216, cx + 46, 128); gg.stroke() }
    gg.strokeStyle = '#7a4a26'; gg.lineWidth = 3; gg.strokeRect(10, 10, 492, 236)
  })
  box(W - 0.09, 0.42, 0.025, 0, kbY + 0.38, 0.0, M({ color: '#ffffff', map: fret, roughness: 0.4 }))
  // 键床、键盘口、琴盖（打开立着靠后）、谱架
  box(W - 0.09, 0.06, 0.32, 0, kbY - 0.03, kbZ + 0.02)
  box(W - 0.09, 0.035, 0.02, 0, kbY + 0.0, kbZ + 0.185) // 键口挡板
  box(W - 0.09, 0.12, 0.02, 0, kbY + 0.1, 0.02).rotation.x = -0.12 // 打开的琴盖
  const desk = box(0.62, 0.22, 0.015, 0, kbY + 0.3, 0.04); desk.rotation.x = -0.2
  box(0.64, 0.02, 0.04, 0, kbY + 0.19, 0.06)
  // 乐谱（谱架上）
  const sheet = mesh(new THREE.PlaneGeometry(0.42, 0.2), M({ color: '#ffffff', map: musicTex(3), roughness: 0.9 }), 0, kbY + 0.305, 0.049); sheet.rotation.x = -0.2; g.add(sheet)
  // 琴键：52 白 + 36 黑（实例化）
  const ww = (W - 0.11) / 52
  const white = new THREE.InstancedMesh(new THREE.BoxGeometry(ww * 0.94, 0.02, 0.15), M({ color: '#f1ebdc', roughness: 0.3 }), 52)
  const black = new THREE.InstancedMesh(new THREE.BoxGeometry(ww * 0.55, 0.026, 0.095), M({ color: '#0d0b0a', roughness: 0.25 }), 36)
  const mtx = new THREE.Matrix4()
  for (let i = 0; i < 52; i++) { mtx.makeTranslation(-W / 2 + 0.055 + ww * (i + 0.5), kbY + 0.012, kbZ + 0.1); white.setMatrixAt(i, mtx) }
  let bi = 0
  for (let i = 0; i < 51; i++) { const n = (i + 5) % 7; if (n === 2 || n === 6) continue; if (bi >= 36) break; mtx.makeTranslation(-W / 2 + 0.055 + ww * (i + 1), kbY + 0.026, kbZ + 0.07); black.setMatrixAt(bi++, mtx) }
  white.castShadow = black.castShadow = true; g.add(white, black)
  // 下门板 + 三个铜踏板 + 两根前柱
  box(W - 0.09, 0.5, 0.02, 0, 0.32, -0.02)
  box(W - 0.09, 0.06, 0.06, 0, 0.03, 0.0, dark)
  for (const x of [-0.1, 0, 0.1]) { const p = mesh(new THREE.BoxGeometry(0.03, 0.012, 0.11), brass, x, 0.07, 0.07); p.rotation.x = 0.08; g.add(p) }
  for (const s of [1, -1]) { const c = mesh(new THREE.CylinderGeometry(0.028, 0.022, kbY - 0.12, 16), wood, s * (W / 2 - 0.09), (kbY - 0.12) / 2 + 0.06, kbZ + 0.12); g.add(c) }
  // 一对铜烛台（老式立式琴）
  for (const s of [1, -1]) { const ca = mesh(lathe([[0, 0], [0.025, 0.0], [0.03, 0.01], [0.008, 0.02], [0.008, 0.08], [0.02, 0.09], [0.012, 0.1]], 16), brass, s * 0.55, kbY + 0.55, 0.03); ca.rotation.x = Math.PI / 2; g.add(ca) }
  return g
}
/** 乐谱贴图（五线谱 + 手写音符） */
function musicTex(s0 = 5) {
  seed = s0
  return tex(512, 256, (g) => {
    g.fillStyle = '#efe6cf'; g.fillRect(0, 0, 512, 256)
    g.strokeStyle = '#3a3026'; g.fillStyle = '#2a2018'; g.lineWidth = 1.2
    for (let row = 0; row < 4; row++) {
      const y0 = 26 + row * 58
      for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(14, y0 + k * 6); g.lineTo(498, y0 + k * 6); g.stroke() }
      for (let x = 40; x < 490; x += 18 + rnd() * 10) { const y = y0 + Math.round(rnd() * 8) * 3; g.beginPath(); g.ellipse(x, y, 3.6, 2.6, -0.4, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(x + 3.3, y); g.lineTo(x + 3.3, y - 16); g.stroke() }
      for (let x = 120; x < 498; x += 120) { g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + 24); g.stroke() }
    }
  })
}
/** 谱架：三脚 + 升降杆 + 谱板（带乐谱）；高 ~1.15 m */
export function buildMusicStand(): THREE.Group {
  const g = new THREE.Group(); g.name = 'musicStand'
  const metal = M({ color: '#1b1b1d', roughness: 0.4, metalness: 0.6 })
  for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; const leg = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.34, 8), metal, Math.sin(a) * 0.14, 0.11, Math.cos(a) * 0.14); leg.rotation.set(Math.cos(a) * 0.95, 0, -Math.sin(a) * 0.95); g.add(leg) }
  g.add(mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.9, 10), metal, 0, 0.62, 0))
  g.add(mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 10), metal, 0, 0.62, 0))
  const desk = new THREE.Group(); desk.position.set(0, 1.08, 0.02); desk.rotation.x = -0.32; g.add(desk)
  desk.add(mesh(new THREE.BoxGeometry(0.5, 0.34, 0.006), metal))
  desk.add(mesh(new THREE.BoxGeometry(0.5, 0.03, 0.04), metal, 0, -0.17, 0.02))
  const sheet = mesh(new THREE.PlaneGeometry(0.44, 0.31), M({ color: '#ffffff', map: musicTex(9), roughness: 0.9 }), 0, 0.005, 0.0045); desk.add(sheet)
  return g
}
/** 啤酒杯：带凹点的厚玻璃扎啤杯（0.5 L），琥珀啤酒 + 泡沫；把手朝 +X */
export function buildBeerMug(): THREE.Group {
  const g = new THREE.Group(); g.name = 'beerMug'
  const glass = M({ color: '#d9ecef', roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false })
  const beer = M({ color: '#d68a1a', roughness: 0.2, transparent: true, opacity: 0.88, emissive: '#3a1c00' })
  const foam = M({ color: '#f6efdf', roughness: 0.9 })
  const out = mesh(lathe([[0.0, 0], [0.042, 0], [0.045, 0.006], [0.046, 0.14], [0.047, 0.15]], 28), glass); out.renderOrder = 3; g.add(out)
  g.add(mesh(new THREE.CylinderGeometry(0.039, 0.037, 0.115, 24), beer, 0, 0.068, 0))
  g.add(mesh(lathe([[0, 0.125], [0.04, 0.125], [0.042, 0.135], [0.035, 0.148], [0.0, 0.152]], 24), foam))
  const handle = mesh(new THREE.TorusGeometry(0.035, 0.009, 10, 20, Math.PI), glass, 0.046, 0.075, 0); handle.rotation.z = -Math.PI / 2; handle.renderOrder = 3; g.add(handle)
  return g
}
/** 哈瓦那辣椒酱瓶（~150 ml 细颈玻璃瓶 + 橙红酱 + 标签 + 白色滴嘴盖） */
export function buildHotSauce(): THREE.Group {
  const g = new THREE.Group(); g.name = 'hotSauce'
  const label = tex(256, 128, (c) => {
    c.fillStyle = '#f2e6c4'; c.fillRect(0, 0, 256, 128)
    c.fillStyle = '#b3220f'; c.fillRect(0, 0, 256, 22); c.fillRect(0, 106, 256, 22)
    c.fillStyle = '#e8641b'; c.beginPath(); c.ellipse(46, 64, 22, 30, 0.5, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#2f6b1d'; c.fillRect(54, 30, 8, 12)
    c.fillStyle = '#4a1608'; c.font = 'bold 26px sans-serif'; c.fillText('HABANERO', 80, 62)
    c.font = 'bold 15px sans-serif'; c.fillText('HOT SAUCE · XXX', 82, 86)
  })
  const glass = M({ color: '#ffd7c4', roughness: 0.08, transparent: true, opacity: 0.45, depthWrite: false })
  const sauce = M({ color: '#d4380e', roughness: 0.3, emissive: '#2a0500' })
  const prof: [number, number][] = [[0, 0], [0.024, 0], [0.026, 0.004], [0.026, 0.1], [0.02, 0.118], [0.011, 0.13], [0.0105, 0.155], [0.0, 0.155]]
  g.add(mesh(lathe(prof.map(([r, y]) => [Math.max(0, r - 0.0025), y + 0.002] as [number, number]).filter(([, y]) => y < 0.14), 24), sauce))
  const b = mesh(lathe(prof, 28), glass); b.renderOrder = 3; g.add(b)
  const lab = mesh(new THREE.CylinderGeometry(0.0266, 0.0266, 0.06, 28, 1, true), M({ color: '#ffffff', map: label, roughness: 0.7 }), 0, 0.055, 0); lab.rotation.y = -Math.PI / 2; g.add(lab)
  g.add(mesh(lathe([[0, 0.15], [0.0125, 0.15], [0.0125, 0.172], [0.006, 0.18], [0.003, 0.186], [0, 0.186]], 20), M({ color: '#f2f0ea', roughness: 0.5 })))
  return g
}
/** 监控探头（壁装：支架 + 枪机外壳 + 遮阳罩 + 镜头 + 红色指示灯）；原点 = 墙面安装点，探头朝 +Z 前下方 */
export function buildCctvCamera(): THREE.Group {
  const g = new THREE.Group(); g.name = 'cctvCamera'
  const white = M({ color: '#e4e4df', roughness: 0.45 }), grey = M({ color: '#5a5c60', roughness: 0.5, metalness: 0.3 }), black = M({ color: '#0a0a0c', roughness: 0.15 })
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), grey, 0, 0, 0.006).rotateX(Math.PI / 2))
  const arm = mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.16, 12), grey, 0, -0.01, 0.08); arm.rotation.x = Math.PI / 2 - 0.35; g.add(arm)
  const head = new THREE.Group(); head.position.set(0, -0.04, 0.17); head.rotation.x = 0.38; g.add(head)
  head.add(mesh(new THREE.BoxGeometry(0.075, 0.07, 0.2), white))
  const hood = mesh(new THREE.BoxGeometry(0.09, 0.006, 0.24), white, 0, 0.042, 0.02); head.add(hood)
  for (const s of [1, -1]) head.add(mesh(new THREE.BoxGeometry(0.006, 0.03, 0.24), white, s * 0.045, 0.028, 0.02))
  const lens = mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.02, 24), black, 0, 0, 0.105); lens.rotation.x = Math.PI / 2; head.add(lens)
  const glassL = mesh(new THREE.CircleGeometry(0.02, 20), M({ color: '#1b2a44', roughness: 0.02, emissive: '#060a18' }), 0, 0, 0.1155); head.add(glassL)
  const led = mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff2a1a' }), 0.026, -0.022, 0.101); head.add(led)
  g.userData.led = led
  return g
}
void rnd
