// v77：窃皮者（Entity 10）重制模型——参照中文维基 Entity 10 正文与用户附图（门口探身的高瘦苍白人形）。
// 真身：约 2.15 m 的高大类人形，皮肤淡黄；病态细长——窄肩溜肩、细腰、微驼背、头向前探；
// 手臂极长（垂到膝盖），手指细长；光头，长颅、凹颊，深深凹陷的眼窝里是纯白的眼球，鼻与嘴几乎看不出。
// 体表布满微小凸起，像章鱼触手上的吸盘（程序化颜色贴图 + 凹凸贴图：外圈隆起、中心凹陷），
// 皮肤明暗另有顶点色 AO（肋下、锁骨、关节）。
// 伪装态不在这里：穿着人皮时渲染层使用随机 NPC 外观（retroAvatar，stolen 破绽见 avatarSpec），
// 剥皮现形由渲染层负责过渡（人皮塌落淡出 + 真身从内撑开），不留下人皮。
// 造型工具沿用猎犬/钝人的样条扫掠管体；贴图运行时程序化生成，无外部资源。模型正面 +X。
import * as THREE from 'three'
import { installL0EnvironmentShader } from './l0EnvironmentShader'
import { installL1DynamicProbe } from './l1Probes'
import type { Entity } from '../entities'
import { rng, merge, V, gauss, sstep, cap, ell, sweep, limbSeg, canvasTex, type RF } from './houndMesh'

let TEX: { skin: THREE.Texture | null; bump: THREE.Texture | null; head: THREE.Texture | null; headBump: THREE.Texture | null } | null = null
/** 吸盘点阵（颜色/高度两张图共用同一组随机点，保证凸起与明暗对齐） */
function suckers(R: () => number, n: number) {
  const s: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < n; i++) s.push({ x: R() * 256, y: R() * 256, r: 1.4 + R() * 2.6 })
  return s
}
function textures() {
  if (TEX) return TEX
  const tile = (f: (ox: number, oy: number) => void) => { for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) f(ox, oy) }
  const build = (count: number, seed: number) => {
    const pts = suckers(rng(seed), count)
    const color = canvasTex(256, 256, (c, R) => {
      c.fillStyle = '#e3d9b6'; c.fillRect(0, 0, 256, 256)
      for (let i = 0; i < 150; i++) { // 蜡黄的斑驳：偏绿的暗斑 / 偏白的亮斑
        const x = R() * 256, y = R() * 256, r = 6 + R() * 30, a = 0.04 + R() * 0.08
        const col = R() < 0.55 ? `rgba(170,156,104,${a})` : `rgba(246,240,214,${a})`
        tile((ox, oy) => { c.fillStyle = col; c.beginPath(); c.arc(x + ox, y + oy, r, 0, Math.PI * 2); c.fill() })
      }
      for (let i = 0; i < 12; i++) { // 透出的淡青静脉
        let x = R() * 256, y = R() * 256, a = R() * Math.PI * 2
        const pts2: [number, number][] = [[x, y]]
        for (let k = 0; k < 12; k++) { a += (R() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; pts2.push([x, y]) }
        const lw = 0.5 + R()
        tile((ox, oy) => { c.strokeStyle = 'rgba(110,128,120,0.2)'; c.lineWidth = lw; c.beginPath(); pts2.forEach(([px, py], k) => k ? c.lineTo(px + ox, py + oy) : c.moveTo(px + ox, py + oy)); c.stroke() })
      }
      for (const p of pts) tile((ox, oy) => { // 吸盘：亮环 + 暗心
        c.fillStyle = 'rgba(248,242,218,0.6)'; c.beginPath(); c.arc(p.x + ox, p.y + oy, p.r, 0, Math.PI * 2); c.fill()
        c.fillStyle = 'rgba(140,122,78,0.55)'; c.beginPath(); c.arc(p.x + ox, p.y + oy, p.r * 0.45, 0, Math.PI * 2); c.fill()
      })
      const img = c.getImageData(0, 0, 256, 256), d = img.data
      for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 12; d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.7 }
      c.putImageData(img, 0, 0)
    }, true)
    const bump = canvasTex(256, 256, (c) => {
      c.fillStyle = '#808080'; c.fillRect(0, 0, 256, 256)
      for (const p of pts) tile((ox, oy) => {
        const g = c.createRadialGradient(p.x + ox, p.y + oy, 0, p.x + ox, p.y + oy, p.r * 1.25)
        g.addColorStop(0, '#3a3a3a'); g.addColorStop(0.35, '#606060'); g.addColorStop(0.7, '#e0e0e0'); g.addColorStop(1, 'rgba(128,128,128,0)')
        c.fillStyle = g; c.beginPath(); c.arc(p.x + ox, p.y + oy, p.r * 1.25, 0, Math.PI * 2); c.fill()
      })
    }, true)
    if (bump) bump.colorSpace = THREE.NoColorSpace
    return { color, bump }
  }
  const body = build(520, 0x10a), head = build(170, 0x10b) // 头部吸盘稀疏，免得近看像麻子脸
  TEX = { skin: body.color, bump: body.bump, head: head.color, headBump: head.bump }
  for (const texture of Object.values(TEX)) if (texture) texture.userData.entityShared = true
  return TEX
}

export interface SkinStealerRig {
  root: THREE.Group; torso: THREE.Group; neck: THREE.Group; head: THREE.Group
  legs: { hip: THREE.Group; knee: THREE.Group; side: number }[]
  arms: { sh: THREE.Group; elbow: THREE.Group; wrist: THREE.Group; fingers: THREE.Group; side: number }[]
  eyes: THREE.Mesh[]
}

const fillColor = (g: THREE.BufferGeometry, v: number) => { g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(v), 3)); return g }

export function buildSkinStealerMesh(seed = 0): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'skinstealer'
  grp.userData.parts = {}
  const R = rng(0x5c1 + seed * 613)
  const tx = textures()
  const skin = new THREE.MeshLambertMaterial({ color: '#ffffff', map: tx.skin, bumpMap: tx.bump ?? null, bumpScale: 0.9, vertexColors: true })
  const headSkin = new THREE.MeshLambertMaterial({ color: '#ffffff', map: tx.head, bumpMap: tx.headBump ?? null, bumpScale: 0.6, vertexColors: true })
  if (!tx.skin) { skin.color.set('#c9bb88'); headSkin.color.set('#cfc290') }
  const nail = new THREE.MeshLambertMaterial({ color: '#8c7d54', vertexColors: true })
  // 眼球：纯白、微弱自发光（深窝里也能看出两点白），不做瞳孔
  const eyeM = new THREE.MeshLambertMaterial({ color: '#f4f2ea', emissive: new THREE.Color('#d8d6cc'), emissiveIntensity: 0.32 })
  const socketM = new THREE.MeshLambertMaterial({ color: '#4a3f26', vertexColors: true })
  for (const material of [skin, headSkin, nail, eyeM, socketM]) {
    installL0EnvironmentShader(material)
    installL1DynamicProbe(material)
  }
  const root = new THREE.Group(); grp.add(root)
  const PELVIS = 1.08

  // ---------- 躯干：窄肩溜肩、细腰、微驼背；肋下与锁骨用起伏 + AO 表现消瘦 ----------
  const torso = new THREE.Group(); torso.position.set(0, PELVIS, 0); root.add(torso)
  {
    const spine = [V(-0.015, 0.0, 0), V(-0.03, 0.2, 0), V(-0.015, 0.4, 0), V(0.02, 0.58, 0), V(0.07, 0.71, 0)]
    // [t, 半宽 Z, 厚度 X]
    const prof = [[0, 0.1, 0.08], [0.1, 0.118, 0.088], [0.3, 0.088, 0.068], [0.46, 0.12, 0.088], [0.66, 0.148, 0.098], [0.84, 0.17, 0.088], [0.94, 0.19, 0.07], [1, 0.07, 0.05]]
    const lerpP = (t: number, k: 1 | 2) => { for (let i = 1; i < prof.length; i++) if (t <= prof[i][0]) { const a = prof[i - 1], b = prof[i]; const s = sstep(0, 1, (t - a[0]) / (b[0] - a[0])); return a[k] + (b[k] - a[k]) * s } return prof[prof.length - 1][k] }
    const det = (t: number, cs: number, sn: number) => {
      const tr = t + 0.06 * cs
      const ribBand = tr > 0.48 && tr < 0.84 ? Math.sin((tr - 0.48) * Math.PI * 11) * sstep(0.48, 0.52, tr) * sstep(0.84, 0.78, tr) : 0
      const ribs = 0.005 * ribBand * sstep(-0.3, 0.3, cs) * (1 - gauss(sn, 0, 0.3) * sstep(0.4, 0.9, cs))
      const belly = -0.012 * gauss(t, 0.36, 0.07) * sstep(0, 0.8, cs) // 肋弓下深凹（饥饿的腹部）
      const spineB = cs < -0.85 ? 0.008 * Math.max(0, Math.sin(t * Math.PI * 20)) ** 2 : 0
      const hips = 0.02 * gauss(t, 0.08, 0.06) * sstep(0.5, 0.9, Math.abs(sn))
      const clav = 0.01 * gauss(t, 0.9, 0.035) * sstep(0.2, 0.9, cs)
      const blade = 0.014 * gauss(t, 0.8, 0.06) * sstep(-0.2, -0.8, cs) * sstep(0.2, 0.6, Math.abs(sn)) // 肩胛
      return { ribs, belly, spineB, hips, clav, blade, ribBand }
    }
    const torsoR: RF = (t, _d, cs, sn) => {
      const rz = lerpP(t, 1), rx = lerpP(t, 2), k = det(t, cs, sn)
      return rz * ell(cs, sn, rx / rz, 1) * cap(t, 0.035) + k.ribs + k.belly + k.spineB + k.hips + k.clav + k.blade
    }
    const tg = sweep(spine, torsoR, {
      radial: 22, seg: 40, uRep: 2, vRep: 2.6,
      shade: (t, _d, cs, sn) => {
        const k = det(t, cs, sn)
        return Math.min(1.1, 0.88 + k.ribs * 10 + k.clav * 6 + k.blade * 4 + k.belly * 9 + k.hips * 3 - Math.max(0, -k.ribBand) * 0.1 - (t < 0.06 ? 0.1 : 0))
      },
    })
    torso.add(new THREE.Mesh(tg, skin))
  }
  // 脖子：细长、前探；颈部组单独旋转（探头动作）
  const neck = new THREE.Group(); neck.position.set(0.065, 0.63, 0); torso.add(neck)
  neck.rotation.z = -0.32 // 头向前探（附图中脖子前伸）
  {
    const ng = sweep([V(-0.01, 0, 0), V(0.0, 0.1, 0), V(0.012, 0.22, 0)], (t, _d, cs, sn) => (0.04 + 0.05 * sstep(0.35, 0, t) * sstep(0.2, 0.9, Math.abs(sn))) * (t > 0.92 ? 0.8 : 1) * ell(cs, sn, 1.05, 0.9) + 0.005 * gauss(t, 0.55, 0.15) * sstep(0.5, 1, Math.abs(sn)), { radial: 12, seg: 10, shade: (t) => 0.82 + 0.12 * t })
    neck.add(new THREE.Mesh(ng, skin))
  }

  // ---------- 头：长颅、光头、凹颊；深深凹陷的眼窝里是纯白眼球；鼻与嘴几乎平 ----------
  const HH = 0.255
  const head = new THREE.Group(); head.position.set(0.012, 0.17, 0); neck.add(head)
  head.rotation.z = 0.18 // 抵消一部分探颈，让脸略朝前下方
  const eyes: THREE.Mesh[] = []
  {
    const g = new THREE.SphereGeometry(1, 44, 30)
    const pa = g.attributes.position as THREE.BufferAttribute, col: number[] = []
    const d = new THREE.Vector3()
    const EY = 0.6, EZ = 0.37 // 眼窝中心（hy 高度、横向 |w|）
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i).normalize()
      const hy = (d.y + 1) / 2 // 0 下巴 → 1 头顶
      const front = sstep(0.15, 0.85, d.x)
      // 截面：上宽（颅顶）、颧下收窄、下颌尖；前后比左右长一点（长颅）
      const zr = 0.082 * (0.48 + 0.52 * sstep(0.02, 0.7, hy)) * (1 - 0.08 * sstep(0.88, 1, hy))
      const xr = 0.096 * (d.x > 0 ? 0.62 + 0.38 * sstep(0.12, 0.62, hy) : 0.75 + 0.25 * sstep(0.1, 0.5, hy))
      let x = d.x * xr * (d.x < 0 ? 1.08 : 1), z = d.z * zr
      const y = hy * HH
      const w = d.z / Math.max(0.2, Math.sqrt(1 - d.y * d.y))
      // 凹颊（颧骨下方两侧深凹）
      const cheek = -0.01 * gauss(hy, 0.38, 0.08) * sstep(0.2, 0.6, Math.abs(w)) * front
      // 颧骨 / 眉弓外突
      const zyg = 0.008 * gauss(hy, 0.5, 0.035) * sstep(0.3, 0.7, Math.abs(w)) * front
      const brow = 0.012 * gauss(hy, 0.71, 0.04) * gauss(Math.abs(w), EZ, 0.22) * front
      // 眼窝：两个深坑
      const sock = -0.036 * Math.exp(-(((hy - EY) / 0.085) ** 2 + ((Math.abs(w) - EZ) / 0.2) ** 2)) * front
      // 鼻：极低的一道鼻梁 + 两个鼻孔小凹；嘴：一道浅缝
      const noseB = 0.004 * gauss(w, 0, 0.06) * gauss(hy, 0.47, 0.05) * front
      const mouth = -0.004 * gauss(hy, 0.3, 0.012) * sstep(0.25, 0.05, Math.abs(w)) * front
      const jawLine = -0.006 * gauss(hy, 0.16, 0.05) * sstep(0.4, 0.8, Math.abs(w))
      const dx = cheek + zyg + brow + sock + noseB + mouth
      x += dx * (d.x > 0 ? 1 : 0); z += (jawLine + cheek * 0.5) * Math.sign(d.z) * (1 - front * 0.5)
      pa.setXYZ(i, x, y, z)
      const c = Math.max(0.28, Math.min(1.12, 0.94 + brow * 6 + zyg * 8 + sock * 19 + cheek * 10 + mouth * 40 - (hy < 0.12 ? 0.1 : 0)))
      col.push(c, c * 0.98, c * 0.94)
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals()
    head.add(new THREE.Mesh(g, headSkin))
    // 窝底暗垫（加深凹陷感）+ 眼球：缩在窝内，前缘不超出眉弓
    for (const s of [-1, 1]) {
      const yy = EY * HH, zz = s * EZ * 0.08 * 0.95
      const pad = fillColor(new THREE.SphereGeometry(0.022, 10, 8).scale(0.45, 1, 1.2), 0.6)
      const pm = new THREE.Mesh(pad, socketM); pm.position.set(0.052, yy, zz); head.add(pm)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 10, 8).scale(0.75, 0.85, 1), eyeM)
      eye.position.set(0.058, yy - 0.001, zz); eye.userData.face = 1
      head.add(eye); eyes.push(eye)
    }
  }

  // ---------- 腿：细长，膝骨外凸；脚掌窄长 ----------
  const legs: SkinStealerRig['legs'] = []
  for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(-0.01, PELVIS - 0.03, side * 0.09); root.add(hip)
    const thigh = limbSeg([V(0, 0.09, 0), V(0.02, -0.22, side * 0.008), V(0.025, -0.5, side * 0.01)], 0.07, 0.035, 0.14, 0.2, 0.95)
    hip.add(new THREE.Mesh(thigh, skin))
    const knee = new THREE.Group(); knee.position.set(0.025, -0.5, side * 0.01); hip.add(knee)
    const kn = fillColor(new THREE.SphereGeometry(0.035, 10, 8).scale(1.0, 1.2, 0.9).translate(0.008, 0, 0), 1)
    const shin = limbSeg([V(0, 0, 0), V(-0.016, -0.24, 0), V(-0.026, -0.47, 0)], 0.038, 0.024, 0.22, 0.2, 0.95, false)
    const ank = fillColor(new THREE.SphereGeometry(0.027, 8, 6).translate(-0.026, -0.47, 0), 0.95)
    const foot = sweep([V(-0.06, -0.47, 0), V(0.02, -0.525, 0), V(0.12, -0.545, side * 0.008), V(0.2, -0.55, side * 0.012)], (t, _d, cs, sn) => (0.031 - 0.012 * t) * cap(t, 0.12) * ell(cs, sn, 0.6, 1.15), { radial: 8, seg: 8, shade: (t) => 0.82 + 0.1 * t })
    const toes: THREE.BufferGeometry[] = []
    for (let i = 0; i < 4; i++) { const z = side * 0.012 + (i - 1.5) * 0.013; toes.push(fillColor(new THREE.SphereGeometry(0.008, 6, 4).scale(1.8, 0.8, 1).translate(0.214, -0.553, z), 1)) }
    knee.add(new THREE.Mesh(merge([kn, shin, ank, foot]), skin))
    knee.add(new THREE.Mesh(merge(toes), nail))
    legs.push({ hip, knee, side })
  }

  // ---------- 手臂：极长（指尖到膝盖），肘骨外凸；手掌窄长，四指 + 拇指，指甲泛黄 ----------
  const arms: SkinStealerRig['arms'] = []
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(0.035, 0.645, side * 0.175); torso.add(sh)
    const upper = limbSeg([V(0, 0.035, side * -0.01), V(0.006, -0.22, side * 0.012), V(0, -0.47, side * 0.014)], 0.046, 0.025, 0.14, 0.12, 0.95)
    sh.add(new THREE.Mesh(upper, skin))
    const elbow = new THREE.Group(); elbow.position.set(0, -0.47, side * 0.014); sh.add(elbow)
    const eb = fillColor(new THREE.SphereGeometry(0.024, 8, 6).scale(1, 1.2, 1).translate(-0.006, 0, 0), 1)
    const fa = sweep([V(0, 0, 0), V(0.004, -0.25, 0), V(0, -0.49, 0)], (t, _d, cs, sn) => (0.027 - 0.008 * t) * (1 + 0.15 * gauss(t, 0.15, 0.1)) * ell(cs, sn, 0.85, 1) + 0.003 * Math.abs(Math.sin(t * Math.PI * 6)) * gauss(cs, 1, 0.4), { radial: 9, seg: 12, vRep: 2.5, shade: (t) => 0.84 + 0.06 * Math.sin(t * 18) })
    elbow.add(new THREE.Mesh(merge([eb, fa]), skin))
    const wrist = new THREE.Group(); wrist.position.set(0, -0.49, 0); elbow.add(wrist)
    const palm = sweep([V(0, 0.01, 0), V(0.004, -0.05, 0), V(0.002, -0.1, 0)], (t, _d, cs, sn) => (0.028 + 0.008 * Math.sin(t * Math.PI)) * cap(t, 0.15) * ell(cs, sn, 1.5, 0.55), { radial: 8, seg: 6, shade: () => 0.88 })
    wrist.add(new THREE.Mesh(palm, skin))
    // 手指单独成组：抓扑时整体蜷曲
    const fingers = new THREE.Group(); fingers.position.set(0, -0.1, 0); wrist.add(fingers)
    const hs: THREE.BufferGeometry[] = [], hn: THREE.BufferGeometry[] = []
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.016, L = 0.18 - Math.abs(i - 1.5) * 0.022
      const a = V(x, 0, 0), b = V(x * 1.15, -L * 0.5, side * -0.006), c = V(x * 1.25, -L, side * -0.024)
      hs.push(sweep([a, b, c], (t, _d, cs, sn) => 0.0088 * (1 - 0.35 * t) * (1 + 0.3 * gauss(t, 0.33, 0.06) + 0.3 * gauss(t, 0.66, 0.06)) * cap(t, 0.1) * ell(cs, sn, 1, 0.9), { radial: 6, seg: 9, shade: (t) => 0.84 + 0.12 * gauss(t, 0.33, 0.08) }))
      hn.push(sweep([c.clone().add(V(0, 0.011, side * 0.004)), c.clone().add(V(0, -0.008, side * -0.01))], (t) => 0.0058 * (1 - t * 0.7), { radial: 5, seg: 3, shade: () => 0.85 }))
    }
    hs.push(sweep([V(0.022, 0.075, 0), V(0.034, 0.035, side * -0.01), V(0.04, -0.005, side * -0.02)], (t, _d, cs, sn) => 0.0072 * (1 - 0.3 * t) * cap(t, 0.12) * ell(cs, sn, 1, 0.9), { radial: 6, seg: 6, shade: () => 0.85 }))
    fingers.add(new THREE.Mesh(merge(hs), skin))
    fingers.add(new THREE.Mesh(merge(hn), nail))
    arms.push({ sh, elbow, wrist, fingers, side })
  }

  const rig: SkinStealerRig = { root, torso, neck, head, legs, arms, eyes }
  grp.userData.ssRig = rig
  grp.userData.ssAsym = R() // 每只的待机不对称（附图里一只手臂抬起、身体歪斜）
  return grp
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** 渲染层每帧驱动（e.ss 由 skinStealerAI 维护；缺省时按通用状态推断） */
export function animateSkinStealer(grp: THREE.Group, e: Entity, time: number, gz: number) {
  const r = grp.userData.ssRig as SkinStealerRig | undefined
  if (!r) return
  const s = e.ss
  const t = time + e.id * 1.37
  const last = grp.userData.ssLast as [number, number] | undefined
  const vel = last && time > last[1] ? Math.min(8, (e.animT - last[0]) / (time - last[1])) : 0
  grp.userData.ssLast = [e.animT, time]
  const mv = grp.userData.ssMv = lerp((grp.userData.ssMv as number) ?? 0, Math.min(1, vel / 1.4), 0.15)
  const hostile = s ? s.phase === 'hunt' || s.phase === 'rage' : e.state === 'chase' || e.state === 'attack'
  const run = grp.userData.ssRun = lerp((grp.userData.ssRun as number) ?? 0, hostile && mv > 0.3 ? 1 : 0, 0.08)
  const emerge = s?.emerge ?? 0 // 剥皮现形后的「撑开」进度 1 → 0
  const asym = (grp.userData.ssAsym as number) ?? 0.5
  const lk = Math.max(0, e.lungeT) / 0.32
  const strike = lk > 0 ? (lk > 0.45 ? (1 - lk) / 0.55 : 1) : 0 // 前摇：双臂前探
  const g = e.animT * (Math.PI * 2 / (1.5 - run * 0.35))
  const amp = mv * (0.34 + run * 0.22)
  const twitch = Math.max(0, Math.sin(t * 0.71) * Math.sin(t * 1.93) - 0.75) * 4
  for (const L of r.legs) {
    const ph = L.side < 0 ? 0 : Math.PI
    L.hip.rotation.z = Math.sin(g + ph) * amp + run * 0.18
    L.hip.rotation.x = L.side * 0.035
    L.knee.rotation.z = -Math.max(0, Math.sin(g + ph + Math.PI / 2)) * amp * 1.5 - 0.05 - run * 0.25
  }
  r.root.position.y = Math.abs(Math.sin(g)) * amp * 0.05 - run * 0.07 - emerge * 0.12
  grp.position.y = gz
  // 躯干：驼背；奔跑时大幅前倾；待机缓慢左右歪斜
  r.torso.rotation.z = -(0.14 + run * 0.36 + strike * 0.2) + twitch * 0.04
  r.torso.rotation.x = (Math.sin(t * 0.43) * 0.05 + (asym - 0.5) * 0.1) * (1 - run) + Math.sin(g) * 0.05 * mv
  r.torso.rotation.y = Math.sin(t * 0.37) * 0.06
  // 颈/头：探头、慢慢转动、偶发猛抽；敌意时头更低更前
  r.neck.rotation.z = -0.42 - run * 0.15 + emerge * 0.5
  r.head.rotation.x = Math.sin(t * 0.6) * 0.1 + twitch * 0.3
  r.head.rotation.y = hostile ? 0 : Math.sin(t * 0.33) * 0.4
  r.head.rotation.z = 0.3 + run * 0.3
  // 手臂：垂到膝盖、随步摆动；待机时一只手半抬（附图姿态）；扑击时双臂前探、手指张开后蜷曲
  for (const A of r.arms) {
    const ph = A.side < 0 ? Math.PI : 0
    const raised = (A.side > 0) === (asym > 0.5) && !hostile ? 0.55 + Math.sin(t * 0.5) * 0.08 : 0
    const swing = -Math.sin(g + ph) * amp * 0.7 + Math.sin(t * 0.9 + A.side) * 0.04
    const base = swing - run * 0.5 + raised
    A.sh.rotation.z = lerp(base, 1.35 + Math.sin(t * 7 + A.side) * 0.03, strike) + emerge * 0.6
    A.sh.rotation.x = A.side * (-0.05 - run * 0.12 - emerge * 0.5) + strike * A.side * 0.12
    A.elbow.rotation.z = lerp(0.12 + raised * 0.9 + run * 0.5 + Math.max(0, Math.sin(g + ph)) * amp * 0.3, 0.1, strike)
    A.wrist.rotation.z = lerp(0.05 + raised * 0.3, -0.25, strike)
    A.fingers.rotation.z = lk > 0 ? (lk > 0.45 ? -0.35 : 0.7) : 0.15 + raised * 0.3
  }
  const sc = 1 - emerge * 0.08
  r.root.scale.set(1 + emerge * 0.04, sc, 1 + emerge * 0.04)
}
