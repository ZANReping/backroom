// L5「恐怖旅馆」1b：会看人的肖像。程序化 1920 年代油画（6 张面孔：画布用 canvas 画出暗底、衣领、发型、
// 面部明暗；眼窝留空），眼白 + 瞳孔是独立小圆片，renderer.updateStructs 每帧把瞳孔移向镜头。
// 翻过去的画（data.flipped）只露出麻布背面与木框。
import * as THREE from 'three'
import { makeCanvasCtx, toTex } from './shared'

export const PORTRAIT_FACES = 9 // [l5tails] 6 → 9（走廊肖像多样化；infiniteL5 L5_PORTRAIT_FACE_COUNT 同值）
const CW = 256, CH = 320
const EYE_V = 124, EYE_DU = 21 // 画布上眼睛的位置（像素）
interface Face { bg: [string, string]; skin: string; hair: string; hairStyle: number; coat: string; collar: string; age: number; name: string }
const FACES: Face[] = [
  { bg: ['#2a1d14', '#120b07'], skin: '#d9b38f', hair: '#2b1a10', hairStyle: 0, coat: '#16120f', collar: '#efe6d2', age: 0.4, name: '黑礼服的绅士' },
  { bg: ['#1d2420', '#0b0e0c'], skin: '#e6c2a2', hair: '#4a2a18', hairStyle: 1, coat: '#3a1418', collar: '#d9c08a', age: 0.2, name: '酒红长裙的夫人' },
  { bg: ['#2b2214', '#100c06'], skin: '#c99d78', hair: '#b9b2a6', hairStyle: 2, coat: '#1f2430', collar: '#f2ecdc', age: 0.9, name: '白发的老经理' },
  { bg: ['#241818', '#0e0909'], skin: '#dcb896', hair: '#111', hairStyle: 3, coat: '#101010', collar: '#e8dcc0', age: 0.3, name: '戴礼帽的门童' },
  { bg: ['#1a1c26', '#08090e'], skin: '#efd2b8', hair: '#c8a050', hairStyle: 4, coat: '#24301f', collar: '#efe2b8', age: 0.15, name: '金发的少女' },
  { bg: ['#2a2016', '#0f0b07'], skin: '#b88c6a', hair: '#3a2a1a', hairStyle: 5, coat: '#2a1f14', collar: '#c9b07a', age: 0.6, name: '留胡子的船长' },
  { bg: ['#1c1a20', '#08070a'], skin: '#e4cdb6', hair: '#141016', hairStyle: 1, coat: '#0e0c10', collar: '#3a3440', age: 0.5, name: '戴黑纱的寡妇' }, // [l5tails]
  { bg: ['#2a1a12', '#0e0806'], skin: '#d6ab86', hair: '#2a1a10', hairStyle: 3, coat: '#5a1a16', collar: '#c9a24a', age: 0.25, name: '红制服的电梯员' },
  { bg: ['#1a2218', '#080b07'], skin: '#a87e5e', hair: '#d9d4c8', hairStyle: 2, coat: '#3a3a3a', collar: '#efe9da', age: 1.0, name: '戴单片眼镜的老住客' },
]
export const portraitName = (i: number) => FACES[((i % PORTRAIT_FACES) + PORTRAIT_FACES) % PORTRAIT_FACES].name

const texCache = new Map<number, THREE.Texture>()
function paint(i: number): THREE.Texture {
  const hit = texCache.get(i); if (hit) return hit
  const f = FACES[i], [c, g] = makeCanvasCtx(CW, CH)
  // 暗底：中心偏上的微光
  const bg = g.createRadialGradient(CW * 0.5, CH * 0.36, 10, CW * 0.5, CH * 0.5, CH * 0.75)
  bg.addColorStop(0, f.bg[0]); bg.addColorStop(1, f.bg[1]); g.fillStyle = bg; g.fillRect(0, 0, CW, CH)
  // 油画笔触噪点
  for (let k = 0; k < 900; k++) { const x = Math.random() * CW, y = Math.random() * CH; g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,230,190' : '0,0,0'},${Math.random() * 0.05})`; g.fillRect(x, y, 2 + Math.random() * 6, 1 + Math.random() * 2) }
  const cx = CW / 2
  // 外套与肩
  g.fillStyle = f.coat; g.beginPath(); g.moveTo(cx - 92, CH); g.quadraticCurveTo(cx - 88, 214, cx - 30, 200); g.lineTo(cx + 30, 200); g.quadraticCurveTo(cx + 88, 214, cx + 92, CH); g.closePath(); g.fill()
  // 衣领 / 领巾
  g.fillStyle = f.collar; g.beginPath(); g.moveTo(cx - 24, 198); g.lineTo(cx, 252); g.lineTo(cx + 24, 198); g.closePath(); g.fill()
  if (i === 1 || i === 4) { g.fillStyle = f.collar; g.beginPath(); g.arc(cx, 216, 6, 0, Math.PI * 2); g.fill() } // 胸针
  // 脖子
  g.fillStyle = shade(f.skin, -0.18); g.fillRect(cx - 15, 168, 30, 36)
  // 后发（长发 / 卷发在脸后）
  g.fillStyle = f.hair
  if (f.hairStyle === 1 || f.hairStyle === 4) { g.beginPath(); g.ellipse(cx, 136, 56, 74, 0, 0, Math.PI * 2); g.fill() }
  // 脸：椭圆 + 侧光明暗
  const fg = g.createLinearGradient(cx - 44, 0, cx + 44, 0)
  fg.addColorStop(0, shade(f.skin, 0.08)); fg.addColorStop(0.55, f.skin); fg.addColorStop(1, shade(f.skin, -0.32))
  g.fillStyle = fg; g.beginPath(); g.ellipse(cx, 130, 40, 52, 0, 0, Math.PI * 2); g.fill()
  // 皱纹（年纪）
  g.strokeStyle = `rgba(60,30,20,${0.15 + f.age * 0.35})`; g.lineWidth = 1
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 14, 146); g.quadraticCurveTo(cx + s * 20, 158, cx + s * 16, 166); g.stroke() }
  if (f.age > 0.5) { g.beginPath(); g.moveTo(cx - 18, 100); g.lineTo(cx + 18, 100); g.stroke() }
  // 眼窝（3D 眼睛嵌在这里）
  for (const s of [-1, 1]) {
    const eg = g.createRadialGradient(cx + s * EYE_DU, EYE_V, 2, cx + s * EYE_DU, EYE_V, 13)
    eg.addColorStop(0, 'rgba(30,14,8,.9)'); eg.addColorStop(1, 'rgba(30,14,8,0)'); g.fillStyle = eg; g.beginPath(); g.arc(cx + s * EYE_DU, EYE_V, 13, 0, Math.PI * 2); g.fill()
    g.strokeStyle = 'rgba(40,20,10,.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + s * EYE_DU - 11, EYE_V - 11); g.quadraticCurveTo(cx + s * EYE_DU, EYE_V - 15, cx + s * EYE_DU + 11, EYE_V - 10); g.stroke() // 眉
  }
  // 鼻 / 嘴（嘴角被岁月磨平）
  g.strokeStyle = 'rgba(70,35,22,.75)'; g.lineWidth = 2
  g.beginPath(); g.moveTo(cx + 2, 128); g.lineTo(cx + 6, 148); g.lineTo(cx - 3, 150); g.stroke()
  g.strokeStyle = 'rgba(90,30,26,.85)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx - 12, 163); g.quadraticCurveTo(cx, 165, cx + 12, 163); g.stroke()
  if (f.hairStyle === 5) { g.fillStyle = f.hair; g.beginPath(); g.ellipse(cx, 168, 30, 16, 0, 0, Math.PI); g.fill(); g.fillRect(cx - 16, 156, 32, 6) } // 胡子
  // 前发
  g.fillStyle = f.hair
  if (f.hairStyle === 0) { g.beginPath(); g.ellipse(cx - 4, 88, 42, 20, -0.15, Math.PI, Math.PI * 2.05); g.fill() }
  else if (f.hairStyle === 1 || f.hairStyle === 4) { g.beginPath(); g.ellipse(cx, 86, 44, 22, 0, Math.PI, 0); g.fill(); for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 40, 120, 10, 34, 0, 0, Math.PI * 2); g.fill() } }
  else if (f.hairStyle === 2) { for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 38, 110, 9, 18, 0, 0, Math.PI * 2); g.fill() } }
  else if (f.hairStyle === 3) { g.fillStyle = '#0c0c0c'; g.fillRect(cx - 34, 52, 68, 36); g.fillRect(cx - 50, 84, 100, 8) } // 礼帽
  else { g.beginPath(); g.ellipse(cx, 86, 41, 18, 0, Math.PI, 0); g.fill() }
  if (i === 6) { g.fillStyle = 'rgba(10,8,12,.55)'; g.beginPath(); g.moveTo(cx - 52, 92); g.lineTo(cx + 52, 92); g.lineTo(cx + 44, 150); g.lineTo(cx - 44, 150); g.closePath(); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; for (let k = 0; k < 14; k++) { g.beginPath(); g.moveTo(cx - 52 + k * 8, 92); g.lineTo(cx - 44 + k * 7, 150); g.stroke() } } // [l5tails] 黑纱
  if (i === 7) { g.fillStyle = '#c9a24a'; for (const y of [212, 232, 252]) { g.beginPath(); g.arc(cx - 18, y, 3, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(cx + 18, y, 3, 0, Math.PI * 2); g.fill() } } // 铜扣
  if (i === 8) { g.strokeStyle = '#c9a24a'; g.lineWidth = 2; g.beginPath(); g.arc(cx + EYE_DU, EYE_V, 14, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.moveTo(cx + EYE_DU + 10, EYE_V + 10); g.quadraticCurveTo(cx + 46, 190, cx + 30, 230); g.stroke() } // 单片眼镜 + 链
  // 清漆泛黄 + 暗角
  const vg = g.createRadialGradient(cx, CH / 2, CH * 0.3, cx, CH / 2, CH * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, CW, CH)
  g.fillStyle = 'rgba(180,140,60,.08)'; g.fillRect(0, 0, CW, CH)
  const t = toTex(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(i, t); return t
}
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))))
  return `#${((f(r) << 16) | (f(gg) << 8) | f(b)).toString(16).padStart(6, '0')}`
}

const goldMat = new THREE.MeshLambertMaterial({ color: '#b08a3e', emissive: '#2a1a06' })
const goldDark = new THREE.MeshLambertMaterial({ color: '#6e5320' })
const backMat = new THREE.MeshLambertMaterial({ color: '#8a7a5c' })
const scleraMat = new THREE.MeshLambertMaterial({ color: '#e9dfc9' })
const pupilMat = new THREE.MeshBasicMaterial({ color: '#120806' })

export interface PortraitRig { inner: THREE.Group; front: THREE.Group; pupils: THREE.Mesh[]; base: THREE.Vector2[]; maxOff: number }
/** 肖像（内组朝 +z、以画面中心为原点）；返回组 userData.portrait = PortraitRig */
export function buildL5Portrait(face: number, pw: number, ph: number, flipped: boolean): THREE.Group {
  const i = ((face % PORTRAIT_FACES) + PORTRAIT_FACES) % PORTRAIT_FACES
  const inner = new THREE.Group(), front = new THREE.Group()
  inner.add(front)
  // 金框：四条斜角木条 + 内圈暗金线
  const fw = 0.09
  for (const [w, h, x, y] of [[pw + fw * 2, fw, 0, ph / 2 + fw / 2], [pw + fw * 2, fw, 0, -ph / 2 - fw / 2], [fw, ph, -pw / 2 - fw / 2, 0], [fw, ph, pw / 2 + fw / 2, 0]] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), goldMat); b.position.set(x, y, 0.03); inner.add(b)
  }
  for (const [w, h, x, y] of [[pw, 0.012, 0, ph / 2 - 0.006], [pw, 0.012, 0, -ph / 2 + 0.006], [0.012, ph, -pw / 2 + 0.006, 0], [0.012, ph, pw / 2 - 0.006, 0]] as const) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.01), goldDark); b.position.set(x, y, 0.062); inner.add(b)
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, 0.02), backMat); back.position.z = 0.012; inner.add(back)
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshLambertMaterial({ map: paint(i) }))
  canvas.position.z = 0.024; front.add(canvas)
  const pupils: THREE.Mesh[] = [], base: THREE.Vector2[] = []
  const er = pw * 0.034
  for (const s of [-1, 1]) {
    const x = ((CW / 2 + s * EYE_DU) / CW - 0.5) * pw, y = (0.5 - EYE_V / CH) * ph
    const sc = new THREE.Mesh(new THREE.CircleGeometry(er, 18), scleraMat); sc.position.set(x, y, 0.026); sc.scale.y = 0.62; front.add(sc)
    const pu = new THREE.Mesh(new THREE.CircleGeometry(er * 0.5, 14), pupilMat); pu.position.set(x, y, 0.028); front.add(pu)
    pupils.push(pu); base.push(new THREE.Vector2(x, y))
  }
  const g = new THREE.Group()
  g.name = 'l5portrait'
  g.add(inner)
  g.userData.portrait = { inner, front, pupils, base, maxOff: er * 0.5 } satisfies PortraitRig
  g.userData.face = i // [l5tails] 章鱼头沿用这幅画的衣着
  setPortraitFlipped(g, flipped)
  return g
}
export function setPortraitFlipped(g: THREE.Group, flipped: boolean) {
  const r = g.userData.portrait as PortraitRig | undefined
  if (!r) return
  r.front.visible = !flipped
  g.userData.flipped = flipped
}
const tmpV = new THREE.Vector3()
/** 瞳孔朝向 world 点 eye（镜头）；range 外回正。返回是否在「看」 */
export function aimPortrait(g: THREE.Group, eye: THREE.Vector3, range: number): boolean {
  const r = g.userData.portrait as PortraitRig | undefined
  if (!r || g.userData.flipped) return false
  tmpV.copy(eye); r.front.worldToLocal(tmpV)
  const d = tmpV.length(), on = d < range && tmpV.z > 0.2
  for (let k = 0; k < r.pupils.length; k++) {
    const b = r.base[k], p = r.pupils[k]
    let tx = b.x, ty = b.y
    if (on) { const ox = (tmpV.x - b.x) / d, oy = (tmpV.y - b.y) / d; tx = b.x + Math.max(-1, Math.min(1, ox * 2.2)) * r.maxOff; ty = b.y + Math.max(-1, Math.min(1, oy * 2.2)) * r.maxOff * 0.55 }
    p.position.x += (tx - p.position.x) * 0.25; p.position.y += (ty - p.position.y) * 0.25
  }
  return on
}

// [beast] 阶段 3：画像换成野兽的脸（beastProps.beastPortraitTexture，无框）——眼白 / 瞳孔移到贴图上那双墨鱼眼的位置、改成银金色
let beastTex: THREE.Texture | null | undefined
const beastScleraMat = new THREE.MeshLambertMaterial({ color: '#cfc48a', emissive: '#1a1608' })
/** on = 换成他（只在没人看着这幅画时由渲染层调用）；返回当前是否是他 */
export function setPortraitBeast(g: THREE.Group, on: boolean, tex?: () => THREE.Texture | null): boolean {
  const r = g.userData.portrait as PortraitRig | undefined
  if (!r) return false
  if (!!g.userData.beastFace === on) return on
  const canvas = r.front.children[0] as THREE.Mesh
  const mat = canvas.material as THREE.MeshLambertMaterial
  if (on) {
    if (beastTex === undefined) beastTex = tex?.() ?? null
    if (!beastTex) return false
    g.userData.humanMap ??= mat.map
    g.userData.humanBase ??= r.base.map((b) => b.clone())
    mat.map = beastTex; mat.needsUpdate = true
    const eyes = (beastTex.userData.eyes as [number, number][] | undefined) ?? [[0.42, 0.385], [0.586, 0.385]]
    const geo = canvas.geometry as THREE.PlaneGeometry, pw = geo.parameters.width, ph = geo.parameters.height
    let k = 0
    for (const c of r.front.children) {
      if (c === canvas || !(c as THREE.Mesh).isMesh) continue
      const m = c as THREE.Mesh, isPupil = r.pupils.includes(m), i = isPupil ? r.pupils.indexOf(m) : k++
      const [u, vv] = eyes[Math.min(1, i)]
      const x = (u - 0.5) * pw, y = (0.5 - vv) * ph
      m.position.x = x; m.position.y = y
      if (!isPupil) { m.userData.humanMat ??= m.material; m.material = beastScleraMat; m.scale.set(1.25, 0.8, 1) }
      else { r.base[i].set(x, y); m.scale.set(1.3, 0.55, 1) } // W 形瞳孔在贴图上；这里是一道横向的暗缝
    }
  } else {
    mat.map = g.userData.humanMap as THREE.Texture; mat.needsUpdate = true
    const hb = g.userData.humanBase as THREE.Vector2[] | undefined
    let k = 0
    for (const c of r.front.children) {
      if (c === canvas || !(c as THREE.Mesh).isMesh) continue
      const m = c as THREE.Mesh, isPupil = r.pupils.includes(m), i = isPupil ? r.pupils.indexOf(m) : k++
      if (hb) { m.position.x = hb[Math.min(1, i)].x; m.position.y = hb[Math.min(1, i)].y }
      if (!isPupil) { if (m.userData.humanMat) m.material = m.userData.humanMat as THREE.Material; m.scale.set(1, 0.62, 1) }
      else { if (hb) r.base[i].copy(hb[i]); m.scale.set(1, 1, 1) }
    }
  }
  g.userData.beastFace = on
  return on
}

// ---------- [l5tails] 低理智：章鱼头（视线外换脸，被看到 1 帧后恢复；engine/l5Tails.octoStep） ----------
const octoCache = new Map<number, THREE.Texture>()
/** 同一幅画的衣着 / 背景，头换成章鱼：圆鼓外套膜 + 眼位与原画相同（3D 眼睛不用挪）+ 垂到胸前的触腕 */
export function paintOcto(i: number): THREE.Texture {
  const hit = octoCache.get(i); if (hit) return hit
  const f = FACES[((i % PORTRAIT_FACES) + PORTRAIT_FACES) % PORTRAIT_FACES], [c, g] = makeCanvasCtx(CW, CH), cx = CW / 2
  const bg = g.createRadialGradient(cx, CH * 0.36, 10, cx, CH * 0.5, CH * 0.75)
  bg.addColorStop(0, f.bg[0]); bg.addColorStop(1, f.bg[1]); g.fillStyle = bg; g.fillRect(0, 0, CW, CH)
  g.fillStyle = f.coat; g.beginPath(); g.moveTo(cx - 92, CH); g.quadraticCurveTo(cx - 88, 214, cx - 30, 200); g.lineTo(cx + 30, 200); g.quadraticCurveTo(cx + 88, 214, cx + 92, CH); g.closePath(); g.fill()
  g.fillStyle = f.collar; g.beginPath(); g.moveTo(cx - 24, 198); g.lineTo(cx, 252); g.lineTo(cx + 24, 198); g.closePath(); g.fill()
  const skin = '#6e5a6a', dark = '#3a2834', lite = '#9c8494'
  // 触腕：8 条，从眼下垂到衣领 / 胸前，末端卷曲；带吸盘
  for (let k = 0; k < 8; k++) {
    const x0 = cx - 34 + k * 9.7, sw = (k % 2 ? 1 : -1) * (6 + (k * 7) % 11), len = 70 + ((k * 29) % 40)
    g.strokeStyle = k % 3 ? skin : dark; g.lineCap = 'round'
    for (let w = 13; w >= 3; w -= 2.5) { g.lineWidth = w; g.beginPath(); g.moveTo(x0, 140); g.bezierCurveTo(x0 + sw, 140 + len * 0.4, x0 - sw * 1.4, 140 + len * 0.8, x0 + sw * 0.8, 140 + len); g.stroke(); g.strokeStyle = shade(k % 3 ? skin : dark, 0.06) }
    g.fillStyle = 'rgba(220,190,200,.55)'
    for (let q = 0.3; q < 1; q += 0.14) { const y = 140 + len * q, x = x0 + sw * Math.sin(q * 5) * 0.8; g.beginPath(); g.arc(x, y, 2.2 * (1.1 - q), 0, Math.PI * 2); g.fill() }
  }
  // 外套膜（头）：上大下收，侧光
  const hg = g.createLinearGradient(cx - 60, 0, cx + 60, 0)
  hg.addColorStop(0, lite); hg.addColorStop(0.5, skin); hg.addColorStop(1, dark)
  g.fillStyle = hg; g.beginPath(); g.moveTo(cx - 44, 150); g.bezierCurveTo(cx - 70, 110, cx - 62, 30, cx, 26); g.bezierCurveTo(cx + 62, 30, cx + 70, 110, cx + 44, 150); g.closePath(); g.fill()
  g.fillStyle = 'rgba(20,10,16,.35)'; for (let k = 0; k < 40; k++) { const a = (k * 2.39996) % (Math.PI * 2), r = 10 + (k * 13) % 40; g.beginPath(); g.arc(cx + Math.cos(a) * r, 80 + Math.sin(a) * r * 0.9, 1.5 + (k % 3), 0, Math.PI * 2); g.fill() } // 色素斑
  // 眼窝（与人像同位：3D 眼白 / 瞳孔照旧对准镜头）
  for (const sd of [-1, 1]) { const eg = g.createRadialGradient(cx + sd * EYE_DU, EYE_V, 2, cx + sd * EYE_DU, EYE_V, 15); eg.addColorStop(0, 'rgba(20,6,10,.95)'); eg.addColorStop(1, 'rgba(20,6,10,0)'); g.fillStyle = eg; g.beginPath(); g.arc(cx + sd * EYE_DU, EYE_V, 15, 0, Math.PI * 2); g.fill() }
  const vg = g.createRadialGradient(cx, CH / 2, CH * 0.3, cx, CH / 2, CH * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, CW, CH)
  g.fillStyle = 'rgba(180,140,60,.08)'; g.fillRect(0, 0, CW, CH)
  const t = toTex(c); t.colorSpace = THREE.SRGBColorSpace; octoCache.set(i, t); return t
}
/** 换成 / 换回章鱼头（只换画布贴图；野兽脸优先） */
export function setPortraitOcto(g: THREE.Group, on: boolean): boolean {
  const r = g.userData.portrait as PortraitRig | undefined
  if (!r || g.userData.beastFace) return false
  if (!!g.userData.octo === on) return on
  const mat = (r.front.children[0] as THREE.Mesh).material as THREE.MeshLambertMaterial
  if (on) { g.userData.octoHuman ??= mat.map; mat.map = paintOcto(Number(g.userData.face ?? 0)) } else mat.map = (g.userData.octoHuman as THREE.Texture) ?? mat.map
  mat.needsUpdate = true
  g.userData.octo = on
  return on
}
