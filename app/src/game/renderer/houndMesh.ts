// 猎犬（Entity 8）重制·阶段 1 建模（hd-wt，2026-10-25）——按 chompgwenarts 速写（中文维基 Entity 8 附图，CC BY-SA 4.0，仅作造型参考）。
// 人脸骨架 + 前凸吻部、大鼻孔、阔嘴满口参差尖牙、可开合下颌挂口水丝；空白发亮的深陷眼；尖耳从长发里穿出；
// 长黑发一缕缕盖住脸（每缕一条骨链，阶段 2 甩动用）；极瘦弓背，肋骨 / 脊突 / 肩胛 / 髋骨凸出、腹部凹陷；
// 肩颈与背上一片片长毛垂落，其余灰白斑秃皮肤带青筋；前肢人臂粗关节、长指钩爪着地；后肢趾行、拉长的人脚、长趾爪；
// 长而蓬的毛尾，尾尖贴地（8 节尾链）。三形态：hostile / neutral（毛色浅、眼神柔）/ ambusher（更瘦长、更低伏、爪更长）。
// 绘制：皮肤 SkinnedMesh 1 + 毛发 SkinnedMesh 1 + 眼 1 + 口水 1 + 手脚指趾 4 = 8 次；贴图仍是共享的皮肤 / 毛发两张。
// 2026-10-25 修模型（阶段 1.1）：脸改成皮包骨的长脸（沿 x 放样的截面头骨：窄颅、太阳穴凹、眉弓 / 颧骨顶起、颧下凹陷、深眼窝、
// 长而窄的吻部 + 窄鼻梁棱、斜缝鼻孔、口裂开到颧骨下、又长又宽的下颌、参差獠牙）；背毛 / 颈鬃分缕扭转分叉 + 成块斑秃；
// 尾巴 = 毛芯 + 错层外层发片 + 尾尖散开；膝 / 踵半角辅助骨防膝窝瘪；够不着地时脚沿地面收（不悬空）。约 2.3 万三角形，仍 8 次绘制。
// 注意：无头 SwiftShader 画 GPU 蒙皮会崩，预览 / 截图要带 ?cpu=1（qaCpuSkin）；真机 GPU 蒙皮正常。
// 本文件同时导出 sweep / limbSeg / shell / canvasTex 等工具，供其他重制模型复用（接口不变）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Entity } from '../entities'
import { disposeL8Tree } from './l8ModelResources'
function drainHoundJob<T>(job:Generator<void,T,unknown>):T { let n=job.next();while(!n.done)n=job.next();return n.value }

function rng(a: number) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const merge = (g: THREE.BufferGeometry[]) => mergeGeometries(g.map((x) => x.index ? x.toNonIndexed() : x))!
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const gauss = (x: number, c: number, w: number) => Math.exp(-((x - c) * (x - c)) / (2 * w * w))
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
/** 圆头端盖：两端半球式收口 */
const cap = (t: number, e = 0.1) => Math.sqrt(Math.max(0.0001, Math.min(1, t / e, (1 - t) / e)))
/** 椭圆截面：管体自身截面坐标 (cs=面内法向分量, sn=Z 向分量) 的半径系数 */
const ell = (cs: number, sn: number, a: number, b: number) => 1 / Math.sqrt((cs / a) ** 2 + (sn / b) ** 2)

type RF = (t: number, d: THREE.Vector3, cs: number, sn: number) => number
/** 沿样条扫掠的管体（含 UV 与顶点色）。rf 给半径，shade 给顶点色明度（AO/骨突）。 */
function sweep(pts: THREE.Vector3[], rf: RF, o: { radial?: number; seg?: number; vRep?: number; uRep?: number; shade?: RF } = {}) {
  const radial = o.radial ?? 10, seg = o.seg ?? 12
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
  const T = new THREE.Vector3(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3(), d = new THREE.Vector3(), P = new THREE.Vector3()
  const Z = V(0, 0, 1), X = V(1, 0, 0)
  for (let i = 0; i <= seg; i++) {
    const t = i / seg
    curve.getPointAt(t, P); curve.getTangentAt(t, T)
    n1.crossVectors(T, Math.abs(T.z) < 0.9 ? Z : X).normalize(); n2.crossVectors(n1, T).normalize()
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2
      d.copy(n1).multiplyScalar(Math.cos(a)).addScaledVector(n2, Math.sin(a))
      const cs = Math.cos(a), sn = Math.sin(a)
      const r = rf(t, d, cs, sn)
      pos.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r)
      uv.push((j / radial) * (o.uRep ?? 1), t * (o.vRep ?? 1))
      const c = o.shade ? o.shade(t, d, cs, sn) : 1
      col.push(c, c, c)
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx); g.computeVertexNormals()
  return g
}
/** 简单肢段：起点→终点（可带中间弯点），肌肉鼓包位置 bulgeAt */
function limbSeg(pts: THREE.Vector3[], r0: number, r1: number, bulge = 0.2, bulgeAt = 0.3, flat = 1, endCap = true) {
  return sweep(pts, (t, _d, cs, sn) => (r0 + (r1 - r0) * t) * (1 + bulge * gauss(t, bulgeAt, 0.16)) * (endCap || t < 0.5 ? cap(t, 0.12) : 1) * ell(cs, sn, 1, flat), {
    radial: 8, seg: 9, vRep: 1.5,
    shade: (t) => 0.82 + 0.18 * gauss(t, bulgeAt, 0.25),
  })
}
/** 低模网格壳：rows×cols 个点由 pt(i,j) 给出，UV 由 uvf(i,j) 给出；用于毛发壳体 */
function shell(rows: number, cols: number, pt: (i: number, j: number) => THREE.Vector3, uvf: (i: number, j: number) => [number, number], shade: (i: number, j: number) => number) {
  const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
  for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
    const p = pt(i, j), [u, v] = uvf(i, j), c = shade(i, j)
    pos.push(p.x, p.y, p.z); uv.push(u, v); col.push(c, c, c)
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * (cols + 1) + j, b = a + cols + 1
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setIndex(idx); g.computeVertexNormals()
  return g
}

// ---------- 程序化贴图（全部猎犬共享缓存；只有皮肤、毛发两张） ----------
let TEX: { skin: THREE.Texture | null; hair: THREE.Texture | null } | null = null
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, R: () => number) => void, repeat: boolean) {
  if (typeof document === 'undefined') return null
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h
  const c = cv.getContext('2d'); if (!c) return null
  draw(c, rng(0x5eed))
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 4
  return t
}
function* canvasTexJob(w:number,h:number,draw:(c:CanvasRenderingContext2D,R:()=>number)=>Generator<void,void,unknown>,repeat:boolean):Generator<void,THREE.Texture|null,unknown>{
 if(typeof document==='undefined')return null
 const cv=document.createElement('canvas');cv.width=w;cv.height=h;const c=cv.getContext('2d');if(!c)return null
 yield*draw(c,rng(0x5eed));const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;if(repeat)t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t
}
function textures(){return TEX??drainHoundJob(prepareHoundTextures())}
let sharedHoundTextureJob:Generator<void,{skin:THREE.Texture|null;hair:THREE.Texture|null},unknown>|null=null
export function* prepareHoundTextures():Generator<void,{skin:THREE.Texture|null;hair:THREE.Texture|null},unknown>{
 if(TEX)return TEX;sharedHoundTextureJob??=drawHoundTexturesJob()
 while(!TEX){const n=sharedHoundTextureJob.next();if(n.done){TEX=n.value;sharedHoundTextureJob=null;break}yield}return TEX!
}
function* drawHoundTexturesJob():Generator<void,{skin:THREE.Texture|null;hair:THREE.Texture|null},unknown>{
  if (TEX) return TEX
  // 皮肤 512²（可平铺）：灰白底、斑驳、斑秃处的短毛茬、透出的青筋、污渍、毛孔
  const S = 512
  const skin = yield* canvasTexJob(S,S,function*(c:CanvasRenderingContext2D,R:()=>number){
    c.fillStyle = '#c4beb2'; c.fillRect(0, 0, S, S)
    const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) f(ox, oy) }
    for (let i = 0; i < 260; i++) { // 大块斑驳：灰褐 / 发黄 / 泛粉的病态皮肤
      const x = R() * S, y = R() * S, r = 10 + R() * 60, a = 0.035 + R() * 0.07, k = R()
      const col = k < 0.4 ? `rgba(118,106,94,${a})` : k < 0.7 ? `rgba(222,214,196,${a})` : k < 0.85 ? `rgba(176,140,128,${a})` : `rgba(150,150,128,${a})`
      tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * (0.5 + R() * 0.5), R() * 3, 0, Math.PI * 2); c.fill() })
    
 yield;
}
    for (let i = 0; i < 26; i++) { // 斑秃：残留短毛茬簇
      const cx = R() * S, cy = R() * S, rad = 14 + R() * 36, n = 40 + Math.floor(R() * 90)
      const hairs: [number, number, number, number][] = []
      for (let k = 0; k < n; k++) { const a = R() * Math.PI * 2, d = Math.sqrt(R()) * rad; hairs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, -0.4 + (R() - 0.5) * 0.9, 3 + R() * 6]) }
      tile((ox, oy) => { c.strokeStyle = 'rgba(46,38,32,0.32)'; c.lineWidth = 1; c.beginPath(); for (const [x, y, a, l] of hairs) { c.moveTo(x + ox, y + oy); c.lineTo(x + ox + Math.cos(a + Math.PI / 2) * l * 0.3, y + oy + Math.sin(a + Math.PI / 2) * l) } c.stroke() })
    
 yield;
}
    for (let i = 0; i < 30; i++) { // 青筋：分叉的青灰血管
      const vein = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
        const pts: [number, number][] = [[x, y]]
        for (let k = 0; k < len; k++) { a += (R() - 0.5) * 0.7; x += Math.cos(a) * 6; y += Math.sin(a) * 6; pts.push([x, y]) }
        tile((ox, oy) => {
          c.strokeStyle = `rgba(78,98,112,${0.16 + w * 0.08})`; c.lineWidth = w; c.lineCap = 'round'; c.beginPath()
          pts.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke()
        })
        if (depth > 0) for (let b = 0; b < 2; b++) { const p = pts[2 + Math.floor(R() * (pts.length - 3))]; vein(p[0], p[1], a + (R() - 0.5) * 2.2, Math.floor(len * 0.5), w * 0.6, depth - 1) }
      }
      vein(R() * S, R() * S, R() * Math.PI * 2, 10 + Math.floor(R() * 12), 1.2 + R() * 1.6, 2)
    
 yield;
}
    for (let i = 0; i < 90; i++) { // 污渍、结痂
      const x = R() * S, y = R() * S, r = 2 + R() * 9, rot = R() * 3, dark = R() < 0.3
      tile((ox, oy) => { c.fillStyle = dark ? 'rgba(90,52,44,0.18)' : 'rgba(70,58,44,0.12)'; c.beginPath(); c.ellipse(x + ox, y + oy, r, r * 0.6, rot, 0, Math.PI * 2); c.fill() })
    
 yield;
}
    const img = c.getImageData(0, 0, S, S), d = img.data
    for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 16; d[i] += n; d[i + 1] += n; d[i + 2] += n 
 if((i&8191)===0)yield;
} // 毛孔噪点
    c.putImageData(img, 0, 0)
  },true)
  // 毛发 256²：灰度发缕（材质颜色决定黑 / 浅灰褐），u 横向可平铺；v=0 发根全不透明 → v=1 发梢参差镂空（alphaTest）
  const hair = yield* canvasTexJob(256,256,function*(c:CanvasRenderingContext2D,R:()=>number){
    c.fillStyle = '#6c6560'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 300; i++) {
      const x = R() * 256, w = 0.8 + R() * 2.6, tone = 70 + R() * 120, a = 0.35 + R() * 0.5
      const c1 = (R() - 0.5) * 10, c2 = (R() - 0.5) * 14, c3 = (R() - 0.5) * 18
      for (const ox of [-256, 0, 256]) {
        c.strokeStyle = `rgba(${tone},${tone * 0.94},${tone * 0.88},${a})`; c.lineWidth = w; c.beginPath(); c.moveTo(x + ox, 0)
        c.bezierCurveTo(x + ox + c1, 90, x + ox + c2, 170, x + ox + c3, 256); c.stroke()
      }
    
 yield;
}
    for (let y = 0; y < 256; y += 2) { c.fillStyle = `rgba(0,0,0,${0.22 * (y / 256)})`; c.fillRect(0, y, 256, 2) 
 yield;
} // 发梢方向略暗
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'
    // 发缕之间的缝：从 v≈0.18 起出现、越往发梢越宽（第一行保持全不透明）
    for (let x = R() * 10; x < 266; x += 9 + R() * 12) {
      const top = 46 + R() * 70, w = 1.5 + R() * 3.5, cx = x + (R() - 0.5) * 6
      for (const ox of [-256, 0, 256]) { c.beginPath(); c.moveTo(cx + ox, top); c.lineTo(cx + ox - w, 257); c.lineTo(cx + ox + w, 257); c.closePath(); c.fill() }
    
 yield;
}
    for (let x = -6; x < 262; x += 4 + R() * 5) { // 参差发梢
      const top = 176 + R() * 66
      c.beginPath(); c.moveTo(x - 3 - R() * 4, 257); c.lineTo(x + 3 + R() * 4, 257); c.lineTo(x + (R() - 0.5) * 3, top); c.closePath(); c.fill()
    
 yield;
}
    c.fillRect(0, 250, 256, 6)
    c.globalCompositeOperation = 'source-over'
  },false)
  if (hair) { hair.wrapS = THREE.RepeatWrapping; hair.flipY = false } // v=0 发根（画布顶）→ v=1 发梢（画布底）
  TEX = { skin, hair }
  return TEX
}


// ---------- 骨架 / 对外接口 ----------
export type HoundKind = 'hostile' | 'neutral' | 'ambusher'
/** 形态参数：len 躯干纵向、thin 粗细、low 静止时伏低量（米，animateHound 用）、claw 爪长、limb 四肢长 */
export interface HoundShape { len: number; thin: number; low: number; claw: number; limb: number }
export const HOUND_SHAPES: Record<HoundKind, HoundShape> = {
  hostile: { len: 1, thin: 1, low: 0.13, claw: 1, limb: 1 },
  neutral: { len: 1, thin: 1.03, low: 0.08, claw: 0.85, limb: 1 },
  ambusher: { len: 1.12, thin: 0.84, low: 0.21, claw: 1.6, limb: 1.07 },
}
/** 一条腿：hip→knee→ankle→paw 四个关节（前肢 = 肩 / 肘 / 腕 / 指根，后肢 = 髋 / 膝 / 踵 / 跖球），绕 z 轴屈伸 */
export interface HoundLeg {
  hip: THREE.Object3D; knee: THREE.Object3D; ankle: THREE.Object3D; paw: THREE.Object3D
  /** 半角辅助骨（膝 / 踵处转一半角度并略放大，防关节内侧瘪），由 solveLeg 同步 */
  kneeH?: THREE.Object3D; ankleH?: THREE.Object3D
  front: boolean; side: number; sole: THREE.Box3
  /** 静止几何：各段长度、各段在 body 坐标系里的静止角（弧度）、膝弯方向（+1 逆时针） */
  l1: number; l2: number; l3: number; a1: number; a2: number; a3: number; bend: number
  /** 髋 / 肩关节在 body 骨局部的 (x,y)；静止落脚点（模型空间 x）；paw 关节离地高度；静止时掌 / 跖段的世界角 */
  hx: number; hy: number; restX: number; pawY: number; phi: number
}
/** 一缕毛发（头发 / 背鬃 / 颈鬃）：骨链从发根到发梢，静止旋转全为 0；az 为头发在头部的方位角（0=正前，+ 为右侧 +z） */
export interface HoundLock { bones: THREE.Bone[]; az: number; len: number; group: 'face' | 'side' | 'back' | 'mane' | 'neck' }
export interface HoundRig {
  body: THREE.Object3D; neck: THREE.Object3D; head: THREE.Object3D; jaw: THREE.Object3D
  /** 尾链第一节（尾根）；tailChain 为全部尾节，tailChain[0] === tail */
  tail: THREE.Object3D; tailChain: THREE.Bone[]
  legs: HoundLeg[]
  earL: THREE.Object3D; earR: THREE.Object3D
  /** 头发骨链（face / side / back）与身上的长毛骨链（mane / neck） */
  hair: HoundLock[]; mane: HoundLock[]
  kind: HoundKind; shape: HoundShape
  /** body 骨静止高度（模型空间 y） */
  bodyY: number
}

/** 给几何加 skinIndex / skinWeight（fn 按顶点位置给权重） */
function skinGeo(g: THREE.BufferGeometry, fn: (p: THREE.Vector3, i: number) => number[]) {
  const pa = g.attributes.position as THREE.BufferAttribute, n = pa.count
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), p = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pa, i)
    const w = fn(p, i)
    let sum = 0
    for (let k = 0; k < 4; k++) sum += w[k * 2 + 1] ?? 0
    for (let k = 0; k < 4; k++) { si[i * 4 + k] = w[k * 2] ?? 0; sw[i * 4 + k] = sum > 0 ? (w[k * 2 + 1] ?? 0) / sum : k === 0 ? 1 : 0 }
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  return g
}
/** 统一顶点色 */
function tint(g: THREE.BufferGeometry, r: number, gg = r, b = r) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b }
  g.setAttribute('color', new THREE.Float32BufferAttribute(a, 3)); return g
}
/** 顶点色乘一个 RGB（保留原明度） */
function mulColor(g: THREE.BufferGeometry, r: number, gg: number, b: number, w?: (p: THREE.Vector3) => number) {
  const ca = g.attributes.color as THREE.BufferAttribute, pa = g.attributes.position as THREE.BufferAttribute, p = new THREE.Vector3()
  for (let i = 0; i < ca.count; i++) {
    const k = w ? w(p.fromBufferAttribute(pa, i)) : 1
    ca.setXYZ(i, ca.getX(i) * (1 + (r - 1) * k), ca.getY(i) * (1 + (gg - 1) * k), ca.getZ(i) * (1 + (b - 1) * k))
  }
  return g
}
function cleanAttrs(g: THREE.BufferGeometry) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'skinIndex', 'skinWeight'].includes(k)) g.deleteAttribute(k); return g }

/**
 * 毛发带：沿路径的三列条带（中列略外凸成弧形截面），u 横向、v 由发根 0 → 发梢 1。
 * joints 为路径上的关节下标（升序，首个为 0），bones 为对应骨的骨架下标；顶点按弧长在相邻两节间线性混合。
 */
function ribbon(path: THREE.Vector3[], width: (t: number) => number, facing: (i: number) => THREE.Vector3, u0: number, u1: number,
  joints: number[], bones: number[], shade: (t: number) => number, v0 = 0, v1 = 1, curl = 0.25, cols = 3) {
  const n = path.length
  const acc = [0]; for (let i = 1; i < n; i++) acc.push(acc[i - 1] + path[i].distanceTo(path[i - 1]))
  const sJ = joints.map((j) => acc[j])
  const wts: [number, number, number][] = []
  for (let i = 0; i < n; i++) {
    // 骨权重：按弧长落在哪两节之间
    const s = acc[i]
    let k = sJ.length - 1
    for (let j = 0; j < sJ.length - 1; j++) if (s < sJ[j + 1]) { k = j; break }
    let i0 = bones[k], i1 = bones[Math.min(k + 1, bones.length - 1)], wt = 0
    if (k < sJ.length - 1) wt = (s - sJ[k]) / Math.max(1e-6, sJ[k + 1] - sJ[k])
    else { i1 = i0; wt = 0 }
    wts.push([i0, i1, wt])
  }
  return ribbonW(path, width, facing, u0, u1, wts, shade, v0, v1, curl, cols)
}
/** 同 ribbon，但每个路径点直接给出 [骨 0, 骨 1, 骨 1 权重]（尾巴发片按尾曲线参数取权重） */
function ribbonW(path: THREE.Vector3[], width: (t: number) => number, facing: (i: number) => THREE.Vector3, u0: number, u1: number,
  wts: [number, number, number][], shade: (t: number) => number, v0 = 0, v1 = 1, curl = 0.25, cols = 3) {
  const n = path.length, pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [], si: number[] = [], sw: number[] = []
  const acc = [0]; for (let i = 1; i < n; i++) acc.push(acc[i - 1] + path[i].distanceTo(path[i - 1]))
  const L = acc[n - 1] || 1
  const T = new THREE.Vector3(), S = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    const t = acc[i] / L
    T.copy(path[Math.min(n - 1, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize()
    const F = facing(i)
    S.crossVectors(F, T).normalize()
    const w = width(t) / 2
    const [i0, i1, wt] = wts[i]
    for (let c = 0; c < cols; c++) {
      const a = cols === 3 ? c - 1 : c * 2 - 1
      const p = path[i].clone().addScaledVector(S, a * w).addScaledVector(F, (a === 0 ? curl : 0) * w)
      pos.push(p.x, p.y, p.z)
      uv.push(u0 + (u1 - u0) * (c / (cols - 1)), v0 + (v1 - v0) * t)
      const sh = shade(t) * (a === 0 ? 1 : 0.86)
      col.push(sh, sh, sh)
      si.push(i0, i1, 0, 0); sw.push(1 - wt, wt, 0, 0)
    }
  }
  for (let i = 0; i < n - 1; i++) for (let c = 0; c < cols - 1; c++) {
    const a = i * cols + c, b = a + cols
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  g.setIndex(idx); g.computeVertexNormals()
  return g
}
/** 发缕朝向加随机扭转：base(i) 绕路径切线转 twist·(i/(n-1)) 弧度 */
function twisted(path: THREE.Vector3[], base: (i: number) => THREE.Vector3, twist: number) {
  const n = path.length, T = new THREE.Vector3(), q = new THREE.Quaternion()
  return (i: number) => {
    T.copy(path[Math.min(n - 1, i + 1)]).sub(path[Math.max(0, i - 1)]).normalize()
    return base(i).clone().applyQuaternion(q.setFromAxisAngle(T, twist * (i / Math.max(1, n - 1))))
  }
}
/** 推出椭球体外（中心 c、半轴 r、留 m 间隙） */
function pushEll(p: THREE.Vector3, c: THREE.Vector3, r: THREE.Vector3, m: number) {
  const dx = (p.x - c.x) / (r.x + m), dy = (p.y - c.y) / (r.y + m), dz = (p.z - c.z) / (r.z + m)
  const q = Math.hypot(dx, dy, dz)
  if (q < 1 && q > 1e-6) { p.set(c.x + dx / q * (r.x + m), c.y + dy / q * (r.y + m), c.z + dz / q * (r.z + m)) }
}
/** 推出胶囊体外 */
function pushCap(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()))
  const c = a.clone().addScaledVector(ab, t), d = p.clone().sub(c), L = d.length()
  if (L < r) { if (L < 1e-6) d.set(0, 1, 0); else d.divideScalar(L); p.copy(c).addScaledVector(d, r) }
}

/**
 * 猎犬（Entity 8）阶段 1 重制模型。模型正面 +X、脚底 y=0。
 * 结构：一张刚性 + 关节处混合权重的皮肤 SkinnedMesh（躯干 / 颈 / 头 / 下颌 / 双耳 / 四肢上中下三段）、
 * 一张毛发 SkinnedMesh（头发缕骨链、肩颈背长毛骨链、毛尾骨链，alphaTest 发片）、眼、口水丝、四只手 / 脚的指趾（刚性，挂在 paw 关节）。
 */
export function buildHoundMesh(neutral=false,seed=0,kind?:HoundKind):THREE.Group{return drainHoundJob(buildHoundMeshJob(neutral,seed,kind))}
export function* buildHoundMeshJob(neutral=false,seed=0,kind?:HoundKind):Generator<void,THREE.Group,unknown>{yield*prepareHoundTextures();
  const K: HoundKind = neutral ? 'neutral' : kind === 'ambusher' ? 'ambusher' : 'hostile'
 yield;
  const SH = HOUND_SHAPES[K]
 yield;
  const grp = new THREE.Group()
 yield;
 let complete=false;
 yield;try{
 yield;
  grp.userData.entityType = 'hound'
 yield;
  grp.userData.parts = {}
 yield;
  const R = rng(0x8a11 + seed * 131)
 yield;
  const tx = textures()
 yield;
  // ---------- 材质（每只独立；贴图共享） ----------
  const skinCol = K === 'neutral' ? '#ece4d6' : K === 'ambusher' ? '#cfcbc4' : '#dcd6cc'
 yield;
  const skinM = new THREE.MeshLambertMaterial({ color: skinCol, map: tx.skin, vertexColors: true })
 yield;
  const hairM = new THREE.MeshLambertMaterial({ color: K === 'neutral' ? '#d4c3ad' : '#6a5d52', map: tx.hair, vertexColors: true, side: THREE.DoubleSide, alphaTest: tx.hair ? 0.5 : 0 })
 yield;
  if (K === 'neutral' && tx.hair) hairM.color.setRGB(1.75, 1.58, 1.36)
 yield; // 中立：浅灰褐毛色（线性空间倍增，贴图本身是中灰）
  if (!tx.hair) hairM.color.set(K === 'neutral' ? '#6f6254' : '#15110e')
 yield;
  if (!tx.skin) skinM.color.set(K === 'neutral' ? '#e2d9c8' : '#cfc9bf')
 yield;
  const eyeM = new THREE.MeshBasicMaterial({ color: K === 'neutral' ? '#e4dcc8' : '#fffdf2', vertexColors: true })
 yield;
  const droolM = new THREE.MeshLambertMaterial({ color: '#dfe4d8', emissive: '#22261f', transparent: true, opacity: 0.5, depthWrite: false })
 yield;

  // ---------- 静止骨架（模型空间） ----------
  const LX = SH.len, TH = SH.thin, LM = SH.limb
 yield;
  const bodyY = 0.62
 yield;
  const bones: THREE.Bone[] = []
 yield;
  const boneAt = (name: string, parent: THREE.Object3D, world: THREE.Vector3) => {
    const b = new THREE.Bone(); b.name = name
    const pw = parent.userData.world as THREE.Vector3 | undefined
    b.position.copy(world).sub(pw ?? V(0, 0, 0)); b.userData.world = world.clone()
    parent.add(b); bones.push(b); return b
  }
 yield;
  grp.userData.world = V(0, 0, 0)
 yield;
  const body = boneAt('body', grp, V(0, bodyY, 0))
 yield;
  const NECK0 = V(0.4 * LX, 0.7, 0), HEAD0 = V(0.4 * LX + 0.18, 0.6, 0)
 yield;
  const neck = boneAt('neck', body, NECK0)
 yield;
  const head = boneAt('head', neck, HEAD0)
 yield;
  const HS = 1.24
 yield; // 头部整体放大（头部局部坐标 × HS → 模型空间）
  const JAW0 = HEAD0.clone().add(V(0.0, -0.052 * HS, 0))
 yield;
  const jaw = boneAt('jaw', head, JAW0)
 yield;
  const EAR = (s: number) => HEAD0.clone().add(V(0.022 * HS, 0.092 * HS, s * 0.062 * HS))
 yield;
  const earL = boneAt('earL', head, EAR(-1)), earR = boneAt('earR', head, EAR(1))
 yield;
  const BI = (b: THREE.Bone) => bones.indexOf(b)
 yield;

  const skinParts: THREE.BufferGeometry[] = []
 yield;
  const add = (g: THREE.BufferGeometry, w: (p: THREE.Vector3, i: number) => number[]) => { skinParts.push(cleanAttrs(skinGeo(g, w))) }
 yield;

  // ---------- 躯干：沿弓背脊线扫掠，肋骨 / 脊突 / 肩胛 / 髋骨 / 凹腹雕在表面 ----------
  const spine = [V(-0.68, 0.69, 0), V(-0.5, 0.72, 0), V(-0.3, 0.745, 0), V(-0.08, 0.735, 0), V(0.14, 0.7, 0), V(0.32, 0.685, 0), V(0.47, 0.665, 0)]
    .map((p) => V(p.x * LX, p.y, 0))
 yield;
  const spineC = new THREE.CatmullRomCurve3(spine, false, 'centripetal')
 yield;
  // 截面半径表（t：0 臀后 → 1 胸前）：上半径 / 下半径 / 侧半径
  const PR: [number, number, number, number][] = [
    [0, 0.05, 0.05, 0.05], [0.07, 0.085, 0.08, 0.088], [0.16, 0.088, 0.088, 0.095], [0.3, 0.07, 0.058, 0.074], [0.44, 0.068, 0.07, 0.076],
    [0.58, 0.076, 0.15, 0.1], [0.72, 0.082, 0.195, 0.115], [0.84, 0.09, 0.175, 0.115], [0.93, 0.085, 0.12, 0.1], [1, 0.05, 0.06, 0.06]]
 yield;
  const prof = (t: number, k: 1 | 2 | 3) => {
    for (let i = 1; i < PR.length; i++) if (t <= PR[i][0]) { const a = PR[i - 1], b = PR[i]; const f = sstep(0, 1, (t - a[0]) / (b[0] - a[0])); return a[k] + (b[k] - a[k]) * f }
    return PR[PR.length - 1][k]
  }
 yield;
  const torsoDetail = (t: number, cs: number, sn: number) => {
    const top = Math.max(0, -cs), side = Math.abs(sn), down = Math.max(0, cs)
    // 肋骨：斜向（越往下越靠后）的棱 + 肋间沟
    const ribPh = Math.sin((t * 34 + cs * 1.6) * Math.PI)
    const ribZone = sstep(0.5, 0.6, t) * (1 - sstep(0.86, 0.93, t)) * sstep(-0.55, 0.1, cs)
    const ribs = 0.011 * ribPh * ribZone
    const spineB = 0.008 * Math.max(0, Math.sin(t * Math.PI * 26)) ** 2 * sstep(0.92, 1, top)
    // 肩胛骨：肩上两片高高顶起的骨板（上缘尖棱）
    const blade = 0.055 * gauss(t, 0.835, 0.045) * gauss(top, 0.78, 0.17) * sstep(0.15, 0.5, side) * (0.8 + 0.2 * Math.sin(t * 60))
    // 髋骨（髂嵴）+ 坐骨
    const hips = 0.04 * gauss(t, 0.15, 0.05) * gauss(top, 0.6, 0.22) * sstep(0.25, 0.7, side) + 0.02 * gauss(t, 0.04, 0.04) * gauss(down, 0.4, 0.3)
    // 胸骨棱
    const keel = 0.012 * gauss(t, 0.76, 0.1) * sstep(0.85, 1, down)
    // 凹陷的腹部（腰窝）
    const tuck = -0.018 * gauss(t, 0.38, 0.09) * sstep(0.2, 0.9, down) - 0.012 * gauss(t, 0.3, 0.06) * gauss(side, 0.9, 0.2)
    return { ribs, ribPh, ribZone, spineB, blade, hips, keel, tuck }
  }
 yield;
  const torsoR = (t: number, cs: number, sn: number) => {
    const rU = prof(t, 1) * TH, rD = prof(t, 2) * TH, rZ = prof(t, 3) * TH
    const rv = cs > 0 ? rD : rU
    const k = torsoDetail(t, cs, sn)
    return rv * rZ / Math.sqrt((sn * rv) ** 2 + (cs * rZ) ** 2) * cap(t, 0.06) + k.ribs + k.spineB + k.blade + k.hips + k.keel + k.tuck
  }
 yield;
  /** 躯干表面点：t 沿脊线、a 截面角（0 朝下、π/2 朝 +z、π 朝上） */
  const torsoFrame = (t: number) => {
    const P = spineC.getPointAt(t), T = spineC.getTangentAt(t)
    const n1 = new THREE.Vector3().crossVectors(T, V(0, 0, 1)).normalize(), n2 = new THREE.Vector3().crossVectors(n1, T).normalize()
    return { P, T, n1, n2 }
  }
 yield;
  const torsoPt = (t: number, a: number, off = 0) => {
    const { P, n1, n2 } = torsoFrame(t), cs = Math.cos(a), sn = Math.sin(a)
    return P.clone().addScaledVector(n1, cs * (torsoR(t, cs, sn) + off)).addScaledVector(n2, sn * (torsoR(t, cs, sn) + off))
  }
 yield;
  {
    const g = sweep(spine, (t, _d, cs, sn) => torsoR(t, cs, sn), {
      radial: 26, seg: 46, vRep: 3.2, uRep: 2,
      shade: (t, _d, cs, sn) => {
        const k = torsoDetail(t, cs, sn)
        const groove = Math.max(0, -k.ribPh) * 0.32 * k.ribZone
        return Math.min(1.12, 0.9 + Math.max(0, k.ribs) * 7 + k.spineB * 6 + k.blade * 3 + k.hips * 4 + k.keel * 5 - groove + k.tuck * 5 - (cs > 0.5 ? 0.08 : 0))
      },
    })
 yield;
    add(g, (p) => { const f = sstep(0.42 * LX, 0.5 * LX, p.x); return [BI(body), 1 - f * 0.5, BI(neck), f * 0.5] })
 yield;
  }
 yield;
  // ---------- 颈：细长前伸，颈椎棘突 + 两侧胸锁乳突肌 ----------
  {
    const a = NECK0.clone().add(V(-0.05, -0.01, 0)), b = NECK0.clone().lerp(HEAD0, 0.5).add(V(0, 0.004, 0)), c = HEAD0.clone().add(V(0.045 * HS, -0.02, 0))
 yield;
    const g = sweep([a, b, c], (t, _d, cs, sn) => {
      const top = Math.max(0, -cs), side = Math.abs(sn)
      const r = (0.07 - 0.026 * sstep(0.35, 1, t)) * TH * (t < 0.25 ? 1 + 0.8 * (0.25 - t) : 1)
      return r * ell(cs, sn, 1.05, 0.9) + 0.008 * Math.max(0, Math.sin(t * Math.PI * 9)) ** 2 * sstep(0.85, 1, top) + 0.006 * gauss(side, 0.85, 0.1) * gauss(cs, 0.3, 0.3)
    }, { radial: 14, seg: 12, vRep: 1, shade: (_t, _d, cs) => 0.88 - (cs > 0.4 ? 0.08 : 0) })
 yield;
    add(g, (p) => { const t = (p.x - a.x) / (c.x - a.x); const fb = 1 - sstep(0, 0.22, t), fh = sstep(0.72, 0.98, t); return [BI(body), fb, BI(neck), 1 - fb - fh, BI(head), fh] })
 yield;
  }
 yield;
  // ---------- 头：皮包骨的人 / 犬之间的长脸（沿 x 放样的截面头骨，逐截面雕刻） ----------
  // 2026-10-25 修模型：旧版球体雕刻太圆太胖、猪鼻卡通。改为沿 x 放样：颅腔窄、太阳穴凹、眉弓 / 颧骨顶起、
  // 颧下脸颊凹陷、眼窝深陷；吻部长而窄、鼻梁成窄棱，吻端略下垂成人 / 犬之间的鼻头，鼻孔是两道斜缝；
  // 口裂一直开到颧骨下方（嘴角往后裂开）；下颌又长又宽，下颌角外张。
  const HC = V(0.055, 0.024, 0)
 yield; // 头部局部：颅腔中心（skull(d) 的射线原点；头发 / 碰撞都从这里查）
  const MOUTH_Y = -0.058
 yield;
  const neutralSoft = K === 'neutral' ? 1 : 0
 yield;
  const HX0 = -0.044, HX1 = 0.262
 yield; // 头骨后端 / 鼻尖
  const MOUTH_X = 0.012
 yield; // 嘴角（口裂后端）
  // 截面关键帧：x、顶 y、底 y、半宽、顶部指数（<2 尖棱）
  const HK: [number, number, number, number, number][] = [
    [HX0, 0.035, -0.005, 0.034, 2], [-0.02, 0.088, -0.04, 0.058, 2.1], [0.015, 0.11, -0.044, 0.064, 2.2], [0.06, 0.12, -0.05, 0.066, 2.3],
    [0.1, 0.106, -0.056, 0.06, 2.2], [0.126, 0.088, -0.058, 0.054, 2.0], [0.15, 0.058, -0.058, 0.045, 1.75], [0.175, 0.042, -0.058, 0.037, 1.6], [0.205, 0.03, -0.058, 0.031, 1.55],
    [0.236, 0.014, -0.057, 0.027, 1.6], [HX1, 0.004, -0.05, 0.022, 1.9]]
 yield;
  const hk = (x: number, k: 1 | 2 | 3 | 4) => {
    if (x <= HK[0][0]) return HK[0][k]
    for (let i = 1; i < HK.length; i++) if (x <= HK[i][0]) { const a = HK[i - 1], b = HK[i]; return a[k] + (b[k] - a[k]) * sstep(0, 1, (x - a[0]) / (b[0] - a[0])) }
    return HK[HK.length - 1][k]
  }
 yield;
  /** 截面极坐标半径：a 从正上方（0）经 +z（π/2）到正下方（π） */
  const secBase = (x: number, a: number) => {
    const top = hk(x, 1), bot = hk(x, 2), w = hk(x, 3), nT = hk(x, 4)
    const yc = (top + bot) / 2, h = (top - bot) / 2
    const c = Math.cos(a), s = Math.sin(a), A = Math.abs(a)
    const mouthF = sstep(MOUTH_X - 0.01, MOUTH_X + 0.02, x)
    const n = c >= 0 ? nT : 2 + 2.2 * mouthF // 口裂段底部压平成上颚
    let r = 1 / ((Math.abs(c) / h) ** n + (Math.abs(s) / w) ** n) ** (1 / n)
    // 骨相：颅顶矢状棱、太阳穴凹、眉弓、颧骨 / 颧弓、颧下凹陷、窄鼻梁棱、鼻翼、上唇
    r += 0.003 * gauss(A, 0, 0.12) * gauss(x, 0.03, 0.045)
    r -= 0.0105 * gauss(x, 0.08, 0.026) * gauss(A, 0.86, 0.26)
    r += (0.02 - 0.006 * neutralSoft) * gauss(x, 0.126, 0.011) * gauss(A, 0.9, 0.24) + 0.004 * gauss(x, 0.122, 0.01) * gauss(A, 0, 0.25)
    r += 0.02 * gauss(x, 0.104, 0.019) * gauss(A, 1.72, 0.24) + 0.009 * gauss(x, 0.055, 0.03) * gauss(A, 1.7, 0.16)
    r -= (0.021 - 0.006 * neutralSoft) * gauss(x, 0.148, 0.022) * gauss(A, 2.08, 0.3) + 0.009 * gauss(x, 0.095, 0.02) * gauss(A, 2.25, 0.22)
    r += 0.0035 * gauss(A, 0, 0.16) * sstep(0.14, 0.17, x)
    r += 0.005 * gauss(x, 0.238, 0.011) * gauss(A, 1.45, 0.35)
    r += 0.0025 * gauss(A, 2.45, 0.22) * sstep(0.03, 0.07, x)
    // 两端收口：后脑圆、鼻尖圆钝
    r *= Math.sqrt(Math.max(0.0004, Math.min(1, (x - HX0) / 0.05))) * Math.sqrt(Math.max(0.0004, Math.min(1, (HX1 + 0.006 - x) / 0.024)))
    return { r, yc }
  }
 yield;
  const secPt = (x: number, a: number, r: number, yc: number) => V(x, yc + r * Math.cos(a), r * Math.sin(a))
 yield;
  // 眼：深陷在眉弓下的眼窝里（位置按截面算）
  const EYE0 = (s: number) => { const b = secBase(0.134, s * 1.02); return secPt(0.134, s * 1.02, b.r, b.yc) }
 yield;
  const SOCK = (s: number) => EYE0(s).add(V(-0.002, 0.001, -s * 0.003))
 yield;
  const headR = (x: number, a: number) => {
    const b = secBase(x, a)
    const p = secPt(x, a, b.r, b.yc)
    let dark = 0
    for (const s of [-1, 1]) { const k = gauss(p.distanceTo(SOCK(s)), 0, 0.022); b.r -= (0.034 - 0.011 * neutralSoft) * k; dark = Math.max(dark, k) }
    return { r: Math.max(0.002, b.r), yc: b.yc, dark }
  }
 yield;
  const EYE = (s: number) => { const x = 0.131, a = s * 1.04, h = headR(x, a); return secPt(x, a, h.r - 0.0062, h.yc) }
 yield; // 眼球中心压在眼窝底下，只露出前半
  /** 头骨表面查询（头部局部）：从颅腔中心沿 d 方向找表面（二分），保持旧接口 */
  const skull = (d: THREE.Vector3) => {
    const inside = (q: THREE.Vector3) => {
      if (q.x <= HX0 || q.x >= HX1 + 0.006) return false
      const yc = secBase(q.x, 0).yc, dy = q.y - yc, a = Math.atan2(q.z, dy)
      return Math.hypot(dy, q.z) < headR(q.x, a).r
    }
    let lo = 0, hi = 0.36
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (inside(HC.clone().addScaledVector(d, m))) lo = m; else hi = m }
    return { p: HC.clone().addScaledVector(d, lo) }
  }
 yield;
  const headParts: THREE.BufferGeometry[] = []
 yield;
  let palateEdge: (x: number) => number = () => 0.04
 yield;
  {
    const NX = 46, NA = 36
 yield;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
 yield;
    const edge = new Float32Array(40)
 yield;
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, x = HX0 + (HX1 + 0.006 - HX0) * (0.5 - 0.5 * Math.cos(Math.PI * u))
 yield; // 两端加密
      for (let j = 0; j <= NA; j++) {
        const a = (j / NA) * Math.PI * 2 - Math.PI
 if((j&63)===0)yield;
        const s = headR(x, a), p = secPt(x, a, s.r, s.yc), A = Math.abs(a)
 if((j&63)===0)yield;
        pos.push(p.x, p.y, p.z);
 if((j&63)===0)yield; uv.push(j / NA * 2, u * 1.6)
 if((j&63)===0)yield;
        // 顶点色：骨突提亮、凹处与眼窝压暗，口裂内暗红
        const bone = gauss(x, 0.126, 0.012) * gauss(A, 0.9, 0.24) + gauss(x, 0.102, 0.02) * gauss(A, 1.72, 0.22) + 0.6 * gauss(A, 0, 0.12) * sstep(0.14, 0.2, x)
 if((j&63)===0)yield;
        const hollow = gauss(x, 0.08, 0.026) * gauss(A, 0.86, 0.26) + gauss(x, 0.152, 0.022) * gauss(A, 2.12, 0.3)
 if((j&63)===0)yield;
        let r = 0.86 + 0.2 * bone - 0.2 * hollow - Math.min(1, s.dark * 1.6) * 0.8, gg = r, b = r
 if((j&63)===0)yield;
        const palate = x > MOUTH_X + 0.004 && p.y < MOUTH_Y + 0.0025
 if((j&63)===0)yield;
        if (palate) { r = 0.4;
 if((j&63)===0)yield; gg = 0.15;
 if((j&63)===0)yield; b = 0.14
 if((j&63)===0)yield; }
        else if (x > 0.15) { r *= 0.96; gg *= 0.88; b *= 0.86 }
 if((j&63)===0)yield; // 吻部略泛粉
        if (!palate && p.y < MOUTH_Y + 0.008 && x > MOUTH_X - 0.004 && x < 0.05) { r *= 0.7;
 if((j&63)===0)yield; gg *= 0.6;
 if((j&63)===0)yield; b *= 0.6
 if((j&63)===0)yield; }
 if((j&63)===0)yield; // 嘴角裂口
        col.push(r, gg, b)
 if((j&63)===0)yield;
        if (p.y < MOUTH_Y + 0.004) { const k = Math.max(0, Math.min(39, Math.floor((p.x + 0.05) / 0.32 * 40)));
 if((j&63)===0)yield; edge[k] = Math.max(edge[k], Math.abs(p.z))
 if((j&63)===0)yield; }
 if((j&63)===0)yield;
      }
 yield;
    }
 yield;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b2 = a + NA + 1;
 yield; idx.push(a, a + 1, b2, b2, a + 1, b2 + 1)
 yield; }
 yield;
    const g = new THREE.BufferGeometry()
 yield;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
 yield; g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
 yield; g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
 yield;
    g.setIndex(idx);
 yield; g.computeVertexNormals()
 yield;
    palateEdge = (x: number) => { const k = Math.max(0, Math.min(39, Math.floor((x + 0.05) / 0.32 * 40))); let e = edge[k]; for (let j = 1; !e && j < 6; j++) e = Math.max(edge[Math.max(0, k - j)], edge[Math.min(39, k + j)]); return e || 0.03 }
 yield;
    headParts.push(g)
 yield;
    // 鼻孔：鼻头前下方两道斜缝（不再是大圆洞）
    const tipB = secBase(HX1 - 0.004, Math.PI * 0.62)
 yield;
    for (const s of [-1, 1]) {
      const c = V(HX1 - 0.0035, tipB.yc - 0.012, s * 0.0105)
 yield;
      headParts.push(tint(new THREE.SphereGeometry(0.009, 8, 6).scale(0.3, 0.2, 1).rotateX(-s * 0.75).rotateY(s * 0.35).translate(c.x, c.y, c.z), 0.06, 0.035, 0.035))
 yield;
    }
 yield;
    // 喉咙：口腔深处的暗色
    if (neutralSoft) for (const s of [-1, 1]) { // 中立：半垂的眼睑，眼神柔和
      const q = EYE(s)
      headParts.push(tint(new THREE.SphereGeometry(0.019, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.42).rotateZ(-0.5).translate(q.x + 0.001, q.y + 0.002, q.z), 0.86))
    }
 yield;
  }
 yield;
  // 上牙：沿上颚边缘一路排到嘴角，参差、歪斜、长短不一，偶有缺牙；犬齿位两颗长獠牙
  let tipX = 0
 yield;
  {
    const pa = headParts[0].attributes.position as THREE.BufferAttribute
 yield;
    for (let i = 0; i < pa.count; i++) if (pa.getY(i) < MOUTH_Y + 0.004) tipX = Math.max(tipX, pa.getX(i))
 yield;
    const n = 14
 yield;
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
      const f = Math.min(1, (i + (s > 0 ? 0.5 : 0) + (R() - 0.5) * 0.5) / n)
 yield;
      if (i > 2 && R() < 0.12) continue
 yield;
      const x = tipX - 0.006 - f * (tipX - MOUTH_X - 0.014)
 yield;
      const z = s * Math.max(0.005, palateEdge(x) - 0.005)
 yield;
      const fang = i === 1 ? 1 : 0
 yield;
      const len = (0.012 + R() * 0.024 + 0.022 * fang) * (1 - 0.35 * f) * (K === 'neutral' ? 0.75 : 1)
 yield;
      const tooth = new THREE.ConeGeometry(0.0048 + R() * 0.0034 + 0.002 * fang, len, 5, 1, true).rotateX(Math.PI)
 yield;
      tooth.rotateZ((R() - 0.5) * 0.7 + 0.12).rotateX((R() - 0.5) * 0.55 + s * 0.14).translate(x, MOUTH_Y + 0.003 - len / 2, z)
 yield;
      headParts.push(tint(tooth, 1.16, 1.06, 0.84 - R() * 0.12))
 yield;
    }
 yield;
  }
 yield;
  // 头部几何从头部局部移到模型空间
  for (const g of headParts) { g.scale(HS, HS, HS).translate(HEAD0.x, HEAD0.y, HEAD0.z);
 yield; add(g, () => [BI(head), 1])
 yield; }
 yield;
  // 耳：尖长、从长发里穿出，略外撇后倾，前侧内凹
  for (const s of [-1, 1]) {
    const base = EAR(s)
 yield;
    const dir = V(-0.18, 1, s * 0.45).normalize()
 yield;
    const pts = [base.clone().addScaledVector(dir, -0.025 * HS), base.clone().addScaledVector(dir, 0.05 * HS).add(V(0.01, 0, 0)), base.clone().addScaledVector(dir, 0.125 * HS)]
 yield;
    const g = sweep(pts, (t, _d, cs, sn) => {
      const w = 0.058 * HS * (1 - t) ** 0.8 * cap(t, 0.04)
      const cup = cs < 0 ? 1 - 0.55 * gauss(sn, 0, 0.45) * sstep(0.05, 0.25, t) : 1
      return w * ell(cs, sn, 0.17 * cup + 0.02, 1)
    }, { radial: 10, seg: 9, shade: (t, _d, cs, sn) => (cs < 0 && Math.abs(sn) < 0.6 ? 0.62 : 0.86) + t * 0.08 })
 yield;
    mulColor(g, 1.0, 0.86, 0.84, (p) => (p.x > base.x ? 1 : 0))
 yield;
    add(g, () => [BI(s < 0 ? earL : earR), 1])
 yield;
  }
 yield;
  // 下颌（可开合）：又长又宽，下颌角外张；口底暗红；下牙参差
  const JX0 = -0.014
 yield;
  const jawTop = (x: number) => MOUTH_Y - 0.005 + 0.01 * sstep(0.03, -0.012, x)
 yield;
  const jawW = (x: number) => 0.064 - 0.018 * sstep(-0.01, 0.09, x) - 0.012 * sstep(0.09, 0.2, x) - 0.006 * sstep(0.2, 0.25, x) + 0.004 * gauss(x, -0.004, 0.012)
 yield;
  const jawD = (x: number) => 0.066 - 0.026 * sstep(-0.01, 0.08, x) + 0.014 * gauss(x, 0.215, 0.03)
 yield;
  {
    const J = HEAD0, x1 = tipX - 0.008
 yield;
    const NX = 22, NA = 20
 yield;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
 yield;
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, x = JX0 + (x1 - JX0) * u
 yield;
      const top = jawTop(x), w = jawW(x) * Math.sqrt(Math.max(0.0004, Math.min(1, (x - JX0) / 0.03, (x1 - x) / 0.016))), dD = jawD(x)
 yield;
      const hT = 0.006, yc = top - hT
 yield;
      for (let j = 0; j <= NA; j++) {
        const a = (j / NA) * Math.PI * 2 - Math.PI, c = Math.cos(a), s = Math.sin(a)
 if((j&63)===0)yield;
        const h = c >= 0 ? hT : dD, n = c >= 0 ? 4 : 2.3
 if((j&63)===0)yield;
        const r = 1 / ((Math.abs(c) / h) ** n + (Math.abs(s) / Math.max(0.002, w)) ** n) ** (1 / n)
 if((j&63)===0)yield;
        const p = V(x, yc + r * c, r * s)
 if((j&63)===0)yield;
        pos.push(p.x, p.y, p.z);
 if((j&63)===0)yield; uv.push(j / NA, u)
 if((j&63)===0)yield;
        const floor = c > 0.3 && x > 0.035 && Math.abs(r * s) < w * 0.75
 if((j&63)===0)yield;
        const sh = floor ? 1 : 0.84 + 0.1 * gauss(x, -0.004, 0.015) * Math.abs(s) - (c < -0.6 ? 0.08 : 0)
 if((j&63)===0)yield;
        col.push(floor ? 0.42 : sh, floor ? 0.15 : sh, floor ? 0.14 : sh)
 if((j&63)===0)yield;
      }
 yield;
    }
 yield;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b2 = a + NA + 1;
 yield; idx.push(a, a + 1, b2, b2, a + 1, b2 + 1)
 yield; }
 yield;
    const g = new THREE.BufferGeometry()
 yield;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
 yield; g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
 yield; g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
 yield;
    g.setIndex(idx);
 yield; g.computeVertexNormals()
 yield;
    const lo: THREE.BufferGeometry[] = [g]
 yield;
    const n = 13
 yield;
    for (const s of [-1, 1]) for (let i = 0; i < n; i++) {
      const f = Math.min(1, (i + (s > 0 ? 0.5 : 0) + (R() - 0.5) * 0.5) / n)
 yield;
      if (i > 1 && R() < 0.14) continue
 yield;
      const x = x1 - 0.008 - f * (x1 - MOUTH_X - 0.02)
 yield;
      const z = s * Math.max(0.005, jawW(x) * 0.86 - 0.006)
 yield;
      const fang = i === 0 ? 1 : 0
 yield;
      const len = (0.01 + R() * 0.02 + 0.016 * fang) * (1 - 0.3 * f) * (K === 'neutral' ? 0.75 : 1)
 yield;
      const tooth = new THREE.ConeGeometry(0.0044 + R() * 0.003 + 0.0016 * fang, len, 5, 1, true)
 yield;
      tooth.rotateZ((R() - 0.5) * 0.7).rotateX((R() - 0.5) * 0.55 - s * 0.1).translate(x, jawTop(x) - 0.002 + len / 2, z)
 yield;
      lo.push(tint(tooth, 1.13, 1.04, 0.82 - R() * 0.12))
 yield;
    }
 yield;
    for (const q of lo) { q.scale(HS, HS, HS).translate(J.x, J.y, J.z);
 yield; add(q, () => [BI(jaw), 1])
 yield; }
 yield;
  }
 yield;

  // ---------- 四肢 ----------
  const legs: HoundLeg[] = []
 yield;
  const pawMeshes: THREE.Mesh[] = []
 yield;
  const limbRad = Math.sqrt(TH) * 1.22
 yield;
  /** 指 / 趾：三节（关节鼓包）+ 钩爪；返回皮肤几何与爪几何（模型空间） */
  const digit = (root: THREE.Vector3, dir: THREE.Vector3, L: number, r: number, clawL: number, down: number) => {
    const d = dir.clone().normalize()
    const p1 = root.clone().addScaledVector(d, L * 0.42).add(V(0, 0.012, 0))
    const p2 = root.clone().addScaledVector(d, L * 0.75).add(V(0, 0.006, 0))
    const p3 = root.clone().addScaledVector(d, L); p3.y = r * 0.72 + down * 0
    const skinG = sweep([root.clone().addScaledVector(d, -0.01), p1, p2, p3], (t, _dd, cs, sn) => r * (1 - 0.35 * t) * (1 + 0.45 * gauss(t, 0.06, 0.06) + 0.28 * gauss(t, 0.45, 0.06) + 0.22 * gauss(t, 0.76, 0.05)) * cap(t, 0.07) * ell(cs, sn, 0.85, 1),
      { radial: 6, seg: 10, shade: (t) => 0.84 + 0.1 * gauss(t, 0.42, 0.06) + 0.1 * gauss(t, 0.74, 0.05) + 0.08 * gauss(t, 0.04, 0.05) })
    const c0 = p3.clone().addScaledVector(d, -0.004).add(V(0, 0.004, 0))
    const c1 = c0.clone().addScaledVector(d, clawL * 0.55).add(V(0, clawL * 0.1, 0))
    const c2 = c0.clone().addScaledVector(d, clawL * 0.95).add(V(0, -Math.min(c0.y - 0.001, clawL * 0.5), 0))
    const clawG = sweep([c0, c1, c2], (t, _dd, cs, sn) => r * 0.8 * (1 - t) ** 1.1 * ell(cs, sn, 1, 0.65) + 0.0008, { radial: 5, seg: 6, shade: (t) => 0.1 + t * 0.12 })
    mulColor(clawG, 1, 0.95, 0.9)
    return [skinG, clawG]
  }
 yield;
  const limb = (front: boolean, side: number) => {
    const s = side
    // 静止关节（模型空间）
    const HIP = front ? V(0.34 * LX, 0.665, s * 0.118 * TH) : V(-0.47 * LX, 0.69, s * 0.098 * TH)
    const KNEE = front ? V(0.24 * LX, 0.665 - 0.3 * LM, s * 0.158) : V(-0.47 * LX + 0.21 * LM, 0.69 - 0.29 * LM, s * 0.15)
    const ANK = front ? V(0.4 * LX + 0.02 * (LM - 1), 0.085, s * 0.155) : V(-0.47 * LX - 0.03 * LM, 0.17 * LM, s * 0.14)
    const PAW = front ? ANK.clone().add(V(0.13 * LM, -0.055, 0.004 * s)) : ANK.clone().add(V(0.115 * LM, 0.03 - ANK.y, 0))
    const hip = boneAt((front ? 'shoulder' : 'hip') + (s < 0 ? 'L' : 'R'), body, HIP)
    const knee = boneAt((front ? 'elbow' : 'knee') + (s < 0 ? 'L' : 'R'), hip, KNEE)
    const ankle = boneAt((front ? 'wrist' : 'ankle') + (s < 0 ? 'L' : 'R'), knee, ANK)
    const paw = boneAt((front ? 'hand' : 'foot') + (s < 0 ? 'L' : 'R'), ankle, PAW)
    // 半角辅助骨（2026-10-25 修膝窝瘪）：在膝 / 踵处各挂一根只转一半角度、随弯曲略放大的骨，关节带的顶点分一部分给它
    const kneeH = boneAt((front ? 'elbowH' : 'kneeH') + (s < 0 ? 'L' : 'R'), hip, KNEE)
    const ankleH = boneAt((front ? 'wristH' : 'ankleH') + (s < 0 ? 'L' : 'R'), knee, ANK)
    // 整条腿一根连续扫掠管（肩 / 髋 → 肘 / 膝 → 腕 / 踵 → 指根），按关节平面混合到 hip / knee / ankle 三根骨，关节处不再有接缝
    {
      const dir = (a: THREE.Vector3, b: THREE.Vector3) => b.clone().sub(a).normalize()
      const u1 = dir(HIP, KNEE), u2 = dir(KNEE, ANK), u3 = dir(ANK, PAW)
      const top = front ? HIP.clone().add(V(0.015, 0.06, -s * 0.025)) : HIP.clone().add(V(-0.03, 0.035, -s * 0.03))
      const mid1 = HIP.clone().lerp(KNEE, 0.5).add(front ? V(0.012, 0, 0) : V(0.02, 0, 0))
      const mid2 = KNEE.clone().lerp(ANK, 0.5).add(front ? V(-0.006, 0, 0) : V(-0.008, 0, 0))
      const pts = [top, HIP, mid1, KNEE.clone().addScaledVector(u1, -0.035), KNEE, KNEE.clone().addScaledVector(u2, 0.035), mid2,
        ANK.clone().addScaledVector(u2, -0.025), ANK, ANK.clone().addScaledVector(u3, 0.025), ANK.clone().lerp(PAW, 0.6), PAW.clone().addScaledVector(u3, 0.006)]
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
      const tOf = (q: THREE.Vector3) => { let bt = 0, bd = Infinity; for (let i = 0; i <= 300; i++) { const d = curve.getPointAt(i / 300).distanceToSquared(q); if (d < bd) { bd = d; bt = i / 300 } } return bt }
      const tH = tOf(HIP), tK = tOf(KNEE), tA = tOf(ANK)
      const lr = limbRad
      // 半径表：t → r（前肢：三角肌 / 肱二头肌 → 粗肘 → 前臂肌群渐细 → 腕骨突 → 宽扁手掌）
      const tab: [number, number][] = front
        ? [[0, 0.03], [tH * 0.6, 0.058], [tH + (tK - tH) * 0.25, 0.05], [tH + (tK - tH) * 0.7, 0.036], [tK, 0.038], [tK + (tA - tK) * 0.2, 0.036], [tK + (tA - tK) * 0.75, 0.023], [tA, 0.027], [tA + (1 - tA) * 0.5, 0.034], [1, 0.03]]
        : [[0, 0.035], [tH * 0.6, 0.066], [tH + (tK - tH) * 0.3, 0.064], [tH + (tK - tH) * 0.8, 0.046], [tK, 0.046], [tK + (tA - tK) * 0.25, 0.04], [tK + (tA - tK) * 0.8, 0.024], [tA, 0.029], [tA + (1 - tA) * 0.4, 0.023], [1, 0.022]]
      const rt = (t: number) => { for (let i = 1; i < tab.length; i++) if (t <= tab[i][0]) { const [t0, r0] = tab[i - 1], [t1, r1] = tab[i]; return r0 + (r1 - r0) * sstep(0, 1, (t - t0) / Math.max(1e-4, t1 - t0)) } return tab[tab.length - 1][1] }
      const back = V(-1, 0, 0), fwd = V(1, 0, 0), out = V(0, 0, s)
      const g = sweep(pts, (t, d, cs, sn) => {
        let r = rt(t) * lr
        const palm = sstep(tA + 0.01, tA + 0.06, t)
        r *= ell(cs, sn, 1 - 0.55 * palm * (front ? 1 : 0.4), 1) * (1 - 0.12 * (1 - palm))
        if (front) {
          r += 0.022 * lr * gauss(t, tK, 0.025) * Math.max(0, d.dot(back)) ** 2 // 鹰嘴（肘尖向后）
          r += 0.01 * lr * gauss(t, tK, 0.03) * Math.abs(d.dot(out)) // 肘两侧髁
          r += 0.01 * lr * gauss(t, tA, 0.02) * Math.abs(d.dot(out)) // 尺骨头 / 桡骨茎突
          r += 0.012 * lr * gauss(t, tH + (tK - tH) * 0.35, 0.08) * Math.max(0, d.dot(fwd)) // 肱二头肌
          r += 0.004 * Math.max(0, Math.cos(sn * 10)) * palm * Math.max(0, -cs) // 掌骨棱（手背）
        } else {
          r += 0.024 * lr * gauss(t, tK, 0.025) * Math.max(0, d.dot(fwd)) ** 2 // 髌骨前凸
          r += 0.012 * lr * gauss(t, tK, 0.03) * Math.abs(d.dot(out))
          r += 0.016 * lr * gauss(t, tK + (tA - tK) * 0.28, 0.06) * Math.max(0, d.dot(back)) // 小腿肚
          r += 0.026 * lr * gauss(t, tA, 0.022) * Math.max(0, d.dot(back)) ** 2 // 脚跟骨突向后
          r += 0.008 * lr * gauss(t, tA, 0.025) * Math.abs(d.dot(out)) // 踝两侧
          r += 0.018 * lr * gauss(t, tH + (tK - tH) * 0.3, 0.1) * Math.max(0, d.dot(back)) // 腘绳肌
        }
        return r * cap(t, 0.03)
      }, {
        radial: 12, seg: 40, vRep: 2.4,
        shade: (t, d) => 0.8 + 0.16 * (gauss(t, tK, 0.03) + gauss(t, tA, 0.025)) + 0.05 * Math.max(0, d.y) - 0.06 * gauss(t, tK + 0.04, 0.02) - 0.06 * gauss(t, tK - 0.04, 0.02),
      })
      // 关节平面混合权重
      const nK = u1.clone().add(u2).normalize(), nA = u2.clone().add(u3).normalize()
      const bh = 0.04
      add(g, (p) => {
        const dk = p.clone().sub(KNEE).dot(nK), da = p.clone().sub(ANK).dot(nA)
        const wk = sstep(-bh * 1.3, bh * 1.3, dk), wa = sstep(-bh, bh, da)
        const hk = 1 - Math.abs(2 * wk - 1), ha = 1 - Math.abs(2 * wa - 1)
        if (wa < 1e-4) return [BI(hip), (1 - wk) * (1 - hk), BI(kneeH), hk, BI(knee), wk * (1 - hk)]
        return [BI(knee), (1 - wa) * (1 - ha), BI(ankleH), ha, BI(ankle), wa * (1 - ha)]
      })
    }
    // 指 / 趾（刚性网格，挂在 paw 关节下；几何在 paw 局部）
    const dg: THREE.BufferGeometry[] = []
    const nD = front ? 4 : 4
    const spanZ = front ? 0.052 : 0.046
    for (let i = 0; i < nD; i++) {
      const u = (i / (nD - 1)) * 2 - 1 // -1..1 跨掌宽
      const z = u * spanZ / 2 * limbRad
      const root = PAW.clone().add(V(-0.008 + (1 - Math.abs(u)) * 0.006, 0.0, z))
      const dir = V(1, -0.05, u * (front ? 0.32 : 0.26))
      const L = (front ? 0.112 : 0.088) * LM * (1 - Math.abs(u) * 0.14 + (i === 1 || i === 2 ? 0.04 : 0))
      dg.push(...digit(root, dir, L, (front ? 0.0105 : 0.0115) * limbRad, (front ? 0.04 : 0.032) * SH.claw, root.y - 0.004))
    }
    // 拇指 / 内侧趾（短、偏内）
    {
      const root = front ? ANK.clone().lerp(PAW, 0.45).add(V(0, -0.006, -s * 0.034)) : PAW.clone().add(V(-0.03, 0.004, -s * 0.03))
      dg.push(...digit(root, V(0.7, -0.15, -s * 0.7), front ? 0.07 * LM : 0.045, front ? 0.0105 : 0.009, (front ? 0.032 : 0.022) * SH.claw, root.y - 0.006))
    }
    const pg = merge(dg.map((g) => cleanAttrs(g)))
    pg.translate(-PAW.x, -PAW.y, -PAW.z)
    const pm = new THREE.Mesh(pg, skinM); pm.name = 'paw'; paw.add(pm); pawMeshes.push(pm)
    pg.computeBoundingBox()
    const sole = pg.boundingBox!.clone()
    // IK 用的静止数据（body 骨局部 / 模型空间）
    const ang = (a: THREE.Vector3, b: THREE.Vector3) => Math.atan2(b.y - a.y, b.x - a.x)
    const ah = ANK.clone().sub(HIP), kh = KNEE.clone().sub(HIP)
    legs.push({
      hip, knee, ankle, paw, kneeH, ankleH, front, side: s, sole,
      l1: Math.hypot(KNEE.x - HIP.x, KNEE.y - HIP.y), l2: Math.hypot(ANK.x - KNEE.x, ANK.y - KNEE.y), l3: Math.hypot(PAW.x - ANK.x, PAW.y - ANK.y),
      a1: ang(HIP, KNEE), a2: ang(KNEE, ANK), a3: ang(ANK, PAW), bend: Math.sign(ah.x * kh.y - ah.y * kh.x) || 1,
      hx: HIP.x, hy: HIP.y - bodyY, restX: PAW.x, pawY: PAW.y, phi: ang(ANK, PAW),
    })
  }
 yield;
  limb(true, -1);
 yield; limb(true, 1);
 yield; limb(false, -1);
 yield; limb(false, 1)
 yield;
  const nSkinBones = bones.length
 yield;

  // ---------- 皮肤 SkinnedMesh ----------
  grp.updateMatrixWorld(true)
 yield;
  const skinGeoAll = merge(skinParts)
 yield;
  const skinMesh = new THREE.SkinnedMesh(skinGeoAll, skinM);
 yield; skinMesh.name = 'houndSkin'
 yield;
  grp.add(skinMesh)
 yield;
  // ---------- 眼：空白发亮（中立：柔和、带浅灰瞳） ----------
  {
    const eg: THREE.BufferGeometry[] = []
 yield;
    for (const s of [-1, 1]) {
      const q = EYE(s)
 yield;
      const g = new THREE.SphereGeometry(0.021, 10, 8).scale(0.75, K === 'neutral' ? 0.78 : 1, 1).scale(0.56, 0.56, 0.56)
 yield;
      const pa = g.attributes.position as THREE.BufferAttribute, col: number[] = []
 yield;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i) / 0.01176 / 0.75, zz = pa.getZ(i) / 0.01176
 if((i&255)===0)yield;
        const pupil = K === 'neutral' ? gauss(Math.hypot(pa.getY(i) / 0.01176, zz - s * 0.15), 0, 0.28) * sstep(0.5, 0.95, x) : 0
 if((i&255)===0)yield;
        const c = 1 - pupil * 0.55
 if((i&255)===0)yield;
        col.push(c, c * 0.98, c * 0.94)
 if((i&255)===0)yield;
      }
 yield;
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
 yield;
      g.rotateY(-s * 0.7).translate(q.x, q.y, q.z)
 yield;
      eg.push(g)
 yield;
    }
 yield;
    const eyes = new THREE.Mesh(merge(eg).scale(HS, HS, HS), eyeM);
 yield; eyes.name = 'eyes';
 yield; eyes.userData.face = 1;
 yield; head.add(eyes)
 yield;
  }
 yield;
  // ---------- 口水丝：挂在下颌前端 ----------
  {
    const dg: THREE.BufferGeometry[] = []
 yield;
    const strands = K === 'neutral' ? 1 : 3
 yield;
    for (let i = 0; i < strands; i++) {
      const z = (i - (strands - 1) / 2) * 0.026 + (R() - 0.5) * 0.008
 yield;
      const tx0 = tipX - 0.03 - Math.abs(z) * 0.6, top = V(tx0, jawTop(tx0) - jawD(tx0) * 0.75, z)
 yield;
      const L = 0.05 + R() * 0.09
 yield;
      const pts = [top, top.clone().add(V(0.004, -L * 0.45, z * 0.15)), top.clone().add(V(-0.002, -L, z * 0.2))]
 yield;
      dg.push(sweep(pts, (t) => 0.0016 * (1 - 0.5 * t) + 0.0034 * gauss(t, 1, 0.06), { radial: 5, seg: 8 }))
 yield;
    }
 yield;
    const dm = new THREE.Mesh(merge(dg), droolM)
 yield;
    dm.geometry.scale(HS, HS, HS).translate(HEAD0.x - JAW0.x, HEAD0.y - JAW0.y, HEAD0.z - JAW0.z)
 yield; // 头部局部 → 下颌局部
    dm.name = 'drool';
 yield; dm.renderOrder = 2;
 yield; jaw.add(dm)
 yield;
  }
 yield;

  // ---------- 毛发 SkinnedMesh：头发缕 / 肩颈背长毛 / 毛尾（骨链） ----------
  const hairBones: THREE.Bone[] = [body, neck, head]
 yield;
  const HB = (b: THREE.Bone) => { let i = hairBones.indexOf(b); if (i < 0) { hairBones.push(b); i = hairBones.length - 1 } return i }
 yield;
  const hairParts: THREE.BufferGeometry[] = []
 yield;
  const hairLocks: HoundLock[] = [], maneLocks: HoundLock[] = []
 yield;
  const chain = (name: string, parent: THREE.Bone, pts: THREE.Vector3[]) => { // pts 模型空间；返回骨链
    const out: THREE.Bone[] = []; let p = parent
    pts.forEach((q, i) => { p = boneAt(`${name}_${i}`, p, q); out.push(p) })
    return out
  }
 yield;
  // 头部碰撞体（头部局部）：雕刻颅骨（按方向查半径）+ 下颌 + 颈
  const headClear = (q: THREE.Vector3, m: number) => {
    for (let it = 0; it < 3; it++) {
      const d = q.clone().sub(HC), L = d.length(); d.divideScalar(L || 1)
      const sp = skull(d).p.sub(HC).length()
      if (L < sp + m) q.copy(HC).addScaledVector(d, sp + m)
      pushEll(q, V(tipX * 0.5, MOUTH_Y - 0.032, 0), V(tipX * 0.55 + 0.02, 0.038, 0.066), m)
      pushCap(q, V(0, -0.01, 0), NECK0.clone().sub(HEAD0).divideScalar(HS), 0.07 * TH / HS + m)
    }
    return q
  }
 yield;
  // 发帽：贴颅顶的毛发壳（耳朵从中穿出）
  {
    const rows = 7, cols = 26
 yield;
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
 yield;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const th = (j / cols) * Math.PI * 2 - Math.PI
 yield;
      const f = gauss(th, 0, 0.7), b = sstep(1.8, 3.1, Math.abs(th))
 yield;
      const eMin = (0.42 * f + 0.05 * (1 - f) - 0.45 * b)
 yield;
      const e = Math.PI / 2 - (Math.PI / 2 - eMin) * (i / rows)
 yield;
      const d = V(Math.cos(e) * Math.cos(th), Math.sin(e), Math.cos(e) * Math.sin(th))
 yield;
      const p = skull(d).p.sub(HC).multiplyScalar(1.07).add(HC).add(V(-0.003, 0.004, 0)).multiplyScalar(HS).add(HEAD0)
 yield;
      pos.push(p.x, p.y, p.z);
 yield; uv.push(j / cols * 3, (i / rows) * 0.16);
 yield; const c = 0.75 + 0.2 * (i / rows);
 yield; col.push(c, c, c)
 yield;
    }
 yield;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b2 = a + cols + 1;
 yield; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1)
 yield; }
 yield;
    const g = new THREE.BufferGeometry()
 yield;
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
 yield; g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
 yield; g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
 yield;
    g.setIndex(idx);
 yield; g.computeVertexNormals()
 yield;
    hairParts.push(skinGeo(g, () => [HB(head), 1]))
 yield;
  }
 yield;
  // 头发缕：从颅顶沿头皮向外，到发际线后自然垂落；正前方垂到眼下 / 鼻梁，两侧长垂过下颌，后脑铺到颈背
  {
    const N = 34
 yield;
    const earAz = Math.atan2(0.45, 0.0)
 yield; // 耳朵大约在 ±~80° 方位
    for (let k = 0; k < N; k++) {
      let az = ((k + 0.5) / N) * Math.PI * 2 - Math.PI + (R() - 0.5) * 0.08
 yield;
      if (Math.abs(Math.abs(az) - earAz * 0.92) < 0.12) az += Math.sign(az) * 0.16
 yield; // 给耳朵让路
      const A = Math.abs(az)
 yield;
      const grp_: HoundLock['group'] = A < 0.8 ? 'face' : A < 2.1 ? 'side' : 'back'
 yield;
      const eDrop = A < 0.75 ? 0.36 - 0.1 * (A / 0.75) : A < 2.1 ? 0.1 : -0.12
 yield;
      const fall = (A < 0.3 ? 0.035 + R() * 0.05 : A < 0.8 ? 0.17 : A < 2.1 ? 0.27 : 0.15) * (0.82 + R() * 0.36)
 yield; // 正中只是一绺绺短刘海，两侧长发框住脸
      // 沿头皮：从颅顶（略后）到发际线
      const pts: THREE.Vector3[] = []
 yield;
      const e0 = 1.25
 yield;
      for (let i = 0; i <= 3; i++) {
        const e = e0 + (eDrop - e0) * (i / 3)
 yield;
        const d = V(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az))
 yield;
        pts.push(skull(d).p.sub(HC).multiplyScalar(1.09).add(HC))
 yield;
      }
 yield;
      // 自然下垂（带一点向外飘），推出颅骨 / 吻部 / 下颌 / 颈
      const last = pts[pts.length - 1].clone()
 yield;
      const out = V(Math.cos(az), 0, Math.sin(az))
 yield;
      const nF = 7
 yield;
      for (let i = 1; i <= nF; i++) {
        const t = i / nF
 yield;
        const q = last.clone().add(V(0, -fall * t, 0)).addScaledVector(out, 0.012 * t + (A < 0.3 ? 0.004 : A < 0.75 ? 0.018 : 0.01) * t * t)
 yield;
        if (A > 2.1) q.add(V(-0.05 * t * t, 0.03 * t * t, 0))
 yield; // 后脑：顺着颈背向后铺
        pts.push(headClear(q, 0.009))
 yield;
      }
 yield;
      // 平滑一遍，避免推挤造成折角
      for (let it = 0; it < 2; it++) for (let i = 4; i < pts.length - 1; i++) pts[i].lerp(pts[i - 1].clone().add(pts[i + 1]).multiplyScalar(0.5), 0.35), headClear(pts[i], 0.008)
 yield;
      const W = pts.map((p) => p.clone().multiplyScalar(HS).add(HEAD0))
 yield;
      const jIdx = [0, grp_ === 'face' ? 2 : 3, 3 + Math.round(nF * 0.4), 3 + Math.round(nF * 0.75)]
 yield; // 脸前发缕的第二节在额上，掀发时整段刘海一起撩起
      const bonesL = chain(`hair${k}`, head, jIdx.map((j) => W[j]))
 yield;
      const width = A < 0.8 ? 0.012 + R() * 0.009 : (0.032 + R() * 0.014) * (A < 2.1 ? 1.05 : 1.15)
 yield;
      const g = ribbon(W, (t) => width * (1 - 0.45 * t * t), (i) => W[i].clone().sub(HEAD0.clone().addScaledVector(HC, HS)).setY(0).normalize().add(V(0, 0.25, 0)).normalize(),
        R() * 0.6, R() * 0.6 + 0.4, jIdx, bonesL.map(HB), (t) => 0.72 + 0.28 * (1 - t) - 0.1 * R(), A < 0.8 ? 0.1 : 0, 1, 0.3)
 yield;
      hairParts.push(g)
 yield;
      hairLocks.push({ bones: bonesL, az, len: fall, group: grp_ })
 yield;
    }
 yield;
  }
 yield;
  // 躯干碰撞（模型空间）：按脊线最近点查截面半径；另加上臂 / 大腿 / 颈胶囊
  const bodyClearFrames=Array.from({length:41},(_,i)=>torsoFrame(i/40))
  yield;
  const bodyClear = (q: THREE.Vector3, m: number) => {
    for (let it = 0; it < 3; it++) {
      let best = 0, bd = Infinity
      for (let i = 0; i <= 40; i++) { const t = i / 40, d = bodyClearFrames[i].P.distanceToSquared(q); if (d < bd) { bd = d; best = t } }
      const { P, n1, n2, T } = bodyClearFrames[Math.round(best*40)]
      const rel = q.clone().sub(P), cs = rel.dot(n1), sn = rel.dot(n2), L = Math.hypot(cs, sn)
      if (L > 1e-6) { const r = torsoR(best, cs / L, sn / L); if (L < r + m) { const ax = rel.dot(T); q.copy(P).addScaledVector(n1, cs / L * (r + m)).addScaledVector(n2, sn / L * (r + m)).addScaledVector(T, ax) } }
      for (const L2 of legs) {
        const hp = (L2.hip.userData.world as THREE.Vector3), kp = (L2.knee.userData.world as THREE.Vector3), ap = (L2.ankle.userData.world as THREE.Vector3)
        pushCap(q, hp, kp, (L2.front ? 0.052 : 0.07) * limbRad + m)
        pushCap(q, kp, ap, 0.04 * limbRad + m)
      }
      pushCap(q, NECK0.clone().add(V(-0.05, -0.01, 0)), HEAD0, 0.066 * TH + m)
    }
    return q
  }
 yield;
  // 肩颈背长毛（2026-10-25 修：原来像一整片）：发根打乱、按几块斑秃空出来；长短悬殊、宽窄不一，
  // 每缕带随机扭转，约四成在中段分叉出一绺细毛往外飘；先贴着身体往侧下方铺，越过最宽处后乱糟糟地垂下
  {
    const bald: [number, number, number, number][] = []
 yield; // 斑秃块：t 中心、侧向角中心、t 半径、角半径
    for (let i = 0; i < 6; i++) bald.push([0.56 + R() * 0.36, (R() < 0.5 ? -1 : 1) * (0.25 + R() * 1.0), 0.025 + R() * 0.04, 0.25 + R() * 0.3])
 yield;
    const N = 46
 yield;
    for (const s of [-1, 1]) for (let k = 0; k < N; k++) {
      const t = 0.98 - (k / (N - 1)) * 0.46 + (R() - 0.5) * 0.03
 yield;
      const dense = sstep(0.5, 0.76, t)
 yield;
      const off = 0.08 + R() * 0.5 + 0.45 * (1 - dense)
 yield; // 离背中线的角度（稀疏处发根更靠侧面）
      if (R() > 0.3 + dense * 0.7) continue
 yield;
      if (bald.some(([bt, ba, rt, ra]) => ((t - bt) / rt) ** 2 + ((s * off - ba) / ra) ** 2 < 1)) continue
 yield; // 斑秃
      const a0 = Math.PI - s * off
 yield;
      const a1 = Math.PI / 2 * (s > 0 ? 1 : 3) + s * (0.05 + R() * 0.35)
 yield;
      const pts: THREE.Vector3[] = []
 yield;
      const nS = 3
 yield;
      for (let i = 0; i <= nS; i++) { const f = i / nS; pts.push(torsoPt(Math.max(0.02, t - f * (0.03 + R() * 0.04)), a0 + (a1 - a0) * f, 0.012 + R() * 0.006)) }
 yield;
      const longK = R()
 yield;
      const hang = (0.03 + 0.24 * dense) * (0.35 + longK * longK * 1.25)
 yield; // 长短悬殊
      const last = pts[nS].clone(), out = V(0, 0, s)
 yield;
      const drift = -(0.03 + 0.14 * sstep(0.72, 0.98, t)) + (R() - 0.5) * 0.1, flare = 0.004 + R() * 0.03
 yield;
      const nF = 6
 yield;
      for (let i = 1; i <= nF; i++) {
        const f = i / nF
        pts.push(bodyClear(last.clone().add(V(drift * f + Math.sin(f * 4 + k) * 0.008, -hang * f, 0)).addScaledVector(out, flare * f * f), 0.012))
      }
 yield;
      for (let it = 0; it < 2; it++) for (let i = nS; i < pts.length - 1; i++) pts[i].lerp(pts[i - 1].clone().add(pts[i + 1]).multiplyScalar(0.5), 0.3), bodyClear(pts[i], 0.011)
 yield;
      const jIdx = [0, nS, nS + Math.round(nF * 0.5)]
 yield;
      const parent = t > 0.93 ? neck : body
 yield;
      const bonesL = chain(`mane${s < 0 ? 'L' : 'R'}${k}`, parent, jIdx.map((j) => pts[j]))
 yield;
      const width = 0.014 + R() * 0.026
 yield;
      const tC = t, tone = 0.72 + R() * 0.36
 yield;
      const baseF = (i: number) => { const fr = torsoFrame(Math.max(0.02, tC - 0.03)); const o = pts[i].clone().sub(fr.P); o.x = 0; return o.normalize() }
 yield;
      const twist = (R() - 0.5) * 2.4
 yield;
      hairParts.push(ribbon(pts, (u) => width * (0.3 + 0.7 * sstep(0, 0.2, u)) * (1 - 0.45 * u * u), twisted(pts, baseF, twist),
        R() * 0.7, R() * 0.7 + 0.3, jIdx, bonesL.map(HB), (u) => tone * (0.7 + 0.3 * (1 - u)), 0, 1, 0.12, 3))
 yield;
      if (R() < 0.4 && hang > 0.06) { // 分叉：从中段岔出一绺细毛往外、往后飘
        const fi = nS + 2, fp = pts.map((q, i) => i <= fi ? q.clone() : q.clone().add(V(-0.012 * (i - fi), 0.004 * (i - fi), s * 0.011 * (i - fi))))
        hairParts.push(ribbon(fp, (u) => width * 0.5 * (1 - 0.5 * u), twisted(fp, baseF, -twist * 0.7), R() * 0.6, R() * 0.6 + 0.3, jIdx, bonesL.map(HB),
          (u) => tone * 0.9 * (0.7 + 0.3 * (1 - u)), 0.25, 1, 0, 2))
      }
 yield;
      maneLocks.push({ bones: bonesL, az: s, len: hang, group: 'mane' })
 yield;
    }
 yield;
    // 颈鬃：颈背到肩，两侧垂下（长短、扭转随机）
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
      const f0 = 0.12 + k * 0.145 + (R() - 0.5) * 0.04
 yield;
      const c = NECK0.clone().lerp(HEAD0, f0)
 yield;
      const r = 0.06 * TH
 yield;
      const pts: THREE.Vector3[] = []
 yield;
      const a0 = 0.12 + R() * 0.25
 yield;
      for (let i = 0; i <= 3; i++) { const a = a0 + i * 0.38; pts.push(c.clone().add(V(-0.01 * i, Math.cos(a) * (r + 0.012), s * Math.sin(a) * (r + 0.012)))) }
 yield;
      const hang = 0.06 + R() * R() * 0.22, last = pts[3].clone()
 yield;
      for (let i = 1; i <= 5; i++) pts.push(bodyClear(last.clone().add(V(-0.03 * i / 5 + (R() - 0.5) * 0.01, -hang * i / 5, s * 0.014 * i / 5)), 0.012))
 yield;
      const jIdx = [0, 3, 5]
 yield;
      const bonesL = chain(`neck${s < 0 ? 'L' : 'R'}${k}`, neck, jIdx.map((j) => pts[j]))
 yield;
      const width = 0.026 + R() * 0.024
 yield;
      const baseF = (i: number) => pts[i].clone().sub(NECK0.clone().lerp(HEAD0, f0)).setX(0).normalize()
 yield;
      hairParts.push(ribbon(pts, (u) => width * (1 - 0.45 * u * u), twisted(pts, baseF, (R() - 0.5) * 2), R() * 0.5, R() * 0.5 + 0.5, jIdx, bonesL.map(HB), (u) => (0.66 + R() * 0.1) + 0.3 * (1 - u), 0, 1, 0.22))
 yield;
      maneLocks.push({ bones: bonesL, az: s, len: hang, group: 'neck' })
 yield;
    }
 yield;
    // 背上一片贴身的短毛壳（肩到背中段）
    {
      const rows = 14, cols = 8
 yield;
      const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = []
 yield;
      for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
        const t = 0.54 + 0.43 * (i / rows), a = Math.PI + ((j / cols) * 2 - 1) * (0.06 + 0.5 * sstep(0.54, 0.68, t) + 0.34 * sstep(0.68, 0.85, t))
 yield;
        const p = torsoPt(t, a, 0.017)
 yield;
        pos.push(p.x, p.y, p.z);
 yield; uv.push(i / rows * 2, Math.abs(j / cols * 2 - 1) * 0.9);
 yield; const c = 0.8 - 0.15 * Math.abs(j / cols * 2 - 1);
 yield; col.push(c, c, c)
 yield;
      }
 yield;
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) { const a = i * (cols + 1) + j, b2 = a + cols + 1;
 yield; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1)
 yield; }
 yield;
      const g = new THREE.BufferGeometry()
 yield;
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
 yield; g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
 yield; g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
 yield;
      g.setIndex(idx);
 yield; g.computeVertexNormals()
 yield;
      hairParts.push(skinGeo(g, (p) => { const f = sstep(0.42 * LX, 0.5 * LX, p.x); return [HB(body), 1 - f * 0.5, HB(neck), f * 0.5] }))
 yield;
    }
 yield;
  }
 yield;
  // 毛尾（2026-10-25 修：原来像一整片）：一根有体积的毛芯（不透明发束管）+ 一圈长短不一、错层覆盖的外层发片（每片随机扭转、向外翻）
  // + 尾尖散开的一簇长毛；从臀后长出，弧形垂下，后半段贴地拖行；尾链 8 节
  const tailPts = [V(-0.63, 0.72, 0), V(-0.82, 0.645, 0), V(-1.01, 0.5, 0), V(-1.15, 0.35, 0), V(-1.3, 0.21, 0), V(-1.47, 0.12, 0), V(-1.66, 0.085, 0), V(-1.86, 0.075, 0), V(-2.02, 0.07, 0)]
    .map((p) => V(-0.68 * LX + (p.x + 0.68) * (0.92 + 0.08 * LX), p.y, 0))
 yield;
  const tailChain = chain('tail', body, tailPts.slice(0, 8))
 yield;
  {
    const tc = new THREE.CatmullRomCurve3(tailPts, false, 'centripetal')
 yield;
    const jointT = tailPts.slice(0, 8).map((p) => { let bt = 0, bd = Infinity; for (let i = 0; i <= 200; i++) { const d = tc.getPointAt(i / 200).distanceToSquared(p); if (d < bd) { bd = d; bt = i / 200 } } return bt })
 yield;
    const tB = tailChain.map(HB)
 yield;
    /** 尾曲线参数 → [骨 0, 骨 1, 权重] */
    const tw = (t: number): [number, number, number] => {
      for (let j = 0; j < jointT.length - 1; j++) if (t < jointT[j + 1]) return [tB[j], tB[j + 1], Math.max(0, (t - jointT[j]) / (jointT[j + 1] - jointT[j]))]
      return [tB[tB.length - 1], tB[tB.length - 1], 0]
    }
 yield;
    const thin = K === 'ambusher' ? 0.85 : 1
 yield;
    const tailR = (t: number) => (0.032 + 0.1 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) ** 0.7 * (1 - 0.5 * sstep(0.6, 1, t))) * thin
 yield;
    const frame = (t: number) => {
      const tt = Math.min(1, Math.max(0, t)), P = tc.getPointAt(tt), T = tc.getTangentAt(tt)
      if (t > 1) P.addScaledVector(T, (t - 1) * tc.getLength())
      const n1 = new THREE.Vector3().crossVectors(T, V(0, 0, 1)).normalize(), n2 = new THREE.Vector3().crossVectors(n1, T).normalize()
      return { P, T, n1, n2, flat: sstep(0.55, 0.8, tt) }
    }
 yield;
    const around = (t: number, psi: number, rr: number) => { // 截面上 psi 方向、半径 rr 的点（贴地段压扁）
      const f = frame(t), dir = f.n1.clone().multiplyScalar(Math.cos(psi)).addScaledVector(f.n2, Math.sin(psi))
      const q = f.P.clone().add(V(dir.x * rr, dir.y * rr * (1 - 0.55 * f.flat), dir.z * rr * (1 + 0.4 * f.flat)))
      q.y = Math.max(0.008, q.y)
      return { q, dir }
    }
 yield;
    // 毛芯：不透明的发束管（贴图只取发根到中段，没有镂空）
    {
      const NP = 26, NR = 12, pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [], si: number[] = [], sw: number[] = []
 yield;
      for (let i = 0; i <= NP; i++) {
        const t = 0.01 + 0.95 * (i / NP), w = tw(t)
 yield;
        for (let j = 0; j <= NR; j++) {
          const psi = (j / NR) * Math.PI * 2, { q } = around(t, psi, tailR(t) * 0.55 * cap(i / NP, 0.06))
 if((j&63)===0)yield;
          pos.push(q.x, q.y, q.z);
 if((j&63)===0)yield; uv.push(j / NR * 3, 0.04 + 0.62 * (i / NP))
 if((j&63)===0)yield;
          const c = 0.5 + 0.12 * Math.sin(psi * 3 + i);
 if((j&63)===0)yield; col.push(c, c, c)
 if((j&63)===0)yield;
          si.push(w[0], w[1], 0, 0);
 if((j&63)===0)yield; sw.push(1 - w[2], w[2], 0, 0)
 if((j&63)===0)yield;
        }
 yield;
      }
 yield;
      for (let i = 0; i < NP; i++) for (let j = 0; j < NR; j++) { const a = i * (NR + 1) + j, b2 = a + NR + 1;
 yield; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1)
 yield; }
 yield;
      const g = new THREE.BufferGeometry()
 yield;
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
 yield; g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
 yield; g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
 yield;
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
 yield; g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
 yield;
      g.setIndex(idx);
 yield; g.computeVertexNormals()
 yield;
      hairParts.push(g)
 yield;
    }
 yield;
    // 外层发片：错层覆盖，每片从尾上某处长出、向外后方翻开，长短 / 宽窄 / 扭转都随机
    const strand = (t0: number, t1: number, psi: number, r0: number, r1: number, wid: number, twist: number, tone: number, n: number, spread = 0) => {
      const path: THREE.Vector3[] = [], fac: THREE.Vector3[] = [], wts: [number, number, number][] = []
      const wob = (R() - 0.5) * 0.5
      for (let i = 0; i <= n; i++) {
        const f = i / n, t = t0 + (t1 - t0) * f
        const ps = psi + wob * f + spread * f * f
        const { q, dir } = around(t, ps, tailR(Math.min(1, t)) * (r0 + (r1 - r0) * f))
        path.push(q); fac.push(dir); wts.push(tw(Math.min(1, t)))
      }
      hairParts.push(ribbonW(path, (u) => wid * (0.35 + 0.65 * Math.sin(Math.min(1, u * 2.2) * Math.PI / 2)) * (1 - 0.55 * sstep(0.6, 1, u)), twisted(path, (i) => fac[i], twist),
        R() * 0.5, R() * 0.5 + 0.5, wts, (u) => tone + 0.14 * Math.sin(u * 7 + psi), 0.02, 0.99, 0.2, 3))
    }
 yield;
    // 几条贯通的长发片保证轮廓连续
    for (let r = 0; r < 7; r++) strand(0.015, 1.0, (r / 7) * Math.PI * 2 + R() * 0.3, 0.75, 0.9, 0.075, (R() - 0.5) * 1.2, 0.72, 16)
 yield;
    // 错层的短发片
    for (let r = 0; r < 34; r++) {
      const t0 = R() * 0.8, len = 0.18 + R() * 0.32
 yield;
      strand(t0, Math.min(1.04, t0 + len), R() * Math.PI * 2, 0.6 + R() * 0.3, 1.25 + R() * 0.8, 0.04 + R() * 0.045, (R() - 0.5) * 2.6, 0.58 + R() * 0.45, 6, (R() - 0.5) * 0.6)
 yield;
    }
 yield;
    // 尾尖散开：一簇长毛从尾后段伸出尾端，向两侧 / 上下散成扇形
    for (let r = 0; r < 12; r++) {
      const psi = (r / 12) * Math.PI * 2 + (R() - 0.5) * 0.4
 yield;
      strand(0.7 + R() * 0.14, 1.06 + R() * 0.14, psi, 0.5, 2.0 + R() * 2.2, 0.035 + R() * 0.03, (R() - 0.5) * 2.4, 0.6 + R() * 0.4, 7, (R() - 0.5) * 1.2)
 yield;
    }
 yield;
  }
 yield;

  grp.updateMatrixWorld(true)
 yield;
  const hairGeo = merge(hairParts)
 yield;
  const hairMesh = new THREE.SkinnedMesh(hairGeo, hairM);
 yield; hairMesh.name = 'houndHair'
 yield;
  grp.add(hairMesh)
 yield;
  // 绑定（attached：网格自身变换被抵消，完全由骨骼决定）
  skinMesh.bind(new THREE.Skeleton(bones.slice(0, nSkinBones)), skinMesh.matrixWorld)
 yield;
  hairMesh.bind(new THREE.Skeleton(hairBones.slice()), hairMesh.matrixWorld)
 yield;
  for (const m of [skinMesh, hairMesh]) { // 包围球放宽：动作幅度内都不会被错误剔除
    m.geometry.computeBoundingSphere()
 yield;
    const bs = m.geometry.boundingSphere!.clone();
 yield; bs.radius *= 1.35
    ;
 yield;(m as THREE.SkinnedMesh).boundingSphere = bs
 yield;
    m.geometry.boundingSphere = bs.clone()
 yield;
  }
 yield;
  // 静止姿态记录（动画以此为零位）
  for (const b of bones) b.userData.rest = b.position.clone()
 yield;
  const rig: HoundRig = { body, neck, head, jaw, tail: tailChain[0], tailChain, legs, earL, earR, hair: hairLocks, mane: maneLocks, kind: K, shape: SH, bodyY }
 yield;
  grp.userData.houndRig = rig
 yield;
  grp.userData.houndNeutral = K === 'neutral'
 yield;
  grp.userData.houndKind = K
 yield;
  grp.userData.earL = earL;
 yield; grp.userData.earR = earR;
 yield; grp.userData.jaw = jaw
 yield;
  void pawMeshes
 yield;
  complete=true;
 yield;return grp

 }finally{if(!complete)disposeL8Tree(grp)}
 yield;
}

/** 渲染层用：实体当前应显示的形态（中立优先；L3 / 明确的 ambusher 为高智能形态） */
export function houndMeshKind(e: Entity, level: number): HoundKind {
  const neutral = e.hd?.neutral ?? ((e.def.houndKind ? e.def.houndKind === 'neutral' : level === 11) && !e.provoked && e.hp >= e.def.hp)
  if (neutral) return 'neutral'
  return e.def.houndKind === 'ambusher' || (!e.def.houndKind && level === 3) ? 'ambusher' : 'hostile'
}

/** 头发分开（掀发）：0 = 自然盖脸，1 = 脸前与两侧的发缕向两边、向后撩开。阶段 2 的甩头 / 嚎叫可直接复用 */
export function houndHairPart(grp: THREE.Object3D, k: number) {
  const r = grp.userData.houndRig as HoundRig | undefined
  if (!r) return
  for (const L of r.hair) {
    if (L.group === 'back') continue
    const s = L.az >= 0 ? 1 : -1
    if (L.group === 'face') { // 脸前的发缕从发际线处向上、向后撩过头顶
      L.bones[1].rotation.set(-s * 0.2 * k, 0, -2.1 * k)
      L.bones[2]?.rotation.set(0, 0, 1.85 * k)
      L.bones[3]?.rotation.set(0, 0, 1.1 * k)
    } else { // 两侧的发缕向后拢到耳后
      L.bones[1].rotation.set(-s * 0.25 * k, 0, -0.95 * k)
      L.bones[2]?.rotation.set(0, 0, -0.3 * k)
    }
  }
}

/** 半角辅助骨跟随膝 / 踵：转一半角度，弯得越多放得越大，抵消线性蒙皮的内侧塌陷 */
export function syncHalf(L: HoundLeg) {
  if (L.kneeH) { const a = L.knee.rotation.z; L.kneeH.rotation.z = a * 0.5; L.kneeH.scale.setScalar(1 + 0.14 * Math.min(1.6, Math.abs(a))) }
  if (L.ankleH) { const a = L.ankle.rotation.z; L.ankleH.rotation.z = a * 0.5; L.ankleH.scale.setScalar(1 + 0.1 * Math.min(1.6, Math.abs(a))) }
}
const _hip = { x: 0, y: 0 }
/** 平面三段 IK：掌 / 跖段保持世界角 phi，paw 关节落在 (tx,ty)；返回是否够得着 */
export function solveLeg(L: HoundLeg, bx: number, by: number, th: number, tx: number, ty: number, phi: number) {
  const c = Math.cos(th), s = Math.sin(th)
  _hip.x = bx + c * L.hx - s * L.hy; _hip.y = by + s * L.hx + c * L.hy
  let ax = tx - L.l3 * Math.cos(phi), ay = ty - L.l3 * Math.sin(phi)
  let dx = ax - _hip.x, dy = ay - _hip.y
  let reach = Math.hypot(dx, dy)
  const maxR = L.l1 + L.l2 - 0.002, minR = Math.abs(L.l1 - L.l2) + 0.01
  let ok = true
  if (reach > maxR) { // 够不着：脚 / 手掌更立起来再试一次，仍不够就伸直
    ok = false
    const phi2 = Math.max(-1.45, phi - 0.6)
    ax = tx - L.l3 * Math.cos(phi2); ay = ty - L.l3 * Math.sin(phi2)
    dx = ax - _hip.x; dy = ay - _hip.y; reach = Math.hypot(dx, dy)
    if (reach <= maxR) { phi = phi2; ok = true }
    else if (Math.abs(dy) < maxR - 0.004) { phi = phi2; dx = Math.sign(dx || 1) * Math.sqrt(maxR * maxR - dy * dy); reach = maxR } // 仍够不着：脚沿地面往身下收（不悬空）
    else { dx *= maxR / reach; dy *= maxR / reach; reach = maxR }
  }
  reach = Math.max(minR, reach)
  const spread = Math.acos(Math.max(-1, Math.min(1, (L.l1 * L.l1 + reach * reach - L.l2 * L.l2) / (2 * L.l1 * reach))))
  const axis = Math.atan2(dy, dx), up = axis + L.bend * spread
  const kx = _hip.x + Math.cos(up) * L.l1, ky = _hip.y + Math.sin(up) * L.l1
  const lo = Math.atan2(_hip.y + dy - ky, _hip.x + dx - kx)
  L.hip.rotation.z = up - L.a1 - th
  L.knee.rotation.z = lo - L.a2 - (up - L.a1)
  L.ankle.rotation.z = phi - L.a3 - (lo - L.a2)
  L.paw.rotation.z = L.a3 - phi // 指 / 趾段静止为水平：抵消上游累计角，平贴地面
  syncHalf(L)
  return ok
}

/** 游戏入口 animateHound(grp, e, time, gz)：阶段 2 起由 houndAnim.ts 按 e.hd 的 phase / 姿态量映射到动作片段并混合（接口不变） */
export { animateHound } from './houndAnim'

// v63：钝人等后续重制模型复用的扫掠/壳体/程序化贴图工具
export { rng, merge, V, gauss, sstep, cap, ell, sweep, limbSeg, shell, canvasTex }
export type { RF }
