// 前厅（序章）渲染：玩家的家——地面/墙面/吊顶（替代通用瓦片地形）+ 全部家具与陈设的程序化建模。
// 静态部分按材质合批（mergeGeometries），可动部件（门、抽屉、衣柜门、冰箱门）各自独立为铰链组，
// 由 FoyerScene.update 按 engine.foyer.open 状态插值。贴图见 foyerTextures.ts（运行时 Canvas 生成）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameMap } from '../world/mapgen'
import { FOYER_CEIL, FOYER_HOME_CEILINGS, FOYER_DOORS, FOYER_DOOR_H, FOYER_PARTITIONS, FOYER_PROPS, FOYER_ROOMS, FOYER_WALL_T, FOYER_WINDOWS, foyerRoomAt, type FoyerDoor, type FoyerProp, type FoyerRoom, type FoyerWindow, FOYER_PICKUP_POS, foyerWallUnion } from '../world/foyerLayout'
import * as TX from './foyerTextures'
import { cabinetCase, drawerTray } from './foyerCabinet'
import { buildFlashlightMesh } from './flashlightMesh'
import { foyerStd, type FoyerMatOpts } from './foyerPbr'
import { FoyerBaker, bakeShell, bakeVertices, foyerCorridor, foyerCorridorIrr, foyerDeskLamp, installFoyerBake, prepareFoyerLights, type ShellChart } from './foyerBake'
import { buildFoyerDetails } from './foyerDetails'
import { buildFoyerBackpack, buildFoyerPhone, buildFoyerSnack, buildFoyerWater, foyerItemTex, type ItemMatFactory } from './foyerItemModels'
import { buildFoyerStairDoor } from './foyerStairDoor'

type Mat = THREE.Material
/** 楼道灯罩：熄灭时为暗灰乳白（游戏内实际曝光较高，取 ≈0.02 以免熄灯时灯罩仍显得发白），点亮时为冷白（HDR 值，经 ACES 后接近纯白）。 */
const CORRIDOR_DOME_OFF = new THREE.Color(0.022, 0.023, 0.025)
const CORRIDOR_DOME_ON = new THREE.Color(2.4, 2.6, 2.9)
const H = FOYER_CEIL

// ---------------------------------------------------------------- 材质
type LitParams = THREE.MeshStandardMaterialParameters & { envBase?: number }
/** 前厅材质表：一律 PBR（MeshStandardMaterial）+ 烘焙光照注入（逐顶点）；壳体平面另有光照贴图版本。 */
export class Mats {
  private m = new Map<string, Mat>()
  private lm = new Map<Mat, Mat>()
  get(key: string, make: () => Mat): Mat { let v = this.m.get(key); if (!v) { v = make(); this.m.set(key, v) } return v }
  /** 纯色/程序化贴图材质（兼容 M1 写法：map/color/roughness/metalness/envBase）。 */
  lit(key: string, p: LitParams) {
    return this.get(key, () => {
      const { envBase, ...rest } = p
      const mat = foyerStd({ color: (rest.color as THREE.ColorRepresentation) ?? '#ffffff', roughness: rest.roughness ?? 0.85, metalness: rest.metalness ?? 0, env: envBase ?? 0.3, transparent: rest.transparent, opacity: rest.opacity, side: rest.side, emissive: rest.emissive as THREE.ColorRepresentation | undefined })
      if (rest.map) mat.map = rest.map
      installFoyerBake(mat, 'v')
      return mat
    })
  }
  /** 扫描 PBR 套组材质（颜色/法线/ORM）。 */
  pbr(key: string, o: FoyerMatOpts) { return this.get(key, () => { const mat = foyerStd(o); installFoyerBake(mat, 'v'); return mat }) }
  basic(key: string, p: THREE.MeshBasicMaterialParameters) { return this.get(key, () => new THREE.MeshBasicMaterial(p)) }
  /** 壳体（墙/地/顶）用的光照贴图版本：复制参数，注入光照贴图采样。 */
  shell(base: Mat): Mat {
    let v = this.lm.get(base)
    if (!v) {
      const s = new THREE.MeshStandardMaterial().copy(base as THREE.MeshStandardMaterial)
      s.userData = { ...base.userData, foyerBake: undefined }
      installFoyerBake(s, 'lm')
      this.lm.set(base, v = s)
    }
    return v
  }
}

// ---------------------------------------------------------------- 几何工具
/** 按面法线把 UV 改写为世界尺度（scale=1 张贴图对应的米数）。 */
export function worldUV(geo: THREE.BufferGeometry, scale: number, offset = new THREE.Vector3()): THREE.BufferGeometry {
  const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal'), uv = geo.getAttribute('uv')
  if (!uv || !nor) return geo
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x, y = pos.getY(i) + offset.y, z = pos.getZ(i) + offset.z
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i))
    if (ax >= ay && ax >= az) uv.setXY(i, z / scale, y / scale)
    else if (ay >= az) uv.setXY(i, x / scale, z / scale)
    else uv.setXY(i, x / scale, y / scale)
  }
  uv.needsUpdate = true
  return geo
}

export class Batch {
  parts = new Map<Mat, THREE.BufferGeometry[]>()
  push(mat: Mat, geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    const g = (geo.index ? geo.toNonIndexed() : geo)
    if (g !== geo) geo.dispose()
    g.applyMatrix4(m)
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    let arr = this.parts.get(mat)
    if (!arr) { arr = []; this.parts.set(mat, arr) }
    arr.push(g)
  }
  flush(parent: THREE.Object3D, name: string) {
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.name = name
      mesh.castShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && !(mat.transparent) && !mat.userData.noShadow
      mesh.receiveShadow = true
      parent.add(mesh)
    }
    this.parts.clear()
  }
}

/** QA：家具包围盒采集（window.__foyerAudit=true 时，buildProp 期间按道具 id 记录世界包围盒；Three 坐标）。 */
export const foyerAudit: { key: string | null; boxes: Map<string, THREE.Box3>; meta: Map<string, { kind: string; dx: number; dy: number }> } = { key: null, boxes: new Map(), meta: new Map() }
/** QA：细节件（开关/插座/空调）登记包围盒键与贴墙方向（地图坐标，指向墙内）。 */
export function auditKey(key: string | null, kind?: string, dx = 0, dy = 0) {
  if (!auditOn()) return
  foyerAudit.key = key
  if (key && kind) foyerAudit.meta.set(key, { kind, dx, dy })
}
const auditOn = () => !!(globalThis as unknown as { __foyerAudit?: boolean }).__foyerAudit
function auditAdd(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
  if (!foyerAudit.key) return
  if (!geo.boundingBox) geo.computeBoundingBox()
  const b = geo.boundingBox!.clone().applyMatrix4(m)
  const cur = foyerAudit.boxes.get(foyerAudit.key)
  if (cur) cur.union(b); else foyerAudit.boxes.set(foyerAudit.key, b)
}

/** 局部建模上下文：所有坐标为道具局部系（+z=正面，y=上，原点=占地中心地面）。 */
export class Ctx {
  batch: Batch | null; root: THREE.Object3D; base: THREE.Matrix4; mats: Mats
  constructor(batch: Batch | null, root: THREE.Object3D, base: THREE.Matrix4, mats: Mats) { this.batch = batch; this.root = root; this.base = base; this.mats = mats }
  private mtx(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, s = 1) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s))
    return new THREE.Matrix4().multiplyMatrices(this.base, m)
  }
  add(mat: Mat, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) {
    if (foyerAudit.key) {
      const wm = this.mtx(x, y, z, ry, rx, rz)
      if (!this.batch) { this.root.updateWorldMatrix(true, false); wm.premultiply(this.root.matrixWorld) }
      auditAdd(geo, wm)
    }
    if (this.batch) this.batch.push(mat, geo, this.mtx(x, y, z, ry, rx, rz))
    else {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.applyMatrix4(this.mtx(x, y, z, ry, rx, rz))
      mesh.castShadow = !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial && !mat.transparent; mesh.receiveShadow = true
      this.root.add(mesh)
    }
  }
  /** 盒子：x/y/z 为盒子底面中心（y=底面高度）。uv=世界尺度贴图（米/张），0=保持 0–1。 */
  box(mat: Mat, w: number, h: number, d: number, x: number, y: number, z: number, uv = 0, ry = 0) {
    // 逐顶点烘焙：大面（衣柜门、室内门、柜体侧板等）按 ≈0.3m 细分，让 AO/软阴影在面内有渐变，避免整面同一亮度
    const sg = (v: number) => (v > 0.6 ? Math.min(8, Math.ceil(v / 0.3)) : 1)
    const g = new THREE.BoxGeometry(w, h, d, sg(w), sg(h), sg(d))
    const unit = (mat.userData.uvUnit as number | undefined) ?? uv // PBR 套组：按贴图真实尺寸铺 UV（无拉伸）
    if (unit) worldUV(g, unit, new THREE.Vector3(x, y + h / 2, z))
    this.add(mat, g, x, y + h / 2, z, ry)
  }
  cyl(mat: Mat, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 16, rx = 0, rz = 0) {
    this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y + (rx || rz ? 0 : h / 2), z, 0, rx, rz)
  }
  sphere(mat: Mat, r: number, x: number, y: number, z: number, sy = 1, seg = 14) {
    const g = new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)); g.scale(1, sy, 1)
    this.add(mat, g, x, y, z)
  }
  /** 平面：默认竖直朝 +z。 */
  plane(mat: Mat, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0) {
    this.add(mat, new THREE.PlaneGeometry(w, h), x, y, z, ry, rx)
  }
  /** 圆角软垫（用压扁的圆角盒近似）。 */
  cushion(mat: Mat, w: number, h: number, d: number, x: number, y: number, z: number, r = 0.05, ry = 0, rx = 0) {
    const g = roundedBox(w, h, d, Math.min(r, h / 2 - 0.001, w / 2 - 0.001, d / 2 - 0.001))
    const unit = mat.userData.uvUnit as number | undefined
    if (unit) worldUV(g, unit, new THREE.Vector3(x, y, z))
    this.add(mat, g, x, y + h / 2, z, ry, rx)
  }
}

/** 圆角盒（细分盒顶点向内收）。 */
function roundedBox(w: number, h: number, d: number, r: number, seg = 3): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2)
  const pos = g.getAttribute('position')
  const v = new THREE.Vector3(), inner = new THREE.Vector3()
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    inner.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)))
    const n = v.clone().sub(inner)
    if (n.lengthSq() > 1e-9) { n.normalize().multiplyScalar(r); v.copy(inner).add(n) }
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

// ---------------------------------------------------------------- 场景对象
export interface FoyerDynamic { id: string; pivot: THREE.Object3D; kind: 'hinge' | 'slide'; axis: 'y' | 'z'; amount: number; cur: number }

/** 每帧可见性：可拾取物（key=FOYER_PICKUP 位置名）与楼道声控灯亮度。 */
export interface FoyerVisual { show: Record<string, boolean>; corridor: number }

export class FoyerScene {
  group = new THREE.Group()
  dynamics: FoyerDynamic[] = []
  screens: THREE.Mesh[] = []
  /** 可拾取物模型（phone / backpack / flashlight_bed / flashlight_drawer / water / snack）。 */
  pickups = new Map<string, THREE.Object3D>()
  private mats = new Mats()
  /** 壳体平面（墙/地/顶）：烘焙光照贴图后按材质合批。 */
  private charts: ShellChart[] = []
  /** 烘焙统计（QA 读取）。 */
  bakeStats = { ms: 0, texels: 0, vertices: 0, lmW: 0, lmH: 0 }
  /** 壳体光照贴图（RGB=辐照度，A=楼道灯间接光标量；QA 读取）。 */
  lightmap: THREE.DataTexture | null = null
  constructor() { this.group.name = 'foyer-home' }

  /**
   * 楼道声控灯亮度（0..1，1 = 烘焙基准亮度）。同时缩放实时直接光（写回灯的 intensityMul = 基准 × level）
   * 与烘焙的楼道间接光（foyerCorridorIrr）。M2 声控灯接入：每帧或亮度变化时调用即可；
   * 若 M2 直接改写该灯的 intensityMul，update() 也会按 intensityMul / 基准 自动同步间接光。
   */
  setCorridorLightLevel(level: number) {
    const lv = Math.max(0, Math.min(1.5, Number.isFinite(level) ? level : 1))
    const L = foyerCorridor.light
    if (L) L.intensityMul = foyerCorridor.baseMul * lv
    this.corridorLevel = lv
    this.syncCorridor()
  }
  /** 当前楼道灯亮度乘子（0..1.5）。 */
  corridorLevel = 1
  private syncCorridor() {
    const L = foyerCorridor.light
    const lv = L ? Math.max(0, Math.min(1.5, (L.intensityMul ?? foyerCorridor.baseMul) / Math.max(1e-4, foyerCorridor.baseMul))) : this.corridorLevel
    this.corridorLevel = lv
    foyerCorridorIrr.value.copy(foyerCorridor.color).multiplyScalar(lv)
    if (this.corridorDome) {
      const m = this.corridorDome.material as THREE.MeshBasicMaterial
      m.color.copy(CORRIDOR_DOME_OFF).lerp(CORRIDOR_DOME_ON, Math.min(1, lv))
    }
  }
  /** 楼道声控灯灯罩（亮度随 corridorLevel）。 */
  private corridorDome: THREE.Mesh | null = null
  /** 楼道声控灯灯具：圆形乳白吸顶灯（塑料底座 + 乳白灯罩），灯罩颜色随亮度变化。M1 地图该灯没有灯具模型。 */
  private buildCorridorLamp() {
    const L = foyerCorridor.light
    if (!L) return
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.135, 0.025, 28), this.mats.lit('corridor-lamp-base', { color: '#e8e8e4', roughness: 0.5, envBase: 0.3 }))
    base.position.set(L.x, H - 0.0125, L.y)
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: CORRIDOR_DOME_ON.clone(), toneMapped: true }))
    dome.scale.set(1, 0.55, 1)
    dome.position.set(L.x, H - 0.025, L.y)
    base.name = 'foyer-corridor-lamp'; dome.name = 'foyer-corridor-dome'
    base.castShadow = false; dome.castShadow = false
    this.group.add(base, dome)
    this.corridorDome = dome
  }

  /**
   * 每帧：门/抽屉/冰箱插值到 engine.foyer.open 目标；拾取物显隐；楼道声控灯亮度。
   * vis.corridor 为 M2 声控灯亮度（0..1，含起辉闪烁），经 setCorridorLightLevel 同时驱动实时直接光、
   * 烘焙间接光与灯罩发光（不再由 engine 直接改写 intensityMul）。
   */
  update(open: Record<string, number> | undefined, dt: number, vis?: FoyerVisual) {
    if (vis) {
      for (const [k, o] of this.pickups) { const v = vis.show[k] ?? true; if (o.visible !== v) o.visible = v }
      this.setCorridorLightLevel(vis.corridor)
    } else this.syncCorridor()
    for (const d of this.dynamics) {
      const target = open?.[d.id] ? 1 : 0
      if (Math.abs(target - d.cur) < 1e-3) continue
      // 静态场景：只有可动部件移动时才重绘阴影（台灯聚光灯 + 池内点光，见 renderer foyerEpoch）
      this.shadowEpoch++
      if (this.deskSpot) this.deskSpot.shadow.needsUpdate = true
      d.cur += (target - d.cur) * (1 - Math.exp(-dt * 7))
      if (Math.abs(target - d.cur) < 0.002) d.cur = target
      if (d.kind === 'hinge') d.pivot.rotation.y = d.amount * d.cur
      else d.pivot.position.z = d.amount * d.cur
      d.pivot.updateMatrix()
      d.pivot.updateMatrixWorld(true)
    }
  }
  dynamicRoots(): THREE.Object3D[] { return this.dynamics.map((d) => d.pivot) }
  /** QA：各家具世界包围盒（需在构建前设置 window.__foyerAudit=true）。[minX,minY,minZ,maxX,maxY,maxZ]，Three 坐标（y=高度，z=地图 y）。 */
  auditBoxes(): { boxes: Record<string, number[]>; meta: Record<string, { kind: string; dx: number; dy: number }> } {
    const boxes: Record<string, number[]> = {}
    for (const [k, b] of foyerAudit.boxes) boxes[k] = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z].map((v) => +v.toFixed(4))
    return { boxes, meta: Object.fromEntries(foyerAudit.meta) }
  }

  /** 台灯：实时聚光灯（暖光、软阴影，灯罩向下）。静态场景：阴影贴图约每秒刷新一次（门/抽屉移动时立即刷新）。 */
  deskSpot: THREE.SpotLight | null = null
  /** 可动部件移动计数：renderer 据此决定是否重绘前厅点光阴影。 */
  shadowEpoch = 0
  private buildDeskLampLight() {
    const lamp = foyerDeskLamp()
    if (!lamp) return
    const sp = new THREE.SpotLight('#ffc985', lamp.intensity, 4.2, 0.95, 0.65, 1.6)
    sp.name = 'foyer-desk-spot'
    sp.position.copy(lamp.pos)
    sp.target.position.copy(lamp.pos.clone().add(lamp.dir))
    sp.castShadow = true
    sp.shadow.mapSize.set(512, 512)
    sp.shadow.bias = -0.0004; sp.shadow.normalBias = 0.015; sp.shadow.radius = 4
    sp.shadow.camera.near = 0.04; sp.shadow.camera.far = 4.2
    sp.shadow.autoUpdate = false; sp.shadow.needsUpdate = true
    this.group.add(sp, sp.target)
    this.deskSpot = sp
  }

  // ------------------------------------------------------------ 构建入口
  *build(m: GameMap): Generator<void, void, unknown> {
    const lights = prepareFoyerLights(m)
    const batch = new Batch()
    this.buildFloors(batch); yield
    this.buildCeilings(batch); yield
    this.buildOuterWalls(m, batch); yield
    this.buildPartitions(batch); yield
    buildFoyerStairDoor(batch, this.group, this.mats)
    for (const w of FOYER_WINDOWS) this.buildWindow(w, batch)
    yield
    for (const d of FOYER_DOORS) this.buildDoor(d, batch)
    yield
    const audit = auditOn()
    if (audit) { foyerAudit.boxes.clear(); foyerAudit.meta.clear() }
    for (const p of FOYER_PROPS) { if (audit) foyerAudit.key = p.id; this.buildProp(p, batch) }
    foyerAudit.key = null
    this.buildPickups()
    yield
    buildFoyerDetails(new Ctx(batch, this.group, new THREE.Matrix4(), this.mats), this.mats)
    foyerAudit.key = null
    this.buildDeskLampLight()
    this.buildCorridorLamp()
    yield
    batch.flush(this.group, 'foyer-static')
    yield
    // ---- 烘焙：光照贴图（壳体）+ 逐顶点（其余）----
    const t0 = performance.now()
    const baker = new FoyerBaker(m, lights)
    baker.estimateBounce()
    yield
    const lmTex = yield* bakeShell(baker, this.charts)
    this.bakeStats.lmW = lmTex.image.width; this.bakeStats.lmH = lmTex.image.height
    this.lightmap = lmTex
    const byMat = new Map<Mat, THREE.BufferGeometry[]>()
    for (const c of this.charts) { let a = byMat.get(c.mat); if (!a) byMat.set(c.mat, a = []); a.push(c.geo); this.bakeStats.texels += 0 }
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, this.mats.shell(mat))
      mesh.name = 'foyer-shell'
      mesh.castShadow = true; mesh.receiveShadow = true
      this.group.add(mesh)
    }
    this.charts = []
    yield
    const meshes: THREE.Mesh[] = []
    this.group.updateMatrixWorld(true)
    this.group.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && (mm.material as Mat).userData?.foyerBake === 'v') meshes.push(mm) })
    this.bakeStats.vertices = yield* bakeVertices(baker, meshes)
    this.bakeStats.ms = Math.round(performance.now() - t0)
  }

  /** 壳体平面登记（世界坐标几何，含世界尺度 UV）。 */
  private shellPush(mat: Mat, geo: THREE.BufferGeometry, kind: ShellChart['kind']) {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    this.charts.push({ geo: g, mat, kind })
  }

  // ------------------------------------------------------------ 材质表
  private floorMat(kind: FoyerRoom['floor']): Mat {
    switch (kind) {
      case 'oak': return this.mats.pbr('floor-oak', { set: 'wood_floor', color: '#e4d8ca', roughness: 0.9, env: 0.45 })
      case 'ash': return this.mats.pbr('floor-ash', { set: 'wood_floor', color: '#f2e8dc', roughness: 0.9, env: 0.45 })
      case 'tile60': return this.mats.pbr('floor-tile60', { set: 'stone_floor', color: '#f1ece4', roughness: 0.75, env: 0.55 })
      case 'tile30': return this.mats.pbr('floor-tile30', { set: 'granite_tile', color: '#e4e3e0', roughness: 0.8, env: 0.5, scale: 0.5 })
      default: return this.mats.pbr('floor-terrazzo', { set: 'terrazzo', color: '#e2e5e8', roughness: 0.85, env: 0.4 }) // 楼道旧水磨石：贴图已预处理为冷灰（见 prepare-foyer-textures.py），这里只轻微压亮度
    }
  }
  private wallMat(kind: FoyerRoom['wall']): Mat {
    switch (kind) {
      case 'paintSage': return this.mats.pbr('wall-sage', { set: 'plaster', color: '#d2d4bd', normalScale: 0.35, roughness: 1, env: 0.12, ao: false })
      case 'tileWhite': return this.mats.pbr('wall-tile', { set: 'wall_tile', color: '#ffffff', roughness: 0.55, env: 0.6 })
      case 'paintCool': return this.mats.pbr('wall-cool', { set: 'plaster', color: '#d4d8dc', normalScale: 0.35, roughness: 1, env: 0.12, ao: false })
      case 'stairPaint': return this.mats.get('wall-stair', () => { const m = this.mats.pbr('wall-stair-base', { set: 'plaster', color: '#d3d8dc', normalScale: 0.6, roughness: 1, env: 0.1, ao: false }) as THREE.MeshStandardMaterial; m.map = TX.stairWallTex(); return m })
      default: return this.mats.pbr('wall-warm', { set: 'plaster', color: '#e9e1d1', normalScale: 0.35, roughness: 1, env: 0.12, ao: false })
    }
  }
  private wallUV(kind: FoyerRoom['wall']) { return kind === 'stairPaint' ? 2 : (this.wallMat(kind).userData.uvUnit as number) }
  private M = {
    white: () => this.mats.lit('white', { color: '#ece9e2', roughness: 0.55, envBase: 0.25 }),
    whiteGloss: () => this.mats.lit('whiteGloss', { color: '#f2f1ec', roughness: 0.22, envBase: 0.55 }),
    oak: () => this.mats.pbr('oak', { set: 'oak', color: '#f0dcc4', roughness: 0.75, env: 0.35 }),
    walnut: () => this.mats.pbr('walnut', { set: 'walnut', color: '#9a7a62', roughness: 0.7, env: 0.35 }),
    birch: () => this.mats.pbr('birch', { set: 'maple', color: '#f4ead8', roughness: 0.8, env: 0.3 }),
    black: () => this.mats.lit('black', { color: '#1c1c1e', roughness: 0.45, envBase: 0.35 }),
    graphite: () => this.mats.lit('graphite', { color: '#3a3c40', roughness: 0.4, metalness: 0.3, envBase: 0.45 }),
    steel: () => this.mats.lit('steel', { color: '#c4c7ca', roughness: 0.3, metalness: 0.9, envBase: 0.9 }),
    chrome: () => this.mats.lit('chrome', { color: '#e4e6e8', roughness: 0.1, metalness: 1, envBase: 1.1 }),
    brass: () => this.mats.lit('brass', { color: '#c9a160', roughness: 0.32, metalness: 0.9, envBase: 0.8 }),
    ceramic: () => this.mats.lit('ceramic', { color: '#f6f6f2', roughness: 0.12, envBase: 0.7 }),
    linen: () => this.mats.pbr('linen', { set: 'jersey', color: '#efeee8', roughness: 1, normalScale: 0.6, env: 0.05 }),
    duvet: () => this.mats.pbr('duvet', { set: 'linen', color: '#6a7e94', roughness: 1, normalScale: 0.8, env: 0.05 }),
    sofa: () => this.mats.pbr('sofa', { set: 'wool', color: '#868b90', roughness: 1, normalScale: 0.9, env: 0.04 }),
    sofaDark: () => this.mats.pbr('sofaDark', { set: 'wool', color: '#62676d', roughness: 1, normalScale: 0.9, env: 0.04 }),
    mustard: () => this.mats.pbr('mustard', { set: 'velvet', color: '#c99a3a', roughness: 1, normalScale: 0.7, env: 0.06 }),
    terracotta: () => this.mats.lit('terracotta', { color: '#b56a4a', roughness: 0.85 }),
    leaf: () => this.mats.lit('leaf', { color: '#3f6b3a', roughness: 0.6, side: THREE.DoubleSide, envBase: 0.2 }),
    soil: () => this.mats.lit('soil', { color: '#3a2a1e', roughness: 1 }),
    glass: () => this.mats.get('glass', () => { const g = foyerStd({ color: '#cfe0e8', roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.16, env: 0.9 }); installFoyerBake(g, 'v'); return g }),
    mirror: () => this.mats.lit('mirror', { color: '#c7ced2', roughness: 0.02, metalness: 1, envBase: 1.3 }),
    plastic: () => this.mats.lit('plastic', { color: '#e3e3df', roughness: 0.4 }),
    rubber: () => this.mats.lit('rubber', { color: '#222', roughness: 0.9 }),
    paper: () => this.mats.lit('paper', { color: '#f2efe6', roughness: 0.9 }),
    lampShade: () => this.mats.basic('lampShade', { color: '#fff1d6' }),
    bulb: () => this.mats.basic('bulb', { color: '#fff6e0' }),
    led: () => this.mats.basic('led', { color: '#5cff8a' }),
    screenOff: () => this.mats.lit('screenOff', { color: '#0b0c0e', roughness: 0.08, envBase: 0.9 }),
    fabric: (key: string, hex: string, set: 'wool' | 'linen' | 'jersey' | 'velvet' = 'jersey') => this.mats.pbr('fab-' + key, { set, color: hex, roughness: 1, normalScale: 0.8, env: 0.04 }),
  }

  // ------------------------------------------------------------ 地面 / 吊顶
  private buildFloors(batch: Batch) {
    const c = new Ctx(batch, this.group, new THREE.Matrix4(), this.mats)
    for (const r of FOYER_ROOMS) {
      const w = r.x1 - r.x0, d = r.y1 - r.y0
      const g = new THREE.PlaneGeometry(w, d)
      g.rotateX(-Math.PI / 2)
      g.translate((r.x0 + r.x1) / 2, 0, (r.y0 + r.y1) / 2)
      const fm = this.floorMat(r.floor)
      worldUV(g, fm.userData.uvUnit as number)
      this.shellPush(fm, g, 'floor')
    }
    // 防盗门门洞地面（玄关地板延伸 + 不锈钢门槛）
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); g.translate(5.5, 0, 14.5); worldUV(g, this.floorMat('ash').userData.uvUnit as number)
    this.shellPush(this.floorMat('ash'), g, 'floor')
    c.box(this.M.steel(), 1, 0.02, 0.18, 5.5, 0, 14.08)
    // 厨房/客厅分界压条
    c.box(this.M.steel(), 5, 0.006, 0.03, 14.5, 0, 8)
  }
  private buildCeilings(batch: Batch) {
    const mat = this.mats.pbr('ceiling', { set: 'plaster', color: '#f1efe9', normalScale: 0.2, roughness: 1, env: 0.06, ao: false })
    // Exact shared 1 m edges: no coplanar overlap or T-junction cracks.
    for (const r of FOYER_HOME_CEILINGS) {
      const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.y1 - r.y0, r.x1 - r.x0, r.y1 - r.y0)
      g.rotateX(Math.PI / 2); g.translate((r.x0 + r.x1) / 2, H, (r.y0 + r.y1) / 2)
      worldUV(g, mat.userData.uvUnit as number); this.shellPush(mat, g, 'ceiling')
    }
    // 石膏顶角线（每个房间四周；开放式边界——客厅↔厨房、客厅↔玄关——不做，避免悬空横梁）
    const c = new Ctx(batch, this.group, new THREE.Matrix4(), this.mats)
    const walled = (axis: 'x' | 'y', at: number, along: number, inside: number) => {
      for (const p of FOYER_PARTITIONS) if (p.axis === (axis === 'x' ? 'x' : 'y') && Math.abs(p.at - at) < 0.01 && along > p.from && along < p.to) return !p.gaps.some((g) => along > g.a && along < g.b && !g.lintel)
      const ox = axis === 'y' ? at + (at > inside ? 0.3 : -0.3) : along, oy = axis === 'x' ? at + (at > inside ? 0.3 : -0.3) : along
      return !foyerRoomAt(ox, oy) // 另一侧不是房间 = 外墙
    }
    const STEP = 0.25, t = 0.06
    for (const r of FOYER_ROOMS) {
      if (r.id === 'stair' || r.id === 'bath') continue
      const cy = (r.y0 + r.y1) / 2, cx = (r.x0 + r.x1) / 2
      for (const [axis, at, a0, a1] of [['x', r.y0, r.x0, r.x1], ['x', r.y1, r.x0, r.x1], ['y', r.x0, r.y0, r.y1], ['y', r.x1, r.y0, r.y1]] as const) {
        let start = -1
        const flush = (end: number) => {
          if (start < 0) return
          const len = end - start, mid = (start + end) / 2
          const partition = FOYER_PARTITIONS.some(p => p.axis === axis && Math.abs(p.at - at) < .01 && mid > p.from && mid < p.to)
          const inset = (partition ? FOYER_WALL_T / 2 : 0) + t / 2
          if (axis === 'x') c.box(this.M.white(), len, t, t, mid, H - t - .004, at + (at > cy ? -inset : inset))
          else c.box(this.M.white(), t, t, len, at + (at > cx ? -inset : inset), H - t - .004, mid)
          start = -1
        }
        for (let u = a0; u < a1 - 1e-6; u += STEP) {
          const ok = walled(axis, at, u + STEP / 2, axis === 'x' ? cy : cx)
          if (ok && start < 0) start = u
          if (!ok) flush(u)
        }
        flush(a1)
      }
    }
  }

  // ------------------------------------------------------------ 外墙（瓦片边界面）
  private buildOuterWalls(m: GameMap, batch: Batch) {
    const c = new Ctx(batch, this.group, new THREE.Matrix4(), this.mats)
    const isFloor = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[y * m.w + x] === 1
    const baseMat = this.mats.lit('baseboard', { color: '#f3f1ec', roughness: 0.5 })
    const stairBase = this.mats.lit('baseboard-stair', { color: '#3a3f3c', roughness: 0.7 })
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      if (!isFloor(x, y)) continue
      const doorway = x === 5 && y === 14
      if (!doorway && !foyerRoomAt(x + 0.5, y + 0.5)) continue // M3：街区地面由 foyerStreet.ts 构建
      for (const [dx, dy, side] of [[0, -1, 'n'], [0, 1, 's'], [-1, 0, 'w'], [1, 0, 'e']] as const) {
        if (isFloor(x + dx, y + dy)) continue
        const room = doorway ? FOYER_ROOMS.find((r) => r.id === 'entry')! : foyerRoomAt(x + 0.5, y + 0.5)!
        const mat = doorway ? this.mats.lit('door-lining', { color: '#d9d4c8', roughness: 0.6 }) : this.wallMat(room.wall)
        // 该面所在线与沿线区间
        const along = side === 'n' || side === 's' ? x : y
        const at = side === 'n' ? y : side === 's' ? y + 1 : side === 'w' ? x : x + 1
        const win = FOYER_WINDOWS.find((w) => w.side === side && Math.abs(w.at - at) < 1e-6 && w.b > along && w.a < along + 1)
        const segs: [number, number, number, number][] = [] // [a,b,y0,y1]
        if (!win) segs.push([along, along + 1, 0, H])
        else {
          const a = Math.max(along, win.a), b = Math.min(along + 1, win.b)
          if (a > along) segs.push([along, a, 0, H])
          if (b < along + 1) segs.push([b, along + 1, 0, H])
          segs.push([a, b, 0, win.sill]); segs.push([a, b, win.top, H])
        }
        for (const [a, b, y0, y1] of segs) {
          if (b - a < 1e-4 || y1 - y0 < 1e-4) continue
          const g = new THREE.PlaneGeometry(b - a, y1 - y0)
          const mid = (a + b) / 2, cy = (y0 + y1) / 2
          const mtx = new THREE.Matrix4()
          if (side === 'n') mtx.compose(new THREE.Vector3(mid, cy, at), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1))
          else if (side === 's') mtx.compose(new THREE.Vector3(mid, cy, at), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0)), new THREE.Vector3(1, 1, 1))
          else if (side === 'w') mtx.compose(new THREE.Vector3(at, cy, mid), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1))
          else mtx.compose(new THREE.Vector3(at, cy, mid), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)), new THREE.Vector3(1, 1, 1))
          g.applyMatrix4(mtx)
          worldUV(g, doorway ? 1 : this.wallUV(room.wall))
          if (room.wall === 'stairPaint') { // 楼道墙裙贴图竖向不平铺：v=高度/2.8
            const uv = g.getAttribute('uv'), pos = g.getAttribute('position')
            for (let i = 0; i < pos.count; i++) uv.setY(i, pos.getY(i) / H)
          }
          this.shellPush(mat, g, 'wall')
          // 踢脚线
          if (y0 === 0 && !doorway && room.wall !== 'tileWhite') {
            const bw = b - a, th = 0.012, bh = room.wall === 'stairPaint' ? 0.12 : 0.09
            const bm = room.wall === 'stairPaint' ? stairBase : baseMat
            if (side === 'n') c.box(bm, bw, bh, th, mid, 0, at + th / 2)
            if (side === 's') c.box(bm, bw, bh, th, mid, 0, at - th / 2)
            if (side === 'w') c.box(bm, th, bh, bw, at + th / 2, 0, mid)
            if (side === 'e') c.box(bm, th, bh, bw, at - th / 2, 0, mid)
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ 隔墙
  private buildPartitions(batch: Batch) {
    const c = new Ctx(batch, this.group, new THREE.Matrix4(), this.mats)
    const union = foyerWallUnion(), groups = new Map<string, (typeof union.faces[number] & { room: FoyerRoom })[]>()
    // Classify each exposed face, then merge only contiguous faces of the same room.
    for (const f of union.faces) {
      const mid = (f.a + f.b) / 2, outside = f.at + f.sign * .003
      const room = foyerRoomAt(f.axis === 'y' ? outside : mid, f.axis === 'x' ? outside : mid)
      if (!room) continue
      const key = [f.axis, f.at, f.sign, f.bottom, f.top, room.id].join(':')
      const list = groups.get(key) ?? []; list.push({ ...f, room }); groups.set(key, list)
    }
    const base = this.mats.lit('baseboard', { color: '#f3f1ec', roughness: .5 })
    for (const list of groups.values()) {
      list.sort((a, b) => a.a - b.a)
      const merged: typeof list = []
      for (const f of list) { const last = merged.at(-1); if (last && Math.abs(last.b - f.a) < 1e-6) last.b = f.b; else merged.push({ ...f }) }
      for (const f of merged) {
        const len = f.b - f.a, mid = (f.a + f.b) / 2, hh = f.top - f.bottom
        const g = new THREE.PlaneGeometry(len, hh)
        const ry = f.axis === 'y' ? f.sign * Math.PI / 2 : f.sign > 0 ? 0 : Math.PI
        g.rotateY(ry); g.translate(f.axis === 'y' ? f.at : mid, (f.bottom + f.top) / 2, f.axis === 'x' ? f.at : mid)
        worldUV(g, this.wallUV(f.room.wall)); this.shellPush(this.wallMat(f.room.wall), g, 'wall')
        if (f.bottom === 0 && f.room.wall !== 'tileWhite') {
          if (f.axis === 'y') c.box(base, .012, .09, len, f.at + f.sign * .006, 0, mid)
          else c.box(base, len, .09, .012, mid, 0, f.at + f.sign * .006)
        }
      }
    }
    const lining = this.mats.lit('door-lining', { color: '#d9d4c8', roughness: .6 })
    for (const f of union.soffits) {
      const g = new THREE.PlaneGeometry(f.x1 - f.x0, f.y1 - f.y0)
      g.rotateX(Math.PI / 2); g.translate((f.x0 + f.x1) / 2, f.z, (f.y0 + f.y1) / 2)
      worldUV(g, 1); this.shellPush(lining, g, 'ceiling')
    }
  }

  // ------------------------------------------------------------ 窗
  private buildWindow(w: FoyerWindow, batch: Batch) {
    // 窗所在墙面的局部系：+z 指向室内，x 沿墙
    const len = w.b - w.a, mid = (w.a + w.b) / 2
    const base = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let pos: THREE.Vector3
    if (w.side === 'n') { pos = new THREE.Vector3(mid, 0, w.at); q.setFromEuler(new THREE.Euler(0, 0, 0)) }
    else if (w.side === 's') { pos = new THREE.Vector3(mid, 0, w.at); q.setFromEuler(new THREE.Euler(0, Math.PI, 0)) }
    else if (w.side === 'w') { pos = new THREE.Vector3(w.at, 0, mid); q.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)) }
    else { pos = new THREE.Vector3(w.at, 0, mid); q.setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0)) }
    base.compose(pos, q, new THREE.Vector3(1, 1, 1))
    const c = new Ctx(batch, this.group, base, this.mats)
    const room = FOYER_ROOMS.find((r) => r.id === w.room)!
    const reveal = this.wallMat(room.wall)
    const D = 0.22, hh = w.top - w.sill, cy = w.sill
    // 窗洞侧壁（向墙内）
    c.box(reveal, 0.01, hh, D, -len / 2 + 0.005, cy, -D / 2)
    c.box(reveal, 0.01, hh, D, len / 2 - 0.005, cy, -D / 2)
    c.box(reveal, len, 0.01, D, 0, w.top - 0.01, -D / 2)
    // 窗台板（石材）
    const sill = this.mats.lit('sillstone', { color: '#d8d4cc', roughness: 0.35, envBase: 0.4 })
    c.box(sill, len + 0.08, 0.025, D + 0.06, 0, cy - 0.025, -D / 2 + 0.03)
    // 铝合金窗框 + 中梃
    const frame = this.mats.lit('winframe', { color: '#3b3e42', roughness: 0.4, metalness: 0.4 })
    const fz = -D + 0.03
    c.box(frame, len, 0.05, 0.06, 0, cy, fz); c.box(frame, len, 0.05, 0.06, 0, w.top - 0.05, fz)
    c.box(frame, 0.05, hh, 0.06, -len / 2 + 0.025, cy, fz); c.box(frame, 0.05, hh, 0.06, len / 2 - 0.025, cy, fz)
    const panes = len > 2 ? 3 : 2
    for (let i = 1; i < panes; i++) c.box(frame, 0.04, hh, 0.06, -len / 2 + (len * i) / panes, cy, fz)
    if (hh > 1.6) c.box(frame, len, 0.035, 0.06, 0, cy + hh * 0.72, fz)
    // 玻璃
    c.plane(this.M.glass(), len - 0.06, hh - 0.06, 0, cy + hh / 2, fz)
    // 窗外夜景（远景板：离墙 7m，略放大，不受雾影响）
    const view = this.mats.basic('view-' + w.view, { map: TX.nightCityTex(w.view), fog: false })
    const vw = len * 6.5 + 8, vh = vw / 2
    c.plane(view, vw, vh, 0, cy + hh / 2 + (w.view === 'cityLow' ? 0.9 : 0.4), -7)
    // 窗帘（卧室、客厅）
    if (w.room === 'bedroom' || w.room === 'living') {
      const cm = w.room === 'bedroom' ? this.mats.pbr('curtain-b', { set: 'linen', color: '#7f9282', roughness: 1, normalScale: 0.9, side: THREE.DoubleSide, env: 0.03 }) : this.mats.pbr('curtain-l', { set: 'linen', color: '#d6cab3', roughness: 1, normalScale: 0.9, side: THREE.DoubleSide, env: 0.03 })
      const top = Math.min(H - 0.08, w.top + 0.22)
      c.cyl(this.M.steel(), 0.012, 0.012, len + 0.7, 0, top, 0.12, 8, 0, Math.PI / 2)
      for (const sx of [-1, 1]) c.sphere(this.M.steel(), 0.02, sx * (len / 2 + 0.35), top, 0.12)
      const bottom = w.view === 'cityLow' ? 0.015 : Math.max(0.03, w.sill - 0.2)
      const unit = cm.userData.uvUnit as number
      for (const s of [-1, 1]) {
        // 拉开的窗帘：带垂坠褶皱的连续布面（正弦褶 + 底部外扩），法线按位移重算，布纹按真实尺度平铺
        const pw = 0.52, ph = top - bottom - 0.03, folds = 7
        const g = new THREE.PlaneGeometry(pw, ph, folds * 6, 8)
        const pos = g.getAttribute('position'), uv = g.getAttribute('uv')
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i), y = pos.getY(i)
          const tY = (y + ph / 2) / ph // 0=底 1=顶
          const amp = 0.028 + 0.018 * (1 - tY)
          const ph0 = ((x + pw / 2) / pw) * folds * Math.PI * 2
          pos.setZ(i, Math.sin(ph0) * amp + Math.sin(ph0 * 0.5 + 1.3) * 0.006)
          pos.setX(i, x * (1 + 0.08 * (1 - tY)))
          uv.setXY(i, (x * 1.6) / unit, y / unit) // 褶皱展开后的布幅约 1.6 倍
        }
        g.computeVertexNormals()
        c.add(cm, g, s * (len / 2 + 0.06), bottom + ph / 2, 0.1)
        for (let k = 0; k < 8; k++) c.add(this.M.steel(), new THREE.TorusGeometry(0.018, 0.003, 4, 10), s * (len / 2 + 0.06) + (k / 7 - 0.5) * pw * 0.95, top, 0.12, 0, 0, 0)
      }
    }
  }

  // ------------------------------------------------------------ 门
  private buildDoor(d: FoyerDoor, batch: Batch) {
    const len = d.b - d.a, mid = (d.a + d.b) / 2
    const lining = this.mats.lit('doorframe', { color: d.style === 'security' ? '#5a5146' : '#f2efe8', roughness: 0.45 })
    const leafMat = d.style === 'security' ? this.mats.lit('door-sec', { color: '#5b4a3a', roughness: 0.45, metalness: 0.35 })
      : d.style === 'bath' ? this.mats.lit('door-bath', { color: '#efece4', roughness: 0.35 }) : this.mats.pbr('door-oak', { set: 'oak', color: '#f6e2c8', roughness: 0.65, env: 0.35 })
    // 门套（两侧 + 顶）
    const sc = new Ctx(batch, this.group, new THREE.Matrix4(), this.mats)
    const T = d.style === 'security' ? 0.24 : FOYER_WALL_T + 0.04, fw = 0.06
    if (d.axis === 'x') {
      const z = d.style === 'security' ? d.at + 0.06 : d.at
      sc.box(lining, fw, FOYER_DOOR_H + fw, T, d.a - fw / 2 + 0.001, 0, z); sc.box(lining, fw, FOYER_DOOR_H + fw, T, d.b + fw / 2 - 0.001, 0, z)
      sc.box(lining, len + fw * 2, fw, T, mid, FOYER_DOOR_H, z)
      if (d.style === 'security') { // 防盗门门洞上方墙体（瓦片外墙中的门洞顶）
        const wall = this.wallMat('paintWarm')
        sc.box(wall, 1, H - FOYER_DOOR_H - fw, 1, 5.5, FOYER_DOOR_H + fw, 14.5, 2)
      }
    } else {
      sc.box(lining, T, FOYER_DOOR_H + fw, fw, d.at, 0, d.a - fw / 2); sc.box(lining, T, FOYER_DOOR_H + fw, fw, d.at, 0, d.b + fw / 2)
      sc.box(lining, T, fw, len + fw * 2, d.at, FOYER_DOOR_H, mid)
    }
    // 门扇（可动铰链组）
    const pivot = new THREE.Group()
    pivot.name = 'foyer-door-' + d.id
    const hx = d.hinge === 'a' ? d.a : d.b
    if (d.axis === 'x') pivot.position.set(hx, 0, d.at)
    else pivot.position.set(d.at, 0, hx)
    if (d.axis === 'y') pivot.rotation.y = -Math.PI / 2
    const leaf = new THREE.Group()
    pivot.add(leaf)
    const dir = d.hinge === 'a' ? 1 : -1 // 门扇从铰链向 +x 或 -x 延伸
    const lc = new Ctx(null, leaf, new THREE.Matrix4(), this.mats)
    const lw = len - 0.01, th = d.style === 'security' ? 0.07 : 0.04
    lc.box(leafMat, lw, FOYER_DOOR_H - 0.01, th, dir * lw / 2, 0.005, 0)
    if (d.style === 'security') {
      const panel = this.mats.lit('door-sec-panel', { color: '#4d3f31', roughness: 0.5, metalness: 0.3 })
      for (const zz of [-1, 1]) { lc.box(panel, lw - 0.16, 0.8, 0.01, dir * lw / 2, 0.18, zz * (th / 2 + 0.004)); lc.box(panel, lw - 0.16, 0.8, 0.01, dir * lw / 2, 1.12, zz * (th / 2 + 0.004)) }
      lc.cyl(this.M.chrome(), 0.012, 0.012, 0.02, dir * lw / 2, 1.55, th / 2 + 0.01, 12, Math.PI / 2) // 猫眼
      lc.box(this.M.graphite(), 0.05, 0.28, 0.03, dir * (lw - 0.08), 0.92, -(th / 2 + 0.015)) // 智能锁面板
      lc.box(this.M.graphite(), 0.05, 0.28, 0.03, dir * (lw - 0.08), 0.92, th / 2 + 0.015)
    } else {
      // 简约门：浅凹槽线
      const groove = this.mats.lit('groove-' + d.style, { color: d.style === 'bath' ? '#d9d5cc' : '#a07e58', roughness: 0.6 })
      for (const zz of [-1, 1]) for (const yy of [0.7, 1.45]) lc.box(groove, lw - 0.2, 0.008, 0.004, dir * lw / 2, yy, zz * (th / 2 + 0.001))
      if (d.style === 'bath') lc.box(this.mats.lit('frosted', { color: '#e6eef0', roughness: 0.15, transparent: true, opacity: 0.7 }), lw * 0.32, 1.1, th + 0.004, dir * lw / 2, 0.85, 0)
    }
    // 把手（两面）
    for (const zz of [-1, 1]) {
      lc.cyl(this.M.chrome(), 0.025, 0.025, 0.012, dir * (lw - 0.07), 0.98, zz * (th / 2 + 0.006), 14, Math.PI / 2)
      lc.box(this.M.chrome(), 0.12, 0.016, 0.016, dir * (lw - 0.11), 0.972, zz * (th / 2 + 0.04))
    }
    this.group.add(pivot)
    // 打开方向：swing=-1 → 门扇转向 -z（北）一侧；绕 Y 旋转 θ 时局部 +x 变为 (cosθ,0,-sinθ)
    this.dynamics.push({ id: d.id, pivot: leaf, kind: 'hinge', axis: 'y', amount: -d.swing * dir * (Math.PI / 2), cur: 0 })
  }

  /** 精细物品模型的材质工厂：前厅 PBR（含逐顶点烘焙注入）/ 亮屏用不受光材质。 */
  private itemMats: ItemMatFactory = (k, p) => p.basic
    ? this.mats.basic('itm-' + k, { color: p.color, map: p.map ?? undefined, toneMapped: false })
    : this.mats.lit('itm-' + k, { color: p.color, map: p.map ?? undefined, roughness: p.roughness, metalness: p.metalness, transparent: p.transparent, opacity: p.opacity, side: p.side, envBase: (p.metalness ?? 0) > 0.5 ? 0.8 : 0.35 })

  // ------------------------------------------------------------ 可拾取物（独立网格，按 prologue.flags 显隐）
  private buildPickups() {
    const at = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, z, y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1))
    const holder = (name: string, m: THREE.Matrix4) => { const g = new THREE.Group(); g.name = name; g.applyMatrix4(m); this.group.add(g); return { g } }
    { // 背包：深灰双肩包，立在衣柜下层隔板上（精细模型 + 像素布料贴图：foyerItemModels.ts）
      const q = FOYER_PICKUP_POS.backpack
      const { g } = holder('foyer-backpack', at(q.x, q.y, q.z, Math.PI + 0.15))
      g.add(buildFoyerBackpack(this.itemMats))
      this.pickups.set('backpack', g)
    }
    { // 床底手电（滚到床底靠外侧，蹲下可见）
      const q = FOYER_PICKUP_POS.flashlight_bed
      const fl = buildFlashlightMesh({ lit: false })
      fl.rotation.set(0, 0.6, Math.PI / 2); fl.position.set(q.x, q.z + 0.025, q.y)
      fl.name = 'foyer-flashlight-bed'
      this.group.add(fl)
      this.pickups.set('flashlight_bed', fl)
    }
    { // 冰箱：瓶装水（中层，两瓶）与能量棒（上层，两条叠放）——精细模型 + 像素贴图
      const q = FOYER_PICKUP_POS.water
      const { g } = holder('foyer-water', at(q.x, q.y, q.z))
      for (const dx of [0, 0.075]) { const b = buildFoyerWater(this.itemMats); b.position.x = dx; b.rotation.y = dx * 20; g.add(b) }
      this.pickups.set('water', g)
      const r = FOYER_PICKUP_POS.snack
      const s2 = holder('foyer-snack', at(r.x, r.y, r.z, 0.3))
      const a = buildFoyerSnack(this.itemMats), b = buildFoyerSnack(this.itemMats)
      b.position.set(0.01, 0.0225, 0.01); b.rotation.y = 0.12
      s2.g.add(a, b)
      this.pickups.set('snack', s2.g)
    }
  }

  // ------------------------------------------------------------ 家具
  private propMatrix(p: FoyerProp): THREE.Matrix4 {
    return new THREE.Matrix4().compose(new THREE.Vector3(p.x, 0, p.y), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (p.rot * Math.PI) / 180, 0)), new THREE.Vector3(1, 1, 1))
  }
  /** 动态子部件：在道具局部系的某点建立铰链/滑轨组。 */
  private dyn(p: FoyerProp, id: string, kind: 'hinge' | 'slide', lx: number, ly: number, lz: number, amount: number): Ctx {
    const holder = new THREE.Group()
    holder.applyMatrix4(this.propMatrix(p))
    const pivot = new THREE.Group()
    pivot.position.set(lx, ly, lz)
    holder.add(pivot)
    this.group.add(holder)
    this.dynamics.push({ id, pivot, kind, axis: kind === 'hinge' ? 'y' : 'z', amount, cur: 0 })
    return new Ctx(null, pivot, new THREE.Matrix4(), this.mats)
  }

  private buildProp(p: FoyerProp, batch: Batch) {
    const c = new Ctx(batch, this.group, this.propMatrix(p), this.mats)
    const W = p.rot % 180 === 0 ? p.w : p.d // 局部宽（x）
    const D = p.rot % 180 === 0 ? p.d : p.w // 局部深（z）
    const M = this.M
    const back = -D / 2
    switch (p.kind) {
      case 'desk': {
        const top = 0.76
        c.box(M.oak(), W, 0.03, D, 0, top - 0.03, 0, 1)
        c.box(M.white(), 0.03, top - 0.03, D - 0.04, -W / 2 + 0.03, 0, 0)
        c.box(M.white(), 0.03, top - 0.03, D - 0.04, W / 2 - 0.03, 0, 0)
        c.box(M.white(), W - 0.06, 0.5, 0.015, 0, 0.2, back + 0.03)
        // 抽屉柜体（左侧，抽屉本体为动态部件 desk_drawer）
        c.box(M.white(), 0.46, 0.012, D - 0.06, W / 2 - 0.28, top - 0.18, 0)
        c.box(M.white(), 0.012, 0.18, D - 0.06, W / 2 - 0.51, top - 0.18, 0)
        // 桌面杂物：笔筒、便签、耳机、马克杯
        c.cyl(M.graphite(), 0.035, 0.035, 0.1, W / 2 - 0.12, top, back + 0.12, 14)
        for (let i = 0; i < 4; i++) c.cyl(i % 2 ? M.black() : M.terracotta(), 0.004, 0.004, 0.14, W / 2 - 0.12 + (i - 1.5) * 0.012, top + 0.04, back + 0.12, 6)
        c.box(this.mats.lit('sticky', { color: '#f6d860', roughness: 0.9 }), 0.08, 0.004, 0.08, -0.15, top, D / 2 - 0.12, 0, 0.3)
        c.cyl(M.ceramic(), 0.04, 0.036, 0.095, 0.38, top, D / 2 - 0.16, 18)
        c.cyl(this.mats.lit('coffee', { color: '#3b2416', roughness: 0.2 }), 0.036, 0.036, 0.002, 0.38, top + 0.085, D / 2 - 0.16, 18)
        // 耳机
        c.add(M.black(), new THREE.TorusGeometry(0.08, 0.012, 8, 20, Math.PI), -0.42, top + 0.012, D / 2 - 0.18, 0, -Math.PI / 2)
        c.cushion(M.black(), 0.06, 0.03, 0.07, -0.5, top, D / 2 - 0.18, 0.012); c.cushion(M.black(), 0.06, 0.03, 0.07, -0.34, top, D / 2 - 0.18, 0.012)
        break
      }
      case 'deskdrawer': {
        const dc = this.dyn(p, 'desk_drawer', 'slide', 0, 0, 0, 0.32)
        const top = 0.76
        const tray = new Batch(), tc = new Ctx(tray, dc.root, new THREE.Matrix4(), this.mats)
        drawerTray(tc, M.white(), W - .03, .15, D - .04, top - .18, -.02); tray.flush(dc.root, 'foyer-desk-drawer-tray')
        dc.box(M.white(), W - 0.01, 0.16, 0.018, 0, top - 0.185, D / 2 - 0.01)
        dc.box(M.chrome(), 0.14, 0.012, 0.02, 0, top - 0.11, D / 2 + 0.01)
        // 抽屉里的旧物（钥匙、电池、笔记本）
        dc.box(this.mats.lit('notebook', { color: '#344a5e', roughness: 0.8 }), 0.15, 0.015, 0.21, -0.05, top - 0.165, -0.05)
        dc.cyl(this.mats.lit('battery', { color: '#c9a227', roughness: 0.4, metalness: 0.5 }), 0.007, 0.007, 0.05, 0.08, top - 0.16, 0.02, 8, 0, Math.PI / 2)
        break
      }
      case 'computer': {
        const top = 0.76
        // 显示器（27 寸）
        c.box(M.graphite(), 0.2, 0.012, 0.16, 0, top, -0.02)
        c.box(M.graphite(), 0.04, 0.28, 0.025, 0, top, -0.06)
        c.box(M.black(), 0.62, 0.37, 0.025, 0, top + 0.2, -0.05)
        const scr = this.mats.basic('pc-screen', { map: TX.computerScreenTex(), toneMapped: false, color: '#d8dcdf' })
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.338), scr)
        screen.applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.propMatrix(p), new THREE.Matrix4().makeTranslation(0, top + 0.385, -0.036)))
        screen.name = 'foyer-pc-screen'
        this.group.add(screen); this.screens.push(screen)
        // 屏幕光晕（桌面上的冷光反射用一片半透明面近似）
        c.plane(this.mats.basic('pc-glow', { color: '#9fb8ff', transparent: true, opacity: 0.06, depthWrite: false }), 0.9, 0.5, 0, top + 0.002, 0.22, 0, -Math.PI / 2)
        // 键盘、鼠标、鼠标垫
        c.box(this.mats.lit('deskmat', { color: '#2b2d31', roughness: 0.95 }), 0.8, 0.003, 0.32, 0.05, top, 0.25)
        c.box(M.graphite(), 0.42, 0.018, 0.13, -0.03, top + 0.003, 0.22)
        for (let r = 0; r < 4; r++) c.box(M.black(), 0.4, 0.006, 0.022, -0.03, top + 0.021, 0.17 + r * 0.028)
        c.cushion(M.graphite(), 0.06, 0.03, 0.1, 0.32, top + 0.003, 0.24, 0.025)
        // 主机（桌下）
        c.box(M.black(), 0.2, 0.44, 0.42, -0.45, 0, -0.02)
        c.box(M.led(), 0.004, 0.3, 0.004, -0.45 + 0.101, 0.07, 0.15)
        break
      }
      case 'phonedock': {
        const top = 0.76
        c.box(M.white(), 0.075, 0.012, 0.11, 0, top, 0)
        c.cyl(M.white(), 0.002, 0.002, 0.5, -0.03, top - 0.25, back, 4)
        const ph = new THREE.Group()
        const auditPrev = foyerAudit.key; foyerAudit.key = null // 独立网格（先在原点建模再整体变换），不计入书桌包围盒
        // 手机：精细模型（圆角边框/亮屏像素锁屏/背面摄像头/侧键：foyerItemModels.ts）
        const phone = buildFoyerPhone(this.itemMats)
        phone.position.y = top + 0.012
        ph.add(phone)
        ph.applyMatrix4(this.propMatrix(p))
        foyerAudit.key = auditPrev
        ph.name = 'foyer-phone'
        this.group.add(ph)
        this.pickups.set('phone', ph)
        break
      }
      case 'desklamp': {
        const top = 0.76
        c.cyl(M.graphite(), 0.07, 0.075, 0.02, 0, top, 0, 18)
        c.add(M.graphite(), new THREE.CylinderGeometry(0.008, 0.008, 0.38, 8), 0, top + 0.2, 0, 0, 0, 0.25)
        c.add(M.graphite(), new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8), 0.08, top + 0.47, 0, 0, 0, -0.9)
        // 灯罩开口朝下、略向外（与 foyerBake.foyerDeskLamp 的聚光方向一致）；双面渲染，内壁可见
        c.add(this.mats.lit('lampshade-dk', { color: '#3a3c40', roughness: 0.4, metalness: 0.3, envBase: 0.45, side: THREE.DoubleSide }), new THREE.ConeGeometry(0.075, 0.13, 20, 1, true), 0.21, top + 0.52, 0, 0, 0, 0.5)
        c.sphere(M.bulb(), 0.022, 0.23, top + 0.48, 0)
        break
      }
      case 'deskchair': {
        c.cyl(M.chrome(), 0.025, 0.025, 0.36, 0, 0.06, 0, 10)
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; c.box(M.black(), 0.03, 0.03, 0.3, Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, 0, a); c.sphere(M.black(), 0.025, Math.sin(a) * 0.29, 0.025, Math.cos(a) * 0.29) }
        c.cushion(M.sofaDark(), 0.48, 0.08, 0.46, 0, 0.42, 0, 0.03)
        c.cushion(M.sofaDark(), 0.44, 0.55, 0.07, 0, 0.55, -0.23, 0.03, 0, -0.12)
        c.box(M.black(), 0.03, 0.2, 0.25, -0.25, 0.48, -0.02); c.box(M.black(), 0.03, 0.2, 0.25, 0.25, 0.48, -0.02)
        // 椅背上搭着外套
        c.cushion(this.M.fabric('jacket', '#3a4757', 'wool'), 0.46, 0.32, 0.05, 0, 0.82, -0.29, 0.02, 0, 0.2)
        break
      }
      case 'bed': {
        const fh = 0.32
        c.box(M.walnut(), W, fh - 0.08, D, 0, 0.08, 0, 1)
        c.box(M.walnut(), W + 0.04, 0.95, 0.06, 0, 0, back + 0.03, 1) // 床头板
        c.cushion(M.sofa(), W - 0.08, 0.5, 0.06, 0, 0.42, back + 0.08, 0.025) // 软包
        c.cushion(M.linen(), W - 0.06, 0.2, D - 0.1, 0, fh, 0.02, 0.06) // 床垫
        c.cushion(M.duvet(), W + 0.02, 0.09, D * 0.66, 0, fh + 0.16, D * 0.17, 0.045) // 被子
        c.cushion(M.duvet(), W + 0.03, 0.18, 0.06, 0, fh + 0.02, D / 2 - 0.02, 0.03)
        c.cushion(M.linen(), 0.58, 0.13, 0.36, -0.36, fh + 0.2, back + 0.3, 0.06, 0.06)
        c.cushion(M.linen(), 0.58, 0.13, 0.36, 0.36, fh + 0.2, back + 0.3, 0.06, -0.08)
        c.cushion(M.mustard(), 0.4, 0.3, 0.1, 0.1, fh + 0.24, back + 0.5, 0.05, 0.2, -0.3)
        // 床脚（床底留 8cm 空隙：可蹲下查看）
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(M.black(), 0.05, 0.08, 0.05, sx * (W / 2 - 0.06), 0, sz * (D / 2 - 0.06))
        // 床底的收纳盒（隐约可见）
        c.box(this.mats.lit('storagebox', { color: '#8d8a83', roughness: 0.8 }), 0.55, 0.07, 0.4, -0.2, 0.005, 0.25)
        break
      }
      case 'nightstand': {
        cabinetCase(c, M.walnut(), W, .5, D, 0, .04)
        c.box(M.walnut(), W - .04, .018, D - .03, 0, .32, -.01, 1)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(M.black(), 0.025, 0.04, 0.025, sx * (W / 2 - 0.04), 0, sz * (D / 2 - 0.04))
        const dc = this.dyn(p, 'nightstand', 'slide', 0, 0, 0, 0.22)
        dc.box(M.walnut(), W - 0.04, 0.16, 0.02, 0, 0.36, D / 2 + 0.005, 1)
        dc.box(M.brass(), 0.08, 0.012, 0.015, 0, 0.44, D / 2 + 0.022)
        const tray = new Batch(), tc = new Ctx(tray, dc.root, new THREE.Matrix4(), this.mats)
        drawerTray(tc, M.birch(), W - .06, .12, D - .06, .37, -.01); tray.flush(dc.root, 'foyer-nightstand-tray')
        { // 抽屉里的手电（按种子二选一的藏处之一；随抽屉滑出）
          const fl = buildFlashlightMesh({ lit: false })
          fl.rotation.set(0, Math.PI / 2, 0); fl.position.set(0.075, 0.437, 0.1); fl.scale.setScalar(0.65)
          fl.name = 'foyer-flashlight-drawer'
          dc.root.add(fl)
          this.pickups.set('flashlight_drawer', fl)
        }
        // 台面：闹钟、书、眼镜盒
        c.box(this.mats.lit('book1', { color: '#7a2e2e', roughness: 0.8 }), 0.16, 0.03, 0.22, -0.08, 0.54, 0.02, 0, 0.2)
        c.box(M.black(), 0.1, 0.06, 0.05, 0.12, 0.54, -0.06)
        c.plane(this.mats.basic('clockled', { color: '#ff5a3c' }), 0.07, 0.03, 0.12, 0.57, -0.034)
        break
      }
      case 'wardrobe': {
        const h = 2.2
        cabinetCase(c, M.white(), W, h, D - .02, 0, 0, -.01)
        c.box(M.white(), W, 0.08, D, 0, 0, 0) // 踢脚
        // 两扇门（动态）
        for (const s of [-1, 1]) {
          const dw = W / 2 - 0.006
          const hx = s * (W / 2 - 0.003)
          const dc = this.dyn(p, 'wardrobe', 'hinge', hx, 0, D / 2, s * 1.6)
          dc.box(this.mats.pbr('wardrobe-door', { set: 'maple', color: '#efe4d2', roughness: 0.7, env: 0.3 }), dw, h - 0.1, 0.02, -s * dw / 2, 0.09, 0.01)
          dc.box(M.brass(), 0.015, 0.4, 0.02, -s * (dw - 0.06), 0.95, 0.03)
        }
        // 柜内（打开可见：挂衣杆、衣物、背包位置）
        c.cyl(M.chrome(), 0.012, 0.012, W - 0.08, 0, 1.85, 0, 8, 0, Math.PI / 2)
        const cols = ['#3a4a5e', '#d8d0c0', '#5a2f2f', '#2d2d2d', '#7a8a6a', '#b0a08a']
        for (let i = 0; i < 8; i++) c.cushion(this.M.fabric('cloth' + (i % 6), cols[i % 6], i % 2 ? 'jersey' : 'linen'), 0.05, 0.9 - (i % 3) * 0.15, D - 0.18, -W / 2 + 0.2 + i * 0.12, 0.95 + (i % 3) * 0.15, 0, 0.02)
        c.box(M.white(), W - 0.04, 0.02, D - 0.06, 0, 0.66, -0.01)
        break
      }
      case 'figshelf': {
        const h = 1.85
        c.box(M.birch(), W, 0.02, D, 0, h - 0.02, 0, 1)
        c.box(M.birch(), 0.02, h, D, -W / 2 + 0.01, 0, 0, 1); c.box(M.birch(), 0.02, h, D, W / 2 - 0.01, 0, 0, 1)
        c.box(M.birch(), W, h, 0.01, 0, 0, back + 0.005, 1)
        for (let i = 0; i < 5; i++) {
          const y = 0.04 + i * 0.44
          c.box(M.birch(), W - 0.02, 0.02, D, 0, y, 0, 1)
          if (i === 4) continue
          if (i % 2 === 0) {
            const bm = this.mats.lit('books' + i, { map: TX.booksTex(70 + i), roughness: 0.8 })
            c.plane(bm, W - 0.06, 0.32, 0, y + 0.18, D / 2 - 0.06)
            c.box(this.mats.lit('bookblock', { color: '#2a2420', roughness: 0.9 }), W - 0.06, 0.3, D - 0.1, 0, y + 0.02, -0.03)
          } else {
            // 后室周边手办：黄色小走廊模型、笑魇小摆件、VHS 磁带
            c.box(this.mats.lit('fig-l0', { color: '#d6c06a', roughness: 0.7 }), 0.2, 0.14, 0.14, -W * 0.2, y + 0.02, 0)
            c.box(this.mats.lit('fig-l0w', { color: '#f6f0c8', roughness: 0.4 }), 0.12, 0.01, 0.02, -W * 0.2, y + 0.16, 0)
            c.sphere(M.black(), 0.045, W * 0.12, y + 0.07, 0)
            c.plane(this.mats.basic('smile', { map: TX.labelTex('= )', '#f4f4f4'), transparent: true }), 0.08, 0.03, W * 0.12, y + 0.08, 0.046)
            c.box(this.mats.lit('vhs', { color: '#151515', roughness: 0.5 }), 0.19, 0.105, 0.025, W * 0.3, y + 0.02, -0.03, 0, 0.1)
            c.box(this.mats.lit('vhs-label', { color: '#ffffff', map: foyerItemTex('vhs_label'), roughness: 0.8 }), 0.12, 0.05, 0.002, W * 0.3, y + 0.045, -0.016, 0, 0.1)
          }
        }
        break
      }
      case 'rug': case 'rug2': {
        const m2 = this.mats.lit('rugmat-' + p.kind, { map: TX.rugTex(p.kind === 'rug' ? 'bed' : 'living'), roughness: 1 })
        c.box(m2, W, 0.012, D, 0, 0, 0)
        break
      }
      case 'poster': case 'poster2': case 'framedart': {
        const kind = p.kind === 'poster' ? 'level0' : p.kind === 'poster2' ? 'vhs' : 'art'
        const pw = W, ph = p.kind === 'framedart' ? pw * 0.7 : pw * 1.5
        const y = p.kind === 'framedart' ? 1.25 : p.kind === 'poster' ? 1.42 : 1.2
        const fm = p.kind === 'framedart' ? M.walnut() : M.black()
        c.box(fm, pw + 0.04, ph + 0.04, 0.02, 0, y, back + 0.01)
        c.plane(this.mats.lit('poster-' + kind, { map: TX.posterTex(kind), roughness: 0.6 }), pw, ph, 0, y + ph / 2 + 0.02, back + 0.021)
        break
      }
      case 'laundry': {
        c.cyl(this.mats.lit('basket', { color: '#c9b48e', roughness: 0.9 }), 0.22, 0.19, 0.45, 0, 0, 0, 16)
        c.cushion(this.M.fabric('cloth-l', '#9aa6b2'), 0.32, 0.12, 0.3, 0, 0.4, 0, 0.05)
        break
      }
      case 'stairlamp': // 楼道声控灯灯具由 buildCorridorLamp 构建（合并后只保留一份模型，灯罩亮度随 corridorLevel）
        break
      case 'ceilinglamp': {
        c.cyl(M.white(), 0.24, 0.26, 0.04, 0, H - 0.05, 0, 28)
        c.cyl(this.mats.basic('lampdisc', { color: '#fff3dc' }), 0.22, 0.22, 0.005, 0, H - 0.056, 0, 28)
        break
      }
      case 'pendant': {
        const ns = this.mats.get('pendant-ns', () => { const m = this.mats.lit('pendant-base', { color: '#1c1c1e', roughness: 0.45, envBase: 0.35, side: THREE.DoubleSide }); m.userData.noShadow = true; return m })
        c.cyl(ns, 0.004, 0.004, H - 2.15, 0, 2.15, 0, 6)
        c.add(ns, new THREE.ConeGeometry(0.13, 0.16, 20, 1, true), 0, 2.13, 0)
        c.sphere(M.bulb(), 0.04, 0, 2.06, 0)
        break
      }
      case 'shower': {
        c.box(M.ceramic(), W, 0.05, D, 0, 0, 0)
        c.box(M.chrome(), 0.02, 2.0, 0.02, -W / 2 + 0.01, 0.05, D / 2 - 0.01)
        c.plane(M.glass(), D - 0.02, 1.95, -W / 2 + 0.01, 1.03, 0, Math.PI / 2)
        c.plane(M.glass(), W - 0.4, 1.95, 0.2, 1.03, D / 2 - 0.01)
        c.cyl(M.chrome(), 0.012, 0.012, 1.2, W / 2 - 0.12, 0.9, back + 0.03, 8)
        c.cyl(M.chrome(), 0.11, 0.11, 0.01, W / 2 - 0.3, 2.05, back + 0.25, 24)
        c.box(M.chrome(), 0.02, 0.02, 0.24, W / 2 - 0.3, 2.06, back + 0.12)
        c.cyl(M.chrome(), 0.004, 0.004, 0.03, W / 2 - 0.4, 0.06, 0, 8) // 地漏
        // 洗浴用品
        c.cyl(this.mats.lit('bottle1', { color: '#3d7ea6', roughness: 0.3 }), 0.03, 0.03, 0.2, W / 2 - 0.12, 0.95, back + 0.05)
        c.cyl(this.mats.lit('bottle2', { color: '#f2f2f2', roughness: 0.3 }), 0.028, 0.028, 0.18, W / 2 - 0.2, 0.95, back + 0.05)
        break
      }
      case 'toilet': {
        c.cushion(M.ceramic(), 0.36, 0.36, 0.5, 0, 0, 0.02, 0.1)
        c.cushion(M.ceramic(), 0.38, 0.04, 0.48, 0, 0.36, 0.04, 0.02)
        c.cushion(M.ceramic(), 0.4, 0.4, 0.16, 0, 0.4, back + 0.08, 0.03)
        c.box(M.chrome(), 0.05, 0.012, 0.03, 0, 0.8, back + 0.08)
        // 卷纸（壁挂卷纸架：底座贴墙）
        c.box(M.chrome(), 0.14, 0.05, 0.01, 0.32, 0.72, back + 0.005)
        c.cyl(M.chrome(), 0.006, 0.006, 0.12, 0.32, 0.745, back + 0.065, 8, 0, Math.PI / 2)
        c.cyl(M.paper(), 0.05, 0.05, 0.1, 0.32, 0.745, back + 0.065, 14, 0, Math.PI / 2)
        break
      }
      case 'vanity': {
        cabinetCase(c, M.walnut(), W, .6, D, 0, .25)
        for (const sign of [-1, 1]) c.box(M.walnut(), W / 2 - .006, .56, .018, sign * W / 4, .27, D / 2 - .009, 1)
        c.box(M.ceramic(), W + 0.02, 0.06, D + 0.01, 0, 0.82, 0.005) // 台面背边贴墙
        c.cyl(this.mats.lit('basin', { color: '#e9e9e4', roughness: 0.12 }), 0.17, 0.15, 0.02, 0, 0.865, 0.03, 24)
        c.cyl(M.chrome(), 0.012, 0.012, 0.2, 0, 0.86, back + 0.07, 10)
        c.box(M.chrome(), 0.02, 0.02, 0.12, 0, 1.04, back + 0.12)
        // 镜柜 + 灯带
        c.box(M.white(), W, 0.7, 0.12, 0, 1.18, back + 0.06)
        c.plane(M.mirror(), W - 0.04, 0.66, 0, 1.53, back + 0.121)
        c.box(this.mats.basic('vanitylight', { color: '#fff8ea' }), W - 0.1, 0.02, 0.03, 0, 1.9, back + 0.08)
        // 牙刷杯
        c.cyl(this.mats.lit('cup', { color: '#93b7be', roughness: 0.3 }), 0.035, 0.03, 0.1, W / 2 - 0.12, 0.88, back + 0.1)
        break
      }
      case 'washer': {
        c.cushion(M.whiteGloss(), W - 0.02, 0.85, D - 0.02, 0, 0, 0, 0.02)
        c.cyl(M.chrome(), 0.21, 0.21, 0.03, 0, 0.42, D / 2 - 0.01, 28, Math.PI / 2)
        c.cyl(this.mats.lit('washerglass', { color: '#405060', roughness: 0.05, metalness: 0.3 }), 0.17, 0.17, 0.032, 0, 0.42, D / 2 - 0.005, 28, Math.PI / 2)
        c.box(M.graphite(), W - 0.1, 0.08, 0.01, 0, 0.74, D / 2 - 0.005)
        c.plane(this.mats.basic('washer-lab', { map: TX.labelTex('LUMA', '#9aa'), transparent: true }), 0.12, 0.03, -0.18, 0.79, D / 2 + 0.001)
        break
      }
      case 'towel': {
        // 毛巾杆沿墙（局部 x），两端底座贴墙；毛巾对折搭在杆上
        c.cyl(M.chrome(), 0.01, 0.01, W - 0.1, 0, 1.45, back + 0.055, 8, 0, Math.PI / 2)
        for (const sx of [-1, 1]) { c.cyl(M.chrome(), 0.022, 0.022, 0.012, sx * (W / 2 - 0.05), 1.45, back + 0.006, 14, Math.PI / 2); c.cyl(M.chrome(), 0.008, 0.008, 0.05, sx * (W / 2 - 0.05), 1.45, back + 0.03, 8, Math.PI / 2) }
        c.cushion(this.M.fabric('towel', '#e0d0b4', 'wool'), W - 0.25, 0.55, 0.03, 0, 0.92, back + 0.04, 0.012)
        c.cushion(this.M.fabric('towel', '#e0d0b4', 'wool'), W - 0.25, 0.42, 0.03, 0, 1.05, back + 0.072, 0.012)
        break
      }
      case 'counter': {
        const top = 0.92
        cabinetCase(c, this.mats.lit('cab-front', { color: '#4c5b55', roughness: .55 }), W, top - .12, D - .06, 0, .1, -.03)
        c.box(M.black(), W, 0.1, D - 0.1, 0, 0, -0.05)
        c.box(this.mats.lit('quartz', { color: '#e9e6e0', roughness: 0.18, envBase: 0.65 }), W + 0.01, 0.03, D, 0, top - 0.03, 0, 1)
        const n = Math.max(1, Math.round(W / 0.6))
        for (let i = 0; i < n; i++) {
          const x = -W / 2 + (W / n) * (i + 0.5)
          c.box(this.mats.lit('cab-door', { color: '#55665f', roughness: 0.5 }), W / n - 0.006, top - 0.14, 0.018, x, 0.11, D / 2 - 0.05)
          c.box(M.steel(), 0.012, 0.012, 0.16, x + W / n / 2 - 0.06, top - 0.18, D / 2 - 0.03, 0)
        }
        // 防溅墙
        if (p.id === 'counter_n') c.plane(this.mats.lit('backsplash', { map: TX.backsplashTex(), roughness: 0.25, envBase: 0.5 }), W, 0.55, 0, top + 0.275, back + 0.0015)
        if (p.id === 'counter_w') c.plane(this.mats.lit('backsplash', { map: TX.backsplashTex(), roughness: 0.25, envBase: 0.5 }), W, 0.55, 0, top + 0.275, back + 0.0015)
        // 台面杂物
        if (p.id === 'counter_n') {
          c.box(M.oak(), 0.4, 0.025, 0.28, -1.6, top, 0.02) // 砧板
          c.cyl(M.steel(), 0.07, 0.07, 0.14, -1.25, top, -0.12, 18) // 刀架/罐
          c.cyl(this.mats.lit('jar', { color: '#c8a46a', roughness: 0.4 }), 0.05, 0.05, 0.16, -1.1, top, -0.16, 14)
          c.cyl(this.mats.lit('jar2', { color: '#d8d0bf', roughness: 0.4 }), 0.05, 0.05, 0.12, -0.98, top, -0.16, 14)
        }
        break
      }
      case 'sink': {
        const top = 0.92
        c.box(M.steel(), W, 0.012, D - 0.06, 0, top - 0.004, 0)
        c.box(this.mats.lit('sinkin', { color: '#8d9194', roughness: 0.35, metalness: 0.7 }), W - 0.08, 0.005, D - 0.16, 0, top - 0.18, 0)
        c.cyl(M.chrome(), 0.015, 0.018, 0.32, 0.18, top, back + 0.06, 10)
        c.add(M.chrome(), new THREE.TorusGeometry(0.1, 0.014, 8, 16, Math.PI), 0.18, top + 0.32, back + 0.16, Math.PI / 2, 0, 0)
        c.box(this.mats.lit('sponge', { color: '#f2c14e', roughness: 1 }), 0.09, 0.03, 0.06, -0.3, top, back + 0.08)
        break
      }
      case 'stove': {
        const top = 0.92
        c.box(this.mats.lit('cooktop', { color: '#111214', roughness: 0.08, envBase: 0.9 }), W, 0.008, D - 0.06, 0, top, 0)
        for (const [x, z, r] of [[-0.17, -0.1, 0.09], [0.17, -0.1, 0.07], [-0.17, 0.12, 0.07], [0.17, 0.12, 0.09]]) c.add(this.mats.lit('ring', { color: '#2a2a2c', roughness: 0.3 }), new THREE.TorusGeometry(r, 0.004, 4, 32), x, top + 0.01, z, 0, Math.PI / 2)
        // 锅
        c.cyl(M.steel(), 0.11, 0.1, 0.12, -0.17, top + 0.008, -0.1, 24)
        c.box(M.black(), 0.16, 0.02, 0.025, -0.32, top + 0.1, -0.1)
        c.box(M.graphite(), W, 0.6, 0.02, 0, 0.12, D / 2 - 0.04) // 烤箱门
        c.box(this.mats.lit('ovenglass', { color: '#1a1c20', roughness: 0.05, envBase: 0.9 }), W - 0.14, 0.3, 0.004, 0, 0.25, D / 2 - 0.028)
        c.box(M.steel(), W - 0.16, 0.015, 0.02, 0, 0.66, D / 2 - 0.01)
        break
      }
      case 'fridge': {
        const h = 1.86
        cabinetCase(c, M.steel(), W, h, D - .04, 0, 0, -.02, .04)
        const liner = this.mats.lit('fridge-liner', { color: '#e6e9e6', roughness: .48 })
        cabinetCase(c, liner, W - .07, h - .08, D - .1, 0, .04, -.015, .016)
        // Molded liner and real vent slots replace the old flat picture of food.
        const vent = this.mats.lit('fridge-vent', { color: '#929b96', roughness: .8 })
        for (let i=0;i<4;i++) c.box(vent,.12,.006,.004,0,1.53+i*.021,back+.06)
        for (const y of [.94, 1.36]) {
          c.box(liner, W - .12, .02, D - .16, 0, y, -.025)
          c.box(M.chrome(), W - .12, .008, .012, 0, y + .012, D / 2 - .105)
        }
        // Crisper and upper freezer compartment leave a genuinely recessed interior.
        c.box(liner, W - .12, .02, D - .16, 0, .3, -.025)
        c.box(liner, W - .12, .17, .018, 0, .13, D / 2 - .105)
        c.box(liner, W - .12, .025, D - .16, 0, 1.65, -.025)
        // 冰箱门（左铰链，动态）
        const dc = this.dyn(p, 'fridge', 'hinge', -W / 2, 0, D / 2 - 0.04, -1.75)
        dc.box(M.steel(), W - 0.01, h - 0.02, 0.05, W / 2, 0.01, 0.025)
        dc.box(M.chrome(), 0.02, 0.6, 0.03, W - 0.07, 0.8, 0.07)
        dc.plane(this.mats.basic('fridge-lab', { map: TX.labelTex('NORDA', '#666'), transparent: true }), 0.12, 0.03, W / 2, h - 0.12, 0.051)
        // 门内搁架（打开可见）
        const bins = new Batch(), bc = new Ctx(bins,dc.root,new THREE.Matrix4(),this.mats)
        for (let i = 0; i < 3; i++) {
          const y = .4 + i * .45
          bc.box(M.plastic(), W - .12, .012, .085, W / 2, y, -.038)
          bc.box(M.plastic(), W - .12, .07, .009, W / 2, y + .012, -.076)
          for (const x of [.067, W - .067]) bc.box(M.plastic(), .014, .07, .085, x, y + .012, -.038)
        }
        bins.flush(dc.root,'foyer-fridge-door-bins')
        // 冰箱贴与便条
        dc.box(this.mats.lit('magnet', { color: '#d33', roughness: 0.4 }), 0.04, 0.04, 0.01, W / 2 - 0.1, 1.4, 0.055)
        dc.box(M.paper(), 0.1, 0.14, 0.002, W / 2 - 0.1, 1.27, 0.052)
        break
      }
      case 'uppercab': {
        const y0 = 1.5, h = 0.72
        cabinetCase(c, this.mats.lit('upper', { color: '#ece9e2', roughness: .5 }), W, h, D, 0, y0)
        if (W > 0.3) for (let i = 0; i < Math.max(1, Math.round(W / 0.45)); i++) {
          const n = Math.max(1, Math.round(W / 0.45)), x = -W / 2 + (W / n) * (i + 0.5)
          c.box(this.mats.lit('upper-door', { color: '#f1eee8', roughness: 0.45 }), W / n - 0.006, h - 0.01, 0.015, x, y0 + 0.005, D / 2)
          c.box(M.steel(), 0.012, 0.12, 0.012, x + W / n / 2 - 0.05, y0 + 0.05, D / 2 + 0.015)
        }
        c.box(this.mats.basic('underlight', { color: '#fff4dd' }), W - 0.04, 0.008, 0.03, 0, y0 - 0.008, D / 2 - 0.05)
        break
      }
      case 'hood': {
        c.box(M.steel(), W, 0.12, D, 0, 1.68, 0)
        c.box(M.steel(), 0.26, H - 1.8, 0.24, 0, 1.8, back + 0.12)
        c.box(this.mats.basic('hoodlight', { color: '#fff2d8' }), 0.08, 0.004, 0.08, 0, 1.678, 0.05)
        break
      }
      case 'island': {
        const top = 0.92
        cabinetCase(c, this.mats.lit('cab-front', { color: '#4c5b55', roughness: .55 }), W - .1, top - .12, D - .2, 0, .1, -.06)
        c.box(this.mats.lit('cab-front', { color: '#4c5b55', roughness: .55 }), W - .14, top - .17, .018, 0, .12, (D - .2) / 2 - .065)
        c.box(M.black(), W - 0.14, 0.1, D - 0.26, 0, 0, -0.06)
        c.box(this.mats.lit('quartz', { color: '#e9e6e0', roughness: 0.18, envBase: 0.65 }), W, 0.04, D, 0, top - 0.04, 0, 1)
        // 果盘、水壶、外卖单
        c.cyl(M.ceramic(), 0.14, 0.09, 0.06, -0.6, top, 0, 24)
        for (let i = 0; i < 4; i++) c.sphere(this.mats.lit('fruit' + (i % 2), { color: i % 2 ? '#d94b2b' : '#e8b934', roughness: 0.5 }), 0.04, -0.6 + (i - 1.5) * 0.05, top + 0.08, (i % 2) * 0.03)
        c.box(M.paper(), 0.15, 0.002, 0.21, 0.5, top, 0.05, 0, 0.3)
        c.cyl(this.mats.lit('bottle-w', { color: '#9bc4d8', roughness: 0.1, transparent: true, opacity: 0.6 }), 0.035, 0.035, 0.24, 0.85, top, -0.08, 14)
        break
      }
      case 'stool': {
        c.cyl(M.black(), 0.16, 0.16, 0.05, 0, 0.62, 0, 20)
        c.cushion(this.mats.lit('leather', { color: '#6b4a32', roughness: 0.6 }), 0.32, 0.04, 0.32, 0, 0.66, 0, 0.015)
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.78; c.add(M.black(), new THREE.CylinderGeometry(0.012, 0.014, 0.66, 8), Math.sin(a) * 0.12, 0.335, Math.cos(a) * 0.12, 0, Math.cos(a) * 0.12, -Math.sin(a) * 0.12) } // 腿底落地（不穿地面）
        c.add(M.black(), new THREE.TorusGeometry(0.13, 0.008, 6, 20), 0, 0.25, 0, 0, Math.PI / 2)
        break
      }
      case 'microwave': {
        const top = 0.92
        c.box(M.graphite(), W, 0.28, D, 0, top, 0)
        c.box(this.mats.lit('mwglass', { color: '#111', roughness: 0.05, envBase: 0.9 }), W * 0.62, 0.2, 0.004, -W * 0.12, top + 0.04, D / 2)
        c.plane(this.mats.basic('mwclock', { color: '#58e0a0' }), 0.06, 0.02, W * 0.32, top + 0.2, D / 2 + 0.003)
        break
      }
      case 'kettle': {
        const top = 0.92
        c.cyl(M.steel(), 0.075, 0.085, 0.2, 0, top + 0.02, 0, 20)
        c.cyl(M.black(), 0.09, 0.09, 0.02, 0, top, 0, 20)
        c.box(M.black(), 0.025, 0.14, 0.03, -0.1, top + 0.05, 0)
        break
      }
      case 'sofa': {
        c.box(M.sofaDark(), W, 0.24, D, 0, 0.08, 0)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(M.walnut(), 0.04, 0.08, 0.04, sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.1))
        c.cushion(M.sofa(), 0.18, 0.62, D, -W / 2 + 0.09, 0.1, 0, 0.06)
        c.cushion(M.sofa(), 0.18, 0.62, D, W / 2 - 0.09, 0.1, 0, 0.06)
        c.cushion(M.sofa(), W - 0.1, 0.62, 0.2, 0, 0.18, back + 0.1, 0.06)
        const n = 3, cw = (W - 0.38) / n
        for (let i = 0; i < n; i++) {
          c.cushion(M.sofa(), cw - 0.01, 0.16, D - 0.24, -W / 2 + 0.19 + cw * (i + 0.5), 0.32, 0.1, 0.05)
          c.cushion(M.sofa(), cw - 0.02, 0.42, 0.16, -W / 2 + 0.19 + cw * (i + 0.5), 0.44, back + 0.26, 0.07, 0, -0.18)
        }
        c.cushion(M.mustard(), 0.42, 0.38, 0.12, -W / 2 + 0.42, 0.5, back + 0.4, 0.06, 0.4, -0.25)
        c.cushion(this.M.fabric('throw', '#a8b4a0', 'wool'), 0.6, 0.04, 0.7, W / 2 - 0.5, 0.47, 0.1, 0.02, 0.15)
        break
      }
      case 'coffeetable': {
        c.box(M.walnut(), W, 0.04, D, 0, 0.38, 0, 1)
        c.box(M.walnut(), W - 0.1, 0.02, D - 0.1, 0, 0.12, 0, 1)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(M.black(), 0.03, 0.38, 0.03, sx * (W / 2 - 0.05), 0, sz * (D / 2 - 0.05))
        // 遥控器、杂志、马克杯、外卖盒
        c.box(M.black(), 0.05, 0.02, 0.17, 0.2, 0.42, -0.15, 0, 0.3)
        c.box(this.mats.lit('magazine', { color: '#c94f3a', roughness: 0.7 }), 0.22, 0.008, 0.29, -0.15, 0.42, 0.12, 0, -0.2)
        c.cyl(M.ceramic(), 0.04, 0.036, 0.095, 0.25, 0.42, 0.2, 16)
        c.box(this.mats.lit('takeout', { color: '#f0e6d2', roughness: 0.8 }), 0.14, 0.07, 0.14, -0.25, 0.42, -0.2)
        c.box(M.paper(), 0.08, 0.008, 0.06, -0.2, 0.135, 0)
        break
      }
      case 'tvstand': {
        cabinetCase(c, M.walnut(), W, .42, D, 0, .08)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(M.black(), 0.03, 0.08, 0.03, sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.05))
        c.box(this.mats.lit('tvs-front', { color: '#3b2a1f', roughness: 0.5 }), W - 0.04, 0.3, 0.005, 0, 0.14, D / 2)
        c.box(M.black(), 0.32, 0.06, 0.25, 0.5, 0.5, 0) // 机顶盒/游戏机
        c.box(M.led(), 0.01, 0.004, 0.004, 0.62, 0.53, 0.126)
        c.add(this.mats.lit('vase', { color: '#476a6f', roughness: 0.2 }), new THREE.CylinderGeometry(0.05, 0.07, 0.25, 16), -0.6, 0.625, 0)
        break
      }
      case 'tv': {
        const y = 1.0, tw = W, th = tw * 9 / 16
        c.box(M.graphite(), 0.3, 0.2, 0.012, 0, y + th / 2 - 0.1, back + 0.006) // 壁挂支架（贴墙）
        c.box(M.black(), tw + 0.02, th + 0.02, 0.04, 0, y, back + 0.032)
        const scr = this.mats.basic('tv-screen', { map: TX.tvScreenTex(), toneMapped: false, color: '#c8ccd0' })
        c.plane(scr, tw - 0.02, th - 0.02, 0, y + th / 2 + 0.01, back + 0.053)
        break
      }
      case 'floorlamp': {
        c.cyl(M.black(), 0.13, 0.15, 0.03, 0, 0, 0, 24)
        c.cyl(M.brass(), 0.012, 0.012, 1.45, 0, 0.03, 0, 8)
        c.add(this.mats.lit('shade', { color: '#efe2c8', roughness: 0.9, side: THREE.DoubleSide, emissive: new THREE.Color('#5a4020') }), new THREE.CylinderGeometry(0.14, 0.2, 0.26, 24, 1, true), 0, 1.58, 0)
        c.sphere(M.bulb(), 0.04, 0, 1.55, 0)
        break
      }
      case 'plant': {
        const big = p.top > 1.2
        c.cyl(M.terracotta(), big ? 0.17 : 0.13, big ? 0.13 : 0.1, big ? 0.36 : 0.26, 0, 0, 0, 20)
        c.cyl(M.soil(), big ? 0.16 : 0.12, big ? 0.16 : 0.12, 0.01, 0, big ? 0.34 : 0.24, 0, 20)
        const n = big ? 14 : 9
        for (let i = 0; i < n; i++) {
          const a = i * 2.399, r = 0.05 + (i % 4) * 0.04, hh = (big ? 0.6 : 0.35) + (i % 5) * (big ? 0.15 : 0.08)
          c.add(this.mats.lit('stem', { color: '#4a6a32', roughness: 0.8 }), new THREE.CylinderGeometry(0.006, 0.008, hh, 5), Math.sin(a) * r * 0.5, (big ? 0.36 : 0.26) + hh / 2, Math.cos(a) * r * 0.5, 0, Math.cos(a) * 0.3, -Math.sin(a) * 0.3)
          const leaf = new THREE.PlaneGeometry(big ? 0.22 : 0.14, big ? 0.32 : 0.2); leaf.translate(0, (big ? 0.16 : 0.1), 0)
          c.add(M.leaf(), leaf, Math.sin(a) * r, (big ? 0.36 : 0.26) + hh - 0.05, Math.cos(a) * r, a, -0.6 - (i % 3) * 0.25, 0)
        }
        break
      }
      case 'bookcase': {
        const h = 2.0
        c.box(M.white(), W, h, 0.02, 0, 0, back + 0.01)
        c.box(M.white(), W, 0.02, D, 0, h - 0.02, 0)
        c.box(M.white(), 0.02, h, D, 0, 0, 0)
        c.box(M.white(), W, h, 0.02, 0, 0, D / 2 - 0.01)
        for (let i = 0; i < 6; i++) {
          const y = 0.02 + i * 0.38
          c.box(M.white(), W, 0.02, D, 0, y, 0)
          if (i === 5) continue
          const bm = this.mats.lit('booksL' + i, { map: TX.booksTex(90 + i), roughness: 0.8 })
          c.plane(bm, D - 0.08, 0.3, W / 2 - 0.06, y + 0.17, 0, Math.PI / 2)
          c.box(this.mats.lit('bookblock', { color: '#2a2420', roughness: 0.9 }), W - 0.1, 0.28, D - 0.08, -0.02, y + 0.02, 0)
        }
        break
      }
      case 'armchair': {
        c.cushion(M.mustard(), W, 0.3, D, 0, 0.12, 0, 0.06)
        c.cushion(M.mustard(), W, 0.6, 0.16, 0, 0.2, back + 0.08, 0.06, 0, -0.12)
        c.cushion(M.mustard(), 0.12, 0.42, D - 0.1, -W / 2 + 0.06, 0.2, 0.03, 0.05)
        c.cushion(M.mustard(), 0.12, 0.42, D - 0.1, W / 2 - 0.06, 0.2, 0.03, 0.05)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.box(M.walnut(), 0.035, 0.12, 0.035, sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08))
        break
      }
      case 'sidetable': {
        c.cyl(M.walnut(), W / 2, W / 2, 0.025, 0, 0.53, 0, 24)
        c.cyl(M.black(), 0.015, 0.015, 0.53, 0, 0, 0, 8)
        c.cyl(M.black(), 0.15, 0.15, 0.015, 0, 0, 0, 20)
        c.box(this.mats.lit('book2', { color: '#2e4a7a', roughness: 0.8 }), 0.15, 0.03, 0.21, 0, 0.555, 0, 0, 0.5)
        break
      }
      case 'wallclock': {
        const y = 2.25
        c.cyl(M.black(), 0.16, 0.16, 0.03, 0, y, back + 0.015, 32, Math.PI / 2)
        c.plane(this.mats.lit('clockface', { map: TX.clockTex(), roughness: 0.6 }), 0.29, 0.29, 0, y, back + 0.031)
        break
      }
      case 'shoecab': {
        cabinetCase(c, this.mats.lit('shoecab', { color: '#e7e2d8', roughness: .5 }), W, .92, D, 0, .08)
        c.box(M.oak(), W + 0.02, 0.03, D + 0.02, 0, 1.0, 0, 1)
        c.box(M.black(), W - 0.02, 0.08, D - 0.04, 0, 0, -0.02)
        for (let i = 0; i < 3; i++) {
          c.box(this.mats.lit('shoecab-door', { color: '#ece8df', roughness: 0.45 }), W / 3 - 0.006, 0.88, 0.015, -W / 2 + (W / 3) * (i + 0.5), 0.1, D / 2)
          c.box(M.brass(), 0.012, 0.12, 0.012, -W / 2 + (W / 3) * (i + 0.5) + W / 6 - 0.04, 0.8, D / 2 + 0.014)
        }
        // 台面：钥匙盘、香薰、快递盒
        c.cyl(M.ceramic(), 0.09, 0.07, 0.03, -0.5, 1.03, 0, 20)
        c.box(M.chrome(), 0.05, 0.006, 0.02, -0.5, 1.06, 0.01, 0, 0.6)
        c.cyl(this.mats.lit('diffuser', { color: '#a68a5b', roughness: 0.2, transparent: true, opacity: 0.85 }), 0.04, 0.04, 0.1, 0.5, 1.03, 0, 14)
        for (let i = 0; i < 5; i++) c.cyl(M.walnut(), 0.003, 0.003, 0.22, 0.5 + (i - 2) * 0.01, 1.13, 0, 4)
        c.box(this.mats.lit('parcel', { color: '#b88a5a', roughness: 0.9 }), 0.32, 0.18, 0.24, 0.0, 1.03, -0.02)
        c.box(this.mats.lit('parcel-tape', { color: '#d8c39a', roughness: 0.6 }), 0.33, 0.004, 0.05, 0.0, 1.21, -0.02)
        // 门口的鞋
        for (let i = 0; i < 3; i++) { const sc = ['#f2f2f2', '#2b2b2b', '#6b4a32'][i]; c.cushion(this.mats.lit('shoe' + i, { color: sc, roughness: 0.6 }), 0.1, 0.08, 0.27, 0.4 + i * 0.14 - 0.75, 0, D / 2 + 0.25 + (i % 2) * 0.05, 0.035, 0.1 * (i - 1)) }
        break
      }
      case 'mirror': {
        // 贴墙镜（下沿高于鞋柜台面 1.03m，不与鞋柜相交）
        c.box(M.brass(), W + 0.03, 1.2, 0.02, 0, 1.08, back + 0.01)
        c.plane(M.mirror(), W - 0.02, 1.16, 0, 1.68, back + 0.021)
        break
      }
      case 'coathook': {
        c.box(M.oak(), W, 0.09, 0.025, 0, 1.75, back + 0.012, 1)
        for (let i = 0; i < 4; i++) c.sphere(M.brass(), 0.02, -W / 2 + 0.15 + i * 0.3, 1.78, back + 0.05)
        c.cushion(this.M.fabric('coat', '#7a6a58', 'wool'), 0.4, 0.95, 0.12, -W / 2 + 0.15, 0.82, back + 0.09, 0.05)
        c.cushion(this.mats.lit('bag', { color: '#3a3a3a', roughness: 0.8 }), 0.3, 0.32, 0.08, -W / 2 + 0.75, 1.42, back + 0.07, 0.04)
        c.add(this.mats.lit('scarf', { color: '#b3473a', roughness: 1 }), new THREE.BoxGeometry(0.12, 0.6, 0.02), -W / 2 + 1.05, 1.48, back + 0.06)
        break
      }
      case 'doormat': {
        c.box(this.M.fabric('doormat', '#6a5a44', 'wool'), W, 0.015, D, 0, 0, 0)
        break
      }
      case 'diningtable': {
        c.box(M.oak(), W, 0.035, D, 0, 0.72, 0, 1)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(M.oak(), new THREE.CylinderGeometry(0.02, 0.016, 0.72, 10), sx * (W / 2 - 0.08), 0.36, sz * (D / 2 - 0.08))
        c.cyl(M.ceramic(), 0.12, 0.12, 0.02, 0.2, 0.755, 0, 24)
        c.box(this.mats.lit('placemat', { color: '#8a9a8c', roughness: 1 }), 0.4, 0.003, 0.3, -0.25, 0.755, 0)
        c.box(M.paper(), 0.21, 0.003, 0.3, -0.25, 0.758, 0.02, 0, 0.15)
        break
      }
      case 'chair': {
        c.box(M.oak(), 0.42, 0.03, 0.42, 0, 0.44, 0, 1)
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(M.oak(), new THREE.CylinderGeometry(0.016, 0.014, 0.44, 8), sx * 0.18, 0.22, sz * 0.18)
        c.box(M.oak(), 0.4, 0.38, 0.025, 0, 0.47, -0.2, 1)
        break
      }
      case 'umbrella': {
        c.cyl(M.graphite(), 0.12, 0.1, 0.45, 0, 0, 0, 16)
        c.add(M.black(), new THREE.CylinderGeometry(0.035, 0.012, 0.7, 8), 0.03, 0.55, 0, 0, 0, 0.08)
        c.add(this.mats.lit('umb2', { color: '#2e4a7a', roughness: 0.6 }), new THREE.CylinderGeometry(0.03, 0.01, 0.65, 8), -0.04, 0.52, 0.02, 0, 0, -0.1)
        break
      }
      case 'intercom': {
        c.box(this.mats.lit('intercom', { color: '#d8d6d0', roughness: 0.4 }), W, 0.3, 0.03, 0, 1.35, back + 0.015)
        c.plane(this.mats.basic('intercom-scr', { color: '#20303a' }), W * 0.75, 0.12, 0, 1.55, back + 0.031)
        break
      }
      case 'meterbox': {
        c.box(this.mats.lit('meterbox', { color: '#8c9196', roughness: 0.5, metalness: 0.4 }), W, 0.9, D, 0, 1.0, 0)
        c.box(this.mats.lit('meterwin', { color: '#22282c', roughness: 0.1 }), W - 0.08, 0.2, 0.004, 0, 1.55, D / 2)
        break
      }
      case 'mailboxes': {
        c.box(this.mats.lit('mailbox', { color: '#3d5a6c', roughness: 0.4, metalness: 0.5 }), W, 0.7, D, 0, 0.9, 0)
        for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) c.box(this.mats.lit('mailslot', { color: '#2b4050', roughness: 0.4, metalness: 0.5 }), W / 4 - 0.02, 0.2, 0.01, -W / 2 + (W / 4) * (i + 0.5), 0.93 + j * 0.22, D / 2)
        break
      }
      case 'barrier': {
        const stripe = this.mats.lit('barrier', { color: '#e8b934', roughness: 0.6 })
        c.box(stripe, W, 0.12, 0.04, 0, 0.85, 0); c.box(stripe, W, 0.12, 0.04, 0, 0.45, 0)
        for (const sx of [-1, 1]) { c.box(M.graphite(), 0.05, 1.0, 0.05, sx * (W / 2 - 0.05), 0, 0); c.box(M.graphite(), 0.3, 0.03, 0.3, sx * (W / 2 - 0.05), 0, 0) }
        c.plane(this.mats.basic('barrier-sign', { map: TX.labelTex('楼梯维修 · 暂停通行', '#222', '#f2f2f2') }), 0.8, 0.2, 0, 0.65, 0.025)
        break
      }
      case 'flyers': {
        c.plane(this.mats.lit('flyers', { map: TX.flyersTex(), roughness: 0.9 }), W, W * 0.375, 0, 1.25, back + 0.0015)
        break
      }
    }
  }
}
