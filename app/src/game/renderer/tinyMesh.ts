// [tiny] 小小（Entity 720）重制模型——参照中文维基 trimmed:entity-720 正文与附图（stellate 绘，仅作造型参考）。
// 约 2.44 m 的瘦长类人形：深褐近黑、焦油般发亮的橡胶质皮肤（细密排线纹理），胸口/大腿/小腿各一列蓝色生物荧光点；
// 双腿极长，末端收成刀刃状尖鳍，没有脚；手臂细长，褐色的手带利爪；面部是米黄色的椭圆甲壳面具，只露两只发蓝光的眼，
// 甲壳可左右分开露出尖牙巨口（追击终段）。
// 身上常年披着一整张鲨鱼皮：鲨头罩住头顶，上颚利齿一圈围着脸，下颚挂在下巴底下；鲨鱼的白眼长在头罩两侧；
// 鳃裂在颈侧；鲨身沿背垂下，带背鳍与两片胸鳍，尾鳍拖在小腿后面。鱼皮只是固定外观。
// 武器：细长深色长矛，矛头是一颗巨兽的牙磨成的。
// 造型沿用猎犬/窃皮者的样条扫掠管体；贴图运行时程序化生成，无外部资源。模型正面 +X，地面 y=0。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { disposeL8Tree } from './l8ModelResources'
import { rng, merge, V, gauss, sstep, cap, ell, sweep, limbSeg, canvasTex, type RF } from './houndMesh'

export interface TinyPose {
  /** 甲壳张开 0..1（同时放出巨口） */
  open?: number
  /** 前倾 0..1（泳姿/扑击） */
  lean?: number
  /** 长矛：hold 斜持 / raise 高举蓄力 / thrust 前刺 */
  spear?: 'hold' | 'raise' | 'thrust'
  /** 头部偏转（弧度，+ 向 +Z 侧） */
  headYaw?: number
  headTilt?: number
}

let TEX: { skin: THREE.Texture | null; shark: THREE.Texture | null; mask: THREE.Texture | null } | null = null
const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
function hatch(c: CanvasRenderingContext2D, R: () => number, n: number, col: (R: () => number) => string, len: number, ang: number, jitter: number) {
  for (let i = 0; i < n; i++) {
    const x = R() * 256, y = R() * 256, a = ang + (R() - 0.5) * jitter, l = len * (0.5 + R())
    const lw = 0.5 + R() * 0.9, cc = col(R)
    tile((ox, oy) => { c.strokeStyle = cc; c.lineWidth = lw; c.beginPath(); c.moveTo(x + ox, y + oy); c.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); c.stroke() })
  }
}
function textures() {
  if (TEX) return TEX
  // 皮肤：深褐近黑底色 + 偏红褐的斑驳 + 附图那种细密排线；焦油感交给材质的低粗糙度
  const skin = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#2e231d'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 120; i++) {
      const x = R() * 256, y = R() * 256, r = 8 + R() * 34, a = 0.05 + R() * 0.09
      const cc = R() < 0.55 ? `rgba(120,62,42,${a})` : `rgba(24,18,16,${a * 1.4})`
      tile((ox, oy) => { c.fillStyle = cc; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    hatch(c, R, 900, (R) => `rgba(14,10,9,${0.25 + R() * 0.35})`, 9, 1.35, 0.5)
    hatch(c, R, 160, (R) => `rgba(150,96,70,${0.08 + R() * 0.1})`, 7, 1.2, 0.6)
  }, true)
  // 鲨皮：中性蓝灰，粗排线与旧伤划痕（明暗由顶点色给出背深腹浅）
  const shark = canvasTex(256, 256, (c, R) => {
    c.fillStyle = '#a3abbb'; c.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 90; i++) {
      const x = R() * 256, y = R() * 256, r = 10 + R() * 40, a = 0.04 + R() * 0.07
      const cc = R() < 0.5 ? `rgba(70,78,96,${a})` : `rgba(220,226,236,${a})`
      tile((ox, oy) => { c.fillStyle = cc; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
    }
    hatch(c, R, 520, (R) => `rgba(30,34,46,${0.16 + R() * 0.22})`, 12, 0.25, 0.7)
    hatch(c, R, 30, () => 'rgba(230,232,238,0.35)', 22, 0.4, 1.2) // 旧伤白痕
  }, true)
  // 面具：米黄甲壳，细排线与边缘发暗
  const mask = canvasTex(128, 128, (c, R) => {
    c.fillStyle = '#d9c497'; c.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 260; i++) {
      const x = R() * 128, y = R() * 128, a = 1.4 + (R() - 0.5) * 0.5, l = 4 + R() * 6
      c.strokeStyle = `rgba(110,88,52,${0.1 + R() * 0.16})`; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke()
    }
  }, false)
  if (mask) mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping
  for (const t of [skin, shark, mask]) if (t) t.userData.entityShared = true
  TEX = { skin, shark, mask }
  return TEX
}

/** 顶点色常量填充（不带 color 属性的几何合并前补齐） */
const fill = (g: THREE.BufferGeometry, v: number) => { g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(v), 3)); return g }
const prep = (g: THREE.BufferGeometry, v = 1) => { const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(n.attributes.position.count * 2).fill(0), 2)); return n.attributes.color ? n : fill(n, v) }
/** 分段线性的半径表 [t, 值...] → 平滑插值 */
const table = (tb: number[][], t: number, k: number) => { for (let i = 1; i < tb.length; i++) if (t <= tb[i][0]) { const a = tb[i - 1], b = tb[i]; const s = sstep(0, 1, (t - a[0]) / (b[0] - a[0])); return a[k] + (b[k] - a[k]) * s } return tb[tb.length - 1][k] }

let HALO: THREE.Texture | null | undefined
function haloTexture() {
  if (HALO !== undefined) return HALO
    if (typeof document === 'undefined') return null
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d'); if (!c) return null
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(150,225,255,0.9)'); g.addColorStop(0.35, 'rgba(80,190,255,0.45)'); g.addColorStop(1, 'rgba(40,140,255,0)')
    c.fillStyle = g; c.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.userData.entityShared = true; HALO = t; return t
}

export function* buildTinyJob(): Generator<void, THREE.Group, unknown> {
  const grp = new THREE.Group()
  let complete = false
  try {
  grp.userData.entityType = 'tiny'
  const parts: Record<string, THREE.Object3D> = {}
  grp.userData.parts = parts
  const R = rng(0x720)
  const tx = textures()
  const skin = litMaterial({ color: '#ffffff', map: tx.skin ?? undefined, vertexColors: true, roughness: 0.38, envBase: 0.32 })
  if (!tx.skin) skin.color.set('#2c211c')
  const hand = litMaterial({ color: '#c28566', map: tx.skin ?? undefined, vertexColors: true, roughness: 0.5, envBase: 0.2 })
  const shark = litMaterial({ color: '#a7aebb', map: tx.shark ?? undefined, vertexColors: true, roughness: 0.7, envBase: 0.12, side: THREE.DoubleSide })
  if (!tx.shark) shark.color.set('#7b8494')
  const maskM = litMaterial({ color: '#ffffff', map: tx.mask ?? undefined, vertexColors: true, roughness: 0.55, envBase: 0.2, side: THREE.DoubleSide })
  if (!tx.mask) maskM.color.set('#d4bf90')
  const tooth = litMaterial({ color: '#e9e2cc', roughness: 0.5, envBase: 0.2, emissive: '#2a271f', emissiveIntensity: 0.25 })
  const gum = litMaterial({ color: '#5a1f1c', roughness: 0.7, emissive: '#1a0504', emissiveIntensity: 0.2 })
  const maw = new THREE.MeshBasicMaterial({ color: '#120607' })
  const claw = litMaterial({ color: '#2a2320', roughness: 0.4, envBase: 0.3 })
  const sharkEye = litMaterial({ color: '#efefea', roughness: 0.3, envBase: 0.4, emissive: '#3a3a36', emissiveIntensity: 0.25 })
  const sharkIris = litMaterial({ color: '#6b2a20', roughness: 0.5 })
  const gill = litMaterial({ color: '#7a2a26', roughness: 0.6, emissive: '#2a0806', emissiveIntensity: 0.3 })
  // 自发光：眼睛（暗处变亮，由渲染层按深度写 emissiveIntensity）与荧光点
  const eyeMat = new THREE.MeshLambertMaterial({ color: '#8fdcff', emissive: new THREE.Color('#3fb8ff'), emissiveIntensity: 1.2 })
  const eyeCore = new THREE.MeshBasicMaterial({ color: '#f2fbff' })
  const socketM = new THREE.MeshBasicMaterial({ color: '#100d09' })
  // 光晕：中心亮、边缘透明的径向渐变，叠加混合，不写深度
  const haloTex = haloTexture()
  const eyeHalo = new THREE.MeshBasicMaterial({ color: '#ffffff', map: haloTex, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
  if (!haloTex) eyeHalo.opacity = 0
  const eyeHalos: THREE.Mesh[] = []
  grp.userData.eyeHalo = eyeHalo
  const spotMat = new THREE.MeshLambertMaterial({ color: '#9adfff', emissive: new THREE.Color('#5cc8ff'), emissiveIntensity: 1.0 })
  grp.userData.eyeMats = [eyeMat]
  grp.userData.spotMat = spotMat
  // 荧光点按所在肢段分组（随肢段一起动），最后每组合并成一个网格
  const spots = new Map<THREE.Object3D, THREE.BufferGeometry[]>()
  const dot = (parent: THREE.Object3D, p: THREE.Vector3, r = 0.011) => { const g = new THREE.SphereGeometry(r, 6, 4); g.translate(p.x, p.y, p.z); const l = spots.get(parent) ?? []; l.push(prep(g)); spots.set(parent, l) }

  const root = new THREE.Group(); root.name = 'tinyRoot'; grp.add(root); parts.root = root
  const PELVIS = 1.16

  yield;
  // ---------- 腿：极长，小腿下段压扁成刀刃状尖鳍，没有脚 ----------
  for (const zs of [-1, 1]) {
    yield;
    const L = zs < 0 ? 'L' : 'R'
    const hip = new THREE.Group(); hip.position.set(0, PELVIS - 0.02, zs * 0.085); root.add(hip); parts['leg' + L] = hip
    const thigh = limbSeg([V(0, 0.04, 0), V(0.04, -0.22, zs * 0.01), V(0.05, -0.5, zs * 0.012)], 0.068, 0.046, 0.25, 0.28, 0.9)
    hip.add(new THREE.Mesh(thigh, skin))
    const knee = new THREE.Group(); knee.position.set(0.05, -0.5, zs * 0.012); hip.add(knee); parts['knee' + L] = knee
    // 小腿：前 35% 圆管，之后前后加宽、左右压薄，收成尖锋；略向后弯
    const shinPts = [V(0, 0.02, 0), V(-0.02, -0.2, 0), V(-0.05, -0.42, 0), V(-0.09, -0.6, 0), V(-0.13, -0.72, 0)]
    const shinR: RF = (t, _d, cs, sn) => {
      const wide = sstep(0.25, 0.6, t)
      const r = (0.044 - 0.006 * t + 0.028 * wide * (1 - sstep(0.6, 1, t) * 0.4)) * (1 - sstep(0.72, 1, t) * 0.97)
      return r * (t < 0.08 ? cap(t, 0.08) : 1) * ell(cs, sn, 1 + wide * 0.35, 1 - wide * 0.72)
    }
    const shin = sweep(shinPts, shinR, { radial: 10, seg: 16, vRep: 2, shade: (t) => 0.95 - t * 0.35 })
    knee.add(new THREE.Mesh(shin, skin))
    // 膝盖：补一块髌骨，免得两段管体在关节处收细、弯曲时露缝
    knee.add(new THREE.Mesh(prep(new THREE.SphereGeometry(0.05, 10, 8).scale(1.05, 1.1, 0.95), 0.9), skin))
    // 荧光点：大腿前侧一列 5 个、小腿外侧一列 3 个（左右错开，模仿附图）
    for (let i = 0; i < 5; i++) { const t = 0.2 + i * 0.13; dot(hip, new THREE.Vector3(0.04 + t * 0.06 + 0.052 - t * 0.012, -0.5 * t, zs * 0.016)) }
    for (let i = 0; i < 3; i++) { const t = 0.3 + i * 0.12; dot(knee, new THREE.Vector3(-0.05 * t * 1.3 + 0.035 + t * 0.03, -0.72 * t, zs * 0.03), 0.0095) }
  }

  yield;
  // ---------- 躯干：精瘦、驼背；颈部前探 ----------
  const torso = new THREE.Group(); torso.position.set(0, PELVIS, 0); root.add(torso); parts.torso = torso
  {
    const spine = [V(-0.01, -0.06, 0), V(-0.03, 0.22, 0), V(-0.02, 0.5, 0), V(0.04, 0.76, 0), V(0.12, 0.92, 0), V(0.17, 1.0, 0)]
    // [t, 厚度 X, 半宽 Z]
    const prof = [[0, 0.06, 0.08], [0.08, 0.09, 0.125], [0.22, 0.085, 0.115], [0.36, 0.07, 0.09], [0.55, 0.095, 0.13], [0.72, 0.1, 0.15], [0.82, 0.085, 0.165], [0.9, 0.06, 0.09], [1, 0.05, 0.05]]
    const torsoR: RF = (t, d, cs, sn) => {
      const a = table(prof, t, 1), b = table(prof, t, 2)
      const ribs = t > 0.42 && t < 0.72 && Math.abs(d.z) > 0.4 ? 0.006 * Math.sin(t * Math.PI * 22) : 0
      const blades = d.x < -0.3 ? 0.014 * gauss(t, 0.74, 0.06) * sstep(0.2, 0.7, Math.abs(d.z)) : 0
      return ell(cs, sn, a, b) * cap(t, 0.05) + ribs + blades
    }
    const body = sweep(spine, torsoR, { radial: 18, seg: 30, vRep: 3, uRep: 2, shade: (t, d) => 0.82 + 0.16 * Math.max(0, d.x) - (d.x < -0.6 ? 0.08 : 0) - 0.08 * gauss(t, 0.36, 0.06) })
    torso.add(new THREE.Mesh(body, skin))
    // 胸口两列荧光点（附图：左胸 4 个、右胸 3 个，斜向排列）
    for (let i = 0; i < 4; i++) dot(torso, new THREE.Vector3(0.135 - i * 0.008, 0.72 - i * 0.055, -0.07 - i * 0.008))
    for (let i = 0; i < 3; i++) dot(torso, new THREE.Vector3(0.13 - i * 0.008, 0.64 - i * 0.055, 0.08 + i * 0.006))
  }

  yield;
  // ---------- 手臂：细长；褐色的手，四指带爪 ----------
  for (const zs of [-1, 1]) {
    const L = zs < 0 ? 'L' : 'R'
    const sh = new THREE.Group(); sh.position.set(0.06, 0.82, zs * 0.165); torso.add(sh); parts['arm' + L] = sh
    sh.add(new THREE.Mesh(limbSeg([V(0, 0.03, 0), V(0.005, -0.2, zs * 0.01), V(0, -0.42, 0)], 0.05, 0.036, 0.22, 0.3, 0.92), skin))
    const el = new THREE.Group(); el.position.set(0, -0.42, 0); sh.add(el); parts['elbow' + L] = el
    el.add(new THREE.Mesh(limbSeg([V(0, 0.02, 0), V(0.004, -0.2, 0), V(0, -0.41, 0)], 0.038, 0.028, 0.18, 0.25, 0.85), skin))
    // 关节球：肩、肘、腕各补一块，弯曲时两段管体的端口不会戳出来
    sh.add(new THREE.Mesh(prep(new THREE.SphereGeometry(0.052, 10, 8), 0.88), skin))
    el.add(new THREE.Mesh(prep(new THREE.SphereGeometry(0.039, 10, 8), 0.9), skin))
    const hd = new THREE.Group(); hd.position.set(0, -0.41, 0); el.add(hd); parts['hand' + L] = hd
    hd.add(new THREE.Mesh(prep(new THREE.SphereGeometry(0.03, 8, 6), 0.9), skin))
    const handG: THREE.BufferGeometry[] = [prep(limbSeg([V(0, 0.01, 0), V(0.006, -0.06, 0), V(0.008, -0.1, 0)], 0.03, 0.034, 0.1, 0.6, 0.55))]
    const clawG: THREE.BufferGeometry[] = []
    for (let f = 0; f < 4; f++) {
      const fz = (f - 1.5) * 0.017, curl = 0.035
      const pts = [V(0.008, -0.1, fz), V(0.02, -0.15, fz * 1.15), V(0.035 + curl, -0.19, fz * 1.2)]
      handG.push(prep(limbSeg(pts, 0.011, 0.008, 0.1, 0.3, 0.9)))
      const c = new THREE.ConeGeometry(0.007, 0.05, 5); c.rotateZ(Math.PI * 0.62); c.translate(0.065 + curl * 0.6, -0.205, fz * 1.2); clawG.push(c)
    }
    { // 拇指
      handG.push(prep(limbSeg([V(0.02, -0.04, -zs * 0.02), V(0.05, -0.08, -zs * 0.028), V(0.07, -0.11, -zs * 0.026)], 0.012, 0.008, 0.1, 0.3, 0.9)))
      const c = new THREE.ConeGeometry(0.0065, 0.04, 5); c.rotateZ(Math.PI * 0.7); c.translate(0.09, -0.12, -zs * 0.026); clawG.push(c)
    }
    hd.add(new THREE.Mesh(merge(handG), hand))
    hd.add(new THREE.Mesh(merge(clawG.map((g) => prep(g))), claw))
  }

  yield;
  // ---------- 头：深色颅骨 + 椭圆甲壳面具（左右两片）+ 甲壳下的尖牙巨口 ----------
  const head = new THREE.Group(); head.position.set(0.17, 1.03, 0); torso.add(head); parts.head = head
  head.add(new THREE.Mesh(prep(new THREE.SphereGeometry(0.1, 14, 10).scale(1.05, 1.15, 0.95)), skin))
  {
    // 巨口：一圈尖牙的红黑口腔；静止时缩到看不见，甲壳张开时放出
    const mouth = new THREE.Group(); mouth.position.set(0.075, -0.035, 0); head.add(mouth); parts.mouth = mouth
    mouth.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8).scale(0.55, 1.35, 1), maw))
    mouth.add(new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.012, 6, 18).scale(1, 1.35, 1).rotateY(Math.PI / 2), gum))
    const teeth: THREE.BufferGeometry[] = []
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, len = 0.026 + R() * 0.018
      const c = new THREE.ConeGeometry(0.0085, len, 5); c.translate(0, -len / 2, 0)
      c.rotateX(a + Math.PI); // 尖端朝口腔中心
      c.translate(0.004, Math.cos(a) * 0.078, Math.sin(a) * 0.058)
      teeth.push(prep(c))
    }
    mouth.add(new THREE.Mesh(merge(teeth), tooth))
    mouth.scale.setScalar(0.01)
    // 面具两片：铰在脸两侧（z=±0.085），向外翻开
    for (const zs of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(0.03, 0, zs * 0.085); head.add(hinge); parts[zs < 0 ? 'carL' : 'carR'] = hinge
      const half = new THREE.SphereGeometry(0.1, 16, 14, zs < 0 ? Math.PI : 0, Math.PI, 0, Math.PI)
      // 半球：phi 0..π 覆盖 +Z 一侧；这里只要朝前（+X）的那半张脸 → 压扁成面具壳
      half.scale(0.62, 1.32, 0.95)
      const pa = half.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pa.count; i++) { // 只保留前半球：后侧点压回脸面
        const x = pa.getX(i); if (x < 0) pa.setX(i, x * 0.12)
      }
      half.computeVertexNormals()
      half.translate(0.045, -0.01, -zs * 0.085)
      const shellMesh = new THREE.Mesh(prep(half), maskM); hinge.add(shellMesh)
      // 中缝：一道暗线
      // 眼（附图）：贴着面具曲面、靠两侧外缘的一对小杏仁形黑眼窝，眼角外高内低；
      // 里面是一粒发蓝光的小虹膜，中心一点白色高光，四周一圈淡淡的蓝色光晕。左眼略高、略大。
      const ez = zs * 0.05, ey = zs < 0 ? 0.045 : 0.026, big = zs < 0 ? 1.08 : 1
      const ax = 0.062, ay = 0.132, az = 0.095, cy = -0.01 // 面具椭球（头部坐标）的半轴与中心
      const ky = (ey - cy) / ay, kz = ez / az, ex = 0.075 + ax * Math.sqrt(Math.max(0, 1 - ky * ky - kz * kz))
      const nrm = new THREE.Vector3((ex - 0.075) / (ax * ax), (ey - cy) / (ay * ay), ez / (az * az)).normalize()
      const eye = new THREE.Group(); eye.position.set(ex - 0.03 + nrm.x * 0.001, ey, ez - zs * 0.085); hinge.add(eye)
      eye.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), nrm)
      const slant = new THREE.Group(); slant.rotation.x = -zs * 0.38; slant.scale.setScalar(big); eye.add(slant)
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 8).scale(0.22, 0.6, 1.1), socketM); slant.add(sock)
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0092, 10, 8).scale(0.5, 1, 1), eyeMat); iris.position.set(0.0035, -0.0005, zs * 0.0015); slant.add(iris)
      const hi = new THREE.Mesh(new THREE.SphereGeometry(0.0028, 6, 4), eyeCore); hi.position.set(0.0068, 0.0004, zs * 0.0015); slant.add(hi)
      const halo = new THREE.Mesh(new THREE.CircleGeometry(0.024, 18), eyeHalo); halo.rotation.y = Math.PI / 2; halo.position.set(0.0075, 0, zs * 0.0015); slant.add(halo)
      eyeHalos.push(halo)
    }
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.2, 0.004), new THREE.MeshBasicMaterial({ color: '#4a3c26' })); seam.position.set(0.108, -0.02, 0); head.add(seam); parts.seam = seam
  }

  yield;
  // ---------- 鲨皮头罩：鲨头罩住头顶，上颚利齿围着脸，下颚挂在下巴下 ----------
  const hood = new THREE.Group(); hood.name = 'sharkHood'; head.add(hood); parts.hood = hood
  {
    const pts = [V(0.43, 0.215, 0), V(0.3, 0.22, 0), V(0.12, 0.2, 0), V(-0.05, 0.16, 0), V(-0.16, 0.07, 0), V(-0.2, -0.04, 0)]
    // [t, 半径, 竖向压扁]
    const prof = [[0, 0.012, 0.8], [0.08, 0.06, 0.7], [0.25, 0.115, 0.62], [0.5, 0.16, 0.6], [0.75, 0.165, 0.68], [1, 0.15, 0.8]]
    const hr: RF = (t, _d, cs, sn) => {
      const r = table(prof, t, 1), f = table(prof, t, 2)
      return r * ell(cs, sn, f, 1) * (t < 0.04 ? cap(t, 0.04) : 1)
    }
    // n1≈-Y：cs>0 朝下（腹面浅），cs<0 朝上（背面深）
    const g = sweep(pts, hr, { radial: 18, seg: 24, vRep: 1.5, uRep: 1.5, shade: (_t, _d, cs) => cs > 0 ? 0.88 + cs * 0.14 : 0.5 + (1 + cs) * 0.38 })
    hood.add(new THREE.Mesh(g, shark))
    // 上颚齿列：沿马蹄形排在头罩下沿，齿尖朝下，把脸框在中间
    const teeth: THREE.BufferGeometry[] = []
    const N = 15
    for (let i = 0; i < N; i++) {
      const s = (i / (N - 1)) * 2 - 1, a = s * 1.45
      const x = 0.08 + Math.cos(a) * 0.19, z = Math.sin(a) * 0.125, y = 0.11 + (1 - Math.cos(a)) * 0.02
      const len = 0.03 + (1 - Math.abs(s)) * 0.022 + R() * 0.01
      const c = new THREE.ConeGeometry(0.0095, len, 5); c.rotateX(Math.PI); c.translate(x, y - len / 2, z)
      teeth.push(prep(c))
    }
    hood.add(new THREE.Mesh(merge(teeth), tooth))
    // 头罩两侧的鲨鱼眼：白色、红褐色虹膜环
    for (const zs of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8).scale(1.3, 0.75, 0.55), sharkEye); e.position.set(0.17, 0.25, zs * 0.12); hood.add(e)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 5, 16).scale(1.3, 0.75, 1), sharkIris); ring.position.copy(e.position); ring.position.z += zs * 0.004; hood.add(ring)
    }
    // 鳃裂：头罩后侧三道暗红斜缝（附图）
    const gills: THREE.BufferGeometry[] = []
    for (const zs of [-1, 1]) for (let i = 0; i < 3; i++) {
      const b = new THREE.BoxGeometry(0.008, 0.07, 0.008); b.rotateZ(0.3); b.rotateY(zs * 0.35); b.translate(-0.07 - i * 0.035, 0.05 - i * 0.012, zs * (0.158 - i * 0.004)); gills.push(prep(b))
    }
    hood.add(new THREE.Mesh(merge(gills), gill))
    // 下颚：马蹄形，挂在下巴下面，齿尖朝上
    const jaw = new THREE.Group(); jaw.position.set(-0.04, -0.06, 0); head.add(jaw); parts.sharkJaw = jaw
    const jawPts = [V(-0.02, 0.02, -0.13), V(0.1, -0.08, -0.12), V(0.22, -0.12, -0.05), V(0.25, -0.125, 0), V(0.22, -0.12, 0.05), V(0.1, -0.08, 0.12), V(-0.02, 0.02, 0.13)]
    jaw.add(new THREE.Mesh(sweep(jawPts, (t, _d, cs, sn) => (0.024 + 0.01 * gauss(t, 0.5, 0.25)) * cap(t, 0.06) * ell(cs, sn, 1, 0.75), { radial: 10, seg: 20, shade: (_t, d) => 0.75 + Math.max(0, -d.y) * 0.3 }), shark))
    const lowT: THREE.BufferGeometry[] = []
    const curve = new THREE.CatmullRomCurve3(jawPts)
    for (let i = 1; i < 14; i++) {
      const p = curve.getPointAt(i / 14), len = 0.028 + R() * 0.018
      const c = new THREE.ConeGeometry(0.009, len, 5); c.translate(p.x, p.y + 0.03 + len / 2, p.z); lowT.push(prep(c))
    }
    jaw.add(new THREE.Mesh(merge(lowT), tooth))
  }

  yield;
  // ---------- 鲨身：从后颈沿背垂下，背鳍、胸鳍、尾鳍；颈侧鳃裂 ----------
  const pelt = new THREE.Group(); pelt.name = 'sharkPelt'; torso.add(pelt); parts.pelt = pelt
  {
    // 躯干坐标（原点在骨盆）。n1≈+X?——竖直向下的切线：n1 = T×Z ≈ (-1,0,0)，cs>0 朝后（背面深）
    const pts = [V(0.03, 1.06, 0), V(-0.12, 0.92, 0), V(-0.22, 0.6, 0), V(-0.25, 0.22, 0), V(-0.22, -0.2, 0), V(-0.16, -0.58, 0), V(-0.12, -0.84, 0)]
    const prof = [[0, 0.13, 0.15], [0.12, 0.12, 0.19], [0.3, 0.11, 0.2], [0.5, 0.09, 0.17], [0.7, 0.065, 0.12], [0.88, 0.04, 0.065], [1, 0.03, 0.04]]
    const pr: RF = (t, _d, cs, sn) => ell(cs, sn, table(prof, t, 1), table(prof, t, 2))
    const g = sweep(pts, pr, { radial: 18, seg: 30, vRep: 3, uRep: 1.5, shade: (_t, d) => d.x < 0 ? 0.48 + Math.max(0, 1 + d.x) * 0.3 : 0.92 })
    pelt.add(new THREE.Mesh(g, shark))
    const fin = (pts2: number[][], depth: number) => {
      const s = new THREE.Shape(); s.moveTo(pts2[0][0], pts2[0][1]); for (let i = 1; i < pts2.length; i++) s.lineTo(pts2[i][0], pts2[i][1]); s.closePath()
      const eg = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: 0.008, bevelSegments: 1, steps: 1 })
      eg.translate(0, 0, -depth / 2)
      return eg
    }
    const finShade = (g2: THREE.BufferGeometry, v: number) => { const n = prep(g2, v); return n }
    // 背鳍：长在肩胛后，向后上方扫出（XY 平面，厚度沿 Z）
    {
      const g2 = fin([[0, -0.16], [0.02, 0.12], [-0.12, 0.2], [-0.42, 0.36], [-0.3, 0.12], [-0.2, -0.06]], 0.018)
      const m = new THREE.Mesh(finShade(g2, 0.62), shark); m.position.set(-0.3, 0.6, 0); pelt.add(m); parts.dorsal = m
    }
    // 胸鳍：挂在鲨身两侧，向后下方垂
    for (const zs of [-1, 1]) {
      const g2 = fin([[0, 0], [0.06, -0.02], [-0.06, -0.3], [-0.2, -0.42], [-0.08, -0.12]], 0.014)
      const m = new THREE.Mesh(finShade(g2, 0.7), shark); m.position.set(-0.2, 0.62, zs * 0.17); m.rotation.set(zs * 0.5, 0, 0.15); pelt.add(m); parts['pect' + (zs < 0 ? 'L' : 'R')] = m
    }
    // 尾鳍：两瓣，长瓣朝下后
    {
      const tail = new THREE.Group(); tail.position.set(-0.12, -0.84, 0); pelt.add(tail); parts.tail = tail
      const g2 = fin([[0.02, 0.04], [0.04, -0.06], [0.0, -0.22], [-0.08, -0.36], [-0.06, -0.18], [-0.04, -0.02], [-0.16, 0.02], [-0.26, 0.14], [-0.06, 0.08]], 0.016)
      tail.add(new THREE.Mesh(finShade(g2, 0.68), shark))
    }
  }

  yield;
  // ---------- 长矛：细长深色矛杆 + 巨兽牙磨成的矛头 + 缠绳 ----------
  {
    const spear = new THREE.Group(); spear.name = 'tinySpear'; parts.spear = spear
    const wood = litMaterial({ color: '#25262c', roughness: 0.55, envBase: 0.2 })
    const toothTip = litMaterial({ color: '#a39b88', roughness: 0.45, envBase: 0.25, emissive: '#1a1813', emissiveIntensity: 0.2 })
    const cord = litMaterial({ color: '#3c3a33', roughness: 0.9 })
    const shaft = new THREE.CylinderGeometry(0.016, 0.02, 2.9, 8); shaft.translate(0, 0.25, 0)
    spear.add(new THREE.Mesh(shaft, wood))
    const tipG = new THREE.ConeGeometry(0.038, 0.42, 7, 3); tipG.scale(1, 1, 0.55)
    const pa = tipG.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pa.count; i++) { const y = pa.getY(i); pa.setX(i, pa.getX(i) + (0.21 - y) * 0 + Math.sin((y + 0.21) * 4) * 0.008) } // 牙的弧度
    tipG.computeVertexNormals(); tipG.translate(0, 1.7 + 0.21, 0)
    spear.add(new THREE.Mesh(tipG, toothTip))
    const binds: THREE.BufferGeometry[] = []
    for (let i = 0; i < 5; i++) { const b = new THREE.TorusGeometry(0.022, 0.006, 4, 10); b.rotateX(Math.PI / 2); b.translate(0, 1.62 + i * 0.022, 0); binds.push(b) }
    const butt = new THREE.SphereGeometry(0.026, 8, 6); butt.translate(0, -1.2, 0); binds.push(butt)
    spear.add(new THREE.Mesh(merge(binds), cord))
    spear.userData.gripX = 0
    parts.handR.add(spear)
  }

  for (const [parent, list] of spots) { const sm = new THREE.Mesh(merge(list), spotMat); sm.name = 'glowSpots'; parent.add(sm) }
  poseTiny(grp, {})
  complete = true
  return grp
  } finally { if (!complete) disposeL8Tree(grp) }
}

export function buildTinyMesh(): THREE.Group {
  const job = buildTinyJob()
  for (;;) { const next = job.next(); if (next.done) return next.value }
}

const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0)
/** 让长矛在模型空间里指向 dir（握点在右手掌心） */
export function aimSpear(grp: THREE.Group, dir: THREE.Vector3) {
  const parts = grp.userData.parts as Record<string, THREE.Object3D>
  const sp = parts.spear, hand = parts.handR
  grp.updateMatrixWorld(true)
  grp.getWorldQuaternion(_q1).invert(); hand.getWorldQuaternion(_q2); _q1.multiply(_q2) // 手相对模型根的朝向
  const target = new THREE.Quaternion().setFromUnitVectors(_up, dir)
  sp.quaternion.copy(_q1.invert().multiply(target))
  sp.position.set(0.035, -0.13, 0)
}

/** 静态造型姿势（预览与渲染层的基姿势）。数值全部写死，可重复调用。 */
export function poseTiny(grp: THREE.Group, p: TinyPose) {
  const parts = grp.userData.parts as Record<string, THREE.Object3D>
  const open = p.open ?? 0, lean = p.lean ?? 0, mode = p.spear ?? 'hold'
  parts.torso.rotation.set(0, 0, -0.12 - lean * 0.55)
  parts.head.rotation.set((p.headTilt ?? 0), (p.headYaw ?? 0), 0.18 + lean * 0.35)
  // 腿：微屈，一前一后（附图的跨步站姿）
  parts.legL.rotation.set(0, 0, 0.28 + lean * 0.2); parts.kneeL.rotation.set(0, 0, -0.42)
  parts.legR.rotation.set(0, 0, -0.08 + lean * 0.2); parts.kneeR.rotation.set(0, 0, -0.12)
  // 手臂：右手在前上、左手在腰侧，两手斜持长矛（附图）；矛的朝向按模型空间方向反解，不随手臂链累积误差
  let dir: THREE.Vector3
  if (mode === 'hold') {
    parts.armR.rotation.set(-0.25, 0, 0.75); parts.elbowR.rotation.set(0, 0, 1.15); parts.handR.rotation.set(0, 0, -0.1)
    parts.armL.rotation.set(0.05, 0, 0.55); parts.elbowL.rotation.set(0, 0, 0.55); parts.handL.rotation.set(0, 0, 0)
    dir = new THREE.Vector3(0.86, 0.5, -0.1)
  } else if (mode === 'raise') {
    parts.armR.rotation.set(-0.3, 0, 2.5); parts.elbowR.rotation.set(0, 0, 0.5); parts.handR.rotation.set(0, 0, 0)
    parts.armL.rotation.set(0.3, 0, 0.9); parts.elbowL.rotation.set(0, 0, 0.6); parts.handL.rotation.set(0, 0, -0.1)
    dir = new THREE.Vector3(0.92, -0.32, 0)
  } else {
    parts.armR.rotation.set(-0.12, 0, 1.5); parts.elbowR.rotation.set(0, 0, 0.12); parts.handR.rotation.set(0, 0, 0)
    parts.armL.rotation.set(0.2, 0, 1.0); parts.elbowL.rotation.set(0, 0, 0.5); parts.handL.rotation.set(0, 0, -0.2)
    dir = new THREE.Vector3(1, -0.04, -0.12)
  }
  aimSpear(grp, dir.normalize())
  parts.spear.userData.gripX = parts.spear.position.x
  parts.carL.rotation.set(0, open * 1.15, 0); parts.carR.rotation.set(0, -open * 1.15, 0)
  parts.seam.visible = open < 0.05
  parts.mouth.scale.setScalar(0.01 + open * 0.99)
  parts.sharkJaw.rotation.set(0, 0, -0.08 - open * 0.3)
}
