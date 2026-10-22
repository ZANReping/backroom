// [kazoo] L8「乐器洞」——参照中文维基 Level 8 正文里那段石头乐器洞穴的叙事：
// 整个洞穴装满天然长成的石头乐器：小提琴、吉他、看起来像长号的东西，以古怪角度嵌在岩壁上；
// 头顶一组风铃由复杂的石链系着；一个马桶，周围不可理喻地围了一圈邦戈鼓（有几架倒了）；
// 一根钟乳石的断口，正好能对上石卡祖笛的笛口。
// 全部是「未经雕琢的石头」：几何在规整造型上叠加低频起伏与细碎凹凸，材质由调用方给（游戏内用 L8 岩体 PBR）。
// 每件乐器合并成一个几何（一个网格），只有风铃的六根管单独成组以便摆动。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type StoneInstrumentKind = 'violin' | 'guitar' | 'trombone' | 'windchime' | 'toilet' | 'bongo' | 'kazoospike'

const hash = (x: number, y: number, z: number) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s) }
function noise(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf)
  let r = 0
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++)
    r += hash(xi + a, yi + b, zi + c) * (a ? u : 1 - u) * (b ? v : 1 - v) * (c ? w : 1 - w)
  return r * 2 - 1
}
/** 非索引化 + 沿法线的岩石起伏（低频 amp + 高频 amp*0.35），保证每件都是「粗糙拙朴」的 */
function rough(g: THREE.BufferGeometry, amp: number, freq: number, seed: number) {
  const n = g.index ? g.toNonIndexed() : g
  if (!n.attributes.normal) n.computeVertexNormals()
  const pa = n.attributes.position as THREE.BufferAttribute, na = n.attributes.normal as THREE.BufferAttribute
  // 同一位置的顶点必须位移一致，否则非索引几何会裂缝：用位置本身做噪声输入、法线取同位平均
  const key = (i: number) => `${pa.getX(i).toFixed(4)},${pa.getY(i).toFixed(4)},${pa.getZ(i).toFixed(4)}`
  const avg = new Map<string, THREE.Vector3>()
  for (let i = 0; i < pa.count; i++) { const k = key(i); const v = avg.get(k) ?? new THREE.Vector3(); v.x += na.getX(i); v.y += na.getY(i); v.z += na.getZ(i); avg.set(k, v) }
  const out = new Float32Array(pa.count * 3)
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), nv = avg.get(key(i))!.clone().normalize()
    const d = amp * noise(x * freq + seed, y * freq, z * freq) + amp * 0.35 * noise(x * freq * 4.3, y * freq * 4.3 + seed, z * freq * 4.3)
    out[i * 3] = x + nv.x * d; out[i * 3 + 1] = y + nv.y * d; out[i * 3 + 2] = z + nv.z * d
  }
  n.setAttribute('position', new THREE.BufferAttribute(out, 3))
  n.computeVertexNormals()
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pa.count * 2).fill(0), 2))
  return n
}
/** 平面投影 UV（岩石贴图按世界尺度铺，保证与岩壁同密度） */
function boxUV(g: THREE.BufferGeometry, scale = 1.6) {
  const pa = g.attributes.position as THREE.BufferAttribute, na = g.attributes.normal as THREE.BufferAttribute
  const uv = new Float32Array(pa.count * 2)
  for (let i = 0; i < pa.count; i++) {
    const ax = Math.abs(na.getX(i)), ay = Math.abs(na.getY(i)), az = Math.abs(na.getZ(i))
    const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i)
    const [u, v] = ax > ay && ax > az ? [z, y] : ay > az ? [x, z] : [x, y]
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: number | [number, number, number] = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s))
  g.applyMatrix4(m); return g
}
const ext = (s: THREE.Shape, depth: number, bevel = 0.006, curve = 6) => {
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: curve, steps: 1 })
  g.translate(0, 0, -depth / 2); return g
}
const finish = (list: THREE.BufferGeometry[], amp: number, freq: number, seed: number) => {
  const g = mergeGeometries(list.map((x) => { const n = x.index ? x.toNonIndexed() : x; n.deleteAttribute('uv'); return n }))!
  return boxUV(rough(g, amp, freq, seed))
}
/** 两段式「琴身」轮廓：上下两个椭圆弧，中间收腰（小提琴/吉他共用） */
function bodyShape(len: number, upper: number, lower: number, waist: number) {
  const s = new THREE.Shape(), N = 40
  const ss = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t) }
  const prof = (t: number) => t < 0.27 ? lower * Math.sqrt(Math.max(0, 1 - ((0.27 - t) / 0.27) ** 2))
    : t < 0.52 ? lower + (waist - lower) * ss((t - 0.27) / 0.25)
      : t < 0.77 ? waist + (upper - waist) * ss((t - 0.52) / 0.25)
        : upper * Math.sqrt(Math.max(0, 1 - ((t - 0.77) / 0.23) ** 2))
  for (let i = 0; i <= N; i++) { const t = i / N; const w = Math.max(0.004, prof(t)); i ? s.lineTo(w, t * len) : s.moveTo(w, t * len) }
  for (let i = N; i >= 0; i--) { const t = i / N; s.lineTo(-Math.max(0.004, prof(t)), t * len) }
  return s
}

function violin(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = []
  L.push(ext(bodyShape(0.36, 0.085, 0.105, 0.058), 0.05, 0.012, 4))
  L.push(at(new THREE.BoxGeometry(0.034, 0.26, 0.026), 0, 0.48, 0.01)) // 琴颈
  L.push(at(new THREE.BoxGeometry(0.03, 0.08, 0.034), 0, 0.64, 0.004)) // 弦轴箱
  L.push(at(new THREE.TorusGeometry(0.02, 0.009, 5, 10, Math.PI * 1.6), 0, 0.695, 0.004, 0, Math.PI / 2)) // 琴头涡卷
  for (const zs of [-1, 1]) L.push(at(new THREE.CylinderGeometry(0.005, 0.005, 0.07, 5), 0, 0.63 - zs * 0.015, 0.004, 0, 0, Math.PI / 2)) // 弦轴
  L.push(at(new THREE.BoxGeometry(0.07, 0.022, 0.012), 0, 0.15, 0.036)) // 琴码
  L.push(at(new THREE.BoxGeometry(0.04, 0.12, 0.012), 0, 0.06, 0.03, 0.08)) // 拉弦板
  return finish(L, 0.006, 9, 1)
}
function guitar(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = []
  const sh = bodyShape(0.5, 0.13, 0.17, 0.11)
  const hole = new THREE.Path(); hole.absarc(0, 0.31, 0.045, 0, Math.PI * 2, true); sh.holes.push(hole)
  L.push(ext(sh, 0.09, 0.014, 4))
  L.push(at(new THREE.CylinderGeometry(0.047, 0.047, 0.05, 16, 1, true), 0, 0.31, 0, Math.PI / 2)) // 音孔内壁
  L.push(at(new THREE.BoxGeometry(0.05, 0.46, 0.03), 0, 0.72, 0.02))
  L.push(at(new THREE.BoxGeometry(0.07, 0.15, 0.022), 0, 1.01, 0.012, -0.12))
  L.push(at(new THREE.BoxGeometry(0.11, 0.025, 0.016), 0, 0.12, 0.05)) // 琴桥
  return finish(L, 0.008, 6, 2)
}
function trombone(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = []
  const r = 0.014
  for (const z of [-0.05, 0.05]) L.push(at(new THREE.CylinderGeometry(r, r, 0.78, 8), 0, 0.39, z))
  L.push(at(new THREE.TorusGeometry(0.05, r, 6, 12, Math.PI), 0, 0.78, 0, 0, Math.PI / 2, 0)) // 滑管 U 弯
  L.push(at(new THREE.CylinderGeometry(r * 1.6, r * 1.6, 0.05, 8), 0, 0.03, 0, 0, 0, 0)) // 滑管底撑
  // 喇叭一侧：从顶部向下的管 + 外翻喇叭口
  L.push(at(new THREE.CylinderGeometry(r * 0.95, r * 1.1, 0.5, 8), 0.1, 0.55, 0.05))
  L.push(at(new THREE.TorusGeometry(0.05, r, 6, 12, Math.PI), 0.05, 0.3, 0.05, 0, 0, Math.PI))
  const bell = new THREE.LatheGeometry([0.018, 0.022, 0.03, 0.045, 0.07, 0.1, 0.11].map((x, i) => new THREE.Vector2(x, i * 0.045)), 14)
  L.push(at(bell, 0.1, 0.8, 0.05))
  L.push(at(new THREE.CylinderGeometry(0.012, 0.012, 0.13, 6), 0.05, 0.62, 0.05, 0, 0, Math.PI / 2)) // 横撑
  return finish(L, 0.004, 10, 3)
}
function toilet(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = []
  const bowl = new THREE.LatheGeometry([[0.0, 0], [0.11, 0], [0.12, 0.05], [0.1, 0.2], [0.17, 0.36], [0.19, 0.4], [0.15, 0.41], [0.08, 0.32], [0.0, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)), 18)
  bowl.scale(1, 1, 1.25); L.push(bowl)
  L.push(at(new THREE.TorusGeometry(0.16, 0.025, 6, 20).scale(1, 1.25, 1), 0, 0.42, 0, Math.PI / 2)) // 座圈
  L.push(at(new THREE.BoxGeometry(0.42, 0.36, 0.17), 0, 0.6, -0.27)) // 水箱
  L.push(at(new THREE.BoxGeometry(0.45, 0.04, 0.2), 0, 0.8, -0.27)) // 水箱盖
  L.push(at(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 18).scale(1, 1, 1.25), 0, 0.57, -0.17, -1.35)) // 掀起的马桶盖
  return finish(L, 0.008, 7, 4)
}
function bongo(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = []
  for (const [x, r, h] of [[-0.11, 0.1, 0.2], [0.11, 0.082, 0.19]] as const) {
    L.push(at(new THREE.LatheGeometry([[0, 0], [r * 0.8, 0], [r * 0.85, h * 0.4], [r, h * 0.92], [r * 1.03, h], [0, h]].map(([a, b]) => new THREE.Vector2(a, b)), 16), x, 0, 0))
    L.push(at(new THREE.TorusGeometry(r * 1.02, 0.008, 5, 16), x, h * 0.96, 0, Math.PI / 2)) // 鼓箍
  }
  L.push(at(new THREE.BoxGeometry(0.06, 0.04, 0.05), 0, 0.13, 0)) // 连接块
  return finish(L, 0.005, 9, 5)
}
/** 钟乳石断口——底部（尖端）断掉，断面是卡祖笛笛口那样的扁椭圆凹窝。原点在洞顶，向下长 */
function kazooSpike(): THREE.BufferGeometry {
  const L: THREE.BufferGeometry[] = []
  const prof = [[0.2, 0], [0.16, -0.12], [0.11, -0.32], [0.075, -0.52], [0.045, -0.7], [0.03, -0.78], [0.0, -0.785]]
  const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 18)
  // 断口：底部压成扁椭圆（与笛口截面相同的 0.019 × 0.013）
  const pa = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); if (y < -0.6) { const k = (y + 0.6) / -0.185; pa.setZ(i, pa.getZ(i) * (1 - k * 0.35)); if (y < -0.78) pa.setY(i, -0.775) } }
  g.computeVertexNormals()
  L.push(g)
  for (let i = 0; i < 5; i++) { const a = i * 1.3, r = 0.12 + i * 0.02; L.push(at(new THREE.ConeGeometry(0.03 - i * 0.003, 0.18 + i * 0.05, 7), Math.cos(a) * r, -0.1 - i * 0.02, Math.sin(a) * r, Math.PI)) } // 周围的小石钉
  return finish(L, 0.01, 6, 6)
}
/** 风铃：石圆盘 + 石链 + 六根长短不一的石管。返回组，石管单独成组（rods）以便渲染层摆动；原点在挂点 */
export function buildStoneWindchime(mat: THREE.Material): THREE.Group {
  const grp = new THREE.Group(); grp.name = 'stoneWindchime'
  const L: THREE.BufferGeometry[] = []
  // 主链：五节相互垂直的链环
  for (let i = 0; i < 5; i++) L.push(at(new THREE.TorusGeometry(0.022, 0.006, 5, 10), 0, -0.03 - i * 0.034, 0, 0, i % 2 ? Math.PI / 2 : 0))
  L.push(at(new THREE.CylinderGeometry(0.16, 0.17, 0.035, 16), 0, -0.2, 0))
  grp.add(new THREE.Mesh(finish(L, 0.004, 12, 7), mat))
  const rods: THREE.Object3D[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, len = 0.32 + ((i * 37) % 7) * 0.05
    const pivot = new THREE.Group(); pivot.position.set(Math.cos(a) * 0.12, -0.22, Math.sin(a) * 0.12); grp.add(pivot)
    const R: THREE.BufferGeometry[] = []
    for (let k = 0; k < 2; k++) R.push(at(new THREE.TorusGeometry(0.01, 0.003, 4, 8), 0, -0.012 - k * 0.016, 0, 0, k ? Math.PI / 2 : 0)) // 细链
    R.push(at(new THREE.CylinderGeometry(0.022, 0.022, len, 8, 3, true), 0, -0.04 - len / 2, 0))
    pivot.add(new THREE.Mesh(finish(R, 0.003, 14, 8 + i), mat)); rods.push(pivot)
  }
  grp.userData.rods = rods
  return grp
}

const CACHE = new Map<StoneInstrumentKind, THREE.BufferGeometry>()
/** 单件石乐器（风铃请用 buildStoneWindchime）。几何按种类缓存共享。 */
export function stoneInstrumentGeometry(kind: Exclude<StoneInstrumentKind, 'windchime'>): THREE.BufferGeometry {
  const hit = CACHE.get(kind); if (hit) return hit
  const g = kind === 'violin' ? violin() : kind === 'guitar' ? guitar() : kind === 'trombone' ? trombone() : kind === 'toilet' ? toilet() : kind === 'bongo' ? bongo() : kazooSpike()
  CACHE.set(kind, g); return g
}
