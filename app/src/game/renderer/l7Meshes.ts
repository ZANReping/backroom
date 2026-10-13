// v66：Level 7 水中装饰物（全部无碰撞；每件一个合并网格 / 一个实例化网格 / 一组点精灵，单次绘制）。
//
// 设定依据（backrooms-wiki-cn Level 7 与 Fandom zh Level 7）：
//   暮色带：零散骨片与生锈废铁漂浮；完整的类人骸骨——下颚巨大、牙齿长而锋利、腿部末端呈鳍肢；
//           带撕咬/抓挠痕迹的巨大鱼类骸骨。
//   午夜带：更多完整类人骸骨；巨大到不可思议、结构「难以理解」的鱼类骨架；人造纤维碎屑（海床铺有地毯）。
//   深渊带：堆积成山的岩石与焦油，深处某个源头持续产生稳定气泡；骨骸被水压侵蚀。
//   岛屿：「臣服堡垒」——家具堆叠、焦油加固的简易庇护所（本作为已废弃版本）。
//   Fandom：书架上没有书，只有书皮包着的实心无特征纸块（漂在近水面）。
import * as THREE from 'three'
import type { Structure } from '../core/types'
import { floorHeight, type GameMap } from '../world/mapgen'
import { getMaterialMode, litMaterial } from './shared'
import { sweep, merge, V, rng } from './houndMesh'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { waterUniforms } from './water'

type G = THREE.BufferGeometry

/** 给几何体写入统一顶点色（保留 sweep 的明暗 AO 作为乘数）。 */
function tint(g: G, hex: string, k = 1): G {
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const old = g.attributes.color as THREE.BufferAttribute | undefined
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const s = (old ? old.getX(i) : 1) * k
    arr[i * 3] = c.r * s; arr[i * 3 + 1] = c.g * s; arr[i * 3 + 2] = c.b * s
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
  return g
}
const prim = (g: G, hex: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, k = 1) => {
  g.rotateX(rx); g.rotateY(ry); g.rotateZ(rz); g.translate(x, y, z)
  return tint(g.index ? g.toNonIndexed() : g, hex, k)
}
/** 骨管：沿控制点扫掠，两端略膨大（骨骺），截面略扁。 */
function bone(pts: THREE.Vector3[], r: number, hex: string, seg = 6, radial = 6): G {
  const g = sweep(pts, (t, _d, cs) => r * (1 + 0.45 * Math.pow(Math.abs(t * 2 - 1), 6)) * (0.85 + 0.15 * Math.abs(cs)), { seg, radial })
  return tint(g, hex)
}

type L7Mats = { bone: THREE.Material; tar: THREE.Material; carpet: THREE.Material; wood: THREE.Material }
const matsCache = new Map<string, L7Mats>()
function mats() {
  const mode = getMaterialMode(), hit = matsCache.get(mode)
  if (hit) return hit
  const value = {
    bone: litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.82, envBase: 0.25, emissive: '#2a2c28', emissiveIntensity: 0.25 }),
    tar: litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.22, metalness: 0.05, envBase: 0.85 }),
    carpet: litMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, envBase: 0.05, side: THREE.DoubleSide }),
    wood: litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9, envBase: 0.12 }),
  }
  matsCache.set(mode, value)
  return value
}

// ---------------- 类人骨架（巨颚、长牙、鳍足） ----------------
const skeletonCache = new Map<number, G>()
function skeletonGeo(variant: number, eroded: boolean): G {
  const key = variant * 2 + (eroded ? 1 : 0)
  const hit = skeletonCache.get(key)
  if (hit) return hit
  const r = rng(91 + key * 13)
  const col = eroded ? '#9d988a' : '#cdc6b2', dark = '#2a2620'
  const parts: G[] = []
  // 躺姿：沿 +z 为头向；整体贴地（y≈0.08）；变体决定蜷曲/侧卧
  const curl = variant === 1 ? 0.35 : variant === 2 ? -0.25 : 0.08
  // 脊柱（17 节椎骨合成一根带结节的扫掠管）
  const spine: THREE.Vector3[] = []
  for (let i = 0; i <= 6; i++) { const t = i / 6; spine.push(V(Math.sin(t * Math.PI) * curl, 0.09 + Math.sin(t * 3.1) * 0.02, -0.55 + t * 1.15)) }
  parts.push(tint(sweep(spine, (t) => 0.035 * (1 + 0.35 * Math.max(0, Math.sin(t * 17 * Math.PI))), { seg: 34, radial: 6 }), col))
  // 肋笼：每侧 7 根弯肋（侵蚀体缺若干根）
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    if (eroded && r() < 0.35) continue
    const z = 0.2 + i * 0.075, l = 0.24 - Math.abs(i - 2) * 0.02
    parts.push(bone([V(s * 0.02, 0.1, z), V(s * l * 0.7, 0.16, z - 0.02), V(s * l, 0.08, z - 0.05), V(s * l * 0.82, 0.03, z - 0.07)], 0.011, col, 5, 4))
  }
  // 骨盆
  parts.push(prim(new THREE.TorusGeometry(0.11, 0.03, 5, 9, Math.PI * 1.3), col, 0, 0.07, -0.5, Math.PI / 2, 0, Math.PI * 0.85))
  // 颅骨：小颅腔 + 夸张巨颚（Wikidot「下颚巨大」）
  const hz = 0.72
  parts.push(prim(new THREE.SphereGeometry(0.1, 9, 7), col, curl * 0.3, 0.13, hz, 0, 0, 0))
  parts.push(prim(new THREE.SphereGeometry(0.028, 6, 4), dark, curl * 0.3 - 0.04, 0.16, hz + 0.08))
  parts.push(prim(new THREE.SphereGeometry(0.028, 6, 4), dark, curl * 0.3 + 0.04, 0.16, hz + 0.08))
  const jawOpen = 0.25 + r() * 0.5
  const jaw = new THREE.CylinderGeometry(0.14, 0.17, 0.08, 10, 1, false, -Math.PI * 0.55, Math.PI * 1.1)
  jaw.scale(1, 1, 1.9)
  parts.push(prim(jaw, col, curl * 0.3, 0.06, hz + 0.18, jawOpen, 0, 0))
  // 长而锋利的牙：上下两列细锥
  for (let i = 0; i < 9; i++) {
    const a = -0.9 + (i / 8) * 1.8
    const tx = Math.sin(a) * 0.13 + curl * 0.3, tz = hz + 0.16 + Math.cos(a) * 0.2
    parts.push(prim(new THREE.ConeGeometry(0.012, 0.09 + r() * 0.04, 4), '#ded8c4', tx, 0.13, tz, Math.PI, 0, 0))
    parts.push(prim(new THREE.ConeGeometry(0.011, 0.08 + r() * 0.04, 4), '#ded8c4', tx, 0.06 + Math.sin(jawOpen) * 0.05, tz + 0.02, 0, 0, 0))
  }
  // 臂骨
  for (const s of [-1, 1]) {
    const a0 = V(s * 0.17, 0.11, 0.55), a1 = V(s * (0.32 + r() * 0.1), 0.06, 0.32 + r() * 0.15), a2 = V(s * (0.4 + r() * 0.1), 0.04, 0.05 + r() * 0.2)
    parts.push(bone([a0, a0.clone().lerp(a1, 0.5).add(V(0, 0.02, 0)), a1], 0.018, col))
    if (!eroded || r() > 0.4) parts.push(bone([a1, a1.clone().lerp(a2, 0.5), a2], 0.014, col))
  }
  // 腿骨 + 鳍肢（Wikidot「腿部的末端呈现出类似鳍肢的结构」）：扇形张开的细长趾骨，骨间残留薄膜
  for (const s of [-1, 1]) {
    const k0 = V(s * 0.09, 0.08, -0.55), k1 = V(s * 0.14, 0.07, -0.98), k2 = V(s * 0.16, 0.05, -1.36)
    parts.push(bone([k0, k0.clone().lerp(k1, 0.5).add(V(0, 0.02, 0)), k1], 0.024, col))
    parts.push(bone([k1, k1.clone().lerp(k2, 0.5), k2], 0.019, col))
    for (let f = 0; f < 5; f++) {
      const a = (f - 2) * 0.24 + s * 0.12
      const tip = V(k2.x + Math.sin(a) * 0.36, 0.03, k2.z - Math.cos(a) * 0.4)
      parts.push(bone([k2, k2.clone().lerp(tip, 0.55).add(V(0, 0.015, 0)), tip], 0.008, col, 4, 4))
    }
    if (!eroded) {
      const m = new THREE.CircleGeometry(0.4, 9, -Math.PI / 2 - 0.62 + s * 0.12, 1.24)
      m.rotateX(-Math.PI / 2)
      parts.push(prim(m, '#4e463a', k2.x, 0.025, k2.z, 0, 0, 0, 0.9))
    }
  }
  const g = merge(parts)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  skeletonCache.set(key, g)
  return g
}

// ---------------- 不可理解的巨鱼骨架 ----------------
// 「结构难以理解」：主脊柱在中段分叉成两条，肋骨一半朝外一半朝内反折，颅骨上并排三组眼眶，
// 尾部再接一个朝后的小颅骨；全长约 18~26m，局部有撕咬缺口（Wikidot 暮色带鱼骨的抓挠痕迹）。
const giantCache = new Map<number, G>()
function giantFishGeo(v: number): G {
  const hit = giantCache.get(v)
  if (hit) return hit
  const r = rng(733 + v * 41)
  const col = '#cbc4b0', dark = '#1d1b17'
  const parts: G[] = []
  const L = 18 + r() * 8
  const H = 2.2 + r() * 0.8
  const main: THREE.Vector3[] = []
  for (let i = 0; i <= 8; i++) { const t = i / 8; main.push(V(-L / 2 + t * L, H + Math.sin(t * Math.PI) * 1.4 - t * t * 1.2, Math.sin(t * 5.3) * 0.9)) }
  const curve = new THREE.CatmullRomCurve3(main)
  parts.push(tint(sweep(main, (t) => 0.22 * (1 - t * 0.55) * (1 + 0.3 * Math.max(0, Math.sin(t * 46 * Math.PI))), { seg: 90, radial: 7 }), col))
  // 分叉脊柱：自 40% 处岔出，向上斜后方延伸，末端悬空
  const P = new THREE.Vector3(); curve.getPointAt(0.4, P)
  const fork = [P.clone(), P.clone().add(V(3, 1.4, 1.6)), P.clone().add(V(6.5, 2.0, 2.4)), P.clone().add(V(9, 1.1, 3.6))]
  parts.push(tint(sweep(fork, (t) => 0.15 * (1 - t * 0.6) * (1 + 0.3 * Math.max(0, Math.sin(t * 24 * Math.PI))), { seg: 48, radial: 6 }), col))
  // 肋骨：沿主脊每 0.55m 一对；第 n 对的左右肋随机「反折」（向上/向内卷），并留出撕咬缺口
  const T = new THREE.Vector3()
  const ribs = Math.floor(L / 0.62)
  const gapAt = 0.25 + r() * 0.5
  for (let i = 2; i < ribs - 2; i++) {
    const t = i / ribs
    if (Math.abs(t - gapAt) < 0.05) continue // 被咬掉的一段
    curve.getPointAt(t, P); curve.getTangentAt(t, T)
    const len = (1.6 + Math.sin(t * Math.PI) * 2.4) * (0.8 + r() * 0.35)
    for (const s of [-1, 1]) {
      const inv = r() < 0.32 ? -1 : 1
      const down = inv > 0 ? -1 : 0.9
      const a = P.clone()
      const b = P.clone().add(V(-T.x * 0.2, down * len * 0.45, s * len * 0.55))
      const c = P.clone().add(V(-T.x * 0.5, down * len * 0.95, s * len * (inv > 0 ? 0.7 : 0.25)))
      const d = P.clone().add(V(-T.x * 0.8 + (r() - 0.5) * 0.4, down * len * 1.05 - (inv > 0 ? 0 : 0.6), s * len * (inv > 0 ? 0.35 : -0.15)))
      if (d.y < 0.05) d.y = 0.05 + r() * 0.08
      if (c.y < 0.05) c.y = 0.08
      parts.push(bone([a, b, c, d], 0.06 * (1 - t * 0.4), col, 7, 5))
    }
  }
  // 巨颅：长吻 + 张开的颚 + 一排三组眼眶
  curve.getPointAt(0, P)
  const skull = new THREE.SphereGeometry(1.1, 12, 9); skull.scale(1.8, 0.95, 1.05)
  parts.push(prim(skull, col, P.x - 1.2, P.y + 0.1, P.z))
  const snout = new THREE.ConeGeometry(0.75, 2.8, 9); snout.rotateZ(Math.PI / 2)
  parts.push(prim(snout, col, P.x - 3.6, P.y + 0.15, P.z))
  const jaw = new THREE.CylinderGeometry(0.3, 0.5, 3.4, 8); jaw.rotateZ(Math.PI / 2 + 0.38)
  parts.push(prim(jaw, col, P.x - 3, P.y - 1.15, P.z))
  for (let e = 0; e < 3; e++) for (const s of [-1, 1]) parts.push(prim(new THREE.SphereGeometry(0.22 - e * 0.04, 7, 5), dark, P.x - 0.5 - e * 0.75, P.y + 0.45 + e * 0.08, P.z + s * (0.85 - e * 0.08)))
  for (let i = 0; i < 14; i++) {
    const tx = P.x - 2.1 - i * 0.22
    parts.push(prim(new THREE.ConeGeometry(0.06, 0.42 + r() * 0.3, 4), '#ddd6c0', tx, P.y - 0.55, P.z + (i % 2 ? 0.32 : -0.32), Math.PI, 0, 0))
  }
  // 尾端第二颅骨（朝后）
  curve.getPointAt(1, P)
  const s2 = new THREE.SphereGeometry(0.55, 9, 7); s2.scale(1.5, 0.9, 1)
  parts.push(prim(s2, col, P.x + 0.6, P.y, P.z))
  parts.push(prim(new THREE.SphereGeometry(0.12, 6, 4), dark, P.x + 1.15, P.y + 0.2, P.z + 0.28))
  // 尾鳍骨：扇形鳍条
  for (let f = 0; f < 7; f++) {
    const a = (f - 3) * 0.28
    parts.push(bone([P.clone(), P.clone().add(V(1.2, Math.sin(a) * 1.4, Math.cos(a) * 0.4 - 0.2)), P.clone().add(V(2.4, Math.sin(a) * 2.6, Math.cos(a) * 0.7 - 0.3))], 0.04, col, 5, 4))
  }
  const g = merge(parts)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  giantCache.set(v, g)
  return g
}

// ---------------- 碎屑场（实例化） ----------------
type DebrisKind = 'paper' | 'bone' | 'scrap' | 'fiber' | 'barrel'
const debrisGeo: Partial<Record<DebrisKind, G>> = {}
function debrisGeometry(k: DebrisKind): G {
  const hit = debrisGeo[k]
  if (hit) return hit
  let g: G
  if (k === 'paper') {
    // 书皮包着的实心纸块：书皮色块 + 纸芯白边
    g = merge([prim(new THREE.BoxGeometry(0.22, 0.05, 0.3), '#3d4a52'), prim(new THREE.BoxGeometry(0.2, 0.04, 0.29), '#cfc9b8', 0.012, 0, 0)])
  } else if (k === 'bone') {
    g = bone([V(-0.18, 0, 0), V(0, 0.02, 0.01), V(0.18, 0, 0)], 0.022, '#cbc4b0', 4, 5)
  } else if (k === 'scrap') {
    // 锈蚀废铁：弯折薄板 + 断管
    const plate = new THREE.BoxGeometry(0.42, 0.02, 0.28, 3, 1, 1)
    const p = plate.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.abs(p.getX(i)) * 0.35)
    g = merge([prim(plate, '#6a4630'), prim(new THREE.CylinderGeometry(0.04, 0.04, 0.34, 6, 1, true), '#5b3a26', 0.1, 0.06, 0.08, 0, 0, Math.PI / 2)])
  } else if (k === 'barrel') {
    g = prim(new THREE.CylinderGeometry(0.26, 0.26, 0.8, 9), '#4b3b2c', 0, 0, 0, 0, 0, Math.PI / 2)
  } else {
    // 人造纤维碎屑：一缕扭曲的薄带
    const s = new THREE.PlaneGeometry(0.5, 0.06, 6, 1)
    const p = s.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 9) * 0.05)
    g = prim(s, '#6d5f52')
  }
  if (g.index) g = g.toNonIndexed()
  for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a)
  g.computeVertexNormals()
  debrisGeo[k] = g
  return g
}
const debrisMats = new Map<string, THREE.Material>()
/** 碎屑共享材质：每个碎片的顶点带 aPivot（碎片中心）——悬浮件绕自身慢转并上下漂移，沉底件（aPivot.w=0）静止。 */
function debrisMaterial() {
  const mode = getMaterialMode(), hit = debrisMats.get(mode)
  if (hit) return hit
  const mat = litMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.85, envBase: 0.2, side: THREE.DoubleSide })
  const previousCompile = mat.onBeforeCompile, previousKey = mat.customProgramCacheKey.bind(mat)
  mat.onBeforeCompile = (sh, renderer) => {
    previousCompile.call(mat, sh, renderer)
    sh.uniforms.uWaterTime = waterUniforms.uWaterTime
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWaterTime;\nattribute vec4 aPivot;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec3 pv = aPivot.xyz;
  float ph = dot(pv, vec3(1.37, 0.71, 2.13));
  float drift = aPivot.w;
  float t = uWaterTime;
  vec3 lp = transformed - pv;
  float a = sin(t * 0.21 + ph) * 0.7 * drift;
  lp.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * lp.xz;
  float b = sin(t * 0.17 + ph * 1.3) * 0.4 * drift;
  lp.xy = mat2(cos(b), -sin(b), sin(b), cos(b)) * lp.xy;
  transformed = pv + lp + vec3(sin(t * 0.13 + ph) * 0.12, sin(t * 0.37 + ph * 1.7) * 0.18, cos(t * 0.11 + ph) * 0.12) * drift;
}`)
  }
  mat.customProgramCacheKey = () => 'l7-debris-v66b|' + previousKey()
  debrisMats.set(mode, mat)
  return mat
}

function buildDebris(s: Structure, m: GameMap): THREE.Object3D {
  const r = rng(Number(s.data?.seed ?? 1) + 7)
  const cx = s.x + 0.5, cz = s.y + 0.5
  const gy = floorHeight(m, cx, cz, 0)
  const parts: G[] = []
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(1, 1, 1), Pp = new THREE.Vector3()
  const N = 46
  for (let i = 0; i < N; i++) {
    const x = cx + (r() - 0.5) * 31, z = cz + (r() - 0.5) * 31
    const tx = Math.floor(x), tz = Math.floor(z)
    if (tx < 0 || tz < 0 || tx >= m.w || tz >= m.h || m.liquid[tz * m.w + tx] !== 1) continue
    const floor = floorHeight(m, x, z, 0) // 负值：海床
    const depth = -floor
    let kind: DebrisKind, y: number
    const u = r()
    if (depth < 24) {
      if (u > 0.22) continue // 有光带最萧条：只有极少量漂在近水面的纸块
      kind = r() < 0.85 ? 'paper' : 'barrel'; y = -0.25 - r() * 2.5
    } else if (depth < 90) {
      kind = u < 0.5 ? 'bone' : u < 0.85 ? 'scrap' : 'paper'
      // 暮色带：碎屑悬浮在水层中（档案「漂浮着零散的骨片与生锈的废铁」），集中在 24m 以下
      y = r() < 0.6 ? -(24 + r() * Math.max(1, depth - 26)) : floor + 0.05
    } else if (depth < 230) {
      kind = u < 0.55 ? 'bone' : u < 0.8 ? 'fiber' : 'scrap'
      y = r() < 0.75 ? floor + 0.04 : floor + 1 + r() * 6
    } else {
      if (u > 0.6) continue
      kind = u < 0.45 ? 'bone' : 'fiber'; y = floor + 0.03
    }
    const floating = y > floor + 0.2
    E.set((r() - 0.5) * (floating ? 3 : 0.3), r() * Math.PI * 2, (r() - 0.5) * (floating ? 3 : 0.3))
    Q.setFromEuler(E)
    const sc = 0.8 + r() * 0.7
    S.set(sc, sc, sc)
    Pp.set(x - cx, y - gy, z - cz)
    const g = debrisGeometry(kind).clone().applyMatrix4(M.compose(Pp, Q, S))
    const n = g.attributes.position.count
    const pv = new Float32Array(n * 4)
    for (let k = 0; k < n; k++) { pv[k * 4] = Pp.x; pv[k * 4 + 1] = Pp.y; pv[k * 4 + 2] = Pp.z; pv[k * 4 + 3] = floating ? 1 : 0 }
    g.setAttribute('aPivot', new THREE.BufferAttribute(pv, 4))
    parts.push(g)
  }
  if (!parts.length) return new THREE.Group()
  const mesh = new THREE.Mesh(mergeGeometries(parts)!, debrisMaterial())
  for (const g of parts) g.dispose()
  mesh.userData.noCastShadow = 1
  return mesh
}

// ---------------- 深渊气泡柱（点精灵，GPU 循环上升） ----------------
let bubbleMat: THREE.ShaderMaterial | null = null
function bubbleMaterial() {
  bubbleMat ??= new THREE.ShaderMaterial({
    uniforms: { uWaterTime: waterUniforms.uWaterTime, uPx: { value: 1 } },
    vertexShader: `uniform float uWaterTime; attribute vec4 aSeed; varying float vA;
void main(){
  // aSeed: x=相位 y=上升速度 z=柱高 w=侧向摆幅
  float h = mod(uWaterTime * aSeed.y + aSeed.x * aSeed.z, aSeed.z);
  vec3 p = position;
  p.y += h;
  p.x += sin(h * 1.3 + aSeed.x * 6.0) * aSeed.w * (0.3 + h / aSeed.z);
  p.z += cos(h * 1.1 + aSeed.x * 4.0) * aSeed.w * (0.3 + h / aSeed.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float sz = (0.035 + fract(aSeed.x * 7.3) * 0.06) * (1.0 + h / aSeed.z * 0.8);
  gl_PointSize = clamp(sz * 900.0 / -mv.z, 1.0, 22.0);
  vA = smoothstep(0.0, 0.6, h) * (1.0 - smoothstep(aSeed.z * 0.8, aSeed.z, h)) * clamp(1.0 - (-mv.z) / 26.0, 0.0, 1.0);
}`,
    fragmentShader: `varying float vA;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0; float d = dot(q, q);
  if (d > 1.0) discard;
  // 空心气泡：亮边 + 左上高光，中心近乎透明
  float rim = smoothstep(0.55, 0.95, d) * (1.0 - smoothstep(0.95, 1.0, d));
  float hl = 1.0 - smoothstep(0.0, 0.2, length(q - vec2(-0.35, 0.35)));
  gl_FragColor = vec4(vec3(0.62, 0.74, 0.78) * (rim + hl * 1.4), (rim * 0.75 + hl) * vA);
}`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
  return bubbleMat
}
function buildBubbles(s: Structure): THREE.Object3D {
  const big = !!s.data?.big
  const r = rng(Number(s.data?.seed ?? 3) + 11)
  const n = big ? 260 : 46
  const pos = new Float32Array(n * 3), seed = new Float32Array(n * 4)
  const H = big ? 46 : 9
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, rad = Math.sqrt(r()) * (big ? 0.55 : 0.25)
    pos[i * 3] = Math.cos(a) * rad; pos[i * 3 + 1] = 0.1; pos[i * 3 + 2] = Math.sin(a) * rad
    seed[i * 4] = r(); seed[i * 4 + 1] = (big ? 1.6 : 0.9) + r() * 0.9; seed[i * 4 + 2] = H * (0.6 + r() * 0.4); seed[i * 4 + 3] = big ? 0.35 : 0.12
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), H / 2 + 2)
  const pts = new THREE.Points(g, bubbleMaterial())
  pts.userData.noCastShadow = 1
  const grp = new THREE.Group()
  grp.add(pts)
  if (big) {
    // 源头：焦油裂口（黑色亮面隆起 + 一圈岩块）
    const parts: G[] = [prim(new THREE.SphereGeometry(1.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#0a0b0d', 0, -0.2, 0, 0, 0, 0)]
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; parts.push(prim(new THREE.DodecahedronGeometry(0.4 + r() * 0.35, 0), '#33383c', Math.cos(a) * 1.5, 0.1, Math.sin(a) * 1.5, r(), r(), r())) }
    const src = new THREE.Mesh(merge(parts), mats().tar)
    src.geometry.computeVertexNormals()
    grp.add(src)
  }
  return grp
}

// ---------------- 海床地毯补丁 ----------------
function buildCarpet(s: Structure, m: GameMap): THREE.Object3D {
  const r = rng(Number(s.data?.seed ?? 5) + 3)
  const w = s.w * 0.95, h = s.h * 0.95
  const g = new THREE.PlaneGeometry(w, h, 10, 7)
  g.rotateX(-Math.PI / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  const cx = s.x + s.w / 2, cz = s.y + s.h / 2, gy = floorHeight(m, cx, cz, 0)
  const colA = new THREE.Color('#5a4b3f'), colB = new THREE.Color('#3b322b'), c = new THREE.Color()
  const cols = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    // 贴合海床起伏 + 卷边（边缘翘起、局部破洞以颜色压暗模拟）
    const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (h / 2))
    p.setY(i, floorHeight(m, cx + x, cz + z, 0) - gy + 0.025 + Math.pow(edge, 6) * 0.12 * r())
    c.copy(colA).lerp(colB, r() * 0.6 + (edge > 0.85 ? 0.3 : 0))
    // 旧地毯的规则花纹：菱形格
    if (Math.abs(((x * 3 + z * 3) % 1 + 1) % 1 - 0.5) < 0.08 || Math.abs(((x * 3 - z * 3) % 1 + 1) % 1 - 0.5) < 0.08) c.multiplyScalar(1.35)
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3))
  g.computeVertexNormals()
  const mesh = new THREE.Mesh(g, mats().carpet)
  mesh.userData.noCastShadow = 1
  return mesh
}

// ---------------- 臣服堡垒（废弃） ----------------
function buildFort(s: Structure, m: GameMap): THREE.Object3D {
  const r = rng((s.x + (m.inf?.ox ?? 0)) * 31 + (s.y + (m.inf?.oy ?? 0)) * 17)
  const parts: G[] = [], tar: G[] = []
  const wood = ['#5a4330', '#6b5038', '#4a3826', '#73614c']
  const W = s.w, H = s.h
  // 外圈：书架/桌/椅/门板横七竖八堆成的矮墙，留一个朝海的缺口
  const gapA = (Number(s.data?.rot ?? 0) * Math.PI) / 2
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2
    if (Math.abs(Math.atan2(Math.sin(a - gapA), Math.cos(a - gapA))) < 0.4) continue
    const rad = Math.min(W, H) * 0.44
    const x = Math.cos(a) * rad, z = Math.sin(a) * rad
    const kind = r()
    const c = wood[Math.floor(r() * wood.length)]
    if (kind < 0.35) parts.push(prim(new THREE.BoxGeometry(0.9, 1.6 + r() * 0.5, 0.32), c, x, 0.8, z, (r() - 0.5) * 0.3, -a + Math.PI / 2, (r() - 0.5) * 0.25)) // 倒立书架
    else if (kind < 0.6) { parts.push(prim(new THREE.BoxGeometry(1.1, 0.06, 0.7), c, x, 0.95, z, 1.2 + r() * 0.3, -a, 0)); parts.push(prim(new THREE.BoxGeometry(0.06, 0.8, 0.06), c, x + 0.3, 0.4, z)) } // 侧翻桌
    else if (kind < 0.8) parts.push(prim(new THREE.BoxGeometry(0.85, 2.0, 0.06), c, x, 0.9, z, 0, -a + Math.PI / 2, 0.2 * (r() - 0.5))) // 门板
    else { parts.push(prim(new THREE.BoxGeometry(0.42, 0.06, 0.42), c, x, 0.45 + r() * 0.8, z, r(), r(), r())); parts.push(prim(new THREE.BoxGeometry(0.06, 0.5, 0.06), c, x, 0.25, z)) } // 椅子
    // 焦油：接缝处的黑色亮面涂抹/流挂
    tar.push(prim(new THREE.SphereGeometry(0.28 + r() * 0.2, 7, 5), '#0b0b0c', x * 0.96, 0.3 + r() * 1.1, z * 0.96, 0, 0, 0))
  }
  // 顶棚：几块门板斜搭 + 焦油封边
  for (let i = 0; i < 4; i++) parts.push(prim(new THREE.BoxGeometry(2.1, 0.05, 0.8), wood[i % 4], (r() - 0.5) * 0.8, 2.0 + r() * 0.2, -0.9 + i * 0.6, 0.15 * (r() - 0.5), r() * 0.4, 0.12))
  tar.push(prim(new THREE.BoxGeometry(2.3, 0.04, 2.6), '#0b0b0c', 0, 2.08, 0, 0, 0, 0.1))
  // 祭坛般的小堆：骨片 + 一张被焦油糊住的纸（居民据称崇拜七层之物）
  parts.push(prim(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 7), '#3b3833', 1.2, 0.2, 1.0))
  for (let i = 0; i < 5; i++) parts.push(bone([V(1.0 + r() * 0.4, 0.42, 0.8 + r() * 0.4), V(1.2, 0.5 + r() * 0.2, 1.0), V(1.4 - r() * 0.4, 0.42, 1.2 - r() * 0.4)], 0.02, '#cbc4b0', 3, 4))
  const grp = new THREE.Group()
  const wm = new THREE.Mesh(merge(parts), mats().wood); wm.geometry.computeVertexNormals(); grp.add(wm)
  const tm = new THREE.Mesh(merge(tar), mats().tar); tm.geometry.computeVertexNormals(); grp.add(tm)
  return grp
}

/** L7 v66 新结构入口；返回已居中（x/z 位于结构中心、y=0 为所在瓦片地面）的模型，非本模块结构返回 null。 */
export function buildL7Structure(s: Structure, m: GameMap): THREE.Object3D | null {
  switch (s.kind) {
    case 'l7debris': return buildDebris(s, m)
    case 'l7bubbles': return buildBubbles(s)
    case 'l7carpet': return buildCarpet(s, m)
    case 'l7fort': return buildFort(s, m)
    case 'l7skeleton': {
      const seed = Number(s.data?.seed ?? 0)
      const mesh = new THREE.Mesh(skeletonGeo(seed % 3, !!s.data?.eroded).clone(), mats().bone)
      mesh.rotation.y = (seed % 360) * Math.PI / 180
      mesh.position.y = 0.0
      mesh.userData.noCastShadow = 1
      return mesh
    }
    case 'l7giantfish': {
      const seed = Number(s.data?.seed ?? 0)
      const mesh = new THREE.Mesh(giantFishGeo(seed % 4).clone(), mats().bone)
      mesh.rotation.y = (seed % 360) * Math.PI / 180
      mesh.userData.noCastShadow = 1
      return mesh
    }
  }
  return null
}
