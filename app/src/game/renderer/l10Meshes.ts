// Level 10 v64 建筑与植被模型：谷仓 / 马厩 / 小棚 / 外屋 / 树篱节点 / 等高树 / 圆草捆。
//
// 约定：模型原点位于结构占地中心、地面高度 0；门朝局部 +Z，按 s.data.deg 绕 Y 旋转
// （0=+y 世界方向，90=+x，180=-y，270=-x）。旋转 90°/270° 时局部宽深与世界 w/h 互换。
// 碰撞：渲染器按「每个可见网格的世界包围盒」登记碰撞，因此墙体全部拆成独立的轴对齐盒子
// （门洞两侧、窗洞上下各一块），门洞、窗洞自然可通行/可透视；屋面、山墙、装饰条等
// 高处或细小构件标记 noCollision。合批由区块静态合批统一完成，不增加 draw call。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Structure } from '../core/types'
import { configureSurfaceTexture, getMaterialMode, levelTexture, litMaterial, mulberry, noiseTexture } from './shared'
import { withL10Wind } from './l10Wind'
import { buildOutdoorTree } from './outdoorTrees'

type Mat = THREE.MeshLambertMaterial | THREE.MeshStandardMaterial
const cache = new Map<string, Mat>()

const tex = (name: string, a: string, b: string, color = false) => {
  const t = levelTexture(name, () => noiseTexture(a, b))
  configureSurfaceTexture(t, color ? THREE.SRGBColorSpace : THREE.NoColorSpace)
  return t
}
const wettable = <T extends THREE.Material>(m: T, rough: number, env: number) => {
  m.userData.l10Wettable = 1; m.userData.l10BaseRoughness = rough; m.userData.l10BaseEnv = env; return m
}
function mat(key: string, make: () => Mat): Mat {
  key = getMaterialMode() + ':' + key
  let m = cache.get(key)
  if (!m) { m = make(); cache.set(key, m) }
  return m
}
const woodNormal = () => tex('l10_wood_normal.jpg', '#8080ff', '#7f7fff')
const woodRough = () => tex('l10_wood_rough.jpg', '#eeeeee', '#cccccc')

const M = {
  barnSiding: () => mat('siding', () => wettable(litMaterial({
    color: '#ffffff', map: tex('l10_siding_diff.jpg', '#8e3a2c', '#a24a38', true), normalMap: woodNormal(),
    normalScale: new THREE.Vector2(.7, .7), roughnessMap: woodRough(), roughness: .88, envBase: .05,
  }), .88, .05)),
  greyPlank: () => mat('greyplank', () => wettable(litMaterial({
    color: '#c9b89a', map: tex('l10_wall.jpg', '#8a8478', '#a39b8c', true), normalMap: woodNormal(),
    normalScale: new THREE.Vector2(.75, .75), roughnessMap: woodRough(), roughness: .92, envBase: .04,
  }), .92, .04)),
  wood: () => mat('wood', () => wettable(litMaterial({
    color: '#a8916f', map: tex('l10_wood_diff.jpg', '#806545', '#b09166', true), normalMap: woodNormal(),
    normalScale: new THREE.Vector2(.6, .6), roughnessMap: woodRough(), roughness: .9, envBase: .045,
  }), .9, .045)),
  trim: () => mat('trim', () => wettable(litMaterial({
    color: '#e6dfcf', map: tex('l10_wood_diff.jpg', '#806545', '#b09166', true), normalMap: woodNormal(),
    normalScale: new THREE.Vector2(.5, .5), roughness: .86, envBase: .05,
  }), .86, .05)),
  roof: () => mat('roof', () => {
    const n = levelTexture('l10_corrugated_normal.png', () => noiseTexture('#8080ff', '#7f7fff'))
    configureSurfaceTexture(n, THREE.NoColorSpace)
    return wettable(litMaterial({
      color: '#8d8579', map: tex('l10_roof.jpg', '#77716a', '#958e84', true), normalMap: n,
      normalScale: new THREE.Vector2(1.1, 1.1), roughness: .58, metalness: .42, envBase: .22, side: THREE.DoubleSide,
    }), .58, .22)
  }),
  concrete: () => mat('concrete', () => wettable(litMaterial({
    color: '#a39d90', map: tex('l10_roof.jpg', '#77716a', '#958e84', true), roughness: .95, envBase: .03,
  }), .95, .03)),
  dark: () => mat('dark', () => litMaterial({ color: '#17140f', roughness: 1, envBase: 0 })),
  metal: () => mat('metal', () => wettable(litMaterial({
    color: '#6e6a62', map: tex('l10_metal_diff.jpg', '#555550', '#8f897a', true), roughness: .6, metalness: .5, envBase: .2,
  }), .6, .2)),
  hay: () => mat('hay', () => wettable(litMaterial({
    color: '#fff1c8', map: tex('l10_hay_diff.jpg', '#9b762c', '#d8b95f', true),
    normalMap: tex('l10_hay_normal.jpg', '#8080ff', '#7f7fff'), normalScale: new THREE.Vector2(.9, .9),
    roughnessMap: tex('l10_hay_rough.jpg', '#f4f4f4', '#dddddd'), roughness: .97, envBase: .02,
  }), .97, .02)),
  bark: () => mat('bark', () => wettable(litMaterial({
    color: '#77654f', map: tex('l10_wood_diff.jpg', '#6c5136', '#947653', true), normalMap: woodNormal(),
    normalScale: new THREE.Vector2(.9, .9), roughness: .95, envBase: .02,
  }), .95, .02)),
  leafCore: () => mat('leafcore', () => withL10Wind(litMaterial({
    color: '#c4d6a4', emissive: '#1c2a14', map: tex('l10_hedge_diff.jpg', '#2f4a26', '#4c6b37', true),
    normalMap: tex('l10_hedge_normal.jpg', '#8080ff', '#7f7fff'), normalScale: new THREE.Vector2(.9, .9),
    roughness: .9, envBase: .05,
  }), { amp: .05, mode: 'leaf' })),
  leafCard: () => mat('leafcard', () => {
    const map = levelTexture('l10_leafcard.png', () => noiseTexture('#3c5a2c', '#5b7a3f'))
    map.colorSpace = THREE.SRGBColorSpace
    map.generateMipmaps = true
    map.minFilter = THREE.LinearMipmapLinearFilter
    return withL10Wind(litMaterial({
      color: '#ffffff', map, alphaTest: .42, side: THREE.DoubleSide,
      emissive: '#5a6e44', emissiveMap: map, emissiveIntensity: .55, roughness: .85, envBase: .05,
    }), { amp: .07, mode: 'leaf' })
  }),
}

// ---------------------------------------------------------------- 几何工具
/** 盒子 UV 按各面世界尺寸平铺（scale = 每米重复次数）；rot=true 时纹理旋转 90°（水平木板）。 */
function uvBox(g: THREE.BufferGeometry, w: number, h: number, d: number, scale: number, rot = false) {
  const uv = g.attributes.uv as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i))
    const [a, b] = ny > .5 ? [w, d] : nx > .5 ? [d, h] : [w, h]
    let u = uv.getX(i) * a * scale, v = uv.getY(i) * b * scale
    if (rot) [u, v] = [v, u]
    uv.setXY(i, u, v)
  }
  return g
}
interface Ctx { g: THREE.Group }
function boxMesh(c: Ctx, m: Mat, w: number, h: number, d: number, x: number, y: number, z: number,
  opts: { uv?: number; rot?: boolean; noCol?: boolean; ry?: number; rx?: number; rz?: number } = {}) {
  const geo = uvBox(new THREE.BoxGeometry(w, h, d), w, h, d, opts.uv ?? .5, opts.rot)
  const mesh = new THREE.Mesh(geo, m)
  mesh.position.set(x, y, z)
  if (opts.ry) mesh.rotation.y = opts.ry
  if (opts.rx) mesh.rotation.x = opts.rx
  if (opts.rz) mesh.rotation.z = opts.rz
  if (opts.noCol) mesh.userData.noCollision = 1
  c.g.add(mesh)
  return mesh
}
/** 沿 X 的墙（法线 ±Z）：在 [x0,x1] 上挖出若干洞口 {a,b,y0,y1}，其余拆成实心盒。 */
function wallX(c: Ctx, m: Mat, x0: number, x1: number, z: number, t: number, h: number,
  holes: { a: number; b: number; y0: number; y1: number }[], uv = .5, rot = false) {
  const hs = [...holes].sort((p, q) => p.a - q.a)
  let cur = x0
  for (const o of hs) {
    if (o.a > cur) boxMesh(c, m, o.a - cur, h, t, (cur + o.a) / 2, h / 2, z, { uv, rot })
    if (o.y0 > .01) boxMesh(c, m, o.b - o.a, o.y0, t, (o.a + o.b) / 2, o.y0 / 2, z, { uv, rot })
    if (o.y1 < h - .01) boxMesh(c, m, o.b - o.a, h - o.y1, t, (o.a + o.b) / 2, (o.y1 + h) / 2, z, { uv, rot, noCol: o.y1 > 2.05 })
    cur = o.b
  }
  if (x1 > cur) boxMesh(c, m, x1 - cur, h, t, (cur + x1) / 2, h / 2, z, { uv, rot })
}
/** 沿 Z 的墙（法线 ±X）。 */
function wallZ(c: Ctx, m: Mat, z0: number, z1: number, x: number, t: number, h: number,
  holes: { a: number; b: number; y0: number; y1: number }[], uv = .5, rot = false) {
  const hs = [...holes].sort((p, q) => p.a - q.a)
  let cur = z0
  for (const o of hs) {
    if (o.a > cur) boxMesh(c, m, t, h, o.a - cur, x, h / 2, (cur + o.a) / 2, { uv, rot })
    if (o.y0 > .01) boxMesh(c, m, t, o.y0, o.b - o.a, x, o.y0 / 2, (o.a + o.b) / 2, { uv, rot })
    if (o.y1 < h - .01) boxMesh(c, m, t, h - o.y1, o.b - o.a, x, (o.y1 + h) / 2, (o.a + o.b) / 2, { uv, rot, noCol: o.y1 > 2.05 })
    cur = o.b
  }
  if (z1 > cur) boxMesh(c, m, t, h, z1 - cur, x, h / 2, (cur + z1) / 2, { uv, rot })
}
/** 山墙：给定截面多边形（x,y），在平面 z 上挤出厚度 t。UV 用世界尺寸。 */
function gable(c: Ctx, m: Mat, pts: [number, number][], z: number, t: number, uv = .5, alongX = true) {
  const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)))
  const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false })
  geo.translate(0, 0, -t / 2)
  const uvA = geo.attributes.uv as THREE.BufferAttribute, pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, pos.getX(i) * uv, pos.getY(i) * uv)
  const mesh = new THREE.Mesh(geo, m)
  if (alongX) mesh.position.z = z
  else { mesh.rotation.y = Math.PI / 2; mesh.position.x = z }
  mesh.userData.noCollision = 1
  c.g.add(mesh)
  return mesh
}
/** 屋面板：从 (a0,y0) 到 (a1,y1) 的一段斜面，沿 ridge 轴长度 L；axis='z' 表示屋脊沿 Z。 */
function roofPanel(c: Ctx, m: Mat, a0: number, y0: number, a1: number, y1: number, L: number, axis: 'x' | 'z', t = .07) {
  const span = Math.hypot(a1 - a0, y1 - y0)
  const geo = new THREE.BoxGeometry(span, t, L)
  const uv = geo.attributes.uv as THREE.BufferAttribute, nor = geo.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) {
    // 波纹沿屋脊方向排布（每 0.8m 一张 8 波的贴图 → 约 10cm 一道波），顺坡方向 2m 一循环
    if (Math.abs(nor.getY(i)) > .5) uv.setXY(i, uv.getY(i) * L / .8, uv.getX(i) * span / 2)
    else uv.setXY(i, uv.getX(i) * .1, uv.getY(i) * .1)
  }
  const mesh = new THREE.Mesh(geo, m)
  const ang = Math.atan2(y1 - y0, a1 - a0)
  if (axis === 'z') { mesh.position.set((a0 + a1) / 2, (y0 + y1) / 2, 0); mesh.rotation.z = ang }
  else { mesh.rotation.order = 'YZX'; mesh.rotation.y = -Math.PI / 2; mesh.position.set(0, (y0 + y1) / 2, (a0 + a1) / 2); mesh.rotation.z = ang }
  mesh.userData.noCollision = 1
  c.g.add(mesh)
  return mesh
}

// ---------------------------------------------------------------- 谷仓
function barn(c: Ctx, W: number, D: number, r: () => number) {
  const t = .18, eave = 3.7, knee = 5.45, ridge = 6.7, kneeX = W / 2 - 1.85
  const sid = M.barnSiding(), trim = M.trim(), wood = M.wood()
  const doorW = 4.2, doorH = 3.3
  // 混凝土勒脚：一圈 0.35m（门洞处断开）
  const plinth = .35
  boxMesh(c, M.concrete(), W + .1, plinth, .3, 0, plinth / 2 - .05, -D / 2, { uv: .4 })
  boxMesh(c, M.concrete(), .3, plinth, D + .1, -W / 2, plinth / 2 - .05, 0, { uv: .4 })
  boxMesh(c, M.concrete(), .3, plinth, D + .1, W / 2, plinth / 2 - .05, 0, { uv: .4 })
  for (const s of [-1, 1]) boxMesh(c, M.concrete(), (W - doorW) / 2, plinth, .3, s * (W + doorW) / 4, plinth / 2 - .05, D / 2, { uv: .4 })
  // 前墙：大门 + 草料阁门（上部山墙内）
  wallX(c, sid, -W / 2, W / 2, D / 2 - t / 2, t, eave, [{ a: -doorW / 2, b: doorW / 2, y0: 0, y1: doorH }], .45)
  // 后墙：一扇小门
  wallX(c, sid, -W / 2, W / 2, -D / 2 + t / 2, t, eave, [{ a: 2.2, b: 3.2, y0: 0, y1: 2.15 }], .45)
  // 侧墙：各 3 个小窗
  const win = (n: number) => Array.from({ length: n }, (_, i) => { const zc = -D / 2 + D * (i + .5) / n; return { a: zc - .42, b: zc + .42, y0: 1.75, y1: 2.55 } })
  wallZ(c, sid, -D / 2 + t, D / 2 - t, -W / 2 + t / 2, t, eave, win(3), .45)
  wallZ(c, sid, -D / 2 + t, D / 2 - t, W / 2 - t / 2, t, eave, win(3), .45)
  // 山墙（复折式截面）
  const prof: [number, number][] = [[-W / 2, eave], [-kneeX, knee], [0, ridge], [kneeX, knee], [W / 2, eave]]
  gable(c, sid, prof, D / 2 - t / 2, t, .45)
  gable(c, sid, prof, -D / 2 + t / 2, t, .45)
  // 草料阁门洞（暗）+ 白色门框 + 吊草横梁与滑轮
  boxMesh(c, M.dark(), 1.9, 1.6, .02, 0, eave + .95, D / 2 + .005, { noCol: true })
  for (const [w, h, x, y] of [[2.15, .14, 0, eave + 1.82], [2.15, .14, 0, eave + .1], [.14, 1.85, -1.02, eave + .95], [.14, 1.85, 1.02, eave + .95]] as const)
    boxMesh(c, trim, w, h, .06, x, y, D / 2 + .04, { noCol: true })
  boxMesh(c, wood, .18, .2, 1.5, 0, ridge - .45, D / 2 + .6, { noCol: true })
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .07, 12).rotateZ(Math.PI / 2), M.metal())
  pulley.position.set(0, ridge - .7, D / 2 + 1.2); pulley.userData.noCollision = 1; c.g.add(pulley)
  // 推拉大门：两扇都推到两侧，挂在门顶导轨上；白色 Z/X 斜撑
  boxMesh(c, M.metal(), W - .6, .1, .08, 0, doorH + .22, D / 2 + .16, { noCol: true })
  for (const s of [-1, 1]) {
    const lx = s * (doorW / 2 + doorW / 4 - .05)
    const leaf = new THREE.Group(); leaf.position.set(lx, 0, D / 2 + .13); c.g.add(leaf)
    const lc: Ctx = { g: leaf }
    boxMesh(lc, sid, doorW / 2, doorH, .07, 0, doorH / 2, 0, { uv: .45 })
    for (const [w, h, x, y] of [[doorW / 2, .16, 0, .1], [doorW / 2, .16, 0, doorH - .1], [.16, doorH, -doorW / 4 + .08, doorH / 2], [.16, doorH, doorW / 4 - .08, doorH / 2], [doorW / 2, .16, 0, doorH / 2]] as const)
      boxMesh(lc, trim, w, h, .05, x, y, .05, { noCol: true })
    for (const sgn of [-1, 1]) {
      const len = Math.hypot(doorW / 2 - .3, doorH / 2 - .2)
      boxMesh(lc, trim, .14, len, .04, 0, doorH * (sgn > 0 ? .75 : .25), .06, { noCol: true, rz: Math.atan2(doorW / 2 - .3, doorH / 2 - .2) })
      boxMesh(lc, trim, .14, len, .04, 0, doorH * (sgn > 0 ? .75 : .25), .06, { noCol: true, rz: -Math.atan2(doorW / 2 - .3, doorH / 2 - .2) })
    }
  }
  // 门框/墙角白色压条
  for (const s of [-1, 1]) {
    boxMesh(c, trim, .16, doorH + .1, .06, s * (doorW / 2 + .08), (doorH + .1) / 2, D / 2 + .04, { noCol: true })
    boxMesh(c, trim, .16, eave, .2, s * (W / 2 + .02), eave / 2, D / 2 + .02, { noCol: true })
    boxMesh(c, trim, .16, eave, .2, s * (W / 2 + .02), eave / 2, -D / 2 - .02, { noCol: true })
  }
  boxMesh(c, trim, doorW + .32, .16, .06, 0, doorH + .08, D / 2 + .04, { noCol: true })
  // 侧窗：白框 + 积灰玻璃（暗）
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
    const zc = -D / 2 + D * (i + .5) / 3, x = sx * (W / 2 + .01)
    boxMesh(c, M.dark(), .02, .8, .84, x - sx * .08, 2.15, zc, { noCol: true })
    boxMesh(c, trim, .06, .1, 1.0, x, 2.6, zc, { noCol: true }); boxMesh(c, trim, .06, .1, 1.0, x, 1.7, zc, { noCol: true })
    boxMesh(c, trim, .06, .9, .1, x, 2.15, zc - .47, { noCol: true }); boxMesh(c, trim, .06, .9, .1, x, 2.15, zc + .47, { noCol: true })
    boxMesh(c, trim, .05, .8, .05, x, 2.15, zc, { noCol: true }); boxMesh(c, trim, .05, .05, .84, x, 2.15, zc, { noCol: true })
  }
  // 复折式屋面（屋脊沿 Z，挑檐 0.35m）
  const L = D + .7
  roofPanel(c, M.roof(), -W / 2 - .45, eave - .25, -kneeX, knee, L, 'z')
  roofPanel(c, M.roof(), -kneeX - .05, knee - .02, .05, ridge + .02, L, 'z')
  roofPanel(c, M.roof(), W / 2 + .45, eave - .25, kneeX, knee, L, 'z')
  roofPanel(c, M.roof(), kneeX + .05, knee - .02, -.05, ridge + .02, L, 'z')
  boxMesh(c, M.metal(), .3, .12, L, 0, ridge + .06, 0, { noCol: true })
  // 室内：立柱、系梁、半层草料阁（后半）、梯子、木料垛、钉子桶
  for (const x of [-3.1, 3.1]) for (const z of [-1.2, -D / 2 + .5]) boxMesh(c, wood, .22, eave, .22, x, eave / 2, z, { uv: .6 })
  for (const z of [-D / 2 + .5, -1.2, 1.8]) boxMesh(c, wood, W - .3, .22, .2, 0, eave - .12, z, { noCol: true, uv: .6 })
  boxMesh(c, wood, W - .4, .12, D / 2 - .9, 0, 2.95, -D / 4 - .55, { uv: .7, rot: true })
  for (let i = 0; i < 9; i++) boxMesh(c, M.hay(), .9 + r() * .5, .45, .6 + r() * .3, -W / 2 + 1.2 + i * 1.15, 3.24, -D / 2 + 1.1 + r() * 1.6, { noCol: true, ry: (r() - .5) * .4, uv: 1.2 })
  // 梯子
  for (const s of [-1, 1]) boxMesh(c, wood, .07, 3.2, .07, 1.6 + s * .22, 1.55, -1.05, { noCol: true, rx: -.18 })
  for (let i = 0; i < 9; i++) boxMesh(c, wood, .44, .05, .05, 1.6, .35 + i * .33, -1.05 - i * .055, { noCol: true })
  // 木料垛（实心，可当矮台）与钉子桶
  for (let k = 0; k < 6; k++) boxMesh(c, wood, 2.6, .12, .22, -W / 2 + 1.9, .07 + Math.floor(k / 3) * .13, D / 2 - 2.2 + (k % 3) * .25, { uv: .7, rot: true })
  for (let k = 0; k < 4; k++) boxMesh(c, wood, 2.3, .1, .2, W / 2 - 1.8, .06 + Math.floor(k / 2) * .11, D / 2 - 3.4 + (k % 2) * .24, { uv: .7, rot: true, ry: .06 })
  const keg = new THREE.Mesh(new THREE.CylinderGeometry(.24, .27, .6, 12), wood); keg.position.set(W / 2 - 1.2, .3, D / 2 - 1.6); c.g.add(keg)
  // 地面零散干草
  for (let i = 0; i < 14; i++) boxMesh(c, M.hay(), .3 + r() * .7, .03, .3 + r() * .6, (r() - .5) * (W - 2), .015, (r() - .5) * (D - 2), { noCol: true, ry: r() * 3, uv: 1.5 })
}

// ---------------------------------------------------------------- 马厩
function stable(c: Ctx, W: number, D: number, r: () => number) {
  const t = .15, eave = 2.7, ridge = eave + D * .3, sid = M.greyPlank(), wood = M.wood(), trim = M.trim()
  const bays = Math.max(3, Math.round(W / 3.2)), bw = W / bays
  const doorW = 1.25, doorH = 2.15
  boxMesh(c, M.concrete(), W + .1, .25, D + .1, 0, -.08, 0, { uv: .4, noCol: true })
  const holes = Array.from({ length: bays }, (_, i) => { const xc = -W / 2 + bw * (i + .5); return { a: xc - doorW / 2, b: xc + doorW / 2, y0: 0, y1: doorH } })
  wallX(c, sid, -W / 2, W / 2, D / 2 - t / 2, t, eave, holes, .5)
  wallX(c, sid, -W / 2, W / 2, -D / 2 + t / 2, t, eave, Array.from({ length: bays }, (_, i) => { const xc = -W / 2 + bw * (i + .5); return { a: xc - .35, b: xc + .35, y0: 1.7, y1: 2.15 } }), .5)
  wallZ(c, sid, -D / 2 + t, D / 2 - t, -W / 2 + t / 2, t, eave, [], .5)
  wallZ(c, sid, -D / 2 + t, D / 2 - t, W / 2 - t / 2, t, eave, [], .5)
  gable(c, sid, [[-D / 2, eave], [0, ridge], [D / 2, eave]], -W / 2 + t / 2, t, .5, false)
  gable(c, sid, [[-D / 2, eave], [0, ridge], [D / 2, eave]], W / 2 - t / 2, t, .5, false)
  // 双坡屋面（屋脊沿 X），前檐加长成雨棚，立柱支撑
  const L = W + .6
  roofPanel(c, M.roof(), D / 2 + 1.35, eave - .55, 0, ridge + .03, L, 'x')
  roofPanel(c, M.roof(), -D / 2 - .4, eave - .12, 0, ridge + .03, L, 'x')
  for (let i = 0; i <= bays; i++) boxMesh(c, wood, .16, eave - .45, .16, -W / 2 + bw * i, (eave - .45) / 2, D / 2 + 1.15, { uv: .6 })
  boxMesh(c, wood, W, .16, .16, 0, eave - .5, D / 2 + 1.15, { noCol: true })
  // 荷兰门：每格下半扇关闭（可跨越的矮门），两格全开供进入
  const openBays = new Set([Math.floor(bays / 2), (Math.floor(r() * bays) + 1) % bays])
  for (let i = 0; i < bays; i++) {
    const xc = -W / 2 + bw * (i + .5)
    boxMesh(c, trim, doorW + .2, .12, .06, xc, doorH + .06, D / 2 + .03, { noCol: true })
    if (openBays.has(i)) {
      boxMesh(c, sid, .06, 1.1, doorW / 2 + .1, xc + doorW / 2 + .06, .6, D / 2 + doorW / 4 + .1, { noCol: true })
      boxMesh(c, sid, .06, .95, doorW / 2 + .1, xc + doorW / 2 + .06, 1.65, D / 2 + doorW / 4 + .1, { noCol: true })
    } else {
      boxMesh(c, sid, doorW, 1.1, .07, xc, .58, D / 2 - .02, { uv: .5 })
      boxMesh(c, trim, doorW - .1, .08, .03, xc, 1.08, D / 2 + .03, { noCol: true })
      boxMesh(c, trim, .08, 1.3, .03, xc, .56, D / 2 + .03, { noCol: true, rz: .7 })
      // 上半扇向外开，贴在墙上
      boxMesh(c, sid, .06, .95, doorW, xc - doorW / 2 - .06, 1.65, D / 2 + doorW / 2, { noCol: true })
    }
  }
  // 室内：隔栏（从后墙伸出 3.4m）、草料架、水槽
  for (let i = 1; i < bays; i++) {
    const x = -W / 2 + bw * i
    boxMesh(c, wood, .08, 1.35, Math.min(3.4, D - 1.4), x, .68, -D / 2 + Math.min(3.4, D - 1.4) / 2 + t, { uv: .6 })
    boxMesh(c, wood, .12, 2.2, .12, x, 1.1, -D / 2 + Math.min(3.4, D - 1.4) + t, { uv: .6 })
  }
  for (let i = 0; i < bays; i++) {
    const xc = -W / 2 + bw * (i + .5)
    boxMesh(c, wood, bw * .55, .32, .4, xc, .55, -D / 2 + .38, { uv: .7 })
    for (let k = 0; k < 5; k++) boxMesh(c, wood, .03, .6, .03, xc - bw * .2 + k * bw * .1, 1.75, -D / 2 + .3, { noCol: true, rx: .35 })
    if (r() < .6) boxMesh(c, M.hay(), bw * .6, .05, 1.2, xc, .03, -D / 2 + 1.4, { noCol: true, ry: r() - .5, uv: 1.4 })
  }
  for (const z of [-D / 4, D / 4]) boxMesh(c, wood, W - .3, .16, .16, 0, eave - .1, z, { noCol: true })
}

// ---------------------------------------------------------------- 小棚
function shed(c: Ctx, W: number, D: number, r: () => number) {
  const t = .12, eave = 2.4, ridge = eave + D * .28, sid = M.greyPlank(), wood = M.wood(), trim = M.trim()
  boxMesh(c, M.concrete(), W + .1, .2, D + .1, 0, -.06, 0, { uv: .4, noCol: true })
  const dx = -W / 2 + 1.3
  wallX(c, sid, -W / 2, W / 2, D / 2 - t / 2, t, eave, [{ a: dx - .5, b: dx + .5, y0: 0, y1: 2.05 }, { a: W / 2 - 2.0, b: W / 2 - 1.0, y0: 1.15, y1: 1.85 }], .6, true)
  wallX(c, sid, -W / 2, W / 2, -D / 2 + t / 2, t, eave, [], .6, true)
  wallZ(c, sid, -D / 2 + t, D / 2 - t, -W / 2 + t / 2, t, eave, [{ a: -.5, b: .5, y0: 1.2, y1: 1.85 }], .6, true)
  wallZ(c, sid, -D / 2 + t, D / 2 - t, W / 2 - t / 2, t, eave, [], .6, true)
  gable(c, sid, [[-D / 2, eave], [0, ridge], [D / 2, eave]], -W / 2 + t / 2, t, .6, false)
  gable(c, sid, [[-D / 2, eave], [0, ridge], [D / 2, eave]], W / 2 - t / 2, t, .6, false)
  const L = W + .5
  roofPanel(c, M.roof(), D / 2 + .35, eave - .1, 0, ridge + .03, L, 'x')
  roofPanel(c, M.roof(), -D / 2 - .35, eave - .1, 0, ridge + .03, L, 'x')
  // 门：半开的木板门 + 门框
  const door = new THREE.Group(); door.position.set(dx - .5, 0, D / 2); door.rotation.y = -1.05; c.g.add(door)
  boxMesh({ g: door }, sid, 1, 2.0, .06, .5, 1.0, .03, { uv: .6, rot: true })
  boxMesh({ g: door }, trim, .9, .1, .03, .5, 1.75, .07, { noCol: true }); boxMesh({ g: door }, trim, .9, .1, .03, .5, .3, .07, { noCol: true })
  boxMesh({ g: door }, trim, .1, 1.5, .03, .5, 1.02, .07, { noCol: true, rz: .55 })
  for (const s of [-1, 1]) boxMesh(c, trim, .1, 2.1, .05, dx + s * .55, 1.05, D / 2 + .03, { noCol: true })
  boxMesh(c, trim, 1.2, .1, .05, dx, 2.1, D / 2 + .03, { noCol: true })
  // 碎玻璃窗
  boxMesh(c, M.dark(), .95, .65, .02, W / 2 - 1.5, 1.5, D / 2 - .06, { noCol: true })
  boxMesh(c, M.dark(), .02, .6, .95, -W / 2 + .06, 1.52, 0, { noCol: true })
  // 室内：工作台、靠墙的木板、钉子盒、搁板
  boxMesh(c, wood, 2.2, .08, .7, W / 2 - 1.4, .9, -D / 2 + .55, { uv: .8 })
  for (const x of [W / 2 - 2.4, W / 2 - .4]) for (const z of [-D / 2 + .3, -D / 2 + .8]) boxMesh(c, wood, .07, .86, .07, x, .43, z, { noCol: true })
  boxMesh(c, wood, 2.0, .05, .32, -W / 2 + 1.3, 1.6, -D / 2 + .3, { noCol: true })
  for (let k = 0; k < 5; k++) boxMesh(c, wood, .22, 2.1 + r() * .3, .04, -W / 2 + .5 + k * .26, 1.08, -D / 2 + .32 + r() * .1, { noCol: true, rx: -.18, uv: .8, rot: true })
  boxMesh(c, M.metal(), .3, .16, .2, W / 2 - 1.0, 1.02, -D / 2 + .5, { noCol: true })
}

// ---------------------------------------------------------------- 外屋（旱厕）
function outhouse(c: Ctx, W: number, D: number) {
  const t = .08, hf = 2.35, hb = 2.05, sid = M.greyPlank(), trim = M.trim()
  boxMesh(c, M.concrete(), W, .12, D, 0, -.02, 0, { noCol: true })
  wallX(c, sid, -W / 2, W / 2, -D / 2 + t / 2, t, hb, [], .7)
  wallZ(c, sid, -D / 2 + t, D / 2, -W / 2 + t / 2, t, hb, [], .7)
  wallZ(c, sid, -D / 2 + t, D / 2, W / 2 - t / 2, t, hb, [], .7)
  for (const x of [-W / 2 + t / 2, W / 2 - t / 2]) gable(c, sid, [[-D / 2, hb], [D / 2, hb], [D / 2, hf]], x, t, .7, false)
  for (const s of [-1, 1]) boxMesh(c, sid, (W - .8) / 2, hf, t, s * (W / 2 - (W - .8) / 4), hf / 2, D / 2 - t / 2, { uv: .7 })
  boxMesh(c, sid, .8, hf - 2.0, t, 0, (hf + 2.0) / 2, D / 2 - t / 2, { uv: .7, noCol: true })
  // 单坡屋面
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W + .3, .06, Math.hypot(D + .3, hf - hb)), M.roof())
  roof.position.set(0, (hf + hb) / 2 + .04, 0); roof.rotation.x = Math.atan2(hf - hb, D); roof.userData.noCollision = 1; c.g.add(roof)
  // 门半开，门上开月牙孔
  const door = new THREE.Group(); door.position.set(.4, 0, D / 2); door.rotation.y = .75; c.g.add(door)
  const leaf = boxMesh({ g: door }, sid, .8, 1.95, .05, -.4, .99, .03, { uv: .7 })
  leaf.userData.noCollision = 1
  const moon = new THREE.Shape(); moon.absarc(0, 0, .11, Math.PI * .3, Math.PI * 1.7, false); moon.absarc(.05, 0, .085, Math.PI * 1.62, Math.PI * .38, true)
  const mg = new THREE.Mesh(new THREE.ShapeGeometry(moon), M.dark()); mg.position.set(-.4, 1.62, .062); mg.userData.noCollision = 1; door.add(mg)
  boxMesh({ g: door }, trim, .7, .08, .02, -.4, .5, .07, { noCol: true })
  // 室内坐凳
  boxMesh(c, M.wood(), W - .2, .45, .5, 0, .23, -D / 2 + .32, { uv: .8 })
  const hole = new THREE.Mesh(new THREE.CircleGeometry(.13, 16), M.dark()); hole.rotation.x = -Math.PI / 2; hole.position.set(0, .456, -D / 2 + .32); hole.userData.noCollision = 1; c.g.add(hole)
}

// ---------------------------------------------------------------- 树篱节点（统一高度）
const HEDGE_H = 1.6
function hedgeNode(c: Ctx, s: Structure) {
  const r = mulberry((Number(s.data?.v ?? 0) * 7919 + Math.floor(s.x) * 31 + Math.floor(s.y) * 131) >>> 0)
  const core = new THREE.IcosahedronGeometry(.82, 1)
  const pos = core.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    // 世界相位扰动：相邻节点在共享边界处起伏一致；顶面压平（修剪过的整齐高度）
    const n = Math.sin((x + s.x) * 3.1 + (z + s.y) * 2.3) * .06 + Math.sin((x + s.x) * 1.3 - (z + s.y) * 4.1) * .05
    const yy = Math.min(y * .98, .62) // 平顶
    pos.setXYZ(i, x * (1.18 + n), yy + .8 + n * .5, z * (1.18 + n))
  }
  const uv = core.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) + s.x) * .9, (pos.getY(i) + pos.getZ(i) + s.y) * .9)
  core.computeVertexNormals()
  const coreMesh = new THREE.Mesh(core, M.leafCore())
  c.g.add(coreMesh)
  // 叶簇卡片：贴着外表面打散轮廓
  const cards: THREE.BufferGeometry[] = []
  for (let k = 0; k < 7; k++) {
    const a = r() * Math.PI * 2, el = -.15 + r() * .9
    const q = new THREE.PlaneGeometry(1.0 + r() * .3, .9 + r() * .3)
    q.rotateY(a + Math.PI / 2 + (r() - .5) * .8)
    q.rotateX((r() - .5) * .4)
    q.translate(Math.cos(a) * .82 * Math.cos(el), Math.min(HEDGE_H - .45, .8 + Math.sin(el) * .65), Math.sin(a) * .82 * Math.cos(el))
    cards.push(q)
  }
  const top = new THREE.PlaneGeometry(1.5, 1.5); top.rotateX(-Math.PI / 2 + (r() - .5) * .2); top.rotateY(r() * 3); top.translate(0, HEDGE_H - .2, 0)
  cards.push(top)
  const cm = new THREE.Mesh(mergeGeometries(cards)!, M.leafCard()); cards.forEach(g => g.dispose())
  cm.userData.noCollision = 1
  c.g.add(cm)
}

// ---------------------------------------------------------------- 等高树（维基：树木与灌木高度一致）
function tree(c: Ctx, s: Structure) { c.g.add(buildOutdoorTree(s, 10)) }

// ---------------------------------------------------------------- 圆草捆
function roundBale(c: Ctx, s: Structure) {
  const h = Math.max(.9, Number(s.data?.height ?? 1.25)), rad = h / 2, len = Math.min(s.w, s.h) * .95
  const body = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 20, 1, false), M.hay())
  const uv = body.geometry.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3.2, uv.getY(i) * 1.2)
  body.rotation.z = Math.PI / 2; body.position.y = rad - .04
  body.rotation.y = 0
  const g = new THREE.Group(); g.add(body)
  // 端面：螺旋纹（深浅同心环）
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(rad * (k / 4), rad * ((k + 1) / 4) - .01, 20), M.hay())
      ring.rotation.y = sx * Math.PI / 2; ring.position.set(sx * (len / 2 + .002 + k * .003), rad - .04, 0)
      ring.userData.noCollision = 1
      g.add(ring)
    }
  }
  g.rotation.y = Number(s.data?.deg ?? 0) * Math.PI / 180
  c.g.add(g)
}

/** L10 v64 专用结构；返回 null 时交回通用 buildStructure。 */
export function buildL10Structure(s: Structure, origin = { x: 0, y: 0 }): THREE.Group | null {
  // Decoration seeds and hedge UVs follow world coordinates across window rebases.
  s = { ...s, x: s.x + origin.x, y: s.y + origin.y }
  const g = new THREE.Group()
  const c: Ctx = { g }
  const deg = Number(s.data?.deg ?? 0)
  const W = deg % 180 ? s.h : s.w, D = deg % 180 ? s.w : s.h
  const r = mulberry((Math.floor(s.x * 7) * 73856093 ^ Math.floor(s.y * 7) * 19349663) >>> 0)
  switch (s.kind) {
    case 'barn': barn(c, W, D, r); break
    case 'l10stable': stable(c, W, D, r); break
    case 'l10shed': shed(c, W, D, r); break
    case 'l10outhouse': outhouse(c, W, D); break
    case 'hedgerow': if (!s.data?.node) return null; hedgeNode(c, s); return g
    case 'l10tree': tree(c, s); return g
    case 'l10haybale': if (!s.data?.round) return null; roundBale(c, s); return g
    default: return null
  }
  g.rotation.y = deg * Math.PI / 180
  const root = new THREE.Group()
  root.add(g)
  root.userData.l10Building = s.kind
  return root
}
