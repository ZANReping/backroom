import { foyerWallBlocks } from '../world/foyerLayout'
// 前厅（序章）光照烘焙：关卡构建时在 CPU 上一次性预计算（分帧 yield，不阻塞主线程过久）。
//  · 墙/地/顶（「壳体」平面）→ 光照贴图图集（HalfFloat，~6cm 纹素），含软阴影、AO、间接光与轻微脏污/磨损；
//  · 家具与陈设 → 逐顶点辐照度（vec4 属性 foyerIrr，w=2 表示已烘焙）。
// 烘焙灯（吸顶灯等，keep≠1）的漫反射完全来自烘焙结果；运行时同一盏点光只保留镜面高光
// （复用 l0StaticPointMask 掩码），因此经典光影下也不会穿墙漏光。
// 台灯/落地灯/吊灯为「实时灯」（keep=1、occluded=1）：直接光实时计算并投射点光阴影，间接光仍参与烘焙。
// 楼道声控灯：直接光实时（玩法控制开关）；其间接光单独烘焙进一个标量通道（光照贴图 alpha / foyerIrr.w−2），
// 着色器里乘以 uniform foyerCorridorIrr（= 灯色 × 当前亮度乘子），因此可随 M2 声控灯亮灭整体缩放，
// 见 FoyerScene.setCorridorLightLevel 与 PROLOGUE-FOYER.md「合并 M2」。
// 间接光：按房间估算一次反弹后写入 0.25 m 探针网格，沿开放边界（客厅↔厨房/玄关、门洞）做受墙体约束的扩散，
// 采样时双线性插值——开放空间交界处不再出现台阶状突变。
import * as THREE from 'three'
import type { GameMap } from '../world/mapgen'
import type { LightSource } from '../core/types'
import { FOYER_CEIL, FOYER_DOOR_H, FOYER_PROPS, FOYER_ROOMS, FOYER_WINDOWS, foyerRoomAt, type FoyerRoomId } from '../world/foyerLayout'
import { l0StaticPointMask } from './l0PointMask'
import { alphaBakeOverride } from './alphaBakedLighting'

const H = FOYER_CEIL
/** 与 renderer 点光池一致：intensity = 12 × (1 − darkness×0.35) × intensityMul，decay=1.6，distance=r×2.6。 */
const POOL_BASE = 12 * (1 - 0.02 * 0.35), POOL_DECAY = 1.6
const TEXEL = 0.06

// ---------------------------------------------------------------- 灯光配置（按灯具角色）
export type FoyerLightRole = 'ceiling' | 'desklamp' | 'floorlamp' | 'pendant' | 'stair'
interface RoleCfg { mul: number; r: number; color?: string; live: boolean; down: number }
/** 夜间 23:40：吸顶灯调暗（烘焙），台灯/落地灯/吊灯为实时暖光并投影；楼道冷白灯由玩法控制。 */
const ROLE: Record<FoyerLightRole, RoleCfg> = {
  ceiling: { mul: 0.4, r: 3.4, live: false, down: 0.6 }, // 吸顶灯乳白灯罩侧面也透光：吊顶灯周围应有柔和亮晕
  // 台灯：由 FoyerScene 的实时聚光灯（带阴影，灯罩向下）替代，池内点光强度置 0；间接光仍按向下配光烘焙
  desklamp: { mul: 0, r: 1.35, color: '#ffc985', live: false, down: 0.95 },
  floorlamp: { mul: 0.3, r: 1.7, color: '#ffbe78', live: true, down: 0.3 },
  pendant: { mul: 0.3, r: 2.0, color: '#ffcf96', live: false, down: 0.92 },
  stair: { mul: 1, r: 0, live: true, down: 0 },
}
function roleOf(L: LightSource): FoyerLightRole {
  const room = foyerRoomAt(L.x, L.y)
  if (room?.id === 'stair') return 'stair'
  let best: FoyerLightRole = 'ceiling', bd = 0.6
  for (const p of FOYER_PROPS) {
    const role = p.kind === 'desklamp' ? 'desklamp' : p.kind === 'floorlamp' ? 'floorlamp' : p.kind === 'pendant' ? 'pendant' : null
    if (!role) continue
    const d = Math.hypot(p.x - L.x, p.y - L.y)
    if (d < bd) { bd = d; best = role }
  }
  return best
}
const tuned = new WeakSet<LightSource>()
/** 漫反射已烘焙的灯（renderer 据此设置 l0Baked 掩码：实时只保留高光）。 */
export const foyerBakedLights = new WeakSet<LightSource>()
/** 构建前调用：按角色调整地图灯光（强度/射程/色温，实时灯标记 keep+occluded）。返回烘焙用灯表。 */
export function prepareFoyerLights(m: GameMap): BakeLight[] {
  const out: BakeLight[] = []
  for (const L of m.lights) {
    // M3：街区（门厅/小区/街道/后巷）的灯由 foyerStreet 控制、实时照明，不参与家中烘焙也不改参数
    if (!foyerRoomAt(L.x, L.y)) continue
    const role = roleOf(L)
    if (role === 'stair') {
      // 楼道声控灯：直接光保持实时（玩法控制开关），只调色温/强度；只把它的冷白光计入楼道的间接光估算，
      // 否则吊顶/墙角只剩最低环境量（灯在吊顶下方，吊顶几乎收不到直接光）。
      if (!tuned.has(L)) { L.color = '#d6e2f0'; tuned.add(L) } // 冷白荧光（≈6500K）；亮度由 FoyerScene.setCorridorLightLevel 按 baseMul(0.3) × level 写入（M2 声控灯初始熄灭，intensityMul 可能为 0，不能拿来当基准）
      const c = new THREE.Color(L.color)
      foyerCorridor.light = L
      foyerCorridor.color.set(c.r, c.g, c.b)
      // 烘焙按 level=1（baseMul）计算；着色器再乘 foyerCorridorIrr（含灯色），因此这里颜色记为 1
      out.push({ p: [L.x, (L.fixZ ?? H) - 0.2, L.y], color: [1, 1, 1], I: POOL_BASE * foyerCorridor.baseMul, cutoff: L.r * 2.6, radius: 0.1, direct: false, down: 0.5, room: 'stair', corridor: true })
      continue
    }
    const cfg = ROLE[role]
    if (!tuned.has(L)) {
      // 卫生间白砖反照率高：吸顶灯略低于其他房间，避免整面白墙发闷过亮
      L.intensityMul = role === 'ceiling' && foyerRoomAt(L.x, L.y)?.id === 'bath' ? cfg.mul * 0.85 : cfg.mul
      L.r = cfg.r
      if (cfg.color) L.color = cfg.color
      if (cfg.live) { L.keep = 1; L.occluded = 1 }
      if (role === 'pendant') L.fixZ = 2.25 // 光源点移入灯罩内（≈灯泡高度）
      tuned.add(L)
    }
    if (!cfg.live) foyerBakedLights.add(L)
    const c = new THREE.Color(L.color)
    const y = (L.fixZ ?? H) - 0.2
    if (role === 'desklamp') { // 聚光灯在运行时提供直接光；这里只参与间接光估算
      const lamp = foyerDeskLamp()
      if (lamp) out.push({ p: [lamp.pos.x, lamp.pos.y, lamp.pos.z], color: [c.r, c.g, c.b], I: lamp.intensity, cutoff: 4, radius: 0.03, direct: false, down: 0.95, room: 'bedroom' })
      continue
    }
    out.push({ p: [L.x, y, L.y], color: [c.r, c.g, c.b], I: POOL_BASE * (L.intensityMul ?? 1), cutoff: L.r * 2.6, radius: role === 'ceiling' ? 0.18 : role === 'pendant' ? 0.08 : 0.06, direct: !cfg.live, down: cfg.down, room: foyerRoomAt(L.x, L.y)?.id })
  }
  return out
}

/** 台灯灯泡世界坐标（与 foyerHome desklamp 模型一致：局部 (0.23, 0.76+0.47, 0)）。 */
export function foyerDeskLamp(): { pos: THREE.Vector3; dir: THREE.Vector3; intensity: number } | null {
  const p = FOYER_PROPS.find((v) => v.kind === 'desklamp')
  if (!p) return null
  const m = new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (p.rot * Math.PI) / 180, 0)), new THREE.Vector3(1, 1, 1))
  const pos = new THREE.Vector3(0.23, 0.76 + 0.47, 0).applyMatrix4(m)
  const dir = new THREE.Vector3(0.48, -0.88, 0).transformDirection(m)
  return { pos, dir, intensity: 5.2 }
}

export interface BakeLight { p: [number, number, number]; color: [number, number, number]; I: number; cutoff: number; radius: number; direct: boolean; down: number; room?: FoyerRoomId
  /** 楼道声控灯：间接光烘焙进独立标量通道（可运行时缩放）。 */
  corridor?: boolean }

/** 楼道声控灯登记：烘焙时的强度乘子（=亮度 1）与线性灯色。运行时 foyerCorridorIrr = color × level。 */
export const foyerCorridor = {
  light: null as LightSource | null,
  baseMul: 0.3,
  color: new THREE.Vector3(0.68, 0.76, 0.86),
}
/** 着色器 uniform：楼道灯间接光颜色 × 当前亮度（FoyerScene.update 每帧同步）。 */
export const foyerCorridorIrr = { value: new THREE.Vector3(0.68, 0.76, 0.86) }
interface AreaLight { c: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3; n: THREE.Vector3; L: [number, number, number] }
interface Box { a: [number, number, number]; b: [number, number, number] }

// ---------------------------------------------------------------- 遮挡体
class Occluders {
  boxes: Box[] = []
  private grid = new Map<number, number[]>()
  private stamp: Int32Array = new Int32Array(0)
  private tick = 0
  add(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) { this.boxes.push({ a: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], b: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)] }) }
  build() {
    this.stamp = new Int32Array(this.boxes.length)
    this.boxes.forEach((b, i) => {
      for (let gz = Math.floor(b.a[2]); gz <= Math.floor(b.b[2] - 1e-6); gz++) for (let gx = Math.floor(b.a[0]); gx <= Math.floor(b.b[0] - 1e-6); gx++) {
        const k = gz * 64 + gx
        let arr = this.grid.get(k); if (!arr) { arr = []; this.grid.set(k, arr) } arr.push(i)
      }
    })
  }
  /** 线段 P→Q 是否被遮挡（端点在盒内的盒子忽略：自身遮挡/灯罩内光源）。 */
  blocked(px: number, py: number, pz: number, qx: number, qy: number, qz: number): boolean {
    return this.hit(px, py, pz, qx - px, qy - py, qz - pz, 1, true) < 1
  }
  /** 射线 t∈[0,tmax] 的最近命中参数（未命中返回 Infinity）。anyHit=true 时首个命中即返回。 */
  hit(px: number, py: number, pz: number, dx: number, dy: number, dz: number, tmax: number, anyHit = false): number {
    this.tick++
    const ex = px + dx * tmax, ez = pz + dz * tmax
    const gx0 = Math.floor(Math.min(px, ex)), gx1 = Math.floor(Math.max(px, ex)), gz0 = Math.floor(Math.min(pz, ez)), gz1 = Math.floor(Math.max(pz, ez))
    let best = Infinity
    const ix = 1 / (dx || 1e-12), iy = 1 / (dy || 1e-12), iz = 1 / (dz || 1e-12)
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const arr = this.grid.get(gz * 64 + gx); if (!arr) continue
      for (const bi of arr) {
        if (this.stamp[bi] === this.tick) continue
        this.stamp[bi] = this.tick
        const b = this.boxes[bi]
        if (px > b.a[0] && px < b.b[0] && py > b.a[1] && py < b.b[1] && pz > b.a[2] && pz < b.b[2]) continue
        let t0 = 0, t1 = tmax
        let ta = (b.a[0] - px) * ix, tb = (b.b[0] - px) * ix
        if (ta > tb) { const s = ta; ta = tb; tb = s }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue
        ta = (b.a[1] - py) * iy; tb = (b.b[1] - py) * iy
        if (ta > tb) { const s = ta; ta = tb; tb = s }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue
        ta = (b.a[2] - pz) * iz; tb = (b.b[2] - pz) * iz
        if (ta > tb) { const s = ta; ta = tb; tb = s }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) continue
        // 终点在盒内（光源位于灯罩/家具包围盒内）也视为可见
        if (anyHit && t1 >= tmax - 1e-6) { const qx = px + dx * tmax, qy = py + dy * tmax, qz = pz + dz * tmax; if (qx > b.a[0] && qx < b.b[0] && qy > b.a[1] && qy < b.b[1] && qz > b.a[2] && qz < b.b[2]) continue }
        if (t0 < best) { best = t0; if (anyHit) return best }
      }
    }
    return best
  }
}

/** 家具遮挡的竖向范围（null=不遮挡：贴墙平面、透明玻璃、细小物件）。 */
const VR: Record<string, [number, number] | null | 'top'> = {
  rug: null, rug2: null, doormat: null, poster: null, poster2: null, framedart: null, flyers: null, wallclock: null,
  ceilinglamp: null, stairlamp: null, pendant: null, intercom: null, mirror: null, towel: null, phonedock: null, desklamp: null, deskdrawer: null,
  sink: null, stove: null, kettle: null, umbrella: null, barrier: null, floorlamp: null, shower: null, tv: [0.98, 1.75], computer: [0.95, 1.15],
  coathook: [0.85, 1.85], uppercab: [1.5, 2.22], hood: [1.68, 1.8], microwave: [0.92, 1.2], meterbox: [1.0, 1.9], mailboxes: [0.9, 1.6],
  deskchair: [0.4, 0.95], desk: [0.73, 0.76], diningtable: [0.72, 0.755], coffeetable: [0.38, 0.42], chair: [0.44, 0.85], stool: [0.62, 0.7],
  sidetable: [0.53, 0.555], bed: [0.08, 0.55], sofa: [0.08, 0.82], toilet: [0, 0.8], vanity: [0.25, 0.88], washer: [0, 0.86], counter: [0.1, 0.92],
  island: [0.1, 0.92], fridge: [0, 1.86], wardrobe: [0, 2.2], figshelf: [0, 1.85], bookcase: [0, 2.0], shoecab: [0.08, 1.03], armchair: [0.12, 0.8],
  plant: 'top', laundry: [0, 0.5], nightstand: [0.04, 0.54], tvstand: [0.08, 0.5],
}

// ---------------------------------------------------------------- 烘焙器
export class FoyerBaker {
  occ = new Occluders()
  lights: BakeLight[]
  areas: AreaLight[] = []
  /** 每个房间的一次反弹间接辐照度（线性 RGB；不含楼道灯）。 */
  bounce = new Map<string, [number, number, number]>()
  /** 每个房间来自楼道灯的一次反弹（标量，×foyerCorridorIrr）。 */
  bounceCorr = new Map<string, number>()
  /** 只含墙体（外墙/隔墙/过梁）的遮挡体：探针扩散与插值的连通判定。 */
  walls = new Occluders()
  /** 直接光筛选：0=全部，1=不含楼道灯，2=只含楼道灯。 */
  private filter: 0 | 1 | 2 = 1
  // 探针网格（0.25 m）：rgb + 楼道标量；room 为 -1 表示墙内/户外
  private PG = 0.25
  private gw = 0
  private gh = 0
  private probe = new Float32Array(0)
  private probeRoom = new Int8Array(0)
  constructor(m: GameMap, lights: BakeLight[]) {
    this.lights = lights
    const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
    // M3 起地图扩为 160×160（家 + 街区）：烘焙只覆盖家中房间外接框（+2 格墙体余量），街区不参与遮挡/探针
    const hw = Math.min(m.w, Math.ceil(Math.max(...FOYER_ROOMS.map((r) => r.x1))) + 2)
    const hh = Math.min(m.h, Math.ceil(Math.max(...FOYER_ROOMS.map((r) => r.y1))) + 2)
    // 外墙：与地板相邻的非地板瓦片 → 实心立方
    for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
      if (isFloor(x, y)) continue
      let near = false
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (isFloor(x + dx, y + dy)) { near = true; break }
      if (near) { this.occ.add(x, -0.2, y, x + 1, H + 0.2, y + 1); this.walls.add(x, -0.2, y, x + 1, H + 0.2, y + 1) }
    }
    // 防盗门门洞上方墙体（瓦片 5,14 为地板）
    this.occ.add(5, FOYER_DOOR_H + 0.06, 14, 6, H + 0.2, 15); this.walls.add(5, FOYER_DOOR_H + 0.06, 14, 6, H + 0.2, 15)
    // Shared closed wall volumes: joins/headers match rendered geometry and collision.
    for (const b of foyerWallBlocks()) for (const o of [this.occ,this.walls])
      o.add(b.x0,b.bottom===0?-.2:b.bottom,b.y0,b.x1,b.top+.2,b.y1)

    // 家具
    for (const p of FOYER_PROPS) {
      const vr = VR[p.kind]
      if (vr === null) continue
      const [y0, y1] = vr === 'top' || vr === undefined ? [0, Math.max(0.05, p.top)] : vr
      const sh = vr === 'top' ? 0.3 : 0 // 植物：收窄成「树冠」近似
      this.occ.add(p.x - p.w / 2 + p.w * sh, y0, p.y - p.d / 2 + p.d * sh, p.x + p.w / 2 - p.w * sh, y1, p.y + p.d / 2 - p.d * sh)
      if (p.kind === 'bed') { const back = p.y - p.d / 2; this.occ.add(p.x - p.w / 2, 0, back, p.x + p.w / 2, 0.95, back + 0.06) }
    }
    this.occ.build()
    this.walls.build()
    this.gw = Math.ceil(hw / this.PG); this.gh = Math.ceil(hh / this.PG)
    // 窗：冷色城市夜光（面光源，朝室内）
    for (const w of FOYER_WINDOWS) {
      const len = w.b - w.a, mid = (w.a + w.b) / 2, hh = w.top - w.sill, cy = w.sill + hh / 2
      const city: [number, number, number] = w.view === 'cityLow' ? [0.075, 0.095, 0.15] : [0.06, 0.078, 0.13]
      if (w.side === 'n') this.areas.push({ c: new THREE.Vector3(mid, cy, w.at + 0.02), u: new THREE.Vector3(len / 2, 0, 0), v: new THREE.Vector3(0, hh / 2, 0), n: new THREE.Vector3(0, 0, 1), L: city })
      if (w.side === 's') this.areas.push({ c: new THREE.Vector3(mid, cy, w.at - 0.02), u: new THREE.Vector3(len / 2, 0, 0), v: new THREE.Vector3(0, hh / 2, 0), n: new THREE.Vector3(0, 0, -1), L: city })
      if (w.side === 'e') this.areas.push({ c: new THREE.Vector3(w.at - 0.02, cy, mid), u: new THREE.Vector3(0, 0, len / 2), v: new THREE.Vector3(0, hh / 2, 0), n: new THREE.Vector3(-1, 0, 0), L: city })
      if (w.side === 'w') this.areas.push({ c: new THREE.Vector3(w.at + 0.02, cy, mid), u: new THREE.Vector3(0, 0, len / 2), v: new THREE.Vector3(0, hh / 2, 0), n: new THREE.Vector3(1, 0, 0), L: city })
    }
    // 屏幕：电脑显示器（朝 +x）、电视（朝 −x）——冷白屏光
    const pc = FOYER_PROPS.find((p) => p.kind === 'computer')
    if (pc) this.areas.push({ c: new THREE.Vector3(pc.x + 0.01, 0.76 + 0.385, pc.y), u: new THREE.Vector3(0, 0, 0.3), v: new THREE.Vector3(0, 0.17, 0), n: new THREE.Vector3(1, 0, 0), L: [0.55, 0.62, 0.78] })
    const tv = FOYER_PROPS.find((p) => p.kind === 'tv')
    if (tv) this.areas.push({ c: new THREE.Vector3(tv.x - tv.w / 2 - 0.03, 1.0 + tv.d * 9 / 32, tv.y), u: new THREE.Vector3(0, 0, tv.d / 2), v: new THREE.Vector3(0, tv.d * 9 / 32, 0), n: new THREE.Vector3(-1, 0, 0), L: [0.1, 0.13, 0.2] })
  }

  /** 点 p（法线 n）处的直接辐照度（线性，Three.js 光照单位）。includeLive=只用于间接估算。 */
  direct(px: number, py: number, pz: number, nx: number, ny: number, nz: number, seed: number, samples: number, out: number[], includeLive = false) {
    let r = 0, g = 0, b = 0
    const ox = px + nx * 0.015, oy = py + ny * 0.015, oz = pz + nz * 0.015
    const f = this.filter
    for (const L of this.lights) {
      if (f === 1 && L.corridor || f === 2 && !L.corridor) continue
      if (!L.direct && !includeLive) continue
      const dx = L.p[0] - ox, dy = L.p[1] - oy, dz = L.p[2] - oz
      const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2)
      if (d > L.cutoff) continue
      const ndl = (dx * nx + dy * ny + dz * nz) / d
      if (ndl <= 0) continue
      const k = Math.max(0, 1 - (d / L.cutoff) ** 4)
      const att = (k * k) / Math.max(Math.pow(d, POOL_DECAY), 0.01)
      // 灯具配光：吸顶灯/灯罩主要向下发光
      const down = -dy / d // 光→点方向的 y 分量为 −dy/d
      const prof = 1 - L.down + L.down * Math.max(0, Math.min(1, down * 1.4 + 0.15))
      const e0 = L.I * ndl * att * prof
      if (e0 < 0.004) continue // 贡献可忽略：跳过阴影射线
      let vis = 0
      const n = d < 0.35 ? 1 : samples
      for (let s = 0; s < n; s++) {
        const a = (s + 0.5) / n * 6.283 + seed * 2.39996, rr = n === 1 ? 0 : L.radius * Math.sqrt((s + 0.5) / n)
        const qx = L.p[0] + Math.cos(a) * rr, qz = L.p[2] + Math.sin(a) * rr, qy = L.p[1] - (s % 2 ? 0.03 : 0)
        if (!this.occ.blocked(ox, oy, oz, qx, qy, qz)) vis++
      }
      if (!vis) continue
      const e = e0 * (vis / n)
      r += e * L.color[0]; g += e * L.color[1]; b += e * L.color[2]
    }
    // 面光源（窗/屏幕）
    if (f !== 2) for (const A of this.areas) {
      const cx = A.c.x - ox, cy = A.c.y - oy, cz = A.c.z - oz, cd2 = cx * cx + cy * cy + cz * cz
      if (cd2 > 49) continue // 面光源 7m 外贡献可忽略
      if (cx * A.n.x + cy * A.n.y + cz * A.n.z > 0.05) continue // 位于面光源背面
      const ns = samples >= 3 ? 4 : 2
      for (let s = 0; s < ns; s++) {
        const su = ((s % 2) + 0.5) / 2 * 2 - 1 + (hash(seed + s * 7.1) - 0.5) * 0.5, sv = (Math.floor(s / 2) + 0.5) / Math.ceil(ns / 2) * 2 - 1 + (hash(seed * 3.3 + s) - 0.5) * 0.5
        const qx = A.c.x + A.u.x * su + A.v.x * sv, qy = A.c.y + A.u.y * su + A.v.y * sv, qz = A.c.z + A.u.z * su + A.v.z * sv
        const dx = qx - ox, dy = qy - oy, dz = qz - oz
        const d2 = dx * dx + dy * dy + dz * dz, d = Math.sqrt(d2)
        const cr = (dx * nx + dy * ny + dz * nz) / d, ce = -(dx * A.n.x + dy * A.n.y + dz * A.n.z) / d
        if (cr <= 0 || ce <= 0) continue
        if (this.occ.blocked(ox, oy, oz, qx, qy, qz)) continue
        const area = 4 * A.u.length() * A.v.length()
        const e = (area / ns) * cr * ce / Math.max(d2, 0.04)
        r += e * A.L[0]; g += e * A.L[1]; b += e * A.L[2]
      }
    }
    out[0] = r; out[1] = g; out[2] = b
  }

  /** 环境遮蔽（余弦加权半球，含地面/吊顶平面）。返回 0..1（1=无遮挡）。 */
  ao(px: number, py: number, pz: number, nx: number, ny: number, nz: number, seed: number, rays: number, len = 0.75): number {
    // 构造切线基
    const ax = Math.abs(ny) < 0.9 ? 0 : 1, ay = Math.abs(ny) < 0.9 ? 1 : 0 // a×n
    let tx = ay * nz, ty = -ax * nz, tz = ax * ny - ay * nx
    const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl
    const bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx
    const ox = px + nx * 0.02, oy = py + ny * 0.02, oz = pz + nz * 0.02
    let occ = 0
    for (let i = 0; i < rays; i++) {
      const u1 = (i + hash(seed + i * 1.7)) / rays, u2 = hash(seed * 1.3 + i * 5.1)
      const rr = Math.sqrt(u1), phi = 6.2831853 * u2
      const lx = rr * Math.cos(phi), ly = rr * Math.sin(phi), lz = Math.sqrt(Math.max(0, 1 - u1))
      const dx = tx * lx + bx * ly + nx * lz, dy = ty * lx + by * ly + ny * lz, dz = tz * lx + bz * ly + nz * lz
      let t = this.occ.hit(ox, oy, oz, dx, dy, dz, len)
      if (dy < -1e-4) t = Math.min(t, (0 - oy) / dy)
      if (dy > 1e-4) t = Math.min(t, (H - oy) / dy)
      if (t < len) occ += 1 - t / len
    }
    return 1 - occ / rays
  }

  /** 按房间估算一次反弹：房间壳体平均直接辐照度 × 平均反照率 /(1−ρ)，再写入探针网格并沿开放边界扩散。 */
  estimateBounce() {
    // 反照率按房间主材（浅色漆墙 + 木地板/白砖）；k 中的 1.08 近似二次以上反弹
    const albedo: Record<string, number> = { bedroom: 0.5, bath: 0.6, kitchen: 0.52, living: 0.5, entry: 0.5, stair: 0.42 }
    // 间接光被房间主材染色：木地板房间偏暖，楼道偏冷
    const tint: Record<string, [number, number, number]> = { bedroom: [1.06, 1, 0.9], bath: [1, 1, 1], kitchen: [1.04, 1, 0.93], living: [1.07, 1, 0.9], entry: [1.06, 1, 0.91], stair: [0.97, 1, 1.03] }
    const tmp = [0, 0, 0]
    const gather = (r: (typeof FOYER_ROOMS)[number]) => {
      const acc: [number, number, number, number] = [0, 0, 0, 0]
      const add = () => { acc[0] += tmp[0]; acc[1] += tmp[1]; acc[2] += tmp[2]; acc[3]++ }
      // 采样：地面网格 + 吊顶 + 四周墙面 0.6/1.6 m 高处
      for (let z = r.y0 + 0.25; z < r.y1; z += 0.5) for (let x = r.x0 + 0.25; x < r.x1; x += 0.5) {
        this.direct(x, 0, z, 0, 1, 0, x * 13 + z, 1, tmp, true); add()
        this.direct(x, H, z, 0, -1, 0, x * 7 + z, 1, tmp, true); add()
      }
      for (let x = r.x0 + 0.25; x < r.x1; x += 0.5) for (const [z, nz] of [[r.y0 + 0.07, 1], [r.y1 - 0.07, -1]] as const) for (const y of [0.6, 1.6]) { this.direct(x, y, z, 0, 0, nz, x + y, 1, tmp, true); add() }
      for (let z = r.y0 + 0.25; z < r.y1; z += 0.5) for (const [x, nx] of [[r.x0 + 0.07, 1], [r.x1 - 0.07, -1]] as const) for (const y of [0.6, 1.6]) { this.direct(x, y, z, nx, 0, 0, z + y, 1, tmp, true); add() }
      return acc
    }
    const k = (id: string) => 1.08 * albedo[id] / (1 - albedo[id])
    const raw = new Map<string, [number, number, number]>(), rawC = new Map<string, number>()
    for (const r of FOYER_ROOMS) {
      this.filter = 1; const a = gather(r)
      this.filter = 2; const c = gather(r)
      const kk = k(r.id)
      raw.set(r.id, [a[0] / a[3] * kk, a[1] / a[3] * kk, a[2] / a[3] * kk])
      rawC.set(r.id, c[1] / c[3] * kk) // 楼道灯颜色记为 1：取 G 通道即标量
    }
    this.filter = 1
    // 门洞外的少量互渗（开放边界由探针扩散处理，这里只保留门洞/远距的整体渗入）
    const link: Record<string, [string, number][]> = { living: [['kitchen', 0.12], ['entry', 0.06]], kitchen: [['living', 0.18]], entry: [['living', 0.12]], bedroom: [['living', 0.05]], bath: [['living', 0.04]], stair: [] }
    for (const r of FOYER_ROOMS) {
      const e = [...raw.get(r.id)!] as [number, number, number]
      let ec = rawC.get(r.id)!
      for (const [o, w] of link[r.id] ?? []) { const v = raw.get(o as FoyerRoomId)!; e[0] += v[0] * w; e[1] += v[1] * w; e[2] += v[2] * w; ec += rawC.get(o)! * w }
      // 最低环境量：夜间城市漫射 + 设备待机光，避免死黑（楼道灯熄灭时楼道只剩这一点）
      const floorK = r.id === 'stair' ? 0.01 : 0.024
      const t = tint[r.id]
      this.bounce.set(r.id, [Math.max(e[0], floorK * 0.85) * t[0], Math.max(e[1], floorK * 0.9) * t[1], Math.max(e[2], floorK) * t[2]])
      this.bounceCorr.set(r.id, ec)
    }
    this.buildProbes()
  }

  /** 探针网格：每格取所在房间的反弹值，再做受墙体约束的扩散（≈24 次 5 点平均，过渡带半宽 ≈0.8 m）。 */
  private buildProbes() {
    const { gw, gh, PG } = this
    const ids = FOYER_ROOMS.map((r) => r.id)
    const val = new Float32Array(gw * gh * 4), room = new Int8Array(gw * gh).fill(-1)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const x = (i + 0.5) * PG, z = (j + 0.5) * PG
      const r = foyerRoomAt(x, z)
      if (!r || x <= r.x0 || x >= r.x1 || z <= r.y0 || z >= r.y1) continue
      const b = this.bounce.get(r.id)!, k = (j * gw + i) * 4
      val[k] = b[0]; val[k + 1] = b[1]; val[k + 2] = b[2]; val[k + 3] = this.bounceCorr.get(r.id) ?? 0
      room[j * gw + i] = ids.indexOf(r.id)
    }
    // 4 邻接连通（1.2 m 高处线段不穿墙）：右、下
    const linkR = new Uint8Array(gw * gh), linkD = new Uint8Array(gw * gh)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const c = j * gw + i
      if (room[c] < 0) continue
      const x = (i + 0.5) * PG, z = (j + 0.5) * PG
      if (i + 1 < gw && room[c + 1] >= 0) linkR[c] = room[c + 1] === room[c] || !this.walls.blocked(x, 1.2, z, x + PG, 1.2, z) ? 1 : 0
      if (j + 1 < gh && room[c + gw] >= 0) linkD[c] = room[c + gw] === room[c] || !this.walls.blocked(x, 1.2, z, x, 1.2, z + PG) ? 1 : 0
    }
    let cur = val, nxt = new Float32Array(val.length)
    for (let it = 0; it < 24; it++) {
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const c = j * gw + i, k = c * 4
        if (room[c] < 0) continue
        let n = 1, r = cur[k], g = cur[k + 1], b = cur[k + 2], a = cur[k + 3]
        const addN = (o: number) => { const q = o * 4; r += cur[q]; g += cur[q + 1]; b += cur[q + 2]; a += cur[q + 3]; n++ }
        if (linkR[c]) addN(c + 1)
        if (i > 0 && linkR[c - 1]) addN(c - 1)
        if (linkD[c]) addN(c + gw)
        if (j > 0 && linkD[c - gw]) addN(c - gw)
        nxt[k] = r / n; nxt[k + 1] = g / n; nxt[k + 2] = b / n; nxt[k + 3] = a / n
      }
      const t = cur; cur = nxt; nxt = t
    }
    this.probe = cur; this.probeRoom = room
  }

  /** 间接辐照度：探针双线性插值（只取与采样点连通的格；表面点沿法线外移 5 cm 再判定）。out=[r,g,b,楼道标量]。 */
  indirect(px: number, py: number, pz: number, nx: number, nz: number, out: number[]) {
    const { gw, gh, PG } = this
    const qx = px + nx * 0.05, qz = pz + nz * 0.05
    const room = foyerRoomAt(qx, qz) ?? FOYER_ROOMS.find((r) => r.id === 'entry')!
    const ri = FOYER_ROOMS.indexOf(room)
    const fx = qx / PG - 0.5, fz = qz / PG - 0.5
    const i0 = Math.floor(fx), j0 = Math.floor(fz), tx = fx - i0, tz = fz - j0
    let w = 0, r = 0, g = 0, b = 0, a = 0
    for (let dj = 0; dj <= 1; dj++) for (let di = 0; di <= 1; di++) {
      const i = i0 + di, j = j0 + dj
      if (i < 0 || j < 0 || i >= gw || j >= gh) continue
      const c = j * gw + i
      if (this.probeRoom[c] < 0) continue
      if (this.probeRoom[c] !== ri && this.walls.blocked(qx, Math.min(Math.max(py, 0.1), H - 0.1), qz, (i + 0.5) * PG, 1.2, (j + 0.5) * PG)) continue
      const wt = (di ? tx : 1 - tx) * (dj ? tz : 1 - tz) + 1e-4, k = c * 4
      r += this.probe[k] * wt; g += this.probe[k + 1] * wt; b += this.probe[k + 2] * wt; a += this.probe[k + 3] * wt; w += wt
    }
    if (w > 0) { out[0] = r / w; out[1] = g / w; out[2] = b / w; out[3] = a / w; return }
    const v = this.bounce.get(room.id) ?? [0.02, 0.02, 0.02]
    out[0] = v[0]; out[1] = v[1]; out[2] = v[2]; out[3] = this.bounceCorr.get(room.id) ?? 0
  }

  /** 单点总辐照度（直接 + AO × 间接）。 */
  private ind = [0, 0, 0, 0]
  /** out[0..2]=辐照度（不含楼道灯），out[3]=楼道灯间接光标量。 */
  sample(px: number, py: number, pz: number, nx: number, ny: number, nz: number, seed: number, shadowSamples: number, aoRays: number, out: number[]) {
    this.direct(px, py, pz, nx, ny, nz, seed, shadowSamples, out)
    const ao = this.ao(px, py, pz, nx, ny, nz, seed, aoRays)
    const ind = this.ind
    this.indirect(px, py, pz, nx, nz, ind)
    // 间接光朝上的面（地面）略强于朝下的面（吊顶下方多为暗色家具/地面反射）
    const dirK = 0.93 + 0.12 * ny
    const k = (0.25 + 0.75 * ao) * dirK
    out[0] += ind[0] * k; out[1] += ind[1] * k; out[2] += ind[2] * k; out[3] = ind[3] * k
    return ao
  }
}

function hash(n: number): number { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi
  const h = (a: number, b: number) => hash(a * 57.3 + b * 113.9)
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  return (h(xi, yi) * (1 - sx) + h(xi + 1, yi) * sx) * (1 - sy) + (h(xi, yi + 1) * (1 - sx) + h(xi + 1, yi + 1) * sx) * sy
}

// ---------------------------------------------------------------- 光照贴图图集（壳体平面）
export interface ShellChart { geo: THREE.BufferGeometry; mat: THREE.Material; kind: 'floor' | 'wall' | 'ceiling' }
interface Placed { chart: ShellChart; o: THREE.Vector3; ua: THREE.Vector3; va: THREE.Vector3; n: THREE.Vector3; u0: number; v0: number; du: number; dv: number; w: number; h: number; x: number; y: number }

export const foyerLightmap = { value: null as THREE.Texture | null }

export function* bakeShell(baker: FoyerBaker, charts: ShellChart[]): Generator<void, THREE.DataTexture, unknown> {
  // 1) 切线系与尺寸
  const placed: Placed[] = []
  for (const c of charts) {
    const pos = c.geo.getAttribute('position'), nor = c.geo.getAttribute('normal')
    const n = new THREE.Vector3(nor.getX(0), nor.getY(0), nor.getZ(0)).normalize()
    const ax = Math.abs(n.x), ay = Math.abs(n.y)
    const ua = ay > 0.9 ? new THREE.Vector3(1, 0, 0) : ax > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
    const va = ay > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    const p = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i); const u = p.dot(ua), v = p.dot(va); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v) }
    p.fromBufferAttribute(pos, 0)
    const o = p.clone().sub(ua.clone().multiplyScalar(p.dot(ua))).sub(va.clone().multiplyScalar(p.dot(va))) // 平面上沿法线的偏移
    const du = Math.max(u1 - u0, 1e-3), dv = Math.max(v1 - v0, 1e-3)
    placed.push({ chart: c, o, ua, va, n, u0, v0, du, dv, w: Math.max(2, Math.ceil(du / TEXEL)), h: Math.max(2, Math.ceil(dv / TEXEL)), x: 0, y: 0 })
  }
  // 2) 货架装箱（含 2px 边距）
  const order = [...placed].sort((a, b) => b.h - a.h)
  const W = 1024
  let cx = 0, cy = 0, rowH = 0
  for (const pl of order) {
    const pw = pl.w + 4, ph = pl.h + 4
    if (cx + pw > W) { cx = 0; cy += rowH; rowH = 0 }
    pl.x = cx + 2; pl.y = cy + 2; cx += pw; rowH = Math.max(rowH, ph)
  }
  const Hh = Math.max(4, cy + rowH)
  const data = new Float32Array(W * Hh * 4)
  const out = [0, 0, 0, 0]
  let t0 = performance.now()
  // 3) 逐纹素烘焙
  for (const pl of placed) {
    const c = pl.chart
    for (let j = 0; j < pl.h; j++) {
      for (let i = 0; i < pl.w; i++) {
        const u = pl.u0 + (i + 0.5) / pl.w * pl.du, v = pl.v0 + (j + 0.5) / pl.h * pl.dv
        const px = pl.o.x + pl.ua.x * u + pl.va.x * v, py = pl.o.y + pl.ua.y * u + pl.va.y * v, pz = pl.o.z + pl.ua.z * u + pl.va.z * v
        const seed = px * 31.7 + py * 17.3 + pz * 11.1
        const ao = baker.sample(px, py, pz, pl.n.x, pl.n.y, pl.n.z, seed, 3, 8, out)
        // 细微脏污/磨损：墙脚踢蹭、墙面低频斑驳、地面走动磨损；楼道更旧
        const room = foyerRoomAt(px, pz)
        const old = room?.id === 'stair' ? 2.2 : 1
        let gk = 1 - 0.035 * old * (vnoise(px * 1.7 + pz * 0.9, py * 1.3) - 0.5) * 2
        if (c.kind === 'wall') {
          if (py < 0.32) gk *= 1 - 0.07 * old * (1 - py / 0.32) * (0.5 + vnoise(px * 9 + pz * 9, 3.1))
          if (py > 0.9 && py < 1.4) gk *= 1 - 0.025 * old * Math.max(0, vnoise(px * 4 + pz * 4, py * 6) - 0.55) * 2.2
          gk *= 1 - 0.05 * (1 - ao) // 角落积灰
        } else if (c.kind === 'floor') {
          gk *= 1 - 0.04 * old * Math.max(0, vnoise(px * 0.8, pz * 0.8) - 0.4)
        }
        const k = ((pl.y + j) * W + pl.x + i) * 4
        data[k] = out[0] * gk; data[k + 1] = out[1] * gk; data[k + 2] = out[2] * gk; data[k + 3] = out[3] * gk // alpha：楼道灯间接光标量
      }
      if (performance.now() - t0 > 12) { yield; t0 = performance.now() }
    }
    // 轻度平滑（3×3，图表内）消除软阴影采样噪点
    const tmp = new Float32Array(pl.w * pl.h * 4)
    for (let j = 0; j < pl.h; j++) for (let i = 0; i < pl.w; i++) {
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj
        if (ii < 0 || jj < 0 || ii >= pl.w || jj >= pl.h) continue
        const wgt = di === 0 && dj === 0 ? 2 : 1
        const k = ((pl.y + jj) * W + pl.x + ii) * 4
        r += data[k] * wgt; g += data[k + 1] * wgt; b += data[k + 2] * wgt; a += data[k + 3] * wgt; n += wgt
      }
      const q = (j * pl.w + i) * 4; tmp[q] = r / n; tmp[q + 1] = g / n; tmp[q + 2] = b / n; tmp[q + 3] = a / n
    }
    for (let j = 0; j < pl.h; j++) for (let i = 0; i < pl.w; i++) { const k = ((pl.y + j) * W + pl.x + i) * 4, q = (j * pl.w + i) * 4; data[k] = tmp[q]; data[k + 1] = tmp[q + 1]; data[k + 2] = tmp[q + 2]; data[k + 3] = tmp[q + 3] }
    // 边距扩展（2px）
    for (let j = -2; j < pl.h + 2; j++) for (let i = -2; i < pl.w + 2; i++) {
      if (i >= 0 && j >= 0 && i < pl.w && j < pl.h) continue
      const si = Math.min(pl.w - 1, Math.max(0, i)), sj = Math.min(pl.h - 1, Math.max(0, j))
      const s = ((pl.y + sj) * W + pl.x + si) * 4, d = ((pl.y + j) * W + pl.x + i) * 4
      data[d] = data[s]; data[d + 1] = data[s + 1]; data[d + 2] = data[s + 2]; data[d + 3] = data[s + 3]
    }
    // 4) 写入顶点光照贴图 UV
    const pos = c.geo.getAttribute('position')
    const lm = new Float32Array(pos.count * 2), p = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i)
      const u = (p.dot(pl.ua) - pl.u0) / pl.du, v = (p.dot(pl.va) - pl.v0) / pl.dv
      lm[i * 2] = (pl.x + u * pl.w) / W; lm[i * 2 + 1] = (pl.y + v * pl.h) / Hh
    }
    c.geo.setAttribute('foyerLm', new THREE.BufferAttribute(lm, 2))
  }
  const half = new Uint16Array(data.length)
  for (let i = 0; i < data.length; i++) half[i] = THREE.DataUtils.toHalfFloat(Math.min(data[i], 60000))
  const tex = new THREE.DataTexture(half, W, Hh, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.colorSpace = THREE.NoColorSpace
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = false
  tex.flipY = false
  tex.needsUpdate = true
  tex.name = 'foyer-lightmap'
  tex.userData.foyer = true
  foyerLightmap.value = tex
  return tex
}

/** 逐顶点烘焙（家具、门、窗套等非壳体网格）。 */
export function* bakeVertices(baker: FoyerBaker, meshes: THREE.Mesh[]): Generator<void, number, unknown> {
  const out = [0, 0, 0, 0], p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3()
  let t0 = performance.now(), count = 0
  // 同一位置/法线的顶点（非索引几何的重复顶点）共享结果
  const memo = new Map<string, [number, number, number, number]>()
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false)
    nm.getNormalMatrix(mesh.matrixWorld)
    const g = mesh.geometry, pos = g.getAttribute('position'), nor = g.getAttribute('normal')
    const arr = new Float32Array(pos.count * 4)
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else n.set(0, 1, 0)
      const key = `${Math.round(p.x * 200)},${Math.round(p.y * 200)},${Math.round(p.z * 200)},${Math.round(n.x * 8)},${Math.round(n.y * 8)},${Math.round(n.z * 8)}`
      let v = memo.get(key)
      if (!v) {
        baker.sample(p.x, p.y, p.z, n.x, n.y, n.z, p.x * 13.1 + p.y * 7.7 + p.z * 3.3, 2, 6, out)
        v = [out[0], out[1], out[2], out[3]]; memo.set(key, v); count++
      }
      arr[i * 4] = v[0]; arr[i * 4 + 1] = v[1]; arr[i * 4 + 2] = v[2]; arr[i * 4 + 3] = 2 + v[3] // w≥1.5：已烘焙；w−2：楼道灯间接光标量
      if ((i & 63) === 0 && performance.now() - t0 > 12) { yield; t0 = performance.now() }
    }
    g.setAttribute('foyerIrr', new THREE.BufferAttribute(arr, 4))
  }
  return count
}

// ---------------------------------------------------------------- 着色器注入
const chunk = THREE.ShaderChunk.lights_fragment_begin
const ps = chunk.indexOf('#if ( NUM_POINT_LIGHTS > 0 )'), pe = chunk.indexOf('#if ( NUM_SPOT_LIGHTS > 0 )')
const DIRECT = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );'
/** 烘焙灯：保留镜面高光，丢弃漫反射（漫反射由烘焙提供）。未烘焙的网格（foyerBaked=0）走原生光照。 */
/** 粗糙表面（roughness>0.9：乳胶漆墙、吊顶、织物）上烘焙灯只剩极弱的宽高光——整盏跳过（含阴影采样），省片元成本。 */
const PT_HEAD = 'pointLight = pointLights[ i ];'
const foyerPoints = ps >= 0 && pe > ps && chunk.slice(ps, pe).includes(DIRECT) && chunk.slice(ps, pe).includes(PT_HEAD)
  ? chunk.slice(0, ps) + chunk.slice(ps, pe).replace(PT_HEAD, `if ( !( l1BakedMask[ i ] > .5 && vFoyerBaked > .5 && material.roughness > 0.9 ) ) {
 ${PT_HEAD}`).replace(DIRECT, `{ vec3 foyerDiffuseBefore = reflectedLight.directDiffuse;
 ${DIRECT}
 if ( l1BakedMask[ i ] > .5 && vFoyerBaked > .5 ) reflectedLight.directDiffuse = foyerDiffuseBefore; }
 }`) + chunk.slice(pe)
  : chunk

export function installFoyerBake(mat: THREE.Material, flavor: 'v' | 'lm') {
  if (mat.userData.foyerBake) return
  mat.userData.foyerBake = flavor
  const prior = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    prior.call(mat, shader, renderer)
    Object.assign(shader.uniforms, { l1BakedMask: l0StaticPointMask, foyerBakeOverride: alphaBakeOverride, foyerLightmap, foyerCorridorIrr })
    if (flavor === 'v') {
      shader.vertexShader = 'attribute vec4 foyerIrr;\nuniform vec3 foyerCorridorIrr;\nvarying vec3 vFoyerIrr;\nvarying float vFoyerBaked;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFoyerBaked = step( 1.5, foyerIrr.w ); vFoyerIrr = foyerIrr.rgb + max( foyerIrr.w - 2.0, 0.0 ) * vFoyerBaked * foyerCorridorIrr;')
    } else {
      shader.vertexShader = 'attribute vec2 foyerLm;\nvarying vec2 vFoyerLm;\nvarying float vFoyerBaked;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vFoyerLm = foyerLm; vFoyerBaked = 1.0;')
    }
    shader.fragmentShader = `uniform float l1BakedMask[128];uniform float foyerBakeOverride;varying float vFoyerBaked;\n${flavor === 'v' ? 'varying vec3 vFoyerIrr;' : 'uniform sampler2D foyerLightmap;uniform vec3 foyerCorridorIrr;varying vec2 vFoyerLm;'}\n` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', foyerPoints)
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
 if ( vFoyerBaked > .5 && foyerBakeOverride < .5 ) {
  ${flavor === 'v' ? 'irradiance = vFoyerIrr;' : 'vec4 foyerLm = texture2D( foyerLightmap, vFoyerLm ); irradiance = foyerLm.rgb + foyerLm.a * foyerCorridorIrr;'}
  #if defined( STANDARD )
  iblIrradiance *= 0.0;
  #endif
 }`)
  }
  const key = mat.customProgramCacheKey()
  mat.customProgramCacheKey = () => key + '|foyer-bake-' + flavor + '-v3'
}
