// 结构/出口低模（按 StructKind 建造，含可动盖板/门铰链 userData 约定）
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { doorNeedsRotate, tallCeilH, type GameMap } from '../mapgen'
import type { LevelDef, Structure } from '../types'
import { box, cyl, glow, col, mulberry, levelTexture, noiseTexture, makeCanvasCtx, toTex } from './shared'

// 墙纸贴图盒（柱厅立柱用：UV 按面宽/柱高放大，与墙面 1m 一循环的世界空间密度一致）
function wallpaperBox(w: number, h: number, d: number, def: LevelDef, x = 0, y = 0, z = 0): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const nor = geo.attributes.normal
  for (let i = 0; i < uv.count; i++) {
    const ny = Math.abs(nor.getY(i))
    if (ny > 0.5) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d) // 顶/底面
    else uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h) // 侧面：条纹保持竖直、密度与墙面一致
  }
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    color: def.id === 0 ? '#d8cbab' : '#e8e8e8', // L0 暖白叠乘黄墙纸；其余层级中性白（防灰墙贴图被叠暖）
    map: levelTexture(`l${def.id}_wall`, () => noiseTexture(def.palette.wall, def.palette.wallTop)),
  }))
  m.position.set(x, y, z)
  return m
}
import { graffitiTextures } from './textures'

// 贴图 Lambert 材质（v34：容器木纹/金属贴图）——磁盘贴图经 levelTexture 缓存，离线自动回退程序噪点；
// tint 近白叠乘保留贴图本色（looted 时传暗色达成变暗）
function texLambert(name: string, fbBase: string, fbAlt: string, tint: string | number = '#e8e2d2'): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: tint, map: levelTexture(name, () => noiseTexture(fbBase, fbAlt)) })
}

// 贴墙方向：返回随机一个相邻非地板方向（0北 1东 2南 3西），无墙返回 null
export function wallDir(s: Structure, m: GameMap): number | null {
  const opts: number[] = []
  const nb: [number, number, number][] = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]]
  for (const [dx, dy, d] of nb) {
    const nx = s.x + dx, ny = s.y + dy
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
    if (m.tiles[ny * m.w + nx] !== 1) opts.push(d)
  }
  return opts.length ? opts[Math.floor(Math.random() * opts.length)] : null
}

// ---------- v23 新结构公共构件 ----------

const NB4: readonly [number, number, number][] = [[0, -1, 0], [1, 0, 1], [0, 1, 2], [-1, 0, 3]]

// 结构中心瓦片的四邻方向筛选（floor=true 取地板侧，false 取墙/虚空侧）；0北 1东 2南 3西
function neighborDirs(s: Structure, m: GameMap, floor: boolean): number[] {
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  const out: number[] = []
  for (const [dx, dy, d] of NB4) {
    const nx = tx + dx, ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) { if (!floor) out.push(d); continue }
    if ((m.tiles[ny * m.w + nx] === 1) === floor) out.push(d)
  }
  return out
}

// 建筑所在方向：四邻 3 格宽条带里墙瓦片最多的方向。店招落在街面、正下方恰好是门洞时，
// 单格取样会判成「四周都是地板」，取条带众数才能稳定朝向建筑立面。
function buildingDir(s: Structure, m: GameMap): number {
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  let bestD = 0, bestN = -1
  for (const [dx, dy, d] of NB4) {
    let n = 0
    for (let step = 1; step <= 2; step++)
      for (let t = -1; t <= 1; t++) {
        const nx = tx + dx * step + (dy ? t : 0), ny = ty + dy * step + (dx ? t : 0)
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
        if (m.tiles[ny * m.w + nx] !== 1) n++
      }
    if (n > bestN) { bestN = n; bestD = d }
  }
  return bestD
}

// 贴面摆放：把子件推到瓦片某一侧（0北 1东 2南 3西）。
// outward=false 贴在瓦片内缘、正面朝瓦片中心（贴墙装饰）；true 贴在瓦片外缘、正面朝外
// （结构本身落在墙瓦片上时用，例如沿街立面的黑窗）。
function faceMount(o: THREE.Object3D, d: number, off: number, y: number, lat = 0, outward = false) {
  const e = outward ? 0.5 + off : 0.5 - off
  const turn = outward ? Math.PI : 0
  if (d === 0) { o.position.set(lat, y, -e); o.rotation.y = turn }
  else if (d === 2) { o.position.set(lat, y, e); o.rotation.y = Math.PI + turn }
  else if (d === 3) { o.position.set(-e, y, lat); o.rotation.y = Math.PI / 2 + turn }
  else { o.position.set(e, y, lat); o.rotation.y = -Math.PI / 2 + turn }
}

// 让家具正面（局部 +Z）背对最近的墙
// 实心面即墙（tile!==1：砌墙或虚空——虚空在渲染层同样立起墙盒，装饰贴上不算浮空）
function wallDirs(s: Structure, m: GameMap): number[] {
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  const out: number[] = []
  for (const [dx, dy, d] of NB4) {
    const nx = tx + dx, ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
    if (m.tiles[ny * m.w + nx] !== 1) out.push(d)
  }
  return out
}

function faceOutward(o: THREE.Object3D, s: Structure, m: GameMap) {
  const wd = wallDirs(s, m)
  if (!wd.length) return
  const f = (wd[0] + 2) % 4
  o.rotation.y = f === 0 ? Math.PI : f === 1 ? Math.PI / 2 : f === 2 ? 0 : -Math.PI / 2
}

// 强制贴墙（墙面装饰）：朝向并贴上最近的实心瓦片（砌墙或虚空皆可——渲染层虚空同样立墙盒）。
// 四邻优先；四邻全空则沿四方向各搜至 3 格取最近墙面，把装饰整体平移过去——彻底消除「浮空」。
// （取代旧 faceOutward+hugWall 组合：旧实现只认砌墙 tile===2，虚空旁装饰停留在瓦片中心悬浮）
function mountOnWall(o: THREE.Object3D, parent: THREE.Object3D, s: Structure, m: GameMap, dist = 0.42) {
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  let dir = -1, r = 1
  for (const [dx, dy, d] of NB4) {
    const nx = tx + dx, ny = ty + dy
    if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue
    if (m.tiles[ny * m.w + nx] !== 1) { dir = d; break }
  }
  if (dir < 0) {
    let best = Infinity
    for (const [dx, dy, d] of NB4) {
      for (let rr = 2; rr <= 3; rr++) {
        const nx = tx + dx * rr, ny = ty + dy * rr
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) break
        if (m.tiles[ny * m.w + nx] !== 1) {
          if (rr < best) { best = rr; dir = d; r = rr }
          break
        }
      }
    }
  }
  if (dir < 0) return
  const f = (dir + 2) % 4
  parent.rotation.y = f === 0 ? Math.PI : f === 1 ? Math.PI / 2 : f === 2 ? 0 : -Math.PI / 2
  const [wx, wz] = dir === 0 ? [0, -1] : dir === 1 ? [1, 0] : dir === 2 ? [0, 1] : [-1, 0]
  const th = parent.rotation.y
  const dd = dist + r - 1
  o.position.x += (wx * Math.cos(th) - wz * Math.sin(th)) * dd
  o.position.z += (wx * Math.sin(th) + wz * Math.cos(th)) * dd
}

// 顶点色共享材质：合并网格用（麦丛/树篱/书架等高频结构统一走这两个材质，避免上千份材质）
let vcLambertMat: THREE.MeshLambertMaterial | null = null
let vcBasicMat: THREE.MeshBasicMaterial | null = null
function vcMat(basic: boolean): THREE.MeshLambertMaterial | THREE.MeshBasicMaterial {
  if (basic) {
    if (!vcBasicMat) vcBasicMat = new THREE.MeshBasicMaterial({ vertexColors: true })
    return vcBasicMat
  }
  if (!vcLambertMat) vcLambertMat = new THREE.MeshLambertMaterial({ vertexColors: true })
  return vcLambertMat
}

// 把一簇小几何按顶点色合并成单个网格（1 drawcall）。麦丛/树篱/栅栏/书架成百上千地铺，
// 逐块 Mesh 会直接把 drawcall 打爆，这里统一合并。
function mergedMesh(parts: { g: THREE.BufferGeometry; c: string }[], basic = false): THREE.Mesh {
  for (const { g, c } of parts) {
    const cc = col(c)
    const n = g.attributes.position.count
    const arr = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { arr[i * 3] = cc.r; arr[i * 3 + 1] = cc.g; arr[i * 3 + 2] = cc.b }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  }
  const geos = parts.map((p) => p.g)
  const merged = mergeGeometries(geos)!
  for (const g of geos) g.dispose()
  return new THREE.Mesh(merged, vcMat(basic))
}

// 等腰三角面（底边居中在原点、顶点在 +Y，法线朝 +Z）：人字屋顶山墙用
function triGeo(w: number, h: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-w / 2, 0, 0, w / 2, 0, 0, 0, h, 0]), 3))
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1]), 2))
  g.computeVertexNormals()
  return g
}

// 双坡人字屋顶（house / barn 共用）：脊沿长边，两块斜板 + 两端山墙
function gableRoof(w: number, d: number, rise: number, tile: string, gable: string): THREE.Group {
  const g = new THREE.Group()
  const alongX = w >= d
  const ridge = alongX ? w : d      // 屋脊长度
  const span = alongX ? d : w       // 坡面跨度
  const slope = Math.hypot(span / 2, rise)
  const ang = Math.atan2(rise, span / 2)
  for (const sgn of [-1, 1]) {
    const pan = box(ridge + 0.5, 0.14, slope + 0.12, tile, 0, rise / 2, sgn * span / 4)
    pan.rotation.x = sgn * ang
    g.add(pan)
  }
  for (const sgn of [-1, 1]) {
    const tri = new THREE.Mesh(triGeo(span, rise), new THREE.MeshLambertMaterial({ color: gable, side: THREE.DoubleSide }))
    tri.position.set(sgn * ridge / 2, 0, 0)
    tri.rotation.y = Math.PI / 2
    g.add(tri)
  }
  if (!alongX) g.rotation.y = Math.PI / 2
  return g
}

// M.E.G. 徽记：一个圆环 + 内部三角（贴在牌面 +Z 侧）
function megEmblem(r: number, ink: string): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshLambertMaterial({ color: ink, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.7, r, 16), mat)
  g.add(ring)
  const tri = new THREE.Mesh(new THREE.CircleGeometry(r * 0.58, 3), mat)
  tri.rotation.z = Math.PI / 2
  tri.position.z = 0.004
  g.add(tri)
  return g
}

// 楼体立面贴图（窗格凹槽）：所有 towerblock 共享一张，UV 按世界尺寸放大
let facadeTex: THREE.CanvasTexture | null = null
function towerFacade(): THREE.CanvasTexture {
  if (facadeTex) return facadeTex
  const [c, g] = makeCanvasCtx(32, 32)
  g.fillStyle = '#e6e8ec'; g.fillRect(0, 0, 32, 32)
  g.fillStyle = '#9aa0a6'; g.fillRect(0, 26, 32, 4)      // 楼板腰线
  g.fillStyle = '#5a626a'; g.fillRect(5, 6, 22, 16)      // 窗洞凹槽
  g.fillStyle = '#3a424a'; g.fillRect(7, 8, 18, 12)      // 玻璃
  g.fillStyle = '#8a9098'; g.fillRect(15, 8, 2, 12)      // 中挺
  const t = toTex(c)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  facadeTex = t
  return t
}

// 楼体大盒：UV 按各面的世界尺寸放大（一格窗 ≈ 3.2m），保证 1 个 mesh 就有规则窗格
function towerBox(w: number, h: number, d: number, color: string): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d)
  const uv = geo.attributes.uv as THREE.BufferAttribute
  const nor = geo.attributes.normal
  const U = 3.2
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i))
    if (ny > 0.5) uv.setXY(i, uv.getX(i) * w / U, uv.getY(i) * d / U)
    else if (nx > 0.5) uv.setXY(i, uv.getX(i) * d / U, uv.getY(i) * h / U)
    else uv.setXY(i, uv.getX(i) * w / U, uv.getY(i) * h / U)
  }
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, map: towerFacade() }))
}

// 给 Lambert 件加自发光（暗层里的微光/苔藓/焦油余温）
function emit(mesh: THREE.Mesh, hex: string, intensity = 1): THREE.Mesh {
  const mat = mesh.material as THREE.MeshLambertMaterial
  mat.emissive = col(hex)
  mat.emissiveIntensity = intensity
  return mesh
}

// 绿色 EXIT 指示灯牌（程序纹理：深底绿字；levelTexture 全局缓存）
function exitSignTexture(): THREE.Texture {
  return levelTexture('exit_sign_v1.png', () => {
    const [cv, c] = makeCanvasCtx(96, 32)
    c.fillStyle = '#06210f'
    c.fillRect(0, 0, 96, 32)
    c.strokeStyle = '#1d5c33'
    c.strokeRect(1.5, 1.5, 93, 29)
    c.fillStyle = '#3aff72'
    c.font = 'bold 20px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    c.fillText('EXIT', 48, 17)
    return toTex(cv)
  })
}

// v26：悬挂物贴合天花板底面——按所在瓦片的实际顶高（挑高=H*1.75 / 上层楼板底 2.65 / 普通=H），
// 取代旧版一律用层高 H（挑高区吊灯悬空在半天、楼板下的灯嵌进楼板底）
function hangingCeil(s: Structure, m: GameMap, H: number): number {
  const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return H
  const i = ty * m.w + tx
  if (m.up && m.up[i] === 1) return 2.65
  if (m.ceiling && m.ceiling[i] === 1) return tallCeilH(m, H) // v46：多层挑高与上层天花拉平
  return H
}

// ---------- 结构低模 ----------
export function buildStructure(s: Structure, _def: LevelDef, m: GameMap, wallH: number): THREE.Object3D | null {
  const grp = new THREE.Group()
  const cx = s.x + s.w / 2, cz = s.y + s.h / 2
  const H = wallH
  const CH = hangingCeil(s, m, H) // v26：本瓦片天花板底面高度（悬挂物专用）
  switch (s.kind) {
    case 'pillar': {
      // v34：立柱默认使用该层级的墙纸（与墙面同材质观感；无磁盘贴图的层级经 levelTexture 回退程序噪点）
      // v46：柱高自动顶到实际顶面——夹楼板下=楼板底 2.65（真支撑柱），挑高区=挑高顶
      // （开阔挑高区的柱子不再半截悬空，始终与地面和天花板相连）
      const pti = Math.floor(cz) * m.w + Math.floor(cx)
      const ph = m.up?.[pti] === 1 ? 2.65 : (m.floors ?? 1) > 1 && m.ceiling?.[pti] === 1 ? tallCeilH(m, H) : H
      grp.add(wallpaperBox(0.75, ph, 0.75, _def, 0, ph / 2, 0))
      grp.add(wallpaperBox(0.9, 0.25, 0.9, _def, 0, 0.12, 0))
      break
    }
    case 'car': {
      const cc = ['#5a4a42', '#445055', '#555048', '#4a3a3a'][Math.floor(Math.random() * 4)]
      grp.add(box(s.w * 0.92, 0.55, s.h * 0.88, cc, 0, 0.42, 0))
      grp.add(box(s.w * 0.5, 0.4, s.h * 0.7, '#2a2d30', 0, 0.85, 0))
      // 后备箱盖（搜索后掀起）
      const trunk = box(s.w * 0.4, 0.05, s.h * 0.85, cc, -s.w * 0.26, 0.72, 0)
      trunk.geometry.translate(-s.w * 0.2, 0, 0)
      trunk.position.set(s.w * 0.05, 0.72, 0)
      trunk.userData.lid = 1
      grp.add(trunk)
      break
    }
    case 'booth': {
      grp.add(box(s.w, 1.1, s.h, '#5a5148', 0, 0.55, 0))
      grp.add(box(s.w * 0.8, 0.9, 0.1, '#3a352e', 0, 1.5, s.h / 2 - 0.05))
      grp.add(box(s.w, 0.1, s.h, '#44403a', 0, 2.0, 0))
      break
    }
    case 'pipes': {
      if (s.data?.cross) {
        // v41：横穿廊道的大小管道（L2 扭曲的廊道）——沿局部 X 横卧，与 crawl 低通道风道同高
        const len = s.w
        const big = cyl(0.16, 0.16, len, '#7a4a2e', 0, 1.02, -0.2)
        big.rotation.z = Math.PI / 2
        grp.add(big)
        const small = cyl(0.09, 0.09, len, '#8a8a8a', 0, 0.62, 0.18)
        small.rotation.z = Math.PI / 2
        grp.add(small)
        break
      }
      // v41：data.rust=生锈变体（L2 肮脏的廊道：金属普遍生锈，锈橙棕）
      const rust = !!s.data?.rust
      const cA = rust ? '#8a4526' : '#7a4a2e' // 主管（锈橙/铜棕）
      const cB = rust ? '#6e5a42' : '#8a8a8a' // 次管（灰棕/钢灰）
      // v42：端头弧形拐弯（任何平行管道的尽头都不留悬空断头）——贝塞尔弯管 + 竖直段接入天花板/地板
      const endEl = Number(s.data?.endEl ?? 0) // 1=向上入顶 2=向下入地
      const south = Number(s.data?.endS ?? 0) === 1
      const addElbow = (x: number, hy: number, rad: number, cc: string) => {
        if (!endEl) return
        const up = endEl === 1
        const zs = south ? 1 : -1
        const zc = zs * 0.2 // 弯心（自管排末端内收）
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(x, hy, zc - zs * 0.3),
          new THREE.Vector3(x, hy, zc),
          new THREE.Vector3(x, hy + (up ? 0.3 : -0.3), zc),
        )
        grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, rad, 6), new THREE.MeshLambertMaterial({ color: cc })))
        const y2 = up ? H : 0 // 竖直段直插天花板/地板
        const vy = hy + (up ? 0.3 : -0.3)
        grp.add(cyl(rad, rad, Math.abs(y2 - vy) + 0.08, cc, x, (y2 + vy) / 2, zc))
      }
      if (s.data?.run) {
        // v42：贴墙平行粗管群——沿廊道走向多条不同粗细管道贴墙布置（实心，廊道净宽 3→2）
        const hug = Number(s.data?.side ?? 0) === 1 ? 1 : -1 // 墙在 hug 侧
        const rows: [number, number, number, string][] = [
          [0.3, 0.13, 0, cA], [0.62, 0.09, 0.07, cB], [0.98, 0.16, -0.05, cA],
        ]
        for (const [hy, rad, ox, cc] of rows) {
          const p = cyl(rad, rad, 1.0, cc, hug * (0.3 + ox), hy, 0)
          p.rotation.x = Math.PI / 2
          grp.add(p)
          addElbow(hug * (0.3 + ox), hy, rad, cc)
        }
        grp.add(box(0.08, 1.1, 0.1, '#3a352e', hug * 0.44, 0.55, 0)) // 管箍支架
        break
      }
      if (s.data?.wall) {
        // v42：代墙平行管道——整段墙面化身多层沿廊道走向的管排（不压缩净宽；段旁禁止生成门）
        const dir = Number(s.data?.side ?? 0) === 1 ? -1 : 1 // 朝廊道方向（西墙线→+x）
        const rows: [number, number, string][] = [
          [0.42, 0.16, cA], [0.98, 0.1, cB], [1.55, 0.13, cA], [2.12, 0.09, cB],
        ]
        for (const [hy, rad, cc] of rows) {
          const px = dir * (0.5 + rad * 0.4) // 凸出墙面（管排即墙）
          const p = cyl(rad, rad, 1.0, cc, px, hy, 0)
          p.rotation.x = Math.PI / 2
          grp.add(p)
          addElbow(px, hy, rad, cc)
        }
        // 竖向连通短管（管排之间的落水连通管观感）
        grp.add(cyl(0.07, 0.07, H, cB, dir * 0.52, H / 2, (s.x + s.y) % 2 ? -0.3 : 0.3))
        break
      }
      if (s.data?.ceil) {
        // v42：天花板两缘管线装饰——细管 + 电缆线束沿廊道走向（非实心纯装饰）
        const dir = Number(s.data?.side ?? 0) === 1 ? -1 : 1
        const px = dir * 0.44
        const p = cyl(0.05, 0.05, 1.0, cB, px, H - 0.2, 0)
        p.rotation.x = Math.PI / 2
        grp.add(p)
        addElbow(px, H - 0.2, 0.05, cB)
        // 电缆线束（3 条细线；按瓦片哈希偶发下垂环）
        const mrand = mulberry((Math.floor(s.x) * 73856093) ^ (Math.floor(s.y) * 19349663))
        for (let k2 = 0; k2 < 3; k2++) {
          const cx2 = dir * (0.34 + k2 * 0.05), cy2 = H - 0.3 - k2 * 0.05
          const cb = box(0.025, 0.025, 1.0, ['#16181a', '#3a2020', '#1e2a38'][k2], cx2, cy2, 0)
          grp.add(cb)
          if (k2 === 1 && mrand() < 0.3) { // 下垂环
            const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.014, 5, 8, Math.PI), new THREE.MeshLambertMaterial({ color: '#16181a' }))
            loop.geometry.rotateY(Math.PI / 2)
            loop.geometry.rotateX(Math.PI)
            loop.position.set(cx2, cy2, (mrand() - 0.5) * 0.6)
            grp.add(loop)
          }
        }
        break
      }
      grp.add(cyl(0.14, 0.14, H, cA, -0.15, H / 2, 0))
      grp.add(cyl(0.1, 0.1, H, cB, 0.18, H / 2, 0.1))
      if (rust) grp.add(cyl(0.16, 0.16, 0.5, '#9a4e24', -0.15, 0.9, 0)) // 锈蚀鼓包
      break
    }
    case 'valve': {
      grp.add(cyl(0.12, 0.12, 1.6, '#7a4a2e', 0, 0.8, 0))
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 10), new THREE.MeshLambertMaterial({ color: '#a63a2e' }))
      wheel.position.set(0, 1.1, 0.18)
      grp.add(wheel)
      break
    }
    case 'gauge': {
      grp.add(cyl(0.05, 0.05, 1.1, '#8a8a8a', 0, 0.55, 0))
      grp.add(cyl(0.16, 0.16, 0.08, '#d9c39a', 0, 1.2, 0, 10))
      break
    }
    case 'boiler': {
      // v41：data.dead=废弃状态（L2 肮脏的廊道：暗色/不发光）
      const dead = !!s.data?.dead
      grp.add(cyl(1.3, 1.4, 2.6, dead ? '#332c26' : '#4a3f35', 0, 1.3, 0, 12))
      grp.add(cyl(0.2, 0.2, 1.5, dead ? '#6e3428' : '#a63a2e', 0.9, 2.6, 0))
      if (!dead) grp.add(glow(0.5, 0.3, 0.05, '#ff6a3a', 0, 0.9, s.h / 2 - 0.3))
      break
    }
    case 'generator': {
      const dead = !!s.data?.dead
      grp.add(box(s.w * 0.9, 1.4, s.h * 0.85, dead ? '#2b2e33' : '#3a3f46', 0, 0.7, 0))
      const drum = cyl(0.35, 0.35, s.w * 0.7, dead ? '#22252a' : '#2e3238', 0, 1.6, 0, 10)
      drum.rotation.z = Math.PI / 2
      grp.add(drum)
      if (!dead) grp.add(glow(0.2, 0.1, 0.05, '#9adfff', s.w * 0.3, 1.0, s.h * 0.43))
      break
    }
    case 'cabinet': {
      grp.add(box(0.85, 1.9, 0.5, '#3a3f46', 0, 0.95, 0))
      grp.add(box(0.87, 0.18, 0.52, '#d9b13b', 0, 1.45, 0))
      grp.add(glow(0.08, 0.08, 0.03, '#9adfff', 0.2, 1.7, 0.26))
      // 柜门（可开启）：铰链在后缘（几何平移到边缘，绕边旋转而非绕中心打转）
      const door = box(0.04, 1.5, 0.44, '#2e3238', 0, 0, 0)
      door.geometry.translate(0, 0.75, 0.22)
      door.position.set(0.44, 0.2, -0.22)
      door.userData.lid = 1
      grp.add(door)
      // v48 缺省朝向：背贴最近墙、正面（+Z）朝外；data.deg 可显式覆盖
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else faceOutward(grp, s, m)
      break
    }
    case 'trench': {
      grp.add(box(1, 0.06, 1, '#101215', 0, 0.03, 0))
      grp.add(box(0.9, 0.04, 0.12, '#a63a2e', 0, 0.07, -0.2))
      grp.add(box(0.9, 0.04, 0.12, '#d9b13b', 0, 0.07, 0.2))
      break
    }
    case 'cubicle': {
      grp.add(box(s.w, 1.35, 0.08, '#6e6a5c', 0, 0.68, -s.h / 2 + 0.04))
      grp.add(box(0.08, 1.35, s.h, '#6e6a5c', -s.w / 2 + 0.04, 0.68, 0))
      grp.add(box(s.w * 0.8, 0.06, 0.5, '#8f8a7c', 0, 0.75, -s.h / 2 + 0.3))
      grp.add(glow(0.35, 0.25, 0.03, '#7fb0c9', 0, 1.0, -s.h / 2 + 0.22))
      break
    }
    case 'copier': {
      grp.add(box(1.6, 1.0, 1.4, '#7a766a', 0, 0.5, 0))
      grp.add(box(1.5, 0.15, 1.2, '#8f8a7c', 0, 1.08, 0))
      grp.add(glow(0.3, 0.06, 0.06, '#7fb0c9', 0.4, 1.1, 0.5))
      break
    }
    case 'server': {
      grp.add(box(s.w * 0.9, 2.2, s.h * 0.9, '#26282c', 0, 1.1, 0))
      for (let i = 0; i < 4; i++) grp.add(glow(0.1, 0.04, 0.03, i % 2 ? '#6f9a55' : '#9adfff', -0.6 + i * 0.4, 1.6, s.h * 0.46))
      break
    }
    case 'bigcomputer': {
      // 大号台式电脑（L2 电脑房）：低柜 + 大机箱 + CRT 显示器（微光屏）+ 键盘 + 背部线缆
      const dead = !!s.data?.dead
      grp.add(box(s.w * 0.95, 0.72, 0.85, '#6e6a5c', 0, 0.36, 0)) // 低柜（桌台）
      grp.add(box(s.w * 0.95, 0.04, 0.9, '#8f8a7c', 0, 0.74, 0)) // 台面
      grp.add(box(0.5, 0.52, 0.7, '#b0a894', -s.w * 0.26, 1.02, 0)) // 大机箱（卧式）
      grp.add(box(0.46, 0.03, 0.66, '#8f887a', -s.w * 0.26, 1.3, 0)) // 机箱顶盖
      grp.add(glow(0.05, 0.05, 0.03, dead ? '#3a3f46' : '#6f9a55', -s.w * 0.26 + 0.14, 0.94, 0.36)) // 电源灯
      // CRT 显示器（厚后脑 + 微光屏，data.dead=屏幕熄灭）
      grp.add(box(0.66, 0.56, 0.58, '#c0b8a8', s.w * 0.18, 1.06, -0.05))
      grp.add(box(0.5, 0.42, 0.1, '#a89f8e', s.w * 0.18, 1.06, -0.36)) // 后脑
      if (dead) grp.add(box(0.5, 0.4, 0.03, '#1a2226', s.w * 0.18, 1.06, 0.245))
      else grp.add(glow(0.5, 0.4, 0.03, '#6fae8a', s.w * 0.18, 1.06, 0.245)) // 微光屏（绿）
      grp.add(box(0.46, 0.03, 0.18, '#b8b0a0', s.w * 0.18, 0.78, 0.42)) // 键盘
      for (let i = 0; i < 3; i++) // 键帽行
        grp.add(box(0.4, 0.012, 0.03, '#8f887a', s.w * 0.18, 0.8, 0.37 + i * 0.05))
      grp.add(cyl(0.02, 0.02, 0.5, '#3a352e', s.w * 0.18 - 0.2, 0.5, -0.4, 6)) // 背部线缆
      break
    }
    case 'vending': {
      grp.add(box(0.95, 2.0, 0.7, '#5a3a3a', 0, 1.0, 0))
      grp.add(glow(0.7, 1.2, 0.04, '#ffe9b0', 0, 1.2, 0.36))
      // v46：data.deg 指定朝向（缺省朝南 +z；EL3A 休息室售货机面朝公共区，不再背朝外）
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'desk': {
      grp.add(box(s.w * 0.9, 0.06, 0.7, '#8f8a7c', 0, 0.74, 0))
      grp.add(box(0.08, 0.74, 0.6, '#6e6a5c', -s.w * 0.4, 0.37, 0))
      grp.add(box(0.08, 0.74, 0.6, '#6e6a5c', s.w * 0.4, 0.37, 0))
      grp.add(glow(0.4, 0.3, 0.04, '#7fb0c9', 0.2, 1.0, -0.2))
      grp.add(box(0.35, 0.06, 0.45, '#3a352e', -0.3, 0.78, 0))
      break
    }
    case 'door': {
      // 客房门（东侧墙面）
      grp.add(box(0.1, 2.1, 1.0, '#3a1e20', 0, 1.05, 0))
      grp.add(box(0.06, 1.9, 0.8, '#4a2628', 0.05, 0.95, 0))
      grp.add(glow(0.03, 0.03, 0.08, '#b08d46', 0.08, 1.0, 0.25))
      grp.position.set(s.x + s.w - 0.5, 0, s.y + s.h / 2)
      return grp
    }
    case 'frontdesk': {
      grp.add(box(s.w, 1.1, 0.6, '#4a2628', 0, 0.55, 0))
      grp.add(box(s.w, 0.08, 0.7, '#b08d46', 0, 1.14, 0))
      grp.add(cyl(0.08, 0.1, 0.1, '#ffd9a0', 0.5, 1.22, 0, 8))
      break
    }
    case 'ballroom': {
      // 吊灯（v26：吊链顶端贴合本瓦片天花板底面）
      grp.add(cyl(0.04, 0.04, CH - 2.0, '#b08d46', 0, CH - (CH - 2.0) / 2, 0))
      grp.add(cyl(0.7, 0.9, 0.4, '#b08d46', 0, 1.95, 0, 10))
      grp.add(glow(0.6, 0.25, 0.6, '#ffd9a0', 0, 1.75, 0))
      break
    }
    case 'lightgrid': {
      grp.add(glow(s.w * 0.9, 0.06, 0.3, '#fff6d8', 0, CH - 0.05, 0)) // v26：灯排贴天花板底面
      break
    }
    case 'bed': {
      grp.add(box(s.w * 0.95, 0.3, s.h * 0.95, '#3a1e20', 0, 0.15, 0))
      grp.add(box(s.w * 0.9, 0.18, s.h * 0.9, '#d8cfc0', 0, 0.38, 0))
      grp.add(box(s.w * 0.8, 0.12, 0.4, '#a03a3a', 0, 0.45, -s.h * 0.3))
      break
    }
    case 'sconce': {
      grp.add(glow(0.15, 0.25, 0.15, '#ffd9a0', 0, 1.9, 0))
      break
    }
    case 'graffiti': {
      const d = wallDir(s, m)
      if (d === null) return null // 无墙瓦片不生成（避免悬浮）
      const texs = graffitiTextures()
      const tex = texs[Math.floor(Math.random() * texs.length)]
      const w = 0.55 + Math.random() * 0.45
      const h = w * (0.68 + Math.random() * 0.5)
      const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.82 + Math.random() * 0.18 })
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
      const off = 0.015 + Math.random() * 0.008
      const cy = Math.min(wallH - h / 2 - 0.1, 0.8 + Math.random() * 1.0) // 高度 0.8-1.8m
      const lx = (Math.random() - 0.5) * 0.3 // 沿墙横向偏移
      if (d === 0) p.position.set(lx, cy, -0.5 + off)
      else if (d === 2) { p.position.set(lx, cy, 0.5 - off); p.rotation.y = Math.PI }
      else if (d === 3) { p.position.set(-0.5 + off, cy, lx); p.rotation.y = Math.PI / 2 }
      else { p.position.set(0.5 - off, cy, lx); p.rotation.y = -Math.PI / 2 }
      grp.add(p)
      break
    }
    case 'crate': {
      // 木箱：板条（木纹贴图）+ 可开盖板
      const crateMat = texLambert('crate_wood', '#6a5a40', '#554730')
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.62, 0.8), crateMat)
      body.position.set(0, 0.31, 0)
      grp.add(body)
      for (let i = 0; i < 3; i++) grp.add(box(0.84, 0.06, 0.84, '#554730', 0, 0.12 + i * 0.22, 0))
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.84), crateMat)
      lid.geometry.translate(0, 0, 0.42) // 铰链在后缘
      lid.position.set(0, 0.66, -0.42)
      lid.userData.lid = 1
      grp.add(lid)
      break
    }
    case 'corpse': {
      grp.add(box(0.5, 0.18, 1.2, '#4a4038', 0, 0.09, 0))
      grp.add(box(0.3, 0.14, 0.3, '#8a8078', 0, 0.12, -0.6))
      grp.add(box(0.2, 0.1, 0.5, '#3a332c', 0.15, 0.08, 0.3)) // 伸出的腿
      // 盖布（搜索后掀开）
      const sheet = box(0.56, 0.06, 1.0, '#5a5348', 0, 0.2, 0.1)
      sheet.userData.lid = 1
      grp.add(sheet)
      break
    }
    case 'ladder': {
      // v13：攀爬梯直达上层（3.5m 高）；装饰梯保持原样
      const lh = s.data?.climb ? 3.5 : s.h * 1.2
      grp.add(box(0.06, lh, 0.06, '#7a6a4a', -0.25, lh / 2, 0))
      grp.add(box(0.06, lh, 0.06, '#7a6a4a', 0.25, lh / 2, 0))
      for (let i = 0, n = Math.floor(lh / 0.45); i < n; i++) grp.add(box(0.5, 0.05, 0.05, '#6a5a3a', 0, 0.3 + i * 0.45, 0))
      if (s.data?.climb) grp.add(glow(0.3, 0.06, 0.06, '#9adfff', 0, lh - 0.2, 0)) // 顶端微光提示可爬
      break
    }
    case 'lift': {
      // v13 载客电梯：角柱竖井 + 可动轿厢平台（carZ 由引擎驱动）+ 指示灯
      for (const [px, pz] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]] as const)
        grp.add(box(0.09, 5.6, 0.09, '#3a3f45', px, 2.8, pz))
      grp.add(box(1.0, 0.14, 1.0, '#26292e', 0, 5.55, 0)) // 井道顶梁
      const car = new THREE.Group()
      car.add(box(0.92, 0.1, 0.92, '#5a5f66', 0, 0.05, 0)) // 轿厢地板
      car.add(box(0.92, 0.06, 0.92, '#4a4e54', 0, 2.2, 0)) // 轿厢吊顶
      for (const [px, pz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]] as const)
        car.add(box(0.06, 2.2, 0.06, '#6a6f76', px, 1.1, pz)) // 轿厢立柱
      car.userData.liftCar = 1
      grp.add(car)
      grp.userData.car = car
      grp.add(glow(0.12, 0.24, 0.06, '#9adfff', 0.52, 1.4, 0)) // 呼梯按钮面板
      break
    }
    case 'vent': {
      // 通风口贴墙：与涂鸦同法计算墙面朝向
      const d = wallDir(s, m)
      if (d === null) return null
      const vgrp = new THREE.Group()
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshLambertMaterial({ color: '#1c1a18' }))
      vgrp.add(p)
      for (let i = 0; i < 3; i++) vgrp.add(box(0.7, 0.04, 0.02, '#3a3630', 0, -0.15 + i * 0.15, 0.012))
      const off = 0.02
      const vy = Math.random() < 0.5 ? 0.6 : 2.0
      if (d === 0) vgrp.position.set(0, vy, -0.5 + off)
      else if (d === 2) { vgrp.position.set(0, vy, 0.5 - off); vgrp.rotation.y = Math.PI }
      else if (d === 3) { vgrp.position.set(-0.5 + off, vy, 0); vgrp.rotation.y = Math.PI / 2 }
      else { vgrp.position.set(0.5 - off, vy, 0); vgrp.rotation.y = -Math.PI / 2 }
      grp.add(vgrp)
      break
    }
    case 'ceilvent': {
      // v33：自天花板向下伸出的通风管道（Level 1；停电时「手臂」由此伸出猎捕）——少量出现于常规区段
      grp.add(box(0.55, 0.8, 0.55, '#4a4a4e', 0, CH - 0.4, 0)) // 垂下的管体
      grp.add(box(0.64, 0.07, 0.64, '#3a3a3e', 0, CH - 0.83, 0)) // 端口边框
      for (let i = 0; i < 3; i++) grp.add(box(0.5, 0.035, 0.07, '#202023', 0, CH - 0.87, -0.17 + i * 0.17)) // 百叶栅格
      break
    }
    case 'rebar': {
      // 突出墙壁的锈蚀钢筋（L1，wikidot/Fandom：严重生锈，刺伤可致破伤风）——2~3 根锈杆斜出墙面
      const d = wallDir(s, m)
      if (d === null) return null
      const rgrp = new THREE.Group()
      const rr = mulberry(s.x * 31 + s.y * 77)
      const n = 2 + Math.floor(rr() * 2)
      for (let i = 0; i < n; i++) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.5, 6), new THREE.MeshLambertMaterial({ color: i % 2 ? '#6e3a20' : '#7a4a2e' }))
        rod.rotation.x = Math.PI / 2 + (rr() - 0.5) * 0.5 // 斜出墙面
        rod.rotation.z = (rr() - 0.5) * 0.6
        rod.position.set((i - (n - 1) / 2) * 0.14, (rr() - 0.5) * 0.2, 0.18)
        rgrp.add(rod)
      }
      const ry = 0.9 + rr() * 0.8 // 腰到胸口高度（最易划伤过往行人）
      if (d === 0) rgrp.position.set(0, ry, -0.5)
      else if (d === 2) { rgrp.position.set(0, ry, 0.5); rgrp.rotation.y = Math.PI }
      else if (d === 3) { rgrp.position.set(-0.5, ry, 0); rgrp.rotation.y = Math.PI / 2 }
      else { rgrp.position.set(0.5, ry, 0); rgrp.rotation.y = -Math.PI / 2 }
      grp.add(rgrp)
      break
    }
    case 'socket': {
      // 墙上插板（L0 装饰）：米色面板 + 双插孔 + 翘板开关，贴墙朝向与通风口同法
      const d = wallDir(s, m)
      if (d === null) return null
      const sgrp = new THREE.Group()
      sgrp.add(box(0.17, 0.24, 0.03, '#ddd4b8', 0, 0, 0)) // 面板
      sgrp.add(box(0.05, 0.08, 0.014, '#2a2620', -0.04, 0.045, 0.02)) // 上插孔
      sgrp.add(box(0.05, 0.08, 0.014, '#2a2620', 0.04, -0.05, 0.02)) // 下插孔
      sgrp.add(box(0.03, 0.05, 0.02, '#b8ab84', 0.045, 0.05, 0.022)) // 翘板开关
      const off = 0.03
      const sy = 0.35 + mulberry(s.x * 57 + s.y * 91)() * 0.3 // 真实插座离地高度（少量变化）
      if (d === 0) sgrp.position.set(0, sy, -0.5 + off)
      else if (d === 2) { sgrp.position.set(0, sy, 0.5 - off); sgrp.rotation.y = Math.PI }
      else if (d === 3) { sgrp.position.set(-0.5 + off, sy, 0); sgrp.rotation.y = Math.PI / 2 }
      else { sgrp.position.set(0.5 - off, sy, 0); sgrp.rotation.y = -Math.PI / 2 }
      grp.add(sgrp)
      break
    }
    case 'mirror': {
      grp.add(box(1.0, 2.2, 0.08, '#3a1e20', 0, 1.1, 0))
      grp.add(glow(0.8, 1.9, 0.03, '#8a9aa5', 0, 1.15, 0.05))
      break
    }
    case 'hoteldoor': {
      // 可交互房门：门框 + 铰链门板（开门动画见 updateStructs）
      // v9 朝向约定：门板平面与所在墙线平行（水平墙线→面朝南北；垂直墙线→整体旋转 90° 面朝东西）
      // v10 修复：① dbl 双开门两扇镜像（铰链各在外缘、对开）② 开门方向=门洞内侧
      // （连通地板更多的一侧）③ 开门角收敛到 ~89°，门板尖端不再旋入侧墙
      const rot = doorNeedsRotate(m, s)
      grp.rotation.y = rot
      const ax = Math.floor(s.x + s.w / 2), ay = Math.floor(s.y + s.h / 2)
      // 双开门镜像：搭档位于本体局部 -X 侧时，铰链移到 +X 缘、旋转取反
      let mirror = false
      if (s.data?.dbl) {
        const dblMate = (tx: number, ty: number) =>
          m.structures.some((o) => o !== s && (o.kind === 'hoteldoor' || o.kind === 'glassdoor') && !!o.data?.dbl
            && Math.floor(o.x + o.w / 2) === tx && Math.floor(o.y + o.h / 2) === ty)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          if (!dblMate(ax + dx, ay + dy)) continue
          // 世界偏移 → 门板局部（rot=0 同世界；rot=π/2 时 local(-wz, wx)）
          const lx = rot === 0 ? dx : -dy
          if (lx < 0) mirror = true
          break
        }
      }
      // 开门方向：局部 ±Z 两侧 5×5 连通地板计数，多者=门洞内侧（房间侧），向内开启
      const wzx = rot === 0 ? 0 : 1, wzz = rot === 0 ? 1 : 0 // 局部 +Z 的世界方向
      const floorNear = (sx: number, sz: number) => {
        let n = 0
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
          const tx = ax + sx * 2 + i, ty = ay + sz * 2 + j
          if (tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && m.tiles[ty * m.w + tx] === 1) n++
        }
        return n
      }
      const swingIn = floorNear(wzx, wzz) >= floorNear(-wzx, -wzz) ? 1 : -1
      grp.userData.swing = swingIn * (mirror ? -1 : 1)
      // v41：门的颜色/材料各异（L2 废弃公共带：data.hue 0..4 门板/门框配色）
      const HUES: { panel: string; frame: string; inset: string }[] = [
        { panel: '#4a2628', frame: '#2a1516', inset: '#3a1e20' }, // 0 暗红木门（默认）
        { panel: '#3a4a42', frame: '#222e28', inset: '#2c3a32' }, // 1 墨绿金属门
        { panel: '#3e4248', frame: '#26282c', inset: '#32363c' }, // 2 钢灰金属门
        { panel: '#5a4a2e', frame: '#362c1c', inset: '#483a24' }, // 3 赭黄旧木门
        { panel: '#4a3a46', frame: '#2c222a', inset: '#3c2e38' }, // 4 灰紫旧门
      ]
      const sealed = !!s.data?.sealed
      const hue = sealed ? { panel: '#2e3238', frame: '#1c1e22', inset: '#26282c' } // 锁死：冷灰钢门
        : HUES[typeof s.data?.hue === 'number' ? s.data.hue % HUES.length : 0]
      grp.add(box(0.14, 2.15, 0.24, hue.frame, -0.46, 1.07, 0))
      grp.add(box(0.14, 2.15, 0.24, hue.frame, 0.46, 1.07, 0))
      grp.add(box(1.06, 0.14, 0.24, hue.frame, 0, 2.2, 0))
      const panel = box(0.88, 2.1, 0.07, hue.panel, 0, 0, 0)
      panel.geometry.translate(mirror ? -0.44 : 0.44, 1.05, 0) // 铰链在左缘（镜像=右缘）
      panel.position.set(mirror ? 0.44 : -0.44, 0, 0)
      panel.userData.lid = 1
      grp.add(panel)
      // 门板嵌板 + 把手（上锁=红，未锁=金；随镜像换侧）
      // v11 修复：嵌板必须挂在 panel（铰链门板）上随门一起旋转——旧版挂在门框 grp 上，
      // 开门后两块嵌板留在门洞半空（「浮空两个长方体」）。
      // panel 网格原点在铰链缘（position.x = ±0.44），子件局部坐标需补偿该偏移；
      // 把手贴在开门侧（leading edge）而非旧版的铰链侧。
      const hingeOff = mirror ? -0.44 : 0.44 // 子件局部 X 补偿：嵌板回到门面中央
      const knob = glow(0.06, 0.06, 0.1, sealed ? '#3a3f46' : s.data?.locked ? '#c93a2e' : '#b08d46', 0, 0, 0)
      knob.position.set(hingeOff + (mirror ? -0.3 : 0.3), 1.02, 0.05)
      panel.add(knob)
      panel.add(box(0.6, 0.8, 0.02, hue.inset, hingeOff, 1.55, 0.045))
      panel.add(box(0.6, 0.5, 0.02, hue.inset, hingeOff, 0.5, 0.045))
      if (sealed) {
        // 锁死的门（L2：锁的结构闻所未闻）——门扇焊死：交叉钢条 + 铆钉 + 门缝灌铅
        const bar1 = box(1.0, 0.09, 0.03, '#22252a', hingeOff, 1.05, 0.06)
        bar1.rotation.z = 0.6
        panel.add(bar1)
        const bar2 = box(1.0, 0.09, 0.03, '#22252a', hingeOff, 1.05, 0.06)
        bar2.rotation.z = -0.6
        panel.add(bar2)
        for (const [rx, ry] of [[-0.28, 1.7], [0.28, 1.7], [-0.28, 0.4], [0.28, 0.4]] as const)
          panel.add(glow(0.04, 0.04, 0.02, '#4a4f56', hingeOff + rx, ry, 0.06))
      }
      break
    }
    case 'windowblack': case 'windowtrap': case 'hotelwindow': {
      // 窗户（贴墙）：L4 涂黑=安全 / L4 未涂黑=陷阱（隐约的脸）/ L5 酒店窗
      const d = wallDir(s, m)
      if (d === null) return null
      const wgrp = new THREE.Group()
      const frame = s.kind === 'hotelwindow' ? '#8a6d2e' : '#3a352e'
      wgrp.add(box(0.9, 1.3, 0.06, frame, 0, 0, 0))
      if (s.kind === 'windowblack') {
        wgrp.add(box(0.76, 1.16, 0.03, '#050505', 0, 0, 0.02)) // 涂黑玻璃
      } else if (s.kind === 'windowtrap') {
        wgrp.add(box(0.76, 1.16, 0.03, '#0c1014', 0, 0, 0.02))
        if (!s.data?.triggered) {
          // 玻璃后隐约的「脸」（陷阱提示，极暗）
          wgrp.add(glow(0.05, 0.05, 0.02, '#3a4438', -0.09, 0.12, 0.045))
          wgrp.add(glow(0.05, 0.05, 0.02, '#3a4438', 0.09, 0.12, 0.045))
        }
      } else {
        // 酒店窗：夜景玻璃 + 十字窗棂
        wgrp.add(box(0.76, 1.16, 0.03, '#101820', 0, 0, 0.02))
        wgrp.add(box(0.04, 1.16, 0.04, frame, 0, 0, 0.04))
        wgrp.add(box(0.76, 0.04, 0.04, frame, 0, 0, 0.04))
        wgrp.add(glow(0.1, 0.08, 0.02, '#2a3a4a', -0.2, 0.3, 0.045)) // 远处「城市」光点
      }
      const off = 0.04
      const wy = 1.45
      if (d === 0) wgrp.position.set(0, wy, -0.5 + off)
      else if (d === 2) { wgrp.position.set(0, wy, 0.5 - off); wgrp.rotation.y = Math.PI }
      else if (d === 3) { wgrp.position.set(-0.5 + off, wy, 0); wgrp.rotation.y = Math.PI / 2 }
      else { wgrp.position.set(0.5 - off, wy, 0); wgrp.rotation.y = -Math.PI / 2 }
      grp.add(wgrp)
      break
    }
    case 'table': {
      // v23：马尼拉室的那把椅子（Wikidot：usually no more than a table and chair）
      if (s.data?.chair) {
        grp.add(box(0.42, 0.05, 0.42, '#6a5a42', 0, 0.45, 0))            // 座面
        grp.add(box(0.42, 0.52, 0.05, '#6a5a42', 0, 0.7, -0.19))          // 椅背
        for (const [cx2, cz2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
          grp.add(box(0.05, 0.45, 0.05, '#54462f', cx2 * 0.17, 0.22, cz2 * 0.17))
        break
      }
      grp.add(box(s.w * 0.85, 0.06, s.h * 0.8, '#4a3a2a', 0, 0.72, 0))
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
        grp.add(box(0.07, 0.72, 0.07, '#3a2e22', sx * (s.w * 0.38), 0.36, sz * (s.h * 0.32)))
      if (s.data?.manila) {
        grp.add(box(0.3, 0.03, 0.22, '#e5c88f', -0.08, 0.765, 0.04))      // M.E.G. 文件夹（马尼拉纸）
        grp.add(box(0.3, 0.02, 0.22, '#dcbd7e', 0.06, 0.79, -0.05))
        grp.add(box(0.08, 0.005, 0.08, '#6a5a3a', 0.06, 0.802, -0.05))    // 徽记
      } else if (s.w >= 2) grp.add(box(0.4, 0.05, 0.3, '#d8cfc0', 0.2, 0.77, 0)) // 桌布/托盘
      break
    }
    case 'chandelier': {
      // L5 水晶吊灯：吊链 + 金环 + 水晶挂坠（自发光）（v26：吊链顶端贴合本瓦片天花板底面）
      grp.add(cyl(0.03, 0.03, CH - 2.1, '#8a6d2e', 0, CH - (CH - 2.1) / 2, 0))
      grp.add(cyl(0.5, 0.62, 0.22, '#b08d46', 0, 2.0, 0, 10))
      grp.add(cyl(0.3, 0.42, 0.18, '#b08d46', 0, 1.8, 0, 8))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        grp.add(glow(0.05, 0.14, 0.05, '#ffe9c0', Math.cos(a) * 0.55, 1.85, Math.sin(a) * 0.55))
      }
      grp.add(glow(0.36, 0.16, 0.36, '#ffd9a0', 0, 1.68, 0))
      break
    }
    case 'hanglight': {
      // L0 荧光灯吊线版：吊线 + 灯管（红色变种供红房间）（v26：吊线顶端贴合本瓦片天花板底面）
      const c = s.data?.red ? '#ff5a4a' : '#e8e2c8'
      grp.add(box(0.02, 0.45, 0.02, '#3a3630', -0.25, CH - 0.22, 0))
      grp.add(box(0.02, 0.45, 0.02, '#3a3630', 0.25, CH - 0.22, 0))
      grp.add(glow(0.95, 0.07, 0.2, c, 0, CH - 0.48, 0))
      grp.rotation.z = (mulberry(s.x * 131 + s.y * 17)() - 0.5) * 0.12 // 轻微歪斜
      break
    }
    case 'dresser': {
      // 柜子（可搜索容器）：抽屉柜 + 可开柜门
      grp.add(box(0.85, 1.15, 0.5, '#4a2e22', 0, 0.58, 0))
      for (let i = 0; i < 3; i++) {
        grp.add(box(0.7, 0.26, 0.03, '#5a3a2a', 0, 0.25 + i * 0.32, 0.26))
        grp.add(glow(0.08, 0.03, 0.02, '#b08d46', 0, 0.25 + i * 0.32, 0.28))
      }
      const dd = box(0.04, 1.0, 0.46, '#3a241c', 0, 0, 0)
      dd.geometry.translate(0, 0.5, 0.23) // 铰链在后缘（绕边旋转而非绕中心打转）
      dd.position.set(0.44, 0.1, -0.23)
      dd.userData.lid = 1
      grp.add(dd)
      // v48 缺省朝向：背贴最近墙、抽屉面（+Z）朝外；data.deg 可显式覆盖
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else faceOutward(grp, s, m)
      break
    }
    case 'arch': {
      // L0 拱门：双柱 + 顶部横梁
      grp.add(box(0.28, H, 0.28, '#c9b458', 0, H / 2, -0.36))
      grp.add(box(0.28, H, 0.28, '#c9b458', 0, H / 2, 0.36))
      grp.add(box(0.28, 0.35, 1.0, '#b8a548', 0, H - 0.18, 0))
      break
    }
    case 'maingen': {
      // L3 主发电机（大型）：基座 + 双转鼓 + 指示灯（v41：data.dead=废弃状态，指示灯全灭、机身暗色）
      const dead = !!s.data?.dead
      grp.add(box(s.w * 0.92, 1.2, s.h * 0.9, dead ? '#22252a' : '#2e3238', 0, 0.6, 0))
      const d1 = cyl(0.55, 0.55, s.w * 0.6, dead ? '#2b2e33' : '#3a3f46', -s.w * 0.18, 1.7, 0, 12)
      d1.rotation.z = Math.PI / 2
      grp.add(d1)
      const d2 = cyl(0.45, 0.45, s.w * 0.45, dead ? '#1c1e22' : '#26282c', s.w * 0.22, 1.6, 0.4, 10)
      d2.rotation.z = Math.PI / 2
      grp.add(d2)
      grp.add(box(s.w * 0.95, 0.2, s.h * 0.95, '#1c1e22', 0, 0.1, 0))
      if (!dead)
        for (let i = 0; i < 4; i++)
          grp.add(glow(0.12, 0.08, 0.04, i % 2 ? '#6f9a55' : '#9adfff', -s.w * 0.3 + i * 0.3, 1.0, s.h * 0.46))
      grp.add(glow(0.3, 0.14, 0.05, '#d9b13b', s.w * 0.32, 1.3, s.h * 0.46))
      break
    }
    case 'machinewall': {
      // v42：代墙大型机器（task 9）——整段墙面化身工业设备，凸出墙面但不占廊道净空（落在墙线瓦片，段旁禁门）。
      // data.mv：0=锅炉 1=发电机组 2=主发电机 3=机柜排 4=变压器；data.dead=废弃态（暗色/不发光）
      const dead = !!s.data?.dead
      const mv = Number(s.data?.mv ?? 0)
      const dir = Number(s.data?.side ?? 0) === 1 ? -1 : 1 // 朝廊道方向（西墙线→+x）
      const fx = (d: number) => dir * (0.5 + d) // 自墙面凸出
      if (mv === 0) {
        // 锅炉墙：卧式铆接罐 + 直通天花板的烟囱 + 炉口微光
        const tank = cyl(0.42, 0.46, 0.98, dead ? '#332c26' : '#4a3f35', fx(0.34), 1.35, 0, 12)
        tank.rotation.x = Math.PI / 2
        grp.add(tank)
        for (const zz of [-0.3, 0.3]) { // 铆接环带
          const band = cyl(0.44, 0.44, 0.08, dead ? '#2b251f' : '#5a4c40', fx(0.34), 1.35, zz, 12)
          band.rotation.x = Math.PI / 2
          grp.add(band)
        }
        grp.add(cyl(0.12, 0.14, H - 1.6, dead ? '#3a2e24' : '#6e4630', fx(0.3), 1.6 + (H - 1.6) / 2, 0.2)) // 烟囱入顶
        if (!dead) grp.add(glow(0.3, 0.2, 0.04, '#ff6a3a', fx(0.62), 0.6, 0)) // 炉口
        else grp.add(box(0.3, 0.2, 0.04, '#1c1814', fx(0.62), 0.6, 0))
      } else if (mv === 1) {
        // 发电机组墙：箱体 + 顶部转鼓 + 指示灯
        grp.add(box(0.5, 1.5, 0.95, dead ? '#23262b' : '#3a3f46', fx(0.25), 0.75, 0))
        const drum = cyl(0.28, 0.28, 0.8, dead ? '#1e2126' : '#2e3238', fx(0.28), 1.72, 0, 10)
        drum.rotation.x = Math.PI / 2
        grp.add(drum)
        for (let i = 0; i < 3; i++)
          grp.add(glow(0.07, 0.07, 0.03, dead ? '#2a2d33' : i % 2 ? '#6f9a55' : '#9adfff', fx(0.44), 1.1 + i * 0.18, -0.3))
      } else if (mv === 2) {
        // 主发电机墙：基座 + 双转鼓 + 黄铭牌
        grp.add(box(0.56, 0.24, 0.98, '#1c1e22', fx(0.28), 0.12, 0))
        grp.add(box(0.5, 1.1, 0.9, dead ? '#22252a' : '#2e3238', fx(0.25), 0.8, 0))
        const d1 = cyl(0.36, 0.36, 0.86, dead ? '#2b2e33' : '#3a3f46', fx(0.3), 1.62, -0.05, 12)
        d1.rotation.x = Math.PI / 2
        grp.add(d1)
        const d2 = cyl(0.26, 0.26, 0.7, dead ? '#1c1e22' : '#26282c', fx(0.26), 1.5, 0.3, 10)
        d2.rotation.x = Math.PI / 2
        grp.add(d2)
        grp.add(box(0.02, 0.3, 0.4, '#d9b13b', fx(0.51), 1.0, 0.2)) // 铭牌
        if (!dead) for (let i = 0; i < 3; i++) grp.add(glow(0.08, 0.06, 0.03, i % 2 ? '#6f9a55' : '#9adfff', fx(0.46), 0.6 + i * 0.16, -0.32))
      } else if (mv === 3) {
        // 机柜排墙：两台高机柜 + 散热栅 + 指示灯
        for (const zz of [-0.24, 0.24]) {
          grp.add(box(0.44, 2.2, 0.42, dead ? '#26282c' : '#3a3f46', fx(0.22), 1.1, zz))
          for (let i = 0; i < 5; i++) grp.add(box(0.02, 0.03, 0.3, dead ? '#1c1e22' : '#2b2e33', fx(0.45), 0.5 + i * 0.16, zz)) // 散热栅
          grp.add(glow(0.06, 0.06, 0.03, dead ? '#2a2d33' : '#6f9a55', fx(0.45), 1.95, zz - 0.1))
        }
      } else {
        // 变压器墙：三柱线圈 + 绝缘子盘 + 顶部母排
        for (const zz of [-0.3, 0, 0.3]) {
          grp.add(cyl(0.11, 0.13, 1.5, dead ? '#332c26' : '#5a4632', fx(0.3), 0.95, zz, 8))
          for (let i = 0; i < 3; i++) grp.add(cyl(0.16, 0.16, 0.04, dead ? '#4a4440' : '#8a8a8a', fx(0.3), 1.55 + i * 0.14, zz, 8)) // 绝缘子盘
        }
        grp.add(box(0.06, 0.08, 0.98, dead ? '#3a352e' : '#7a5a2e', fx(0.3), 2.1, 0)) // 母排
        if (!dead) grp.add(glow(0.05, 0.05, 0.03, '#9adfff', fx(0.42), 1.9, 0))
      }
      break
    }

    // ===== v43：办公区EL3A 仓储家具 =====
    case 'pallet': {
      // 木托盘堆（仓库装饰，非容器）：木托盘（垫木 + 面板缝）+ 缠绕膜包裹的箱堆（半透膜 + 内箱）
      const wood = '#8a6f46', woodD = '#6f5836'
      for (const lx of [-0.32, 0, 0.32]) grp.add(box(0.14, 0.09, 0.8, woodD, lx, 0.045, 0)) // 三条垫木
      for (const lz of [-0.3, -0.1, 0.1, 0.3]) grp.add(box(0.84, 0.03, 0.14, wood, 0, 0.105, lz)) // 面板（留缝）
      // 缠绕膜包裹的箱堆：内层两只错位纸箱 + 外层半透明膜（微微发亮）
      const rng = mulberry((Math.floor(s.x) * 73856093) ^ (Math.floor(s.y) * 19349663) ^ 0x9a11)
      const b1 = box(0.62, 0.42, 0.62, '#a08653', -0.04, 0.33, 0.03)
      b1.rotation.y = (rng() - 0.5) * 0.14
      grp.add(b1)
      const b2 = box(0.5, 0.34, 0.5, '#96784a', 0.05, 0.71, -0.04)
      b2.rotation.y = (rng() - 0.5) * 0.3
      grp.add(b2)
      const wrap = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.92, 0.76),
        new THREE.MeshLambertMaterial({ color: '#cfd8dc', transparent: true, opacity: 0.28 }),
      )
      wrap.position.y = 0.58
      grp.add(wrap)
      grp.add(box(0.77, 0.05, 0.77, '#e8ecee', 0, 0.3, 0)) // 膜束腰亮纹
      break
    }
    case 'handrail': {
      // 扶手栏杆（夹楼内缘/阶梯两侧，非实心）：两根立柱 + 顶部扶手 + 中间横杆；
      // 默认贴在瓦片 +z 边缘（面向中庭/坡道），data.deg 绕 Y 旋转（0=+z 90=+x 180=-z 270=-x）
      const metal = '#5a6367', metalD = '#464e52'
      const h0 = s.data?.h0 !== undefined ? Number(s.data.h0) : null
      const h1 = s.data?.h1 !== undefined ? Number(s.data.h1) : null
      if (h0 !== null && h1 !== null) {
        // v49 斜扶手（阶梯两侧）：随坡道倾斜——h0/h1=坡道面在本瓦片局部 -x/+x 端的高度
        // （相对结构底座：1F 段相对地面 0，2F 侧挡段相对上层地板 3.0，可为负下探到坡道面）；
        // 立柱立于坡道面，扶手/横杆绕 Z 旋转对齐坡角，逐级衔接落地端与落梯口
        const post = (px: number, hBase: number) => {
          const bot = Math.min(hBase, 0), top = hBase + 1.0
          grp.add(cyl(0.025, 0.03, top - bot, metalD, px, (top + bot) / 2, 0.42, 8)) // 立柱（立于坡道面）
          grp.add(cyl(0.05, 0.05, 0.02, metalD, px, bot + 0.01, 0.42, 8)) // 底座片
        }
        post(-0.42, h0); post(0.42, h1)
        const rail = (rh: number, r: number) => {
          const y0 = h0 + rh, y1 = h1 + rh
          const g = cyl(r, r, Math.hypot(0.98, y1 - y0), metal, 0, (y0 + y1) / 2, 0.42, 8)
          g.rotation.z = Math.PI / 2 + Math.atan2(y1 - y0, 0.98) // 旋转对齐坡角（β=0 时退化为水平）
          grp.add(g)
        }
        rail(1.0, 0.03) // 顶部扶手（坡道面上方 1.0m）
        rail(0.55, 0.018) // 中间横杆
      } else {
        for (const px of [-0.42, 0.42]) {
          grp.add(cyl(0.025, 0.03, 1.0, metalD, px, 0.5, 0.42, 8)) // 立柱
          grp.add(cyl(0.05, 0.05, 0.02, metalD, px, 0.01, 0.42, 8)) // 底座片
        }
        grp.add(cyl(0.03, 0.03, 0.98, metal, 0, 1.0, 0.42, 8).rotateZ(Math.PI / 2)) // 顶部扶手
        grp.add(cyl(0.018, 0.018, 0.9, metal, 0, 0.55, 0.42, 8).rotateZ(Math.PI / 2)) // 中间横杆
      }
      grp.rotation.y = ((Number(s.data?.deg) || 0) * Math.PI) / 180
      break
    }
    case 'walllamp': {
      // v46：壁挂斜照大灯（EL3A 挑高仓库区照明）——墙面背板 + 斜臂 + 下倾灯箱体 +
      // 斜向下自发光灯板；配套光源由生成器以 fixZ 放置（灯具贴墙，不再悬空）
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(0.6, 0.52, 0.06, '#34383e', 0, 2.28, 0)) // 墙面背板
      inner.add(box(0.07, 0.07, 0.3, '#464e52', 0, 2.44, 0.17)) // 斜臂
      const housing = new THREE.Group()
      housing.position.set(0, 2.3, 0.33)
      housing.rotation.x = 0.62 // 下倾 ~35°（灯光斜投向地面作业区）
      housing.add(box(0.64, 0.3, 0.36, '#49505a', 0, 0, 0)) // 灯箱体
      housing.add(glow(0.52, 0.03, 0.26, '#fff2d8', 0, -0.165, 0)) // 斜向下灯板
      inner.add(housing)
      mountOnWall(inner, grp, s, m) // 强制贴最近墙（含虚空墙），不浮空
      break
    }
    case 'megcrate': {
      // M.E.G. 补给箱：军绿箱 + 白色标记 + 可开盖
      grp.add(box(0.85, 0.6, 0.85, '#3d4a2a', 0, 0.3, 0))
      grp.add(box(0.5, 0.06, 0.14, '#d8d2c0', 0, 0.62, 0))
      grp.add(box(0.14, 0.06, 0.5, '#d8d2c0', 0, 0.62, 0))
      const lid2 = box(0.88, 0.08, 0.88, '#46543a', 0, 0, 0)
      lid2.geometry.translate(0, 0, 0.44)
      lid2.position.set(0, 0.64, -0.44)
      lid2.userData.lid = 1
      grp.add(lid2)
      break
    }
    case 'glasswin': {
      // 半透玻璃窗（实心，仅观察）：窗台 + 上梁 + 侧框 + 透明玻璃
      // v48 缺省朝向：强制贴最近墙（含虚空墙）、玻璃面（+Z）朝室内，不再立在瓦片中央
      const inner = new THREE.Group()
      grp.add(inner)
      const frame = '#3a352e'
      if (s.data?.stain === 'blue') {
        // v47：蓝色彩玻窗（Level 274 教堂花窗）——石框尖拱 + 蓝白彩玻格 + 圣辉
        const sf = '#c8ccd8' // 石框
        inner.add(box(1.0, 0.5, 0.22, sf, 0, 0.25, 0)) // 窗台
        inner.add(box(0.08, 2.1, 0.22, sf, -0.46, 1.55, 0)) // 侧框（左）
        inner.add(box(0.08, 2.1, 0.22, sf, 0.46, 1.55, 0)) // 侧框（右）
        inner.add(box(1.0, 0.14, 0.22, sf, 0, 2.66, 0)) // 上梁
        inner.add(box(0.6, 0.14, 0.22, sf, 0, 2.78, 0)) // 尖拱顶（收分）
        const paneCols = ['#2a5fd8', '#4142a5', '#7ab0e8', '#0071c9', '#9adfff'] // 蓝白彩玻
        for (let py = 0; py < 4; py++)
          for (let px = 0; px < 3; px++) {
            const c = paneCols[(px * 7 + py * 3) % paneCols.length]
            const pane = new THREE.Mesh(
              new THREE.PlaneGeometry(0.26, 0.46),
              new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.82, side: THREE.DoubleSide }),
            )
            pane.position.set(-0.29 + px * 0.29, 0.74 + py * 0.48, 0)
            inner.add(pane)
          }
        for (let px = 0; px < 4; px++) inner.add(box(0.03, 1.92, 0.03, frame, -0.435 + px * 0.29, 1.46, 0.01)) // 竖棂
        for (let py = 0; py < 5; py++) inner.add(box(0.88, 0.03, 0.03, frame, 0, 0.5 + py * 0.48, 0.01)) // 横棂
        inner.add(glow(0.2, 0.2, 0.02, '#9adfff', 0, 2.4, 0.02)) // 顶部圣辉（鹉主之蓝）
      } else {
        inner.add(box(1.0, 0.85, 0.22, frame, 0, 0.425, 0)) // 窗台
        inner.add(box(1.0, Math.max(0.2, H - 2.1), 0.22, frame, 0, 2.1 + Math.max(0.2, H - 2.1) / 2, 0)) // 上梁
        inner.add(box(0.08, 1.25, 0.22, frame, -0.46, 1.475, 0))
        inner.add(box(0.08, 1.25, 0.22, frame, 0.46, 1.475, 0))
        const glass = new THREE.Mesh(
          new THREE.PlaneGeometry(0.88, 1.25),
          new THREE.MeshLambertMaterial({ color: '#93a7b8', transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false }),
        )
        glass.position.set(0, 1.475, 0)
        inner.add(glass)
        // 窗棂十字
        inner.add(box(0.88, 0.03, 0.03, frame, 0, 1.475, 0.01))
        inner.add(box(0.03, 1.25, 0.03, frame, 0, 1.475, 0.01))
      }
      mountOnWall(inner, grp, s, m) // 强制贴最近墙（含虚空墙），玻璃面朝室内
      break
    }
    case 'rollerdoor': {
      // 卷帘门（可交互升降）：无门框——整幅波纹钢帘板与墙同高，相邻门等宽同纹无缝相连成卷帘墙；
      // 顶部卷轴盒（lid 滑动开门动画：帘板收进盒内；v35 波纹钢贴图面板）
      grp.add(box(s.w - 0.02, 0.22, 0.22, '#2e3236', 0, H - 0.11, 0)) // 卷轴盒
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(s.w - 0.02, H - 0.24, 0.05),
        texLambert('corrugated_steel', '#5a5e63', '#45494e', '#e2e4e0'),
      )
      panel.geometry.translate(0, (H - 0.24) / 2, 0)
      panel.userData.lid = 1
      grp.add(panel)
      grp.rotation.y = doorNeedsRotate(m, s) // v9：门板平面与墙线平行
      break
    }
    case 'glassdoor': {
      // 玻璃门（可交互滑开）：金属框 + 透明门扇（lid 滑动）
      const frame = '#4a3a2a'
      grp.add(box(0.12, 2.3, 0.24, frame, -0.5, 1.15, 0))
      grp.add(box(0.12, 2.3, 0.24, frame, 0.5, 1.15, 0))
      grp.add(box(1.12, 0.12, 0.24, frame, 0, 2.3, 0))
      const panel = box(0.92, 2.2, 0.04, '#8fa4b2', 0, 0, 0)
      panel.geometry.translate(0, 1.1, 0)
      ;(panel.material as THREE.MeshLambertMaterial).transparent = true
      ;(panel.material as THREE.MeshLambertMaterial).opacity = 0.35
      panel.userData.lid = 1
      panel.add(box(0.7, 0.05, 0.05, frame, 0, 1.05, 0.04)) // 门把手横杆（随门扇滑动）
      grp.add(panel)
      grp.rotation.y = doorNeedsRotate(m, s) // v9：门板平面与墙线平行
      break
    }
    // ===================== v23：Level 6「Lights Out」 =====================
    // 本层彻底黑暗、任何外带光源都不发光——这几件只做剪影，不给自发光。
    case 'hotpipe': {
      // 沿墙的加热液体金属管道：黑暗中唯一能摸着走的导航线索
      const d = wallDir(s, m)
      if (d === null) return null
      const pg = new THREE.Group()
      const pipe = cyl(0.11, 0.11, 1.02, '#4a3a30', 0, 0, 0, 8)
      pipe.rotation.z = Math.PI / 2
      if (s.data?.warm) emit(pipe, '#240806', 0.6) // 极弱暗红：管里是热液，但本层不该「亮」
      pg.add(pipe)
      for (const fx of [-0.34, 0.34]) {
        const flange = cyl(0.155, 0.155, 0.07, '#3b2e26', fx, 0, 0, 8) // 法兰环
        flange.rotation.z = Math.PI / 2
        pg.add(flange)
      }
      for (const fx of [-0.44, 0.44]) pg.add(box(0.05, 0.09, 0.17, '#3b2e26', fx, 0, -0.085)) // 管卡到墙
      faceMount(pg, d, 0.17, 1.12)
      grp.add(pg)
      break
    }
    case 'lightswitch': {
      // 「世界最安静的房间」墙上的电灯开关（官方警告：不要拨）——极小，0.16m 见方
      const d = wallDir(s, m)
      if (d === null) return null
      const sw = new THREE.Group()
      sw.add(box(0.16, 0.16, 0.02, '#c9c2a8', 0, 0, 0))       // 面板
      sw.add(box(0.05, 0.075, 0.035, '#b5ac8e', 0, 0.02, 0.024)) // 拨杆
      faceMount(sw, d, 0.028, 1.18)
      grp.add(sw)
      break
    }
    case 'tripwire': {
      // 绊线：贴地横拉的一根极细金属丝（绊到即切出 Level 6.1）
      const r = mulberry(s.x * 71 + s.y * 29)
      grp.add(box(1.04, 0.012, 0.012, '#3a3d40', 0, 0.08, 0))
      for (const px of [-0.5, 0.5]) grp.add(box(0.035, 0.1, 0.035, '#2e3134', px, 0.05, 0))
      grp.rotation.y = r() < 0.5 ? 0 : Math.PI / 2
      break
    }
    case 'braille': {
      // 前人刻在墙上的方向记号：一排小凹块，比墙略深
      const d = wallDir(s, m)
      if (d === null) return null
      const r = mulberry(s.x * 37 + s.y * 53)
      const ink = col(_def.palette.wall).multiplyScalar(0.45).getHex()
      const mark = (s.data?.mark as number | undefined) ?? 0
      const bg = new THREE.Group()
      const n = 3 + (mark % 3)
      for (let row = 0; row <= (mark === 3 ? 1 : 0); row++)
        for (let i = 0; i < n; i++)
          bg.add(box(0.035, 0.035 + r() * 0.028, 0.014, ink, -0.03 * (n - 1) + i * 0.06, -row * 0.07, 0))
      faceMount(bg, d, 0.016, 1.32)
      grp.add(bg)
      break
    }

    // ===================== v23：Level 7「Thalassophobia」 =====================
    case 'bookcase': {
      // 入口房间的木质立柜（可能 1×3）：三层隔板 + 书脊色块
      const len = Math.max(s.w, s.h) * 0.92
      const bh = 2.0
      const wood = s.looted ? '#40301e' : '#5c4228'
      grp.add(box(len, bh, 0.42, wood, 0, bh / 2, 0))
      grp.add(box(len + 0.08, 0.07, 0.5, '#6a4a2e', 0, bh - 0.03, 0))
      grp.add(box(len + 0.08, 0.08, 0.5, '#6a4a2e', 0, 0.05, 0))
      const r = mulberry(s.x * 19 + s.y * 41)
      const spineC = ['#7a3a2e', '#3a4a6a', '#4a5a3a', '#6a5a2e', '#5a3a5a']
      for (let sh = 0; sh < 3; sh++) {
        const sy = 0.42 + sh * 0.53
        grp.add(box(len - 0.06, 0.05, 0.44, '#6a4a2e', 0, sy, 0.01)) // 隔板
        if (s.looted) continue // 已搜刮：书没了，只剩空隔板
        const nb = Math.max(3, Math.round(len / 0.36))
        for (let i = 0; i < nb; i++) {
          const bw = (len - 0.12) / nb
          grp.add(box(bw * 0.85, 0.3 + r() * 0.12, 0.26, spineC[Math.floor(r() * spineC.length)],
            -len / 2 + 0.06 + bw * (i + 0.5), sy + 0.2, 0.09))
        }
      }
      faceOutward(grp, s, m)
      break
    }
    case 'barrel': {
      // 木桶（装杏仁水）：竖立圆柱（竖纹木板贴图，looted 变暗）+ 两道桶箍
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.34, 0.88, 10),
        texLambert('barrel_wood', s.looted ? '#4a3420' : '#6a4a2e', '#3a2a18', s.looted ? '#8a7a68' : '#e8e2d2'),
      )
      body.position.set(0, 0.44, 0)
      grp.add(body)
      for (const hy of [0.24, 0.66]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.325, 0.03, 5, 12), new THREE.MeshLambertMaterial({ color: '#3a3a3c' }))
        hoop.rotation.x = Math.PI / 2
        hoop.position.y = hy
        grp.add(hoop)
      }
      const lid = cyl(0.29, 0.29, 0.05, '#5a3e26', 0, 0.9, 0, 10)
      if (s.looted) { lid.position.set(0.34, 0.03, 0.26); lid.rotation.z = 1.35 } // 已搜刮：桶盖掀在一旁
      grp.add(lid)
      break
    }
    case 'rockisle': {
      // 未知岩石构成的小岛标记：几块大小不一的旋转岩块
      const r = mulberry(s.x * 91 + s.y * 13)
      for (let i = 0; i < 4; i++) {
        const sz = 0.3 + r() * 0.55
        const rock = box(sz, sz * (0.5 + r() * 0.5), sz * (0.7 + r() * 0.6),
          i % 2 ? '#55606a' : '#49535c', (r() - 0.5) * 0.85, sz * 0.28, (r() - 0.5) * 0.85)
        rock.rotation.set((r() - 0.5) * 0.5, r() * Math.PI, (r() - 0.5) * 0.5)
        grp.add(rock)
      }
      break
    }
    case 'bonepile': {
      // 骨堆：散骨 + 一具「下颌异常增大、腿末端成鳍」的类人骨架
      const r = mulberry(s.x * 61 + s.y * 23)
      const bone = s.looted ? '#8c8a80' : '#cfcabb'
      for (let i = 0; i < 7; i++) {
        const b = box(0.05, 0.05, 0.26 + r() * 0.3, bone, (r() - 0.5) * 0.8, 0.05, (r() - 0.5) * 0.8)
        b.rotation.set(0, r() * Math.PI, (r() - 0.5) * 0.5)
        grp.add(b)
      }
      const sk = new THREE.Group()
      sk.position.set(0, 0, -0.12)
      sk.rotation.y = r() * Math.PI
      sk.add(box(0.2, 0.18, 0.22, bone, 0, 0.13, 0))          // 颅骨（小）
      sk.add(box(0.36, 0.18, 0.4, bone, 0, 0.06, 0.16))       // 夸张增大的下颌
      sk.add(box(0.05, 0.04, 0.03, '#141412', -0.055, 0.16, 0.11)) // 眼窝
      sk.add(box(0.05, 0.04, 0.03, '#141412', 0.055, 0.16, 0.11))
      for (const sgn of [-1, 1]) {
        sk.add(box(0.05, 0.05, 0.42, bone, sgn * 0.13, 0.05, -0.36))   // 腿骨
        sk.add(box(0.24, 0.03, 0.18, bone, sgn * 0.15, 0.03, -0.65))   // 末端成鳍
      }
      grp.add(sk)
      break
    }
    case 'fishbones': {
      // 不可理解的巨鱼骨架（3×2 瓦片）：一根长脊椎 + 两侧张开的十余根肋骨
      const bone = '#d2ccbb'
      const len = s.w * 0.92
      const y0 = 0.5
      const spine = cyl(0.06, 0.075, len, bone, 0, y0, 0, 6)
      spine.rotation.z = Math.PI / 2
      grp.add(spine)
      const n = 11
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1)
        const px = -len / 2 + 0.2 + t * (len - 0.5)
        const rl = (0.4 + Math.sin(Math.PI * (0.15 + t * 0.75)) * 0.6) * s.h * 0.55
        for (const sgn of [-1, 1]) {
          const ang = sgn * 1.95 // 向两侧张开并微微下垂
          const rib = cyl(0.022, 0.038, rl, bone, px, y0 + Math.cos(ang) * rl / 2, Math.sin(ang) * rl / 2, 5)
          rib.rotation.x = ang
          grp.add(rib)
        }
      }
      const skull = box(0.42, 0.36, 0.5, bone, -len / 2 - 0.16, y0 - 0.05, 0)
      grp.add(skull)
      grp.add(box(0.5, 0.14, 0.44, bone, -len / 2 - 0.3, y0 - 0.22, 0)) // 张开的颚
      grp.add(cyl(0.05, 0.05, 0.55, bone, len / 2 + 0.12, y0 + 0.16, 0, 5)) // 尾鳍骨
      break
    }
    case 'seatarpit': {
      // 深渊的焦油与岩石堆：黑色黏稠堆体 + 正在上升的小气泡
      const r = mulberry(s.x * 83 + s.y * 47)
      const tarMat = new THREE.MeshLambertMaterial({ color: '#0b0c0e' })
      for (let i = 0; i < 4; i++) {
        const rad = 0.4 + r() * 0.42
        const blob = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.5, rad, 0.12 + r() * 0.18, 6), tarMat)
        blob.position.set((r() - 0.5) * s.w * 0.6, 0.07, (r() - 0.5) * s.h * 0.6)
        blob.rotation.y = r() * Math.PI
        grp.add(blob)
      }
      for (let i = 0; i < 3; i++) {
        const rk = box(0.3 + r() * 0.3, 0.22 + r() * 0.2, 0.3 + r() * 0.3, '#3a3f44',
          (r() - 0.5) * s.w * 0.7, 0.12, (r() - 0.5) * s.h * 0.7)
        rk.rotation.y = r() * Math.PI
        grp.add(rk)
      }
      if (s.data?.bubbles) {
        const bubMat = new THREE.MeshLambertMaterial({ color: '#1e2226' })
        for (let i = 0; i < 6; i++) {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.04 + r() * 0.05, 6, 4), bubMat)
          b.position.set((r() - 0.5) * s.w * 0.6, 0.18 + r() * 0.5, (r() - 0.5) * s.h * 0.6)
          grp.add(b)
        }
      }
      break
    }

    // ===================== v23：Level 8「Cave Systems」 =====================
    case 'stalagspike': {
      // 岩刺：3–5 根圆锥从各个角度混乱地向外突出；knot 决定形状
      const knot = (s.data?.knot as number | undefined) ?? 0
      const r = mulberry(s.x * 113 + s.y * 67)
      const rock = '#6a6250'
      const n = 3 + Math.floor(r() * 3)
      for (let i = 0; i < n; i++) {
        const len = 0.45 + r() * 0.8
        const rad = 0.06 + r() * 0.07
        const sp = new THREE.Group()
        if (knot === 1) {
          // 打结：两段折角
          const seg = len * 0.55
          sp.add(cyl(rad * 0.62, rad, seg, rock, 0, seg / 2, 0, 6))
          const bend = new THREE.Group()
          bend.position.y = seg
          bend.rotation.z = 0.9 + r() * 0.7
          bend.add(cyl(0.004, rad * 0.62, seg, rock, 0, seg / 2, 0, 6))
          sp.add(bend)
        } else if (knot === 2) {
          // 锯齿：多段递减
          let y = 0, rr = rad
          for (let k = 0; k < 4; k++) {
            const sl = len * (0.34 - k * 0.06)
            sp.add(cyl(rr * 0.55, rr, sl, rock, 0, y + sl / 2, 0, 6))
            y += sl * 0.92
            rr *= 0.66
          }
          const tip = new THREE.Mesh(new THREE.ConeGeometry(rr, len * 0.2, 5), new THREE.MeshLambertMaterial({ color: rock }))
          tip.position.y = y + len * 0.1
          sp.add(tip)
        } else if (knot === 3) {
          // 末端分叉成多个尖点
          const stem = len * 0.55
          sp.add(cyl(rad * 0.7, rad, stem, rock, 0, stem / 2, 0, 6))
          for (let k = 0; k < 3; k++) {
            const fork = new THREE.Group()
            fork.position.y = stem
            fork.rotation.y = (k / 3) * Math.PI * 2 + r()
            fork.rotation.z = 0.4 + r() * 0.25
            const fc = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.5, len * 0.55, 5), new THREE.MeshLambertMaterial({ color: rock }))
            fc.position.y = len * 0.28
            fork.add(fc)
            sp.add(fork)
          }
        } else {
          // 直刺
          const c = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 6), new THREE.MeshLambertMaterial({ color: rock }))
          c.position.y = len / 2
          sp.add(c)
        }
        // 混乱朝向：绕 Y 随机转向 + 绕 Z 倾斜（部分从高处的洞壁横着长出来）
        const dir = new THREE.Group()
        dir.rotation.y = r() * Math.PI * 2
        sp.rotation.z = 0.15 + r() * 1.4
        dir.add(sp)
        dir.position.set((r() - 0.5) * 0.7, r() < 0.5 ? 0.02 : 0.3 + r() * 1.5, (r() - 0.5) * 0.7)
        grp.add(dir)
      }
      break
    }
    case 'handspike': {
      // Handyland 的手形岩刺：一只石质人手从地面伸出；moss 时包一层血红色发光苔藓
      const moss = !!s.data?.moss
      const stone = moss ? '#6a4a46' : '#6a6250'
      const part = (w2: number, h2: number, d2: number, x: number, y: number, z: number) => {
        const b = box(w2, h2, d2, stone, x, y, z)
        if (moss) emit(b, '#c0231c', 0.7)
        return b
      }
      const hand = new THREE.Group()
      hand.rotation.y = mulberry(s.x * 149 + s.y * 31)() * Math.PI * 2
      hand.add(part(0.17, 0.52, 0.17, 0, 0.26, 0))   // 从地里伸出的腕/前臂
      hand.add(part(0.3, 0.34, 0.14, 0, 0.66, 0))    // 掌
      for (let f = 0; f < 4; f++) {                  // 四指，指节分明（两节）
        const fx = -0.105 + f * 0.07
        const l1 = f === 1 || f === 2 ? 0.19 : 0.15
        hand.add(part(0.055, l1, 0.062, fx, 0.83 + l1 / 2, 0.008))
        hand.add(part(0.048, l1 * 0.8, 0.056, fx, 0.85 + l1 * 1.4, 0.028))
      }
      const thumb = new THREE.Group()                // 拇指斜向外
      thumb.position.set(0.16, 0.7, 0.02)
      thumb.rotation.z = -0.95
      thumb.add(part(0.058, 0.16, 0.062, 0, 0.08, 0))
      thumb.add(part(0.05, 0.13, 0.056, 0, 0.22, 0.01))
      hand.add(thumb)
      grp.add(hand)
      // 手根部的岩基
      grp.add(box(0.42, 0.16, 0.38, '#5c5546', 0, 0.07, 0))
      break
    }
    case 'glowshroom': {
      // Rottnest Jungle 的生物发光蘑菇：tall 时能长到小树大小
      const hues = ['#66e0d0', '#e066c8', '#c8e066', '#66a8e0', '#e0a066', '#a066e0']
      const hue = hues[Math.min(hues.length - 1, Math.max(0, (s.data?.hue as number | undefined) ?? 0))]
      const tall = !!s.data?.tall
      const r = mulberry(s.x * 167 + s.y * 73)
      const hgt = tall ? 2.2 : 0.5 + r() * 0.35
      const k = tall ? 1 : 0.42
      grp.add(cyl(0.07 * k * 1.4, 0.11 * k * 1.4, hgt, '#ddd6c0', 0, hgt / 2, 0, 7)) // 菌柄
      const capR = tall ? 0.62 : 0.24
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(capR, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: hue }),
      )
      cap.position.y = hgt - 0.02
      cap.scale.y = 0.8
      grp.add(cap)
      grp.add(cyl(capR * 0.92, capR * 0.55, 0.07, '#8a8272', 0, hgt - 0.05, 0, 10)) // 菌褶
      if (tall) for (let i = 0; i < 2; i++) { // 大株带几朵小的
        const sm = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: hue }))
        const px = (r() - 0.5) * 0.7, pz = (r() - 0.5) * 0.7
        grp.add(cyl(0.03, 0.045, 0.3, '#ddd6c0', px, 0.15, pz, 6))
        sm.position.set(px, 0.3, pz)
        grp.add(sm)
      }
      break
    }
    case 'tarhands': {
      // 焦油之手：95°C 的焦油池 + 2–3 条覆满焦油的手臂伸出来
      const r = mulberry(s.x * 143 + s.y * 91)
      const tarMat = new THREE.MeshLambertMaterial({ color: '#0d0c0e' })
      tarMat.emissive = col('#2a0d04') // 轻微暖色余温
      tarMat.emissiveIntensity = 0.4
      const pool = new THREE.Mesh(new THREE.CylinderGeometry(s.w * 0.44, s.w * 0.5, 0.1, 10), tarMat)
      pool.position.y = 0.05
      grp.add(pool)
      const n = 2 + Math.floor(r() * 2)
      for (let i = 0; i < n; i++) {
        const arm = new THREE.Group()
        arm.position.set((r() - 0.5) * s.w * 0.55, 0.06, (r() - 0.5) * s.h * 0.55)
        arm.rotation.y = r() * Math.PI * 2
        const l1 = 0.5 + r() * 0.35
        const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.105, l1, 7), tarMat)
        upper.position.set(0, l1 / 2, 0)
        upper.rotation.z = 0.2
        arm.add(upper)
        const fore = new THREE.Group() // 弯曲的肢体
        fore.position.set(-0.1 * l1, l1 * 0.95, 0)
        fore.rotation.z = -0.8
        const l2 = 0.4 + r() * 0.25
        const f2 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.078, l2, 7), tarMat)
        f2.position.y = l2 / 2
        fore.add(f2)
        const palm = new THREE.Group()
        palm.position.y = l2 + 0.04
        palm.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.075), tarMat))
        for (let f = 0; f < 3; f++) {
          const fg = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.14, 0.038), tarMat)
          fg.position.set(-0.048 + f * 0.048, 0.12, 0)
          fg.rotation.z = (f - 1) * 0.3
          palm.add(fg)
        }
        fore.add(palm)
        arm.add(fore)
        grp.add(arm)
      }
      break
    }
    case 'roadsign': {
      // 第九之路路标：杆 + 方牌 + M.E.G. 标志
      grp.add(cyl(0.035, 0.045, 2.0, '#7a7570', 0, 1.0, 0, 6))
      const bd = new THREE.Group()
      bd.position.y = 1.72
      bd.add(box(0.66, 0.5, 0.05, '#d8d2c4', 0, 0, 0))
      for (const zz of [0.031, -0.031]) { // 双面
        const em = megEmblem(0.15, '#2e4a6a')
        em.position.set(-0.19, 0, zz)
        if (zz < 0) em.rotation.y = Math.PI
        bd.add(em)
        for (let i = 0; i < 3; i++) {
          const bar = box(0.3, 0.035, 0.012, '#3a3a3c', 0.11, 0.11 - i * 0.1, zz)
          bd.add(bar)
        }
      }
      grp.add(bd)
      break
    }
    case 'campstall': {
      // Hollow Nest 营地摊位：木台 + 顶棚布 + 补给箱 + 一盏小灯
      const w2 = s.w * 0.9, d2 = s.h * 0.85
      grp.add(box(w2, 0.1, d2, '#6a4a2e', 0, 0.85, 0))
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const)
        grp.add(box(0.08, 0.85, 0.08, '#4a3420', px * w2 * 0.44, 0.42, pz * d2 * 0.4))
      for (const px of [-1, 1]) {
        grp.add(box(0.07, 2.0, 0.07, '#4a3420', px * w2 * 0.46, 1.0, -d2 * 0.42))
        grp.add(box(0.07, 1.72, 0.07, '#4a3420', px * w2 * 0.46, 0.86, d2 * 0.42))
      }
      const canopy = new THREE.Mesh(
        new THREE.PlaneGeometry(w2 + 0.3, d2 + 0.45),
        new THREE.MeshLambertMaterial({ color: '#8a5a3a', side: THREE.DoubleSide }),
      )
      canopy.rotation.x = -Math.PI / 2 + 0.3
      canopy.position.set(0, 1.86, 0.02)
      grp.add(canopy)
      grp.add(box(0.32, 0.28, 0.3, s.looted ? '#3a4429' : '#4d5a33', -w2 * 0.26, 1.04, 0))
      grp.add(box(0.26, 0.24, 0.26, '#5a4030', w2 * 0.22, 1.02, -0.06))
      grp.add(box(0.2, 0.07, 0.28, '#8a8578', w2 * 0.02, 0.94, d2 * 0.22))
      grp.add(glow(0.11, 0.11, 0.11, '#ffcf8a', 0, 1.66, d2 * 0.3))
      break
    }

    // ===================== v23：Level 9「The Suburbs」 =====================
    case 'house': {
      // 郊区房屋标记（非实心）：只补一个双坡屋顶，房屋主体由地图的墙构成
      const roof = gableRoof(s.w, s.h, Math.min(1.9, Math.min(s.w, s.h) * 0.3), '#2e2c30', '#3a3630')
      roof.position.y = H
      grp.add(roof)
      grp.add(box(s.w + 0.35, 0.16, s.h + 0.35, '#3a3630', 0, H - 0.06, 0)) // 檐口
      break
    }
    case 'streetlamp': {
      // 路灯：mode 0=熄灭 1=闪烁 2=常亮
      const mode = (s.data?.mode as number | undefined) ?? 0
      grp.add(cyl(0.055, 0.09, 4.0, '#3a3d40', 0, 2.0, 0, 6))
      grp.add(box(0.5, 0.07, 0.07, '#3a3d40', 0.23, 3.96, 0)) // 弯臂
      grp.add(cyl(0.13, 0.24, 0.17, '#4a4d50', 0.46, 3.86, 0, 8)) // 灯罩
      if (mode === 0) grp.add(box(0.21, 0.04, 0.21, '#33342f', 0.46, 3.77, 0))
      else grp.add(glow(0.22, 0.05, 0.22, mode === 2 ? '#ffcf8a' : '#96703c', 0.46, 3.76, 0))
      break
    }
    case 'mailbox': {
      // 信箱：立柱 + 圆顶盒 + 小红旗
      const body = s.looted ? '#454b51' : '#5d6167'
      grp.add(box(0.09, 0.95, 0.09, '#4a3a2a', 0, 0.48, 0))
      const dome = cyl(0.16, 0.16, 0.44, body, 0, 1.09, 0, 10)
      dome.rotation.x = Math.PI / 2 // 圆顶沿前后方向躺倒
      grp.add(dome)
      grp.add(box(0.31, 0.14, 0.44, body, 0, 1.0, 0))
      const door = box(0.29, 0.2, 0.03, '#6a6f76', 0, 1.04, 0.22)
      if (s.looted) { door.position.set(0, 0.95, 0.34); door.rotation.x = 1.3 } // 已搜刮：箱门垂开
      grp.add(door)
      grp.add(box(0.022, 0.24, 0.022, '#8a8a8a', 0.18, 1.2, -0.06)) // 旗杆
      grp.add(box(0.02, 0.12, 0.14, '#c0231c', 0.18, 1.26, 0.02))   // 小红旗
      break
    }
    case 'picketfence': {
      // 白色尖桩栅栏（非实心，约 1.0m）：4 根竖条 + 2 根横档
      const parts: { g: THREE.BufferGeometry; c: string }[] = []
      const white = '#d8d2c4'
      for (let i = 0; i < 4; i++) {
        const px = -0.42 + i * 0.28
        parts.push({ g: new THREE.BoxGeometry(0.09, 0.92, 0.045).translate(px, 0.46, 0), c: white })
        parts.push({ g: new THREE.BoxGeometry(0.075, 0.09, 0.045).translate(px, 0.955, 0), c: white }) // 尖头
      }
      parts.push({ g: new THREE.BoxGeometry(1.0, 0.07, 0.03).translate(0, 0.34, 0.01), c: '#cbc5b6' })
      parts.push({ g: new THREE.BoxGeometry(1.0, 0.07, 0.03).translate(0, 0.72, 0.01), c: '#cbc5b6' })
      grp.add(mergedMesh(parts))
      break
    }
    case 'clipfuse': {
      // 「卡模」双子屋：两块墙体以不同角度互相嵌入（物理上不可能的嵌套）
      const ch = Math.max(2.6, H)
      const a = box(2.0, ch, 1.5, _def.palette.wall, -0.1, ch / 2, 0)
      a.rotation.y = 0.22
      grp.add(a)
      const b = box(1.7, ch * 0.92, 1.9, col(_def.palette.wallTop).multiplyScalar(0.72).getHex(), 0.3, ch * 0.47, 0.2)
      b.rotation.y = -0.78
      grp.add(b)
      const rf = box(1.8, 0.16, 1.7, '#2e2c30', -0.15, ch * 0.9, -0.1) // 互相穿插的屋顶片
      rf.rotation.set(0.32, 0.5, 0.16)
      grp.add(rf)
      const rf2 = box(1.5, 0.16, 1.6, '#3a3630', 0.35, ch * 0.72, 0.35)
      rf2.rotation.set(-0.4, -0.8, -0.2)
      grp.add(rf2)
      grp.add(box(0.9, 1.1, 0.08, '#101216', 0.42, 0.55, 0.86)) // 卡进另一栋里的窗洞
      break
    }
    case 'playpipe': {
      // 游乐场管道：彩色塑料管，内部发白光（→ Level 283）
      const R = 0.66, L = 1.75
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(R, R, L, 12, 1, true),
        new THREE.MeshLambertMaterial({ color: '#c8452e', side: THREE.DoubleSide }),
      )
      tube.rotation.z = Math.PI / 2
      tube.position.y = R + 0.06
      grp.add(tube)
      for (const sgn of [-1, 1]) {
        const mouth = new THREE.Mesh(
          new THREE.CircleGeometry(R * 0.9, 12),
          new THREE.MeshBasicMaterial({ color: '#f2f4ee', side: THREE.DoubleSide }),
        )
        mouth.position.set(sgn * (L / 2 - 0.06), R + 0.06, 0)
        mouth.rotation.y = sgn * Math.PI / 2
        grp.add(mouth)
        const ring = cyl(R + 0.07, R + 0.07, 0.11, '#e0a13a', sgn * (L / 2 - 0.05), R + 0.06, 0, 12)
        ring.rotation.z = Math.PI / 2
        grp.add(ring)
      }
      for (const px of [-0.55, 0.55]) grp.add(box(0.12, R + 0.06, 0.5, '#3a6a8a', px, (R + 0.06) / 2, 0)) // 支座
      break
    }

    // ===================== v23：Level 10「Bumper Crop」 =====================
    case 'wheatpatch': {
      // 麦丛：一束略微随机倾斜的麦秆 + 穗头（barley 偏浅）
      const r = mulberry(s.x * 29 + s.y * 131)
      const barley = !!s.data?.barley
      const stalkC = barley ? '#d8c87a' : '#c8b45a'
      const headC = barley ? '#e6dca4' : '#d6bf62'
      const parts: { g: THREE.BufferGeometry; c: string }[] = []
      const n = 5 + Math.floor(r() * 4)
      for (let i = 0; i < n; i++) {
        const hgt = 0.82 + r() * 0.34
        const px = (r() - 0.5) * 0.78, pz = (r() - 0.5) * 0.78
        const tz = (r() - 0.5) * 0.28, tx = (r() - 0.5) * 0.28
        const st = new THREE.BoxGeometry(0.032, hgt, 0.032).translate(0, hgt / 2, 0)
        st.rotateZ(tz); st.rotateX(tx); st.translate(px, 0, pz)
        parts.push({ g: st, c: stalkC })
        const hd = new THREE.BoxGeometry(0.072, 0.24, 0.072).translate(0, hgt + 0.09, 0)
        hd.rotateZ(tz); hd.rotateX(tx); hd.translate(px, 0, pz)
        parts.push({ g: hd, c: headC })
      }
      grp.add(mergedMesh(parts))
      break
    }
    case 'hedgerow': {
      // 树篱：高度恒定 1.6m（设定：树木与灌木始终保持同一高度），表面做一点凹凸
      const r = mulberry(s.x * 53 + s.y * 97)
      const parts: { g: THREE.BufferGeometry; c: string }[] = [
        { g: new THREE.BoxGeometry(1.0, 1.6, 0.92).translate(0, 0.8, 0), c: '#34432c' },
      ]
      for (let i = 0; i < 5; i++) {
        const sz = 0.22 + r() * 0.26
        parts.push({
          g: new THREE.BoxGeometry(sz, sz, sz)
            .rotateY(r() * Math.PI)
            .translate((r() - 0.5) * 0.9, 0.3 + r() * 1.35, (r() - 0.5) * 0.85),
          c: i % 2 ? '#3d4d33' : '#2b3824',
        })
      }
      grp.add(mergedMesh(parts))
      break
    }
    case 'barn': {
      // 谷仓标记（非实心）：双坡红色屋顶 + 山墙面
      const roof = gableRoof(s.w, s.h, Math.min(2.2, Math.min(s.w, s.h) * 0.34), '#7a3a2e', '#8c4433')
      roof.position.y = H
      grp.add(roof)
      grp.add(box(s.w + 0.3, 0.18, s.h + 0.3, '#5e2c23', 0, H - 0.07, 0))
      break
    }
    case 'canolaplot': {
      // 油菜地块：刺眼的亮黄花丛（自发光材质，在阴天铅灰里格外扎眼）
      const r = mulberry(s.x * 197 + s.y * 41)
      const parts: { g: THREE.BufferGeometry; c: string }[] = []
      const n = 9
      for (let i = 0; i < n; i++) {
        const hgt = 0.5 + r() * 0.22
        const px = (r() - 0.5) * 0.86, pz = (r() - 0.5) * 0.86
        parts.push({ g: new THREE.BoxGeometry(0.03, hgt, 0.03).translate(px, hgt / 2, pz), c: '#8a9a3a' })
        parts.push({ g: new THREE.BoxGeometry(0.15, 0.16, 0.15).translate(px, hgt + 0.06, pz), c: '#e8d34a' })
      }
      grp.add(mergedMesh(parts, true))
      break
    }

    // ===================== v23：Level 11「The City That Never Sleeps」 =====================
    case 'towerblock': {
      // 混凝土峭壁般的楼体（非实心标记，体量极大 → 只用 2 个 mesh：立面盒 + 屋顶板）。
      // 从墙顶 H 起算，底层由地图墙体本身构成，可进入的街区不会被这块体量堵死。
      const floors = (s.data?.floors as number | undefined) ?? 4
      const top = Math.max(H + 3, floors * 3)
      const body = towerBox(s.w + 0.1, top - H, s.h + 0.1, '#6a6d72')
      body.position.y = H + (top - H) / 2
      grp.add(body)
      grp.add(box(s.w + 0.4, 0.45, s.h + 0.4, '#565a5f', 0, top + 0.2, 0)) // 女儿墙/屋顶板
      break
    }
    case 'blackwindow': {
      // 黑色镀膜镜面窗：只反射不透视。窗可能落在墙瓦片上（朝开阔侧朝外贴），
      // 也可能落在街面瓦片上（朝最近的墙贴）。
      const tx = Math.floor(s.x + s.w / 2), ty = Math.floor(s.y + s.h / 2)
      const onWall = m.tiles[ty * m.w + tx] !== 1
      const dirs = onWall ? neighborDirs(s, m, true) : neighborDirs(s, m, false)
      const use = dirs.length ? dirs.slice(0, 2) : [buildingDir(s, m)]
      const glassMat = new THREE.MeshPhongMaterial({ color: '#14171c', specular: '#7c8b9a', shininess: 96 })
      for (const d of use) {
        const wg = new THREE.Group()
        wg.add(box(0.92, 1.5, 0.05, '#2c3036', 0, 0, 0)) // 细窗框
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.38, 0.03), glassMat)
        glass.position.z = 0.03
        wg.add(glass)
        wg.add(box(0.92, 0.05, 0.07, '#3a3f46', 0, -0.75, 0.02)) // 窗台
        faceMount(wg, d, 0.03, 2.1, 0, onWall)
        grp.add(wg)
      }
      break
    }
    case 'shopfront': {
      // 店招：横向招牌板 + 上方一排小灯（sign 0–6 对应不同店铺配色）
      const sign = Math.min(6, Math.max(0, (s.data?.sign as number | undefined) ?? 0))
      // 0 Mr. Holloway's Grand Exhibit / 1 Frivolous Frank's / 2 Fun Zone / 3 Caspian's Antiques
      // 4 Papa Pedro's Pizza / 5 商场 / 6 医院
      const bg = ['#3a1e5a', '#b8322c', '#1f7a6a', '#2a3a2c', '#a8261e', '#2a4a7a', '#e8ecec'][sign]
      const ink = ['#e8c46a', '#f0e8dc', '#e85aa8', '#cbb37a', '#f2ead6', '#e6ecf2', '#c0231c'][sign]
      const d = buildingDir(s, m)
      const sg = new THREE.Group()
      sg.add(box(0.98, 0.46, 0.1, bg, 0, 0, 0))
      sg.add(box(1.02, 0.05, 0.12, ink, 0, 0.23, 0))   // 上下描边
      sg.add(box(1.02, 0.05, 0.12, ink, 0, -0.23, 0))
      if (sign === 6) { // 医院：红十字
        sg.add(box(0.26, 0.08, 0.02, ink, 0, 0, 0.06))
        sg.add(box(0.08, 0.26, 0.02, ink, 0, 0, 0.06))
      } else {
        for (let i = 0; i < 3; i++) sg.add(box(0.18 + i * 0.1, 0.07, 0.02, ink, -0.28 + i * 0.16, 0.08 - i * 0.11, 0.06)) // 字块
      }
      for (let i = 0; i < 4; i++) sg.add(glow(0.07, 0.07, 0.07, '#ffe6b8', -0.36 + i * 0.24, 0.34, 0.04)) // 招牌灯
      faceMount(sg, d, 0.08, 2.75)
      grp.add(sg)
      break
    }
    case 'subwayent': {
      // 地铁入口：围栏 + 指示牌 + 向下的黑色开口
      const lineC = ['#c0231c', '#2a6fd8', '#3f8f4a', '#d8a02a', '#8a4ac8'][Math.min(4, Math.max(0, (s.data?.line as number | undefined) ?? 0))]
      const w2 = s.w * 0.92, d2 = s.h * 0.92
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(w2 * 0.72, d2 * 0.66), new THREE.MeshBasicMaterial({ color: '#050506' }))
      hole.rotation.x = -Math.PI / 2
      hole.position.y = 0.02
      grp.add(hole)
      for (let i = 0; i < 2; i++) grp.add(box(w2 * 0.7, 0.06, 0.14, '#5a5d62', 0, 0.03 - i * 0.03, -d2 * 0.3 + i * 0.15)) // 露出的头两级台阶
      for (const sgn of [-1, 1]) { // 两侧围栏
        for (const px of [-w2 * 0.38, 0, w2 * 0.38]) grp.add(box(0.06, 1.0, 0.06, '#4a4d52', px, 0.5, sgn * d2 * 0.36))
        grp.add(box(w2 * 0.84, 0.07, 0.07, '#5a5d62', 0, 0.98, sgn * d2 * 0.36))
        grp.add(box(w2 * 0.84, 0.05, 0.05, '#4a4d52', 0, 0.6, sgn * d2 * 0.36))
      }
      const pole = cyl(0.04, 0.04, 2.3, '#5a5d62', -w2 * 0.46, 1.15, d2 * 0.36, 6)
      grp.add(pole)
      const plate = box(0.5, 0.34, 0.04, '#1c1f24', -w2 * 0.46, 2.2, d2 * 0.36)
      grp.add(plate)
      const disc = cyl(0.11, 0.11, 0.02, lineC, -w2 * 0.46, 2.2, d2 * 0.36 + 0.03, 10)
      disc.rotation.x = Math.PI / 2
      grp.add(disc)
      break
    }
    case 'arcadecab': {
      // 街机柜：柜体 + 倾斜屏幕 + 控制台 + 两个按钮（任何交互都会送你去 Level 25）
      grp.add(box(0.64, 1.5, 0.62, '#2a2d38', 0, 0.75, 0))
      grp.add(box(0.68, 0.12, 0.66, '#1c1e26', 0, 1.56, 0))
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.4), new THREE.MeshBasicMaterial({ color: '#2ad8d8' }))
      scr.position.set(0, 1.19, 0.3)
      scr.rotation.x = -0.32
      grp.add(scr)
      grp.add(box(0.5, 0.36, 0.04, '#14161c', 0, 1.19, 0.28))
      const ctl = box(0.6, 0.08, 0.32, '#3a3f4a', 0, 0.94, 0.33)
      ctl.rotation.x = 0.2
      grp.add(ctl)
      grp.add(glow(0.07, 0.05, 0.07, '#e04a3a', -0.12, 1.0, 0.36))
      grp.add(glow(0.07, 0.05, 0.07, '#e8d34a', 0.05, 1.0, 0.36))
      grp.add(box(0.03, 0.16, 0.03, '#c9c2a8', -0.24, 1.05, 0.34)) // 摇杆
      for (const px of [-0.33, 0.33]) grp.add(glow(0.02, 1.1, 0.02, '#e85aa8', px, 0.85, 0.3))
      faceOutward(grp, s, m)
      break
    }
    case 'megsign': {
      // M.E.G. 路牌：与 roadsign 同风格但更现代（金属杆 + 蓝底白字牌 + 徽记）
      grp.add(cyl(0.045, 0.05, 2.6, '#9aa0a8', 0, 1.3, 0, 8))
      grp.add(cyl(0.11, 0.13, 0.1, '#7a8088', 0, 0.05, 0, 8))
      const bd = new THREE.Group()
      bd.position.y = 2.25
      bd.add(box(0.98, 0.44, 0.05, '#1e3f78', 0, 0, 0))
      bd.add(box(1.02, 0.05, 0.06, '#dfe6ee', 0, 0.21, 0))
      bd.add(box(1.02, 0.05, 0.06, '#dfe6ee', 0, -0.21, 0))
      for (const zz of [0.031, -0.031]) {
        const em = megEmblem(0.14, '#dfe6ee')
        em.position.set(-0.33, 0, zz)
        if (zz < 0) em.rotation.y = Math.PI
        bd.add(em)
        for (let i = 0; i < 2; i++) bd.add(box(0.44 - i * 0.12, 0.06, 0.012, '#dfe6ee', -0.02 + i * 0.06, 0.07 - i * 0.14, zz))
      }
      grp.add(bd)
      break
    }

    // ===================== v23：Level 601「The End」 =====================
    case 'libshelf': {
      // 现代图书馆书架（双面）：整架合并成 1 个 drawcall——本层要铺上千个
      const r = mulberry(s.x * 211 + s.y * 17)
      const wood = '#8a6a3a'
      const shelfH = 2.4
      const parts: { g: THREE.BufferGeometry; c: string }[] = [
        { g: new THREE.BoxGeometry(1.0, shelfH, 0.12).translate(0, shelfH / 2, 0), c: wood }, // 背板
        { g: new THREE.BoxGeometry(0.08, shelfH, 0.56).translate(-0.46, shelfH / 2, 0), c: wood },
        { g: new THREE.BoxGeometry(0.08, shelfH, 0.56).translate(0.46, shelfH / 2, 0), c: wood },
        { g: new THREE.BoxGeometry(1.0, 0.07, 0.58).translate(0, shelfH - 0.03, 0), c: '#6f5430' },
        { g: new THREE.BoxGeometry(1.0, 0.09, 0.58).translate(0, 0.05, 0), c: '#6f5430' },
      ]
      const spineC = ['#7a3a2e', '#3a4a6a', '#44543a', '#6a5a2e', '#5a3a5a', '#2e3a44']
      for (let tier = 0; tier < 3; tier++) {
        const sy = 0.5 + tier * 0.62
        parts.push({ g: new THREE.BoxGeometry(0.92, 0.05, 0.56).translate(0, sy, 0), c: '#6f5430' })
        for (const zz of [-0.18, 0.18]) // 双面书脊
          for (let i = 0; i < 4; i++)
            parts.push({
              g: new THREE.BoxGeometry(0.19, 0.34 + r() * 0.12, 0.2).translate(-0.33 + i * 0.22, sy + 0.22, zz),
              c: spineC[Math.floor(r() * spineC.length)],
            })
      }
      grp.add(mergedMesh(parts))
      // v48 缺省朝向：背贴最近墙、架面朝外（双面书架）；L601 阵列排（data.row）保持阵列朝向不转，
      // data.deg 可显式覆盖
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else if (!s.data?.row) faceOutward(grp, s, m)
      break
    }
    case 'endletters': {
      // 中央金属字母「the end is near」：一排高矮不一的窄立方体沿 x 铺开
      const r = mulberry(s.x * 233 + s.y * 89)
      const span = s.w * 0.94
      const mat = new THREE.MeshPhongMaterial({ color: '#9aa0a8', specular: '#dfe6ee', shininess: 64 })
      const n = 14
      for (let i = 0; i < n; i++) {
        const lw = 0.16 + r() * 0.14
        const lh = 0.6 + r() * 1.0
        const gap = i === 3 || i === 7 || i === 10 ? 0.12 : 0 // 词间留白
        const lm = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, 0.14), mat)
        lm.position.set(-span / 2 + 0.2 + (i / (n - 1)) * (span - 0.4) + gap, lh / 2, (r() - 0.5) * 0.12)
        lm.rotation.y = (r() - 0.5) * 0.1
        grp.add(lm)
      }
      grp.add(box(span, 0.1, 0.55, '#54585e', 0, 0.05, 0)) // 底座
      break
    }
    case 'homedoor': {
      // 「家门」：普通住宅前门 + 半圆气窗，门缝底下透着暖黄的光
      grp.add(box(0.16, 2.25, 0.28, '#6a625a', -0.56, 1.12, 0)) // 门框
      grp.add(box(0.16, 2.25, 0.28, '#6a625a', 0.56, 1.12, 0))
      grp.add(box(1.28, 0.16, 0.28, '#6a625a', 0, 2.32, 0))
      grp.add(box(0.98, 2.1, 0.09, '#6a4326', 0, 1.05, 0))      // 木门板
      grp.add(box(0.62, 0.72, 0.02, '#553318', 0, 1.55, 0.055)) // 门芯嵌板
      grp.add(box(0.62, 0.52, 0.02, '#553318', 0, 0.72, 0.055))
      grp.add(glow(0.06, 0.06, 0.06, '#c9a24a', 0.34, 1.05, 0.09)) // 门把手
      const transom = new THREE.Mesh(
        new THREE.CircleGeometry(0.46, 12, 0, Math.PI),
        new THREE.MeshBasicMaterial({ color: '#ffcf8a', side: THREE.DoubleSide }),
      )
      transom.position.set(0, 2.18, 0.05)
      grp.add(transom)
      grp.add(box(1.02, 0.1, 0.14, '#6a625a', 0, 2.12, 0.02))
      grp.add(glow(0.92, 0.045, 0.16, '#ffcf8a', 0, 0.035, 0.06)) // 门缝底下的暖黄光
      break
    }

    // ===================== v23：通用新容器（均带「已搜刮」视觉变化）=====================
    case 'locker': {
      // 储物柜：竖直金属柜（金属贴图，looted 变暗）+ 通风百叶 + 把手
      const metalMat = texLambert('locker_metal', s.looted ? '#3f464b' : '#5a636a', '#394046', s.looted ? '#7a8288' : '#e8eaec')
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.64, 1.9, 0.46), metalMat)
      body.position.set(0, 0.95, 0)
      grp.add(body)
      grp.add(box(0.68, 0.07, 0.5, '#4a5259', 0, 1.92, 0))
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.82, 0.05), texLambert('locker_metal', s.looted ? '#485057' : '#646d75', '#394046', s.looted ? '#868e94' : '#f0f2f4'))
      door.geometry.translate(0.29, 0.95, 0) // 铰链在左缘
      door.position.set(-0.29, 0.02, 0.235)
      if (s.looted) door.rotation.y = -1.2 // 已搜刮：柜门半开
      grp.add(door)
      for (let i = 0; i < 4; i++) door.add(box(0.3, 0.022, 0.02, '#394046', 0.29, 1.44 + i * 0.08, 0.032)) // 百叶
      door.add(box(0.05, 0.2, 0.045, '#c9c2a8', 0.51, 0.9, 0.04)) // 把手
      faceOutward(grp, s, m)
      break
    }
    case 'toolbox': {
      // 工具箱：红色金属箱 + 提手
      const red = s.looted ? '#6f2a22' : '#a63a2e'
      grp.add(box(0.58, 0.26, 0.3, red, 0, 0.13, 0))
      const lid = box(0.58, 0.16, 0.3, s.looted ? '#7d2f26' : '#b84434', 0, 0.34, 0)
      if (s.looted) { lid.position.set(0, 0.3, -0.26); lid.rotation.x = -1.1 } // 已搜刮：箱盖后翻
      grp.add(lid)
      grp.add(box(0.6, 0.03, 0.32, '#3a3d42', 0, 0.26, 0))
      grp.add(box(0.2, 0.03, 0.03, '#c9c2a8', 0, 0.47, 0))       // 提手
      for (const px of [-0.08, 0.08]) grp.add(box(0.03, 0.1, 0.03, '#c9c2a8', px, 0.43, 0))
      break
    }
    case 'suitcase': {
      // 行李箱：卧倒的皮箱 + 两条搭扣带
      const skin = s.looted ? '#3e2b20' : '#5a4030'
      grp.add(box(0.74, 0.2, 0.5, skin, 0, 0.1, 0))
      const lid = box(0.74, 0.14, 0.5, s.looted ? '#4a3426' : '#6a4c38', 0, 0.27, 0)
      if (s.looted) { lid.geometry.translate(0, 0, 0.25); lid.position.set(0, 0.2, -0.25); lid.rotation.x = -1.5 }
      grp.add(lid)
      for (const px of [-0.2, 0.2]) {
        grp.add(box(0.08, 0.22, 0.52, '#3a2a1e', px, 0.11, 0))     // 搭扣带
        grp.add(box(0.1, 0.06, 0.06, '#c9a24a', px, 0.14, 0.26))   // 扣件
      }
      grp.add(box(0.22, 0.05, 0.05, '#3a2a1e', 0, 0.36, 0))        // 提把
      break
    }
    case 'fridge': {
      // 冰箱：白色双门（上小下大）+ 竖直把手
      const body = s.looted ? '#9a9a95' : '#c9c9c4'
      grp.add(box(0.8, 1.75, 0.7, body, 0, 0.875, 0))
      const top = box(0.76, 0.52, 0.06, s.looted ? '#a8a8a2' : '#d6d6d0', 0, 0, 0)
      top.geometry.translate(0.38, 0, 0)
      top.position.set(-0.38, 1.44, 0.36)
      const low = box(0.76, 1.14, 0.06, s.looted ? '#a8a8a2' : '#d6d6d0', 0, 0, 0)
      low.geometry.translate(0.38, 0, 0)
      low.position.set(-0.38, 0.6, 0.36)
      if (s.looted) { top.rotation.y = -1.1; low.rotation.y = -0.85 } // 已搜刮：双门敞着
      grp.add(top); grp.add(low)
      top.add(box(0.04, 0.3, 0.04, '#8a8f94', 0.68, 0, 0.05))
      low.add(box(0.04, 0.6, 0.04, '#8a8f94', 0.68, 0.2, 0.05))
      grp.add(box(0.78, 0.04, 0.68, '#8a8f94', 0, 1.16, 0.01)) // 上下门分缝
      if (s.looted) grp.add(box(0.7, 1.6, 0.6, '#2a2d30', 0, 0.85, 0.02)) // 空掉的内胆
      faceOutward(grp, s, m)
      break
    }
    case 'safebox': {
      // 保险箱：厚重方箱 + 圆形转盘锁 + 铰链
      const body = s.looted ? '#2c2f33' : '#3a3d42'
      grp.add(box(0.72, 0.76, 0.66, body, 0, 0.38, 0))
      grp.add(box(0.76, 0.06, 0.7, '#2a2d31', 0, 0.03, 0)) // 底座
      const door = box(0.62, 0.66, 0.07, s.looted ? '#33373b' : '#454a50', 0, 0, 0)
      door.geometry.translate(-0.31, 0, 0) // 铰链在右缘
      door.position.set(0.31, 0.4, 0.33)
      if (s.looted) door.rotation.y = 1.25 // 已搜刮：箱门敞开
      grp.add(door)
      const dial = cyl(0.11, 0.11, 0.04, '#8a9098', 0, 0, 0, 12)
      dial.rotation.x = Math.PI / 2
      dial.position.set(-0.31 + 0.06, 0, 0.055)
      door.add(dial)
      door.add(box(0.05, 0.05, 0.06, '#c9c2a8', -0.31 + 0.06, 0, 0.08))     // 转盘手柄
      door.add(box(0.05, 0.18, 0.06, '#8a9098', -0.31 + 0.24, -0.02, 0.05)) // 拉手
      for (const hy of [-0.22, 0.22]) grp.add(box(0.06, 0.1, 0.1, '#22252a', 0.33, 0.4 + hy, 0.3)) // 铰链
      if (s.looted) grp.add(box(0.56, 0.6, 0.5, '#141618', 0, 0.4, 0.02))
      break
    }

    // ===== v30：Level 1 区段扩展 =====
    case 'column': {
      // 哥特段圆柱：圆形石柱 + 柱础 + 柱头
      grp.add(cyl(0.34, 0.38, H, '#7e7a74', 0, H / 2, 0, 14))
      grp.add(cyl(0.48, 0.52, 0.22, '#6a665f', 0, 0.11, 0, 14))
      grp.add(cyl(0.46, 0.36, 0.3, '#6a665f', 0, H - 0.15, 0, 14))
      break
    }
    case 'roundarch': {
      // 哥特段圆形拱门：双侧石柱 + 半圆拱顶（非实心，拱洞沿本地 z 轴可穿行）
      const stone = '#7e7a74', dark = '#6a665f'
      const springY = H * 0.55 // 起拱高度
      grp.add(cyl(0.14, 0.17, springY, stone, -0.38, springY / 2, 0, 10))
      grp.add(cyl(0.14, 0.17, springY, stone, 0.38, springY / 2, 0, 10))
      grp.add(cyl(0.2, 0.22, 0.14, dark, -0.38, 0.07, 0, 10)) // 柱础
      grp.add(cyl(0.2, 0.22, 0.14, dark, 0.38, 0.07, 0, 10))
      const arch = new THREE.Mesh(
        new THREE.TorusGeometry(0.38, 0.11, 8, 16, Math.PI),
        new THREE.MeshLambertMaterial({ color: stone }),
      )
      arch.position.set(0, springY, 0) // 半圆环躺在 XY 竖直面内，拱洞朝 z 轴打开
      grp.add(arch)
      grp.add(box(0.2, 0.16, 0.24, dark, 0, springY + 0.42, 0)) // 拱顶石
      break
    }
    case 'vaultcol': {
      // 哥特段拱顶柱（v34，参照地下停车场交叉拱）：粗圆柱身 + 柱顶喇叭展开顶到天花；
      // data.archX/archY 时从柱顶向 +x/+y 伸出连拱板（纯视觉，与邻柱连成连续拱腹）
      const stone = '#7e7a74', dark = '#6a665f'
      grp.add(cyl(0.5, 0.54, 0.22, dark, 0, 0.11, 0, 14)) // 柱础
      grp.add(cyl(0.36, 0.42, H * 0.62, stone, 0, H * 0.31, 0, 14)) // 柱身（0 ~ H*0.62）
      grp.add(cyl(0.46, 0.36, H * 0.12, stone, 0, H * 0.68, 0, 14)) // 过渡圆台（H*0.62 ~ H*0.74）
      grp.add(cyl(1.05, 0.46, H * 0.26, stone, 0, H * 0.87, 0, 14)) // 喇叭头展开（H*0.74 ~ H，顶到天花）
      const spanX = (s.data?.spanX as number | undefined) ?? 0
      const spanY = (s.data?.spanY as number | undefined) ?? 0
      if (s.data?.archX && spanX > 0) grp.add(box(spanX, 0.34, 1.2, stone, spanX / 2, H - 0.42, 0))
      if (s.data?.archY && spanY > 0) grp.add(box(1.2, 0.34, spanY, stone, 0, H - 0.42, spanY / 2))
      break
    }
    case 'scaffold': {
      // 衔尾段脚手架：四角立杆 + 两层横杆 + 顶部踏板（2×1）
      const hw = s.w / 2 - 0.12, hd = s.h / 2 - 0.12
      for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]] as const)
        grp.add(cyl(0.045, 0.045, H * 0.82, '#8a7a3a', px, H * 0.41, pz, 6))
      for (const ly of [H * 0.32, H * 0.62]) {
        grp.add(box(s.w - 0.1, 0.05, 0.05, '#8a7a3a', 0, ly, -hd))
        grp.add(box(s.w - 0.1, 0.05, 0.05, '#8a7a3a', 0, ly, hd))
        grp.add(box(0.05, 0.05, s.h - 0.1, '#8a7a3a', -hw, ly, 0))
        grp.add(box(0.05, 0.05, s.h - 0.1, '#8a7a3a', hw, ly, 0))
      }
      grp.add(box(s.w - 0.06, 0.06, s.h - 0.06, '#a08a5a', 0, H * 0.82, 0)) // 踏板
      break
    }
    case 'roadblock': {
      // 衔尾段施工路障：双立柱 + 橙白条纹横板
      grp.add(box(0.08, 0.8, 0.08, '#3a3d42', -0.38, 0.4, 0))
      grp.add(box(0.08, 0.8, 0.08, '#3a3d42', 0.38, 0.4, 0))
      grp.add(box(0.92, 0.2, 0.06, '#d9642a', 0, 0.62, 0))
      grp.add(box(0.92, 0.07, 0.07, '#e8e2d2', 0, 0.62, 0.005))
      grp.add(box(0.92, 0.14, 0.06, '#d9642a', 0, 0.3, 0))
      grp.add(glow(0.07, 0.07, 0.07, '#ffb03a', -0.38, 0.86, 0))
      grp.add(glow(0.07, 0.07, 0.07, '#ffb03a', 0.38, 0.86, 0))
      break
    }
    case 'debrispile': {
      // 衔尾段建材碎料堆（非容器不阻挡）：沙堆 + 碎砖 + 斜搭的木板（位置确定性，重建一致）
      const rng = mulberry((Math.floor(s.x) * 73856093) ^ (Math.floor(s.y) * 19349663) ^ 0x51ab)
      grp.add(cyl(0.34, 0.46, 0.18, '#9a8f7a', 0.1, 0.09, -0.08, 10)) // 沙堆（扁圆台）
      grp.add(cyl(0.2, 0.3, 0.12, '#8a7f6c', -0.22, 0.06, 0.2, 8))   // 小沙堆
      for (let i = 0; i < 4; i++) { // 碎砖
        const b = box(0.2, 0.09, 0.1, i % 2 ? '#8a4a3a' : '#7a4034',
          (rng() - 0.5) * 0.6, 0.045 + (i > 1 ? 0.09 : 0), (rng() - 0.5) * 0.6)
        b.rotation.y = rng() * Math.PI
        grp.add(b)
      }
      const plank = box(0.62, 0.035, 0.14, '#a08a5a', 0.05, 0.16, 0.12) // 斜搭的木板
      plank.rotation.z = 0.28
      plank.rotation.y = -0.4 + rng() * 0.8
      grp.add(plank)
      break
    }
    case 'scrap': {
      // 碎金属堆（L2 肮脏的廊道地面散件；非容器不阻挡）：扭曲金属片 + 躺倒短管 + 弯钩件
      const rng = mulberry((Math.floor(s.x) * 73856093) ^ (Math.floor(s.y) * 19349663) ^ 0x5c4a)
      for (let i = 0; i < 3; i++) {
        const p = box(0.28 + rng() * 0.22, 0.03, 0.14 + rng() * 0.12, i % 2 ? '#6e4a30' : '#5a5a5e',
          (rng() - 0.5) * 0.5, 0.02 + i * 0.04, (rng() - 0.5) * 0.5)
        p.rotation.y = rng() * Math.PI
        p.rotation.z = (rng() - 0.5) * 0.5
        grp.add(p)
      }
      const tube = cyl(0.05, 0.05, 0.55, '#7a4a2e', 0.08, 0.07, -0.08, 8) // 躺倒的短管
      tube.rotation.z = Math.PI / 2 - 0.12
      tube.rotation.y = 0.5
      grp.add(tube)
      const hook = box(0.04, 0.22, 0.04, '#8a4526', -0.2, 0.1, 0.16) // 弯钩件
      hook.rotation.z = 0.7
      grp.add(hook)
      break
    }
    case 'megdoc': {
      // M.E.G. 文档：牛皮纸封皮 + 几页摊开的纸（data.ontable=放在桌面上）
      const y0 = s.data?.ontable ? 0.76 : 0
      grp.add(box(0.24, 0.015, 0.3, '#c9a86a', 0, y0 + 0.008, 0))
      grp.add(box(0.22, 0.01, 0.28, '#e8e2d2', 0.01, y0 + 0.022, 0.01))
      const page = box(0.2, 0.008, 0.26, '#dcd6c4', -0.015, y0 + 0.032, -0.01)
      page.rotation.y = 0.12
      grp.add(page)
      grp.add(box(0.06, 0.006, 0.06, '#3a5a7a', -0.06, y0 + 0.038, 0.08)) // M.E.G. 徽记色块
      break
    }
    case 'inkdoor': {
      // 维护通廊墨黑色金属门：嵌在墙洞里的门框（双立柱 + 门楣 + 门槛，横跨 2 格门洞）
      // + 一扇向走廊内敞开的门扇——一眼即知「这是门，而且能过」。
      // 标准朝向：通行沿本地 x 轴（门框平面垂直 x）；data.rot=1 旋转 90°（通行沿本地 z 轴）。
      const ink = '#14161a', ink2 = '#1c1f24'
      const doorH = H * 0.78
      grp.add(box(0.5, doorH, 0.24, ink, 0, doorH / 2, -0.95)) // 门洞两侧立柱（跨 2 瓦片）
      grp.add(box(0.5, doorH, 0.24, ink, 0, doorH / 2, 0.95))
      grp.add(box(0.5, 0.3, 2.14, ink2, 0, doorH + 0.15, 0)) // 门楣
      grp.add(box(0.46, 0.05, 1.9, '#0a0b0d', 0, 0.025, 0)) // 门槛
      // 门顶封墙：门楣上方直到天花板全部封死（只留门洞通行）
      const sealH = H - (doorH + 0.3)
      if (sealH > 0.05) grp.add(box(0.46, sealH, 2.14, '#a8a49a', 0, doorH + 0.3 + sealH / 2, 0))
      // 绿色 EXIT 指示灯（门楣正上方、封墙板上，两侧各一块自发光牌）
      for (const sd of [-1, 1]) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.26), new THREE.MeshBasicMaterial({ map: exitSignTexture() }))
        sign.position.set(sd * 0.236, doorH + 0.5, 0)
        sign.rotation.y = sd > 0 ? Math.PI / 2 : -Math.PI / 2
        grp.add(sign)
      }
      grp.add(glow(0.32, 0.05, 0.05, '#3ae06a', 0, doorH + 0.32, 0)) // EXIT 绿色底光
      // 门扇：初始关闭（恰好覆盖门洞），铰链在 +z 侧立柱；
      // userData.lid 由 renderer.updateStructs 驱动——交互开门后向走廊内旋开至 ~106°
      const leaf = box(0.08, doorH - 0.18, 1.7, '#181b20', 0, 0, 0)
      leaf.geometry.translate(0, 0, -0.85) // 铰链边移到局部 z=0
      leaf.position.set(0.06, doorH / 2, 0.86)
      leaf.userData.lid = 1
      leaf.add(box(0.06, 0.08, 0.14, '#8a9098', 0.07, 0, -1.48)) // 门把手（随门扇）
      grp.add(leaf)
      // 门楣两端的冷白描边灯（黑暗中也能认出这是一扇门）
      grp.add(glow(0.1, 0.04, 0.1, '#e8e8e0', 0.26, doorH + 0.04, -0.95))
      grp.add(glow(0.1, 0.04, 0.1, '#e8e8e0', 0.26, doorH + 0.04, 0.95))
      if (s.data?.rot) grp.rotation.y = Math.PI / 2
      break
    }
    case 'landmark': {
      // 定居点地标（v35，wikidot 图一：饰有团队标志的彩色布料 + 悬挂物资 + 系着的纸条）
      // v46：海报形地标（data.poster，EL3A）——贴在廊道墙上的海报（data.tex 指定贴图），
      // 交互/小地图标注/前往与布料地标一致
      if (s.data?.poster) {
        const ptex = (s.data?.tex as string | undefined) ?? 'el3a_poster.png'
        const inner2 = new THREE.Group()
        grp.add(inner2)
        inner2.add(box(0.98, 1.26, 0.03, '#223a2c', 0, 1.32, 0)) // 海报背板（BNTG 深绿描边）
        const ppanel = new THREE.Mesh(
          new THREE.PlaneGeometry(0.9, 1.18),
          new THREE.MeshLambertMaterial({ map: levelTexture(ptex, () => noiseTexture('#23402f', '#1e3729')) }),
        )
        ppanel.position.set(0, 1.32, 0.021)
        inner2.add(ppanel)
        inner2.add(glow(0.16, 0.05, 0.05, '#ffe8a0', 0, 2.02, 0.05)) // 顶部小暖灯（鲜亮易寻）
        mountOnWall(inner2, grp, s, m) // 强制贴最近墙（含虚空墙），不浮空
        break
      }
      const bntg = s.data?.outpost === 'bntg'
      const ariane = s.data?.outpost === 'ariane'
      const tom = s.data?.outpost === 'tom'
      const el3a = s.data?.outpost === 'el3a' // v43：办公区EL3A——BNTG 灰绿变体布料
      const clothC = ariane ? '#8676e2' : el3a ? '#5f7a62' : bntg ? '#3a5a44' : tom ? '#b04030' : '#d9b13b' // 阿丽亚娜紫 / EL3A 灰绿 / BNTG 深绿 / Tom 暖红 / M.E.G. 鲜黄
      const markC = ariane ? '#f0eefc' : bntg || el3a ? '#e8e8e0' : tom ? '#f8ecd8' : '#3a332c'
      grp.add(cyl(0.03, 0.05, 1.7, '#4a4038', 0, 0.85, 0, 6)) // 立杆
      grp.add(box(0.56, 0.72, 0.03, clothC, 0, 1.22, 0.02)) // 团队色布料
      if (ariane) {
        // 阿丽亚娜徽记：圆环（wikidot：一环紫色圆环组成的圆环——以单环简化表达）
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.1, 16), new THREE.MeshLambertMaterial({ color: markC, side: THREE.DoubleSide }))
        ring.position.set(0, 1.3, 0.045)
        grp.add(ring)
      } else {
        // 徽记（深色方块拼的展翅/天平标）
        grp.add(box(0.06, 0.2, 0.012, markC, 0, 1.3, 0.045))
        grp.add(box(0.13, 0.05, 0.012, markC, -0.08, 1.32, 0.045))
        grp.add(box(0.13, 0.05, 0.012, markC, 0.08, 1.32, 0.045))
        grp.add(box(0.2, 0.05, 0.012, markC, 0, 1.24, 0.045))
      }
      // 悬挂的杏仁水瓶（细绳 + 瓶）
      grp.add(box(0.012, 0.14, 0.012, '#8a8474', 0.2, 0.95, 0.03))
      grp.add(cyl(0.045, 0.05, 0.14, '#c9d9a8', 0.2, 0.82, 0.03, 6))
      // 系着的纸条
      grp.add(box(0.14, 0.18, 0.012, '#f0e6c0', -0.18, 1.1, 0.045))
      // 顶部小暖灯（鲜亮易寻——与灰暗景观形成鲜明对比）
      grp.add(glow(0.1, 0.06, 0.1, '#ffe8a0', 0, 1.74, 0))
      break
    }

    // ===== v35：据点（Alpha 基地）家具 =====
    case 'serverrack': {
      // 中控室无线电机柜：深色机柜 + 顶部监视器 + 表盘/指示灯/线缆
      grp.add(box(0.72, 1.86, 0.4, '#24272c', 0, 0.93, 0)) // 机柜主体
      for (const sx of [-0.17, 0.17]) { // 顶部两台监视器（微仰）
        const mon = box(0.28, 0.22, 0.2, '#3a3e45', sx, 1.98, -0.02)
        mon.rotation.x = -0.22
        grp.add(mon)
        grp.add(box(0.22, 0.14, 0.015, '#5a6a78', sx, 1.99, 0.085))
      }
      const dial = cyl(0.09, 0.09, 0.02, '#d8d2c2', -0.18, 1.5, 0.21, 12) // 大表盘
      dial.rotation.x = Math.PI / 2
      grp.add(dial)
      for (let i = 0; i < 4; i++) grp.add(cyl(0.02, 0.02, 0.015, '#c9b458', -0.02 + i * 0.09, 1.5, 0.205, 6).rotateX(Math.PI / 2)) // 小旋钮
      for (let i = 0; i < 3; i++) grp.add(glow(0.03, 0.03, 0.012, ['#7ac97a', '#e8b93c', '#d96a4a'][i], -0.2 + i * 0.08, 1.28, 0.205)) // 指示灯
      for (let i = 0; i < 5; i++) grp.add(box(0.06, 0.02, 0.02, '#c94a3a', -0.15 + i * 0.075, 1.06, 0.21)) // 红色接线排
      for (let i = 0; i < 3; i++) grp.add(box(0.015, 0.5, 0.015, '#15181c', -0.24 + i * 0.05, 0.55, 0.21)) // 垂下线缆
      grp.add(box(0.6, 0.06, 0.34, '#15181c', 0, 0.16, 0.02)) // 底部线槽
      break
    }
    case 'officechair': {
      // 办公转椅（非实心）：五星脚 + 气杆 + 座面 + 靠背 + 扶手
      grp.add(cyl(0.03, 0.03, 0.32, '#6a6a70', 0, 0.24, 0, 8)) // 气杆
      for (let i = 0; i < 4; i++) { // 四星脚
        const a = (i * Math.PI) / 2 + Math.PI / 4
        const leg = box(0.3, 0.03, 0.05, '#4a4a50', Math.cos(a) * 0.15, 0.06, Math.sin(a) * 0.15)
        leg.rotation.y = -a
        grp.add(leg)
      }
      grp.add(box(0.42, 0.07, 0.4, '#2e2e33', 0, 0.44, 0)) // 座面
      const back = box(0.4, 0.44, 0.07, '#2e2e33', 0, 0.76, -0.18) // 靠背（微后倾）
      back.rotation.x = 0.12
      grp.add(back)
      grp.add(box(0.05, 0.05, 0.3, '#4a4a50', -0.2, 0.56, -0.02)) // 扶手（左）
      grp.add(box(0.05, 0.05, 0.3, '#4a4a50', 0.2, 0.56, -0.02)) // 扶手（右）
      // v35：朝向机制——正对最近的桌子（桌/书桌，2.5 格内）；附近没有桌子则背向最近的墙
      {
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2
        let bt: { x: number; y: number } | null = null, bd = 1e9
        for (const o of m.structures) {
          if (o === s || (o.kind !== 'table' && o.kind !== 'desk' && o.kind !== 'dtable')) continue
          const ox = o.x + o.w / 2, oy = o.y + o.h / 2
          const d = Math.hypot(ox - cx, oy - cy)
          if (d < bd) { bd = d; bt = { x: ox, y: oy } }
        }
        if (bt && bd <= 2.5) {
          grp.rotation.y = Math.atan2(bt.x - cx, bt.y - cy) // 模型正面 +Z 指向桌子
        } else {
          faceOutward(grp, s, m) // 无桌：背墙（faceOutward 即正面背向最近墙面）
        }
      }
      break
    }
    case 'binshelf': {
      // 储物货架：金属立柱 + 三层搁板 + 蓝/灰收纳箱（白色标签）
      const hw = s.w / 2 - 0.06
      for (const px of [-hw, hw]) for (const pz of [-0.16, 0.16]) grp.add(box(0.05, 1.9, 0.05, '#8a8a8e', px, 0.95, pz)) // 立柱
      for (const sy of [0.3, 0.85, 1.4, 1.86]) grp.add(box(s.w - 0.04, 0.04, 0.42, '#9a9a9e', 0, sy, 0)) // 搁板
      const binC = ['#2e4ac9', '#5a5f66', '#2e4ac9', '#5a5f66', '#3a5ad9']
      let bi = 0
      for (const sy of [0.44, 0.99, 1.54]) {
        for (let bx0 = -hw + 0.24; bx0 <= hw - 0.2; bx0 += 0.46) {
          const bc = binC[bi++ % binC.length]
          grp.add(box(0.4, 0.26, 0.36, bc, bx0, sy, 0)) // 收纳箱
          grp.add(box(0.12, 0.09, 0.012, '#f0f0ea', bx0, sy + 0.02, 0.19)) // 白色标签
        }
      }
      // v48 缺省朝向：背贴最近墙、标签面（+Z）朝外；data.deg 可显式覆盖
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      else faceOutward(grp, s, m)
      break
    }
    case 'bunkbed': {
      // 双层床：木框架 + 上下铺 + 床梯 + 床垫枕头（沿本地 z 纵放，占地 1×2）
      const wood = '#7a5a34', mat = '#e8e4d8'
      for (const px of [-0.4, 0.4]) for (const pz of [-0.92, 0.92]) grp.add(box(0.08, 1.6, 0.08, wood, px, 0.8, pz)) // 四柱
      for (const dy of [0.5, 1.2]) { // 两层床板 + 床垫 + 枕头
        grp.add(box(0.86, 0.07, 1.9, wood, 0, dy, 0))
        grp.add(box(0.78, 0.12, 1.8, mat, 0, dy + 0.09, 0))
        grp.add(box(0.5, 0.1, 0.3, '#f0ede0', 0, dy + 0.16, -0.7))
      }
      for (const dx of [-0.32, 0.32]) grp.add(box(0.05, 1.3, 0.05, wood, dx, 0.75, 0.98)) // 床梯立杆
      for (let i = 0; i < 4; i++) grp.add(box(0.68, 0.04, 0.04, wood, 0, 0.3 + i * 0.32, 0.98)) // 梯档
      grp.add(box(0.86, 0.3, 0.06, wood, 0, 1.5, -0.92)) // 上铺护栏（床头）
      grp.add(box(0.06, 0.24, 1.8, wood, -0.4, 1.42, 0)) // 上铺侧护栏
      break
    }
    case 'screenboard': {
      // 投影幕 + 黑板（贴墙，朝外，背板贴墙面）
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(1.9, 1.0, 0.05, '#1e2a26', 0, 1.15, 0)) // 黑板
      inner.add(box(1.94, 0.06, 0.07, '#6a6a62', 0, 0.62, 0.01)) // 板槽
      inner.add(box(1.5, 0.86, 0.04, '#e8e6e0', 0, 2.1, 0.02)) // 投影幕（垂下）
      const roll = cyl(0.025, 0.025, 1.56, '#9a9a9e', 0, 2.56, 0.02, 8)
      roll.rotation.z = Math.PI / 2
      inner.add(roll) // 幕布卷轴
      inner.add(box(0.2, 0.05, 0.05, '#4a4a42', -0.6, 0.64, 0.04)) // 板擦
      mountOnWall(inner, grp, s, m) // 强制贴最近墙（含虚空墙），不浮空
      break
    }
    case 'noticeboard': case 'megposter': case 'photo': {
      // 据点墙面装饰：贴图画板（公告栏/标语海报/相片，磁盘贴图 + 程序兜底，背板贴墙面）
      // data.tex 可指定替代贴图（如 bntg_poster.png）
      const tex = (s.data?.tex as string | undefined) ?? (s.kind === 'noticeboard' ? 'noticeboard.png' : s.kind === 'megposter' ? 'poster_slogan.png' : 'photo.png')
      const fb = s.kind === 'noticeboard' ? '#8a6a42' : s.kind === 'megposter' ? '#efe8d2' : '#c9b87a'
      if (s.data?.flat) {
        // 躺在地板上的画作/地面导引贴花（data.flat：小径画廊；data.tex 可换贴图，如 mall_arrow.png）
        if (!s.data?.tex) grp.add(box(0.66, 0.02, 0.54, '#4a4038', 0, 0.01, 0)) // 画作背板（贴花无背板）
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(0.62, 0.5),
          new THREE.MeshLambertMaterial({ map: levelTexture(tex, () => noiseTexture(fb, '#5a4e34')), transparent: true }),
        )
        const deg = ((s.data?.deg as number | undefined) ?? 0) * Math.PI / 180
        if (deg) panel.geometry.rotateZ(deg) // data.deg：贴花朝向（如地面箭头转向）
        panel.rotation.x = -Math.PI / 2
        panel.position.set(0, 0.025, 0)
        grp.add(panel)
        break
      }
      const w = s.kind === 'photo' ? 0.62 : 0.92, h = s.kind === 'photo' ? 0.5 : 0.72
      const inner = new THREE.Group()
      grp.add(inner)
      inner.add(box(w + 0.06, h + 0.06, 0.03, '#4a4038', 0, 1.3, 0)) // 背框
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshLambertMaterial({ map: levelTexture(tex, () => noiseTexture(fb, '#5a4e34')) }),
      )
      panel.position.set(0, 1.3, 0.021)
      inner.add(panel)
      mountOnWall(inner, grp, s, m) // 强制贴最近墙（含虚空墙），不浮空
      break
    }
    case 'ventgrate': {
      // 天花板通风口格栅（仅风口无管道）：边框 + 百叶，贴在天花板底面
      grp.add(box(0.56, 0.05, 0.56, '#6a6a70', 0, H - 0.03, 0))
      grp.add(box(0.46, 0.02, 0.46, '#2a2d30', 0, H - 0.055, 0))
      for (let i = 0; i < 4; i++) grp.add(box(0.42, 0.015, 0.05, '#8a8a8e', 0, H - 0.065, -0.15 + i * 0.1))
      break
    }
    // ===================== v36：商人之家商场风装饰 =====================
    case 'bench': {
      // 商场长椅：木座面 + 靠背 + 金属侧架
      const wood = '#9a7d55', frame = '#3f4448'
      grp.add(box(1.36, 0.07, 0.48, wood, 0, 0.44, 0)) // 座面
      grp.add(box(1.36, 0.46, 0.06, wood, 0, 0.78, -0.23)) // 靠背
      for (const lx of [-0.58, 0.58]) {
        grp.add(box(0.07, 0.44, 0.44, frame, lx, 0.22, 0)) // 侧架（座腿）
        grp.add(box(0.07, 0.52, 0.06, frame, lx, 0.72, -0.23)) // 靠背支柱
      }
      // v46：data.deg 指定朝向（缺省朝南 +z；休息室长椅面朝公共区，不再正面对着墙）
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'planter': {
      // 花坛：矮石框 + 泥土 + 三株绿植
      grp.add(box(1.08, 0.4, 0.58, '#9a958c', 0, 0.2, 0)) // 石框
      grp.add(box(0.96, 0.05, 0.46, '#41321f', 0, 0.41, 0)) // 泥土
      for (const [px, pz, ph] of [[-0.3, 0.04, 0.34], [0.06, -0.08, 0.5], [0.34, 0.06, 0.28]] as const) {
        grp.add(box(0.05, ph, 0.05, '#3e5a2a', px, 0.42 + ph / 2, pz)) // 茎
        grp.add(box(0.22, 0.18, 0.22, '#4e7a34', px, 0.44 + ph, pz)) // 叶冠
      }
      break
    }
    case 'trashbin': {
      // 商场垃圾桶：金属圆筒 + 深色投口 + 底座圈
      grp.add(cyl(0.24, 0.21, 0.7, '#7d8489', 0, 0.37, 0, 12)) // 筒身
      grp.add(cyl(0.22, 0.22, 0.04, '#2c2f33', 0, 0.72, 0, 12)) // 投口
      grp.add(cyl(0.25, 0.25, 0.05, '#5a6165', 0, 0.045, 0, 12)) // 底座圈
      break
    }
    case 'shopsign': {
      // 悬挂店招（商人之家市场街/大厅）：吊杆 + 贴图招牌板 + 顶部描边灯
      const tex = (s.data?.tex as string | undefined) ?? 'bntg_poster.png'
      grp.add(box(0.04, 0.3, 0.04, '#3a3a3e', -0.3, H - 0.15, 0)) // 吊杆（左）
      grp.add(box(0.04, 0.3, 0.04, '#3a3a3e', 0.3, H - 0.15, 0)) // 吊杆（右）
      grp.add(box(0.84, 0.34, 0.05, '#2a2d30', 0, H - 0.48, 0)) // 招牌背板
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(0.78, 0.28),
        new THREE.MeshLambertMaterial({ map: levelTexture(tex, () => noiseTexture('#2e3a32', '#e8e8e0')) }),
      )
      panel.position.set(0, H - 0.48, 0.031)
      grp.add(panel)
      grp.add(glow(0.86, 0.03, 0.03, '#7ac97a', 0, H - 0.29, 0)) // 顶部描边灯
      faceOutward(grp, s, m)
      break
    }

    // ===================== v37：希波克拉底 - 1（阿丽亚娜集团据点）医疗家具 =====================
    case 'hospitalbed': {
      // 病床：金属框 + 白床垫 + 枕头 + 床头摇起（沿本地 z 纵放）
      // v38：毯子按坐标奇偶在 浅蓝/薄荷/薰衣草 三色间轮换（枕头保持白，实例级变色）
      const metal = '#c8ccd2', mat = '#f2f2f4'
      const blanket = ['#9ab8d8', '#a8d8c0', '#c8bce8'][(((s.x + s.y) % 3) + 3) % 3]
      const hw = s.w / 2 - 0.07, hl = s.h / 2 - 0.08
      for (const px of [-hw, hw]) for (const pz of [-hl, hl]) grp.add(box(0.06, 0.5, 0.06, metal, px, 0.25, pz)) // 床腿
      grp.add(box(s.w - 0.06, 0.08, s.h - 0.12, metal, 0, 0.48, 0)) // 床框
      grp.add(box(s.w - 0.16, 0.12, s.h * 0.58, mat, 0, 0.58, s.h * 0.17)) // 床垫平段（床尾侧）
      grp.add(box(s.w - 0.18, 0.05, s.h * 0.46, blanket, 0, 0.665, s.h * 0.22)) // 毯子（三色轮换）
      const head = box(s.w - 0.16, 0.1, s.h * 0.36, mat, 0, 0.7, -s.h * 0.24) // 床头摇起段
      head.rotation.x = -0.44
      grp.add(head)
      const pillow = box(s.w - 0.4, 0.08, 0.24, '#fafaf8', 0, 0.84, -s.h * 0.33) // 枕头（贴在摇起段上）
      pillow.rotation.x = -0.44
      grp.add(pillow)
      grp.add(box(s.w - 0.06, 0.52, 0.05, metal, 0, 0.6, -hl)) // 床头板
      grp.add(box(s.w - 0.06, 0.34, 0.05, metal, 0, 0.52, hl)) // 床尾板
      grp.add(box(0.04, 0.16, s.h * 0.4, metal, -hw, 0.72, s.h * 0.12)) // 侧护栏（左）
      grp.add(box(0.04, 0.16, s.h * 0.4, metal, hw, 0.72, s.h * 0.12)) // 侧护栏（右）
      break
    }
    case 'ivstand': {
      // 输液架：金属立杆 + 四爪底座 + 挂钩横杆 + 半透明输液袋
      const metal = '#b8bcc4'
      for (let i = 0; i < 4; i++) { // 四爪底座
        const a = (i * Math.PI) / 2 + Math.PI / 4
        const leg = box(0.26, 0.03, 0.04, metal, Math.cos(a) * 0.13, 0.05, Math.sin(a) * 0.13)
        leg.rotation.y = -a
        grp.add(leg)
      }
      grp.add(cyl(0.018, 0.024, 1.7, metal, 0, 0.85, 0, 8)) // 立杆
      grp.add(box(0.34, 0.02, 0.02, metal, 0, 1.68, 0)) // 挂钩横杆
      const bag = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.2, 0.06),
        // v38：输液袋液体按坐标奇偶在 透明/淡黄/淡粉 间轮换
        new THREE.MeshLambertMaterial({ color: ['#e8f0e2', '#f0e8c0', '#f0d4dc'][(((s.x + s.y) % 3) + 3) % 3], transparent: true, opacity: 0.72 }),
      )
      bag.position.set(-0.12, 1.52, 0)
      grp.add(bag) // 输液袋（半透明）
      grp.add(cyl(0.006, 0.006, 0.52, '#d8dcd8', -0.12, 1.14, 0, 4)) // 输液管垂下
      break
    }
    case 'medcabinet': {
      // 药品柜：薄荷白柜 + 玻璃门（透出药瓶）+ 紫色十字（阿丽亚娜主题色，呼应红十字）
      // v38：柜体薄荷白 + 柜门把手/边框深色（紫十字保留），不再清一色纯白
      grp.add(box(0.72, 1.5, 0.34, '#e2efe6', 0, 0.75, 0)) // 柜体（薄荷白）
      grp.add(box(0.64, 0.56, 0.03, '#d5e2da', 0, 0.3, 0.165)) // 下部实门
      grp.add(box(0.74, 0.04, 0.36, '#5a6068', 0, 1.52, 0)) // 顶部深色边框
      grp.add(box(0.74, 0.04, 0.36, '#5a6068', 0, 0.02, 0)) // 底部深色踢脚
      for (let i = 0; i < 3; i++) grp.add(cyl(0.032, 0.032, 0.13, ['#c96a4a', '#4a8ac9', '#7ac97a'][i], -0.18 + i * 0.18, 1.0, 0.1, 6)) // 玻璃后的药瓶
      grp.add(box(0.56, 0.03, 0.26, '#c2cdc6', 0, 1.18, 0.02)) // 玻璃层板
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.62, 0.68, 0.02),
        new THREE.MeshLambertMaterial({ color: '#cfe0e8', transparent: true, opacity: 0.38 }),
      )
      glass.position.set(0, 1.02, 0.17)
      grp.add(glass) // 玻璃门
      grp.add(box(0.03, 0.12, 0.03, '#4a4e54', 0.26, 1.02, 0.185)) // 柜门把手（深色）
      grp.add(box(0.2, 0.06, 0.02, '#8676e2', 0, 1.42, 0.175)) // 紫十字（横）
      grp.add(box(0.06, 0.2, 0.02, '#8676e2', 0, 1.42, 0.175)) // 紫十字（竖）
      faceOutward(grp, s, m) // 柜门背墙朝外
      break
    }
    case 'labbench': {
      // 实验台：石板灰台案（v38：不再纯白）+ 显微镜 + 试管组（彩色液体）+ 烧杯
      const hw = s.w / 2 - 0.07
      for (const px of [-hw, hw]) grp.add(box(0.08, 0.82, 0.6, '#d8dce2', px, 0.41, 0)) // 台腿
      grp.add(box(s.w, 0.07, 0.72, '#6a7278', 0, 0.86, 0)) // 台面（石板灰）
      grp.add(box(s.w, 0.04, 0.72, '#5a6167', 0, 0.9, 0)) // 防腐蚀垫层
      // 显微镜（左）
      const mx = -s.w / 2 + 0.3
      grp.add(box(0.16, 0.03, 0.16, '#3a3e45', mx, 0.94, 0)) // 底座
      grp.add(box(0.05, 0.22, 0.05, '#3a3e45', mx - 0.05, 1.05, -0.04)) // 支架
      const tube = cyl(0.035, 0.035, 0.18, '#2a2d33', mx, 1.14, 0.02, 8) // 镜筒（微倾）
      tube.rotation.x = 0.5
      grp.add(tube)
      grp.add(box(0.1, 0.02, 0.1, '#5a5f66', mx, 1.0, 0.04)) // 载物台
      // 试管组（中）：木架 + 5 支彩色液体试管
      grp.add(box(0.3, 0.04, 0.08, '#9a7d55', 0.05, 0.95, 0.16))
      for (let i = 0; i < 5; i++) {
        grp.add(cyl(0.016, 0.016, 0.12, '#e8ecf0', -0.05 + i * 0.05, 1.03, 0.16, 6)) // 玻璃管
        grp.add(cyl(0.013, 0.013, 0.05, ['#c96a4a', '#7ac97a', '#4a8ac9', '#8676e2', '#e8b93c'][i], -0.05 + i * 0.05, 1.0, 0.16, 6)) // 液体
      }
      // 烧杯（右）
      grp.add(cyl(0.05, 0.045, 0.12, '#e8ecf0', s.w / 2 - 0.32, 0.98, -0.12, 10))
      grp.add(cyl(0.043, 0.043, 0.06, '#9fd0c8', s.w / 2 - 0.32, 0.96, -0.12, 10)) // 淡绿液体
      break
    }
    case 'specimentank': {
      // 标本罐：玻璃圆筒 + 淡紫/淡绿/淡琥珀液体（半透明自发光）+ 内部悬浮样本块 + 金属底座/顶盖
      // v38：按坐标奇偶三色轮换（确定性）
      const liquidC = ['#a894e8', '#8fd0a0', '#e0c078'][(((s.x + s.y) % 3) + 3) % 3]
      grp.add(cyl(0.3, 0.32, 0.1, '#6a6e75', 0, 0.05, 0, 14)) // 底座
      grp.add(cyl(0.3, 0.3, 0.06, '#8a8e94', 0, 1.62, 0, 14)) // 顶盖
      const liquid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.26, 0.26, 1.44, 14),
        new THREE.MeshBasicMaterial({ color: liquidC, transparent: true, opacity: 0.5 }),
      )
      liquid.position.set(0, 0.86, 0)
      grp.add(liquid) // 液体（自发光恒定发亮）
      grp.add(box(0.16, 0.2, 0.12, '#7a5a68', 0.04, 0.9, 0.02)) // 样本块（悬浮）
      grp.add(box(0.08, 0.1, 0.08, '#6a4a58', -0.06, 0.68, -0.04)) // 小样本块
      grp.add(cyl(0.008, 0.008, 0.3, '#c8b8e0', 0, 1.32, 0, 4)) // 悬丝
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 1.5, 14),
        new THREE.MeshLambertMaterial({ color: '#d8e8f0', transparent: true, opacity: 0.22 }),
      )
      glass.position.set(0, 0.88, 0)
      grp.add(glass) // 玻璃外罩
      grp.add(box(0.16, 0.1, 0.02, '#f0f0ea', 0, 0.34, 0.3)) // 标签
      break
    }

    // ===================== v38：Tom 的餐馆（独立餐馆据点）家具 =====================
    case 'stove': {
      // 灶台：不锈钢灶体 + 四炉眼 + 一锅热汤 + 防油背板（背板贴墙，faceOutward 背墙朝外）
      grp.add(box(0.8, 0.86, 0.6, '#9a9ea4', 0, 0.43, 0)) // 灶体
      grp.add(box(0.82, 0.05, 0.62, '#33363b', 0, 0.885, 0)) // 灶面
      for (const [bx, bz] of [[-0.2, -0.14], [0.2, -0.14], [-0.2, 0.16], [0.2, 0.16]] as const)
        grp.add(cyl(0.09, 0.09, 0.015, '#14161a', bx, 0.915, bz, 10)) // 炉眼
      grp.add(cyl(0.13, 0.11, 0.12, '#c8ccd2', -0.2, 0.99, -0.14, 12)) // 锅
      grp.add(cyl(0.115, 0.115, 0.02, '#d98a4a', -0.2, 1.05, -0.14, 12)) // 锅里热汤
      for (let i = 0; i < 3; i++) grp.add(cyl(0.02, 0.02, 0.02, '#2a2d33', -0.2 + i * 0.2, 0.68, 0.31, 6).rotateX(Math.PI / 2)) // 旋钮
      grp.add(box(0.8, 0.5, 0.05, '#8a8e94', 0, 1.16, -0.29)) // 防油背板
      faceOutward(grp, s, m)
      break
    }
    case 'kcounter': {
      // 厨房料理台：暖木橱柜 + 浅色台面 + 柜门缝 + 挂杆厨具 + 刀架磁条 + 砧板
      const hw = s.w / 2 - 0.06
      grp.add(box(s.w - 0.04, 0.78, 0.6, '#8a6a48', 0, 0.39, 0)) // 柜体
      grp.add(box(s.w + 0.02, 0.05, 0.64, '#e8e4da', 0, 0.83, 0)) // 台面
      for (let dx = -hw + 0.3; dx <= hw - 0.2; dx += 0.5) grp.add(box(0.02, 0.6, 0.02, '#5a4630', dx, 0.42, 0.31)) // 柜门缝
      grp.add(box(0.3, 0.02, 0.22, '#c9a875', -hw + 0.35, 0.865, 0.08)) // 砧板
      grp.add(box(0.16, 0.03, 0.1, '#d95a3a', hw - 0.3, 0.875, 0.1)) // 番茄一堆
      // 墙面挂杆 + 挂勺/铲（-z 侧）
      const rail = cyl(0.012, 0.012, Math.min(s.w - 0.3, 1.4), '#7d8489', 0, 1.35, -0.24, 6)
      rail.rotation.z = Math.PI / 2
      grp.add(rail)
      for (let i = 0; i < 3; i++) {
        grp.add(box(0.015, 0.2, 0.015, '#c8ccd2', -0.35 + i * 0.28, 1.23, -0.24)) // 柄
        grp.add(box(0.07, 0.09, 0.02, '#c8ccd2', -0.35 + i * 0.28, 1.09, -0.24)) // 勺/铲头
      }
      grp.add(box(0.4, 0.05, 0.02, '#4a4e54', hw - 0.4, 1.3, -0.26)) // 刀架磁条
      grp.add(box(0.03, 0.14, 0.012, '#d8dce2', hw - 0.45, 1.2, -0.26)) // 刀 1
      grp.add(box(0.03, 0.11, 0.012, '#d8dce2', hw - 0.33, 1.22, -0.26)) // 刀 2
      faceOutward(grp, s, m)
      break
    }
    case 'sink': {
      // 水槽：橱柜 + 不锈钢双槽台面 + 水龙头
      grp.add(box(0.8, 0.78, 0.6, '#8a6a48', 0, 0.39, 0)) // 柜体
      grp.add(box(0.84, 0.06, 0.64, '#c8ccd2', 0, 0.83, 0)) // 不锈钢台面
      for (const sx of [-0.2, 0.2]) grp.add(box(0.32, 0.03, 0.42, '#7d8489', sx, 0.845, 0.02)) // 双槽（凹陷深色）
      grp.add(cyl(0.025, 0.03, 0.3, '#d8dce2', 0, 1.0, -0.22, 8)) // 龙头立管
      grp.add(box(0.03, 0.03, 0.22, '#d8dce2', 0, 1.14, -0.12)) // 龙头弯臂
      grp.add(cyl(0.018, 0.018, 0.07, '#d8dce2', 0, 1.11, -0.01, 6)) // 出水口
      grp.add(box(0.05, 0.03, 0.05, '#d9c96a', 0.3, 0.875, -0.2)) // 海绵
      faceOutward(grp, s, m)
      break
    }
    case 'freezer': {
      // 卧式冷冻柜：白柜 + 顶盖双缝 + 温控面板（运行灯）+ 散热格栅（非容器）
      grp.add(box(1.1, 0.8, 0.62, '#eef0f2', 0, 0.42, 0)) // 柜体
      grp.add(box(1.12, 0.06, 0.64, '#f7f8fa', 0, 0.85, 0)) // 顶盖
      grp.add(box(0.015, 0.015, 0.62, '#c9ced4', 0, 0.885, 0)) // 顶盖中缝
      grp.add(box(0.2, 0.1, 0.02, '#3a3e45', -0.34, 0.6, 0.315)) // 温控面板
      grp.add(glow(0.03, 0.03, 0.012, '#7ac97a', -0.34, 0.6, 0.33)) // 运行灯
      for (let i = 0; i < 4; i++) grp.add(box(0.24, 0.015, 0.02, '#b8bec6', 0.3, 0.3 + i * 0.08, 0.325)) // 散热格栅
      faceOutward(grp, s, m)
      break
    }
    case 'dtable': {
      // 餐桌：白桌布圆桌 + 两副餐盘餐具 + 水杯 + 小烛台（烛火自发光）+ 对侧两把餐椅（餐椅随桌成型，凸出邻格仅视觉）
      grp.add(cyl(0.3, 0.34, 0.06, '#5a4630', 0, 0.03, 0, 10)) // 桌脚底座
      grp.add(cyl(0.06, 0.08, 0.68, '#6a5334', 0, 0.37, 0, 8)) // 桌脚
      grp.add(cyl(0.52, 0.58, 0.14, '#f2eee2', 0, 0.72, 0, 16)) // 桌布垂边
      grp.add(cyl(0.5, 0.5, 0.03, '#faf6ea', 0, 0.8, 0, 16)) // 桌面
      for (const [px, pz] of [[-0.2, 0.12], [0.2, -0.12]] as const) {
        grp.add(cyl(0.09, 0.09, 0.015, '#e8ecf0', px, 0.825, pz, 10)) // 餐盘
        grp.add(box(0.02, 0.01, 0.12, '#c8ccd2', px + 0.13, 0.825, pz)) // 餐具
      }
      grp.add(cyl(0.035, 0.03, 0.09, '#9fc0d8', 0.05, 0.86, 0.2, 8)) // 水杯
      grp.add(cyl(0.02, 0.03, 0.1, '#b89858', -0.05, 0.86, -0.2, 8)) // 小烛台
      grp.add(glow(0.03, 0.045, 0.03, '#ffd890', -0.05, 0.945, -0.2)) // 烛火
      for (const cz of [-0.78, 0.78]) { // 两把餐椅（对侧）
        grp.add(box(0.4, 0.05, 0.4, '#7a5a34', 0, 0.44, cz)) // 椅面
        grp.add(box(0.4, 0.5, 0.05, '#7a5a34', 0, 0.72, cz + (cz > 0 ? 0.18 : -0.18))) // 靠背
        for (const lx of [-0.16, 0.16]) for (const lz of [-0.16, 0.16])
          grp.add(box(0.04, 0.44, 0.04, '#5a4630', lx, 0.22, cz + lz)) // 椅腿
      }
      break
    }

    // ===================== v45：Level 274「杰瑞的房间」（教堂风穹顶 + 杰瑞栖木） =====================
    case 'domering': {
      // 教堂穹顶（置于大厅中央，非实心纯装饰）：同心环形肋 + 放射拱肋 + 顶心圣辉盘
      // data.r=穹顶半径（米） data.apex=顶高（米）；拱肋自基环（r, 3.2m）收拢至顶心
      const R = (s.data?.r as number | undefined) ?? 12
      const apex = (s.data?.apex as number | undefined) ?? 5.1
      const rib = '#e8ecf8', ribDark = '#b8c0e0', gold = '#d4af37'
      // 同心环形肋（三环，越高越收）
      for (const [ry, rr] of [[0.55, 0.88], [0.78, 0.62], [0.92, 0.34]] as const) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * rr, 0.09, 6, 40), new THREE.MeshLambertMaterial({ color: rib }))
        ring.rotation.x = Math.PI / 2
        ring.position.set(0, apex * ry, 0)
        grp.add(ring)
      }
      // 放射拱肋（8 根：基环 → 顶心的四分之一圆弧，小段盒体拼弧）
      const y0 = 3.2
      for (let ri = 0; ri < 8; ri++) {
        const a = (ri / 8) * Math.PI * 2
        for (let ti = 0; ti <= 6; ti++) {
          const th = (ti / 6) * (Math.PI / 2) * 0.96
          const rad = R * Math.cos(th)
          const y = y0 + Math.sin(th) * (apex - y0)
          grp.add(box(0.22, 0.22, 0.22, ti % 2 ? rib : ribDark, Math.cos(a) * rad, y, Math.sin(a) * rad))
        }
      }
      // 顶心圣辉盘（自发光圆盘 + 光晕球：蓝白圣辉自穹顶洒落）
      const halo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: '#fdf8e2' }))
      halo.position.set(0, apex + 0.05, 0)
      grp.add(halo)
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.08, 20), new THREE.MeshLambertMaterial({ color: gold }))
      disc.position.set(0, apex - 0.15, 0)
      grp.add(disc)
      break
    }
    case 'perch': {
      // 杰瑞的栖木：石座 + 木立柱 + 顶部横杆（鹉主 Entity 7 栖息于横杆上）+ 金饰环 + 供品小碟
      grp.add(cyl(0.3, 0.36, 0.14, '#c8ccd8', 0, 0.07, 0, 12)) // 石座
      grp.add(cyl(0.06, 0.09, 0.44, '#6a4e34', 0, 0.36, 0, 8)) // 木立柱
      const bar = cyl(0.035, 0.035, 0.72, '#7a5a3a', 0, 0.55, 0, 8) // 顶部横杆
      bar.rotation.z = Math.PI / 2
      grp.add(bar)
      grp.add(cyl(0.1, 0.1, 0.03, '#d4af37', 0, 0.5, 0, 10)) // 金饰环
      grp.add(cyl(0.07, 0.05, 0.035, '#d8b060', 0.22, 0.16, 0.1, 8)) // 供品小碟（杏仁水色）
      break
    }

    // ===================== v47：Level 274 教堂细化（讲坛/烛台/圣水盆） =====================
    case 'pulpit': {
      // 讲坛：石阶高台 + 斜面讲案 + 金饰鹉徽（教堂布道位；data.deg 朝向，缺省朝南 +z）
      grp.add(box(1.0, 0.18, 1.0, '#c8ccd8', 0, 0.09, 0)) // 基座平台
      grp.add(box(0.8, 0.16, 0.8, '#d4d8e4', 0, 0.26, -0.06)) // 上台面
      grp.add(box(0.62, 0.72, 0.5, '#8a90b8', 0, 0.7, -0.1)) // 台身（蓝白石材）
      const desk = box(0.62, 0.07, 0.44, '#6a4e34', 0, 1.12, -0.06) // 斜面讲案（木）
      desk.rotation.x = -0.28
      grp.add(desk)
      grp.add(box(0.62, 0.05, 0.06, '#6a4e34', 0, 1.05, 0.16)) // 案前挡条
      grp.add(box(0.16, 0.2, 0.02, '#d4af37', 0, 0.72, 0.16)) // 正面金饰鹉徽
      grp.add(box(0.1, 0.1, 0.021, '#4142a5', 0, 0.72, 0.165)) // 徽上蓝羽
      if (s.data?.deg !== undefined) grp.rotation.y = ((Number(s.data.deg) || 0) * Math.PI) / 180
      break
    }
    case 'candlestand': {
      // 烛台：细杆三臂烛架 + 自发光烛火（非实心；教堂烛火常明）
      grp.add(cyl(0.09, 0.12, 0.04, '#3a352e', 0, 0.02, 0, 10)) // 底座
      grp.add(cyl(0.016, 0.02, 1.06, '#4a4442', 0, 0.55, 0, 6)) // 主杆
      for (const [ax, az] of [[-0.14, 0], [0.14, 0], [0, 0.14]] as const) {
        grp.add(box(0.2, 0.02, 0.02, '#4a4442', ax / 2, 1.02, az / 2).rotateY(Math.atan2(az, ax || 1e-6))) // 横臂
        grp.add(cyl(0.024, 0.02, 0.1, '#e8e0c8', ax, 1.1, az, 6)) // 烛身
        grp.add(glow(0.02, 0.05, 0.02, '#ffd9a0', ax, 1.18, az)) // 烛火
      }
      break
    }
    case 'holyfont': {
      // 圣水盆：石盆 + 蓝色圣水微光（信众以蓝为圣色——入门前以圣水净手）
      grp.add(cyl(0.14, 0.2, 0.5, '#c8ccd8', 0, 0.25, 0, 10)) // 盆柱
      grp.add(cyl(0.3, 0.22, 0.18, '#b8c0d4', 0, 0.58, 0, 12)) // 盆体
      grp.add(cyl(0.24, 0.24, 0.02, '#4a7ac9', 0, 0.66, 0, 12)) // 蓝色圣水面
      grp.add(glow(0.06, 0.02, 0.06, '#9adfff', 0, 0.68, 0)) // 水面圣辉
      grp.add(cyl(0.32, 0.32, 0.03, '#d4af37', 0, 0.68, 0, 12)) // 金饰盆沿
      break
    }

    case 'prefabmark': return null
    case 'wet': return null
    default: return null
  }
  grp.position.set(cx, 0, cz)
  return grp
}

// ---------- 出口低模 ----------
export function buildExit(kind: string, def: LevelDef): THREE.Group {
  const grp = new THREE.Group()
  const pulseMat = () => {
    const mat = new THREE.MeshBasicMaterial({ color: '#f5e37a' })
    mat.userData.pulse = true
    mat.userData.base = col('#f5e37a')
    return mat
  }
  // v17/v29：闪烁的墙壁专用——规律明灭的闪烁材质（render() 出口动画按 strobe 处理）
  const strobeMat = () => {
    const mat = new THREE.MeshBasicMaterial({ color: '#f5e37a' })
    mat.userData.strobe = true
    mat.userData.base = col('#f5e37a')
    return mat
  }
  // v30：洞口地板——与本层地板同纹理同色调（从外往里看是地板延续；黑色只出现在更深处）
  const levelFloorQuad = (w: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshLambertMaterial({ color: def.palette.floor, map: levelTexture(`l${def.id}_floor`, () => noiseTexture(def.palette.floor, def.palette.floorAlt)) }),
    )
    m.rotation.x = -Math.PI / 2
    m.position.set(x, y, z)
    return m
  }
  switch (kind) {
    case 'flickerdoor': {
      // v29：闪烁的墙壁——不做门体模型：墙面上的一片门形区域规律地闪烁光芒
      // 主体：门形发光面片（贴墙朝向由 orientExitToWall 按相邻墙调整；半透明透出墙纸纹理）
      const glowMat = strobeMat()
      glowMat.transparent = true
      glowMat.opacity = 0.85
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.1), glowMat)
      glow.position.set(0, 1.08, 0)
      grp.add(glow)
      break
    }
    case 'crack': case 'arcflash': {
      // 地面发光裂口
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), pulseMat())
      p.rotation.x = -Math.PI / 2
      p.rotation.z = 0.4
      p.position.y = 0.03
      grp.add(p)
      const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.25), pulseMat())
      p2.rotation.x = -Math.PI / 2
      p2.rotation.z = -0.5
      p2.position.set(0.3, 0.035, 0.3)
      grp.add(p2)
      break
    }
    case 'collapse': case 'shaft': case 'window': {
      // 黑洞
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.7, 12), new THREE.MeshBasicMaterial({ color: '#000000' }))
      hole.rotation.x = -Math.PI / 2
      hole.position.y = 0.02
      grp.add(hole)
      break
    }
    case 'freight': case 'elevatorshaft': case 'stafflift': case 'servicelift': {
      // 金属电梯门 + 指示灯
      grp.add(box(1.6, 2.4, 0.15, '#4a4d52', 0, 1.2, -0.3))
      grp.add(box(0.06, 2.2, 0.18, '#2a2d30', 0, 1.1, -0.3))
      const ind = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.06), pulseMat())
      ind.position.set(0, 2.55, -0.28)
      grp.add(ind)
      break
    }
    case 'revolving': {
      grp.add(cyl(1.0, 1.0, 0.1, '#b08d46', 0, 2.4, 0, 12))
      for (let i = 0; i < 3; i++) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.3, 0.05), pulseMat())
        panel.rotation.y = (i * Math.PI) / 3
        panel.position.y = 1.15
        grp.add(panel)
      }
      break
    }
    case 'mirror': {
      grp.add(box(1.2, 2.4, 0.1, '#3a1e20', 0, 1.2, -0.2))
      const mg = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.04), pulseMat())
      mg.position.set(0, 1.2, -0.14)
      grp.add(mg)
      break
    }
    case 'graystairs': {
      // 下行的灰色阶梯：12 级混凝土踏步沿走向下探（与引擎坡道 z=-1.23·s 严格对齐，无偏移）+ 两侧顺坡护栏 + 底部漆黑
      for (let i = 0; i < 12; i++) {
        const z = 0.1 - i * 0.22
        grp.add(box(1.1, 0.1, 0.26, '#7a7a7e', 0, 1.23 * z - 0.06, z))
      }
      // v29a 修复：护栏原来水平横架（深端悬空 2.6m 横跨洞口）——改为顺坡斜置，与踏步平行且高出踏面 ~0.85m
      // 坡面：踏面 y=1.2308·z（z 为局部纵深，负值深入）；护栏中心线 y=1.2308·z+0.85，倾角 atan(1.2308)
      for (const sx of [-0.6, 0.6]) {
        const rail = box(0.08, 0.07, 4.0, '#5e5e62', sx, 1.2308 * -1.1 + 0.85, -1.1)
        rail.rotation.x = -Math.atan(1.2308) // 局部 +z 轴向 → 顺坡向下
        grp.add(rail)
        // 入口端立柱（衔接地板与护栏端头）
        grp.add(box(0.08, 0.9, 0.08, '#5e5e62', sx, 0.45, 0.28))
      }
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.6), new THREE.MeshBasicMaterial({ color: '#000000' }))
      dark.rotation.x = -Math.PI / 2
      dark.position.set(0, -3.3, -0.9)
      grp.add(dark)
      break
    }
    case 'graystairsup': {
      // 上行的灰色阶梯：12 级混凝土踏步沿走向上升（与引擎坡道严格对齐），没入顶部漆黑
      for (let i = 0; i < 12; i++) {
        const z = 0.1 - i * 0.22
        grp.add(box(1.1, 0.1, 0.26, '#7a7a7e', 0, -1.23 * z - 0.06, z))
      }
      // v29a 修复：同下行——护栏顺坡斜置（与上行踏步平行，高出踏面 ~0.85m）
      for (const sx of [-0.6, 0.6]) {
        const rail = box(0.08, 0.07, 4.0, '#5e5e62', sx, -1.2308 * -1.1 + 0.85, -1.1)
        rail.rotation.x = Math.atan(1.2308) // 顺坡向上
        grp.add(rail)
        grp.add(box(0.08, 0.9, 0.08, '#5e5e62', sx, 0.45, 0.28))
      }
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 3.6), new THREE.MeshBasicMaterial({ color: '#000000' }))
      dark.rotation.x = Math.PI / 2
      dark.position.set(0, 3.4, -0.9)
      grp.add(dark)
      break
    }
    case 'stairs': {
      // 楼梯井（独特模型·嵌墙镂空）：墙体开洞内的楼梯井道——内侧壁 + 下探踏步没入黑暗 + 绿色出口灯牌 + 扶手
      // 朝向约定：开口朝 -z（出口格/房间侧），组中心 = 墙格中心（geometry 已在该墙格开门洞）
      grp.add(box(0.06, 2.3, 1.0, '#4a4a4e', -0.42, 1.15, 0))
      grp.add(box(0.06, 2.3, 1.0, '#4a4a4e', 0.42, 1.15, 0))
      // 下探踏步（自洞口地面开始逐级下探，修正悬空偏移）
      for (let i = 0; i < 5; i++) grp.add(box(0.8, 0.1, 0.2, '#5e5e62', 0, 0.02 - i * 0.19, -0.28 + i * 0.17))
      // 洞口地面与本层地板一致（入口处地板延续）；黑色只在踏步下方更深处
      grp.add(levelFloorQuad(1, 0.26, 0, 0.005, -0.37))
      const dkFloor = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.8), new THREE.MeshBasicMaterial({ color: '#000000' }))
      dkFloor.rotation.x = -Math.PI / 2
      dkFloor.position.set(0, -0.78, 0.05)
      grp.add(dkFloor)
      const dkBack = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.3), new THREE.MeshBasicMaterial({ color: '#020202', side: THREE.DoubleSide }))
      dkBack.position.set(0, 1.05, 0.5)
      grp.add(dkBack)
      grp.add(box(0.08, 2.3, 0.1, '#78787c', -0.44, 1.15, -0.42))
      grp.add(box(0.08, 2.3, 0.1, '#78787c', 0.44, 1.15, -0.42))
      grp.add(box(0.96, 0.12, 0.1, '#8a8a8e', 0, 2.36, -0.42))
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.05), new THREE.MeshBasicMaterial({ color: '#7ddb6a' }))
      sign.position.set(0, 2.14, -0.5)
      grp.add(sign)
      grp.add(box(0.03, 0.03, 0.8, '#8a8a8e', -0.36, 0.9, 0.05))
      grp.add(box(0.03, 0.03, 0.8, '#8a8a8e', 0.36, 0.9, 0.05))
      break
    }
    case 'unlockeddoor': {
      // 未上锁的门（独特模型·嵌墙镂空）：墙洞内的门框 + 虚掩门板（向房间侧旋开）+ 门后暗室 + 黄铜把手 + 小门牌
      grp.add(box(0.08, 2.2, 0.1, '#6b6b6e', -0.44, 1.1, -0.42))
      grp.add(box(0.08, 2.2, 0.1, '#6b6b6e', 0.44, 1.1, -0.42))
      grp.add(box(0.96, 0.1, 0.1, '#78787c', 0, 2.26, -0.42))
      const dk = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.1), new THREE.MeshBasicMaterial({ color: '#000000', side: THREE.DoubleSide }))
      dk.position.set(0, 1.05, 0.5)
      grp.add(dk)
      // 洞口地面与本层地板一致（从外往里看是地板延续）；黑色只留在深处的暗室
      grp.add(levelFloorQuad(1, 1, 0, 0.005, 0))
      const panel = box(0.8, 2.05, 0.04, '#4d5156')
      panel.geometry.translate(0.4, 0, 0)
      panel.position.set(-0.4, 1.04, -0.42)
      panel.rotation.y = 0.55
      const handle = box(0.03, 0.14, 0.045, '#c9a03a', 0.68, -0.02, 0.04)
      panel.add(handle)
      grp.add(panel)
      grp.add(box(0.24, 0.1, 0.02, '#c9c4b0', 0.44, 1.68, -0.48))
      break
    }
    case 'fireexit': {
      // 消防出口（独特模型·嵌墙镂空）：金属防火门（虚掩）+ 绿色 EXIT 灯牌 + 钢制门框 + 门后暗室
      // 朝向约定：开口朝 -z（出口格/凹龛侧），组中心 = 墙格中心（geometry 已在该墙格开门洞）
      grp.add(box(0.1, 2.3, 0.14, '#3a3f46', -0.45, 1.15, -0.4)) // 门框立柱
      grp.add(box(0.1, 2.3, 0.14, '#3a3f46', 0.45, 1.15, -0.4))
      grp.add(box(1.0, 0.12, 0.14, '#43484f', 0, 2.32, -0.4)) // 门楣
      const dk = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.2), new THREE.MeshBasicMaterial({ color: '#020402', side: THREE.DoubleSide }))
      dk.position.set(0, 1.1, 0.5)
      grp.add(dk)
      grp.add(levelFloorQuad(1, 1, 0, 0.005, 0)) // 洞口地面与本层地板一致
      // 金属防火门（向凹龛侧虚掩；推杆 + 观察小窗）
      const panel = box(0.82, 2.2, 0.05, '#5a6068')
      panel.geometry.translate(0.41, 0, 0)
      panel.position.set(-0.41, 1.1, -0.42)
      panel.rotation.y = 0.38
      panel.add(box(0.5, 0.05, 0.03, '#43484f', 0.41, 0.05, 0.045)) // 推杆
      panel.add(box(0.16, 0.24, 0.02, '#20262c', 0.41, 0.62, 0.04)) // 观察小窗（嵌丝玻璃）
      grp.add(panel)
      // 绿色 EXIT 灯牌（门楣上方，两侧可见）+ 底部绿光晕
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.26), new THREE.MeshBasicMaterial({ map: exitSignTexture() }))
      sign.position.set(0, 2.56, -0.42)
      grp.add(sign)
      const sign2 = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.26), new THREE.MeshBasicMaterial({ map: exitSignTexture() }))
      sign2.rotation.y = Math.PI
      sign2.position.set(0, 2.56, -0.38)
      grp.add(sign2)
      grp.add(glow(0.5, 0.06, 0.06, '#3ae06a', 0, 2.42, -0.4))
      break
    }
    case 'officedoor': {
      // 办公走廊尽头（独特模型·嵌墙镂空）：L4 风办公室门——浅色门框 + 毛玻璃上板 + 木门下板 + 门后暗室
      grp.add(box(0.08, 2.2, 0.1, '#8f8a7c', -0.44, 1.1, -0.42))
      grp.add(box(0.08, 2.2, 0.1, '#8f8a7c', 0.44, 1.1, -0.42))
      grp.add(box(0.96, 0.1, 0.1, '#9a958a', 0, 2.26, -0.42))
      const dk = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.1), new THREE.MeshBasicMaterial({ color: '#050504', side: THREE.DoubleSide }))
      dk.position.set(0, 1.05, 0.5)
      grp.add(dk)
      grp.add(levelFloorQuad(1, 1, 0, 0.005, 0))
      const panel = box(0.8, 2.05, 0.04, '#7a6a52')
      panel.geometry.translate(0.4, 0, 0)
      panel.position.set(-0.4, 1.04, -0.42)
      panel.rotation.y = 0.5
      panel.add(box(0.56, 0.7, 0.02, '#c4c7c2', 0.4, 0.55, 0.035)) // 毛玻璃上板
      panel.add(box(0.03, 0.14, 0.045, '#c9a03a', 0.68, -0.02, 0.04)) // 黄铜把手
      grp.add(panel)
      grp.add(box(0.3, 0.12, 0.02, '#e8e4da', 0.44, 1.7, -0.48)) // 门牌
      break
    }
    default: {
      // 门框 + 发光门缝
      grp.add(box(0.15, 2.3, 0.4, def.palette.wallTop, -0.65, 1.15, 0))
      grp.add(box(0.15, 2.3, 0.4, def.palette.wallTop, 0.65, 1.15, 0))
      grp.add(box(1.45, 0.18, 0.4, def.palette.wallTop, 0, 2.35, 0))
      const slit = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.15, 0.06), pulseMat())
      slit.position.set(0, 1.08, -0.05)
      grp.add(slit)
      break
    }
  }
  return grp
}
