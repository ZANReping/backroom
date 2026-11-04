// [casino] Level 5.1 赌场渲染：大厅壳体（星纹地毯 / 黑大理石前厅与吧台区 / 墙纸 + 胡桃护墙板 + 黄铜线脚 / 藻井镜面吊顶 + 筒灯）
// + 全部装饰物模型 + 动画（跑马灯追逐、雨帘灯闪烁、老虎机屏幕滚轮、轮盘转动、灯光随机闪烁）。
// 合批：静态件按材质合并成一张网格；老虎机 / 高脚凳 / 筹码 / 筒灯 / 灯泡 / 酒瓶等重复件用 InstancedMesh。
// 坐标：地图 (x, y) → 世界 (x, ·, y)；道具 rot = 正面朝向的世界方向角 f（atan2(dy,dx)），模型局部 +Z 为正面 → rotation.y = π/2 − f。
// 跑马灯大门 buildCasinoMarquee 也给 L5 贝弗莉室北墙的 casinodoor 结构用（structures.buildStructure）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { casinoMaterial as cm, CARPET_TILE, type CasinoSurface } from './casinoMaterials'
import { casinoLayout, CASINO_H, CASINO_W, CASINO_D, OX, OY, SLOT_GLOW, type CasinoProp, type CarpetKind } from '../content/casinoLayout'
import { bakeCasinoLightmap, bakeVertexColors, bakeInstanceColors, LM_MAX, LM_GAIN } from './casinoBake'

const V3 = THREE.Vector3
const TAU = Math.PI * 2
function M(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new V3(sx, sy, sz))
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)
const cyl = (rt: number, rb: number, h: number, s = 20, open = false, t0 = 0, tl = TAU) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open, t0, tl)
const sph = (r: number, s = 10) => new THREE.SphereGeometry(r, s, Math.max(4, s >> 1))
const strip = (g: THREE.BufferGeometry) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g.index ? g : g }
/** 按材质合批 */
class Batch {
  map = new Map<THREE.Material, THREE.BufferGeometry[]>()
  add(g: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4) { const c = strip(g.index ? g.clone() : g.clone()); c.applyMatrix4(m); if (!c.index) c.setIndex([...Array(c.attributes.position.count).keys()]); const a = this.map.get(mat) ?? []; a.push(c); this.map.set(mat, a) }
  /** bake：逐顶点烘焙辐照度（自发光 / 透明 / Basic 材质跳过）；材质克隆一份开 vertexColors（绘制次数不变） */
  flush(parent: THREE.Object3D, name: string, bake = false) {
    for (const [mat, gs] of this.map) {
      const g = mergeGeometries(gs, false); gs.forEach((x) => x.dispose()); if (!g) continue
      let m = mat
      const std0 = mat as THREE.MeshStandardMaterial
      if (bake && std0.isMeshStandardMaterial && !std0.transparent && !(std0.emissiveIntensity > 0.5 && std0.emissive.getHex() !== 0)) { bakeVertexColors(g); m = std0.clone(); (m as THREE.MeshStandardMaterial).vertexColors = true; m.name = std0.name + '+bake'; BAKED.push(m) }
      const mesh = new THREE.Mesh(g, m); mesh.name = name; mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh)
    }
    this.map.clear()
  }
}
const BAKED: THREE.Material[] = []
/** 同一个零件铺很多份：InstancedMesh */
class Inst {
  parts: { g: THREE.BufferGeometry; mat: THREE.Material; ms: THREE.Matrix4[]; name: string }[] = []
  part(name: string, g: THREE.BufferGeometry, mat: THREE.Material) { const p = { g, mat, ms: [] as THREE.Matrix4[], name }; this.parts.push(p); return p }
  /** bake：每实例烘焙辐照度 → instanceColor（noBake 里的零件跳过；tint 给每实例基色） */
  flush(parent: THREE.Object3D, bake = false, noBake: string[] = [], tint: Record<string, (i: number) => THREE.Color | null> = {}) {
    const out: Record<string, THREE.InstancedMesh> = {}
    for (const p of this.parts) {
      if (!p.ms.length) continue
      const im = new THREE.InstancedMesh(p.g, p.mat, p.ms.length); p.ms.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.name = p.name; im.castShadow = true; im.receiveShadow = true
      if (bake && !noBake.includes(p.name)) bakeInstanceColors(im, tint[p.name])
      else if (tint[p.name]) { for (let i = 0; i < im.count; i++) im.setColorAt(i, tint[p.name](i) ?? new THREE.Color(1, 1, 1)); im.instanceColor!.needsUpdate = true }
      parent.add(im); out[p.name] = im
    }
    return out
  }
}
const STD = new Map<string, THREE.MeshStandardMaterial>()
const std = (o: THREE.MeshStandardMaterialParameters) => { const k = JSON.stringify(o); let m = STD.get(k); if (!m) { m = new THREE.MeshStandardMaterial(o); STD.set(k, m) } return m }
const BAS = new Map<string, THREE.MeshBasicMaterial>()
const basic = (c: string) => { let m = BAS.get(c); if (!m) { m = new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); BAS.set(c, m) } return m }
/** HDR 自发光（颜色 × k > 1，管线 bloom 阈值以上） */
const basicHdr = (c: string, k: number) => { const key = c + '*' + k; let m = BAS.get(key); if (!m) { m = new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false }); BAS.set(key, m) } return m }
const glass = (c: string) => std({ color: c, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.78, emissive: c, emissiveIntensity: 0.35 })
const black = std({ color: '#08070a', roughness: 0.35, metalness: 0.3 })

// ---------- canvas 文字贴图 ----------
function textTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas') as HTMLCanvasElement; c.width = w; c.height = h
  const g = c.getContext('2d')!; draw(g)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
}
const SERIF = "'Noto Serif SC','Noto Sans SC',Georgia,serif"
function entranceTex() {
  return textTex(512, 192, (g) => {
    g.fillStyle = '#120405'; g.fillRect(0, 0, 512, 192)
    g.strokeStyle = '#ff3048'; g.lineWidth = 6; g.strokeRect(10, 10, 492, 172)
    g.font = `italic bold 86px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.shadowColor = '#ff2040'; g.shadowBlur = 24; g.fillStyle = '#ff5a6a'; g.fillText('ENTRANCE', 256, 70)
    g.shadowBlur = 8; g.font = `bold 40px ${SERIF}`; g.fillStyle = '#ffe6b0'; g.fillText('盛 大 开 幕 · GRAND OPENING', 256, 146)
  })
}

// ================= 跑马灯大门（ref5）=================
export interface Marquee { group: THREE.Group; update: (t: number, on: boolean) => void; tris: number }
/** 局部坐标：墙面在 z = 0，正面朝 +Z，门洞底 y = 0，门头中心 x = 0 */
export function buildCasinoMarquee(): Marquee {
  const group = new THREE.Group(); group.name = 'casino-marquee'
  const b = new Batch(), mNeon = cm('neon', 1, { key: 'mq' }), mBoard = std({ color: '#16070a', roughness: 0.5, metalness: 0.2 })
  const mFace = cm('walnut', 2), mBrass = cm('brass', 2)
  // 入口墙面：暖白抹灰框 + 4 扇黑玻璃门（立柱黄铜）
  b.add(box(6.4, 3.0, 0.12), std({ color: '#d8b98a', roughness: 0.8 }), M(0, 1.5, 0.06))
  for (let i = 0; i < 4; i++) { b.add(box(1.2, 2.5, 0.05), black, M(-1.95 + i * 1.3, 1.25, 0.14)); b.add(box(0.1, 2.6, 0.12), mBrass, M(-2.6 + i * 1.3, 1.3, 0.15)) }
  b.add(box(0.1, 2.6, 0.12), mBrass, M(2.6, 1.3, 0.15))
  for (const sx of [-1, 1]) { b.add(box(0.7, 1.0, 0.04), mBoard, M(sx * 2.95, 1.6, 0.14)); b.add(box(0.75, 1.05, 0.02), mBrass, M(sx * 2.95, 1.6, 0.12)) } // 两侧海报框
  // 雨棚（canopy）
  b.add(box(6.8, 0.45, 1.4), mBoard, M(0, 3.05, 0.7)); b.add(box(6.9, 0.06, 1.5), mBrass, M(0, 2.8, 0.72))
  // 中央拱塔：黑面 + 拱顶
  b.add(box(2.2, 2.0, 0.3), mBoard, M(0, 4.25, 0.35)); b.add(cyl(1.1, 1.1, 0.3, 24, false, -Math.PI / 2, Math.PI), mBoard, M(0, 5.25, 0.35, 0, 1, 1, 1, Math.PI / 2))
  // 两侧红色竖条纹壁柱（ref5 拱塔两边的红条）
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) {
    const x = sx * (1.35 + k * 0.42)
    b.add(box(0.36, 1.9 - k * 0.3, 0.26), mBoard, M(x, 4.1 - k * 0.15, 0.32)); b.add(cyl(0.18, 0.18, 0.26, 12, false, -Math.PI / 2, Math.PI), mBoard, M(x, 5.05 - k * 0.3, 0.32, 0, 1, 1, 1, Math.PI / 2))
    for (const dx of [-0.1, 0, 0.1]) b.add(box(0.03, 1.7 - k * 0.3, 0.03), mNeon, M(x + dx, 4.1 - k * 0.15, 0.47))
  }
  // TH 字（红色霓虹：管 + 外框）
  const seg = (x: number, y: number, w: number, h: number) => { b.add(box(w, h, 0.06), mNeon, M(x, y, 0.55)); b.add(box(w + 0.08, h + 0.08, 0.04), std({ color: '#f6efe0', roughness: 0.4 }), M(x, y, 0.51)) }
  seg(-0.5, 4.95, 0.75, 0.14); seg(-0.5, 4.45, 0.14, 0.9) // T
  seg(0.22, 4.5, 0.14, 1.0); seg(0.78, 4.5, 0.14, 1.0); seg(0.5, 4.5, 0.42, 0.13) // H
  // 两侧 ENTRANCE 招牌（向外斜 20°）
  const et = entranceTex(), mEnt = new THREE.MeshStandardMaterial({ map: et, emissive: '#ffffff', emissiveMap: et, emissiveIntensity: 1.2, roughness: 0.5 })
  const signs = new THREE.Group()
  for (const sx of [-1, 1]) { const s = new THREE.Mesh(box(2.1, 0.85, 0.12), [mBoard, mBoard, mBoard, mBoard, mEnt, mBoard]); s.position.set(sx * 2.4, 3.75, 0.85); s.rotation.y = -sx * 0.35; signs.add(s) }
  group.add(signs)
  b.add(box(6.8, 0.02, 1.38), mFace, M(0, 2.82, 0.7)) // 雨棚底板
  b.flush(group, 'casino-marquee-static')
  // 灯泡串：拱顶 + 拱塔两侧 + 招牌边框 + 雨棚前沿
  const pts: THREE.Vector3[] = []
  for (let k = 0; k <= 22; k++) { const a = Math.PI * k / 22; pts.push(new V3(Math.cos(a) * 1.18, 5.25 + Math.sin(a) * 1.18, 0.52)) }
  for (let y = 3.35; y < 5.25; y += 0.16) { pts.push(new V3(-1.18, y, 0.52)); pts.push(new V3(1.18, y, 0.52)) }
  for (let x = -1.0; x <= 1.0; x += 0.16) pts.push(new V3(x, 3.32, 0.52))
  for (const sx of [-1, 1]) {
    const c = new V3(sx * 2.4, 3.75, 0.92), rot = -sx * 0.35, ex = new V3(Math.cos(rot), 0, -Math.sin(rot))
    for (let k = 0; k <= 13; k++) { const u = -1.05 + k * 2.1 / 13; pts.push(c.clone().addScaledVector(ex, u).add(new V3(0, 0.45, 0))); pts.push(c.clone().addScaledVector(ex, u).add(new V3(0, -0.45, 0))) }
  }
  for (let x = -3.35; x <= 3.35; x += 0.14) pts.push(new V3(x, 3.29, 1.42))
  const nB = pts.length
  // 雨帘灯：雨棚下垂挂的碎光（ref5 门头下那片金色光雨）
  const rain: THREE.Vector3[] = []
  let sd = 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647
  for (let x = -3.3; x <= 3.3; x += 0.07) { const n = 3 + Math.floor(rnd() * 5); for (let k = 0; k < n; k++) rain.push(new V3(x + (rnd() - 0.5) * 0.04, 2.78 - k * 0.06 - rnd() * 0.04, 1.36 - rnd() * 0.08)) }
  const bulbs = new THREE.InstancedMesh(sph(0.035, 6), basic('#ffffff'), nB + rain.length)
  ;[...pts, ...rain].forEach((p, i) => { bulbs.setMatrixAt(i, M(p.x, p.y, p.z, 0, i < nB ? 1 : 0.55, i < nB ? 1 : 0.55, i < nB ? 1 : 0.55)); bulbs.setColorAt(i, new THREE.Color('#ffd27a')) })
  bulbs.name = 'casino-marquee-bulbs'; group.add(bulbs)
  const cOn = new THREE.Color('#ffc060').multiplyScalar(2.4), cHot = new THREE.Color('#fff0d0').multiplyScalar(3.2), cOff = new THREE.Color('#2a1a0c'), cDim = new THREE.Color('#6a4a20'), tmp = new THREE.Color()
  let last = -1
  const update = (t: number, on: boolean) => {
    const f = Math.floor(t * 9)
    if (f === last) return; last = f
    for (let i = 0; i < bulbs.count; i++) {
      if (!on) { bulbs.setColorAt(i, cOff); continue }
      if (i < nB) bulbs.setColorAt(i, (i + f) % 3 === 0 ? cDim : (i + f) % 3 === 1 ? cHot : cOn) // 追逐
      else { const k = Math.sin(i * 12.9898 + f * 0.7) * 43758.5453; const r = k - Math.floor(k); bulbs.setColorAt(i, tmp.copy(cOn).lerp(cHot, r).multiplyScalar(r > 0.85 ? 1.2 : 0.55 + r * 0.5)) }
    }
    bulbs.instanceColor!.needsUpdate = true
    mNeon.emissiveIntensity = on ? 2.2 + Math.sin(t * 31) * 0.15 : 0.02; mNeon.color.set(on ? '#ff2a50' : '#3a0a10')
    mEnt.emissiveIntensity = on ? 1.2 : 0.03
  }
  update(0, true)
  let tris = 0; group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 * ((o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1) })
  return { group, update, tris }
}

// ================= 老虎机（ref6，InstancedMesh）=================
function slotScreenMaterial(uni: { uTime: { value: number } }) {
  const m = cm('screen', 1, { key: 'slot' }).clone()
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uni.uTime
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSeed;\nvarying float vSeed;\nvarying vec2 vSUv;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvSeed=aSeed;vSUv=uv;')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;varying float vSeed;varying vec2 vSUv;\nfloat h1(float n){return fract(sin(n)*43758.5453);}')
      .replace('#include <emissivemap_fragment>', `
      float col=floor(vSUv.x*3.); float cyc=mod(uTime*.23+vSeed*.37,7.); float spin=step(cyc,2.2+col*.4);
      float y=vSUv.y*3.+ (spin>.5? uTime*(6.+col*1.7) : floor(uTime*.05+vSeed+col));
      float sym=floor(y); float fy=fract(y), fx=fract(vSUv.x*3.);
      vec3 pal[5]; pal[0]=vec3(1.,.2,.25); pal[1]=vec3(1.,.8,.2); pal[2]=vec3(.3,.9,.4); pal[3]=vec3(.4,.6,1.); pal[4]=vec3(1.,.5,1.);
      int id=int(mod(h1(sym*7.13+col*3.1+vSeed)*5.,5.));
      float shape=smoothstep(.32,.28,length(vec2(fx-.5,fy-.5)));
      vec3 c=mix(vec3(.05,.1,.25)+vec3(.0,.15,.35)*(1.-vSUv.y), pal[id], shape*.95);
      c*= (fx<.04||fx>.96)?.2:1.; c+= step(.97,h1(floor(uTime*3.)+vSeed))*.4; // 偶发中奖闪屏
      totalEmissiveRadiance = c*1.9;`)
  }
  m.customProgramCacheKey = () => 'casino-slot-screen'
  return m
}
function buildSlots(parent: THREE.Group, props: CasinoProp[], uni: { uTime: { value: number } }) {
  const I = new Inst(), mBody = cm('walnut', 1, { key: 'slot', color: '#5a3a2a' }), mBrass = cm('brass', 1), mLea = cm('leather', 1)
  const topTex = textTex(256, 96, (g) => { const gr = g.createLinearGradient(0, 0, 0, 96); gr.addColorStop(0, '#ff9a2a'); gr.addColorStop(1, '#a01818'); g.fillStyle = gr; g.fillRect(0, 0, 256, 96); g.font = `italic bold 52px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff2c0'; g.shadowColor = '#fff'; g.shadowBlur = 10; g.fillText('TH ★ 777', 128, 50) })
  const mTop = new THREE.MeshStandardMaterial({ map: topTex, emissive: '#ffffff', emissiveMap: topTex, emissiveIntensity: 1.5, roughness: 0.4 })
  // 高顶箱（ref6 顶上的大招牌）：PROGRESSIVE 拱形灯箱
  const tallTex = textTex(256, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#3a0a6a'); gr.addColorStop(1, '#0a0420'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#ffd04a'; g.lineWidth = 10; g.strokeRect(10, 10, 236, 236); g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ff60ff'; g.shadowBlur = 16; g.fillStyle = '#ffe6ff'; g.font = `italic bold 46px ${SERIF}`; g.fillText('HOT', 128, 70); g.fillText('SHOT', 128, 118); g.fillStyle = '#7af0ff'; g.font = `bold 30px ${SERIF}`; g.fillText('PROGRESSIVE', 128, 176); g.fillStyle = '#ffd04a'; g.fillText('$ 88,888', 128, 214) })
  const mTall = new THREE.MeshStandardMaterial({ map: tallTex, emissive: '#ffffff', emissiveMap: tallTex, emissiveIntensity: 1.5, roughness: 0.4 })
  const P = {
    base: I.part('slot-base', box(0.86, 0.75, 0.62), black), body: I.part('slot-body', box(0.86, 1.0, 0.5), mBody), deck: I.part('slot-deck', box(0.86, 0.06, 0.3), mBrass),
    trim: I.part('slot-trim', box(0.9, 0.05, 0.54), mBrass), top: I.part('slot-top', box(0.84, 0.32, 0.12), mTop), hood: I.part('slot-hood', cyl(0.43, 0.43, 0.5, 16, false, -Math.PI / 2, Math.PI), mBody),
    screen: I.part('slot-screen', new THREE.PlaneGeometry(0.66, 0.5), slotScreenMaterial(uni)), lever: I.part('slot-lever', cyl(0.018, 0.018, 0.5, 8), mBrass), knob: I.part('slot-knob', sph(0.05, 10), std({ color: '#c01020', roughness: 0.3 })),
    pole: I.part('slot-chair-pole', cyl(0.035, 0.035, 0.6, 10), mBrass), foot: I.part('slot-chair-foot', cyl(0.24, 0.26, 0.03, 18), mBrass), seat: I.part('slot-chair-seat', cyl(0.24, 0.22, 0.12, 18), mLea), back: I.part('slot-chair-back', box(0.42, 0.55, 0.1), mLea),
    under: I.part('slot-underlight', new THREE.PlaneGeometry(0.6, 0.08), basicHdr('#ffb648', 2.2)),
    topper: I.part('slot-topper', box(0.84, 0.9, 0.22), mTall), arch: I.part('slot-topper-arch', cyl(0.42, 0.42, 0.22, 16, false, -Math.PI / 2, Math.PI), mBrass), fin: I.part('slot-topper-fin', box(0.06, 1.0, 0.3), mBrass),
  }
  const seeds: number[] = [], glows: THREE.Color[] = []
  for (const p of props) {
    const R = M(p.x, 0, p.y, Math.PI / 2 - p.rot), L = (m: THREE.Matrix4) => R.clone().multiply(m)
    P.base.ms.push(L(M(0, 0.375, -0.02))); P.body.ms.push(L(M(0, 1.25, -0.08))); P.deck.ms.push(L(M(0, 0.78, 0.2, 0, 1, 1, 1, -0.25)))
    P.trim.ms.push(L(M(0, 1.76, -0.06))); P.hood.ms.push(L(M(0, 1.78, -0.08, 0, 1, 0.55, 1, Math.PI / 2, 0))); P.top.ms.push(L(M(0, 2.02, 0.14)))
    P.screen.ms.push(L(M(0, 1.28, 0.175, 0, 1, 1, 1, -0.08))); P.lever.ms.push(L(M(0.47, 1.25, 0.0, 0, 1, 1, 1, 0.2))); P.knob.ms.push(L(M(0.47, 1.5, 0.05)))
    P.pole.ms.push(L(M(0, 0.3, 0.72))); P.foot.ms.push(L(M(0, 0.015, 0.72))); P.seat.ms.push(L(M(0, 0.64, 0.72))); P.back.ms.push(L(M(0, 0.95, 0.94, 0, 1, 1, 1, -0.12)))
    P.under.ms.push(L(M(0, 0.04, 0.32, 0, 1, 1, 1, -Math.PI / 2)))
    if (p.data?.tall) { P.topper.ms.push(L(M(0, 2.66, 0.05))); P.arch.ms.push(L(M(0, 3.11, 0.05, 0, 1, 1, 1, Math.PI / 2, 0))); for (const sx of [-0.45, 0.45]) P.fin.ms.push(L(M(sx, 2.7, 0.05))) }
    seeds.push((p.data?.i ?? 0) * 1.618)
    glows.push(new THREE.Color(SLOT_GLOW[p.data?.glow ?? 0]))
  }
  P.screen.g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1))
  // 机身按屏幕辉光色调（ref6 彩色机柜）；椅子 / 底座吃烘焙彩光
  const bodyTint = (i: number) => new THREE.Color(1, 1, 1).lerp(glows[i], 0.45).multiplyScalar(0.8)
  return I.flush(parent, true, ['slot-screen', 'slot-top', 'slot-underlight', 'slot-topper'], { 'slot-body': bodyTint, 'slot-hood': bodyTint })
}

// ================= 牌桌 =================
function bjTable(b: Batch, R: THREE.Matrix4) {
  // 半圆桌：直边（庄家）在 −Z，弧边朝 +Z（玩家）；绒面整张贴图
  const top = new THREE.CircleGeometry(1.1, 40, Math.PI, Math.PI); // XY 平面下半圆（rx −π/2 后朝 +Z = 玩家侧）
  const uv = top.attributes.uv as THREE.BufferAttribute, pos = top.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 2.2 + 0.5, -pos.getY(i) / 1.1 * 0.74)
  b.add(top, cm('feltBJ'), R.clone().multiply(M(0, 0.86, -0.55, 0, 1, 1, 1, -Math.PI / 2)))
  b.add(new THREE.TorusGeometry(1.12, 0.07, 8, 40, Math.PI), cm('leather', 2), R.clone().multiply(M(0, 0.87, -0.55, 0, 1, 1, 1, Math.PI / 2)))
  b.add(cyl(1.1, 1.1, 0.12, 40, false, -Math.PI / 2, Math.PI), cm('walnut', 2), R.clone().multiply(M(0, 0.78, -0.55, Math.PI)))
  b.add(box(2.25, 0.1, 0.12), cm('walnut', 2), R.clone().multiply(M(0, 0.86, -0.6)))
  b.add(cyl(0.18, 0.3, 0.72, 16), black, R.clone().multiply(M(0, 0.36, -0.3)))
  b.add(box(0.5, 0.06, 0.3), cm('brass', 1), R.clone().multiply(M(0.6, 0.9, -0.5))) // 牌靴
}
function rouletteTable(b: Batch, R: THREE.Matrix4) {
  const top = new THREE.PlaneGeometry(2.5, 1.2)
  b.add(top, cm('feltRoulette'), R.clone().multiply(M(0.25, 0.86, 0, 0, 1, 1, 1, -Math.PI / 2)))
  b.add(box(2.8, 0.14, 1.5), cm('walnut', 2), R.clone().multiply(M(0, 0.78, 0)))
  for (const sx of [-1, 1]) b.add(box(2.85, 0.1, 0.12), cm('leather', 2), R.clone().multiply(M(0, 0.9, sx * 0.72, Math.PI / 2 * 0)))
  for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) b.add(cyl(0.06, 0.05, 0.72, 10), black, R.clone().multiply(M(x, 0.36, z)))
}
function crapsTable(b: Batch, R: THREE.Matrix4) {
  b.add(new THREE.PlaneGeometry(3.0, 1.4), cm('feltCraps'), R.clone().multiply(M(0, 0.82, 0, 0, 1, 1, 1, -Math.PI / 2)))
  for (const sz of [-1, 1]) { b.add(box(3.3, 0.3, 0.14), cm('walnut', 2), R.clone().multiply(M(0, 0.95, sz * 0.78))); b.add(box(3.3, 0.06, 0.2), cm('leather', 2), R.clone().multiply(M(0, 1.12, sz * 0.8))) }
  for (const sx of [-1, 1]) { b.add(box(0.14, 0.3, 1.7), cm('walnut', 2), R.clone().multiply(M(sx * 1.6, 0.95, 0))); b.add(box(0.2, 0.06, 1.75), cm('leather', 2), R.clone().multiply(M(sx * 1.62, 1.12, 0))) }
  b.add(box(3.2, 0.7, 1.5), black, R.clone().multiply(M(0, 0.4, 0)))
  for (const [x, z] of [[0.3, 0.1], [0.42, -0.05]]) b.add(box(0.05, 0.05, 0.05), std({ color: '#e81a26', roughness: 0.2 }), R.clone().multiply(M(x, 0.85, z, 0.6))) // 骰子
}
/** 轮盘轮（可转动）：返回 { 轮, 球 } */
function rouletteWheel(): { g: THREE.Group; wheel: THREE.Object3D; ball: THREE.Object3D } {
  const g = new THREE.Group()
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.52, 0), new THREE.Vector2(0.56, 0.1), new THREE.Vector2(0.5, 0.16), new THREE.Vector2(0.44, 0.1)], 40), cm('walnut', 2)); g.add(bowl)
  const tex = textTex(512, 512, (c) => { c.translate(256, 256); for (let i = 0; i < 37; i++) { c.fillStyle = i === 0 ? '#0e7a32' : i % 2 ? '#b81a1e' : '#141010'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 250, (i / 37) * TAU, ((i + 1) / 37) * TAU); c.fill() } c.fillStyle = '#3a2516'; c.beginPath(); c.arc(0, 0, 150, 0, TAU); c.fill(); c.fillStyle = '#d9b25a'; c.font = 'bold 22px Georgia'; c.textAlign = 'center'; for (let i = 0; i < 37; i++) { c.save(); c.rotate((i + 0.5) / 37 * TAU + Math.PI / 2); c.fillText(String((i * 13) % 37), 0, -222); c.restore() } })
  const wheel = new THREE.Group()
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.44, 48), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 })); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.09; wheel.add(disc)
  const cone = new THREE.Mesh(cyl(0.04, 0.16, 0.1, 16), cm('brass', 1)); cone.position.y = 0.14; wheel.add(cone)
  for (let k = 0; k < 4; k++) { const arm = new THREE.Mesh(box(0.36, 0.02, 0.02), cm('brass', 1)); arm.position.y = 0.2; arm.rotation.y = k * Math.PI / 4; wheel.add(arm) }
  g.add(wheel)
  const ball = new THREE.Mesh(sph(0.018, 10), std({ color: '#fbf8f0', roughness: 0.2 })); ball.position.set(0.38, 0.12, 0); g.add(ball)
  return { g, wheel, ball }
}

// ================= 筹码堆 / 扑克牌 =================
const CHIP_KINDS: CasinoSurface[] = ['chipRed', 'chipBlue', 'chipYellow', 'chipGreen'] // 红 1 / 蓝 5 / 黄 10 / 绿 20
export function buildChipStacks(parent: THREE.Object3D, spots: { x: number; y: number; seed: number; big?: number }[], y0 = 0.87) {
  const I = new Inst(), parts = CHIP_KINDS.map((k) => { const top = cm(k); const side = cm(k, 1, { key: 'side' }); return I.part('chips-' + k, cyl(0.02, 0.02, 0.0034, 20), [side, top, top] as unknown as THREE.Material) })
  for (const s of spots) {
    let sd = s.seed * 9301 + 49297; const r = () => (sd = (sd * 9301 + 49297) % 233280) / 233280
    const nStacks = s.big ? 9 : 4
    for (let k = 0; k < nStacks; k++) {
      const kind = Math.floor(r() * 4), h = 2 + Math.floor(r() * (s.big ? 22 : 12)), ox = (k % 3) * 0.045 + (r() - 0.5) * 0.01, oz = Math.floor(k / 3) * 0.045
      for (let i = 0; i < h; i++) parts[kind].ms.push(M(s.x + ox, y0 + 0.0017 + i * 0.0035, s.y + oz, r() * TAU, 1, 1, 1, (r() - 0.5) * 0.02))
    }
    for (let k = 0; k < 3; k++) parts[Math.floor(r() * 4)].ms.push(M(s.x + 0.15 + r() * 0.1, y0 + 0.002, s.y - 0.05 + r() * 0.12, r() * TAU, 1, 1, 1, (r() - 0.5) * 0.1)) // 散落
  }
  return I.flush(parent)
}
function buildCards(parent: THREE.Object3D, spots: { x: number; y: number; seed: number }[], y0 = 0.871) {
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.063, 0.088), cm('card'), spots.length * 5)
  let i = 0
  for (const s of spots) for (let k = 0; k < 5; k++) im.setMatrixAt(i++, M(s.x + k * 0.05 - 0.1, y0 + k * 0.0004, s.y + Math.sin(k + s.seed) * 0.03, s.seed + k * 0.25, 1, 1, 1, -Math.PI / 2))
  im.name = 'casino-cards'; parent.add(im); return im
}

// ================= 整座赌场 =================
export interface CasinoScene { group: THREE.Group; update: (dt: number, open?: boolean) => void; stats: () => { tris: number; draws: number; instances: number }; marquee: Marquee; wheels: THREE.Object3D[]; lightmap: ReturnType<typeof bakeCasinoLightmap> }
export function buildCasinoScene(opts: { lights?: boolean } = {}): CasinoScene {
  const L = casinoLayout(), group = new THREE.Group(); group.name = 'casino-scene'
  BAKED.length = 0
  const b = new Batch(), uni = { uTime: { value: 0 } }
  const W0 = OX, W1 = OX + CASINO_W, D0 = OY, D1 = OY + CASINO_D, H = CASINO_H, cx = (W0 + W1) / 2, cz = (D0 + D1) / 2
  // ---- 地面：每区一套程序地毯（CARPET_TILE 平铺，主图案 0.4–0.6 m）+ 烘焙光照贴图（uv1 = 大厅归一化坐标）+ 区域交界黄铜压条 ----
  const lm = bakeCasinoLightmap()
  const floorMats = new Map<CarpetKind, THREE.MeshStandardMaterial>(), floorGeos = new Map<CarpetKind, THREE.BufferGeometry[]>()
  const lmMat = (base: THREE.MeshStandardMaterial, key: string) => { const m = base.clone(); m.lightMap = lm.tex; m.lightMapIntensity = LM_MAX * Math.PI * LM_GAIN; m.name = base.name + '+lm:' + key; BAKED.push(m); return m }
  const floorPlane = (x0: number, z0: number, x1: number, z1: number, tile: number, y = 0) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2)
    const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute, uv1 = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); uv.setXY(i, (x - W0) / tile, (z - D0) / tile); uv1[i * 2] = (x - W0) / CASINO_W; uv1[i * 2 + 1] = (z - D0) / CASINO_D }
    g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2)); return g
  }
  for (const f of L.floors) {
    if (!floorMats.has(f.carpet)) floorMats.set(f.carpet, lmMat(cm(f.carpet), f.carpet))
    const a = floorGeos.get(f.carpet) ?? []; a.push(floorPlane(f.x0, f.y0, f.x1, f.y1, CARPET_TILE[f.carpet].tile)); floorGeos.set(f.carpet, a)
  }
  for (const [k, gs] of floorGeos) { const g = mergeGeometries(gs, false)!; const mesh = new THREE.Mesh(g, floorMats.get(k)!); mesh.name = 'casino-floor-' + k; mesh.receiveShadow = true; mesh.userData.carpet = k; mesh.userData.tile = CARPET_TILE[k].tile; group.add(mesh) }
  { // 酒吧高脚凳下的黑大理石环带 + 门槛大理石（同一张光照贴图）
    const bar = L.props.find((p) => p.kind === 'bar')!, br = bar.data?.r ?? 4.4
    const ring = new THREE.RingGeometry(br - 0.5, br + 1.35, 64, 1, Math.PI * 0.42, Math.PI * 1.16); ring.rotateX(-Math.PI / 2); ring.translate(bar.x, 0.006, bar.y)
    const th = floorPlane(L.door.x - 2, D1 - 1.2, L.door.x + 2, D1 + 3, 3, 0.006)
    const pos = ring.attributes.position as THREE.BufferAttribute, uv = ring.attributes.uv as THREE.BufferAttribute, uv1 = new Float32Array(pos.count * 2)
    for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i); uv.setXY(i, x / 3, z / 3); uv1[i * 2] = (x - W0) / CASINO_W; uv1[i * 2 + 1] = (z - D0) / CASINO_D }
    ring.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2))
    const g = mergeGeometries([ring.toNonIndexed(), th.toNonIndexed()], false)!; const mm = new THREE.Mesh(g, lmMat(cm('marble'), 'marble')); mm.name = 'casino-floor-marble'; mm.receiveShadow = true; group.add(mm)
    const sb = new THREE.TorusGeometry(br + 1.38, 0.035, 4, 64, Math.PI * 1.16); b.add(sb, cm('brass', 4), M(bar.x, 0.008, bar.y, 0, 1, 1, 1, -Math.PI / 2).multiply(M(0, 0, 0, 0, 1, 1, 1, 0, Math.PI * 0.42)))
  }
  { // 区域交界黄铜压条（不画大厅外沿）
    const seen = new Set<string>(), eps = 0.01
    for (const f of L.floors) for (const [x0, z0, x1, z1] of [[f.x0, f.y0, f.x1, f.y0], [f.x0, f.y1, f.x1, f.y1], [f.x0, f.y0, f.x0, f.y1], [f.x1, f.y0, f.x1, f.y1]]) {
      const horiz = z0 === z1
      if (horiz ? (Math.abs(z0 - D0) < eps || Math.abs(z0 - D1) < eps) : (Math.abs(x0 - W0) < eps || Math.abs(x0 - W1) < eps)) continue
      const key = [x0, z0, x1, z1].map((v) => v.toFixed(2)).join(','); if (seen.has(key)) continue; seen.add(key)
      const len = horiz ? x1 - x0 : z1 - z0
      b.add(box(horiz ? len : 0.07, 0.012, horiz ? 0.07 : len), cm('brass', 4), M((x0 + x1) / 2, 0.006, (z0 + z1) / 2))
    }
  }
  // ---- 墙：墙纸（1.2 m 以上）+ 胡桃护墙板 + 黄铜线脚 ----
  const wall = (x0: number, z0: number, x1: number, z1: number, h = H, face = 1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, ry = -ang
    const nx = Math.sin(ang) * face, nz = -Math.cos(ang) * face // 朝室内的法线
    const wp = new THREE.PlaneGeometry(len, h - 1.2); { const uv = wp.attributes.uv.array as Float32Array; for (let i = 0; i < uv.length; i += 2) { uv[i] *= len / 2; uv[i + 1] *= (h - 1.2) / 2 } }
    const yaw = Math.atan2(nx, nz)
    b.add(wp, cm('wallpaper'), M(mx, 1.2 + (h - 1.2) / 2, mz, yaw)); void ry
    const wn = new THREE.BoxGeometry(len, 1.2, 0.06); { const uv = wn.attributes.uv.array as Float32Array; for (let i = 0; i < uv.length; i += 2) uv[i] *= len / 2 }
    b.add(wn, cm('walnut'), M(mx + nx * 0.03, 0.6, mz + nz * 0.03, yaw))
    b.add(box(len, 0.06, 0.09), cm('brass', 4), M(mx + nx * 0.05, 1.22, mz + nz * 0.05, yaw)); b.add(box(len, 0.12, 0.1), cm('brass', 4), M(mx + nx * 0.05, h - 0.35, mz + nz * 0.05, yaw))
  }
  const dl = L.door.x - 2, dr = L.door.x + 2
  wall(W0, D0, W1, D0); wall(W1, D0, W1, D1); wall(W1, D1, dr, D1); wall(dl, D1, W0, D1); wall(W0, D1, W0, D0)
  b.add(box(4, H - 3.2, 0.3), cm('wallpaper'), M(L.door.x, 3.2 + (H - 3.2) / 2, D1 + 0.15)) // 门楣墙
  for (const w of L.walls) { const horiz = w.x1 - w.x0 > w.y1 - w.y0; const mx = (w.x0 + w.x1) / 2, mz = (w.y0 + w.y1) / 2; b.add(box(w.x1 - w.x0, H, w.y1 - w.y0), cm('walnut', 9), M(mx, H / 2, mz)); b.add(box((w.x1 - w.x0) + (horiz ? 0 : 0.04), 0.08, (w.y1 - w.y0) + (horiz ? 0.04 : 0)), cm('brass', 4), M(mx, 1.22, mz)) }
  // ---- 吊顶：藻井镜面 / 暗金（4 m 一格）+ 筒灯（InstancedMesh）----
  const ceil = new THREE.PlaneGeometry(CASINO_W, CASINO_D); { const uv = ceil.attributes.uv.array as Float32Array; for (let i = 0; i < uv.length; i += 2) { uv[i] *= CASINO_W / 4; uv[i + 1] *= CASINO_D / 4 } }
  b.add(ceil, cm('ceiling'), M(cx, H, cz, 0, 1, 1, 1, Math.PI / 2))
  const barP = L.props.find((p) => p.kind === 'bar')!, BRr = (barP.data?.r ?? 4.4) + 3.0
  b.add(cyl(BRr, BRr, 0.6, 64, true), cm('ceiling', 3), M(barP.x, H - 0.3, barP.y)) // 酒吧上方环形下沉顶
  b.add(new THREE.RingGeometry(BRr - 0.02, BRr + 0.6, 64), cm('ceiling', 3), M(barP.x, H - 0.6, barP.y, 0, 1, 1, 1, Math.PI / 2))
  // 灯带：下沉顶边缘一圈暖色 LED + 内圈（ref8）
  b.add(new THREE.TorusGeometry(BRr + 0.02, 0.035, 6, 96), basicHdr('#ffcf8a', 2.6), M(barP.x, H - 0.62, barP.y, 0, 1, 1, 1, Math.PI / 2))
  b.add(new THREE.TorusGeometry(BRr - 1.2, 0.03, 6, 96), basicHdr('#ffd8a0', 2.2), M(barP.x, H - 0.02, barP.y, 0, 1, 1, 1, Math.PI / 2))
  // 筒灯：烘焙灯里所有吊顶灯（z ≥ 6.3）都画一个发光灯口（HDR → bloom）
  const downs: THREE.Matrix4[] = []
  const inRing = (x: number, z: number) => Math.hypot(x - barP.x, z - barP.y) < BRr
  for (const l of L.lights) if (l.z >= 6.3) downs.push(M(l.x, (inRing(l.x, l.y) ? H - 0.605 : H - 0.005), l.y, 0, 1, 1, 1, Math.PI / 2))
  const dim = new THREE.InstancedMesh(new THREE.CircleGeometry(0.085, 12), basicHdr('#fff2d6', 3.2), downs.length); downs.forEach((m, i) => dim.setMatrixAt(i, m)); dim.name = 'casino-downlights'; group.add(dim)
  // 牌桌聚光：可见光锥（加法混合、顶亮底淡，一次绘制）
  { const cone = new THREE.CylinderGeometry(0.12, 1.55, 5.6, 20, 1, true); const pos = cone.attributes.position as THREE.BufferAttribute, col = new Float32Array(pos.count * 3)
    for (let i = 0; i < pos.count; i++) { const t = (pos.getY(i) + 2.8) / 5.6; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = t * t * 0.55 }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const spots = L.lights.filter((l) => l.spot && l.spot < 0.4)
    const cm2 = new THREE.MeshBasicMaterial({ color: '#ffd9a8', vertexColors: true, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    const ci = new THREE.InstancedMesh(cone, cm2, spots.length); spots.forEach((l, i) => ci.setMatrixAt(i, M(l.x, l.z - 2.85, l.y))); ci.name = 'casino-spot-cones'; ci.renderOrder = 5; ci.castShadow = false; group.add(ci) }
  // ---- 道具 ----
  const byKind = (k: CasinoProp['kind']) => L.props.filter((p) => p.kind === k)
  const Rm = (p: CasinoProp) => M(p.x, 0, p.y, Math.PI / 2 - p.rot)
  const inst = buildSlots(group, byKind('slot'), uni)
  for (const p of byKind('blackjack')) bjTable(b, Rm(p))
  const wheels: THREE.Object3D[] = [], balls: THREE.Object3D[] = []
  for (const p of byKind('roulette')) { rouletteTable(b, Rm(p)); const w = rouletteWheel(); w.g.userData.casinoWheel = 1; w.g.position.set(p.x - Math.cos(p.rot) * 0.95, 0.86, p.y - Math.sin(p.rot) * 0.95); group.add(w.g); wheels.push(w.wheel); balls.push(w.ball) }
  for (const p of byKind('craps')) crapsTable(b, Rm(p))
  buildChipStacks(group, byKind('chips').map((p) => ({ x: p.x, y: p.y, seed: p.data?.seed ?? 1, big: p.data?.big })), 0.87)
  buildCards(group, byKind('cards').map((p) => ({ x: p.x, y: p.y, seed: p.data?.seed ?? 0 })))
  // 兑换台（Louie 的位置留空）：胡桃柜台 + 黄铜栅栏 + 大理石台面 + CASHIER 霓虹
  for (const p of byKind('cashier')) {
    const R = Rm(p)
    b.add(box(7, 1.15, 1.0), cm('walnut', 3), R.clone().multiply(M(0, 0.575, 0))); b.add(box(7.1, 0.06, 1.1), cm('marble', 2), R.clone().multiply(M(0, 1.18, 0)))
    for (let x = -3.4; x <= 3.4; x += 0.12) b.add(cyl(0.012, 0.012, 1.0, 6), cm('brass', 1), R.clone().multiply(M(x, 1.71, -0.2)))
    b.add(box(7.1, 0.08, 0.12), cm('brass', 2), R.clone().multiply(M(0, 2.22, -0.2)))
    const t = textTex(512, 96, (g) => { g.fillStyle = '#100406'; g.fillRect(0, 0, 512, 96); g.font = `bold 64px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#ffb030'; g.shadowBlur = 18; g.fillStyle = '#ffd36a'; g.fillText('CASHIER · 兑换', 256, 50) })
    const s = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.6), new THREE.MeshStandardMaterial({ map: t, emissive: '#fff', emissiveMap: t, emissiveIntensity: 1.3 })); s.applyMatrix4(R.clone().multiply(M(0, 2.7, 0.0))); group.add(s)
    b.add(box(0.5, 0.9, 0.5), cm('leather', 1), R.clone().multiply(M(0, 0.45, -1.0))) // 空着的高凳（Louie 的位置）
  }
  // 环形酒吧（ref8）：吧台前板（黑 + 金色星点由皮革代）、大理石台面、黄铜脚踏、内侧酒柜
  for (const p of byKind('bar')) {
    const r = p.data?.r ?? 4.4, cx2 = p.x, cz2 = p.y, t0 = Math.PI * 0.5, tl = Math.PI
    const th0 = -t0 + Math.PI / 2 - tl // three 柱面 theta：x = sin θ, z = cos θ
    b.add(cyl(r + 0.25, r + 0.25, 1.05, 48, true, th0, tl), cm('leather', 6), M(cx2, 0.525, cz2))
    const top = new THREE.RingGeometry(r - 0.4, r + 0.35, 48, 1, 0, tl); b.add(top, cm('marble', 2), M(cx2, 1.1, cz2, 0, 1, 1, 1, -Math.PI / 2).multiply(M(0, 0, 0, 0, 1, 1, 1, 0, Math.PI / 2)))
    b.add(new THREE.TorusGeometry(r + 0.45, 0.025, 6, 48, tl), cm('brass', 4), M(cx2, 0.22, cz2, 0, 1, 1, 1, -Math.PI / 2).multiply(M(0, 0, 0, 0, 1, 1, 1, 0, Math.PI / 2)))
    b.add(new THREE.TorusGeometry(r + 0.28, 0.03, 6, 48, tl), cm('brass', 4), M(cx2, 1.06, cz2, 0, 1, 1, 1, -Math.PI / 2).multiply(M(0, 0, 0, 0, 1, 1, 1, 0, Math.PI / 2)))
    b.add(new THREE.TorusGeometry(r + 0.27, 0.012, 4, 48, tl), basic('#ffcf8a'), M(cx2, 0.12, cz2, 0, 1, 1, 1, -Math.PI / 2).multiply(M(0, 0, 0, 0, 1, 1, 1, 0, Math.PI / 2))) // 吧台底灯带
    b.add(cyl(r + 0.26, r + 0.26, 0.05, 48, true, th0, tl), basicHdr('#ffb860', 2.4), M(cx2, 0.98, cz2)) // 台面下沿暖光带
  }
  for (const p of byKind('liquor')) {
    const R = Rm(p)
    b.add(box(6, 2.4, 0.5), cm('walnut', 3), R.clone().multiply(M(0, 1.2, -0.1)))
    b.add(new THREE.PlaneGeometry(5.0, 1.9), basicHdr('#ff9a3a', 1.05), R.clone().multiply(M(0, 1.35, 0.16))) // 背光酒柜
    for (const sx of [-2.7, 2.7]) b.add(box(0.06, 2.2, 0.06), basicHdr('#ffd9a0', 3), R.clone().multiply(M(sx, 1.3, 0.2)))
    for (let k = 0; k < 4; k++) b.add(box(5.7, 0.03, 0.34), glass('#d9f0ff'), R.clone().multiply(M(0, 0.55 + k * 0.5, 0.0)))
    const cols = ['#5a2a10', '#2a6a2a', '#c8a050', '#7a1a1a', '#e8e0c0', '#2a3a6a']
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.04, 0.3, 8), glass('#ffffff'), 4 * 30); let i = 0
    for (let k = 0; k < 4; k++) for (let j = 0; j < 30; j++) { im.setMatrixAt(i, R.clone().multiply(M(-2.7 + j * 0.186, 0.72 + k * 0.5, 0.0))); im.setColorAt(i, new THREE.Color(cols[(j * 7 + k * 3) % cols.length])); i++ }
    im.name = 'casino-bottles'; group.add(im)
  }
  { // 高脚凳（ref8：黄铜单柱 + 皮面靠背）
    const I = new Inst(), st = byKind('barstool')
    const pa = { pole: I.part('stool-pole', cyl(0.03, 0.03, 0.72, 10), cm('brass', 1)), base: I.part('stool-base', cyl(0.22, 0.25, 0.04, 20), cm('brass', 1)), ring: I.part('stool-ring', new THREE.TorusGeometry(0.17, 0.012, 6, 20), cm('brass', 1)), seat: I.part('stool-seat', cyl(0.22, 0.2, 0.1, 20), cm('leather', 1)), back: I.part('stool-back', cyl(0.24, 0.24, 0.3, 16, true, Math.PI * 0.65, Math.PI * 0.7), cm('leather', 1, { key: 'stoolback' })) }
    for (const p of st) { const R = Rm(p); pa.pole.ms.push(R.clone().multiply(M(0, 0.38, 0))); pa.base.ms.push(R.clone().multiply(M(0, 0.02, 0))); pa.ring.ms.push(R.clone().multiply(M(0, 0.32, 0, 0, 1, 1, 1, Math.PI / 2))); pa.seat.ms.push(R.clone().multiply(M(0, 0.78, 0))); pa.back.ms.push(R.clone().multiply(M(0, 0.98, 0, Math.PI))) }
    // 牌桌玩家凳（矮款：同零件压低）
    for (const p of byKind('tablestool')) { const R = Rm(p); pa.pole.ms.push(R.clone().multiply(M(0, 0.27, 0, 0, 1, 0.7, 1))); pa.base.ms.push(R.clone().multiply(M(0, 0.02, 0, 0, 0.9, 1, 0.9))); pa.seat.ms.push(R.clone().multiply(M(0, 0.56, 0, 0, 0.95, 1, 0.95))); pa.back.ms.push(R.clone().multiply(M(0, 0.76, 0, Math.PI, 0.92, 1, 0.92))) } // 牌桌玩家凳：同零件压低（不加批次）
    I.flush(group, true)
  }
  // 绳栏（黄铜柱 + 酒红绒绳）
  for (const p of byKind('rope')) {
    const len = p.data?.len ?? 2, R = Rm(p), vip = p.data?.vip
    for (const s of [0, len]) { b.add(cyl(0.03, 0.03, 0.95, 10), cm('brass', 1), R.clone().multiply(M(s - len / 2, 0.475, 0, 0, 1, 1, 1, 0, 0).premultiply(new THREE.Matrix4()))); b.add(cyl(0.14, 0.16, 0.04, 16), cm('brass', 1), R.clone().multiply(M(s - len / 2, 0.02, 0))); b.add(sph(0.045, 10), cm('brass', 1), R.clone().multiply(M(s - len / 2, 0.98, 0))) }
    const curve = new THREE.QuadraticBezierCurve3(new V3(-len / 2, 0.9, 0), new V3(0, 0.62, 0), new V3(len / 2, 0.9, 0))
    b.add(new THREE.TubeGeometry(curve, 12, 0.022, 6), new THREE.MeshStandardMaterial({ color: vip ? '#2a0408' : '#7a0a18', roughness: 0.9 }), R)
  }
  // 柱（黑大理石 + 黄铜箍）、盆栽、地灯、TH 标志、VIP 沙发与矮桌、员工门、监控球、吊灯
  for (const p of byKind('pillar')) {
    const slim = !!p.data?.slim, r = slim ? 0.32 : 0.45
    // 包金立柱：黄铜外包（上下）+ 中段黑大理石 + 黄铜箍
    b.add(cyl(r, r, H, 24), cm('brass', 2), M(p.x, H / 2, p.y)); b.add(cyl(r + 0.01, r + 0.01, H - 2.6, 24, true), cm('marble', 2), M(p.x, 1.5 + (H - 2.6) / 2, p.y))
    for (const y of [0.15, 1.5, H - 1.1, H - 0.3]) b.add(cyl(r + 0.04, r + 0.04, 0.1, 24), cm('brass', 2), M(p.x, y, p.y))
    b.add(cyl(r + 0.02, r + 0.02, 0.05, 24, true), basicHdr('#ffcf8a', 2.4), M(p.x, H - 0.7, p.y))
    if (p.data?.seat) { // 环形座椅：酒红皮软包 + 黄铜踢脚
      b.add(cyl(1.12, 1.12, 0.42, 32), cm('leather', 3, { key: 'ring' }), M(p.x, 0.21, p.y)); b.add(cyl(1.15, 1.15, 0.06, 32), cm('brass', 2), M(p.x, 0.03, p.y))
      b.add(cyl(0.72, 0.8, 0.55, 24), cm('leather', 3, { key: 'ring' }), M(p.x, 0.68, p.y))
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; b.add(sph(0.025, 6), cm('brass', 1), M(p.x + Math.cos(a) * 0.79, 0.75, p.y + Math.sin(a) * 0.79)) }
    }
  }
  for (const p of byKind('planter')) { b.add(cyl(0.38, 0.3, 0.7, 16), cm('brass', 1), M(p.x, 0.35, p.y)); b.add(new THREE.IcosahedronGeometry(0.55, 1), std({ color: '#2e5a2a', roughness: 0.8, flatShading: true }), M(p.x, 1.15, p.y, 0, 1, 1.4, 1)); for (let k = 0; k < 5; k++) { const a = k * 1.3; b.add(new THREE.ConeGeometry(0.12, 0.9, 5), std({ color: '#3a6a30', roughness: 0.8, flatShading: true }), M(p.x + Math.cos(a) * 0.25, 1.6, p.y + Math.sin(a) * 0.25, a, 1, 1, 1, 0.35, 0)) } }
  // 灯柱（桌间黄铜灯柱：球形乳白灯罩）；ceil = 吊顶聚光筒（只画灯筒）
  for (const p of byKind('lamppost')) {
    if (p.data?.ceil) { b.add(cyl(0.16, 0.13, 0.32, 14, true), cm('brass', 1), M(p.x, H - 0.16, p.y)); continue }
    b.add(cyl(0.035, 0.035, 2.1, 10), cm('brass', 1), M(p.x, 1.05, p.y)); b.add(cyl(0.16, 0.2, 0.05, 16), cm('brass', 1), M(p.x, 0.025, p.y)); b.add(sph(0.1, 12), basicHdr('#ffe0b0', 1.25), M(p.x, 2.2, p.y))
  }
  // 累积奖池计数柱（环形老虎机中央）+ 西墙大屏：计数牌 canvas 每 0.5 s 递增
  const jpCanvas = document.createElement('canvas') as HTMLCanvasElement; jpCanvas.width = 512; jpCanvas.height = 128
  const jpTex = new THREE.CanvasTexture(jpCanvas); jpTex.colorSpace = THREE.SRGBColorSpace
  let jpVal = 1288888, jpLast = -1
  const drawJp = () => { const g = jpCanvas.getContext('2d')!; g.fillStyle = '#12020a'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#ffcf4a'; g.lineWidth = 6; g.strokeRect(4, 4, 504, 120); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `bold 26px ${SERIF}`; g.fillStyle = '#ff7ad8'; g.fillText('PROGRESSIVE JACKPOT · 累积奖池', 256, 30); g.font = `bold 62px ${SERIF}`; g.fillStyle = '#ffe070'; g.shadowColor = '#ff9a2a'; g.shadowBlur = 12; g.fillText('$ ' + jpVal.toLocaleString('en-US'), 256, 84); g.shadowBlur = 0; jpTex.needsUpdate = true }
  drawJp()
  const mJp = new THREE.MeshStandardMaterial({ map: jpTex, emissive: '#ffffff', emissiveMap: jpTex, emissiveIntensity: 2.2, roughness: 0.4 })
  for (const p of byKind('jackpotpole')) {
    b.add(cyl(0.5, 0.6, 2.2, 16), cm('walnut', 1, { key: 'jp', color: '#7a4a6a' }), M(p.x, 1.1, p.y)); b.add(cyl(0.08, 0.08, 1.3, 8), cm('brass', 1), M(p.x, 2.85, p.y))
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; b.add(box(1.5, 0.4, 0.05), mJp, M(p.x + Math.sin(a) * 0.42, 3.35, p.y + Math.cos(a) * 0.42, a)) }
    b.add(box(1.0, 0.42, 1.0), black, M(p.x, 3.35, p.y)); b.add(cyl(0.3, 0.3, 0.12, 16), basicHdr('#ff5ac0', 2.6), M(p.x, 3.62, p.y))
  }
  for (const p of byKind('jackpotboard')) { const R = Rm(p); b.add(box(6.2, 1.7, 0.12), cm('brass', 2), R.clone().multiply(M(0, 4.4, 0.0))); b.add(new THREE.PlaneGeometry(6.0, 1.5), mJp, R.clone().multiply(M(0, 4.4, 0.07))); const bl = 26; for (let k = 0; k < bl; k++) b.add(sph(0.04, 6), basicHdr('#ffd27a', 2.4), R.clone().multiply(M(-3.0 + k * 6 / (bl - 1), 5.3, 0.08))) }
  // 换筹码亭：胡桃木小亭 + 玻璃窗 + 黄铜顶 + CHANGE 灯箱
  const chgTex = textTex(256, 64, (g) => { g.fillStyle = '#0c1a30'; g.fillRect(0, 0, 256, 64); g.font = `bold 34px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#9fe8ff'; g.shadowColor = '#3ac8ff'; g.shadowBlur = 12; g.fillText('CHANGE · 换筹码', 128, 34) })
  const mChg = new THREE.MeshStandardMaterial({ map: chgTex, emissive: '#ffffff', emissiveMap: chgTex, emissiveIntensity: 2.2 })
  for (const p of byKind('kiosk')) { const R = Rm(p); b.add(box(2.2, 1.1, 1.8), cm('walnut', 2), R.clone().multiply(M(0, 0.55, 0))); b.add(box(2.3, 0.05, 1.9), cm('marble', 1), R.clone().multiply(M(0, 1.12, 0))); for (const [x, z] of [[-1.05, -0.85], [1.05, -0.85], [-1.05, 0.85], [1.05, 0.85]]) b.add(cyl(0.04, 0.04, 1.5, 8), cm('brass', 1), R.clone().multiply(M(x, 1.85, z))); b.add(box(2.4, 0.18, 2.0), cm('brass', 2), R.clone().multiply(M(0, 2.65, 0))); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; b.add(new THREE.PlaneGeometry(1.8, 0.4), mChg, R.clone().multiply(M(Math.sin(a) * 1.01 * (k % 2 ? 1.12 : 1), 2.95, Math.cos(a) * (k % 2 ? 1 : 0.92), a))) } b.add(box(2.1, 0.5, 1.7), cm('brass', 1, { key: 'kc', color: '#3a2a1a' }), R.clone().multiply(M(0, 2.95, 0))) }
  // 酒水服务车
  for (const p of byKind('cart')) { const R = Rm(p); for (const y of [0.35, 0.85]) b.add(box(1.1, 0.04, 0.6), cm('walnut', 1), R.clone().multiply(M(0, y, 0))); for (const [x, z] of [[-0.52, -0.27], [0.52, -0.27], [-0.52, 0.27], [0.52, 0.27]]) { b.add(cyl(0.015, 0.015, 0.9, 6), cm('brass', 1), R.clone().multiply(M(x, 0.5, z))); b.add(new THREE.TorusGeometry(0.06, 0.02, 6, 12), black, R.clone().multiply(M(x, 0.08, z, Math.PI / 2))) } for (let k = 0; k < 6; k++) b.add(cyl(0.035, 0.04, 0.28, 8), glass(['#5a2a10', '#2a6a2a', '#c8a050'][k % 3]), R.clone().multiply(M(-0.4 + k * 0.16, 1.01, 0))) }
  // 休息沙发区（酒红丝绒长沙发 + 圆茶几）
  for (const p of byKind('lounge')) { const R = Rm(p); b.add(box(4.0, 0.42, 1.0), cm('leather', 2, { key: 'lounge', color: '#e0b0b8' }), R.clone().multiply(M(0, 0.28, 0))); b.add(box(4.0, 0.62, 0.22), cm('leather', 2, { key: 'lounge', color: '#e0b0b8' }), R.clone().multiply(M(0, 0.72, -0.4))); for (const sx of [-2, 2]) b.add(box(0.2, 0.62, 1.0), cm('leather', 2, { key: 'lounge', color: '#e0b0b8' }), R.clone().multiply(M(sx, 0.5, 0))); b.add(box(4.1, 0.05, 1.05), cm('brass', 1), R.clone().multiply(M(0, 0.05, 0))) }
  for (const p of byKind('loungetable')) { const hi = p.data?.high ? 1.05 : 0.48, r = p.data?.high ? 0.42 : 0.6; b.add(cyl(r, r, 0.05, 24), cm('marble', 1), M(p.x, hi, p.y)); b.add(cyl(0.06, 0.25, hi - 0.02, 12), cm('brass', 1), M(p.x, (hi - 0.02) / 2, p.y)); if (p.data?.high) b.add(sph(0.06, 8), basicHdr('#ffd08a', 2.2), M(p.x, hi + 0.08, p.y)) }
  // 天花板吊挂区域标识（4 张合一张图集 → 一次绘制）
  { const names = [['SLOTS', '老虎机', '#ff5ad0'], ['TABLE GAMES', '牌桌', '#ffd04a'], ['BAR', '酒吧', '#ffb050'], ['CASHIER', '兑换台', '#7ae8ff']]
    const at = textTex(1024, 512, (g) => { names.forEach(([en, zh, c], i) => { const y = i * 128; g.fillStyle = '#100408'; g.fillRect(0, y, 1024, 128); g.strokeStyle = '#d9b25a'; g.lineWidth = 8; g.strokeRect(6, y + 6, 1012, 116); g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = c; g.shadowBlur = 18; g.fillStyle = c; g.font = `bold 60px ${SERIF}`; g.fillText(`${en} · ${zh}`, 512, y + 66); g.shadowBlur = 0 }) })
    const mS = new THREE.MeshStandardMaterial({ map: at, emissive: '#ffffff', emissiveMap: at, emissiveIntensity: 2.0, roughness: 0.5, side: THREE.DoubleSide })
    for (const p of byKind('hangsign')) { const i = p.data?.idx ?? 0, R = Rm(p), g = new THREE.PlaneGeometry(4, 0.5), uv = g.attributes.uv as THREE.BufferAttribute; for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + (1 - uv.getY(k))) / 4); b.add(g, mS, R.clone().multiply(M(0, 4.6, 0))); b.add(box(4.1, 0.6, 0.06), cm('brass', 2), R.clone().multiply(M(0, 4.6, -0.04))); for (const sx of [-1.8, 1.8]) b.add(cyl(0.012, 0.012, H - 4.9, 4), black, R.clone().multiply(M(sx, (H + 4.9) / 2, 0))) } }
  for (const p of byKind('floorlamp')) { b.add(cyl(0.12, 0.15, 0.6, 12), cm('brass', 1), M(p.x, 0.3, p.y)); b.add(cyl(0.11, 0.11, 0.14, 12), basic('#ffd690'), M(p.x, 0.66, p.y)) }
  for (const p of byKind('thsign')) {
    const R = Rm(p), wallM = !!p.data?.wall, y = wallM ? 4.2 : 0
    if (!wallM) { b.add(box(2.6, 0.12, 0.5), cm('brass', 1), R.clone().multiply(M(0, 0.06, 0))); for (const sx of [-1.15, 1.15]) b.add(cyl(0.04, 0.04, 2.6, 10), cm('brass', 1), R.clone().multiply(M(sx, 1.3, 0))) }
    b.add(box(2.4, 1.4, 0.1), std({ color: '#12060a', roughness: 0.5 }), R.clone().multiply(M(0, y + 1.6, 0)))
    const n = cm('neon', 1, { key: 'th' })
    for (const [x, yy, w, h] of [[-0.55, 0.45, 0.8, 0.12], [-0.55, 0, 0.12, 0.9], [0.25, 0, 0.12, 1.0], [0.85, 0, 0.12, 1.0], [0.55, 0, 0.5, 0.12]]) b.add(box(w, h, 0.05), n, R.clone().multiply(M(x, y + 1.6 + yy, 0.08)))
    const bl = new THREE.InstancedMesh(sph(0.03, 6), basicHdr('#ffd27a', 2.4), 36); for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; bl.setMatrixAt(k, R.clone().multiply(M(Math.cos(a) * 1.3 * Math.min(1, 1.25 / Math.max(0.01, Math.abs(Math.cos(a)) * 1.3 / 1.2)), y + 1.6 + Math.sin(a) * 0.72, 0.07))) } bl.name = 'casino-thsign-bulbs'; group.add(bl)
  }
  for (const p of byKind('vipsofa')) { const R = Rm(p); b.add(box(4.2, 0.45, 1.0), cm('leather', 2, { key: 'vip', color: '#c8a8a8' }), R.clone().multiply(M(0, 0.3, 0))); b.add(box(4.2, 0.6, 0.25), cm('leather', 2, { key: 'vip', color: '#c8a8a8' }), R.clone().multiply(M(0, 0.75, -0.4))); for (let i = 0; i < 7; i++) b.add(sph(0.025, 6), cm('brass', 1), R.clone().multiply(M(-1.8 + i * 0.6, 0.85, -0.26))) }
  for (const p of byKind('viptable')) { b.add(cyl(0.95, 0.95, 0.06, 32), cm('feltBJ', 1, { key: 'vip', color: '#5a2a4a' }), M(p.x, 0.62, p.y)); b.add(cyl(1.0, 1.0, 0.05, 32), cm('walnut', 2), M(p.x, 0.58, p.y)); b.add(cyl(0.2, 0.4, 0.56, 16), cm('brass', 1), M(p.x, 0.28, p.y)) }
  for (const p of byKind('staffdoor')) {
    const R = Rm(p); b.add(box(1.4, 2.4, 0.08), cm('walnut', 1), R.clone().multiply(M(0, 1.2, 0))); b.add(box(1.6, 2.55, 0.06), cm('brass', 2), R.clone().multiply(M(0, 1.27, -0.02))); b.add(box(0.08, 0.3, 0.06), cm('brass', 1), R.clone().multiply(M(0.5, 1.05, 0.06)))
    const t = textTex(256, 64, (g) => { g.fillStyle = '#c9a45a'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#2a1408'; g.font = `bold 30px ${SERIF}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('STAFF ONLY · 员工', 128, 34) })
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshStandardMaterial({ map: t, metalness: 0.6, roughness: 0.35 })); s.applyMatrix4(R.clone().multiply(M(0, 1.75, 0.05))); group.add(s)
    b.add(box(0.12, 0.12, 0.05), basic('#ff2a2a'), R.clone().multiply(M(0.5, 1.4, 0.06))) // 锁指示灯
  }
  for (const p of byKind('cctv')) { const z = p.data?.z ?? H - 0.3; b.add(new THREE.SphereGeometry(0.16, 16, 8, 0, TAU, Math.PI / 2, Math.PI / 2), std({ color: '#0a0a0e', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.85 }), M(p.x, z, p.y)); b.add(cyl(0.2, 0.2, 0.06, 16), std({ color: '#d8d4cc', roughness: 0.5 }), M(p.x, z + 0.03, p.y)); if (z < H - 0.5) b.add(cyl(0.025, 0.025, H - z, 6), black, M(p.x, (H + z) / 2, p.y)) }
  const chBulbs: THREE.Matrix4[] = []
  for (const p of byKind('chandelier')) {
    const big = !!p.data?.big, r = big ? 1.4 : 0.8, y = big ? 5.2 : p.data?.vip ? 3.2 : 4.6
    b.add(cyl(0.02, 0.02, H - y, 6), cm('brass', 1), M(p.x, (H + y) / 2, p.y))
    for (const rr of [r, r * 0.6]) b.add(new THREE.TorusGeometry(rr, 0.03, 6, 32), cm('brass', 2), M(p.x, y - (rr === r ? 0 : 0.35), p.y, 0, 1, 1, 1, Math.PI / 2))
    const n = big ? 20 : 12
    for (let k = 0; k < n; k++) { const a = k / n * TAU; chBulbs.push(M(p.x + Math.cos(a) * r, y + 0.05, p.y + Math.sin(a) * r)); if (k % 2 === 0) chBulbs.push(M(p.x + Math.cos(a + 0.3) * r * 0.6, y - 0.3, p.y + Math.sin(a + 0.3) * r * 0.6)) }
  }
  const mChB = cm('bulb', 1, { key: 'chand' })
  const chb = new THREE.InstancedMesh(sph(0.06, 8), mChB, chBulbs.length); chBulbs.forEach((m, i) => chb.setMatrixAt(i, m)); chb.name = 'casino-chandelier-bulbs'; group.add(chb)
  // ---- 大门（内侧，朝北）：同一套跑马灯 ----
  const marquee = buildCasinoMarquee(); marquee.group.position.set(L.door.x, 0, D1); marquee.group.rotation.y = Math.PI; group.add(marquee.group)
  // 4b 门口补光：负数拦门时 Louie / 假肢人 / 保安站在门内 2 m，原来落在门洞暗处看不清 → 两盏实时暖光（不进烘焙）
  for (const [dx, I] of [[0, 9], [-2.2, 4], [2.2, 4]] as const) { const dl = new THREE.PointLight('#ffd6a0', I, 7, 1.6); dl.position.set(L.door.x + dx, 3.1, L.door.y - 2.3); dl.name = 'casino-door-fill'; group.add(dl) }
  b.flush(group, 'casino-static', true)
  void inst
  // ---- 预览用灯（游戏里由 m.lights → 渲染器点光）----
  if (opts.lights) {
    group.add(new THREE.HemisphereLight('#ffd9b0', '#2a120a', 0.5))
    for (const l of L.lights) { if (l.bake) continue; const pl = new THREE.PointLight(l.color, l.r * 1.6, l.r * 2.2, 1.6); pl.position.set(l.x, l.z, l.y); pl.userData.flicker = l.flicker; group.add(pl) }
  }
  let t = 0
  const flickers = group.children.filter((o) => (o as THREE.PointLight).isPointLight && o.userData.flicker) as THREE.PointLight[]
  const base = flickers.map((l) => l.intensity)
  const update = (dt: number, open = true) => {
    t += dt; uni.uTime.value = t
    for (const w of wheels) w.rotation.y += dt * (open ? 1.6 : 0.2)
    balls.forEach((bl, i) => { const a = -t * (open ? 3.1 : 0.3) + i; bl.position.set(Math.cos(a) * 0.38, 0.12, Math.sin(a) * 0.38) })
    marquee.update(t, open)
    const jf = Math.floor(t * 2); if (jf !== jpLast) { jpLast = jf; jpVal += 7 + (jf * 37) % 53; drawJp() }
    for (const m of BAKED) if ((m as THREE.MeshStandardMaterial).lightMap) (m as THREE.MeshStandardMaterial).lightMapIntensity = LM_MAX * Math.PI * LM_GAIN * (open ? 1 : 0.4)
    // 随机闪烁：吊灯灯泡亮度 + 预览点光
    const fl = (s: number) => { const k = Math.sin(t * 13 + s * 91.7) * Math.sin(t * 2.3 + s * 3.1); return k > 0.93 ? 0.25 : 1 }
    mChB.emissiveIntensity = 2.6 * fl(1) * (open ? 1 : 0.4)
    flickers.forEach((l, i) => { l.intensity = base[i] * fl(i + 2) * (open ? 1 : 0.45) })
  }
  update(0)
  const stats = () => { let tris = 0, draws = 0, instances = 0; group.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; const n = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; const ic = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1; tris += n * ic; instances += ic > 1 ? ic : 0; draws += Array.isArray(m.material) ? m.material.length : 1 }); return { tris: Math.round(tris), draws, instances } }
  return { group, update, stats, marquee, wheels, lightmap: lm }
}
