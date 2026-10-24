// 前厅 M3 渲染：楼栋门厅 + 楼梯 → 小区 → 第六大街（店面、路口、车辆、行人）→ 旧仓路后巷。
// 地面/墙体使用 L11 已登记的 ambientCG CC0 PBR 材质（l11Material，UV 以米为单位）；招牌、立面窗格、
// 寻人启事、涂鸦、货架等为运行时 Canvas 贴图（foyerStreetTextures.ts）。静态部分按 32m 区块 × 材质合批，
// 动态部分（路灯灯头、红绿灯、行人、便利店自动门、监控指示灯、天空球、回程异常的招牌替换）单独保留。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameMap } from '../world/mapgen'
import {
  STREET_BUILDINGS, STREET_PROPS, STREET_SHOPS, STREET_LAMPS, STREET_CLUES, CLUE_BOXES, MART_DOOR, UNIT_DOOR,
  GATE_ARCH, ALLEY_ARCH, STAIR_LANDING, STAIR_RAMP, STAIR_TOP_Z, streetAreaAt, streetCeilingAt, type StreetProp, type StreetBuilding,
} from '../world/foyerStreetLayout'
import { l11Material } from './l11Materials'
import { litMaterial } from './shared'
import * as TX from './foyerStreetTextures'
import type { StreetVisual } from '../engine/foyerStreet'


export { disposeFoyerStreetTextures } from './foyerStreetTextures'

type Mat = THREE.Material
const DEG = Math.PI / 180

/** 世界尺度 UV（米）：按面法线主轴投影。 */
function metreUV(g: THREE.BufferGeometry, scale = 1) {
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal')
  let uv = g.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!uv) { uv = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2); g.setAttribute('uv', uv) }
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i))
    if (ay >= ax && ay >= az) uv.setXY(i, x / scale, z / scale)
    else if (ax >= az) uv.setXY(i, z / scale, y / scale)
    else uv.setXY(i, x / scale, y / scale)
  }
  uv.needsUpdate = true
}

class Batch {
  private cells = new Map<string, Map<Mat, THREE.BufferGeometry[]>>()
  /** geo：已在世界坐标；world=true 时重算米制 UV。 */
  push(mat: Mat, geo: THREE.BufferGeometry, world = false) {
    let g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    if (world) metreUV(g)
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    g.computeBoundingBox()
    const c = g.boundingBox!.getCenter(new THREE.Vector3())
    const key = `${Math.floor(c.x / 32)},${Math.floor(c.z / 32)}`
    let cell = this.cells.get(key)
    if (!cell) { cell = new Map(); this.cells.set(key, cell) }
    let arr = cell.get(mat)
    if (!arr) { arr = []; cell.set(mat, arr) }
    arr.push(g)
    void g
  }
  flush(parent: THREE.Object3D) {
    for (const [key, cell] of this.cells) for (const [mat, geos] of cell) {
      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.name = 'foyer-street-' + key
      const basic = (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial
      mesh.castShadow = !basic && !mat.transparent
      mesh.receiveShadow = !basic
      parent.add(mesh)
    }
    this.cells.clear()
  }
}

/** 道具局部建模：+z=正面，y=上，原点=占地中心地面。 */
class Ctx {
  batch: Batch; base: THREE.Matrix4
  constructor(batch: Batch, base: THREE.Matrix4) { this.batch = batch; this.base = base }
  private m(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    return new THREE.Matrix4().multiplyMatrices(this.base, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(1, 1, 1)))
  }
  geo(mat: Mat, g: THREE.BufferGeometry, x: number, y: number, z: number, world = false, ry = 0, rx = 0, rz = 0) {
    g.applyMatrix4(this.m(x, y, z, ry, rx, rz)); this.batch.push(mat, g, world)
  }
  /** 盒：y=底面高度。world=米制 UV（PBR 材质）。 */
  box(mat: Mat, w: number, h: number, d: number, x: number, y: number, z: number, world = true, ry = 0) { this.geo(mat, new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, world, ry) }
  cyl(mat: Mat, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 12, world = false, rx = 0, rz = 0) { this.geo(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y + (rx || rz ? 0 : h / 2), z, world, 0, rx, rz) }
  sphere(mat: Mat, r: number, x: number, y: number, z: number, sy = 1, seg = 10) { const g = new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3)); g.scale(1, sy, 1); this.geo(mat, g, x, y, z) }
  plane(mat: Mat, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0) { this.geo(mat, new THREE.PlaneGeometry(w, h), x, y, z, false, ry, rx) }
}
const at = (x: number, y: number, rot = 0, z = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, z, y), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot * DEG), new THREE.Vector3(1, 1, 1))


export class FoyerStreetScene {
  group = new THREE.Group()
  private batch = new Batch()
  private mats = new Map<string, Mat>()
  private lampHeads: { mat: THREE.MeshBasicMaterial; base: THREE.Color; last: number }[] = []
  private traffic: { group: number; lens: THREE.MeshBasicMaterial[] }[] = []
  private martDoors: THREE.Object3D[] = []
  private martDoorK = 0
  private cctvLed: THREE.MeshBasicMaterial | null = null
  private facadeMats: THREE.Material[] = []
  private windowsDark = false
  private dupNormal: THREE.Object3D[][] = [[], []]
  private dupAlt: THREE.Object3D[][] = [[], []]
  private dupState = -1
  private sky: THREE.Mesh | null = null
  private t = 0
  private dynamic: THREE.Object3D[] = []
  constructor() { this.group.name = 'foyer-street' }

  dynamicRoots(): THREE.Object3D[] { return this.dynamic }
  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose() })
    for (const m of this.mats.values()) if (!m.userData.shared) m.dispose()
    for (const m of this.facadeMats) m.dispose()
  }

  // ------------------------------------------------------------ 材质
  private M(key: string, make: () => Mat): Mat { let m = this.mats.get(key); if (!m) { m = make(); this.mats.set(key, m) } return m }
  private lit(key: string, p: Parameters<typeof litMaterial>[0]) { return this.M(key, () => litMaterial(p)) }
  private basic(key: string, p: THREE.MeshBasicMaterialParameters) { return this.M(key, () => new THREE.MeshBasicMaterial(p)) }
  private glow(key: string, map: THREE.Texture, k = 1) { return this.M(key, () => litMaterial({ map, emissive: new THREE.Color(k, k, k), emissiveMap: map, roughness: 0.4 })) }
  private P = {
    asphalt: () => l11Material('asphalt'),
    paving: () => l11Material('paving', '#c2bcb2'),
    pavingDark: () => l11Material('paving', '#9a958d'),
    concrete: () => l11Material('concrete', '#b0ada6'),
    curb: () => l11Material('concrete', '#c9c6be'),
    alley: () => l11Material('concrete', '#7a766f'),
    grass: () => l11Material('grass', '#7d9460'),
    brick: () => l11Material('brick', '#c79a86'),
    plaster: () => l11Material('plaster', '#dcd8cf', true),
    plasterOut: () => l11Material('plaster', '#bdb7ab'),
    metal: () => l11Material('metal', '#6d7276'),
    darkMetal: () => l11Material('metal', '#3b3f43'),
    tile: () => l11Material('ceramic', '#e9e7e1', true),
    wood: () => l11Material('propwood', '#9a7652'),
    bark: () => l11Material('bark'),
    glass: () => l11Material('glass'),
    rubber: () => l11Material('rubber'),
  }
  private C = {
    leaf: () => this.lit('leaf', { color: '#2f4a2c', roughness: 0.85 }),
    leaf2: () => this.lit('leaf2', { color: '#3c5a34', roughness: 0.85 }),
    white: () => this.lit('white', { color: '#e9e8e3', roughness: 0.6 }),
    black: () => this.lit('black', { color: '#18191b', roughness: 0.5 }),
    tyre: () => this.lit('tyre', { color: '#141414', roughness: 0.9 }),
    chrome: () => this.lit('chrome', { color: '#c9cdd0', roughness: 0.18, metalness: 0.9, envBase: 0.9 }),
    yellow: () => this.lit('yellow', { color: '#e3b52d', roughness: 0.55 }),
    red: () => this.lit('red', { color: '#b83a2e', roughness: 0.55 }),
    mark: () => this.lit('mark', { map: TX.roadMarkTex(), roughness: 0.7 }),
    markY: () => this.lit('markY', { color: '#d9b43a', roughness: 0.7 }),
    carGlass: () => this.lit('carGlass', { color: '#1c242c', roughness: 0.08, metalness: 0.3, envBase: 1.0 }),
    headL: () => this.basic('headL', { color: '#fff6dc' }),
    tailL: () => this.basic('tailL', { color: '#7a1010' }),
    lampOff: () => this.lit('lampOff', { color: '#2a2c2e', roughness: 0.4 }),
    cardboard: () => this.lit('cardboard', { map: TX.cardboardTex(), roughness: 0.95 }),
    puddle: () => this.lit('puddle', { color: '#0d0f12', roughness: 0.02, metalness: 0.6, envBase: 1.4 }),
  };

  // ------------------------------------------------------------ 构建
  *build(m: GameMap): Generator<void, void, unknown> {
    this.buildGround(m); yield
    this.buildMarkings(); yield
    for (const b of STREET_BUILDINGS) this.buildBuilding(b)
    yield
    this.buildInteriors(m); yield
    this.buildArches(); yield
    for (const s of STREET_SHOPS) this.buildShop(s)
    this.buildMart(); yield
    for (const p of STREET_PROPS) this.buildProp(p)
    yield
    this.buildLamps(); yield
    this.buildClues()
    this.buildSky()
    this.batch.flush(this.group)
    yield
  }

  // ------------------------------------------------------------ 地面
  private groundMat(x: number, y: number): Mat | null {
    const a = streetAreaAt(x + 0.5, y + 0.5)
    if (x >= GATE_ARCH.x0 && x < GATE_ARCH.x1 && y >= GATE_ARCH.y0 && y < GATE_ARCH.y1) return this.P.pavingDark()
    if (x >= ALLEY_ARCH.x0 && x < ALLEY_ARCH.x1 && y >= ALLEY_ARCH.y0 && y < ALLEY_ARCH.y1) return this.P.pavingDark()
    if (!a) return this.P.tile() // 单元门门洞
    switch (a.id) {
      case 'lobby': return this.P.tile()
      case 'store': return this.P.tile()
      case 'alley': return this.P.alley()
      case 'compound': return this.P.paving()
      case 'cross': case 'street': {
        const roadEW = y >= 49 && y < 57, roadNS = x >= 106 && x < 114
        return roadEW || roadNS ? this.P.asphalt() : this.P.paving()
      }
      default: return this.P.paving()
    }
  }
  private buildGround(m: GameMap) {
    for (let y = 0; y < m.h; y++) for (let x = 26; x < m.w; x++) {
      const i = y * m.w + x
      if (m.tiles[i] !== 1) continue
      if (x >= STAIR_LANDING.x0 && x < STAIR_RAMP.x1 && y >= STAIR_LANDING.y0 && y < STAIR_LANDING.y1) continue // 楼梯另建
      const mat = this.groundMat(x, y)
      if (!mat) continue
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(x + 0.5, 0, y + 0.5)
      this.batch.push(mat, g, true)
    }
  }
  private buildMarkings() {
    const c = new Ctx(this.batch, new THREE.Matrix4())
    const curb = this.P.curb()
    // 路缘石（0.12m 高，压在人行道一侧）
    const curbX = (x0: number, x1: number, y: number) => c.box(curb, x1 - x0, 0.12, 0.22, (x0 + x1) / 2, 0, y)
    const curbY = (y0: number, y1: number, x: number) => c.box(curb, 0.22, 0.12, y1 - y0, x, 0, (y0 + y1) / 2)
    curbX(28, 104, 48.9); curbX(116, 152, 48.9); curbX(28, 104, 57.1); curbX(116, 152, 57.1)
    curbY(32, 48.9, 105.9); curbY(32, 48.9, 114.1); curbY(57.1, 74, 105.9); curbY(57.1, 74, 114.1)
    // 小区路缘与车位线
    curbX(28, 80, 43.8)
    for (const y of [19, 25, 31, 37]) c.box(this.C.mark(), 2.4, 0.004, 0.08, 76.6, 0.003, y)
    const mark = this.C.mark(), my = this.C.markY()
    // 东西向：中心双黄线 + 车道虚线
    for (const [x0, x1] of [[28, 100], [120, 152]] as const) {
      c.box(my, x1 - x0, 0.004, 0.1, (x0 + x1) / 2, 0.002, 52.9); c.box(my, x1 - x0, 0.004, 0.1, (x0 + x1) / 2, 0.002, 53.1)
      for (let x = x0 + 1; x < x1 - 3; x += 9) { c.box(mark, 3, 0.004, 0.12, x + 1.5, 0.002, 51); c.box(mark, 3, 0.004, 0.12, x + 1.5, 0.002, 55) }
    }
    for (const [y0, y1] of [[32, 44], [62, 74]] as const) {
      c.box(my, 0.1, 0.004, y1 - y0, 109.9, 0.002, (y0 + y1) / 2); c.box(my, 0.1, 0.004, y1 - y0, 110.1, 0.002, (y0 + y1) / 2)
    }
    // 斑马线与停止线
    for (const cx of [101.6, 118.4]) { for (let y = 49.4; y < 56.8; y += 1.0) c.box(mark, 2.8, 0.005, 0.5, cx, 0.003, y + 0.25); c.box(mark, 0.3, 0.005, 3.9, cx + (cx < 110 ? -2.0 : 2.0), 0.003, cx < 110 ? 51 : 55) }
    for (const cy of [45.8, 60.2]) { for (let x = 106.4; x < 113.8; x += 1.0) c.box(mark, 0.5, 0.005, 2.6, x + 0.25, 0.003, cy) }
    // 井盖
    for (const [x, y] of [[60, 53], [90, 51], [128, 54], [110, 66]]) c.cyl(this.P.darkMetal(), 0.35, 0.35, 0.012, x, 0, y, 18)
    // 巷子排水沟
    c.box(this.P.darkMetal(), 0.3, 0.01, 26, 133, 0.001, 74)
  }

  // ------------------------------------------------------------ 建筑立面
  private facadeMat(style: StreetBuilding['style'], seed: number): Mat {
    if (style === 'wall') return this.P.plasterOut()
    const key = 'facade-' + style + seed
    return this.M(key, () => {
      const { map, glow } = TX.facadeTex(style, seed)
      const mat = litMaterial({ map, emissive: new THREE.Color(1, 1, 1), emissiveMap: glow, roughness: 0.85 })
      ;(mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.9
      this.facadeMats.push(mat)
      return mat
    })
  }
  /** 一面立面：沿 a→b，holes=[a,b,z0,z1]（门/店面洞口：只保留洞口上方）。 */
  private face(mat: Mat, side: 'n' | 's' | 'e' | 'w', line: number, a: number, b: number, z0: number, z1: number, holes: [number, number, number, number][] = [], uvScale = 24) {
    const segs: [number, number, number, number][] = []
    const cuts = [a, b, ...holes.flatMap((h) => [Math.max(a, Math.min(b, h[0])), Math.max(a, Math.min(b, h[1]))])].sort((p, q) => p - q)
    for (let i = 0; i < cuts.length - 1; i++) {
      const s0 = cuts[i], s1 = cuts[i + 1]
      if (s1 - s0 < 1e-3) continue
      const mid = (s0 + s1) / 2
      const hole = holes.find((h) => mid > h[0] && mid < h[1])
      if (!hole) segs.push([s0, s1, z0, z1])
      else { if (hole[2] > z0) segs.push([s0, s1, z0, hole[2]]); if (hole[3] < z1) segs.push([s0, s1, hole[3], z1]) }
    }
    for (const [s0, s1, h0, h1] of segs) {
      const g = new THREE.PlaneGeometry(s1 - s0, h1 - h0)
      const uv = g.getAttribute('uv')
      // 立面贴图以 uvScale 米为一张（u 沿墙、v 沿高）
      for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, (s0 + u * (s1 - s0)) / uvScale, (h0 + v * (h1 - h0)) / uvScale) }
      const mid = (s0 + s1) / 2, cy = (h0 + h1) / 2
      const mx = new THREE.Matrix4()
      if (side === 'n') mx.compose(new THREE.Vector3(mid, cy, line), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), new THREE.Vector3(1, 1, 1))
      else if (side === 's') mx.compose(new THREE.Vector3(mid, cy, line), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
      else if (side === 'e') mx.compose(new THREE.Vector3(line, cy, mid), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1))
      else mx.compose(new THREE.Vector3(line, cy, mid), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1))
      g.applyMatrix4(mx)
      this.batch.push(mat, g, uvScale === 0)
    }
  }
  private buildBuilding(b: StreetBuilding) {
    const seed = b.id.length * 7 + b.x0
    const c = new Ctx(this.batch, new THREE.Matrix4())
    if (b.style === 'wall') { // 小区围墙：抹灰 + 压顶 + 栏杆
      const mat = this.P.plasterOut()
      this.face(mat, 'n', b.y0, b.x0, b.x1, 0, b.h, [], 0); this.face(mat, 's', b.y1, b.x0, b.x1, 0, b.h, [], 0)
      this.face(mat, 'w', b.x0, b.y0, b.y1, 0, b.h, [], 0); this.face(mat, 'e', b.x1, b.y0, b.y1, 0, b.h, [], 0)
      c.box(this.P.concrete(), b.x1 - b.x0 + 0.1, 0.12, b.y1 - b.y0 + 0.1, (b.x0 + b.x1) / 2, b.h, (b.y0 + b.y1) / 2)
      for (let x = b.x0 + 0.4; x < b.x1; x += 0.25) c.box(this.P.darkMetal(), 0.025, 0.7, 0.025, x, b.h + 0.12, b.y1 - 0.4, false)
      c.box(this.P.darkMetal(), b.x1 - b.x0, 0.04, 0.05, (b.x0 + b.x1) / 2, b.h + 0.8, b.y1 - 0.4, false)
      return
    }
    const mat = this.facadeMat(b.style, seed)
    const plinth = b.style === 'brick' ? this.P.brick() : this.P.concrete()
    const sideHoles = (side: 'n' | 's' | 'e' | 'w'): [number, number, number, number][] => {
      const out: [number, number, number, number][] = []
      if (b.id === 'bldg_a' && side === 's') out.push([UNIT_DOOR.x0, UNIT_DOOR.x1, 0, 2.6])
      if (side === 'n') for (const s of STREET_SHOPS) if (Math.abs(s.y - b.y0) < 0.01 && s.x0 >= b.x0 && s.x1 <= b.x1) out.push([s.x0, s.x1, 0, 4.2])
      return out
    }
    for (const side of ['n', 's', 'e', 'w'] as const) {
      const line = side === 'n' ? b.y0 : side === 's' ? b.y1 : side === 'w' ? b.x0 : b.x1
      const [a0, a1] = side === 'n' || side === 's' ? [b.x0, b.x1] : [b.y0, b.y1]
      const holes = sideHoles(side)
      // 底层 0–4.2m：混凝土/砖勒脚（店面洞口除外）；上部：窗格立面
      this.face(plinth, side, line, a0, a1, 0, 4.2, holes, 0)
      this.face(mat, side, line, a0, a1, 4.2, b.h, [], 24)
      // 层间腰线
      const t = 0.12
      if (side === 'n') c.box(this.P.concrete(), a1 - a0, 0.2, t, (a0 + a1) / 2, 4.1, line - t / 2)
      if (side === 's') c.box(this.P.concrete(), a1 - a0, 0.2, t, (a0 + a1) / 2, 4.1, line + t / 2)
      if (side === 'w') c.box(this.P.concrete(), t, 0.2, a1 - a0, line - t / 2, 4.1, (a0 + a1) / 2)
      if (side === 'e') c.box(this.P.concrete(), t, 0.2, a1 - a0, line + t / 2, 4.1, (a0 + a1) / 2)
    }
    // 女儿墙顶
    c.box(this.P.concrete(), b.x1 - b.x0 + 0.3, 0.5, b.y1 - b.y0 + 0.3, (b.x0 + b.x1) / 2, b.h, (b.y0 + b.y1) / 2)
    // 屋顶红色航空障碍灯（高楼）
    if (b.h > 28) c.sphere(this.basic('aviation', { color: '#ff3b2e' }), 0.18, b.x0 + 1, b.h + 0.7, b.y0 + 1)
    if (b.id === 'bldg_a') this.buildUnitEntrance(c)
  }
  private buildUnitEntrance(c: Ctx) {
    // 单元门：雨棚、门框、两扇推开的玻璃门、楼号牌、门禁
    const x = (UNIT_DOOR.x0 + UNIT_DOOR.x1) / 2, y = 15
    c.box(this.P.concrete(), 3.4, 0.18, 1.6, x, 2.95, y + 0.8)
    c.box(this.P.darkMetal(), 0.08, 2.6, 0.12, UNIT_DOOR.x0 + 0.04, 0, y + 0.02, false)
    c.box(this.P.darkMetal(), 0.08, 2.6, 0.12, UNIT_DOOR.x1 - 0.04, 0, y + 0.02, false)
    c.box(this.P.darkMetal(), 2, 0.12, 0.12, x, 2.5, y + 0.02, false)
    for (const s of [-1, 1]) {
      const px = x + s * 1.2
      c.box(this.P.glass(), 0.9, 2.3, 0.03, px, 0.1, y + 0.3, false, s * 0.9)
      c.box(this.P.darkMetal(), 0.94, 0.08, 0.05, px, 0.08, y + 0.3, false, s * 0.9)
    }
    c.plane(this.glow('unit-no', TX.labelTex('3', '#f2f2f2', '#1f3a5c', 128, 128, 'bold 90px Arial'), 0.6), 0.4, 0.4, x + 1.5, 2.6, y + 0.02)
    c.plane(this.glow('unit-name', TX.labelTex('LUMEN COURT · BLOCK 3', '#e8e8e8', '#2a2c30', 512, 64, 'bold 34px Arial'), 0.5), 2.0, 0.25, x, 3.25, y + 1.61)
    c.box(this.C.black(), 0.25, 0.4, 0.06, x + 1.45, 1.2, y + 0.03, false)
    c.plane(this.basic('intercom-led', { color: '#4cff8a' }), 0.04, 0.04, x + 1.45, 1.5, y + 0.065)
  }

  // ------------------------------------------------------------ 门厅/便利店/楼梯：内墙与吊顶
  private buildInteriors(m: GameMap) {
    const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
    const c = new Ctx(this.batch, new THREE.Matrix4())
    const plaster = this.P.plaster()
    const base = this.lit('lobby-base', { color: '#4a4c4e', roughness: 0.6 })
    for (let y = 0; y < m.h; y++) for (let x = 26; x < m.w; x++) {
      if (!isFloor(x, y)) continue
      const a = streetAreaAt(x + 0.5, y + 0.5)
      const door = y === UNIT_DOOR.y && x >= UNIT_DOOR.x0 && x < UNIT_DOOR.x1
      const stair = x >= STAIR_LANDING.x0 && x < STAIR_RAMP.x1 && y >= STAIR_LANDING.y0 && y < STAIR_LANDING.y1
      const H = streetCeilingAt(x + .5, y + .5)
      if (!Number.isFinite(H)) continue
      for (const [dx, dy, side] of [[0, -1, 'n'], [0, 1, 's'], [-1, 0, 'w'], [1, 0, 'e']] as const) {
        if (isFloor(x + dx, y + dy)) continue
        if (a?.id === 'store' && side === 'n') continue // 店面玻璃另建
        if (stair && side === 'w') continue // 上行楼梯洞口
        // 室内面：朝向本格（与立面方向相反）
        const s2 = side === 'n' ? 's' : side === 's' ? 'n' : side === 'w' ? 'e' : 'w'
        const line = side === 'n' ? y : side === 's' ? y + 1 : side === 'w' ? x : x + 1
        const [a0, a1] = side === 'n' || side === 's' ? [x, x + 1] : [y, y + 1]
        this.face(plaster, s2 as 'n', line, a0, a1, 0, H, [], 0)
        if (!door) {
          const t = 0.012
          if (side === 'n') c.box(base, 1, 0.1, t, x + 0.5, 0, y + t / 2, false)
          if (side === 's') c.box(base, 1, 0.1, t, x + 0.5, 0, y + 1 - t / 2, false)
          if (side === 'w') c.box(base, t, 0.1, 1, x + t / 2, 0, y + 0.5, false)
          if (side === 'e') c.box(base, t, 0.1, 1, x + 1 - t / 2, 0, y + 0.5, false)
        }
      }
      // 吊顶
      const g = new THREE.PlaneGeometry(1, 1); g.rotateX(Math.PI / 2); g.translate(x + 0.5, H, y + 0.5)
      this.batch.push(this.lit('ceil-white', { color: '#e7e6e1', roughness: 0.95 }), g)
    }
    // 单元门洞上方的门楣、楼梯间与门厅的吊顶高差
    this.face(plaster, 'n', UNIT_DOOR.y, UNIT_DOOR.x0, UNIT_DOOR.x1, 2.6, 3.0, [], 0)
    this.face(plaster, 'w', STAIR_RAMP.x1, STAIR_RAMP.y0, STAIR_RAMP.y1, 3.0, 4.6, [], 0)
    // 楼梯：平台（+1.2m）+ 7 级踏步（向东下降）+ 西侧继续向上的梯段（视觉）
    const conc = this.P.concrete(), nose = this.P.darkMetal()
    c.box(conc, STAIR_LANDING.x1 - STAIR_LANDING.x0, STAIR_TOP_Z, 2, (STAIR_LANDING.x0 + STAIR_LANDING.x1) / 2, 0, 11)
    for (let i = 0; i < 7; i++) {
      const run = (STAIR_RAMP.x1 - STAIR_RAMP.x0) / 7, x0 = STAIR_RAMP.x0 + i * run, top = STAIR_TOP_Z * (7 - i) / 7 - 0.02
      c.box(conc, run, top, 2, x0 + run / 2, 0, 11)
      c.box(nose, 0.04, 0.02, 2, x0 + 0.02, top - 0.02, 11, false)
    }
    for (let i = 0; i < 6; i++) { const run = 0.28, x0 = STAIR_LANDING.x0 - (i + 1) * run; c.box(conc, run, STAIR_TOP_Z + (i + 1) * 0.17, 2, x0 + run / 2, 0, 11) }
    c.box(plaster, 2, 4.6, 0.05, 32.6, 0, 11, true, Math.PI / 2) // 上行梯段尽头的墙（暗处）
    c.box(plaster, 1.7, 4.6, 0.05, 33.15, 0, 9.98); c.box(plaster, 1.7, 4.6, 0.05, 33.15, 0, 12.02)
    // 扶手（沿梯段南侧）
    const rail = this.P.darkMetal()
    for (let i = 0; i <= 4; i++) { const x = 36 + i * 0.5, z = STAIR_TOP_Z * (1 - (x - 36) / 2); c.box(rail, 0.03, 0.9, 0.03, x, z, 11.9, false) }
    const len = Math.hypot(2, STAIR_TOP_Z)
    c.geo(rail, new THREE.BoxGeometry(len, 0.04, 0.05), 37, STAIR_TOP_Z / 2 + 0.92, 11.9, false, 0, 0, -Math.atan2(STAIR_TOP_Z, 2))
    // 楼层标识
    c.plane(this.glow('floor-1F', TX.labelTex('1F', '#f2f2f2', '#33373b', 128, 128, 'bold 80px Arial'), 0.5), 0.3, 0.3, 38.4, 2.1, 10.02)
  }

  // ------------------------------------------------------------ 循环门洞（小区门口 = 巷口，同一模块）
  private archModule(x0: number, y0: number, outer: 'gate' | 'alley') {
    const c = new Ctx(this.batch, new THREE.Matrix4())
    const W = 4, D = 2, H = 2.9, cx = x0 + W / 2, cy = y0 + D / 2
    const wall = this.lit('arch-wall', { color: '#cbc4b4', roughness: 0.9 })
    const dado = this.lit('arch-dado', { color: '#6c6a63', roughness: 0.7 })
    for (const sx of [x0 + 0.06, x0 + W - 0.06]) {
      c.box(wall, 0.12, H, D, sx, 0, cy, false)
      c.box(dado, 0.14, 0.9, D, sx, 0, cy, false)
    }
    c.box(wall, W, 0.2, D, cx, H, cy, false)
    // 门洞外框（两侧立柱 + 横梁）
    const frame = this.P.concrete()
    for (const yy of [y0, y0 + D]) { c.box(frame, W + 0.6, 0.5, 0.3, cx, H, yy); for (const sx of [x0 - 0.15, x0 + W + 0.15]) c.box(frame, 0.3, H, 0.3, sx, 0, yy) }
    // 墙上的旧电表与小广告（两处相同）
    c.box(this.lit('arch-box', { color: '#8a8f86', roughness: 0.6 }), 0.06, 0.5, 0.4, x0 + 0.15, 1.5, cy - 0.3, false)
    c.plane(this.lit('arch-flyer', { map: TX.missingPosterTex(9), roughness: 0.9 }), 0.3, 0.42, x0 + W - 0.13, 1.4, cy + 0.2, -Math.PI / 2)
    // 上部体块：小区门楼 / 巷口过街楼
    const top = outer === 'gate' ? 6.5 : 14
    const body = outer === 'gate' ? this.P.plasterOut() : this.P.brick()
    c.box(body, W + 1.2, top - H - 0.5, D + 0.4, cx, H + 0.5, cy)
    if (outer === 'gate') {
      c.plane(this.glow('gate-name', TX.labelTex('LUMEN COURT', '#f3e2b8', '#30302e', 512, 96, 'bold 54px Georgia, serif'), 0.6), 3.4, 0.6, cx, H + 1.6, y0 + D + 0.21)
      c.plane(this.glow('gate-name', TX.labelTex('LUMEN COURT', '#f3e2b8', '#30302e', 512, 96, 'bold 54px Georgia, serif'), 0.6), 3.4, 0.6, cx, H + 1.6, y0 - 0.21, Math.PI)
    }
  }
  private buildArches() {
    this.archModule(GATE_ARCH.x0, GATE_ARCH.y0, 'gate')
    this.archModule(ALLEY_ARCH.x0, ALLEY_ARCH.y0, 'alley')
  }

  // ------------------------------------------------------------ 店面
  private buildShop(s: typeof STREET_SHOPS[number]) {
    const c = new Ctx(this.batch, new THREE.Matrix4())
    const W = s.x1 - s.x0, cx = (s.x0 + s.x1) / 2, y = s.y
    // 招牌（灯箱）
    const signMat = s.open ? this.glow('sign-' + s.kind, TX.shopSignTex(s.kind), 1.1) : this.lit('signoff-' + s.kind, { map: TX.shopSignTex(s.kind), roughness: 0.6 })
    const fascia = this.P.darkMetal()
    c.box(fascia, W, 1.0, 0.25, cx, 3.2, y - 0.12, false)
    const signMesh = (mat: Mat) => { const msh = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 0.8), mat); msh.position.set(cx, 3.7, y - 0.255); msh.rotation.y = Math.PI; return msh }
    const dupIdx = s.kind === 'laundry' ? 0 : s.kind === 'pharmacy' ? 1 : -1
    if (dupIdx >= 0) {
      const a = signMesh(signMat), b = signMesh(this.glow('sign-mart', TX.shopSignTex('mart'), 1.1))
      b.visible = false
      this.group.add(a, b); this.dupNormal[dupIdx].push(a); this.dupAlt[dupIdx].push(b)
    } else c.geo(signMat, new THREE.PlaneGeometry(W - 0.4, 0.8), cx, 3.7, y - 0.255, false, Math.PI)
    // 立柱
    for (const x of [s.x0 + 0.1, s.x1 - 0.1]) c.box(this.P.concrete(), 0.2, 3.2, 0.3, x, 0, y + 0.05)
    if (s.kind === 'mart') return // 便利店另建（可进入）
    if (!s.open) { // 卷帘门
      c.geo(this.lit('shutter', { map: TX.shutterTex(), roughness: 0.6, metalness: 0.4 }), new THREE.PlaneGeometry(W - 0.4, 3.2), cx, 1.6, y + 0.15, false, Math.PI)
      c.box(this.P.darkMetal(), W - 0.4, 0.3, 0.35, cx, 3.0, y + 0.1, false)
      return
    }
    // 营业店：橱窗玻璃 + 店内背景 + 门
    const back = (kind: string) => { const msh = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, 3.0), this.glow('interior-' + kind, TX.shopInteriorTex(kind), 0.42)); msh.position.set(cx, 1.5, y + 1.6); msh.rotation.y = Math.PI; return msh }
    if (dupIdx >= 0) { const a = back(s.kind), b = back('mart'); b.visible = false; this.group.add(a, b); this.dupNormal[dupIdx].push(a); this.dupAlt[dupIdx].push(b) }
    else this.group.add(back(s.kind))
    c.box(this.lit('shop-floor', { color: '#d9d6cf', roughness: 0.5 }), W - 0.4, 0.02, 1.6, cx, 0, y + 0.8, false)
    c.box(this.lit('shop-ceil', { color: '#f3f3f0', roughness: 0.9 }), W - 0.4, 0.05, 1.7, cx, 3.0, y + 0.8, false)
    for (const x of [s.x0 + 0.2, s.x1 - 0.2]) c.box(this.lit('shop-side', { color: '#e9e9e4', roughness: 0.9 }), 0.05, 3.0, 1.6, x, 0, y + 0.8, false)
    c.geo(this.P.glass(), new THREE.PlaneGeometry(W - 0.4, 2.9), cx, 1.55, y + 0.04, false, Math.PI)
    for (let x = s.x0 + 0.2; x <= s.x1 - 0.19; x += (W - 0.4) / 4) c.box(this.P.darkMetal(), 0.06, 3.0, 0.08, x, 0, y + 0.04, false)
    c.box(this.P.darkMetal(), W - 0.4, 0.3, 0.1, cx, 0, y + 0.04, false)
    c.box(this.lit('shop-light', { color: '#ffffff', emissive: new THREE.Color('#f4f8ff'), roughness: 0.4 }), W - 1, 0.04, 0.2, cx, 2.92, y + 0.9, false)
    if (s.kind === 'pharmacy') { // 绿十字灯箱（侧挑）
      c.box(this.basic('cross-green', { color: '#29d17a' }), 0.12, 0.6, 0.2, s.x0 + 0.6, 4.5, y - 0.6, false)
      c.box(this.basic('cross-green', { color: '#29d17a' }), 0.12, 0.2, 0.6, s.x0 + 0.6, 4.7, y - 0.6, false)
      c.box(this.P.darkMetal(), 0.05, 0.05, 0.6, s.x0 + 0.6, 4.8, y - 0.3, false)
    }
  }
  private buildMart() {
    const s = STREET_SHOPS.find((v) => v.kind === 'mart')!
    const c = new Ctx(this.batch, new THREE.Matrix4())
    const y = s.y
    // 玻璃立面（门两侧）+ 竖框 + 横框
    for (const [x0, x1] of [[s.x0 + 0.2, MART_DOOR.x0], [MART_DOOR.x1, s.x1 - 0.2]] as const) {
      c.geo(this.P.glass(), new THREE.PlaneGeometry(x1 - x0, 2.9), (x0 + x1) / 2, 1.55, y + 0.03, false, Math.PI)
      for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 3) c.box(this.P.darkMetal(), 0.07, 3.1, 0.09, x, 0, y + 0.03, false)
      c.box(this.P.darkMetal(), x1 - x0, 0.35, 0.1, (x0 + x1) / 2, 0, y + 0.03, false)
      // 贴在玻璃上的促销海报
      c.plane(this.lit('mart-poster', { map: TX.martPosterTex(), roughness: 0.8 }), 0.9, 0.45, x0 + 0.8, 1.9, y - 0.002, Math.PI)
    }
    c.box(this.P.darkMetal(), MART_DOOR.x1 - MART_DOOR.x0 + 0.2, 0.3, 0.25, (MART_DOOR.x0 + MART_DOOR.x1) / 2, 2.55, y + 0.05, false)
    // 自动门（两扇，按玩家距离滑开）
    for (const sgn of [-1, 1]) {
      const g = new THREE.Group()
      const w = (MART_DOOR.x1 - MART_DOOR.x0) / 2
      const glass = new THREE.Mesh(new THREE.BoxGeometry(w, 2.45, 0.03), this.P.glass())
      glass.position.y = 1.25
      const fr = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.05), this.P.darkMetal()); fr.position.y = 0.05
      const fr2 = fr.clone(); fr2.position.y = 2.45
      g.add(glass, fr, fr2)
      g.position.set((MART_DOOR.x0 + MART_DOOR.x1) / 2 + sgn * w / 2, 0, y + 0.08)
      g.userData.base = g.position.x; g.userData.sgn = sgn; g.userData.w = w
      this.group.add(g); this.martDoors.push(g); this.dynamic.push(g)
    }
    // 吊顶灯盘
    const panel = this.lit('mart-panel', { color: '#ffffff', emissive: new THREE.Color('#eef4ff'), roughness: 0.3 })
    for (let x = 72; x < 84; x += 3) for (const yy of [62.5, 66]) c.box(panel, 1.2, 0.03, 0.3, x + 0.5, 3.06, yy, false)
    // 地垫与店内小电视
    c.box(this.lit('mat-grey', { color: '#3a3d40', roughness: 1 }), 2, 0.01, 1.2, 77, 0, y + 0.7, false)
    c.plane(this.lit('mart-wallposter', { map: TX.martPosterTex(), roughness: 0.8 }), 1.2, 0.6, 71, 2.2, 68.95, Math.PI)
  }

  // ------------------------------------------------------------ 道具
  private buildProp(p: StreetProp) {
    const c = new Ctx(this.batch, at(p.x, p.y, p.rot))
    const W = p.rot === 90 || p.rot === 270 ? p.d : p.w
    const D = p.rot === 90 || p.rot === 270 ? p.w : p.d
    switch (p.kind) {
      case 'planter': {
        c.box(this.P.concrete(), W, 0.5, D, 0, 0, 0)
        c.box(this.P.grass(), W - 0.2, 0.02, D - 0.2, 0, 0.5, 0)
        const r = mulberry(p.x * 13 + p.y)
        for (let i = 0; i < Math.floor(W * D / 2.5); i++) c.sphere(i % 2 ? this.C.leaf() : this.C.leaf2(), 0.35 + r() * 0.3, (r() - 0.5) * (W - 0.8), 0.6 + r() * 0.2, (r() - 0.5) * (D - 0.8), 0.7, 8)
        break
      }
      case 'tree': {
        c.cyl(this.P.bark(), 0.12, 0.17, 3.2, 0, 0.5, 0, 8, true)
        const r = mulberry((p.v ?? 1) * 97)
        for (let i = 0; i < 5; i++) c.sphere(i % 2 ? this.C.leaf() : this.C.leaf2(), 1.0 + r() * 0.5, (r() - 0.5) * 1.4, 3.4 + r() * 1.2, (r() - 0.5) * 1.4, 0.85, 9)
        break
      }
      case 'bench': {
        for (let i = 0; i < 4; i++) c.box(this.P.wood(), W, 0.04, 0.1, 0, 0.42, -0.18 + i * 0.12)
        for (let i = 0; i < 3; i++) c.box(this.P.wood(), W, 0.1, 0.03, 0, 0.55 + i * 0.13, -0.26, true)
        for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) { c.box(this.P.darkMetal(), 0.05, 0.42, 0.45, x, 0, 0, false); c.box(this.P.darkMetal(), 0.05, 0.45, 0.04, x, 0.42, -0.27, false) }
        break
      }
      case 'bikeshed': {
        const met = this.P.darkMetal()
        for (const x of [-W / 2, -W / 4, 0, W / 4, W / 2]) c.box(met, 0.08, 2.3, 0.08, x, 0, -D / 2 + 0.1, false)
        c.geo(this.lit('shed-roof', { color: '#7f8c96', roughness: 0.4, metalness: 0.5 }), new THREE.BoxGeometry(W + 0.4, 0.06, D + 0.4), 0, 2.4, 0, false, 0, -0.08)
        c.box(this.lit('shed-back', { color: '#9aa4ab', roughness: 0.5, transparent: false }), W, 1.8, 0.04, 0, 0.3, -D / 2 + 0.1, false)
        break
      }
      case 'bikes': {
        const n = Math.max(3, Math.floor(W / 0.7))
        const cols = ['#c0392b', '#2e86c1', '#1e8449', '#d4ac0d', '#7d3c98', '#e67e22']
        for (let i = 0; i < n; i++) {
          const x = -W / 2 + 0.35 + i * (W - 0.7) / Math.max(1, n - 1)
          const frame = this.lit('bike-' + (i % cols.length) + (p.v ?? 0), { color: (p.v ? ['#f2f2f2', '#f39c12'] : cols)[i % (p.v ? 2 : cols.length)], roughness: 0.4, metalness: 0.3 })
          const ry = Math.PI / 2
          for (const z of [-0.5, 0.5]) c.geo(this.C.tyre(), new THREE.TorusGeometry(0.32, 0.03, 5, 16), x, 0.34, z, false, ry)
          c.geo(frame, new THREE.BoxGeometry(0.04, 0.04, 0.9), x, 0.6, 0, false, 0, 0.3)
          c.geo(frame, new THREE.BoxGeometry(0.04, 0.5, 0.04), x, 0.55, -0.2, false, 0, -0.3)
          c.box(this.C.black(), 0.08, 0.04, 0.22, x, 0.86, -0.25, false)
          c.box(this.C.chrome(), 0.5, 0.03, 0.03, x, 0.95, 0.4, false)
          if (p.v) c.box(frame, 0.16, 0.12, 0.18, x, 0.7, 0.5, false)
        }
        break
      }
      case 'shedback': break
      case 'car': this.car(c, p.v ?? 1, W, D); break
      case 'van': {
        const col = ['#e5e5e0', '#d9d4c6', '#3f4b55', '#f2f2ee', '#c6c6c0', '#a39e8f', '#ecebe6'][(p.v ?? 0) % 7]
        const body = this.lit('van-' + col, { color: col, roughness: 0.35, metalness: 0.3, envBase: 0.6 })
        const L = D, Wd = W, hgt = p.top
        c.box(body, Wd, hgt - 0.45, L * 0.72, 0, 0.45, -L * 0.14)
        c.box(body, Wd, (hgt - 0.45) * 0.75, L * 0.28, 0, 0.45, L * 0.36)
        c.box(this.C.carGlass(), Wd - 0.1, 0.55, 0.05, 0, hgt * 0.6, L * 0.5 - 0.02, false)
        for (const sx of [-1, 1]) for (const z of [-L * 0.32, L * 0.3]) c.cyl(this.C.tyre(), 0.36, 0.36, 0.24, sx * (Wd / 2 - 0.1), 0.36, z, 14, false, 0, Math.PI / 2)
        c.box(this.C.headL(), 0.28, 0.12, 0.03, -Wd / 2 + 0.3, 0.8, L / 2, false); c.box(this.C.headL(), 0.28, 0.12, 0.03, Wd / 2 - 0.3, 0.8, L / 2, false)
        c.box(this.C.tailL(), 0.18, 0.25, 0.03, -Wd / 2 + 0.2, 0.9, -L / 2, false); c.box(this.C.tailL(), 0.18, 0.25, 0.03, Wd / 2 - 0.2, 0.9, -L / 2, false)
        break
      }
      case 'trafficlight': {
        const met = this.P.darkMetal()
        c.cyl(met, 0.07, 0.09, 4.6, 0, 0, 0, 10, true)
        c.box(met, 0.08, 0.08, 2.2, 0, 4.4, 1.1, false)
        const head = new THREE.Group()
        head.position.set(0, 4.0, 2.0)
        const hb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.95, 0.26), this.C.black()); head.add(hb)
        const lens: THREE.MeshBasicMaterial[] = []
        ;['#ff3b2e', '#ffb627', '#3dff8a'].forEach((col, i) => {
          const mat = new THREE.MeshBasicMaterial({ color: col }); mat.userData.on = new THREE.Color(col); mat.userData.off = new THREE.Color(0.018, 0.018, 0.02)
          const l = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), mat); l.position.set(0, 0.3 - i * 0.3, 0.131); head.add(l)
          const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.12), this.C.black()); visor.position.set(0, 0.42 - i * 0.3, 0.19); head.add(visor)
          lens.push(mat)
        })
        head.applyMatrix4(at(p.x, p.y, p.rot)); head.matrixAutoUpdate = false; head.updateMatrix()
        this.group.add(head)
        this.traffic.push({ group: p.v ?? 0, lens })
        // 行人按钮盒
        c.box(this.lit('ped-btn', { color: '#d6b13a', roughness: 0.5 }), 0.14, 0.24, 0.1, 0, 1.1, 0.1, false)
        break
      }
      case 'busstop': {
        const met = this.P.darkMetal()
        for (const x of [-W / 2 + 0.1, W / 2 - 0.1]) c.box(met, 0.08, 2.5, 0.08, x, 0, -D / 2 + 0.15, false)
        c.box(this.lit('bus-roof', { color: '#5d6b75', roughness: 0.4, metalness: 0.5 }), W + 0.2, 0.08, D + 0.2, 0, 2.5, 0, false)
        c.box(this.P.glass(), W - 0.3, 2.0, 0.03, 0, 0.3, -D / 2 + 0.12, false)
        c.box(this.P.wood(), W - 0.8, 0.05, 0.35, 0, 0.45, -D / 2 + 0.4)
        c.box(met, 0.06, 0.45, 0.3, -W / 2 + 0.6, 0, -D / 2 + 0.4, false); c.box(met, 0.06, 0.45, 0.3, W / 2 - 0.6, 0, -D / 2 + 0.4, false)
        // 广告灯箱（侧面）
        c.box(met, 1.1, 2.2, 0.16, W / 2 - 0.55, 0.2, D / 2 - 0.15, false)
        c.plane(this.glow('ad-panel', TX.adPanelTex(), 0.9), 0.95, 1.9, W / 2 - 0.55, 1.3, D / 2 - 0.06)
        c.plane(this.glow('busline', TX.labelTex('BUS  12 · 31 · N4', '#ffffff', '#20476b', 512, 96, 'bold 44px Arial'), 0.5), 1.4, 0.26, -W / 2 + 1.0, 2.3, D / 2 + 0.11)
        break
      }
      case 'upole': {
        c.cyl(this.P.concrete(), 0.11, 0.15, p.top, 0, 0, 0, 10, true)
        c.box(this.P.wood(), 1.6, 0.1, 0.1, 0, p.top - 0.8, 0)
        for (const x of [-0.7, 0, 0.7]) c.cyl(this.C.white(), 0.03, 0.04, 0.12, x, p.top - 0.7, 0, 6)
        c.box(this.lit('pole-box', { color: '#7c8178', roughness: 0.6 }), 0.3, 0.45, 0.2, 0, 2.6, 0.15, false)
        break
      }
      case 'missing': {
        const back = this.lit('missing-' + (p.v ?? 1), { map: TX.missingPosterTex(p.v ?? 1), roughness: 0.9 })
        c.plane(back, 0.36, 0.5, 0, p.top, 0.012)
        // 旧启事叠层
        c.plane(this.lit('missing-old', { map: TX.missingPosterTex(7), roughness: 0.95, color: '#c8c2b0' }), 0.34, 0.48, 0.08, p.top - 0.12, 0.006, 0.08)
        break
      }
      case 'bin': c.cyl(this.lit('bin-green', { color: '#2f5d3f', roughness: 0.5 }), 0.25, 0.22, 0.9, 0, 0, 0, 12); c.cyl(this.C.black(), 0.26, 0.26, 0.06, 0, 0.9, 0, 12); break
      case 'bins': { const n = Math.max(2, Math.round(W)); for (let i = 0; i < n; i++) { const x = -W / 2 + (i + 0.5) * W / n; c.box(this.lit('bigbin-' + (i % 3), { color: ['#2c6e49', '#2f5f8a', '#7a7a74'][i % 3], roughness: 0.55 }), W / n - 0.08, 1.0, D * 0.9, x, 0, 0); c.box(this.C.black(), W / n - 0.04, 0.06, D * 0.94, x, 1.0, 0) } break }
      case 'dumpster': {
        c.box(this.lit('dumpster', { color: '#2f4f3a', roughness: 0.6, metalness: 0.3 }), W, 1.2, D, 0, 0.1, 0)
        c.geo(this.C.black(), new THREE.BoxGeometry(W + 0.04, 0.05, D + 0.04), 0, 1.33, 0, false, 0, -0.1)
        for (const x of [-W / 2 + 0.15, W / 2 - 0.15]) for (const z of [-D / 2 + 0.15, D / 2 - 0.15]) c.cyl(this.C.tyre(), 0.06, 0.06, 0.1, x, 0, z, 8)
        break
      }
      case 'hydrant': c.cyl(this.C.red(), 0.13, 0.15, 0.65, 0, 0, 0, 12); c.sphere(this.C.red(), 0.14, 0, 0.66, 0, 0.8); c.cyl(this.C.red(), 0.05, 0.05, 0.4, 0, 0.42, 0, 8, false, 0, Math.PI / 2); break
      case 'bollards': for (let i = 0; i < 5; i++) { c.cyl(this.P.darkMetal(), 0.07, 0.08, 0.9, -W / 2 + i * W / 4, 0, 0, 10); c.cyl(this.C.yellow(), 0.075, 0.075, 0.06, -W / 2 + i * W / 4, 0.75, 0, 10) } break
      case 'standsign': c.geo(this.lit('standsign', { map: TX.martPosterTex(), roughness: 0.7 }), new THREE.BoxGeometry(0.55, 0.85, 0.03), 0, 0.45, 0.12, false, 0, -0.2); c.geo(this.C.black(), new THREE.BoxGeometry(0.55, 0.85, 0.03), 0, 0.45, -0.12, false, 0, 0.2); break
      case 'vending': {
        c.box(this.lit('vend-body', { color: '#b7232e', roughness: 0.4 }), W, p.top, D, 0, 0, 0)
        c.plane(this.glow('vending', TX.vendingTex(), 0.95), W - 0.16, p.top - 0.3, 0, p.top / 2 + 0.05, D / 2 + 0.005)
        break
      }
      case 'acunit': {
        c.box(this.lit('ac', { color: '#d9d8d2', roughness: 0.5 }), W > D ? W : 0.8, 0.55, W > D ? D : 0.3, 0, 2.6, 0, false)
        c.cyl(this.C.black(), 0.2, 0.2, 0.02, 0.1, 2.88, 0.16, 16, false, Math.PI / 2)
        break
      }
      case 'fence': {
        const tex = this.lit('fence', { map: TX.fenceTex(), roughness: 0.8 })
        const n = Math.ceil(W / 2.4)
        for (let i = 0; i < n; i++) {
          const x = -W / 2 + (i + 0.5) * W / n
          c.plane(tex, W / n - 0.05, 2.0, x, 1.1, 0.03); c.plane(tex, W / n - 0.05, 2.0, x, 1.1, -0.03, Math.PI)
          c.box(this.P.darkMetal(), 0.06, 2.2, 0.06, x - W / n / 2, 0, 0, false)
          c.box(this.lit('fence-foot', { color: '#e0b030', roughness: 0.7 }), 0.5, 0.12, 0.3, x - W / n / 2, 0, 0, false)
        }
        for (let i = 0; i < n; i += 2) c.sphere(this.basic('warn-amber', { color: '#ffa530' }), 0.06, -W / 2 + (i + 0.5) * W / n, 2.28, 0)
        break
      }
      case 'cone': c.cyl(this.lit('cone', { color: '#ff6a1a', roughness: 0.6 }), 0.03, 0.17, 0.7, 0, 0, 0, 12); c.cyl(this.C.white(), 0.1, 0.12, 0.1, 0, 0.32, 0, 12); c.box(this.C.black(), 0.4, 0.03, 0.4, 0, 0, 0, false); break
      case 'streetsign': {
        c.cyl(this.P.darkMetal(), 0.04, 0.05, 3.2, 0, 0, 0, 8)
        c.plane(this.glow('ss-6th', TX.labelTex('6TH AVE', '#ffffff', '#1d5e3a', 512, 112, 'bold 64px Arial'), 0.25), 1.1, 0.24, 0, 3.0, 0.03)
        c.plane(this.glow('ss-6th', TX.labelTex('6TH AVE', '#ffffff', '#1d5e3a', 512, 112, 'bold 64px Arial'), 0.25), 1.1, 0.24, 0, 3.0, -0.03, Math.PI)
        c.plane(this.glow('ss-depot', TX.labelTex('OLD DEPOT RD →', '#ffffff', '#1d5e3a', 512, 112, 'bold 56px Arial'), 0.25), 1.2, 0.24, 0.03, 2.7, 0, Math.PI / 2)
        c.plane(this.glow('ss-depot', TX.labelTex('OLD DEPOT RD →', '#ffffff', '#1d5e3a', 512, 112, 'bold 56px Arial'), 0.25), 1.2, 0.24, -0.03, 2.7, 0, -Math.PI / 2)
        break
      }
      case 'alleysign': c.plane(this.lit('alley-sign', { map: TX.labelTex('OLD DEPOT LN', '#e8e8e8', '#2a3b4a', 512, 112, 'bold 54px Arial'), roughness: 0.6 }), 0.9, 0.2, 0, 2.6, 0.06); break
      case 'mailboxes': {
        c.box(this.lit('mailbox', { color: '#8b9198', roughness: 0.4, metalness: 0.5 }), W, 1.0, D, 0, 0.8, 0, false)
        for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) c.box(this.C.black(), 0.24, 0.02, 0.01, -W / 2 + 0.25 + k * (W - 0.3) / 6, 1.0 + r * 0.22, D / 2 + 0.005, false)
        c.plane(this.lit('flyer-mail', { map: TX.missingPosterTex(5), roughness: 0.9 }), 0.24, 0.33, W / 2 - 0.3, 0.55, D / 2 + 0.01)
        break
      }
      case 'noticeboard': c.box(this.lit('notice-frame', { color: '#5b4632', roughness: 0.7 }), W + 0.08, 1.08, 0.04, 0, 1.0, 0, false); c.plane(this.lit('notice', { map: TX.noticeTex(), roughness: 0.9 }), W, 1.0, 0, 1.54, 0.025); break
      case 'lift': {
        c.box(this.P.metal(), W + 0.3, 2.4, 0.1, 0, 0, 0, false)
        c.box(this.C.chrome(), W / 2 - 0.02, 2.1, 0.02, -W / 4, 0, 0.06, false); c.box(this.C.chrome(), W / 2 - 0.02, 2.1, 0.02, W / 4, 0, 0.06, false)
        c.plane(this.lit('lift-note', { map: TX.labelTex('OUT OF SERVICE', '#b3241f', '#f2efe6', 512, 128, 'bold 52px Arial'), roughness: 0.9 }), 0.5, 0.13, 0.2, 1.4, 0.075)
        c.plane(this.basic('lift-led', { color: '#ff5533' }), 0.18, 0.06, 0, 2.3, 0.056)
        break
      }
      case 'plant': c.cyl(this.lit('pot', { color: '#4c4e50', roughness: 0.5 }), 0.25, 0.2, 0.45, 0, 0, 0, 12); for (let i = 0; i < 4; i++) c.sphere(this.C.leaf2(), 0.25, Math.sin(i * 1.6) * 0.12, 0.7 + i * 0.12, Math.cos(i * 1.6) * 0.12, 1.2, 8); break
      case 'stairrail': break
      case 'guardbooth': {
        c.box(this.lit('booth', { color: '#d9d4c6', roughness: 0.7 }), W, 0.9, D, 0, 0, 0)
        for (const [x, z, w, d] of [[-W / 2 + 0.05, 0, 0.1, D], [W / 2 - 0.05, 0, 0.1, D], [0, -D / 2 + 0.05, W, 0.1]] as const) c.box(this.lit('booth', { color: '#d9d4c6', roughness: 0.7 }), w, 1.3, d, x, 0.9, z, false)
        c.box(this.P.glass(), W - 0.2, 1.2, 0.03, 0, 0.95, D / 2 - 0.05, false)
        c.box(this.lit('booth-roof', { color: '#6a6f73', roughness: 0.5 }), W + 0.3, 0.15, D + 0.3, 0, 2.2, 0)
        c.box(this.lit('booth-light', { color: '#fff', emissive: new THREE.Color('#fff2d0'), roughness: 0.4 }), 0.5, 0.04, 0.2, 0, 2.16, 0, false)
        c.box(this.lit('booth-desk', { color: '#8a6a48', roughness: 0.6 }), W - 0.3, 0.05, 0.5, 0, 0.85, D / 2 - 0.4, false)
        break
      }
      case 'swing': {
        const met = this.lit('swing', { color: '#c0392b', roughness: 0.5, metalness: 0.3 })
        for (const x of [-W / 2, W / 2]) { c.geo(met, new THREE.CylinderGeometry(0.05, 0.05, 2.3, 8), x, 1.1, 0.4, false, 0, 0.35); c.geo(met, new THREE.CylinderGeometry(0.05, 0.05, 2.3, 8), x, 1.1, -0.4, false, 0, -0.35) }
        c.cyl(met, 0.05, 0.05, W, 0, 2.15, 0, 8, false, 0, Math.PI / 2)
        for (const x of [-0.6, 0.6]) { c.box(this.C.black(), 0.02, 1.6, 0.02, x - 0.2, 0.55, 0, false); c.box(this.C.black(), 0.02, 1.6, 0.02, x + 0.2, 0.55, 0, false); c.box(this.P.wood(), 0.5, 0.04, 0.2, x, 0.5, 0) }
        break
      }
      case 'shelf': {
        const goods = this.lit('goods-' + (p.v ?? 1), { map: TX.shelfGoodsTex(p.v ?? 1), roughness: 0.6 })
        c.box(this.lit('shelf-body', { color: '#e3e4e6', roughness: 0.5, metalness: 0.2 }), W, p.top, D * 0.5, 0, 0, 0, false)
        c.plane(goods, W - 0.05, p.top - 0.1, 0, p.top / 2, D / 2 - 0.02)
        c.plane(goods, W - 0.05, p.top - 0.1, 0, p.top / 2, -D / 2 + 0.02, Math.PI)
        c.box(this.lit('shelf-base', { color: '#3a3d40', roughness: 0.6 }), W, 0.1, D, 0, 0, 0, false)
        break
      }
      case 'cooler': {
        c.box(this.lit('cooler-body', { color: '#2a2e33', roughness: 0.4, metalness: 0.4 }), W, p.top + 0.2, D, 0, 0, 0, false)
        c.plane(this.glow('cooler', TX.coolerTex(), 0.95), W - 0.2, p.top - 0.3, 0, p.top / 2 + 0.05, D / 2 + 0.005)
        c.box(this.P.glass(), W - 0.1, p.top - 0.2, 0.02, 0, 0.15, D / 2 + 0.04, false)
        for (let x = -W / 2 + 0.05; x <= W / 2; x += W / 4) c.box(this.C.chrome(), 0.04, p.top - 0.2, 0.04, x, 0.15, D / 2 + 0.05, false)
        break
      }
      case 'counter': {
        c.box(this.lit('counter', { color: '#e9e6df', roughness: 0.5 }), W, 0.95, D, 0, 0, 0)
        c.box(this.lit('counter-top', { color: '#4a4c4e', roughness: 0.3 }), W + 0.06, 0.05, D + 0.06, 0, 0.95, 0, false)
        c.box(this.C.black(), 0.35, 0.3, 0.3, 0, 1.0, -0.6, false)
        c.plane(this.basic('register-screen', { color: '#5a7fa8' }), 0.28, 0.18, 0, 1.18, -0.44, 0, -0.3)
        c.box(this.C.black(), 0.5, 0.32, 0.06, 0.2, 1.9, -1.2, false)
        c.plane(this.glow('tv-news', TX.tvTex(), 0.9), 0.46, 0.28, 0.2, 2.06, -1.165)
        c.box(this.lit('counter-snacks', { map: TX.shelfGoodsTex(6), roughness: 0.6 }), 0.4, 0.4, 0.6, 0, 1.0, 0.8, false)
        break
      }
      case 'crates': for (let i = 0; i < 3; i++) c.box(this.lit('crate-blue', { color: '#2f5f8a', roughness: 0.6 }), 0.55, 0.3, 0.4, (i % 2) * 0.4 - 0.2, Math.floor(i / 2) * 0.3, (i % 2) * 0.2, false, i * 0.3); break
      case 'pipes': for (const z of [-1.5, 0.8]) { c.cyl(this.lit('pipe', { color: '#7f8a8c', roughness: 0.4, metalness: 0.6 }), 0.06, 0.06, 7, 0, 0, z, 8); } break
      case 'puddle': c.geo(this.C.puddle(), new THREE.CircleGeometry(1, 20), 0, 0.006, 0, false, 0, -Math.PI / 2); break
      case 'scooters': break
      case 'swingseat': break
    }
  }
  private car(c: Ctx, v: number, W: number, L: number) {
    const cols = ['#9aa3aa', '#2b2f33', '#8b1e1e', '#d8d8d2', '#20364f', '#5c6650', '#b5b0a5', '#1c1c1c', '#7a7e83', '#e0b62a']
    const col = cols[v % cols.length]
    const body = this.M('car-' + col, () => litMaterial({ color: col, roughness: 0.28, metalness: 0.55, envBase: 0.8 }))
    c.box(body, W, 0.62, L, 0, 0.3, 0)
    c.box(body, W - 0.08, 0.1, L - 0.1, 0, 0.92, 0, true)
    c.box(this.C.carGlass(), W - 0.16, 0.48, L * 0.48, 0, 0.98, -L * 0.04, false)
    c.box(body, W - 0.2, 0.05, L * 0.42, 0, 1.44, -L * 0.04, false)
    for (const sx of [-1, 1]) for (const z of [-L * 0.32, L * 0.32]) c.cyl(this.C.tyre(), 0.32, 0.32, 0.22, sx * (W / 2 - 0.08), 0.32, z, 14, false, 0, Math.PI / 2)
    c.box(this.C.headL(), 0.3, 0.1, 0.03, -W / 2 + 0.3, 0.72, L / 2 + 0.005, false); c.box(this.C.headL(), 0.3, 0.1, 0.03, W / 2 - 0.3, 0.72, L / 2 + 0.005, false)
    c.box(this.C.tailL(), 0.3, 0.1, 0.03, -W / 2 + 0.3, 0.75, -L / 2 - 0.005, false); c.box(this.C.tailL(), 0.3, 0.1, 0.03, W / 2 - 0.3, 0.75, -L / 2 - 0.005, false)
    c.box(this.C.black(), W - 0.4, 0.14, 0.04, 0, 0.42, L / 2, false); c.box(this.C.black(), W - 0.4, 0.14, 0.04, 0, 0.42, -L / 2, false)
    c.box(this.lit('plate', { color: '#f0f0ea', roughness: 0.6 }), 0.42, 0.1, 0.01, 0, 0.45, -L / 2 - 0.025, false)
    if (v === 9) { // 出租车顶灯
      c.box(this.basic('taxi-top', { color: '#ffe9a0' }), 0.55, 0.16, 0.22, 0, 1.47, -L * 0.05, false)
    }
  }

  // ------------------------------------------------------------ 路灯（灯头独立材质，按 vis.lamps 明灭）
  private buildLamps() {
    const met = this.P.darkMetal()
    for (const L of STREET_LAMPS) {
      const c = new Ctx(this.batch, at(L.x, L.y, L.dir))
      const mat = new THREE.MeshBasicMaterial({ color: L.area === 'compound' ? '#ffe2b8' : L.area === 'alley' ? '#ffd28f' : '#fff0cc' })
      const head = new THREE.Group()
      if (L.area === 'street' || L.area === 'cross') {
        c.cyl(met, 0.07, 0.12, L.h, 0, 0, 0, 10, true)
        c.box(met, 0.08, 0.08, 1.3, 0, L.h - 0.1, 0.6, false)
        c.box(met, 0.34, 0.12, 0.62, 0, L.h - 0.15, 1.1, false)
        const lens = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.52), mat); lens.position.set(0, L.h - 0.165, 1.1); head.add(lens)
        c.cyl(met, 0.16, 0.18, 0.3, 0, 0, 0, 10)
      } else if (L.area === 'compound') {
        c.cyl(met, 0.05, 0.07, L.h - 0.4, 0, 0, 0, 10, true)
        const globe = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), mat); globe.position.set(0, L.h - 0.2, 0); head.add(globe)
        c.cyl(met, 0.12, 0.08, 0.08, 0, L.h - 0.45, 0, 10)
      } else if (L.area === 'alley') {
        c.box(met, 0.06, 0.06, 0.45, 0, L.h + 0.05, 0.22, false)
        c.cyl(met, 0.06, 0.2, 0.18, 0, L.h - 0.05, 0.42, 12)
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mat); bulb.position.set(0, L.h - 0.06, 0.42); head.add(bulb)
      } else { // arch：吸顶灯
        c.cyl(this.C.white(), 0.2, 0.22, 0.05, 0, 2.86, 0, 18)
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 18), mat); disc.position.set(0, 2.83, 0); head.add(disc)
      }
      head.applyMatrix4(at(L.x, L.y, L.dir)); head.matrixAutoUpdate = false; head.updateMatrix()
      head.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix() })
      this.group.add(head)
      this.lampHeads.push({ mat, base: mat.color.clone(), last: 1 })
    }
  }

  // ------------------------------------------------------------ 巷子调查点
  private buildClues() {
    const g = STREET_CLUES.find((v) => v.id === 'graffiti')!
    const c = new Ctx(this.batch, new THREE.Matrix4())
    c.plane(this.M('graffiti', () => new THREE.MeshStandardMaterial({ map: TX.graffitiTex(), transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })), 2.4, 1.8, g.x + 0.01, g.z, g.y, Math.PI / 2)
    // 纸箱堆
    const box = this.C.cardboard()
    const r = mulberry(11)
    const B = CLUE_BOXES, cx = (B.x0 + B.x1) / 2, cy = (B.y0 + B.y1) / 2
    for (let i = 0; i < 6; i++) {
      const w = 0.5 + r() * 0.3, h = 0.32 + r() * 0.25, d = 0.4 + r() * 0.3
      c.box(box, w, h, d, cx + (r() - 0.5) * 1.0, i < 4 ? 0 : 0.45, cy + (r() - 0.5) * 1.2, false, r() * 1.2)
    }
    c.geo(this.lit('blanket', { color: '#5a5e48', roughness: 1 }), new THREE.BoxGeometry(1.0, 0.06, 0.7), cx - 0.3, 0.03, cy + 0.9, false, 0.4)
    for (let i = 0; i < 3; i++) c.cyl(this.lit('can', { color: ['#b03030', '#c0c0c0', '#2a6fb0'][i], roughness: 0.3, metalness: 0.7 }), 0.033, 0.033, 0.12, cx - 0.8 + i * 0.15, 0, cy + 0.6 - i * 0.2, 8, false, Math.PI / 2)
    // 旧监控
    const cam = STREET_CLUES.find((v) => v.id === 'cctv')!
    const cc = new Ctx(this.batch, at(cam.x, cam.y, 180, cam.z))
    cc.box(this.lit('cctv-mount', { color: '#cfcfc8', roughness: 0.5 }), 0.08, 0.08, 0.35, 0, 0, 0.17, false)
    cc.geo(this.lit('cctv-body', { color: '#d9d8d2', roughness: 0.4 }), new THREE.BoxGeometry(0.18, 0.16, 0.42), 0, -0.05, 0.42, false, 0, -0.35)
    cc.geo(this.C.yellow(), new THREE.CylinderGeometry(0.095, 0.095, 0.1, 12), 0, -0.13, 0.62, false, 0, Math.PI / 2 - 0.35)
    cc.geo(this.C.yellow(), new THREE.CylinderGeometry(0.097, 0.097, 0.05, 12), 0, -0.11, 0.55, false, 0, Math.PI / 2 - 0.35)
    this.cctvLed = new THREE.MeshBasicMaterial({ color: '#ff2020' })
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), this.cctvLed)
    led.position.set(cam.x, cam.z + 0.05, cam.y + 0.3)
    this.group.add(led)
    c.box(this.lit('cctv-cable', { color: '#222', roughness: 0.8 }), 0.02, 3.1, 0.02, cam.x - 0.15, 0, cam.y - 0.02, false)
  }

  // 行人：已改用项目 NPC 系统（world/foyerStreetLayout.ts FOYER_PEDS → engine/npc.ts 路线分支 → renderer.updateNpcs 人物模型与步态）

  private buildSky() {
    const mat = new THREE.MeshBasicMaterial({ map: TX.skyTex(), side: THREE.BackSide, fog: false, depthWrite: false })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(52, 24, 16), mat)
    this.sky.renderOrder = -10
    this.sky.frustumCulled = false
    this.sky.name = 'foyer-street-sky'
    this.group.add(this.sky)
    this.dynamic.push(this.sky)
  }

  // ------------------------------------------------------------ 每帧
  update(vis: StreetVisual | undefined, dt: number, cam: THREE.Vector3) {
    if (!vis) return
    this.t += dt
    const t = this.t
    if (this.sky) { this.sky.position.copy(cam); this.sky.updateMatrix(); this.sky.updateMatrixWorld() }
    // 路灯灯头
    for (let i = 0; i < this.lampHeads.length; i++) {
      const h = this.lampHeads[i], k = Math.round((vis.lamps[i] ?? 1) * 20) / 20
      if (k === h.last) continue
      h.last = k
      h.mat.color.copy(h.base).multiplyScalar(0.06 + 0.94 * k)
    }
    // 红绿灯：东西向绿 9s 黄 2s 红 11s（南北向相反）；异常时全部黄闪
    for (const tl of this.traffic) {
      let on = [false, false, false]
      if (vis.traffic === 'flash') on = [false, Math.floor(t * 1.6) % 2 === 0, false]
      else {
        const cyc = (t + (tl.group ? 11 : 0)) % 22
        on = cyc < 9 ? [false, false, true] : cyc < 11 ? [false, true, false] : [true, false, false]
      }
      tl.lens.forEach((m, i) => { const c = on[i] ? m.userData.on : m.userData.off; if (!m.color.equals(c)) m.color.copy(c) })
    }
    // 便利店自动门
    const near = Math.hypot(cam.x - (MART_DOOR.x0 + MART_DOOR.x1) / 2, cam.z - MART_DOOR.y) < 2.6
    const target = near ? 1 : 0
    if (Math.abs(target - this.martDoorK) > 1e-3) {
      this.martDoorK += (target - this.martDoorK) * Math.min(1, dt * 5)
      for (const d of this.martDoors) { d.position.x = d.userData.base + d.userData.sgn * d.userData.w * 0.92 * this.martDoorK; d.updateMatrix(); d.updateMatrixWorld(true) }
    }
    // 监控指示灯
    if (this.cctvLed) this.cctvLed.color.setRGB(Math.sin(t * 3) > 0.2 ? 1 : 0.15, 0.05, 0.05)
    // 回程异常：招牌替换（同一家便利店出现两次/三次）、窗灯全灭
    if (vis.dup !== this.dupState) {
      this.dupState = vis.dup
      for (let i = 0; i < 2; i++) { const alt = vis.dup > i; for (const o of this.dupNormal[i]) o.visible = !alt; for (const o of this.dupAlt[i]) o.visible = alt }
    }
    if (vis.windowsDark !== this.windowsDark) {
      this.windowsDark = vis.windowsDark
      for (const m of this.facadeMats) (m as THREE.MeshStandardMaterial).emissiveIntensity = vis.windowsDark ? 0 : 0.9
    }
  }
}

function mulberry(seed: number) { let s = (Math.floor(seed) >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }
