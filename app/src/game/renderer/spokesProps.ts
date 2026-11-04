// [spokes] 迎宾女郎（Entity 28）道具（阶段 1：只建模）。
//   buildCollarSpeaker   领口别的小音箱（她靠它说话）：黑色外壳 + 镀铬边 + 网罩 + 背夹 + 红色指示灯
//   buildSpokesPoster    手绘闪粉海报「恐怖旅馆～有着最好员工的旅馆！」（彩笔字 + 兔子涂鸦 + 闪粉：闪粉点走金属度 / 低粗糙度）
//   buildWindupRabbit    可走动的机械发条兔（单独小模型）：锡皮身体（旧绒毛斑块 + 铆钉接缝）、玻璃眼、铰接四肢、背上黄铜发条钥匙
//                         —— 关节组 userData.windup = { body, head, earL, earR, legFL, legFR, legBL, legBR, key }，阶段 2 直接转
//   buildNameplate       桌上铭牌「Spokeslady」（胡桃木底座 + 黄铜牌）
//   buildRadio           旧式木壳台式收音机（布面喇叭罩、调频刻度窗、两个旋钮）
//   buildPosterDrops     墙上海报投递地洞 A / B（木框墙板 + 两个黑洞口 + 黄铜字牌 + 翻板）
import * as THREE from 'three'
import { litMaterial } from './shared'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, name?: string) => { const o = new THREE.Mesh(g, m); o.castShadow = true; o.receiveShadow = true; if (name) o.name = name; return o }
const canvas = (w: number, h: number) => { if (typeof document === 'undefined') return null; const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const tex = (c: HTMLCanvasElement | null, srgb = true) => { if (!c) return undefined; const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t }
const rbox = (w: number, h: number, d: number, r: number, seg = 3) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: Math.min(r, d) * 0.3, bevelThickness: Math.min(r, d) * 0.3, bevelSegments: seg, curveSegments: 4 })
  g.translate(0, 0, -d / 2); g.computeVertexNormals(); return g
}

// ======================================================================
// 领口小音箱（局部 +Z = 朝外；尺寸 3.4 × 2.4 × 1.1 cm）
// ======================================================================
export function buildCollarSpeaker(): THREE.Group {
  const g = new THREE.Group(); g.name = 'spokesSpeaker'
  const shellM = litMaterial({ color: '#141414', roughness: 0.45 }), chrome = std({ color: '#c9ccd0', metalness: 1, roughness: 0.22 })
  const gc = canvas(128, 96)
  if (gc) {
    const x = gc.getContext('2d')!; x.fillStyle = '#1b1b1c'; x.fillRect(0, 0, 128, 96)
    for (let j = 0; j < 12; j++) for (let i = 0; i < 16; i++) { x.fillStyle = '#050505'; x.beginPath(); x.arc(8 + i * 7.5 + (j % 2) * 3.7, 8 + j * 7.3, 2.3, 0, Math.PI * 2); x.fill() }
    x.fillStyle = '#4a4a4a'; x.fillRect(0, 0, 128, 3)
  }
  const grille = litMaterial({ color: '#ffffff', map: tex(gc), roughness: 0.6 })
  const body = mesh(rbox(0.034, 0.024, 0.009, 0.004), shellM, 'speakerBody'); g.add(body)
  {
    // 镀铬边框（中间挖空露出网罩）
    const rr = (w: number, h: number, r: number, path: THREE.Path) => { const x = -w / 2, y = -h / 2; path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r); path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h); path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r); path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y) }
    const sh = new THREE.Shape(); rr(0.032, 0.022, 0.0038, sh); const hole = new THREE.Path(); rr(0.027, 0.017, 0.003, hole); sh.holes.push(hole)
    const rg = new THREE.ExtrudeGeometry(sh, { depth: 0.0012, bevelEnabled: true, bevelSize: 0.0005, bevelThickness: 0.0004, bevelSegments: 2, curveSegments: 4 })
    const rim = mesh(rg, chrome, 'speakerRim'); rim.position.z = 0.0048; g.add(rim)
  }
  const face = mesh(new THREE.PlaneGeometry(0.027, 0.017), grille, 'speakerGrille'); face.position.z = 0.0062; g.add(face)
  const led = mesh(new THREE.SphereGeometry(0.0012, 8, 6), litMaterial({ color: '#ff3a2a', emissive: '#ff2010', emissiveIntensity: 1.5 } as THREE.MeshLambertMaterialParameters), 'speakerLed'); led.position.set(0.013, -0.0085, 0.006); g.add(led)
  const clip = mesh(new THREE.BoxGeometry(0.008, 0.026, 0.0012), chrome, 'speakerClip'); clip.position.set(0, 0.002, -0.0055); g.add(clip)
  // 一小段卷线（垂向衣内）
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.012, -0.002), new THREE.Vector3(0.002, -0.02, -0.006), new THREE.Vector3(-0.002, -0.03, -0.01), new THREE.Vector3(0.0, -0.04, -0.016)])
  g.add(mesh(new THREE.TubeGeometry(curve, 12, 0.0011, 5), shellM, 'speakerCord'))
  return g
}

// ======================================================================
// 手绘闪粉海报（0.42 × 0.594 m，A2 竖版；局部 +Z 朝外，底边 y = 0）
// ======================================================================
export function posterTexture() {
  const W = 512, H = 724, c = canvas(W, H)
  if (!c) return null
  const g = c.getContext('2d')!
  let seed = 28; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // 米黄卡纸 + 纸纹 + 边上一点泛黄
  g.fillStyle = '#efe3c6'; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '120,90,50' : '255,250,235'},${0.03 + 0.04 * R()})`; g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2) }
  const vg = g.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(130,90,40,0.35)'); g.fillStyle = vg; g.fillRect(0, 0, W, H)
  // 彩笔边框（歪歪扭扭的波浪线 + 小星星）
  const wobble = (pts: [number, number][], col: string, w: number) => { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); pts.forEach(([x, y], i) => { const jx = x + (R() - 0.5) * 3, jy = y + (R() - 0.5) * 3; i ? g.lineTo(jx, jy) : g.moveTo(jx, jy) }); g.stroke() }
  const frame: [number, number][] = []
  for (let i = 0; i <= 60; i++) { const t = i / 60; frame.push([22 + t * (W - 44), 22 + 5 * Math.sin(t * 40)]) }
  for (let i = 0; i <= 80; i++) { const t = i / 80; frame.push([W - 22 + 5 * Math.sin(t * 50), 22 + t * (H - 44)]) }
  for (let i = 0; i <= 60; i++) { const t = i / 60; frame.push([W - 22 - t * (W - 44), H - 22 + 5 * Math.sin(t * 40)]) }
  for (let i = 0; i <= 80; i++) { const t = i / 80; frame.push([22 + 5 * Math.sin(t * 50), H - 22 - t * (H - 44)]) }
  wobble(frame, '#e0447a', 6)
  const star = (x: number, y: number, r: number, col: string) => { g.fillStyle = col; g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) } g.closePath(); g.fill() }
  for (let k = 0; k < 14; k++) star(40 + R() * (W - 80), 40 + R() * (H - 80) * (k % 2 ? 0.25 : 1) + (k % 2 ? 0 : 0), 7 + R() * 8, ['#f2b134', '#e0447a', '#5aa6d8', '#7cc46a'][k % 4])
  // 标题：彩笔描边字（先粗描边再填色，模拟手写）
  const hand = (txt: string, x: number, y: number, size: number, fill: string, stroke: string, rotA = 0) => {
    g.save(); g.translate(x, y); g.rotate(rotA)
    g.font = `900 ${size}px "Noto Sans SC", "Noto Sans CJK SC", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.lineJoin = 'round'; g.strokeStyle = stroke; g.lineWidth = size * 0.16; g.strokeText(txt, 0, 0)
    g.fillStyle = fill; g.fillText(txt, 0, 0)
    // 彩笔笔触纹：在字里画斜线
    g.globalCompositeOperation = 'source-atop'; g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2
    for (let i = -20; i < 20; i++) { g.beginPath(); g.moveTo(i * 10, -size); g.lineTo(i * 10 + size, size); g.stroke() }
    g.restore(); g.globalCompositeOperation = 'source-over'
  }
  hand('恐怖旅馆～', W / 2, 110, 78, '#c8283c', '#3a1010', -0.04)
  hand('有着最好员工', W / 2, 205, 50, '#2f6fb0', '#0f2440', 0.03)
  hand('的旅馆！', W / 2, 262, 50, '#2f6fb0', '#0f2440', -0.02)
  // 兔子涂鸦（蜡笔线条：大耳朵、领结、举手欢迎）
  g.save(); g.translate(W / 2, 470); g.lineCap = 'round'; g.lineJoin = 'round'
  const crayon = (draw: () => void, col: string, w: number) => { for (let k = 0; k < 3; k++) { g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = w - k; g.save(); g.translate((R() - 0.5) * 2, (R() - 0.5) * 2); g.beginPath(); draw(); g.stroke(); g.restore() } g.globalAlpha = 1 }
  crayon(() => { g.ellipse(-28, -120, 16, 55, -0.15, 0, Math.PI * 2) }, '#7a6f6a', 6)
  crayon(() => { g.ellipse(28, -120, 16, 55, 0.15, 0, Math.PI * 2) }, '#7a6f6a', 6)
  g.fillStyle = 'rgba(236,150,160,0.6)'; g.beginPath(); g.ellipse(-28, -118, 7, 38, -0.15, 0, Math.PI * 2); g.ellipse(28, -118, 7, 38, 0.15, 0, Math.PI * 2); g.fill()
  crayon(() => { g.arc(0, -40, 52, 0, Math.PI * 2) }, '#7a6f6a', 6)
  g.fillStyle = '#111'; g.beginPath(); g.arc(-20, -48, 7, 0, Math.PI * 2); g.arc(20, -48, 7, 0, Math.PI * 2); g.fill()
  g.fillStyle = '#e88a98'; g.beginPath(); g.arc(0, -30, 6, 0, Math.PI * 2); g.fill()
  crayon(() => { g.moveTo(-8, -18); g.quadraticCurveTo(0, -8, 8, -18) }, '#5a3030', 4)
  crayon(() => { g.moveTo(-8, -28); g.lineTo(-48, -36); g.moveTo(-8, -24); g.lineTo(-46, -20); g.moveTo(8, -28); g.lineTo(48, -36); g.moveTo(8, -24); g.lineTo(46, -20) }, '#8a8a8a', 2)
  // 身体（棕色西装）+ 举起的手
  g.fillStyle = 'rgba(110,70,45,0.75)'; g.beginPath(); g.moveTo(-45, 15); g.lineTo(45, 15); g.lineTo(60, 120); g.lineTo(-60, 120); g.closePath(); g.fill()
  crayon(() => { g.moveTo(-45, 25); g.lineTo(-95, -30) }, '#6e462d', 9)
  crayon(() => { g.moveTo(45, 25); g.lineTo(90, 70) }, '#6e462d', 9)
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-14, 15); g.lineTo(0, 45); g.lineTo(14, 15); g.closePath(); g.fill()
  g.restore()
  // 底部小字
  hand('欢迎入住 ♥ 前台随时为您服务', W / 2, 650, 24, '#7a3c8c', '#2a0f30', 0.01)
  // 闪粉（彩色小亮点，主要撒在标题和边框附近）：单独返回一张金属度掩膜
  const m = canvas(W, H)!, mg = m.getContext('2d')!
  mg.fillStyle = '#000'; mg.fillRect(0, 0, W, H)
  for (let i = 0; i < 1300; i++) {
    const nearTitle = R() < 0.55
    // 标题附近：撒在字的上下沿一圈（不盖住字）；其余沿边框
    const band = R() < 0.5 ? 50 + R() * 26 : (R() < 0.5 ? 150 + R() * 12 : 290 + R() * 18)
    const x = nearTitle ? 50 + R() * (W - 100) : R() * W, y = nearTitle ? band : (R() < 0.5 ? 18 + R() * 14 : H - 32 + R() * 14)
    const col = ['#ffd84a', '#ff6fa8', '#8fd8ff', '#ffffff', '#b38cff'][Math.floor(R() * 5)], r = 0.7 + R() * 1.2
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill()
    mg.fillStyle = '#ffffff'; mg.beginPath(); mg.arc(x, y, r, 0, Math.PI * 2); mg.fill()
  }
  return { map: tex(c)!, glitter: tex(m, false)! }
}
export function buildSpokesPoster(): THREE.Group {
  const g = new THREE.Group(); g.name = 'spokesPoster'
  const t = posterTexture()
  // 金属度贴图：闪粉点 = 1（three 取 B 通道）；粗糙度在闪粉处更低（反相：roughnessMap 取 G 通道 → 用 1 − 掩膜）
  let rough: THREE.Texture | undefined
  if (t && typeof document !== 'undefined') {
    const src = t.glitter.image as HTMLCanvasElement, c2 = canvas(src.width, src.height)!, x = c2.getContext('2d')!
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, c2.width, c2.height); x.globalCompositeOperation = 'difference'; x.drawImage(src, 0, 0)
    x.globalCompositeOperation = 'source-over'; x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 0, c2.width, c2.height)
    rough = tex(c2, false)
  }
  const mat = std({ color: '#ffffff', map: t?.map, metalnessMap: t?.glitter, metalness: 1, roughnessMap: rough, roughness: 1, emissive: '#ffffff', emissiveMap: t?.glitter, emissiveIntensity: 0.12 })
  const W = 0.42, H = 0.594
  // 纸略带卷曲（两侧向前翘 2 cm）
  const pg = new THREE.PlaneGeometry(W, H, 16, 4); { const p = pg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (W / 2); p.setZ(i, 0.012 * x * x + 0.004 * Math.max(0, p.getY(i) / (H / 2)) ** 2) } pg.computeVertexNormals() }
  const paper = mesh(pg, mat, 'posterPaper'); paper.position.y = H / 2; g.add(paper)
  const back = mesh(pg.clone(), litMaterial({ color: '#e6dcc2', side: THREE.BackSide }), 'posterBack'); back.position.y = H / 2; g.add(back)
  // 四角胶带
  const tape = litMaterial({ color: '#e9dfa9', transparent: true, opacity: 0.8 })
  for (const [x, y, r] of [[-1, 1, 0.6], [1, 1, -0.6], [-1, -1, -0.6], [1, -1, 0.6]]) { const tp = mesh(new THREE.PlaneGeometry(0.07, 0.022), tape, 'posterTape'); tp.position.set(x * (W / 2 - 0.012), H / 2 + y * (H / 2 - 0.012), 0.016); tp.rotation.z = r; g.add(tp) }
  return g
}

// ======================================================================
// 机械发条兔（单独小模型，体长约 0.24 m；局部 +Z 朝前、脚底 y = 0）
// ======================================================================
function windupFurTexture() {
  const W = 256, H = 256, c = canvas(W, H)
  if (!c) return null
  const g = c.getContext('2d')!
  let seed = 135; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // 旧奶白锡漆底 + 锈斑 + 掉漆露出的银色金属 + 残留的灰白旧绒毛斑块
  g.fillStyle = '#d8cfbd'; g.fillRect(0, 0, W, H)
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '150,95,50' : '110,70,40'},${0.08 + 0.15 * R()})`; g.beginPath(); g.arc(R() * W, R() * H, 2 + R() * 9, 0, Math.PI * 2); g.fill() }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(170,175,180,${0.5 + 0.4 * R()})`; g.beginPath(); g.ellipse(R() * W, R() * H, 3 + R() * 10, 2 + R() * 5, R() * 3, 0, Math.PI * 2); g.fill() }
  for (let p = 0; p < 9; p++) {
    const cx = R() * W, cy = R() * H, rr = 18 + R() * 28
    for (let i = 0; i < 900; i++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * rr, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, tone = 170 + R() * 70; g.strokeStyle = `rgba(${tone},${tone - 5},${tone - 12},0.7)`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 3, y + 3 + R() * 4); g.stroke() }
  }
  const t = tex(c)!; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t
}
export function buildWindupRabbit(): THREE.Group {
  const g = new THREE.Group(); g.name = 'windupRabbit'
  const tin = std({ color: '#ffffff', map: windupFurTexture() ?? undefined, metalness: 0.35, roughness: 0.55 })
  const steel = std({ color: '#9ea2a6', metalness: 1, roughness: 0.35 }), brass = std({ color: '#c8a24a', metalness: 1, roughness: 0.28 }), dark = std({ color: '#2a2622', metalness: 0.6, roughness: 0.5 })
  const glass = new THREE.MeshPhysicalMaterial({ color: '#c0302a', metalness: 0, roughness: 0.05, transmission: 0.0, clearcoat: 1, clearcoatRoughness: 0.05, emissive: '#3a0806', emissiveIntensity: 0.6 })
  const pink = std({ color: '#d99a98', metalness: 0.2, roughness: 0.5 })
  const body = new THREE.Group(); body.name = 'wbBody'; body.position.set(0, 0.075, 0); g.add(body)
  // 身体：两片冲压锡壳（左右）+ 中缝铆钉
  const torso = mesh(new THREE.SphereGeometry(0.06, 28, 20), tin, 'wbTorso'); torso.scale.set(0.82, 0.78, 1.2); body.add(torso)
  const seam = mesh(new THREE.TorusGeometry(0.0702, 0.0018, 6, 48), steel, 'wbSeam'); seam.rotation.y = Math.PI / 2; seam.scale.set(1.2, 0.78, 1); body.add(seam)
  const riv = new THREE.SphereGeometry(0.0028, 8, 6)
  for (let k = 0; k < 18; k++) { const a = (k / 18) * Math.PI * 2; const r = mesh(riv, steel, 'wbRivet'); r.position.set(0, Math.sin(a) * 0.0468, Math.cos(a) * 0.072); body.add(r) }
  // 腹部检修板（四颗螺丝）
  const plate = mesh(rbox(0.04, 0.03, 0.002, 0.004), dark, 'wbPlate'); plate.position.set(0.0, -0.044, 0.01); plate.rotation.x = Math.PI / 2; body.add(plate)
  // 头（挂颈关节）
  const head = new THREE.Group(); head.name = 'wbHead'; head.position.set(0, 0.035, 0.06); body.add(head)
  const skull = mesh(new THREE.SphereGeometry(0.038, 24, 18), tin, 'wbSkull'); skull.scale.set(0.9, 0.95, 1.15); skull.position.set(0, 0.02, 0.018); head.add(skull)
  const snout = mesh(new THREE.SphereGeometry(0.02, 16, 12), tin, 'wbSnout'); snout.position.set(0, 0.008, 0.055); snout.scale.set(1, 0.85, 0.9); head.add(snout)
  const nose = mesh(new THREE.SphereGeometry(0.0055, 10, 8), pink, 'wbNose'); nose.position.set(0, 0.012, 0.073); head.add(nose)
  const hseam = mesh(new THREE.TorusGeometry(0.037, 0.0012, 5, 36), steel, 'wbHeadSeam'); hseam.rotation.y = Math.PI / 2; hseam.position.set(0, 0.02, 0.018); hseam.scale.set(1.15, 0.95, 1); head.add(hseam)
  for (const s of [1, -1]) {
    // 玻璃眼（红色玻璃珠 + 黄铜眼圈）
    const ring = mesh(new THREE.TorusGeometry(0.0095, 0.0018, 6, 20), brass, 'wbEyeRing'); ring.position.set(s * 0.029, 0.03, 0.035); ring.rotation.y = s * 1.1; head.add(ring)
    const eye = mesh(new THREE.SphereGeometry(0.0088, 16, 12), glass, 'wbEye'); eye.position.set(s * 0.028, 0.03, 0.035); head.add(eye)
    // 冲压锡片耳（外层锡皮 + 内层粉漆），根部铰链销
    const ear = new THREE.Group(); ear.name = s > 0 ? 'wbEarL' : 'wbEarR'; ear.position.set(s * 0.016, 0.052, 0.006); ear.rotation.set(-0.25, 0, -s * 0.18); head.add(ear)
    const shp = new THREE.Shape(); shp.moveTo(-0.011, 0); shp.quadraticCurveTo(-0.017, 0.05, 0, 0.085); shp.quadraticCurveTo(0.017, 0.05, 0.011, 0); shp.lineTo(-0.011, 0)
    const eg = new THREE.ExtrudeGeometry(shp, { depth: 0.002, bevelEnabled: false, curveSegments: 10 }); eg.translate(0, 0, -0.001)
    ear.add(mesh(eg, tin, 'wbEarTin'))
    const inner = new THREE.Shape(); inner.moveTo(-0.0065, 0.008); inner.quadraticCurveTo(-0.011, 0.05, 0, 0.074); inner.quadraticCurveTo(0.011, 0.05, 0.0065, 0.008); inner.lineTo(-0.0065, 0.008)
    const ei = mesh(new THREE.ShapeGeometry(inner, 8), pink, 'wbEarPink'); ei.position.z = 0.0012; ear.add(ei)
    const pin = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.012, 10), steel, 'wbEarPin'); pin.rotation.z = Math.PI / 2; ear.add(pin)
    // 胡须：几根钢丝
    for (let k = 0; k < 3; k++) { const w = mesh(new THREE.CylinderGeometry(0.0004, 0.0003, 0.05, 4), steel, 'wbWhisker'); w.position.set(s * 0.03, 0.006 - k * 0.004, 0.06); w.rotation.set(0, 0, s * (Math.PI / 2 - 0.15 + k * 0.12)); head.add(w) }
  }
  // 四肢：铰接的冲压腿，关节处铆钉销（可绕 X 轴转）
  const leg = (name: string, x: number, z: number, len: number, front: boolean) => {
    const pv = new THREE.Group(); pv.name = name; pv.position.set(x, -0.012, z); body.add(pv)
    const th = mesh(new THREE.CapsuleGeometry(front ? 0.011 : 0.018, len * 0.5, 4, 10), tin, name + 'Thigh'); th.position.y = -len * 0.35; th.rotation.x = front ? 0.15 : -0.35; pv.add(th)
    const pin = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.006, 12), steel, name + 'Pin'); pin.rotation.z = Math.PI / 2; pin.position.x = Math.sign(x) * (front ? 0.012 : 0.019); pv.add(pin)
    // 小腿：一根钢连杆（露出机械）连到脚掌，上下两颗铆钉
    const rod = mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.04, 8), steel, name + 'Rod'); rod.position.set(0, -0.045, front ? 0.004 : 0.008); rod.rotation.x = front ? 0.1 : -0.25; pv.add(rod)
    for (const yy of [-0.028, -0.062]) { const rv = mesh(new THREE.SphereGeometry(0.0034, 8, 6), steel, name + 'Knuckle'); rv.position.set(0, yy, front ? 0.004 + (yy + 0.045) * -0.1 : 0.008 + (yy + 0.045) * 0.25); pv.add(rv) }
    const foot = mesh(new THREE.CapsuleGeometry(0.008, front ? 0.012 : 0.034, 4, 8), tin, name + 'Foot'); foot.rotation.x = Math.PI / 2; foot.position.set(0, -0.06, front ? 0.01 : 0.022); pv.add(foot)
    const sole = mesh(new THREE.BoxGeometry(0.014, 0.003, front ? 0.022 : 0.046), dark, name + 'Sole'); sole.position.set(0, -0.0675, front ? 0.01 : 0.022); pv.add(sole)
    return pv
  }
  const legFL = leg('wbLegFL', 0.025, 0.045, 0.06, true), legFR = leg('wbLegFR', -0.025, 0.045, 0.06, true)
  const legBL = leg('wbLegBL', 0.034, -0.035, 0.06, false), legBR = leg('wbLegBR', -0.034, -0.035, 0.06, false)
  // 尾巴：一团旧绒球
  const tail = mesh(new THREE.SphereGeometry(0.016, 12, 10), std({ color: '#e8e2d6', roughness: 1, map: windupFurTexture() ?? undefined }), 'wbTail'); tail.position.set(0, 0.012, -0.075); body.add(tail)
  // 背上发条钥匙（黄铜：方轴 + 两片蝶翼）
  const key = new THREE.Group(); key.name = 'wbKey'; key.position.set(0, 0.04, -0.028); key.rotation.x = -0.9; body.add(key)
  const shaft = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 10), brass, 'wbKeyShaft'); shaft.position.y = 0.012; key.add(shaft)
  const collar = mesh(new THREE.CylinderGeometry(0.0065, 0.0075, 0.004, 14), brass, 'wbKeyCollar'); collar.position.y = 0.0; key.add(collar)
  for (const s of [1, -1]) {
    const ws = new THREE.Shape(); ws.moveTo(0, 0); ws.bezierCurveTo(s * 0.006, 0.012, s * 0.028, 0.02, s * 0.026, 0.004); ws.bezierCurveTo(s * 0.024, -0.008, s * 0.006, -0.008, 0, 0)
    const wg = new THREE.ExtrudeGeometry(ws, { depth: 0.0024, bevelEnabled: true, bevelSize: 0.0008, bevelThickness: 0.0006, bevelSegments: 2, curveSegments: 10 }); wg.translate(0, 0, -0.0012)
    const wing = mesh(wg, brass, 'wbKeyWing'); wing.position.y = 0.028; key.add(wing)
    const hole = mesh(new THREE.TorusGeometry(0.0042, 0.0009, 5, 12), dark, 'wbKeyHole'); hole.position.set(s * 0.016, 0.033, 0.0014); key.add(hole)
  }
  g.userData.windup = { body, head, earL: head.getObjectByName('wbEarL'), earR: head.getObjectByName('wbEarR'), legFL, legFR, legBL, legBR, key, tail }
  return g
}

// ======================================================================
// 桌上铭牌「Spokeslady」（0.22 × 0.06 m；底面 y = 0、牌面朝 +Z）
// ======================================================================
export function buildNameplate(): THREE.Group {
  const g = new THREE.Group(); g.name = 'spokesNameplate'
  const c = canvas(512, 128)
  if (c) {
    const x = c.getContext('2d')!
    const gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#e8c76e'); gr.addColorStop(0.5, '#c79a3f'); gr.addColorStop(1, '#a9802f'); x.fillStyle = gr; x.fillRect(0, 0, 512, 128)
    for (let i = 0; i < 300; i++) { x.strokeStyle = `rgba(255,240,200,${0.05 + Math.random() * 0.06})`; x.beginPath(); const y = Math.random() * 128; x.moveTo(0, y); x.lineTo(512, y + (Math.random() - 0.5) * 3); x.stroke() }
    x.strokeStyle = '#6d4f19'; x.lineWidth = 4; x.strokeRect(10, 10, 492, 108)
    x.font = 'italic 700 64px "Noto Serif", "Noto Serif SC", Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'
    x.fillStyle = 'rgba(255,240,200,0.6)'; x.fillText('Spokeslady', 257, 67); x.fillStyle = '#3a2508'; x.fillText('Spokeslady', 256, 64)
  }
  const wood = std({ color: '#5a3520', roughness: 0.5, metalness: 0 })
  const base = mesh(new THREE.BoxGeometry(0.22, 0.016, 0.06), wood, 'npBase'); base.position.y = 0.008; g.add(base)
  const slope = mesh(new THREE.BoxGeometry(0.21, 0.05, 0.012), wood, 'npBack'); slope.position.set(0, 0.038, -0.006); slope.rotation.x = -0.32; g.add(slope)
  const plate = mesh(new THREE.PlaneGeometry(0.19, 0.042), std({ color: '#ffffff', map: tex(c), metalness: 0.85, roughness: 0.3 }), 'npPlate')
  plate.position.set(0, 0.04, 0.0005); plate.rotation.x = -0.32; plate.translateZ(0.0065); g.add(plate)
  return g
}

// ======================================================================
// 旧式木壳台式收音机（0.3 × 0.2 × 0.15 m；底面 y = 0、面板朝 +Z）
// ======================================================================
export function buildRadio(): THREE.Group {
  const g = new THREE.Group(); g.name = 'spokesRadio'
  const wood = std({ color: '#6b3d22', roughness: 0.45 }), woodDk = std({ color: '#3b2112', roughness: 0.5 }), bake = std({ color: '#d9c7a0', roughness: 0.35 })
  // 圆顶木壳（拱形截面挤出）
  const s = new THREE.Shape(); s.moveTo(-0.15, 0); s.lineTo(0.15, 0); s.lineTo(0.15, 0.14); s.absarc(0, 0.14, 0.15, 0, Math.PI, false); s.lineTo(-0.15, 0)
  const cg = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 3, curveSegments: 24 }); cg.translate(0, 0, -0.075); cg.scale(1, 0.72, 1)
  g.add(mesh(cg, wood, 'radioCase'))
  // 布面喇叭罩（拱形，竖条木格栅）
  const cc = canvas(256, 256)
  if (cc) { const x = cc.getContext('2d')!; x.fillStyle = '#7a6040'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 256; i += 2) { x.fillStyle = `rgba(${i % 4 ? '40,25,10' : '200,170,120'},0.25)`; x.fillRect(i, 0, 1, 256); x.fillRect(0, i, 256, 1) } }
  const cloth = litMaterial({ color: '#ffffff', map: tex(cc), roughness: 0.95 })
  const gs = new THREE.Shape(); gs.moveTo(-0.08, 0); gs.lineTo(0.08, 0); gs.lineTo(0.08, 0.06); gs.absarc(0, 0.06, 0.08, 0, Math.PI, false); gs.lineTo(-0.08, 0)
  const clothM = mesh(new THREE.ShapeGeometry(gs, 16), cloth, 'radioCloth'); clothM.position.set(0, 0.06, 0.0815); clothM.scale.set(1, 0.72, 1); g.add(clothM)
  for (let k = -3; k <= 3; k++) { const bar = mesh(new THREE.BoxGeometry(0.008, 0.11 - Math.abs(k) * 0.008, 0.006), woodDk, 'radioBar'); bar.position.set(k * 0.022, 0.06 + (0.11 - Math.abs(k) * 0.008) / 2, 0.085); g.add(bar) }
  // 调频刻度窗（米色胶木 + 刻度 + 红指针）
  const dc = canvas(256, 64)
  if (dc) { const x = dc.getContext('2d')!; x.fillStyle = '#efe0b8'; x.fillRect(0, 0, 256, 64); x.strokeStyle = '#3a2a1a'; for (let i = 0; i <= 40; i++) { x.lineWidth = i % 5 ? 1 : 2; x.beginPath(); x.moveTo(10 + i * 5.9, 10); x.lineTo(10 + i * 5.9, i % 5 ? 22 : 30); x.stroke() } x.font = '700 12px sans-serif'; x.fillStyle = '#3a2a1a'; ['55', '70', '90', '110', '140', '160'].forEach((t, i) => x.fillText(t, 6 + i * 46, 46)); x.fillStyle = '#c02020'; x.fillRect(150, 6, 3, 50) }
  const dial = mesh(new THREE.PlaneGeometry(0.15, 0.036), std({ color: '#ffffff', map: tex(dc), roughness: 0.2, emissive: '#3a2a10', emissiveIntensity: 0.4 }), 'radioDial'); dial.position.set(0, 0.035, 0.0815); g.add(dial)
  const bezel = mesh(new THREE.TorusGeometry(0.01, 0.002, 6, 4), bake, 'radioBezel'); bezel.visible = false; g.add(bezel)
  for (const x of [-0.105, 0.105]) { const knob = mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.016, 20), bake, 'radioKnob'); knob.rotation.x = Math.PI / 2; knob.position.set(x, 0.035, 0.088); g.add(knob); const cap = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.004, 16), woodDk, 'radioKnobCap'); cap.rotation.x = Math.PI / 2; cap.position.set(x, 0.035, 0.097); g.add(cap) }
  for (const x of [-0.12, 0.12]) for (const z of [-0.06, 0.06]) { const f = mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.008, 10), woodDk, 'radioFoot'); f.position.set(x, -0.004, z); g.add(f) }
  g.position.y = 0.008
  return g
}

// ======================================================================
// 墙上海报投递地洞 A / B（墙板 0.9 × 0.6 m；局部 +Z 朝外，底边 y = 0）
// ======================================================================
export function buildPosterDrops(): THREE.Group {
  const g = new THREE.Group(); g.name = 'spokesPosterDrops'
  const wood = std({ color: '#5b3822', roughness: 0.6 }), woodDk = std({ color: '#3a2214', roughness: 0.7 }), brass = std({ color: '#c9a24c', metalness: 1, roughness: 0.3 })
  const black = litMaterial({ color: '#030303' })
  const W = 0.9, H = 0.6
  const holes: [number, string, string][] = [[-0.21, 'A', '→ Level 1'], [0.21, 'B', '→ Level 11']]
  // 墙板：带两个圆角矩形洞
  const s = new THREE.Shape(); s.moveTo(-W / 2, 0); s.lineTo(W / 2, 0); s.lineTo(W / 2, H); s.lineTo(-W / 2, H); s.lineTo(-W / 2, 0)
  const hw = 0.16, hh = 0.22, hy = 0.2
  for (const [x] of holes) { const h = new THREE.Path(); h.moveTo(x - hw / 2, hy); h.lineTo(x + hw / 2, hy); h.lineTo(x + hw / 2, hy + hh - 0.04); h.quadraticCurveTo(x + hw / 2, hy + hh, x + hw / 2 - 0.04, hy + hh); h.lineTo(x - hw / 2 + 0.04, hy + hh); h.quadraticCurveTo(x - hw / 2, hy + hh, x - hw / 2, hy + hh - 0.04); h.lineTo(x - hw / 2, hy); s.holes.push(h) }
  const pg = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2, curveSegments: 8 })
  g.add(mesh(pg, wood, 'dropPanel'))
  for (const [x, letter, sub] of holes) {
    // 洞里：往后斜下的黑色通道（看进去是一片黑）
    const tunnel = mesh(new THREE.BoxGeometry(hw, hh, 0.4), black, 'dropTunnel'); tunnel.position.set(x, hy + hh / 2 - 0.02, -0.18); tunnel.rotation.x = 0.25; g.add(tunnel)
    // 黄铜框 + 上沿翻板（半开）
    const fr = mesh(new THREE.TorusGeometry(0.001, 0.001, 3, 3), brass); fr.visible = false; g.add(fr)
    for (const [w, h, px, py] of [[hw + 0.02, 0.012, x, hy - 0.006], [hw + 0.02, 0.012, x, hy + hh + 0.006], [0.012, hh, x - hw / 2 - 0.006, hy + hh / 2], [0.012, hh, x + hw / 2 + 0.006, hy + hh / 2]] as number[][]) { const b = mesh(new THREE.BoxGeometry(w, h, 0.012), brass, 'dropFrame'); b.position.set(px, py, 0.038); g.add(b) }
    const flap = mesh(new THREE.BoxGeometry(hw - 0.01, hh * 0.45, 0.004), woodDk, 'dropFlap'); flap.geometry.translate(0, -hh * 0.225, 0); flap.position.set(x, hy + hh - 0.005, 0.03); flap.rotation.x = -0.55; g.add(flap)
    // 字牌
    const c = canvas(256, 128)
    if (c) { const t = c.getContext('2d')!; const gr = t.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#e9c873'); gr.addColorStop(1, '#a7802e'); t.fillStyle = gr; t.fillRect(0, 0, 256, 128); t.strokeStyle = '#5a3f12'; t.lineWidth = 5; t.strokeRect(6, 6, 244, 116); t.fillStyle = '#2e1d06'; t.textAlign = 'center'; t.font = '900 70px Georgia, serif'; t.fillText(letter, 128, 78); t.font = '700 20px Georgia, serif'; t.fillText(sub, 128, 112) }
    const plate = mesh(new THREE.PlaneGeometry(0.1, 0.05), std({ color: '#ffffff', map: tex(c), metalness: 0.85, roughness: 0.3 }), 'dropPlate'); plate.position.set(x, hy + hh + 0.06, 0.0375); g.add(plate)
    // 洞口里露出一角被塞进去的海报
    const peek = mesh(new THREE.PlaneGeometry(0.1, 0.07), litMaterial({ color: '#efe3c6' }), 'dropPeek'); peek.position.set(x + 0.01, hy + 0.03, 0.0); peek.rotation.x = -1.2; g.add(peek)
  }
  return g
}
