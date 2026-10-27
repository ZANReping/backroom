// Level 0.2「重塑的混乱」第二阶段画面：崩塌（掉落吊顶板 + 设备层、倒塌隔墙 + 断口、地板裂纹/塌落 + 未完工房屋）、
// 粉尘粒子，以及设施模型（通电插座指示灯、板夹、Wi‑Fi 路由器、洗手间）。
// 程序几何 + Canvas 贴图（碎料/裂纹/瓷砖/纸/标牌）+ public/textures/l02 的 CC0 PBR 材质（墙/地毯/吊顶/OSB/龙骨/保温棉，来源见该目录 SOURCES.md）。
// 烘焙的墙/地毯/吊顶由 installL02Cuts 注入的着色器按矩形丢弃片元（倒塌段/塌陷口/掉落板处），这里画替身与露出的结构。
// 材质一律 MeshBasicMaterial（不依赖场景实时光，不因新增光源触发整层着色器重编译），房屋亮度按施工灯位置烘进顶点色；
// PBR 表面经 installL02Pbr 注入法线起伏/AO（屏幕导数求切线框，同样不依赖实时光）。
import * as THREE from 'three'
import { afterSceneCompile } from './sceneWarmup'
import type { Engine } from '../engine'
import { installL02Pbr, l02Tex, type L02PbrName } from './l02Pbr'
import { toiletModel, stallModel, sinkModel, routerModel, clipboardModel, plenumModel, houseProps } from './l02Props'
import { L02_ID, L02_HEIGHT, L02_WALL_T, L02_RAIL_Y, L02_RAIL_H } from '../world/l02Layout'
import { L02_TUNING, L02_FREE_END_PAD, l02Collapse, housePartition, type Hole, type Rect, type RemovedWall, type FallenTile } from '../world/l02Collapse'

const H = L02_HEIGHT
const MAXW = 24, MAXH = 6, MAXT = 48
const wallU = Array.from({ length: MAXW }, () => new THREE.Vector4(1e6, 1e6, 1e6, 1e6))
const holeU = Array.from({ length: MAXH }, () => new THREE.Vector4(1e6, 1e6, 1e6, 1e6))
const tileU = Array.from({ length: MAXT }, () => new THREE.Vector4(1e6, 1e6, 1e6, 1e6))
export const l02CutUniforms = { l02Walls: { value: wallU }, l02Holes: { value: holeU }, l02Tiles: { value: tileU }, l02Ceil: { value: H } }

/** 烘焙材质注入：按世界 XZ 矩形丢弃倒塌墙段（地面以上、吊顶下 6 mm 以下——原先停在吊顶下 7 cm，墙顶留下一条横带）、塌陷口（地面层）、掉落吊顶板（吊顶层）。 */
export function installL02Cuts(mat: THREE.Material) {
  const previous = mat.onBeforeCompile.bind(mat)
  const previousKey = mat.customProgramCacheKey.bind(mat)
  mat.onBeforeCompile = (shader, renderer) => {
    previous(shader, renderer)
    Object.assign(shader.uniforms, l02CutUniforms)
    shader.vertexShader = 'varying vec3 vL02W;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  vL02W=(modelMatrix*vec4(transformed,1.)).xyz;`)
    shader.fragmentShader = `uniform vec4 l02Walls[${MAXW}];uniform vec4 l02Holes[${MAXH}];uniform vec4 l02Tiles[${MAXT}];uniform float l02Ceil;varying vec3 vL02W;
bool l02In(vec4 r,vec2 p){return p.x>r.x&&p.x<r.z&&p.y>r.y&&p.y<r.w;}
` + shader.fragmentShader
    // 倒墙丢弃高度范围：地面/吊顶各只留 0.5 mm（以前 4 mm / 6 mm，墙脚与墙顶各剩一条细带，远看是沿吊顶/地面的一排白点）；吊顶板正好在 l02Ceil、地毯在 0，不受影响
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `void main() {
  {vec2 q=vL02W.xz;float y=vL02W.y;
   if(y>.0005&&y<l02Ceil-.0005){for(int i=0;i<${MAXW};i++)if(l02In(l02Walls[i],q))discard;}
   if(y<.03){for(int i=0;i<${MAXH};i++)if(l02In(l02Holes[i],q))discard;}
   if(y>l02Ceil-.09){for(int i=0;i<${MAXT};i++)if(l02In(l02Tiles[i],q))discard;}}`)
  }
  mat.customProgramCacheKey = () => `${previousKey()}|l02cut`
}

// ---------- 贴图 ----------
// 掉落吊顶板（MeshBasic、不吃烘焙光）乘色：按同机位截图对齐原位吊顶的暖米黄观感（tune 见 reports/level-0-2/pbr）
const L02_TILE_TINT = '#d6d2cc'
const canvasCache = new Map<string, THREE.Texture>()
function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  let t = canvasCache.get(key); if (t) return t
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!)
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping }
  canvasCache.set(key, t); return t
}
let seed = 0x6a1d
const r01 = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
const ceilingTex = () => l02Tex('ceiling')
const wallTex = () => l02Tex('wall')
const carpetTex = () => l02Tex('carpet')
const osbTex = () => l02Tex('osb')
const studTex = () => l02Tex('stud')
const insulTex = () => l02Tex('insul')
const debrisTex = () => canvasTex('debris', 256, 256, (g) => {
  g.fillStyle = '#8f8a80'; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 160; i++) { const c = r01(); g.fillStyle = c < 0.4 ? '#e7e3d1' : c < 0.6 ? '#6b3a30' : c < 0.8 ? '#b48a55' : '#bdbdb4'; g.beginPath(); const x = r01() * 256, y = r01() * 256, s = 4 + r01() * 22; g.moveTo(x, y); g.lineTo(x + s, y + r01() * s); g.lineTo(x + r01() * s, y + s); g.closePath(); g.fill() }
  g.fillStyle = 'rgba(230,226,212,.35)'; g.fillRect(0, 0, 256, 256)
}, true)
const crackTex = () => canvasTex('crack', 256, 256, (g) => {
  g.clearRect(0, 0, 256, 256); g.strokeStyle = 'rgba(20,10,8,.9)'; g.lineCap = 'round'
  const branch = (x: number, y: number, a: number, len: number, w: number) => { if (len < 6 || w < 0.6) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); branch(x2, y2, a + (r01() - 0.5) * 0.9, len * 0.75, w * 0.8); if (r01() < 0.45) branch(x2, y2, a + (r01() < 0.5 ? 1 : -1) * (0.5 + r01() * 0.6), len * 0.55, w * 0.6) }
  for (let i = 0; i < 7; i++) branch(128, 128, i / 7 * Math.PI * 2 + r01() * 0.4, 30 + r01() * 20, 3.5)
})
const tileFloorTex = () => canvasTex('wctile', 256, 256, (g) => {
  g.fillStyle = '#d9d9d2'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#efefe9'
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fillRect(x * 32 + 1.5, y * 32 + 1.5, 29, 29)
  g.fillStyle = 'rgba(0,0,0,.04)'; for (let i = 0; i < 300; i++) g.fillRect(r01() * 256, r01() * 256, 2, 2)
}, true)
const clipPaperTex = () => canvasTex('clippaper', 128, 176, (g) => {
  g.fillStyle = '#f2f1ea'; g.fillRect(0, 0, 128, 176)
  g.fillStyle = '#4f4c7a'; g.fillRect(8, 10, 112, 20); g.fillStyle = '#d3ae00'; g.font = 'bold 12px "Noto Sans CJK SC",sans-serif'; g.fillText('后室装修公司', 14, 25)
  g.strokeStyle = '#8a92a8'; g.lineWidth = 1; for (let y = 44; y < 160; y += 11) { g.beginPath(); g.moveTo(12, y); g.lineTo(12 + 70 + r01() * 34, y); g.stroke() }
  g.fillStyle = 'rgba(200,196,182,.5)'; g.fillRect(70, 120, 50, 50)
})
const signTex = () => canvasTex('wcsign', 256, 128, (g) => {
  g.fillStyle = '#2f3a46'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#d7dde3'; g.lineWidth = 4; g.strokeRect(6, 6, 244, 116)
  g.fillStyle = '#f2f4f6'; g.font = 'bold 44px "Noto Sans CJK SC",sans-serif'; g.textAlign = 'center'; g.fillText('洗手间', 128, 66)
  g.font = 'bold 26px sans-serif'; g.fillText('WC  ♂ ♀', 128, 106)
})

const matCache = new Map<string, THREE.MeshBasicMaterial>()
function bmat(key: string, p: THREE.MeshBasicMaterialParameters, pbr?: L02PbrName) { let m = matCache.get(key); if (!m) { m = new THREE.MeshBasicMaterial(p); m.name = 'l02s-' + key; m.userData.l02Shared=true; if (pbr) installL02Pbr(m, pbr); matCache.set(key, m) } return m }

/** 把几何（世界/局部坐标）按施工灯位置烘一份顶点色亮度（MeshBasic + vertexColors）。 */
function bakeColors(g: THREE.BufferGeometry, lamps: { x: number; y: number; z: number }[], base: number, offset = new THREE.Vector3(), spill?: { x: number; y: number; w: number; h: number; top: number }) {
  // 施工灯：暖黄（约 3000 K）点光，近处热点 + 平方衰减的远场；开口漏下的室内冷白光只照开口正下方与附近
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset.x, y = p.getY(i) + offset.y, z = p.getZ(i) + offset.z
    let r = base, gg = base * 0.97, b = base * 0.92
    for (const l of lamps) {
      const dx = l.x - x, dy = l.z - y, dz = l.y - z, d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2) || 1
      const facing = n ? Math.max(0.25, (n.getX(i) * dx + n.getY(i) * dy + n.getZ(i) * dz) / d) : 1
      const k = (0.85 * Math.exp(-d2 / 3.2) + 1.6 / (1 + d2 * 1.4)) * facing
      r += k; gg += k * 0.86; b += k * 0.62
    }
    if (spill) { const ex = Math.max(0, spill.x - x, x - spill.x - spill.w), ez = Math.max(0, spill.y - z, z - spill.y - spill.h), up = Math.max(0, (y - (spill.top - 3)) / 3); const k = 0.38 * Math.exp(-(ex * ex + ez * ez) / 2.2) * (0.6 + 0.4 * up); r += k; gg += k; b += k * 0.98 }
    c[i * 3] = Math.min(1.25, r); c[i * 3 + 1] = Math.min(1.2, gg); c[i * 3 + 2] = Math.min(1.1, b)
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
}
function boxG(w: number, h: number, d: number, x: number, y: number, z: number, ry = 0) { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); return g }

// ---------- 房屋 ----------
function mergeInto(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!list.length) return null
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g))
  let n = 0; for (const g of flat) n += g.getAttribute('position').count
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3); let o = 0
  for (const g of flat) { const p = g.getAttribute('position'), u = g.getAttribute('uv'), nn = g.getAttribute('normal'); pos.set(p.array as Float32Array, o * 3); if (u) uv.set(u.array as Float32Array, o * 2); if (nn) nor.set(nn.array as Float32Array, o * 3); o += p.count }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  list.forEach((g) => g.dispose()); flat.forEach((g) => g.dispose())
  return out
}
/** 世界 UV：按位置投影（米为单位 / scale），避免拉伸。
 *  竖直面按「从正面看」取向：u 沿观察者右手方向（right = cross(-n, up)），v 向上——所以 ±X/±Z 四个朝向的墙上 OSB 印字
 *  都是正着、不镜像、不转 90°；水平面（地面/楼板底面）统一 u=x、v=-z。 */
function worldUV(g: THREE.BufferGeometry, scale: number) {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), uv = g.getAttribute('uv')
  for (let i = 0; i < p.count; i++) {
    const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i)
    let u: number, v: number
    if (Math.abs(ny) > 0.5) { u = p.getX(i); v = -p.getZ(i) }
    else {
      // right = cross(-n, up) = (nz, 0, -nx)（归一化到水平面）
      const l = Math.hypot(nx, nz) || 1, rx = nz / l, rz = -nx / l
      u = p.getX(i) * rx + p.getZ(i) * rz; v = p.getY(i)
    }
    uv.setXY(i, u / scale, v / scale)
  }
  return g
}
function buildHouse(h: Hole): THREE.Group {
  const root = new THREE.Group(); root.name = 'l02-house:' + h.id
  const F = h.house, O = h.open, D = h.depth, slab = 0.25
  const lamps = [
    { x: O.x + O.w * 0.25, y: O.y + O.h * 0.7, z: -D + 1.5 },
    { x: F.x + F.w - 0.6, y: F.y + 0.6, z: -D + 1.5 },
  ]
  const buckets = new Map<string, THREE.BufferGeometry[]>()
  const add = (k: string, g: THREE.BufferGeometry) => { const l = buckets.get(k) ?? []; l.push(g); buckets.set(k, l) }
  // 地面（胶合板）
  { const g = new THREE.PlaneGeometry(F.w, F.h, Math.max(1, Math.ceil(F.w / 0.35)), Math.max(1, Math.ceil(F.h / 0.35))); g.rotateX(-Math.PI / 2); g.translate(F.x + F.w / 2, -D + 0.002, F.y + F.h / 2); add('osb', g) }
  // 楼板底面（塌陷口以外，朝下）+ 楼板断面 + 搁栅
  const ring: Rect[] = [
    { x: F.x, y: F.y, w: F.w, h: O.y - F.y }, { x: F.x, y: O.y + O.h, w: F.w, h: F.y + F.h - O.y - O.h },
    { x: F.x, y: O.y, w: O.x - F.x, h: O.h }, { x: O.x + O.w, y: O.y, w: F.x + F.w - O.x - O.w, h: O.h },
  ]
  for (const r of ring) { if (r.w <= 0 || r.h <= 0) continue; const g = new THREE.PlaneGeometry(r.w, r.h, Math.max(1, Math.ceil(r.w / 0.35)), Math.max(1, Math.ceil(r.h / 0.35))); g.rotateX(Math.PI / 2); g.translate(r.x + r.w / 2, -slab, r.y + r.h / 2); add('osb', g) }
  for (const [x, z, w, d] of [[O.x, O.y - 0.02, O.w, 0.04], [O.x, O.y + O.h - 0.02, O.w, 0.04], [O.x - 0.02, O.y, 0.04, O.h], [O.x + O.w - 0.02, O.y, 0.04, O.h]] as const) add('debris', boxG(w, slab - 0.01, d, x + w / 2, -slab / 2 - 0.005, z + d / 2)) // 顶面压到 -0.01，避免与地毯 y=0 共面闪烁
  // 搁栅：沿 x 方向每 0.4 m 一根（只在楼板下方区域，开口处断开）
  for (let z = F.y + 0.2; z < F.y + F.h; z += 0.4) {
    const cross = z > O.y && z < O.y + O.h
    const segs = cross ? [[F.x, O.x], [O.x + O.w, F.x + F.w]] : [[F.x, F.x + F.w]]
    for (const [a, b] of segs) if (b - a > 0.1) add('stud', boxG(b - a, 0.2, 0.05, (a + b) / 2, -slab - 0.1, z))
  }
  // 外墙：内侧胶合板 + 龙骨；北墙一段改成裸龙骨 + 保温棉
  const wallH = D - slab
  const sides: [number, number, number, number, number][] = [[F.x, F.y, F.w, 0, 1], [F.x, F.y + F.h, F.w, 0, -1], [F.x, F.y, F.h, 1, 1], [F.x + F.w, F.y, F.h, 1, -1]]
  sides.forEach(([x, z, len, axis, inward], si) => {
    for (let t = 0; t <= len + 0.01; t += 0.6) {
      const sx = axis ? x + inward * 0.05 : x + Math.min(t, len), sz = axis ? z + Math.min(t, len) : z + inward * 0.05
      add('stud', boxG(axis ? 0.09 : 0.045, wallH, axis ? 0.045 : 0.09, sx, -D + wallH / 2, sz))
    }
    // 上下槛
    for (const y of [-D + 0.03, -slab - 0.03]) add('stud', boxG(axis ? 0.09 : len, 0.05, axis ? len : 0.09, axis ? x + inward * 0.05 : x + len / 2, y, axis ? z + len / 2 : z + inward * 0.05))
    if (si === 0) {
      // 北墙：一半保温棉、一半裸露（能看到墙后的暗处）
      const g = new THREE.PlaneGeometry(len * 0.55, wallH - 0.1, Math.max(1, Math.ceil(len * 0.55 / 0.35)), 7); g.translate(x + len * 0.3, -D + wallH / 2, z + 0.08); add('insul', g)
      const g2 = new THREE.PlaneGeometry(len * 0.45, wallH); g2.translate(x + len * 0.78, -D + wallH / 2, z - 0.06); add('dark', g2)
    } else {
      const g = new THREE.PlaneGeometry(len, wallH, Math.max(1, Math.ceil(len / 0.35)), 7)
      if (axis) { g.rotateY(inward > 0 ? Math.PI / 2 : -Math.PI / 2); g.translate(x + inward * 0.1, -D + wallH / 2, z + len / 2) } else { if (inward < 0) g.rotateY(Math.PI); g.translate(x + len / 2, -D + wallH / 2, z + inward * 0.1) }
      add('osb', g)
    }
  })
  // 内隔墙：裸龙骨 + 管线
  for (const p of housePartition(h)) {
    const alongX = p.w > p.h, len = alongX ? p.w : p.h
    for (let t = 0; t <= len + 0.01; t += 0.4) add('stud', boxG(alongX ? 0.045 : 0.09, wallH, alongX ? 0.09 : 0.045, alongX ? p.x + Math.min(t, len) : p.x + p.w / 2, -D + wallH / 2, alongX ? p.y + p.h / 2 : p.y + Math.min(t, len)))
    for (const y of [-D + 0.03, -slab - 0.03]) add('stud', boxG(alongX ? len : 0.09, 0.05, alongX ? 0.09 : len, p.x + p.w / 2, y, p.y + p.h / 2))
    // 电线（橙/白）与 PVC 管、铜管沿隔墙穿过龙骨
    for (const [y, k, r] of [[-D + 1.1, 'wireo', 0.008], [-D + 1.16, 'wirew', 0.007], [-D + 0.45, 'pvc', 0.03], [-D + 2.0, 'copper', 0.016]] as const) {
      const g = new THREE.CylinderGeometry(r, r, len + 0.6, 6); if (alongX) g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2); g.translate(p.x + p.w / 2, y, p.y + p.h / 2); add(k, g)
    }
  }
  // 吊在楼板下的裸电线与接线盒
  for (let i = 0; i < 3; i++) { const g = new THREE.CylinderGeometry(0.007, 0.007, F.w * 0.8, 5); g.rotateZ(Math.PI / 2); g.translate(F.x + F.w / 2, -slab - 0.22 - i * 0.04, F.y + 0.5 + i * 0.25); add(i === 1 ? 'wirew' : 'wireo', g) }
  add('junction', boxG(0.12, 0.12, 0.06, F.x + 0.5, -slab - 0.3, F.y + 0.16))
  // 碎料坡道（可爬出）：一块斜放的大块楼板 + 碎块
  {
    const R = h.ramp, alongX = h.rampDir === 'px' || h.rampDir === 'nx', len = alongX ? R.w : R.h, slope = Math.hypot(len, D), ang = Math.atan2(D, len)
    const g = new THREE.BoxGeometry(alongX ? slope : R.w, 0.14, alongX ? R.h : slope)
    const up = h.rampDir === 'px' || h.rampDir === 'py' ? 1 : -1
    if (alongX) g.rotateZ(up * ang); else g.rotateX(-up * ang)
    g.translate(R.x + R.w / 2, -D / 2 - 0.07, R.y + R.h / 2); add('debris', g)
    for (let i = 0; i < 14; i++) { const t = r01(), s = 0.12 + r01() * 0.3; const x = alongX ? R.x + t * R.w : R.x + r01() * R.w, z = alongX ? R.y + r01() * R.h : R.y + t * R.h; const tt = alongX ? (up > 0 ? t : 1 - t) : (up > 0 ? t : 1 - t); add('debris', boxG(s, s * 0.5, s * 0.8, x, -D * (1 - tt) + 0.05, z, r01() * 3)) }
  }
  // 塌下来的地板碎块（开口正下方）
  for (let i = 0; i < 10; i++) { const s = 0.3 + r01() * 0.7; add('carpetchunk', boxG(s, 0.1, s * 0.7, O.x + 0.4 + r01() * (O.w - 0.8), -D + 0.05 + r01() * 0.1, O.y + 0.4 + r01() * (O.h - 0.8), r01() * 3)) }
  // 施工灯、管卡、接线盒细节、工具/锥桶/碎料：第五轮移到 l02Props.houseProps（分件倒角 + 烘焙式明暗）
  const mats: Record<string, () => THREE.MeshBasicMaterial> = {
    osb: () => bmat('osb', { map: osbTex(), vertexColors: true }, 'osb'),
    stud: () => bmat('stud', { map: studTex(), vertexColors: true }, 'stud'),
    insul: () => bmat('insul', { map: insulTex(), vertexColors: true }, 'insul'),
    dark: () => bmat('dark', { color: '#2f2d29' }),
    debris: () => bmat('debris', { map: debrisTex(), vertexColors: true }),
    carpetchunk: () => bmat('carpetchunk', { map: carpetTex(), vertexColors: true }, 'carpet'),
    wireo: () => bmat('wireo', { color: '#d8762a', vertexColors: true }),
    wirew: () => bmat('wirew', { color: '#eeeeea', vertexColors: true }),
    pvc: () => bmat('pvc', { color: '#c9cdd2', vertexColors: true }),
    copper: () => bmat('copper', { color: '#c07a45', vertexColors: true }),
    junction: () => bmat('junction', { color: '#5d6066', vertexColors: true }),
    metal: () => bmat('metal', { color: '#2c2c2a', vertexColors: true }),
    lampHead: () => bmat('lampHead', { color: '#e6c21a' }),
    lampGlass: () => bmat('lampGlass', { color: '#fff6dc' }),
  }
  for (const [k, list] of buckets) {
    const g = mergeInto(list); if (!g) continue
    if (k === 'osb' || k === 'stud' || k === 'insul' || k === 'debris' || k === 'carpetchunk') worldUV(g, k === 'osb' ? 1.22 : k === 'stud' ? 0.6 : k === 'insul' ? 0.6 : 1.4)
    if (k !== 'dark' && k !== 'lampHead' && k !== 'lampGlass' && k !== 'lampGlow') bakeColors(g, lamps, 0.2, undefined, { ...O, top: 0 })
    const mesh = new THREE.Mesh(g, mats[k]()); mesh.name = 'l02-house-' + k; root.add(mesh)
  }
  houseProps(root, F, O, D, housePartition(h), [[-D + 1.1, 'wireo', 0.008], [-D + 1.16, 'wirew', 0.007], [-D + 0.45, 'pvc', 0.03], [-D + 2.0, 'copper', 0.016]], lamps)
  return root
}

// ---------- 墙 / 板 ----------
function slabMesh(w: RemovedWall): THREE.Group {
  // 枢轴在墙底、倒向一侧的边上；子网格是整段墙（墙面 + 防撞条 + 自由端护角 + 背面龙骨，一起倒下）
  // 丢弃矩形在自由端外扩了 L02_FREE_END_PAD，墙板本身按真实墙段长度建（去掉外扩量），中心相应偏移
  const g = new THREE.Group(), horiz = w.axis === 'x'
  const T = L02_WALL_T, P = L02_FREE_END_PAD
  const p0 = w.freeEnds?.[0] ? P : 0, p1 = w.freeEnds?.[1] ? P : 0
  const len = (horiz ? w.w : w.h) - p0 - p1, shift = (p0 - p1) / 2
  const SH = H - 0.012 // 墙板顶到吊顶下 1.2 cm（原先少 7 cm，墙顶那一条留在原位）
  const geo = new THREE.BoxGeometry(horiz ? len : T, SH, horiz ? T : len)
  worldUV(geo, 1 / 0.45)
  const body = new THREE.Group()
  const m = new THREE.Mesh(geo, bmat('slab', { map: wallTex(), color: '#e2e0d2' }, 'wall')); m.name = 'l02-slab-wall'
  body.add(m)
  if (w.rail) {
    // 深红棕防撞条（两面，与渲染层 L02_RAIL_Y/L02_RAIL_H 一致）随墙倒下
    const railM = bmat('slabrail', { map: l02Tex('trim'), color: '#ffffff' }, 'trim')
    for (const side of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(horiz ? len + 0.028 : 0.014, L02_RAIL_H, horiz ? 0.014 : len + 0.028), railM); r.name = 'l02-slab-rail'
      r.position.set(horiz ? 0 : side * (T / 2 + 0.007), L02_RAIL_Y - SH / 2, horiz ? side * (T / 2 + 0.007) : 0); body.add(r)
    }
  }
  // 自由端护角条（两条竖棱各一根 1.1 cm 方条）
  const guardM = bmat('slabguard', { map: wallTex(), color: '#e6e4d8' }, 'wall')
  for (const [free, s] of [[!!w.freeEnds?.[0], -1], [!!w.freeEnds?.[1], 1]] as const) {
    if (!free) continue
    for (const side of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.011, SH - 0.01, 0.011), guardM); c.name = 'l02-slab-guard'
      c.position.set(horiz ? s * len / 2 : side * T / 2, 0, horiz ? side * T / 2 : s * len / 2); body.add(c)
    }
  }
  // 子网格中心相对枢轴（枢轴在倒向一侧的底边）
  if (horiz) body.position.set(shift, SH / 2, -w.dir * T / 2); else body.position.set(-w.dir * T / 2, SH / 2, shift)
  g.add(body)
  // 背面露出的龙骨（倒下后朝上能看见）
  const studs = new THREE.Group()
  for (let t = -len / 2 + 0.2; t < len / 2; t += 0.6) { const s = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 0.04 : 0.02, SH - 0.03, horiz ? 0.02 : 0.04), bmat('steelstud', { color: '#9aa0a4' })); s.position.set(horiz ? t + shift : -w.dir * (T / 2), SH / 2, horiz ? -w.dir * (T / 2) : t + shift); studs.add(s) }
  g.add(studs)
  if (horiz) g.position.set(w.x + w.w / 2, 0, w.y + w.h / 2 + w.dir * T / 2); else g.position.set(w.x + w.w / 2 + w.dir * T / 2, 0, w.y + w.h / 2)
  g.userData.horiz = horiz; g.userData.dir = w.dir
  return g
}
function capMeshes(w: RemovedWall, eng: Engine): THREE.Group {
  // 断口：两端如果还连着墙，补一块参差的断面 + 一根钢龙骨
  const g = new THREE.Group(), inf = eng.map!.inf!, horiz = w.axis === 'x', T = L02_WALL_T
  const ends = horiz ? [[w.x, w.y + w.h / 2, -1], [w.x + w.w, w.y + w.h / 2, 1]] : [[w.x + w.w / 2, w.y, -1], [w.x + w.w / 2, w.y + w.h, 1]]
  for (const [x, y, s] of ends) {
    const probe = horiz ? { x: x - s * 0.05, y } : { x, y: y - s * 0.05 }
    const px = horiz ? x + s * 0.05 : x, py = horiz ? y : y + s * 0.05
    void probe
    const attached = eng.map!.structures.some((q) => q.data?.l0Wall && !q.data?.l0Prop && !q.data?.l02House && Number(q.data?.top) > 2 && px - inf.ox > q.x - 0.01 && px - inf.ox < q.x + q.w + 0.01 && py - inf.oy > q.y - 0.01 && py - inf.oy < q.y + q.h + 0.01)
    if (!attached) continue
    for (let k = 0; k < 6; k++) {
      const hh = (H - 0.008) / 6, jut = 0.01 + r01() * 0.05
      const m = new THREE.Mesh(new THREE.BoxGeometry(horiz ? jut : T + 0.01, hh, horiz ? T + 0.01 : jut), bmat('cap', { map: wallTex(), color: '#cfccbb' }, 'wall'))
      m.position.set(horiz ? x - s * jut / 2 : x, hh * (k + 0.5), horiz ? y : y - s * jut / 2); g.add(m)
    }
    const st = new THREE.Mesh(new THREE.BoxGeometry(horiz ? 0.04 : 0.09, H - 0.008, horiz ? 0.09 : 0.04), bmat('steelstud', { color: '#9aa0a4' }))
    st.position.set(horiz ? x + s * 0.025 : x, (H - 0.008) / 2, horiz ? y : y + s * 0.025); g.add(st)
  }
  return g
}
function tileMesh(): THREE.Mesh {
  const g = new THREE.BoxGeometry(1.17, 0.016, 0.57)
  const uv = g.getAttribute('uv'); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i))
  return new THREE.Mesh(g, bmat('tile', { map: ceilingTex(), color: L02_TILE_TINT }, 'ceiling'))
}
function plenumMesh(t: FallenTile): THREE.Group {
  const g = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(t.w, 0.5, t.h), bmat('plenum', { color: '#37342e', side: THREE.BackSide }))
  box.position.set(t.x + t.w / 2, H + 0.25, t.y + t.h / 2); g.add(box)
  // 龙骨 T 条残留
  const bar = new THREE.Mesh(new THREE.BoxGeometry(t.w, 0.02, 0.03), bmat('tbar', { color: '#d9d9d2' })); bar.position.set(t.x + t.w / 2, H - 0.01, t.y + t.h / 2 + (r01() - 0.5) * 0.2); bar.rotation.x = 0.3; g.add(bar)
  // 夹层细化：楼板底的混凝土梁肋、主龙骨吊杆（镀锌丝）、红色喷淋支管 + 下垂喷头、灰色线槽——掉板后仰视不再是一个空黑盒
  const cx = t.x + t.w / 2, cz = t.y + t.h / 2
  const rib = bmat('plenumrib', { color: '#46423b' })
  for (const dz of [-0.32, 0.32]) { const r = new THREE.Mesh(new THREE.BoxGeometry(t.w, 0.08, 0.12), rib); r.position.set(cx, H + 0.46, cz + dz * t.h); g.add(r) }
  // 第五轮：喷淋支管（卡箍/管卡吊杆/喷头）、保温风管（保温棉 PBR + 铝箔箍）、电缆桥架、吊丝（l02Props.plenumModel）
  plenumModel(g, cx, cz, t.w, t.h, H)
  return g
}

// ---------- 设施 ----------
function fixMesh(s: { data?: Record<string, unknown> }): THREE.Group | null {
  const d = s.data ?? {}, f = d.fix, x = Number(d.fx), z = Number(d.fy), g = new THREE.Group()
  g.position.set(x, 0, z); g.rotation.y = Number(d.yaw ?? 0)
  const B = (w: number, h: number, dd: number, px: number, py: number, pz: number, m: THREE.Material) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); mesh.position.set(px, py, pz); g.add(mesh); return mesh }
  if (f === 'outlet') {
    const h = Number(d.h ?? 0.335)
    const led = B(0.012, 0.012, 0.01, 0.03, h + 0.055, -0.02, bmat('led', { color: '#3dff6e' })); led.name = 'l02-led'; led.userData.wallMount = 1
  } else if (f === 'clipboard') {
    const tilt = new THREE.Group(); tilt.position.set(0, 0, -0.2); tilt.rotation.x = -0.28; g.add(tilt)
    clipboardModel(tilt)
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), bmat('clippaper', { map: clipPaperTex() })); paper.position.set(0, 0.16, 0.0042); tilt.add(paper)
    // 第二张纸：右下角微微翘起
    const curl = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), bmat('clippaper2', { color: '#e9e7dd', side: THREE.DoubleSide })); curl.position.set(0.075, 0.035, 0.012); curl.rotation.set(-0.5, 0.4, 0.785); tilt.add(curl)
  } else if (f === 'router') {
    routerModel(g)
    for (let i = 0; i < 4; i++) { const l = B(0.01, 0.005, 0.003, -0.06 + i * 0.03, 0.03, 0.0775, bmat('rled', { color: '#43ff78' })); l.name = 'l02-rled' }
  } else if (f === 'toilet') {
    toiletModel(g)
  } else if (f === 'stall') {
    stallModel(g, !!d.end)
  } else if (f === 'sink') {
    sinkModel(g)
  } else if (f === 'restroom') {
    g.rotation.y = 0; g.position.set(0, 0, 0)
    const rx = Number(d.rx), ry = Number(d.ry), rw = Number(d.rw), rh = Number(d.rh), dx = Number(d.dx), dw = Number(d.dw)
    const fl = new THREE.PlaneGeometry(rw - 0.16, rh - 0.16); fl.rotateX(-Math.PI / 2); fl.translate(rx + rw / 2, 0.004, ry + rh / 2); worldUV(fl, 2)
    g.add(new THREE.Mesh(fl, bmat('wcfloor', { map: tileFloorTex(), color: '#d9d9d2' })))
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), bmat('wcsign', { map: signTex() })); sign.name = 'l02-wallmount'; sign.position.set(dx - 0.45, 1.75, ry + rh + L02_WALL_T / 2 + 0.006); g.add(sign)
    void dw
  } else return null
  return g
}

// ---------- 粉尘 ----------
function dustPoints(): THREE.Points {
  const N = 700, p = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) p.set([(r01() - 0.5) * 16, r01() * H, (r01() - 0.5) * 16], i * 3)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3))
  const m = new THREE.PointsMaterial({ color: '#e2dccd', size: 0.014, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true })
  const pts = new THREE.Points(g, m); pts.name = 'l02-dust'; pts.frustumCulled = false
  return pts
}

// ---------- 场景同步 ----------
interface View {
  root: THREE.Group
  tiles: Map<FallenTile, { mesh: THREE.Mesh; plenum: THREE.Group; yaw: number }>
  walls: Map<RemovedWall, { slab: THREE.Group; caps: THREE.Group | null }>
  holes: Map<Hole, { crack: THREE.Mesh; drop: THREE.Mesh; house: THREE.Group | null }>
  fixes: Map<number, THREE.Group>
  dust: THREE.Points
}
let view: View | null = null
let viewScene: THREE.Object3D | null = null
function disposeTree(o:THREE.Object3D){afterSceneCompile(o,()=>{const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();o.traverse(c=>{const m=c as THREE.Mesh;if(m.geometry)geos.add(m.geometry);if(m.material)for(const a of Array.isArray(m.material)?m.material:[m.material])if(!a.userData.l02Shared)mats.add(a)});for(const g of geos)g.dispose();for(const m of mats)m.dispose()})}
function clearView() { if (view) { view.root.removeFromParent(); disposeTree(view.root) } view = null }
export function clearL02Scene(scene:THREE.Object3D){if(viewScene===scene){clearView();viewScene=null}}

export function syncL02Scene(scene: THREE.Object3D, eng: Engine, time: number) {
  const inf = eng.map?.inf, rt = eng.l02
  const show = eng.player.level === L02_ID && !!inf && !!rt
  if (viewScene !== scene || !show) { clearView(); viewScene = scene }
  for (const v of [wallU, holeU, tileU]) for (const q of v) q.set(1e6, 1e6, 1e6, 1e6)
  if (!show || !inf || !rt) return
  if (!view) {
    const root = new THREE.Group(); root.name = 'l02-scene'
    view = { root, tiles: new Map(), walls: new Map(), holes: new Map(), fixes: new Map(), dust: dustPoints() }
    root.add(view.dust); scene.add(root)
  }
  const V = view, st = l02Collapse(), T = L02_TUNING, ox = inf.ox, oy = inf.oy, now = rt.t
  V.root.position.set(-ox, 0, -oy)
  // 着色器矩形（渲染坐标）
  st.removedWalls.slice(-MAXW).forEach((w, i) => wallU[i].set(w.x - ox, w.y - oy, w.x + w.w - ox, w.y + w.h - oy))
  st.holes.filter((h) => h.dropped).slice(-MAXH).forEach((h, i) => holeU[i].set(h.open.x - ox, h.open.y - oy, h.open.x + h.open.w - ox, h.open.y + h.open.h - oy))
  st.tiles.slice(-MAXT).forEach((t, i) => tileU[i].set(t.x - ox + 0.005, t.y - oy + 0.005, t.x + t.w - ox - 0.005, t.y + t.h - oy - 0.005))
  // 掉落吊顶板
  for (const [t, v] of V.tiles) if (!st.tiles.includes(t)) { v.mesh.removeFromParent(); v.plenum.removeFromParent(); disposeTree(v.mesh); disposeTree(v.plenum); V.tiles.delete(t) }
  for (const t of st.tiles) {
    let v = V.tiles.get(t)
    if (!v) { v = { mesh: tileMesh(), plenum: plenumMesh(t), yaw: (r01() - 0.5) * 0.9 }; V.root.add(v.mesh, v.plenum); V.tiles.set(t, v) }
    const age = now - t.t0, cx = t.x + t.w / 2, cz = t.y + t.h / 2, m = v.mesh
    const ground = groundAt(cx, cz)
    if (age < T.tileWarn) { const sag = Math.min(1, age / T.tileWarn); m.position.set(cx + Math.sin(time * 40) * 0.004 * sag, H - 0.01 - sag * 0.035, cz); m.rotation.set(sag * 0.05, 0, Math.sin(time * 23) * 0.02 * sag) }
    else {
      const f = age - T.tileWarn, y = Math.max(ground + 0.01, H - 0.01 - 4.9 * f * f), k = Math.min(1, f / 0.74)
      m.position.set(cx + v.yaw * 0.25 * k, y, cz + v.yaw * 0.12 * k); m.rotation.set(0.05 + k * 0.2 * Math.sign(v.yaw) * (y <= ground + 0.02 ? 0 : 1), v.yaw * k, 0)
      if (y <= ground + 0.011) m.rotation.set(0, v.yaw, 0)
    }
  }
  // 倒塌隔墙
  for (const [w, v] of V.walls) if (!st.removedWalls.includes(w)) { v.slab.removeFromParent(); disposeTree(v.slab); if (v.caps) { v.caps.removeFromParent(); disposeTree(v.caps) } V.walls.delete(w) }
  for (const w of st.removedWalls) {
    let v = V.walls.get(w)
    if (!v) { v = { slab: slabMesh(w), caps: null }; V.root.add(v.slab); V.walls.set(w, v) }
    if (!v.caps && now - w.t0 > 0.05) { v.caps = capMeshes(w, eng); V.root.add(v.caps) }
    const age = now - w.t0, s = v.slab
    let ang = 0
    if (age < T.wallWarn) { const k = age / T.wallWarn; ang = Math.sin(time * 30) * 0.004 * k + k * 0.03 }
    else { const f = Math.min(1, (age - T.wallWarn) / 0.9); ang = 0.03 + (Math.PI / 2 - 0.03) * f * f }
    if (s.userData.horiz) s.rotation.set(w.dir * ang, 0, 0); else s.rotation.set(0, 0, -w.dir * ang)
  }
  // 地板塌陷 + 房屋
  for (const [h, v] of V.holes) if (!st.holes.includes(h)) { for (const o of [v.crack, v.drop, v.house]) if (o) { o.removeFromParent(); disposeTree(o) } V.holes.delete(h) }
  for (const h of st.holes) {
    let v = V.holes.get(h)
    const O = h.open
    if (!v) {
      const cg = new THREE.PlaneGeometry(O.w + 0.6, O.h + 0.6); cg.rotateX(-Math.PI / 2); cg.translate(O.x + O.w / 2, 0.006, O.y + O.h / 2)
      const crack = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: crackTex(), transparent: true, opacity: 0, depthWrite: false }))
      const dg = new THREE.BoxGeometry(O.w, 0.12, O.h); worldUV(dg, 3); const drop = new THREE.Mesh(dg, bmat('dropslab', { map: carpetTex(), color: '#b9b0a6' })); drop.position.set(O.x + O.w / 2, -0.06, O.y + O.h / 2); drop.visible = false
      // 房屋在预警开始时就建好（在完整的地毯下面看不见），塌落瞬间不卡顿
      const house = buildHouse(h)
      V.root.add(crack, drop, house)
      v = { crack, drop, house }; V.holes.set(h, v)
    }
    const age = now - h.t0
    const cm = v.crack.material as THREE.MeshBasicMaterial
    if (!h.dropped) { cm.opacity = Math.min(0.85, age / T.floorWarn); v.crack.position.y = Math.sin(time * 35) * 0.002 }
    else {
      cm.opacity = 0; v.crack.visible = false
      const f = age - T.floorWarn
      v.drop.visible = f < 0.9
      if (v.drop.visible) { v.drop.position.y = -0.06 - Math.min(h.depth - 0.2, 4.9 * f * f); v.drop.rotation.z = f * 0.15 }
    }
  }
  // 设施（窗口内 40 m）
  const P = { x: eng.player.x + ox, y: eng.player.y + oy }
  const seen = new Set<number>()
  for (const s of eng.map!.structures) {
    if (s.kind !== 'l02fix') continue
    const sid = Number(s.data?.sid), fx = Number(s.data?.fx), fy = Number(s.data?.fy)
    if (Math.abs(fx - P.x) > 40 || Math.abs(fy - P.y) > 40) continue
    seen.add(sid)
    if (!V.fixes.has(sid)) { const g = fixMesh(s); if (g) { V.root.add(g); V.fixes.set(sid, g) } }
  }
  for (const [sid, g] of V.fixes) if (!seen.has(sid)) { g.removeFromParent(); disposeTree(g); V.fixes.delete(sid) }
  // 贴墙小件（插座指示灯、洗手间标牌）：所在墙段倒塌后一起消失（不悬空留在原位）
  const wp = new THREE.Vector3()
  for (const g of V.fixes.values()) g.traverse((o) => {
    if (o.name !== 'l02-wallmount' && !o.userData.wallMount) return
    o.getWorldPosition(wp); const x = wp.x + ox, y = wp.z + oy
    o.visible = !st.removedWalls.some((w) => x > w.x - 0.05 && x < w.x + w.w + 0.05 && y > w.y - 0.05 && y < w.y + w.h + 0.05)
  })
  const blink = Math.sin(time * 6) > 0
  for (const g of V.fixes.values()) g.traverse((o) => { if (o.name === 'l02-rled') (o as THREE.Mesh).visible = blink || o.position.x < -0.03 })
  // 粉尘
  const dm = V.dust.material as THREE.PointsMaterial
  dm.opacity = Math.min(0.85, rt.dust * 1.6)
  V.dust.visible = rt.dust > 0.02
  V.dust.position.set(P.x, 0, P.y)
  if (V.dust.visible) { const a = V.dust.geometry.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - 0.004 - (i % 7) * 0.0006; if (y < 0) y += H; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(time + i) * 0.002) } a.needsUpdate = true }
}
function groundAt(x: number, z: number) {
  for (const h of l02Collapse().holes) if (h.dropped && x >= h.open.x && x < h.open.x + h.open.w && z >= h.open.y && z < h.open.y + h.open.h) return -h.depth
  return 0
}
const L02_HAZE = new THREE.Color('#cbc8c0')
/** 雾：粉尘越浓视距越短、雾色越偏石膏灰（renderer.ts 每帧调用）。 */
export function l02DustFog(eng: Engine, fog: THREE.Fog) {
  if (eng.player.level !== L02_ID) return
  // 远景轻雾（常驻）：开阔办公层远处略微发灰发亮，层次往远处退；近处不受影响
  fog.near = Math.min(fog.near, 12); fog.far = Math.min(fog.far, 62)
  fog.color.lerp(L02_HAZE, 0.6)
  const d = eng.l02?.dust ?? 0
  if (d <= 0.001) return
  fog.near += (1.0 - fog.near) * Math.min(1, d * 1.4)
  fog.far += (7 - fog.far) * Math.min(1, d * 1.25)
  fog.color.lerp(new THREE.Color('#bdb6a6'), Math.min(0.85, d * 1.3))
}
