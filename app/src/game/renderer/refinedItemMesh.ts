// 细化物品模型（2026-10-07）：此前在 itemsMesh.ts 中以方块/圆柱拼接的 55 件物品。
// 规范沿用 sixItemMesh：四套 1024² sRGB 颜色 / 512² OpenGL(+Y) 法线 / 512² 线性粗糙度图集，
// 每套 4×4 分区、8 px 内缩边界；每件 ≤1,200 三角面、≤3 个材质批次；实例独立几何/材质，文件纹理共享。
// 图集由 scripts/gen-refined-item-atlas.mjs 离线生成（确定性、原创程序化绘制，无外部素材）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { configureSurfaceTexture, getMaterialMode, levelTexture, litMaterial } from './shared'

export type RefinedAtlas = 'tools' | 'gear' | 'food' | 'paper'

export const REFINED_ITEM_ATLAS = {
  carkey: 'tools', gas: 'tools', wrench: 'tools', fuse: 'tools', stapler: 'tools', keycard: 'tools', nails: 'tools', timber: 'tools',
  housekey: 'tools', presses: 'tools', eaglecoin: 'tools', sedative: 'tools', uvlamp: 'tools', headlamp: 'tools', nightvision: 'tools', silverware: 'tools',
  gloves: 'gear', suit: 'gear', cavingsuit: 'gear', rope: 'gear', divemask: 'gear', chalkstub: 'gear', stonekazoo: 'gear', wheatgrain: 'gear',
  xenonmarble: 'gear', driedfruit: 'gear',
  thingmeat: 'food', ratmeat: 'food', dryshrimp: 'food', friedshrimp: 'food', tomatosoup: 'food', gardensalad: 'food', garlicbread: 'food', pasta: 'food',
  meatstew: 'food', pizza: 'food', lasagna: 'food', tomsspecial: 'food', grilledsteak: 'food', jambread: 'food',
  megfolder: 'paper', oddbook: 'paper', pamphlet: 'paper', endnote: 'paper', welcomenote: 'paper', notebook: 'paper', parcel: 'paper',
  candysilver: 'paper', candybullet: 'paper', candygun: 'paper', candystanley: 'paper', candywaste: 'paper', candygenius: 'paper',
  candymint: 'paper', manmade: 'paper', citywater: 'paper',
} as const satisfies Record<string, RefinedAtlas>
export type RefinedItemType = keyof typeof REFINED_ITEM_ATLAS
export const REFINED_ITEM_TYPES = Object.keys(REFINED_ITEM_ATLAS) as RefinedItemType[]
export const isRefinedItemType = (type: string): type is RefinedItemType => Object.prototype.hasOwnProperty.call(REFINED_ITEM_ATLAS, type)

// 分区编号与 gen-refined-item-atlas.mjs / layout.json 一致（行优先，4 列）。
const T = {
  tools: { dark: 0, steel: 1, gas: 2, enamel: 3, ceramic: 4, brass: 5, card: 6, wood: 7, eagle: 8, press: 9, syringe: 10, uv: 11, strap: 12, lens: 13, olive: 14, rubber: 15 },
  gear: { glove: 0, suit: 1, nylon: 2, fleece: 3, reflect: 4, rope: 5, silicone: 6, maskglass: 7, chalk: 8, stone: 9, straw: 10, grain: 11, xenon: 12, buckle: 13, burlap: 14, fruit: 15 },
  food: { ceramic: 0, stoneware: 1, copper: 2, soup: 3, salad: 4, bread: 5, pasta: 6, stew: 7, pizza: 8, lasagna: 9, meat: 10, steak: 11, jam: 12, shell: 13, batter: 14, misc: 15 },
  paper: { kraft: 0, paper: 1, cloth: 2, pamphlet: 3, burnt: 4, welcome: 5, leather: 6, cardboard: 7, foil: 8, gunmetal: 9, stanley: 10, hazard: 11, wafer: 12, mint: 13, manmade: 14, water: 15 },
} as const

/** 分区内子矩形 [u0, v0, u1, v1]（v 向上，分区内 0..1）。与图集脚本的绘制区域对应。 */
type Rect = readonly [number, number, number, number]
const FULL: Rect = [0, 0, 1, 1]
const R = {
  top: [0, .5, 1, 1] as Rect, bottom: [0, 0, 1, .5] as Rect,
  q00: [0, .5, .5, 1] as Rect, q10: [.5, .5, 1, 1] as Rect, q01: [0, 0, .5, .5] as Rect, q11: [.5, 0, 1, .5] as Rect,
}
// 带子区约定（见图集脚本注释）
const SUB = {
  steelRust: [0, 0, 1, .25] as Rect, steelClean: [0, .25, 1, 1] as Rect,
  brassReed: [0, 0, 1, .25] as Rect, brassPlain: [0, .25, 1, 1] as Rect,
  woodLong: [0, .25, 1, 1] as Rect, woodEnd: [0, 0, .75, .25] as Rect,
  lensWarm: [0, .25, .5, .75] as Rect, lensNV: [.5, .25, 1, .75] as Rect,
  rubRed: R.q00, rubBlack: R.q10, rubWhite: R.q01, rubGrey: R.q11,
  fruitApricot: R.q00, fruitRaisin: R.q10, fruitFig: R.q01, fruitApple: R.q11,
  crust: R.top, crumb: R.bottom,
  herb: R.q00, tomato: R.q10, cheese: R.q01, carrot: R.q11,
  layers: R.top, baked: R.bottom,
  steakTop: [0, .2, 1, 1] as Rect, steakEdge: [0, 0, 1, .2] as Rect,
  shellBody: [0, .12, 1, 1] as Rect, shellDark: [0, 0, 1, .12] as Rect,
  pageEdge: R.top, sheet: R.bottom,
  spine: [0, 0, .12, 1] as Rect,
  leatherBody: [0, .2, 1, 1] as Rect, elastic: [0, 0, 1, .2] as Rect,
  boxTop: R.q00, boxTape: R.q10, boxSide: R.q01, boxBottom: R.q11,
  blued: [0, .3, 1, 1] as Rect, grip: [0, 0, 1, .3] as Rect,
  foilSilver: [0, .2, 1, 1] as Rect, foilBrass: [0, 0, 1, .2] as Rect,
  drumSide: [0, .3, 1, 1] as Rect, drumLid: [0, 0, .3, .3] as Rect,
  waferTop: R.top, waferSide: R.bottom,
  wrapper: R.top, flesh: R.bottom,
  label: [0, 0, .5, 1] as Rect, glass: [.5, .5, 1, 1] as Rect, water: [.5, .25, 1, .5] as Rect, cap: [.5, 0, 1, .25] as Rect,
  cardFront: R.top, cardBack: R.bottom,
  stanleyFront: [0, 0, .5, 1] as Rect, stanleyBack: [.5, 0, 1, 1] as Rect,
  suitPatch: [.3, .3, .7, .7] as Rect,
}

// ---------- 图集与材质 ----------
function atlas(group: RefinedAtlas, file: 'color' | 'normal' | 'roughness') {
  const texture = levelTexture(`items-refined/${group}/${file}.png`, () => {
    const rgba = file === 'normal' ? [128, 128, 255, 255] : file === 'roughness' ? [190, 190, 190, 255] : [170, 166, 150, 255]
    const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1)
    t.needsUpdate = true
    return t
  })
  configureSurfaceTexture(texture, file === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace)
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  return texture
}

function surface(group: RefinedAtlas, metalness = 0, roughness = .7) {
  return litMaterial({
    color: '#ffffff', map: atlas(group, 'color'), normalMap: atlas(group, 'normal'), normalScale: new THREE.Vector2(.5, .5),
    metalness, roughness, envBase: metalness > .3 ? .38 : .14,
    ...(getMaterialMode() === 'realistic' ? { roughnessMap: atlas(group, 'roughness') } : {}),
  })
}
function glassMat(group: RefinedAtlas, opacity = .32) {
  const m = surface(group, .05, .12)
  m.transparent = true; m.opacity = opacity; m.depthWrite = false; m.side = THREE.FrontSide
  return m
}
function glowMat(group: RefinedAtlas, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color: '#ffffff', map: atlas(group, 'color'), toneMapped: false, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })
}

type V3 = readonly [number, number, number]
interface Place { p?: V3; r?: V3; s?: V3 | number; rect?: Rect }

/** 按材质合批的部件收集器：几何非索引化、剔除零面积三角形、UV 写入指定图集分区。 */
class Parts {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>()
  readonly root = new THREE.Group()
  readonly group: RefinedAtlas
  constructor(group: RefinedAtlas) { this.group = group }
  add(geo: THREE.BufferGeometry, mat: THREE.Material, tile: number, place: Place = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo
    if (g !== geo) geo.dispose()
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    const pos = g.getAttribute('position'), keep: number[] = []
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1).sub(a); c.fromBufferAttribute(pos, i + 2).sub(a)
      if (b.cross(c).lengthSq() > 1e-16) keep.push(i, i + 1, i + 2)
    }
    if (keep.length !== pos.count) {
      const clean = new THREE.BufferGeometry()
      for (const name of Object.keys(g.attributes)) {
        const attr = g.getAttribute(name), values = new Float32Array(keep.length * attr.itemSize)
        for (let i = 0; i < keep.length; i++) for (let k = 0; k < attr.itemSize; k++) values[i * attr.itemSize + k] = attr.array[keep[i] * attr.itemSize + k]
        clean.setAttribute(name, new THREE.BufferAttribute(values, attr.itemSize))
      }
      g.dispose(); g = clean
    }
    g.clearGroups()
    const uv = g.getAttribute('uv'), rect = place.rect ?? FULL
    const tx = (tile % 4) * 256 + 8, ty = Math.floor(tile / 4) * 256 + 8
    for (let i = 0; i < uv.count; i++) {
      const u = rect[0] + clamp01(uv.getX(i)) * (rect[2] - rect[0]), v = rect[1] + clamp01(uv.getY(i)) * (rect[3] - rect[1])
      uv.setXY(i, (tx + u * 240) / 1024, 1 - (ty + (1 - v) * 240) / 1024)
    }
    const s = place.s ?? 1, scale = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s)
    const r = place.r ?? [0, 0, 0]
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...(place.p ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), scale))
    const list = this.buckets.get(mat) ?? []
    list.push(g); this.buckets.set(mat, list)
  }
  finish(type: RefinedItemType) {
    let i = 0
    for (const [material, parts] of this.buckets) {
      const geometry = mergeGeometries(parts, false)
      for (const part of parts) part.dispose()
      if (!geometry) throw new Error(`Cannot merge ${type} geometry`)
      geometry.computeBoundingBox(); geometry.computeBoundingSphere()
      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = `${type}-${material.transparent ? 'glass' : material instanceof THREE.MeshBasicMaterial ? 'glow' : 'surface'}-${i++}`
      this.root.add(mesh)
    }
    this.root.name = `${type}-refined-model`
    this.root.userData.refinedItemModel = 1
    this.root.userData.refinedAtlas = this.group
    return this.root
  }
}

// ---------- 几何工具 ----------
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const PI = Math.PI, HP = Math.PI / 2
function hash3(x: number, y: number, z: number) {
  let h = Math.imul(Math.floor(x) + 374761, 668265263) ^ Math.imul(Math.floor(y) + 1442695, 2246822519) ^ Math.imul(Math.floor(z) + 3266489, 3266489917)
  h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
/** 三维值噪声，返回 -1..1；按位置取值，因此接缝处的重复顶点得到相同位移。 */
function noise3(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const n = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz)
  return l(l(l(n(0, 0, 0), n(1, 0, 0), sx), l(n(0, 1, 0), n(1, 1, 0), sx), sy), l(l(n(0, 0, 1), n(1, 0, 1), sx), l(n(0, 1, 1), n(1, 1, 1), sx), sy), sz) * 2 - 1
}
const v2 = (pts: readonly (readonly number[])[]) => pts.map(([x, y]) => new THREE.Vector2(x, y))
const cyl = (rt: number, rb: number, h: number, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open)
const lathe = (profile: readonly (readonly number[])[], seg = 14, phiStart = PI, phiLength = PI * 2) => new THREE.LatheGeometry(v2(profile), seg, phiStart, phiLength)
const sphere = (r: number, w = 10, h = 7, thetaStart = 0, thetaLength = PI) => new THREE.SphereGeometry(r, w, h, 0, PI * 2, thetaStart, thetaLength)
const torus = (radius: number, tube: number, segments = 16, sides = 6, arc = PI * 2) => new THREE.TorusGeometry(radius, tube, sides, segments, arc)
const circle = (r: number, seg = 16) => new THREE.CircleGeometry(r, seg)
const tube = (points: readonly V3[], radius: number, segments = 10, sides = 5, closed = false) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed), segments, radius, sides, closed)

/** 把一根长曲线切成多段，每段占满分区 UV，用于绳、麦秆等长纹理（避免一张图被拉伸到整根长度）。 */
function tubePieces(p: Parts, mat: THREE.Material, tile: number, points: readonly V3[], radius: number, pieces: number, segPer = 3, sides = 5, rect: Rect = FULL) {
  const curve = new THREE.CatmullRomCurve3(points.map(q => new THREE.Vector3(...q)))
  // Compute one continuous frame along the entire curve. Rebuilding each short
  // sub-curve independently rotates its cross section and leaves open cracks.
  const indexed = new THREE.TubeGeometry(curve, pieces * segPer, radius, sides, false)
  const continuous = indexed.toNonIndexed(); indexed.dispose()
  const verticesPerPiece = segPer * sides * 6
  for (let i = 0; i < pieces; i++) {
    const part = new THREE.BufferGeometry()
    for (const name of ['position', 'normal', 'uv']) {
      const attr = continuous.getAttribute(name), start = i * verticesPerPiece * attr.itemSize
      part.setAttribute(name, new THREE.BufferAttribute(attr.array.slice(start, start + verticesPerPiece * attr.itemSize), attr.itemSize))
    }
    // Repeat UVs within each padded atlas tile without splitting the surface.
    const uv = part.getAttribute('uv')
    for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * pieces - i)
    p.add(part, mat, tile, { rect })
  }
  continuous.dispose()
}

function box(w: number, h: number, d: number, faces?: readonly Rect[]) {
  // BoxGeometry 面顺序 +X -X +Y -Y +Z -Z，每面 4 顶点；可为每面指定分区子矩形。
  const g = new THREE.BoxGeometry(w, h, d)
  if (faces) {
    const uv = g.getAttribute('uv')
    for (let f = 0; f < 6; f++) {
      const r = faces[f] ?? FULL
      for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1])) }
    }
  }
  return g
}

interface ExtrudeOpts { bevel?: number; seg?: number; curve?: number; front?: Rect; back?: Rect; side?: Rect; mirrorBack?: boolean }
/** 平面形状沿 Z 挤出并居中；正面/背面平面投影 UV，侧壁独立条带。 */
function extrude(shape: THREE.Shape | THREE.Shape[], depth: number, o: ExtrudeOpts = {}) {
  const bevel = o.bevel ?? 0
  const g = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: o.seg ?? 1, curveSegments: o.curve ?? 4 })
  g.translate(0, 0, -depth / 2)
  g.computeBoundingBox()
  const bb = g.boundingBox!, w = Math.max(1e-6, bb.max.x - bb.min.x), h = Math.max(1e-6, bb.max.y - bb.min.y), d = Math.max(1e-6, bb.max.z - bb.min.z)
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv')
  const front = o.front ?? FULL, back = o.back ?? front, side = o.side ?? front
  for (let i = 0; i < pos.count; i++) {
    const x = (pos.getX(i) - bb.min.x) / w, y = (pos.getY(i) - bb.min.y) / h, z = (pos.getZ(i) - bb.min.z) / d, nz = nor.getZ(i)
    if (nz > .55) uv.setXY(i, front[0] + x * (front[2] - front[0]), front[1] + y * (front[3] - front[1]))
    else if (nz < -.55) { const bx = o.mirrorBack === false ? x : 1 - x; uv.setXY(i, back[0] + bx * (back[2] - back[0]), back[1] + y * (back[3] - back[1])) }
    else uv.setXY(i, side[0] + (x * .5 + y * .5) * (side[2] - side[0]), side[1] + z * (side[3] - side[1]))
  }
  return smoothNormals(g, .7)
}

function shape(points: readonly (readonly number[])[], holes: readonly (readonly (readonly number[])[])[] = []) {
  const s = new THREE.Shape(v2(points))
  for (const hole of holes) s.holes.push(new THREE.Path(v2(hole)))
  return s
}
function roundRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
  return s
}
function ellipsePath(rx: number, ry: number, n = 16, cx = 0, cy = 0) {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * PI * 2) * rx, cy + Math.sin(i / n * PI * 2) * ry])
}
/** 逐顶点变形（在非索引化之前调用；索引几何的共享顶点保持闭合）。 */
function warp(g: THREE.BufferGeometry, fn: (v: THREE.Vector3) => void) {
  const pos = g.getAttribute('position'), v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); fn(v); pos.setXYZ(i, v.x, v.y, v.z) }
  return smoothNormals(g)
}
/** 法线：索引几何按共享顶点平滑；非索引几何按位置合并、仅在夹角小于 crease 时平滑（保留硬边）。 */
function smoothNormals(g: THREE.BufferGeometry, crease = .8) {
  g.computeVertexNormals()
  if (g.index) return g
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal')
  const face: THREE.Vector3[] = [], a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1).sub(a); c.fromBufferAttribute(pos, i + 2).sub(a)
    const n = b.cross(c); const area = n.length(); face.push(area > 0 ? n.divideScalar(area).clone() : new THREE.Vector3(0, 1, 0))
  }
  const key = (i: number) => `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`
  const groups = new Map<string, number[]>()
  for (let i = 0; i < pos.count; i++) { const k = key(i), list = groups.get(k) ?? []; list.push(i); groups.set(k, list) }
  const cos = Math.cos(crease), acc = new THREE.Vector3()
  for (const list of groups.values()) for (const i of list) {
    const fi = face[Math.floor(i / 3)]; acc.set(0, 0, 0)
    for (const j of list) { const fj = face[Math.floor(j / 3)]; if (fi.dot(fj) >= cos) acc.add(fj) }
    if (acc.lengthSq() < 1e-12) acc.copy(fi)
    acc.normalize(); nor.setXYZ(i, acc.x, acc.y, acc.z)
  }
  nor.needsUpdate = true
  return g
}
/** 薄片双面：复制反向绕序的背面三角形（单一 FrontSide 材质即可合批）。 */
function twoSided(geo: THREE.BufferGeometry, offset = .0003) {
  smoothNormals(geo)
  const g = geo.index ? geo.toNonIndexed() : geo
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv')
  const n = pos.count, P = new Float32Array(n * 6), N = new Float32Array(n * 6), U = new Float32Array(n * 4)
  P.set(pos.array as Float32Array); N.set(nor.array as Float32Array); U.set(uv.array as Float32Array)
  for (let i = 0; i < n; i += 3) for (let k = 0; k < 3; k++) {
    const src = i + [0, 2, 1][k], dst = n + i + k
    for (let c = 0; c < 3; c++) { N[dst * 3 + c] = -nor.array[src * 3 + c]; P[dst * 3 + c] = pos.array[src * 3 + c] - nor.array[src * 3 + c] * offset }
    U[dst * 2] = uv.array[src * 2]; U[dst * 2 + 1] = uv.array[src * 2 + 1]
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('uv', new THREE.BufferAttribute(U, 2))
  if (g !== geo) g.dispose()
  geo.dispose()
  return out
}
/** 顶点合并后再起伏，避免 Sphere/Lathe 的 UV 接缝处裂开。 */
function lumpyWelded(g: THREE.BufferGeometry, amp: number, freq: number, seed = 0) {
  const pos = g.getAttribute('position'), v = new THREE.Vector3()
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
  const normals = new Map<string, THREE.Vector3>()
  g.computeVertexNormals()
  const nor = g.getAttribute('normal')
  for (let i = 0; i < pos.count; i++) {
    const k = key(pos.getX(i), pos.getY(i), pos.getZ(i)), acc = normals.get(k) ?? new THREE.Vector3()
    acc.x += nor.getX(i); acc.y += nor.getY(i); acc.z += nor.getZ(i); normals.set(k, acc)
  }
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = normals.get(key(v.x, v.y, v.z))!.clone().normalize()
    const d = noise3(v.x * freq + seed, v.y * freq + seed * 1.7, v.z * freq - seed) * amp
    pos.setXYZ(i, v.x + n.x * d, v.y + n.y * d, v.z + n.z * d)
  }
  return smoothNormals(g, 1.1)
}
function coin(p: Parts, mat: THREE.Material, faceTile: number, edgeTile: number, r: number, h: number, at: V3, tilt: V3 = [0, 0, 0], faceRect: Rect = FULL, edgeRect: Rect = FULL) {
  const holder = new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...tilt)), new THREE.Vector3(1, 1, 1))
  const put = (g: THREE.BufferGeometry, tile: number, rect: Rect) => { g.applyMatrix4(holder); p.add(g, mat, tile, { rect }) }
  put(cyl(r, r, h, 24, true), edgeTile, edgeRect)
  const top = circle(r * .995, 24); top.rotateX(-HP); top.translate(0, h / 2, 0); put(top, faceTile, faceRect)
  const bottom = circle(r * .995, 24); bottom.rotateX(HP); bottom.translate(0, -h / 2, 0); put(bottom, faceTile, faceRect)
  // 凸起边圈
  const rim = torus(r * .93, h * .22, 24, 4); rim.rotateX(HP); rim.translate(0, h / 2, 0); put(rim, edgeTile, edgeRect)
}

// ======================================================================
// tools 图集
// ======================================================================
const A = T.tools
function carkey(p: Parts) {
  const plastic = surface('tools', 0, .55), metal = surface('tools', .8, .35)
  const fob = roundRect(.062, .1, .022)
  p.add(extrude(fob, .016, { bevel: .004, seg: 2 }), plastic, A.dark, { p: [0, -.02, 0] })
  for (const [y, rect] of [[.0, SUB.rubRed], [-.025, SUB.rubBlack], [-.05, SUB.rubBlack]] as const) {
    p.add(cyl(.011, .012, .006, 12), plastic, A.rubber, { p: [0, y, .0115], r: [HP, 0, 0], rect })
  }
  // 刀片：铣槽钥匙片 + 齿形
  const blade = shape([[-.009, 0], [.009, 0], [.009, .07], [.004, .074], [.004, .062], [-.002, .058], [.003, .05], [-.003, .044], [.003, .036], [-.004, .03], [-.009, .03]])
  p.add(extrude(blade, .0035, { bevel: .0006, front: SUB.steelClean, side: SUB.steelClean }), metal, A.steel, { p: [0, .036, 0] })
  p.add(cyl(.014, .016, .012, 14), plastic, A.dark, { p: [0, .036, 0] })
  p.add(torus(.017, .0022, 18, 5), metal, A.brass, { p: [0, -.088, 0], r: [0, HP * .6, 0], rect: SUB.brassPlain })
  p.add(cyl(.006, .006, .02, 8), metal, A.steel, { p: [0, -.07, 0], rect: SUB.steelClean })
}

function gas(p: Parts) {
  const paint = surface('tools', .35, .5)
  const body = shape([[-.1, -.14], [.1, -.14], [.1, .09], [.06, .14], [-.1, .14]])
  p.add(extrude(body, .11, { bevel: .012, seg: 2 }), paint, A.gas)
  // 三柄提手
  for (const x of [-.06, -.01, .04]) p.add(cyl(.009, .009, .028, 8), paint, A.gas, { p: [x, .158, 0] })
  p.add(tube([[-.075, .17, 0], [-.04, .177, 0], [0, .177, 0], [.055, .17, 0]], .011, 10, 6), paint, A.gas)
  // 斜嘴与盖
  p.add(cyl(.02, .024, .05, 12), paint, A.gas, { p: [.083, .15, 0], r: [0, 0, -.6] })
  p.add(cyl(.024, .024, .022, 12), paint, A.rubber, { p: [.098, .172, 0], r: [0, 0, -.6], rect: SUB.rubBlack })
  // 侧面加强筋 X
  for (const z of [.067, -.067]) {
    for (const s of [1, -1]) p.add(box(.012, .27, .006), paint, A.gas, { p: [-.01, -.02, z], r: [0, 0, s * .6] })
  }
}

function wrench(p: Parts) {
  const enamel = surface('tools', .25, .45), steel = surface('tools', .85, .35)
  const handle = shape([[-.02, -.016], [.16, -.012], [.17, 0], [.16, .012], [-.02, .016]])
  p.add(extrude(handle, .024, { bevel: .004 }), enamel, A.enamel, { p: [-.01, 0, 0] })
  p.add(torus(.012, .004, 12, 6), steel, A.steel, { p: [.162, 0, 0], r: [HP, 0, 0], rect: SUB.steelClean })
  // 钩形上钳口（带齿纹分区）
  const hook = shape([[-.06, -.02], [-.02, -.02], [-.02, .02], [-.115, .02], [-.13, .005], [-.13, -.03], [-.112, -.03], [-.108, -.008], [-.06, -.008]])
  p.add(extrude(hook, .03, { bevel: .003, front: SUB.steelClean, side: SUB.steelRust }), steel, A.steel, { p: [0, .03, 0] })
  // 下钳口
  const jaw = shape([[-.02, -.012], [-.13, -.012], [-.13, .008], [-.02, .008]])
  p.add(extrude(jaw, .028, { bevel: .003, front: SUB.steelClean }), steel, A.steel, { p: [0, -.03, 0] })
  // 滚花调节螺母
  p.add(cyl(.017, .017, .03, 14), steel, A.brass, { p: [-.045, .003, 0], rect: SUB.brassReed })
  p.add(box(.07, .016, .02), steel, A.steel, { p: [-.04, 0, 0], rect: SUB.steelClean })
}

function fuse(p: Parts) {
  const ceramic = surface('tools', 0, .6), brass = surface('tools', .85, .3)
  p.add(lathe([[0, -.07], [.04, -.07], [.045, -.066], [.045, .066], [.04, .07], [0, .07]], 18), ceramic, A.ceramic)
  for (const s of [1, -1]) {
    p.add(lathe([[0, 0], [.05, 0], [.052, .004], [.052, .036], [.049, .04], [.03, .044], [0, .044]], 18), brass, A.brass, { p: [0, s * .062, 0], r: s < 0 ? [PI, 0, 0] : [0, 0, 0], rect: SUB.brassPlain })
    // 刀形触头
    p.add(box(.04, .03, .006), brass, A.brass, { p: [0, s * .118, 0], rect: SUB.brassPlain })
  }
}

function stapler(p: Parts) {
  const plastic = surface('tools', .1, .5), steel = surface('tools', .85, .35)
  const base = shape([[-.11, 0], [.11, 0], [.11, .012], [.09, .02], [-.1, .02], [-.11, .014]])
  p.add(extrude(base, .052, { bevel: .003 }), plastic, A.dark, { p: [0, -.04, 0] })
  const arm = shape([[-.1, 0], [.1, -.006], [.105, .006], [.1, .022], [.02, .036], [-.09, .03], [-.105, .016]])
  p.add(extrude(arm, .046, { bevel: .004 }), plastic, A.dark, { p: [0, -.004, 0], r: [0, 0, .06] })
  p.add(box(.19, .012, .03), steel, A.steel, { p: [.005, -.008, 0], r: [0, 0, .06], rect: SUB.steelClean })
  p.add(box(.04, .004, .03), steel, A.steel, { p: [.085, -.018, 0], rect: SUB.steelClean })
  p.add(cyl(.008, .008, .058, 10), steel, A.steel, { p: [-.098, -.014, 0], r: [HP, 0, 0], rect: SUB.steelClean })
  for (const x of [-.09, .09]) for (const z of [-.018, .018]) p.add(cyl(.007, .008, .004, 8), plastic, A.rubber, { p: [x, -.0435, z], rect: SUB.rubGrey })
}

function keycard(p: Parts) {
  const card = surface('tools', 0, .35), chip = surface('tools', .9, .3)
  p.add(extrude(roundRect(.18, .114, .009), .0028, { bevel: .0004, front: SUB.cardFront, back: SUB.cardBack, side: SUB.rubWhite }), card, A.card, { r: [-HP, 0, 0] })
  // 夹在卡片上方的透明卡套挂扣
  p.add(box(.024, .0012, .02), chip, A.brass, { p: [-.05, .0021, .004], rect: SUB.brassPlain })
  p.add(extrude(roundRect(.03, .012, .005), .004, { bevel: .001 }), card, A.rubber, { p: [0, 0, -.064], r: [-HP, 0, 0], rect: SUB.rubWhite })
}

function nails(p: Parts) {
  const steel = surface('tools', .8, .45)
  const nail = (at: V3, rot: V3, len = .16, bend = 0) => {
    const parts: THREE.BufferGeometry[] = []
    const shaft = lathe([[0, -len / 2 - .012], [.0045, -len / 2], [.0045, len / 2], [0, len / 2]], 6)
    if (bend) warp(shaft, v => { const t = (v.y + len / 2) / len; v.x += Math.sin(t * PI) * bend * t })
    parts.push(shaft)
    const head = cyl(.011, .009, .003, 12); head.translate(0, len / 2 + .0015, 0); parts.push(head)
    for (const q of parts) p.add(q, steel, A.steel, { p: at, r: rot, rect: q === head ? SUB.steelClean : SUB.steelRust })
  }
  nail([0, 0, 0], [0, 0, HP])
  nail([.01, .01, .04], [0, .3, HP])
  nail([-.01, .008, -.035], [0, -.25, HP], .14, .02)
  nail([.02, .018, .005], [0, .9, HP], .12)
  nail([-.02, .016, .02], [0, -.7, HP], .15)
}

function timber(p: Parts) {
  const wood = surface('tools', 0, .82), steel = surface('tools', .8, .45)
  const section = shape([[-.065, -.02], [.065, -.02], [.069, -.016], [.069, .016], [.065, .02], [-.065, .02], [-.069, .016], [-.069, -.016]])
  const plank = extrude(section, .42, { front: SUB.woodEnd, side: SUB.woodLong })
  // 侧壁 UV：u 沿板长，v 绕截面（木纹沿长度方向）
  const pos = plank.getAttribute('position'), nor = plank.getAttribute('normal'), uv = plank.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) if (Math.abs(nor.getZ(i)) < .55) {
    const t = (pos.getZ(i) + .21) / .42, around = (pos.getX(i) + .069) / .138 * .7 + (pos.getY(i) + .02) / .04 * .3
    uv.setXY(i, SUB.woodLong[0] + t * (SUB.woodLong[2] - SUB.woodLong[0]), SUB.woodLong[1] + around * (SUB.woodLong[3] - SUB.woodLong[1]))
  }
  warp(plank, v => { v.y += Math.sin((v.z + .21) / .42 * PI) * .004 })
  p.add(plank, wood, A.wood, { r: [0, HP, 0] })
  for (const [x, z] of [[.17, -.03], [.17, .03], [-.17, 0]]) p.add(cyl(.0065, .0065, .004, 10), steel, A.steel, { p: [x, .0215, z], rect: SUB.steelClean })
}

function housekey(p: Parts) {
  const brass = surface('tools', .85, .38), steel = surface('tools', .85, .3)
  const outline = shape(
    [[-.006, -.08], [.006, -.08], [.016, -.072], [.016, -.062], [.008, -.058], [.016, -.05], [.016, -.042], [.008, -.036], [.014, -.028], [.008, -.02], [.008, .028],
      [.02, .034], [.034, .05], [.036, .072], [.028, .092], [.012, .104], [-.012, .104], [-.028, .092], [-.036, .072], [-.034, .05], [-.02, .034], [-.008, .028]],
    [ellipsePath(.012, .012, 12, 0, .078)])
  p.add(extrude(outline, .004, { bevel: .0012, front: SUB.brassPlain, side: SUB.brassPlain }), brass, A.brass, { p: [0, -.012, 0] })
  p.add(torus(.022, .0024, 20, 5), steel, A.steel, { p: [0, .074, .002], r: [0, HP * .8, 0], rect: SUB.steelClean })
}

function presses(p: Parts) {
  const brass = surface('tools', .85, .4)
  coin(p, brass, A.press, A.brass, .068, .012, [0, 0, 0], [.04, 0, 0], FULL, SUB.brassReed)
  coin(p, brass, A.press, A.brass, .068, .012, [.012, .0135, .008], [-.03, .4, .02], FULL, SUB.brassReed)
  coin(p, brass, A.press, A.brass, .068, .012, [-.008, .027, -.006], [.02, -.3, -.03], FULL, SUB.brassReed)
}

function eaglecoin(p: Parts) {
  const copper = surface('tools', .85, .42)
  coin(p, copper, A.eagle, A.eagle, .08, .018, [0, 0, 0], [0, 0, 0], FULL, [0, 0, 1, .05])
  coin(p, copper, A.eagle, A.eagle, .08, .018, [.014, .02, .006], [.08, 1.1, -.06], FULL, [0, 0, 1, .05])
}

function sedative(p: Parts) {
  const plastic = surface('tools', 0, .32), steel = surface('tools', .9, .25)
  p.add(cyl(.024, .024, .13, 16, true), plastic, A.syringe)
  p.add(lathe([[0, -.086], [.004, -.086], [.006, -.074], [.024, -.066], [.024, -.062], [0, -.062]], 14), plastic, A.rubber, { rect: SUB.rubWhite })
  p.add(cyl(.0225, .0225, .012, 14), plastic, A.rubber, { p: [0, .02, 0], rect: SUB.rubBlack })
  // 指托
  p.add(extrude(shape(ellipsePath(.045, .016, 16)), .005, { bevel: .001 }), plastic, A.rubber, { p: [0, .066, 0], r: [HP, 0, 0], rect: SUB.rubWhite })
  // 十字推杆 + 拇指压盘
  p.add(box(.004, .1, .03), plastic, A.rubber, { p: [0, .075, 0], rect: SUB.rubWhite })
  p.add(box(.03, .1, .004), plastic, A.rubber, { p: [0, .075, 0], rect: SUB.rubWhite })
  p.add(cyl(.022, .022, .005, 16), plastic, A.rubber, { p: [0, .127, 0], rect: SUB.rubWhite })
  p.add(lathe([[0, -.176], [.0012, -.17], [.0012, -.084], [0, -.084]], 6), steel, A.steel, { rect: SUB.steelClean })
}

function uvlamp(p: Parts) {
  const glow = glowMat('tools'), plastic = surface('tools', .05, .55), metal = surface('tools', .85, .35)
  p.add(cyl(.016, .016, .27, 14, true), glow, A.uv, { r: [0, 0, HP] })
  for (const s of [1, -1]) {
    p.add(cyl(.018, .018, .022, 14), metal, A.steel, { p: [s * .145, 0, 0], r: [0, 0, HP], rect: SUB.steelClean })
    for (const z of [-.006, .006]) p.add(cyl(.0018, .0018, .012, 6), metal, A.brass, { p: [s * .162, 0, z], r: [0, 0, HP], rect: SUB.brassPlain })
    p.add(box(.03, .05, .05), plastic, A.dark, { p: [s * .158, -.008, -.012] })
  }
  // 半圆反光罩 + 握柄
  const arc = (r: number) => Array.from({ length: 11 }, (_, i) => [Math.cos(PI + i / 10 * PI) * r, Math.sin(PI + i / 10 * PI) * r])
  const shell = shape([...arc(.036), ...arc(.03).reverse()])
  p.add(extrude(shell, .27, { bevel: .002 }), plastic, A.dark, { r: [HP, HP, 0], p: [0, 0, 0] })
  p.add(extrude(roundRect(.2, .028, .012), .022, { bevel: .003 }), plastic, A.rubber, { p: [0, -.05, -.02], rect: SUB.rubBlack })
}

function headlamp(p: Parts) {
  const fabric = surface('tools', 0, .85), plastic = surface('tools', .1, .45)
  const strap = lathe([[.088, -.016], [.092, -.016], [.092, .016], [.088, .016], [.088, -.016]], 28)
  p.add(strap, fabric, A.strap, { s: [1.1, 1, .9] })
  p.add(extrude(roundRect(.08, .056, .016), .036, { bevel: .006, seg: 2 }), plastic, A.dark, { p: [0, 0, .1] })
  p.add(torus(.02, .004, 18, 6), plastic, A.rubber, { p: [0, 0, .128], rect: SUB.rubGrey })
  const lens = circle(.02, 18); lens.translate(0, 0, .127)
  p.add(lens, plastic, A.lens, { rect: SUB.lensWarm })
  p.add(box(.016, .014, .01), plastic, A.rubber, { p: [.028, .028, .1], rect: SUB.rubRed })
  p.add(box(.06, .03, .012), plastic, A.dark, { p: [0, 0, .078] })
}

function nightvision(p: Parts) {
  const rubber = surface('tools', .05, .7), glass = surface('tools', .3, .15)
  for (const s of [1, -1]) {
    p.add(lathe([[0, -.07], [.03, -.07], [.032, -.062], [.03, -.04], [.034, -.03], [.034, .04], [.04, .05], [.04, .066], [.034, .07], [0, .07]], 14), rubber, A.olive, { p: [s * .068, 0, .02], r: [HP, 0, 0] })
    const lens = circle(.033, 16); p.add(lens, glass, A.lens, { p: [s * .068, 0, .0905], rect: SUB.lensNV })
    const eye = circle(.028, 16); eye.rotateY(PI); p.add(eye, glass, A.lens, { p: [s * .068, 0, -.0505], rect: SUB.lensNV })
  }
  p.add(extrude(roundRect(.09, .05, .012), .05, { bevel: .005 }), rubber, A.olive, { p: [0, .01, .0] })
  p.add(cyl(.012, .012, .03, 10), rubber, A.dark, { p: [0, .045, -.005] })
  p.add(tube([[-.1, .0, -.03], [-.07, .01, -.09], [0, .015, -.11], [.07, .01, -.09], [.1, 0, -.03]], .009, 14, 4), rubber, A.strap)
}

function silverware(p: Parts) {
  const steel = surface('tools', .9, .22)
  const lay = (g: THREE.BufferGeometry) => { g.rotateX(-HP); return g }
  const fork = shape([[-.1, -.007], [.02, -.009], [.04, -.016], [.1, -.016], [.1, -.011], [.06, -.011], [.06, -.004], [.1, -.004], [.1, .004], [.06, .004], [.06, .011], [.1, .011], [.1, .016], [.04, .016], [.02, .009], [-.1, .007], [-.104, 0]])
  const f = extrude(fork, .003, { bevel: .0008, front: SUB.steelClean, side: SUB.steelClean })
  warp(f, v => { v.z += Math.max(0, v.x - .03) ** 2 * 1.6 + Math.max(0, -.04 - v.x) ** 2 * 1.2 })
  p.add(lay(f), steel, A.steel, { r: [0, .45, 0], p: [0, .004, 0] })
  const ys = -.45, c = Math.cos(-ys), sn = Math.sin(-ys)
  const handle = shape([[-.1, -.007], [.03, -.006], [.045, -.004], [.045, .004], [.03, .006], [-.1, .007], [-.104, 0]])
  const h = extrude(handle, .003, { bevel: .0008, front: SUB.steelClean, side: SUB.steelClean })
  warp(h, v => { v.z += Math.max(0, -.04 - v.x) ** 2 * 1.2 })
  const L = -.01
  p.add(lay(h), steel, A.steel, { r: [0, ys, 0], p: [L * c, .012, L * sn] })
  const bowl = sphere(.028, 14, 6, PI / 2, PI / 2); bowl.scale(1.3, .32, 1)
  p.add(twoSided(bowl, .0008), steel, A.steel, { p: [(L + .078) * c, .021, (L + .078) * sn], r: [0, ys, 0], rect: SUB.steelClean })
}

// ======================================================================
// gear 图集
// ======================================================================
const B = T.gear
function gloves(p: Parts) {
  const leather = surface('gear', 0, .78)
  const glove = shape([[-.05, -.13], [.05, -.13], [.055, -.04], [.085, -.01], [.095, .02], [.08, .03], [.05, .005], [.05, .07], [.035, .085], [.025, .07],
    [.018, .095], [.004, .1], [-.006, .085], [-.012, .1], [-.026, .095], [-.03, .08], [-.04, .085], [-.052, .075], [-.055, .0]])
  const g = extrude(glove, .036, { bevel: .01, seg: 2, curve: 3 })
  p.add(g, leather, B.glove, { p: [0, .012, .01], r: [-HP, 0, .08] })
  const g2 = extrude(glove, .034, { bevel: .01, seg: 2, curve: 3 })
  p.add(g2, leather, B.glove, { p: [.018, -.03, -.012], r: [-HP, PI, -.12] })
  p.add(lathe([[.052, -.02], [.06, .02], [.062, .03], [.055, .03]], 16), leather, B.reflect, { p: [-.005, .02, .14], r: [HP, 0, 0], s: [1, 1, .55] })
}

function foldedGarment(p: Parts, outer: number, inner: number, w: number, d: number, plain: Rect = FULL) {
  const fabric = surface('gear', 0, .85), metal = surface('gear', .7, .4)
  const slab = (t: number, y: number, tile: number, rot = 0, rect: Rect = plain) => {
    const g = extrude(roundRect(w, d, .02), t, { bevel: .01, seg: 2, front: rect, side: rect })
    lumpyWelded(g, .003, 30, y * 100)
    p.add(g, fabric, tile, { p: [0, y, 0], r: [-HP, rot, 0] })
  }
  slab(.03, -.03, inner)
  slab(.03, .015, outer, .03)
  // 叠起的袖子与兜帽
  p.add(tube([[-.11, .045, -.06], [-.03, .05, -.02], [.06, .048, .04], [.11, .045, .05]], .018, 12, 6), fabric, outer, { s: [1, .55, 1], rect: plain })
  p.add(sphere(.06, 12, 6, 0, PI / 2), fabric, outer, { p: [0, .04, -.05], s: [1.3, .45, .9], rect: plain })
  p.add(box(.012, .004, .16), metal, B.buckle, { p: [.04, .0425, .01] })
  return fabric
}
function suit(p: Parts) {
  const fabric = foldedGarment(p, B.suit, B.suit, .26, .2, [0, 0, .28, 1])
  const patch = circle(.04, 16); patch.rotateX(-HP)
  p.add(patch, fabric, B.suit, { p: [-.07, .0445, .045], rect: SUB.suitPatch })
}
function cavingsuit(p: Parts) {
  const fabric = foldedGarment(p, B.nylon, B.fleece, .26, .2)
  p.add(box(.262, .006, .03), fabric, B.reflect, { p: [0, .042, .05] })
  p.add(box(.262, .006, .03), fabric, B.reflect, { p: [0, -.002, -.06] })
}

function rope(p: Parts) {
  const fiber = surface('gear', 0, .9)
  const pts: V3[] = []
  for (let i = 0; i <= 64; i++) { const t = i / 64 * PI * 4.1, r = .135 - i / 64 * .02; pts.push([Math.cos(t) * r, -.03 + i / 64 * .06 + Math.sin(i * .9) * .003, Math.sin(t) * r]) }
  tubePieces(p, fiber, B.rope, pts, .018, 26, 3, 5)
  tubePieces(p, fiber, B.rope, [[.1, .03, -.06], [.15, .04, -.02], [.19, .02, .03], [.2, .0, .08]], .017, 4, 3, 5)
  // 缠绕绑扎
  p.add(lathe([[.022, -.02], [.024, -.012], [.024, .012], [.022, .02]], 10), fiber, B.rope, { p: [.13, .0, .03], r: [HP, 0, .3] })
}

function divemask(p: Parts) {
  const silicone = surface('gear', 0, .55), glass = glassMat('gear', .45), metal = surface('gear', .7, .35)
  const outer = [[-.12, .0], [-.115, .05], [-.08, .07], [-.02, .065], [0, .06], [.02, .065], [.08, .07], [.115, .05], [.12, 0], [.1, -.045], [.04, -.06], [.015, -.04], [-.015, -.04], [-.04, -.06], [-.1, -.045]]
  const inner = [[-.1, .0], [-.095, .04], [-.07, .052], [-.02, .05], [0, .046], [.02, .05], [.07, .052], [.095, .04], [.1, 0], [.085, -.03], [.04, -.042], [.012, -.026], [-.012, -.026], [-.04, -.042], [-.085, -.03]]
  p.add(extrude(shape(outer, [inner]), .018, { bevel: .004 }), silicone, B.silicone, { p: [0, 0, .03] })
  p.add(extrude(shape(inner), .004), glass, B.maskglass, { p: [0, 0, .032] })
  const skirt = extrude(shape(outer.map(([x, y]) => [x * 1.06, y * 1.1])), .045, { bevel: .006, seg: 2 })
  warp(skirt, v => { const t = (v.z + .0225) / .045; v.x *= 1 - (1 - t) * .08; v.y *= 1 - (1 - t) * .08 })
  p.add(skirt, silicone, B.silicone, { p: [0, 0, -.005] })
  p.add(tube([[-.125, .01, 0], [-.13, .015, -.08], [-.06, .02, -.15], [0, .022, -.16], [.06, .02, -.15], [.13, .015, -.08], [.125, .01, 0]], .01, 18, 4), silicone, B.silicone, { s: [1, 1.6, 1] })
  for (const s of [1, -1]) p.add(box(.016, .03, .02), metal, B.buckle, { p: [s * .127, .01, .0] })
}

function chalkstub(p: Parts) {
  const chalk = surface('gear', 0, .95)
  const stick = lathe([[0, -.05], [.024, -.05], [.026, -.046], [.026, .042], [.022, .048], [0, .052]], 14)
  warp(stick, v => { if (v.y > .04) v.y += noise3(v.x * 200, v.z * 200, 3) * .006 })
  p.add(stick, chalk, B.chalk, { r: [0, 0, HP] })
  p.add(lumpyWelded(sphere(.03, 12, 5, 0, PI / 2), .004, 120, 2), chalk, B.chalk, { p: [.035, -.026, .02], s: [1.2, .18, 1] })
  p.add(lumpyWelded(sphere(.012, 8, 5), .002, 200, 5), chalk, B.chalk, { p: [-.05, -.018, .03], s: [1, .7, 1] })
}

function stonekazoo(p: Parts) {
  const stone = surface('gear', 0, .9)
  const body = lathe([[0, -.105], [.03, -.104], [.044, -.08], [.05, -.03], [.048, .03], [.042, .08], [.034, .1], [.026, .106], [.02, .106]], 12)
  lumpyWelded(body, .006, 40, 1)
  p.add(body, stone, B.stone, { r: [0, 0, HP] })
  p.add(lathe([[.02, 0], [.034, 0], [.03, .04], [.022, .05], [.016, .05]], 10), stone, B.stone, { p: [.015, .036, 0] })
  for (const [x, z, r] of [[-.07, .03, .7], [.05, -.035, -.9], [-.02, .04, 1.2]] as const) {
    p.add(lumpyWelded(new THREE.ConeGeometry(.012, .035, 6), .002, 80, x * 100), stone, B.stone, { p: [x, .02, z], r: [r, 0, r * .5] })
  }
}

function wheatgrain(p: Parts) {
  const straw = surface('gear', 0, .8)
  for (let i = 0; i < 3; i++) {
    const a = (i - 1) * .16, bx = Math.sin(a) * .2, by = Math.cos(a) * .2 - .1
    tubePieces(p, straw, B.straw, [[(i - 1) * .006, -.13, (i - 1) * .004], [bx * .5, -.02, (i - 1) * .008], [bx, by + .05, (i - 1) * .01]], .0042, 3, 2, 4)
    const ear = sphere(.016, 10, 8)
    p.add(ear, straw, B.grain, { p: [bx * 1.13, by + .1, (i - 1) * .01], r: [0, 0, -a], s: [.85, 3.2, .7] })
    for (let k = 0; k < 6; k++) {
      const y0 = by + .07 + k * .012, side = k % 2 ? 1 : -1
      p.add(tube([[bx * 1.13 + side * .008, y0, (i - 1) * .01], [bx * 1.13 + side * .02 - a * .1, y0 + .05, (i - 1) * .01 + (k % 3 - 1) * .006]], .0006, 1, 3), straw, B.straw, { rect: [0, 0, 1, .2] })
    }
    // 叶片
    const blade = new THREE.PlaneGeometry(.012, .09, 1, 4)
    warp(blade, v => { const t = (v.y + .045) / .09; v.x *= 1 - t * .9; v.z = t * t * .03 })
    p.add(twoSided(blade), straw, B.straw, { p: [bx * .4 + .01, -.03, (i - 1) * .008 + .006], r: [0, i, -.5 + i * .4] })
  }
}

function xenonmarble(p: Parts) {
  const glass = glassMat('gear', .5), glow = glowMat('gear'), metal = surface('gear', .85, .3)
  p.add(sphere(.08, 18, 12), glass, B.xenon)
  p.add(new THREE.IcosahedronGeometry(.04, 1), glow, B.xenon, { r: [.3, .5, 0] })
  p.add(torus(.04, .007, 18, 6), metal, B.buckle, { p: [0, -.08, 0], r: [HP, 0, 0] })
  p.add(cyl(.05, .055, .01, 18), metal, B.buckle, { p: [0, -.092, 0] })
}

function driedfruit(p: Parts) {
  const cloth = surface('gear', 0, .9)
  const sack = lathe([[0, -.09], [.07, -.088], [.1, -.06], [.11, -.01], [.1, .04], [.075, .07], [.045, .085], [.05, .1], [.07, .12], [.06, .125]], 16)
  lumpyWelded(sack, .007, 25, 4)
  p.add(sack, cloth, B.burlap)
  p.add(torus(.048, .007, 16, 5), cloth, B.rope, { p: [0, .087, 0], r: [HP, 0, 0] })
  p.add(tube([[.04, .088, .02], [.08, .07, .05], [.1, .04, .05]], .005, 6, 4), cloth, B.rope)
  const fruit: [V3, Rect, number][] = [[[.02, .118, .01], SUB.fruitApricot, .028], [[-.025, .12, -.01], SUB.fruitRaisin, .02], [[0, .125, -.03], SUB.fruitFig, .024], [[-.01, .116, .03], SUB.fruitApple, .026], [[.035, .112, -.025], SUB.fruitRaisin, .016]]
  for (const [at, rect, r] of fruit) p.add(lumpyWelded(sphere(r, 10, 6), r * .15, 60, at[0] * 50), cloth, B.fruit, { p: at, s: [1, .55, 1], rect, r: [at[2] * 10, 0, at[0] * 10] })
}

// ======================================================================
// food 图集
// ======================================================================
const C = T.food
function bowl(p: Parts, mat: THREE.Material, tile: number, r: number, h: number, seg = 20) {
  p.add(lathe([[0, -h / 2], [r * .55, -h / 2], [r * .62, -h / 2 + .006], [r * .9, -h / 2 + h * .55], [r, h / 2], [r * .96, h / 2 + .002], [r * .9, h / 2 - .006], [r * .82, -h / 2 + h * .5], [r * .45, -h / 2 + .01], [0, -h / 2 + .01]], seg), mat, tile)
}
function surfaceDisc(p: Parts, mat: THREE.Material, tile: number, r: number, y: number, rect: Rect = FULL, seg = 20, wobble = 0) {
  const d = circle(r, seg); d.rotateX(-HP)
  if (wobble) warp(d, v => { v.y += noise3(v.x * 60, v.z * 60, 9) * wobble })
  p.add(d, mat, tile, { p: [0, y, 0], rect })
}
function leaf(p: Parts, mat: THREE.Material, tile: number, at: V3, rot: V3, size: number, rect: Rect, curl = .4) {
  const g = new THREE.PlaneGeometry(size, size * 1.6, 2, 3)
  warp(g, v => { const t = (v.y / (size * 1.6)) + .5; v.x *= Math.sin(t * PI) * 1.1 + .1; v.z = (v.x / size) ** 2 * size * curl + Math.sin(t * PI) * size * .1 })
  p.add(twoSided(g), mat, tile, { p: at, r: rot, rect })
}

function thingmeat(p: Parts) {
  const meat = surface('food', 0, .45)
  const g = new THREE.BoxGeometry(.25, .085, .17, 4, 2, 3)
  warp(g, v => { v.x *= 1 + noise3(v.y * 20, v.z * 20, 1) * .08; v.z *= 1 + noise3(v.x * 15, v.y * 15, 2) * .1; v.y *= 1 - Math.abs(v.x) * 1.4 })
  lumpyWelded(g, .006, 30, 3)
  p.add(g, meat, C.meat)
  // 第二块较小的肉块斜靠在主块上
  const chunk = new THREE.BoxGeometry(.12, .06, .09, 3, 2, 2)
  lumpyWelded(chunk, .006, 35, 8)
  p.add(chunk, meat, C.meat, { p: [.05, .06, .01], r: [.2, .5, -.25] })
  p.add(lathe([[.012, -.04], [.016, -.036], [.013, .03], [.02, .04], [.012, .046], [0, .046]], 10), meat, C.ceramic, { p: [-.13, .0, .02], r: [0, 0, HP] })
}

// v79：尸鼠肉——一条细长、略卷的瘦肉，一端连着一截细骨
function ratmeat(p: Parts) {
  const meat = surface('food', 0, .5)
  const g = new THREE.BoxGeometry(.2, .045, .07, 5, 2, 2)
  warp(g, v => { v.y += Math.sin(v.x * 18) * .008; v.z *= 1 - Math.abs(v.x) * 1.8; v.y *= 1 - Math.abs(v.x) * 1.5 })
  lumpyWelded(g, .004, 40, 5)
  p.add(g, meat, C.meat, { r: [0, .3, .05] })
  p.add(lathe([[.006, -.05], [.009, -.046], [.006, .04], [.01, .048], [0, .05]], 8), meat, C.ceramic, { p: [-.1, .0, -.03], r: [0, .3, HP] })
}

/** 虾体沿弧线：头在 -X，背部拱起，尾扇在 +X 向下卷。返回头部位置与朝向。 */
function shrimpPath(t: number) {
  const ang = PI * (.92 - .98 * t), rad = .095
  return { x: Math.cos(ang) * rad, y: Math.sin(ang) * rad * .72 - .02, rz: ang - PI }
}
function shrimpBody(p: Parts, mat: THREE.Material, battered: boolean) {
  const segs = 7
  for (let i = 0; i < segs; i++) {
    const t = (i + .5) / segs, { x, y, rz } = shrimpPath(t), r = .04 - t * .02
    const g = battered ? lumpyWelded(sphere(r * 1.3, 10, 7), r * .18, 90, i * 3) : lathe([[0, -.017], [r * .82, -.017], [r, -.006], [r * .96, .014], [r * .74, .02], [0, .02]], 10)
    p.add(g, mat, battered ? C.batter : C.shell, { p: [x, y, 0], r: [0, 0, rz], s: battered ? [1, 1.25, .9] : [1, 1, .85], rect: battered ? FULL : SUB.shellBody })
  }
  // 尾扇：三片沿尾端切线向外张开
  const end = shrimpPath(1.02)
  for (const s of [1, -1, 0]) {
    const fan = extrude(shape([[0, 0], [.06, -.016], [.07, 0], [.06, .016]]), .004, { bevel: .001, front: SUB.shellBody })
    p.add(fan, mat, C.shell, { p: [end.x, end.y, s * .012], r: [HP, s * .45, end.rz - HP] })
  }
  return shrimpPath(0)
}
function dryshrimp(p: Parts) {
  const shell = surface('food', 0, .4)
  const head = shrimpBody(p, shell, false)
  const hx = head.x - .03, hy = head.y - .004
  p.add(lathe([[0, -.04], [.028, -.032], [.044, -.005], [.04, .025], [.02, .045], [0, .05]], 12), shell, C.shell, { p: [hx, hy, 0], r: [0, 0, HP * .8], s: [1, 1, .85], rect: SUB.shellBody })
  for (const s of [1, -1]) {
    p.add(sphere(.008, 8, 5), shell, C.shell, { p: [hx - .028, hy + .02, s * .022], rect: SUB.shellDark })
    p.add(tube([[hx - .04, hy + .005, s * .01], [hx - .09, hy + .05, s * .04], [hx - .14, hy + .045, s * .08], [hx - .18, hy + .01, s * .1]], .0018, 8, 3), shell, C.shell, { rect: SUB.shellDark })
    for (let k = 0; k < 5; k++) {
      const q = shrimpPath(.12 + k * .13)
      p.add(tube([[q.x, q.y - .022, s * .015], [q.x - .004, q.y - .045, s * .035], [q.x - .01, q.y - .058, s * .04]], .002, 2, 3), shell, C.shell, { rect: SUB.shellBody })
    }
  }
}
function friedshrimp(p: Parts) {
  const fried = surface('food', 0, .7)
  const head = shrimpBody(p, fried, true)
  p.add(lumpyWelded(sphere(.05, 12, 8), .008, 80, 7), fried, C.batter, { p: [head.x - .035, head.y, 0], s: [1.15, 1, .95] })
  for (const [x, z] of [[-.05, .06], [.04, -.06], [-.13, -.04]]) p.add(lumpyWelded(sphere(.012, 6, 4), .003, 200, x * 90), fried, C.batter, { p: [x, -.07, z] })
}

function tomatosoup(p: Parts) {
  const food = surface('food', 0, .35)
  bowl(p, food, C.ceramic, .13, .1)
  surfaceDisc(p, food, C.soup, .112, .038, FULL, 22, .002)
  leaf(p, food, C.misc, [.03, .043, .02], [-HP, 0, .6], .022, SUB.herb, .2)
  leaf(p, food, C.misc, [.012, .043, .035], [-HP, 0, 2.2], .018, SUB.herb, .2)
  for (const [x, z] of [[-.04, -.02], [-.02, -.05], [.05, -.03]]) p.add(box(.018, .016, .018), food, C.bread, { p: [x, .045, z], r: [.2, x * 20, .1], rect: SUB.crust })
}

function gardensalad(p: Parts) {
  const food = surface('food', 0, .45)
  bowl(p, food, C.ceramic, .13, .085)
  surfaceDisc(p, food, C.salad, .108, .028, FULL, 18, .004)
  const leaves: [V3, V3, number][] = [[[-.04, .05, 0], [-1, .4, .2], .05], [[.03, .055, .03], [-.9, 2.1, -.3], .052], [[.01, .05, -.045], [-1.2, -1, .1], .048], [[-.03, .055, .04], [-.7, 3.6, .3], .045], [[.055, .05, -.01], [-1.1, 1.2, .4], .042]]
  for (const [at, rot, s] of leaves) leaf(p, food, C.salad, at, rot, s, FULL, .8)
  for (const [x, z] of [[.02, -.01], [-.05, -.03], [.045, .045]]) p.add(sphere(.016, 10, 7), food, C.misc, { p: [x, .07, z], rect: SUB.tomato })
  for (let i = 0; i < 4; i++) p.add(box(.04, .004, .004), food, C.misc, { p: [-.02 + i * .012, .072, .01 - i * .01], r: [0, i * .8, 0], rect: SUB.carrot })
}

function garlicbread(p: Parts) {
  const bread = surface('food', 0, .75)
  const profile = [[-.045, 0], [.045, 0], [.048, .02], [.04, .045], [.02, .058], [0, .062], [-.02, .058], [-.04, .045], [-.048, .02]]
  for (let i = 0; i < 3; i++) {
    const g = extrude(shape(profile), .038, { bevel: .003, front: SUB.crumb, side: SUB.crust })
    lumpyWelded(g, .002, 60, i)
    p.add(g, bread, C.bread, { p: [-.085 + i * .085, -.03, 0], r: [-.35, HP, 0] })
  }
  for (const [x, z] of [[-.09, .01], [0, -.012], [.08, .005]]) p.add(box(.012, .002, .008), bread, C.misc, { p: [x, .015, z], r: [0, x * 30, 0], rect: SUB.herb })
}

function pasta(p: Parts) {
  const food = surface('food', 0, .4)
  p.add(lathe([[0, -.015], [.1, -.015], [.11, -.01], [.16, .008], [.165, .014], [.155, .012], [.1, -.004], [0, -.004]], 24), food, C.ceramic)
  const nest = lathe([[.1, -.004], [.095, .01], [.075, .045], [.04, .066], [0, .07]], 18)
  lumpyWelded(nest, .006, 45, 2)
  p.add(nest, food, C.pasta)
  tubePieces(p, food, C.pasta, [[.09, 0, -.03], [.12, .004, .02], [.1, .006, .07], [.06, .004, .09]], .003, 3, 3, 4)
  tubePieces(p, food, C.pasta, [[-.09, 0, .02], [-.12, .004, -.03], [-.09, .006, -.08]], .003, 2, 3, 4)
  const sauce = lumpyWelded(sphere(.05, 12, 6, 0, PI / 2), .005, 70, 4)
  p.add(sauce, food, C.misc, { p: [0, .052, 0], s: [1.2, .5, 1], rect: SUB.tomato })
  leaf(p, food, C.misc, [.012, .078, .01], [-1.2, .3, .4], .02, SUB.herb, .2)
  for (const [x, z] of [[-.025, .03], [.03, -.02]]) p.add(box(.008, .006, .008), food, C.misc, { p: [x, .076, z], rect: SUB.cheese })
}

function potWithHandles(p: Parts, mat: THREE.Material, tile: number, r: number, h: number, flare = 1.05) {
  p.add(lathe([[0, -h / 2], [r * .85, -h / 2], [r, -h / 2 + .015], [r, h / 2 - .01], [r * flare, h / 2], [r * flare * .96, h / 2 + .004], [r * .94, h / 2 - .008], [r * .94, -h / 2 + .012], [0, -h / 2 + .012]], 20), mat, tile)
  for (const s of [1, -1]) p.add(torus(.022, .006, 10, 5, PI), mat, tile, { p: [s * (r + .004), h / 2 - .025, 0], r: [HP, 0, s > 0 ? -HP : HP] })
}
function meatstew(p: Parts) {
  const food = surface('food', 0, .55)
  potWithHandles(p, food, C.stoneware, .115, .12)
  surfaceDisc(p, food, C.stew, .108, .04, FULL, 20, .003)
  for (const [x, z] of [[.03, .02], [-.04, -.01], [.0, -.045], [-.02, .045]]) p.add(lumpyWelded(new THREE.BoxGeometry(.03, .022, .028, 2, 1, 2), .003, 70, x * 40), food, C.steak, { p: [x, .046, z], r: [x * 20, z * 20, 0], rect: SUB.steakTop })
  for (const [x, z] of [[.05, -.03], [-.055, .03]]) p.add(cyl(.011, .011, .006, 10), food, C.misc, { p: [x, .045, z], r: [.2, 0, .1], rect: SUB.carrot })
}

function pizza(p: Parts) {
  const food = surface('food', 0, .6)
  p.add(lathe([[.0, -.012], [.15, -.012], [.155, -.006], [.156, .006], [.15, .014], [.138, .012], [.132, .006], [0, .006]], 28), food, C.bread, { rect: SUB.crust })
  surfaceDisc(p, food, C.pizza, .134, .0075, FULL, 28, .0012)
  const pep: [number, number][] = [[-.05, .03], [.04, -.05], [.06, .04], [-.02, -.07], [-.07, -.04], [.01, .075], [.08, -.005]]
  for (const [x, z] of pep) p.add(cyl(.016, .016, .004, 12), food, C.meat, { p: [x, .011, z], r: [x * 3, 0, z * 3] })
  for (const [x, z, a] of [[.0, .0, .3], [-.06, .07, 1.8], [.07, -.07, 2.6]]) leaf(p, food, C.misc, [x, .012, z], [-HP, 0, a], .016, SUB.herb, .1)
}

function lasagna(p: Parts) {
  const food = surface('food', 0, .55)
  p.add(lathe([[0, -.07], [.12, -.07], [.15, -.062], [.155, -.058], [.12, -.06], [0, -.06]], 22), food, C.ceramic)
  const slice = extrude(shape([[-.095, -.07], [.09, -.075], [.1, .07], [-.09, .075]]), .1, { bevel: .004, front: SUB.baked, back: SUB.baked, side: SUB.layers })
  // 侧壁 UV：v 为高度（层次水平）
  const pos = slice.getAttribute('position'), nor = slice.getAttribute('normal'), uv = slice.getAttribute('uv')
  for (let i = 0; i < pos.count; i++) if (Math.abs(nor.getZ(i)) < .55) {
    const around = (pos.getX(i) + .1) / .2 * .5 + (pos.getY(i) + .075) / .15 * .5
    uv.setXY(i, around, .5 + (pos.getZ(i) + .054) / .108 * .5)
  }
  lumpyWelded(slice, .0015, 80, 2)
  p.add(slice, food, C.lasagna, { p: [0, -.004, 0], r: [-HP, 0, .1] })
  leaf(p, food, C.misc, [.02, .05, .01], [-HP, 0, .9], .02, SUB.herb, .15)
}

function tomsspecial(p: Parts) {
  const copper = surface('food', .8, .35), food = surface('food', 0, .5)
  potWithHandles(p, copper, C.copper, .115, .11, 1.14)
  surfaceDisc(p, food, C.stew, .105, .035, FULL, 20, .003)
  for (const [x, z] of [[.035, .01], [-.035, -.025], [-.01, .045]]) p.add(lumpyWelded(new THREE.BoxGeometry(.03, .022, .028, 2, 1, 2), .003, 70, x * 40), food, C.steak, { p: [x, .041, z], rect: SUB.steakTop })
  p.add(cyl(.012, .012, .006, 10), food, C.misc, { p: [.05, .04, -.04], rect: SUB.carrot })
  leaf(p, food, C.misc, [-.04, .045, .02], [-1.4, 0, -.6], .024, SUB.herb, .1)
}

function grilledsteak(p: Parts) {
  const food = surface('food', 0, .55)
  const outline = shape([[-.12, -.04], [-.07, -.08], [.02, -.085], [.1, -.06], [.13, -.01], [.11, .05], [.05, .08], [-.03, .075], [-.1, .055], [-.13, .01]])
  const steak = extrude(outline, .032, { bevel: .006, seg: 2, curve: 3, front: SUB.steakTop, side: SUB.steakEdge })
  lumpyWelded(steak, .003, 35, 1)
  p.add(steak, food, C.steak, { r: [-HP, 0, 0] })
  tubePieces(p, food, C.misc, [[-.05, .03, .02], [.0, .034, .035], [.06, .03, .03]], .003, 2, 3, 4, SUB.herb)
  for (let k = 0; k < 5; k++) leaf(p, food, C.misc, [-.04 + k * .02, .033, .03 + (k % 2 ? .006 : -.006)], [-HP, 0, k % 2 ? .8 : -.8], .006, SUB.herb, .1)
}

function jambread(p: Parts) {
  const food = surface('food', 0, .65), jam = surface('food', 0, .18)
  const toast = shape([[-.085, -.08], [.085, -.08], [.088, .03], [.1, .055], [.08, .085], [.04, .095], [-.04, .095], [-.08, .085], [-.1, .055], [-.088, .03]])
  p.add(extrude(toast, .02, { bevel: .003, front: SUB.crumb, side: SUB.crust }), food, C.bread, { r: [-HP, 0, 0] })
  const spread = shape([[-.075, -.068], [.075, -.07], [.078, .03], [.085, .05], [.07, .072], [-.07, .074], [-.085, .05], [-.078, .03]])
  const layer = extrude(spread, .006, { bevel: .002, seg: 2 })
  lumpyWelded(layer, .0015, 70, 3)
  p.add(layer, jam, C.jam, { p: [0, .015, 0], r: [-HP, 0, 0] })
  p.add(lumpyWelded(sphere(.012, 8, 6), .002, 150, 4), jam, C.jam, { p: [.08, .008, .06], s: [1, 1.6, 1] })
}

// ======================================================================
// paper 图集
// ======================================================================
const D = T.paper
function megfolder(p: Parts) {
  const paper = surface('paper', 0, .85), clip = surface('paper', .85, .3)
  const cover = shape([[-.13, -.16], [.13, -.16], [.13, .16], [.07, .16], [.06, .175], [-.02, .175], [-.03, .16], [-.13, .16]])
  p.add(extrude(cover, .003, { front: FULL, back: FULL, side: SUB.sheet }), paper, D.kraft, { p: [0, -.012, 0], r: [-HP, 0, 0] })
  for (let i = 0; i < 4; i++) p.add(box(.24, .002, .3, [SUB.pageEdge, SUB.pageEdge, SUB.sheet, SUB.sheet, SUB.pageEdge, SUB.pageEdge]), paper, D.paper, { p: [.004 + i * .003, -.008 + i * .0025, i * .002], r: [0, i * .012, 0] })
  const top = extrude(cover, .003, { front: FULL, back: FULL, side: SUB.sheet })
  p.add(top, paper, D.kraft, { p: [0, .006, 0], r: [-HP + .08, 0, .02] })
  p.add(tube([[-.1, .011, -.165], [-.1, .012, -.12], [-.09, .012, -.12], [-.09, .011, -.17], [-.08, .011, -.17], [-.08, .012, -.13]], .0012, 18, 3), clip, D.foil, { rect: SUB.foilSilver })
}

function oddbook(p: Parts) {
  const book = surface('paper', 0, .8)
  for (const y of [-.022, .022]) p.add(extrude(roundRect(.2, .26, .006), .006, { bevel: .001, front: FULL, back: FULL, side: SUB.spine }), book, D.cloth, { p: [.0, y, 0], r: [-HP, 0, 0] })
  p.add(box(.19, .038, .25, [SUB.pageEdge, SUB.pageEdge, SUB.sheet, SUB.sheet, SUB.pageEdge, SUB.pageEdge]), book, D.paper, { p: [.006, 0, 0] })
  p.add(cyl(.025, .025, .26, 12, true, ), book, D.cloth, { p: [-.1, 0, 0], r: [HP, 0, 0], s: [.6, 1, 1], rect: SUB.spine })
  p.add(torus(.004, .0016, 8, 4), surface('paper', .85, .3), D.foil, { p: [.094, .026, .0], r: [0, HP, 0], rect: SUB.foilBrass })
}

function pamphlet(p: Parts) {
  const paper = surface('paper', 0, .7)
  const w = .1
  for (let k = 0; k < 3; k++) {
    const ang = k === 1 ? 0 : (k === 0 ? .35 : -.35)
    const g = extrude(roundRect(w, .22, .002), .0016, { front: [k / 3, .5, (k + 1) / 3, 1], back: [k / 3, 0, (k + 1) / 3, .5], side: SUB.wrapper, mirrorBack: true })
    const x = (k - 1) * w * Math.cos(ang) * .98
    p.add(g, paper, D.pamphlet, { p: [x, Math.abs(k - 1) * .016, 0], r: [-HP, k === 0 ? .3 : k === 2 ? -.3 : 0, 0] })
  }
}

function noteSheet(p: Parts, tile: number, burnt: boolean) {
  const paper = surface('paper', 0, .85)
  const pts: number[][] = []
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * PI * 2, r = 1 + (burnt ? noise3(i * .7, 3, 1) * .12 : 0)
    const sx = Math.cos(a), sy = Math.sin(a), k = Math.max(Math.abs(sx), Math.abs(sy) * 1.43)
    pts.push([sx / k * .1 * r, sy / k * .07 * r])
  }
  const g = extrude(shape(pts), .0012, { front: FULL, back: FULL, side: FULL })
  warp(g, v => { v.z += (v.x / .1) ** 2 * .01 + (burnt ? noise3(v.x * 40, v.y * 40, 2) * .004 : 0) })
  p.add(g, paper, tile, { r: [-HP, 0, .1] })
}
function endnote(p: Parts) { noteSheet(p, D.burnt, true) }
function welcomenote(p: Parts) {
  const paper = surface('paper', 0, .85)
  // 两折纸：沿中线微微隆起
  for (const s of [-1, 1]) {
    const g = extrude(roundRect(.1, .14, .002), .0012, { front: s < 0 ? [0, 0, .5, 1] : [.5, 0, 1, 1], back: FULL, side: FULL })
    p.add(g, paper, D.welcome, { p: [s * .05 * Math.cos(.12), .006, 0], r: [-HP, s * .12, 0] })
  }
}

function notebook(p: Parts) {
  const cover = surface('paper', 0, .7), pen = surface('paper', .75, .35)
  for (const y of [-.016, .016]) p.add(extrude(roundRect(.2, .26, .012), .004, { bevel: .001, front: SUB.leatherBody, side: SUB.leatherBody }), cover, D.leather, { p: [0, y, 0], r: [-HP, 0, 0] })
  p.add(box(.19, .028, .25, [SUB.pageEdge, SUB.pageEdge, SUB.sheet, SUB.sheet, SUB.pageEdge, SUB.pageEdge]), cover, D.paper, { p: [.004, 0, 0] })
  p.add(cyl(.02, .02, .26, 10, true), cover, D.leather, { p: [-.1, 0, 0], r: [HP, 0, 0], s: [.42, 1, .82], rect: SUB.leatherBody })
  p.add(box(.012, .041, .262), cover, D.leather, { p: [.07, 0, 0], rect: SUB.elastic })
  p.add(lathe([[0, -.1], [.003, -.096], [.006, -.08], [.0065, .085], [.0062, .1], [0, .102]], 10), pen, D.gunmetal, { p: [.04, .025, .02], r: [0, 0, HP], rect: SUB.blued })
  p.add(box(.06, .004, .003), pen, D.gunmetal, { p: [-.05, .032, .02], rect: SUB.blued })
}

function parcel(p: Parts) {
  const card = surface('paper', 0, .85)
  const g = new THREE.BoxGeometry(.24, .18, .2, 2, 2, 2)
  const pos = g.getAttribute('position'), nor = g.getAttribute('normal'), uv = g.getAttribute('uv')
  const faceRect = (ny: number, nz: number): Rect => ny > .5 ? SUB.boxTop : ny < -.5 ? SUB.boxBottom : Math.abs(nz) > .5 ? SUB.boxTape : SUB.boxSide
  for (let i = 0; i < pos.count; i++) {
    const r = faceRect(nor.getY(i), nor.getZ(i))
    uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]))
  }
  warp(g, v => { const bulge = (1 - (v.x / .12) ** 2) * (1 - (v.z / .1) ** 2); if (v.y > .08) v.y += bulge * .004; v.x += noise3(v.y * 30, v.z * 30, 1) * .002 })
  p.add(g, card, D.cardboard)
  // 盒盖缝处翻起的胶带边
  p.add(box(.06, .0015, .205), card, D.cardboard, { p: [0, .0915, 0], rect: [.7, .55, .8, .95] })
}

function candysilver(p: Parts) {
  const foil = surface('paper', .9, .3)
  // 舌形：根部宽、舌尖圆，顶面中缝下凹、两侧鼓起
  const pts: number[][] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24 * PI * 2, cx = Math.cos(t), sx = Math.sin(t)
    const halfW = .045 * (cx < 0 ? 1 : 1 - cx * .18)
    pts.push([cx * (cx > 0 ? .075 : .06), sx * halfW])
  }
  const g = extrude(shape(pts), .016, { bevel: .009, seg: 3, curve: 6, front: SUB.foilSilver, side: SUB.foilSilver })
  warp(g, v => { if (v.z > 0) { v.z += (1 - Math.min(1, (v.y / .05) ** 2)) * .006; v.z -= Math.exp(-((v.y / .007) ** 2)) * .007 * (1 - Math.max(0, v.x + .02) / .1) } })
  p.add(g, foil, D.foil, { r: [-HP, 0, 0] })
}

function candybullet(p: Parts) {
  const foil = surface('paper', .9, .32)
  p.add(lathe([[0, 0], [.036, 0], [.037, .004], [.033, .008], [.035, .012], [.035, .088]], 16), foil, D.foil, { rect: SUB.foilBrass })
  const tip = lathe([[.034, .088], [.033, .11], [.026, .135], [.014, .155], [0, .162]], 16)
  lumpyWelded(tip, .0008, 400, 2)
  p.add(tip, foil, D.foil, { rect: SUB.foilSilver })
  const base = circle(.036, 16); base.rotateX(HP)
  p.add(base, foil, D.foil, { rect: SUB.foilBrass })
  p.add(cyl(.009, .009, .002, 12), foil, D.foil, { p: [0, -.001, 0], rect: SUB.foilSilver })
}

function candygun(p: Parts) {
  const metal = surface('paper', .8, .35), grip = surface('paper', 0, .7)
  const slide = shape([[-.07, 0], [.075, 0], [.075, .032], [.068, .036], [-.065, .036], [-.07, .03]])
  p.add(extrude(slide, .028, { bevel: .003, front: SUB.blued, side: SUB.blued }), metal, D.gunmetal, { p: [0, .065, 0] })
  p.add(cyl(.008, .008, .02, 10), metal, D.gunmetal, { p: [.084, .08, 0], r: [0, 0, HP], rect: SUB.blued })
  const frame = shape([[-.06, 0], [.06, 0], [.06, .014], [-.06, .014]])
  p.add(extrude(frame, .024, { bevel: .002, front: SUB.blued }), metal, D.gunmetal, { p: [0, .052, 0] })
  const g = shape([[-.06, .052], [-.03, .052], [-.012, -.02], [-.02, -.032], [-.05, -.032], [-.07, .03]])
  p.add(extrude(g, .03, { bevel: .003, front: SUB.grip, side: SUB.grip }), grip, D.gunmetal, { rect: FULL })
  p.add(torus(.016, .0025, 12, 4, PI), metal, D.gunmetal, { p: [.0, .052, 0], r: [0, 0, PI], rect: SUB.blued })
  p.add(box(.004, .016, .006), metal, D.gunmetal, { p: [.0, .044, 0], r: [0, 0, .25], rect: SUB.blued })
}

function candystanley(p: Parts) {
  const paper = surface('paper', 0, .8)
  const fig = shape([[-.018, .09], [-.012, .1], [-.016, .12], [-.01, .132], [.01, .132], [.016, .12], [.012, .1], [.018, .09], [.05, .085], [.068, .03], [.058, .026], [.042, .065],
    [.034, .065], [.032, .0], [.026, -.075], [.008, -.075], [0, -.005], [-.008, -.075], [-.026, -.075], [-.032, 0], [-.034, .065], [-.042, .065], [-.058, .026], [-.068, .03], [-.05, .085]])
  const g = extrude(fig, .006, { bevel: .0012, front: SUB.stanleyFront, back: SUB.stanleyBack, side: SUB.stanleyBack, mirrorBack: true })
  warp(g, v => { v.z += Math.sin(v.y * 30) * .003 })
  p.add(g, paper, D.stanley, { p: [0, .0, 0] })
}

function candywaste(p: Parts) {
  const paint = surface('paper', .4, .5)
  const prof: number[][] = [[0, -.065], [.052, -.065], [.056, -.06], [.056, -.04], [.059, -.036], [.056, -.032], [.056, .028], [.059, .032], [.056, .036], [.056, .058], [.052, .065], [.048, .062]]
  p.add(lathe(prof, 20), paint, D.hazard, { rect: [0, .85, 1, .9] })
  p.add(cyl(.0566, .0566, .058, 20, true), paint, D.hazard, { p: [0, -.002, 0], rect: SUB.drumSide })
  surfaceDisc(p, paint, D.hazard, .049, .062, SUB.drumLid, 20)
  p.add(cyl(.009, .009, .006, 10), paint, D.hazard, { p: [.025, .066, .01], rect: SUB.drumLid })
  p.add(cyl(.006, .006, .005, 8), paint, D.hazard, { p: [-.027, .066, -.012], rect: SUB.drumLid })
}

function candygenius(p: Parts) {
  const wafer = surface('paper', 0, .8)
  const faces: Rect[] = [SUB.waferSide, SUB.waferSide, SUB.waferTop, SUB.waferTop, SUB.waferSide, SUB.waferSide]
  p.add(box(.14, .05, .09, faces), wafer, D.wafer, { p: [0, .0, 0] })
  p.add(box(.14, .05, .09, faces), wafer, D.wafer, { p: [.02, .052, .01], r: [0, .25, 0] })
  for (let i = 0; i < 3; i++) p.add(lumpyWelded(sphere(.006, 6, 4), .001, 400, i), wafer, D.wafer, { p: [-.05 + i * .04, -.021, .062], rect: SUB.waferSide })
}

function candymint(p: Parts) {
  const mint = surface('paper', 0, .35)
  p.add(torus(.052, .021, 22, 9), mint, D.mint, { p: [0, .0, 0], r: [HP, 0, 0], s: [1, 1, .9] })
  p.add(torus(.045, .018, 20, 8), mint, D.mint, { p: [.06, .016, .03], r: [HP - .5, .3, 0], s: [1, 1, .9] })
}

function manmade(p: Parts) {
  const candy = surface('paper', 0, .5)
  const g = new THREE.BoxGeometry(.13, .06, .09, 2, 1, 2)
  lumpyWelded(g, .004, 40, 2)
  p.add(g, candy, D.manmade, { rect: SUB.flesh })
  const wrap = new THREE.BoxGeometry(.08, .066, .096, 2, 1, 2)
  lumpyWelded(wrap, .002, 50, 6)
  p.add(wrap, candy, D.manmade, { p: [.03, 0, 0], rect: SUB.wrapper })
  // 扭结端
  p.add(new THREE.ConeGeometry(.028, .05, 8), candy, D.manmade, { p: [.095, 0, 0], r: [0, 0, HP], rect: SUB.wrapper })
  p.add(lumpyWelded(new THREE.ConeGeometry(.035, .02, 8, 1, true), .003, 200, 3), candy, D.manmade, { p: [.125, 0, 0], r: [0, 0, -HP], rect: SUB.wrapper })
}

function citywater(p: Parts) {
  const glass = glassMat('paper', .3), label = surface('paper', 0, .5), cap = surface('paper', .8, .35)
  const bottle = [[0, -.12], [.055, -.12], [.06, -.112], [.06, .05], [.055, .075], [.034, .1], [.028, .12], [.03, .124], [.028, .128]]
  p.add(lathe(bottle, 18), glass, D.water, { rect: SUB.glass })
  p.add(lathe([[0, -.114], [.054, -.114], [.056, -.108], [.056, .03], [0, .03]], 16), label, D.water, { rect: SUB.water })
  p.add(cyl(.0615, .0615, .08, 20, true), label, D.water, { p: [0, -.035, 0], rect: SUB.label })
  p.add(cyl(.031, .031, .022, 16), cap, D.water, { p: [0, .136, 0], rect: SUB.cap })
}

const BUILDERS: Record<RefinedItemType, (p: Parts) => void> = {
  carkey, gas, wrench, fuse, stapler, keycard, nails, timber, housekey, presses, eaglecoin, sedative, uvlamp, headlamp, nightvision, silverware,
  gloves, suit, cavingsuit, rope, divemask, chalkstub, stonekazoo, wheatgrain, xenonmarble, driedfruit,
  thingmeat, ratmeat, dryshrimp, friedshrimp, tomatosoup, gardensalad, garlicbread, pasta, meatstew, pizza, lasagna, tomsspecial, grilledsteak, jambread,
  megfolder, oddbook, pamphlet, endnote, welcomenote, notebook, parcel, candysilver, candybullet, candygun, candystanley, candywaste, candygenius, candymint, manmade, citywater,
}

/** 实例独立几何与材质；文件纹理经 levelTexture 缓存共享。 */
export function buildRefinedItemMesh(type: RefinedItemType): THREE.Group {
  const p = new Parts(REFINED_ITEM_ATLAS[type])
  BUILDERS[type](p)
  return p.finish(type)
}
