// v78：悲尸（Entity 15）重制模型——基于复古人体（retroNpc / retroAvatar）做第三阶段的腐坏改造。
// 参照中文维基 Entity 15 与用户附图（红褐肉色、唇已溶解露出裂到脸颊的一大排参差黄牙、黑眼圈里充血的外露眼球、
// 颅顶缺一块露出发黄的脑）。
// · 生前身份：随机路人（randomAvatar）的体型、衣物款式与配色做底——衣服被撕烂（图集上撕出破洞、泼上污渍，alphaTest 镂空），
//   破洞里露出底下的身体；骨瘦如柴（四肢 ×0.74、腰收窄、无肚腩）。
// · 皮肤：程序化红褐干裂纹理（脸面按照片脸的五官坐标绘制：黑眼圈、塌掉的鼻孔、裂开的齿槽；身体按位置平铺：
//   裂纹、脱屑、孔洞、脓疱、分泌物），替换照片脸与肤色。
// · 几何改造在 retroNpc 的 wretch 段：长牙、眼眶肉瘤、颅顶脑、淤泥滴、脓疱/孔洞、错位重生的牙与指甲、爪甲、
//   有智个体的锈铁管、突变个体的多余眼球/第三条手臂/肋骨翅膀。
// · 外露眼球是挂在头骨上的独立小网格：没有眼睑，在眼窝里不停乱转。
// · 动画（animateWretch）：蹒跚型驼背拖步、头歪向一侧；疾行型四肢着地的跃步；有智型较直立、手提铁管；
//   突变型抽搐；待机抓挠自己；撞门时肩撞 + 双拳捶打。模型正面 +X（内层转 90°）。
import * as THREE from 'three'
import type { Entity } from '../entities'
import { randomAvatar } from '../core/avatar'
import { buildRetroFigure, type RetroNpc, type RetroSpec, type RetroNpcTextures } from './retroNpc'
import { avatarSpec, POOL_META, retroBodyAtlas, loadRetroImg, RETRO_BASE } from './retroAvatar'
import { retroTexture } from './retroNpc'
import { wretchLook, type WretchKind } from '../entities/wretches'
import { litMaterial } from './shared'
import { disposeCharacterModel, retroTextureChanged } from './retroResources'

const mulberry = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const hasDoc = typeof document !== 'undefined'
const nearest = (t: THREE.Texture, repeat = false) => {
  t.minFilter = t.magFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.SRGBColorSpace
  t.userData.retroShared = true
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
const canvas = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const c = cv.getContext('2d')!
  draw(c)
  return cv
}
/** 皮肤底色（红褐），三档个体差异 */
const SKIN_TONES = [[124, 56, 48], [112, 48, 48], [132, 68, 54]]

/** 干裂红褐皮肤的通用笔触：斑驳、剥落、裂纹、孔洞、脓疱（wrap=平铺时每笔画九宫格） */
function paintSkin(c: CanvasRenderingContext2D, W: number, R: () => number, tone: number[], wrap: boolean, density = 1, avoid?: (x: number, y: number) => boolean) {
  const [r0, g0, b0] = tone
  c.fillStyle = `rgb(${r0},${g0},${b0})`; c.fillRect(0, 0, W, W)
  const each = (f: (ox: number, oy: number) => void) => { if (!wrap) return f(0, 0); for (const ox of [-W, 0, W]) for (const oy of [-W, 0, W]) f(ox, oy) }
  const dot = (x: number, y: number, r: number, col: string) => each((ox, oy) => { c.fillStyle = col; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
  for (let i = 0; i < 60 * density; i++) { // 斑驳：暗紫红淤斑 / 发亮的渗液斑
    const x = R() * W, y = R() * W, r = W * (0.03 + R() * 0.12)
    dot(x, y, r, R() < 0.6 ? `rgba(70,18,20,${0.08 + R() * 0.12})` : `rgba(190,110,80,${0.06 + R() * 0.1})`)
  }
  for (let i = 0; i < 26 * density; i++) { // 剥落的皮屑：浅色碎片 + 下方暗边
    const x = R() * W, y = R() * W, w = W * (0.02 + R() * 0.05), h = w * (0.4 + R() * 0.6), a = R() * Math.PI
    each((ox, oy) => {
      c.save(); c.translate(x + ox, y + oy); c.rotate(a)
      c.fillStyle = 'rgba(60,14,12,0.55)'; c.fillRect(-w / 2 + 1, -h / 2 + 1, w, h)
      c.fillStyle = `rgba(${200 + R() * 30},${130 + R() * 30},${100 + R() * 20},0.75)`; c.fillRect(-w / 2, -h / 2, w, h)
      c.restore()
    })
  }
  for (let i = 0; i < 20 * density; i++) { // 干裂纹
    let x = R() * W, y = R() * W, a = R() * Math.PI * 2
    const pts: [number, number][] = [[x, y]]
    for (let k = 0; k < 6; k++) { a += (R() - 0.5) * 1.4; x += Math.cos(a) * W * 0.04; y += Math.sin(a) * W * 0.04; pts.push([x, y]) }
    each((ox, oy) => { c.strokeStyle = 'rgba(40,8,8,0.7)'; c.lineWidth = 1; c.beginPath(); pts.forEach(([px, py], k) => (k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy))); c.stroke() })
  }
  for (let i = 0; i < 14 * density; i++) { // 孔洞：暗心 + 红肉边
    const x = R() * W, y = R() * W
    if (avoid?.(x, y)) continue
    const r = W * (0.012 + R() * 0.022)
    dot(x, y, r * 1.6, 'rgba(150,40,34,0.9)'); dot(x, y, r, 'rgba(22,4,4,1)')
  }
  for (let i = 0; i < 16 * density; i++) { // 脓疱：黄褐泡 + 高光
    const x = R() * W, y = R() * W
    if (avoid?.(x, y)) continue
    const r = W * (0.01 + R() * 0.018)
    dot(x, y, r * 1.5, 'rgba(90,24,18,0.8)'); dot(x, y, r, 'rgba(196,146,72,1)'); dot(x - r * 0.3, y - r * 0.3, r * 0.35, 'rgba(250,226,160,1)')
  }
  const img = c.getImageData(0, 0, W, W), d = img.data
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 18; d[i] += n; d[i + 1] += n * 0.6; d[i + 2] += n * 0.5 }
  c.putImageData(img, 0, 0)
}

const faceCache = new Map<number, THREE.Texture>()
/** 脸面：按照片脸统一构图（POOL_META landmarks）绘制——黑眼圈、塌平的鼻孔、裂到脸颊的齿槽、下巴上的淤泥痕 */
function wretchFace(v: number): THREE.Texture {
  let t = faceCache.get(v)
  if (t) return t
  if (!hasDoc) { t = nearest(new THREE.Texture()); faceCache.set(v, t); return t }
  const W = 128, [eyeV, noseV, mouthV, , eyeUL, eyeUR] = POOL_META.landmarks
  const R = mulberry(0xf15 + v * 77)
  const cv = canvas(W, W, (c) => {
    const ey = eyeV * W, ny = noseV * W, my = mouthV * W
    paintSkin(c, W, R, SKIN_TONES[v % 3], false, 0.8, (_x, y) => Math.abs(y - ey) < 14 || Math.abs(y - my) < 12)
    // 额头深纹 + 抓痕
    for (let i = 0; i < 5; i++) { c.strokeStyle = 'rgba(50,10,10,0.6)'; c.lineWidth = 1; c.beginPath(); const y = ey - 16 - i * 5 - R() * 3; c.moveTo(30 + R() * 10, y); c.quadraticCurveTo(64, y - 4 + R() * 6, 98 - R() * 10, y); c.stroke() }
    // 黑眼圈：眼睑溶解后的深窝（暗紫红 → 近黑），内圈一道红肉
    for (const u of [eyeUL, eyeUR]) {
      const x = u * W
      const g = c.createRadialGradient(x, ey, 2, x, ey, 17)
      g.addColorStop(0, 'rgba(10,2,2,1)'); g.addColorStop(0.45, 'rgba(26,6,8,1)'); g.addColorStop(0.62, 'rgba(120,30,30,0.95)'); g.addColorStop(0.8, 'rgba(70,16,18,0.7)'); g.addColorStop(1, 'rgba(70,16,18,0)')
      c.fillStyle = g; c.beginPath(); c.ellipse(x, ey, 17, 13, 0, 0, Math.PI * 2); c.fill()
    }
    // 软骨溶解：鼻子只剩两个歪斜的孔
    for (const s of [-1, 1]) { c.fillStyle = 'rgba(120,32,28,1)'; c.beginPath(); c.ellipse(64 + s * 5, ny, 4, 6, s * 0.4, 0, Math.PI * 2); c.fill(); c.fillStyle = '#120303'; c.beginPath(); c.ellipse(64 + s * 5, ny + 1, 2.4, 4, s * 0.4, 0, Math.PI * 2); c.fill() }
    // 嘴：嘴唇溶解，裂开一道从嘴角到脸颊的暗槽（几何的长牙插在这里）
    c.fillStyle = 'rgba(110,24,24,1)'
    c.beginPath(); c.moveTo(8, my); c.quadraticCurveTo(64, my - 16, 120, my); c.quadraticCurveTo(64, my + 20, 8, my); c.fill()
    c.fillStyle = '#140303'
    c.beginPath(); c.moveTo(14, my); c.quadraticCurveTo(64, my - 10, 114, my); c.quadraticCurveTo(64, my + 13, 14, my); c.fill()
    // 下巴淌下的棕色淤泥
    for (let i = 0; i < 4; i++) { const x = 40 + R() * 48; const g = c.createLinearGradient(0, my + 6, 0, W); g.addColorStop(0, 'rgba(80,48,18,0.9)'); g.addColorStop(1, 'rgba(80,48,18,0)'); c.fillStyle = g; c.fillRect(x, my + 6, 2 + R() * 3, W - my - 6) }
  })
  t = nearest(new THREE.CanvasTexture(cv))
  faceCache.set(v, t)
  return t
}

const tileCache = new Map<number, THREE.Texture>()
/** 身体：可平铺的红褐干裂皮肤（按位置 UV 平铺在颈、手臂、腿、躯干、后脑上） */
function wretchSkinTile(v: number): THREE.Texture {
  let t = tileCache.get(v)
  if (t) return t
  if (!hasDoc) { t = nearest(new THREE.Texture(), true); tileCache.set(v, t); return t }
  const R = mulberry(0x5c1 + v * 31)
  const cv = canvas(64, 64, (c) => {
    paintSkin(c, 64, R, SKIN_TONES[v % 3], true, 1)
    // 浅浅的肋骨/筋腱横纹（瘦得皮包骨）
    for (let y = 4; y < 64; y += 11) { c.fillStyle = 'rgba(60,14,14,0.18)'; c.fillRect(0, y, 64, 2); c.fillStyle = 'rgba(200,120,96,0.12)'; c.fillRect(0, y - 2, 64, 1) }
  })
  t = nearest(new THREE.CanvasTexture(cv), true)
  tileCache.set(v, t)
  return t
}

const tornCache = new Map<string, THREE.Texture>()
/** 撕烂的衣物：在 128² 衣物图集上撕出破洞（alpha=0）、下摆/袖口/裤脚撕成参差的布条，泼上血污与淤泥 */
function tornAtlas(topStyle: number, pantsStyle: number, v: number): THREE.Texture {
  const key = `${topStyle}/${pantsStyle}/${v}`
  let t = tornCache.get(key)
  if (t) return t
  if (!hasDoc) { t = retroBodyAtlas(topStyle, pantsStyle); tornCache.set(key, t); return t }
  const cv = document.createElement('canvas'); cv.width = cv.height = 128
  // An opaque cloth placeholder avoids a temporarily naked model on slow loads.
  const fallback = cv.getContext('2d')!
  fallback.fillStyle = '#6e6358'; fallback.fillRect(0, 0, 128, 128)
  const ct = nearest(new THREE.CanvasTexture(cv))
  ct.userData.ready = false
  Promise.all([loadRetroImg(`${RETRO_BASE}/cloth/top-${topStyle}.png`), loadRetroImg(`${RETRO_BASE}/cloth/pants-${pantsStyle}.png`)]).then(([top, pants]) => {
    const c = cv.getContext('2d')!
    c.imageSmoothingEnabled = false
    c.drawImage(top, 0, 0, 128, 128)
    c.drawImage(pants, 64, 64, 64, 64)
    const R = mulberry(0x7a4 + v * 131 + topStyle * 7 + pantsStyle)
    // 污渍：暗红褐血污 + 棕色淤泥 + 整体发灰发脏
    c.globalCompositeOperation = 'multiply'
    c.fillStyle = 'rgb(206,194,176)'; c.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 26; i++) {
      const x = R() * 128, y = R() * 128, r = 3 + R() * 12
      c.fillStyle = R() < 0.55 ? `rgba(110,30,26,${0.5 + R() * 0.4})` : `rgba(96,66,30,${0.4 + R() * 0.4})`
      c.beginPath(); c.ellipse(x, y, r, r * (0.5 + R()), R() * 3, 0, Math.PI * 2); c.fill()
      if (R() < 0.5) c.fillRect(x - 1, y, 2 + R() * 2, 6 + R() * 18) // 往下淌
    }
    c.globalCompositeOperation = 'destination-out'
    const blob = (x: number, y: number, r: number) => {
      c.beginPath()
      const n = 7 + Math.floor(R() * 4)
      for (let k = 0; k <= n; k++) { const a = (k / n) * Math.PI * 2, rr = r * (0.55 + R() * 0.7); k ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8) : c.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.8) }
      c.fill()
    }
    c.fillStyle = '#000'
    // 上衣正/背面（y 0~64，领口在上、下摆在 y≈62）：散布的破洞 + 下摆撕成布条
    for (let i = 0; i < 7; i++) blob(4 + R() * 120, 12 + R() * 44, 2.5 + R() * 5.5)
    for (let x = 0; x < 128; x += 3 + R() * 5) { const h = 2 + R() * 10; c.fillRect(x, 64 - h, 1 + R() * 3, h) }
    // 袖子（左下：袖口在 y≈120）：袖口撕碎 + 几个洞
    for (let i = 0; i < 3; i++) blob(4 + R() * 56, 74 + R() * 34, 2 + R() * 4)
    for (let x = 0; x < 64; x += 2 + R() * 4) { const h = 4 + R() * 22; c.fillRect(x, 128 - h, 1 + R() * 3, h) }
    // 裤腿（右下：裤脚在 y≈126）：膝盖破洞 + 裤脚碎成条
    for (let i = 0; i < 4; i++) blob(66 + R() * 60, 78 + R() * 34, 2.5 + R() * 4.5)
    for (let x = 64; x < 128; x += 2 + R() * 4) { const h = 3 + R() * 16; c.fillRect(x, 128 - h, 1 + R() * 3, h) }
    c.globalCompositeOperation = 'source-over'
    ct.needsUpdate = true
    ct.userData.ready = true
    retroTextureChanged()
  }).catch(() => { ct.userData.ready = true; ct.userData.loadError = key; retroTextureChanged() })
  tornCache.set(key, ct)
  return ct
}

/** 外露眼球：泛黄的巩膜布满血丝，琥珀/浑浊的虹膜，小瞳孔（局部 +Z 朝前） */
let eyeGeo: THREE.BufferGeometry | null = null
function eyeAssets() {
  if (!eyeGeo) {
    const g = new THREE.SphereGeometry(1, 12, 9)
    const pa = g.attributes.position, col: number[] = []
    const R = mulberry(0xe7e)
    const v = new THREE.Vector3()
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i)
      let c: [number, number, number]
      if (v.z > 0.9) c = [0.04, 0.02, 0.02]
      else if (v.z > 0.7) c = [0.52, 0.34, 0.12]
      else if (v.z > 0.62) c = [0.3, 0.14, 0.06]
      else { const vein = Math.sin(Math.atan2(v.y, v.x) * 9 + v.z * 6) > 0.55 || R() < 0.12; c = vein ? [0.72, 0.16, 0.12] : [0.92, 0.86, 0.66] }
      col.push(...c)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    eyeGeo = g
  }
  // Only the CPU template is cached. A model owns its GPU geometry/material.
  const mat = litMaterial({ vertexColors: true, roughness: 0.4, flatShading: true })
  mat.name = 'wretch eye'
  return { geo: eyeGeo.clone(), mat }
}

export interface WretchRig { npc: RetroNpc; kind: WretchKind; eyes: THREE.Mesh[]; inner: THREE.Group; asym: number; look: { t: number; ax: number[]; ay: number[] } }

/** 悲尸的 RetroSpec：随机路人底子 + 枯瘦体型 + 变体差异（纯数据，供测试/预览） */
export function wretchSpec(seed: number, kind?: WretchKind): { spec: RetroSpec; topStyle: number; pantsStyle: number } {
  const look = wretchLook(seed, kind)
  const av = randomAvatar(mulberry((seed * 2654435761) >>> 0))
  const base = avatarSpec(av, { seed: seed % 100000 })
  const r = mulberry(seed * 7 + 3)
  const thin = look.kind === 'sprinter' ? 0.66 : look.kind === 'mutant' ? 0.8 : 0.74
  // 脱发：只剩寸头/稀疏短发/光头；颅顶溶穿的个体一律光头
  const hair = look.brain ? 'none' : (['none', 'buzz', 'short', 'none'] as const)[Math.floor(r() * 4)]
  const spec: RetroSpec = {
    ...base,
    name: `wretch${seed}`,
    height: base.height * (look.kind === 'smart' ? 1.0 : look.kind === 'mutant' ? 1.04 : 0.98 + r() * 0.04),
    shoulder: base.shoulder * 0.94,
    waist: base.waist * 0.8,
    hip: base.hip * 0.92,
    limb: base.limb * thin,
    belly: 0,
    jaw: base.jaw * 0.94,
    neckAdj: (base.neckAdj ?? 0) + 0.01,
    hair,
    hairTint: 0x2a2420,
    beard: 0, glasses: 0, gloves: undefined, badge: undefined, headgear: {},
    skinTint: undefined,
    top: { ...base.top, tint: shade(base.top.tint ?? 0x888888, 0.9) },
    pants: { ...base.pants, tint: shade(base.pants.tint ?? 0x555555, 0.9) },
    wretch: { seed, variant: look.kind, brain: look.brain, mutant: look.mutant, pipe: look.pipe },
    pose: 'neutral',
  }
  return { spec, topStyle: av.topStyle, pantsStyle: av.pantsStyle }
}
function shade(c: number, k: number) {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k
  // 发灰：往暗褐色靠一点
  return (Math.round(r * 0.8 + 40 * 0.2) << 16) | (Math.round(g * 0.8 + 28 * 0.2) << 8) | Math.round(b * 0.8 + 20 * 0.2)
}

export function buildWretchMesh(seed = 0, kind?: WretchKind): THREE.Group {
  const { spec, topStyle, pantsStyle } = wretchSpec(seed, kind)
  const v = ((seed % 3) + 3) % 3
  const face = wretchFace(v)
  const tex: RetroNpcTextures = {
    face, faceBlink: face, // 眼睑已溶解——不会眨眼
    body: tornAtlas(topStyle, pantsStyle, ((seed % 4) + 4) % 4),
    hair: retroTexture(`${RETRO_BASE}/cloth/hair-crop.png`),
    skinTile: wretchSkinTile(v),
  }
  const npc = buildRetroFigure(spec, POOL_META, tex, { seed, driven: true })
  const grp = new THREE.Group()
  grp.name = 'Wretch'
  const inner = new THREE.Group()
  inner.rotation.y = Math.PI / 2 // 复古人体正面 +Z → 实体正面 +X
  inner.add(npc.group)
  grp.add(inner)
  const eyes: THREE.Mesh[] = []
  if (npc.anchors) {
    const { geo, mat } = eyeAssets()
    for (const a of npc.anchors.eyes) {
      const m = new THREE.Mesh(geo, mat)
      m.position.set(a[0], a[1], a[2])
      m.scale.setScalar(npc.anchors.eyeR)
      m.name = 'wretchEye'
      npc.bones.head.add(m)
      eyes.push(m)
    }
  }
  grp.userData.entityType = 'wretch'
  grp.userData.parts = {} // 不走通用部件动画
  grp.userData.retro = npc
  const R = mulberry(seed + 99)
  const rig: WretchRig = { npc, kind: spec.wretch!.variant, eyes, inner, asym: R(), look: { t: 0, ax: [0, 0], ay: [0, 0] } }
  grp.userData.wretchRig = rig
  grp.userData.dispose = () => disposeCharacterModel(grp)
  return grp
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const E = new THREE.Euler()
const setR = (b: THREE.Bone, x: number, y: number, z: number) => b.quaternion.setFromEuler(E.set(x, y, z, 'XYZ'))

/**
 * 渲染层每帧驱动。骨骼局部轴（绑定姿态无旋转）：rotation.x 正 = 躯干/头向前（+Z）弯、手臂/腿向后摆；
 * 左臂 rotation.z 正 = 外展（右臂取负）。
 */
export function animateWretch(grp: THREE.Group, e: Entity, time: number, gz: number) {
  const r = grp.userData.wretchRig as WretchRig | undefined
  if (!r) return
  const B = r.npc.bones, s = e.wr, kind = r.kind
  const t = time + e.id * 0.913
  const last = grp.userData.wrLast as [number, number] | undefined
  const vel = last && time > last[1] ? Math.min(8, (e.animT - last[0]) / (time - last[1])) : 0
  grp.userData.wrLast = [e.animT, time]
  const mv = grp.userData.wrMv = lerp((grp.userData.wrMv as number) ?? 0, Math.min(1, vel / 1.5), 0.15)
  const hostile = e.state === 'chase' || e.state === 'attack' || e.state === 'investigate'
  const runK = kind === 'sprinter' ? Math.min(1, vel / 3) : 0
  const run = grp.userData.wrRun = lerp((grp.userData.wrRun as number) ?? 0, runK, 0.1)
  const lk = Math.max(0, e.lungeT) / 0.5
  const strike = lk > 0 ? (lk > 0.4 ? (1 - lk) / 0.6 : 1) : 0
  const bash = !!s?.bashS
  const scratch = s && s.scratchT > 0 && !hostile ? Math.min(1, s.scratchT * 2) : 0
  const twitch = (kind === 'mutant' ? 2 : 1) * Math.max(0, Math.sin(t * 0.83) * Math.sin(t * 2.17) - 0.7) * 3.3
  const asym = r.asym - 0.5
  const stride = kind === 'sprinter' ? 0.62 : kind === 'smart' ? 1.0 : 1.25
  const g = e.animT * (Math.PI * 2 / stride)
  const amp = mv * (kind === 'smart' ? 0.42 : 0.36)

  // 躯干与头
  const hunch = kind === 'smart' ? 0.12 : kind === 'sprinter' ? 0.28 : 0.38
  let hipsDrop = 0
  setR(B.hips, 0, Math.sin(g) * 0.06 * mv, Math.sin(g) * (kind === 'shambler' ? 0.09 : 0.04) * mv + asym * 0.06)
  setR(B.spine, hunch * 0.6 + run * 0.75 + strike * 0.15 + (bash ? 0.25 + Math.sin(t * 11) * 0.12 : 0) + Math.sin(t * 1.3) * 0.02, 0, -asym * 0.1)
  setR(B.chest, hunch * 0.4 + run * 0.35 - strike * 0.05, Math.sin(g) * 0.05 * mv, asym * 0.12 + twitch * 0.08)
  B.chest.scale.set(1, 1, 1)
  setR(B.neck, -0.1 - run * 0.65 + twitch * 0.2, 0, 0)
  const headTilt = kind === 'smart' ? 0.08 : 0.35 + asym * 0.3
  const lookY = hostile ? 0 : Math.sin(t * 0.4) * 0.5
  setR(B.head, -0.15 - run * 0.35 + Math.sin(t * 0.9) * 0.05 + twitch * 0.35, lookY + twitch * (Math.sin(t * 13) * 0.4), headTilt * (hostile ? 0.5 : 1) + Math.sin(t * 0.7) * 0.06)

  // 腿：蹒跚型一条腿拖着走；疾行型蛙跳式跃步（双腿同相）
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R'
    const th = B[('thigh' + L) as 'thighL'], sn = B[('shin' + L) as 'shinL'], ft = B[('foot' + L) as 'footL']
    const ph = side > 0 ? 0 : Math.PI
    const drag = kind === 'shambler' && (side > 0) === (asym > 0) ? 0.55 : 1
    if (run > 0.05) {
      const gg = g + (side > 0 ? 0 : 0.5)
      setR(th, lerp(-Math.sin(g + ph) * amp * drag, -0.9 - Math.sin(gg) * 0.55, run), 0, side * 0.08)
      setR(sn, lerp(Math.max(0, Math.sin(g + ph + 1.2)) * amp * 1.4, 1.2 + Math.max(0, Math.sin(gg + 1.4)) * 0.6, run), 0, 0)
      setR(ft, lerp(0, -0.3, run), 0, 0)
    } else {
      const crouch = kind === 'smart' ? 0.04 : 0.16
      setR(th, -Math.sin(g + ph) * amp * drag - crouch, 0, side * 0.04 + (kind === 'shambler' ? side * 0.04 : 0))
      setR(sn, Math.max(0, Math.sin(g + ph + 1.2)) * amp * 1.4 * drag + crouch * 1.6, 0, 0)
      setR(ft, -crouch * 0.6 + (drag < 1 ? 0.25 * mv : 0), 0, drag < 1 ? side * 0.15 : 0) // 拖着的脚尖朝内
    }
  }
  hipsDrop = kind === 'smart' ? 0.01 : 0.03 + run * 0.28
  r.npc.group.position.y = Math.abs(Math.sin(g * (run > 0.5 ? 1 : 2))) * amp * (run > 0.5 ? 0.12 : 0.04) - hipsDrop

  // 手臂
  for (const side of [1, -1]) {
    const L = side > 0 ? 'L' : 'R'
    const ua = B[('upperArm' + L) as 'upperArmL'], fa = B[('foreArm' + L) as 'foreArmL'], hd = B[('hand' + L) as 'handL']
    const ph = side > 0 ? Math.PI : 0
    const pipeArm = kind === 'smart' && side < 0
    let ax = -Math.sin(g + ph) * amp * 0.5 - 0.2 - hunch * 0.5, az = side * (0.08 + Math.sin(t * 0.8 + side) * 0.03), fx = -0.35, hz = 0
    if (kind === 'shambler' && (side > 0) !== (asym > 0)) { ax -= 0.25; fx -= 0.3 } // 一只手往前伸着
    if (run > 0.05) { // 四肢着地：手臂向下撑地、交替前探
      const gg = g + (side > 0 ? Math.PI * 0.5 : Math.PI * 1.5)
      ax = lerp(ax, -1.25 - Math.sin(gg) * 0.6, run); fx = lerp(fx, -0.2 + Math.max(0, Math.sin(gg + 1)) * -0.4, run); az = lerp(az, side * 0.15, run)
    }
    if (pipeArm) { ax = -0.15 - Math.sin(g + ph) * amp * 0.3; fx = -0.25 }
    if (scratch > 0 && side > 0) { // 抓挠：手伸到另一侧的颈/臂上来回挠
      const sc = Math.sin(t * 16) * 0.12
      ax = lerp(ax, -1.2 + sc, scratch); az = lerp(az, -0.55, scratch); fx = lerp(fx, -1.6 + sc, scratch); hz = sc
    }
    if (strike > 0) { // 前摇：双臂高抬前扑抓（有智型抡起铁管下砸）
      if (pipeArm) { const up = lk > 0.4; ax = up ? lerp(ax, -2.8, strike) : lerp(-2.8, -0.6, 1 - lk / 0.4); fx = up ? -0.5 : -0.1 }
      else { ax = lerp(ax, -1.55 + Math.sin(t * 9 + side) * 0.08, strike); fx = lerp(fx, -0.25, strike); az = lerp(az, side * -0.12, strike) }
    }
    if (bash) { const k = Math.sin(t * 11 + (side > 0 ? 0 : Math.PI)); ax = -1.45 - Math.max(0, k) * 0.5; fx = -0.6 + Math.max(0, k) * 0.4; az = side * -0.15 }
    setR(ua, ax, 0, az)
    setR(fa, fx, 0, 0)
    setR(hd, 0, 0, hz + (strike > 0 && !pipeArm ? side * 0.4 : 0))
  }
  setR(B.clavicleL, 0, 0, (asym > 0 ? -0.08 : 0.02))
  setR(B.clavicleR, 0, 0, (asym > 0 ? -0.02 : 0.08))

  // 外露的眼球：没有眼睑，在眼窝里乱转（猛跳 + 抖动）；追猎时多数时间盯前方
  const lo = r.look
  if (time > lo.t) {
    lo.t = time + (hostile ? 0.15 + Math.random() * 0.35 : 0.25 + Math.random() * 0.7)
    for (let i = 0; i < 2; i++) {
      const wild = Math.random() < (hostile ? 0.35 : 0.8)
      lo.ax[i] = wild ? (Math.random() - 0.5) * 1.4 : (Math.random() - 0.5) * 0.15
      lo.ay[i] = wild ? (Math.random() - 0.5) * 1.6 : (Math.random() - 0.5) * 0.2
    }
    if (Math.random() < 0.5) { lo.ax[1] = lo.ax[0]; lo.ay[1] = lo.ay[0] }
  }
  r.eyes.forEach((m, i) => { m.rotation.set(lo.ax[i] + Math.sin(t * 31 + i) * 0.03, lo.ay[i] + Math.cos(t * 27 + i) * 0.03, 0) })
  grp.position.y = gz
}
