import {disposeL8Tree} from './l8ModelResources'
// 受眷鸟（Entity 37）重制模型：依据中文维基 entity-37 与 ZAN 提供的附图。
// 造型：上方是一只巨大的半透明浮囊（外层黄绿色胶膜，里层发光的受眷胶核心，胶里悬着橙黄色的凝块），
// 下方吊着蓬乱的棕色羽团身体：领口一圈向上炸开的长羽包住浮囊底部；头与身体连成一体，两侧一对大黑眼；
// 灰色的水平钩喙（左右两片，横向张合）；从喙间垂下一条带发光肉球的诱捕舌；胸前一对短小粉色前肢，
// 腹下收着粉色的猛禽腿和深色弯爪。
// 雌雄二型：雌性更大（全高约 0.8m，浮囊大、胶核心更亮），雄性较小、羽色更深，浮囊表面长着一串发光孢子囊。
// 同文件附带：受眷胶（玻璃罐 / 涂覆后的发光胶块）、发光孢子、孢子腐液（驱蛾恶臭液）。
// 原点在身体中心（悬浮实体），模型正面 +X。
import * as THREE from 'three'
import { rng, merge, V, gauss, sstep, cap, ell, sweep, limbSeg, canvasTex as sourceCanvasTex } from './houndMesh'

let TEX: { feather: THREE.Texture | null; plume: THREE.Texture | null; glow: THREE.Texture | null; beak: THREE.Texture | null } | null = null
export function* prepareCurabiturTextures(): Generator<void, NonNullable<typeof TEX>, unknown>  {
  if (TEX) return TEX
  // 羽毛：顺向的细羽丝，棕色深浅交错
  const feather = canvasTex(128, 256, (c, R) => {
    c.fillStyle = '#a89070'; c.fillRect(0, 0, 128, 256)
    for (let i = 0; i < 260; i++) {
      const x = R() * 128, tone = 70 + R() * 70, a = 0.25 + R() * 0.4, cx = (R() - 0.5) * 14
      for (const ox of [-128, 0, 128]) { c.strokeStyle = `rgba(${tone},${tone * 0.9},${tone * 0.76},${a})`; c.lineWidth = 0.6 + R() * 1.4; c.beginPath(); c.moveTo(x + ox, 0); c.quadraticCurveTo(x + ox + cx, 128, x + ox + cx * 0.4, 256); c.stroke() }
    }
  }, true)
  yield;
  // 羽簇：透明底上的一束细羽丝（根部密、梢部散开参差），alphaTest 裁切出蓬松的轮廓
  const plume = canvasTex(64, 128, (c, R) => {
    c.clearRect(0, 0, 64, 128)
    for (let i = 0; i < 70; i++) {
      const x0 = 18 + R() * 28, x1 = x0 + (R() - 0.5) * 40, top = R() * 40, tone = 90 + R() * 80
      c.strokeStyle = `rgba(${tone},${tone * 0.9},${tone * 0.76},${0.6 + R() * 0.4})`; c.lineWidth = 0.8 + R() * 1.6
      c.beginPath(); c.moveTo(x0, 128); c.quadraticCurveTo(x0 + (x1 - x0) * 0.3, 70, x1, top); c.stroke()
    }
  }, false)
  yield;
  if (plume) plume.flipY = false
  yield;
  // 柔光晕：径向渐变（发光体的光晕贴片共用）
  const glow = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.75)'); g.addColorStop(0.45, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g; c.fillRect(0, 0, 128, 128)
  }, false)
  yield;
  const beak = canvasTex(64, 128, (c, R) => {
    c.fillStyle = '#7d8590'; c.fillRect(0, 0, 64, 128)
    for (let i = 0; i < 40; i++) { const y = R() * 128; c.fillStyle = `rgba(${R() < 0.5 ? '40,44,52' : '170,176,186'},0.25)`; c.fillRect(0, y, 64, 0.8 + R() * 1.6) }
  }, true)
  yield;
  TEX = { feather, plume, glow, beak }
  yield;
  return TEX
}

/** 加色光晕贴片（始终面向镜头） */
export function glowSprite(color: THREE.ColorRepresentation, size: number, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures().glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }))
  s.geometry=s.geometry.clone() // Sprite buffers belong to this model instance.
  s.scale.setScalar(size)
  return s
}

const paint = (g: THREE.BufferGeometry, f: (p: THREE.Vector3) => number) => {
  const pa = g.attributes.position as THREE.BufferAttribute, p = new THREE.Vector3(), col: number[] = []
  for (let i = 0; i < pa.count; i++) { p.fromBufferAttribute(pa, i); const c = f(p); col.push(c, c, c) }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g
}
const noUV = (g: THREE.BufferGeometry) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 2).fill(0), 2)); return g }

export type CurabiturSex = 'female' | 'male'
export interface CurabiturRig {
  sex: CurabiturSex
  body: THREE.Group; head: THREE.Group; sac: THREE.Group
  /** 左右两片喙，绕 Y 横向张合 */
  beak: THREE.Group[]
  /** 诱捕舌：tongue 组可伸缩（scale.y），lure 为舌尖发光肉球 */
  tongue: THREE.Group; lure: THREE.Object3D
  arms: THREE.Group[]; legs: THREE.Group[]
  /** 发光部件的材质（阶段 2/3 调亮度、呼吸闪烁） */
  glow: { core: THREE.MeshBasicMaterial; membrane: THREE.MeshPhongMaterial; lure: THREE.MeshBasicMaterial; spores: THREE.MeshBasicMaterial | null }
  /** 雄性浮囊表面的孢子囊（位置，阶段 3 散播时从这里飞出） */
  sporePods: THREE.Vector3[]
  lights: THREE.PointLight[]
}

/**
 * sex：雌性 / 雄性；lights：是否挂实时点光源（预览与近处个体用，远处个体只靠自发光材质）。
 */
export function* buildCurabiturJob(sex: CurabiturSex = 'female', seed = 0, o: { lights?: boolean } = {}): Generator<void, THREE.Group, unknown> {
  const grp = new THREE.Group();
 let complete=false
 try { grp.userData.entityType = 'curabitur'
  yield;
  const R = rng(0xc37 + seed * 389 + (sex === 'male' ? 7 : 0))
  yield;
  const tx = textures()
  yield;
  const male = sex === 'male'
  yield;
  const S = male ? 0.74 : 1
  yield; // 雄性整体更小
  const featherCol = male ? '#d2c2a8' : '#ece0cc'
  yield;
  // 背光一侧补一点自发光底色（emissiveMap 用同一张羽纹，暗处也保留羽丝层次），避免背光面糊成黑块
  const featherEm = male ? '#5e4f3c' : '#6a5a46'
  yield;
  const featherM = new THREE.MeshLambertMaterial({ color: featherCol, map: tx.feather, vertexColors: true, side: THREE.DoubleSide, emissive: featherEm, emissiveMap: tx.feather })
  yield;
  const plumeM = new THREE.MeshLambertMaterial({ color: featherCol, map: tx.plume, vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.35, emissive: featherEm, emissiveMap: tx.plume })
  yield;
  const pinkM = new THREE.MeshLambertMaterial({ color: '#c48c86', vertexColors: true, emissive: '#4a2a26' })
  yield;
  const talonM = new THREE.MeshPhongMaterial({ color: '#3a3430', specular: '#4a4440', shininess: 40 })
  yield;
  const beakM = new THREE.MeshPhongMaterial({ color: '#b4bcc8', map: tx.beak, specular: '#8890a0', shininess: 50, vertexColors: true, emissive: '#2c3038' })
  yield;
  const eyeM = new THREE.MeshPhongMaterial({ color: '#2a1e18', specular: '#ffffff', shininess: 110 })
  yield;

  const body = new THREE.Group();
  yield; body.scale.setScalar(S);
  yield; grp.add(body)
  yield;

  // ---------- 浮囊 ----------
  const sac = new THREE.Group();
  yield; sac.position.set(-0.02, 0.27, 0);
  yield; body.add(sac)
  yield;
  const coreCol = male ? new THREE.Color('#e6ff8a') : new THREE.Color('#dcff7a')
  yield;
  const core = new THREE.MeshBasicMaterial({ color: coreCol.clone().multiplyScalar(0.92), vertexColors: true })
  yield;
  const membrane = new THREE.MeshPhongMaterial({ color: '#7fc24a', emissive: '#3a7a18', specular: '#e8ffd0', shininess: 60, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
  yield;
  const sacR = male ? 0.21 : 0.26
  yield;
  {
    // 外膜：不规则起伏的胶囊，底部收进羽领
    const g = new THREE.SphereGeometry(1, 40, 28), pa = g.attributes.position as THREE.BufferAttribute, d = new THREE.Vector3()
    const knots = Array.from({ length: 10 }, () => ({ d: V(R() - 0.5, R() - 0.3, R() - 0.5).normalize(), k: (R() - 0.4) * 0.16 }))
    for (let i = 0; i < pa.count; i++) {
      d.fromBufferAttribute(pa, i).normalize()
      let s = 1; for (const k of knots) s += k.k * gauss(d.distanceTo(k.d), 0, 0.5)
      s *= 1 - 0.18 * sstep(-0.4, -1, d.y)
      pa.setXYZ(i, d.x * sacR * s * 1.04, d.y * sacR * s * 0.96, d.z * sacR * s)
    
 if((i&63)===63)yield;
 }
    g.computeVertexNormals()
    const outer = new THREE.Mesh(g, membrane); outer.renderOrder = 2; sac.add(outer)
    // 胶核心：偏一侧的发光球，中心最亮、边缘偏绿
    const cg = new THREE.SphereGeometry(sacR * 0.72, 28, 20)
    paint(cg, (p) => 0.75 + 0.25 * sstep(-0.1, 1, p.clone().normalize().dot(V(0.4, 0.2, 0.9).normalize())))
    const cm = new THREE.Mesh(cg, core); cm.position.set(0.02, -0.01, 0.015); sac.add(cm)
    // 胶里悬浮的橙黄凝块
    const blobs: THREE.BufferGeometry[] = []
    for (let i = 0; i < (male ? 9 : 14); i++) {
      const d = V(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), r = sacR * (0.07 + R() * 0.08)
      blobs.push(new THREE.SphereGeometry(r, 8, 6).scale(1, 0.75 + R() * 0.4, 1).translate(d.x * sacR * 0.7, d.y * sacR * 0.66, d.z * sacR * 0.7))
    
 yield;
 }
    const blobM = new THREE.MeshBasicMaterial({ color: '#f2d27a', transparent: true, opacity: 0.8 })
    sac.add(new THREE.Mesh(merge(blobs), blobM))
    sac.add(glowSprite('#b8ff60', sacR * 4.6, male ? 0.42 : 0.5))
  }
  yield;
  // 雄性：浮囊表面一串发光孢子囊
  const sporePods: THREE.Vector3[] = []
  yield;
  let sporesM: THREE.MeshBasicMaterial | null = null
  yield;
  if (male) {
    sporesM = new THREE.MeshBasicMaterial({ color: '#ffb34a' })
    const pods: THREE.BufferGeometry[] = []
    for (let i = 0; i < 26; i++) {
      const d = V(R() - 0.5, R() * 0.9 - 0.15, R() - 0.5).normalize(), p = d.clone().multiplyScalar(sacR * 1.02)
      sporePods.push(p.clone().add(sac.position))
      pods.push(new THREE.SphereGeometry(0.011 + R() * 0.006, 6, 5).translate(p.x, p.y, p.z))
    
 yield;
 }
    sac.add(new THREE.Mesh(merge(pods), sporesM))
  }
  yield;

  // ---------- 羽团身体 ----------
  {
    const bodyG = sweep([V(-0.15, 0.06, 0), V(-0.04, 0.03, 0), V(0.07, -0.03, 0), V(0.15, -0.09, 0)], (t, d, cs, sn) => (0.11 + 0.03 * Math.sin(Math.PI * t)) * cap(t, 0.2) * ell(cs, sn, 1.05, 0.95) * (1 + 0.04 * Math.sin(d.x * 21 + t * 13)), { radial: 18, seg: 16, vRep: 1, shade: (_t, d) => 0.8 + 0.2 * Math.max(0, d.y) })
    body.add(new THREE.Mesh(bodyG, featherM))
    // 羽丝：大量细长的弯羽片（合并几何），领口向上炸开、身侧向下垂
    const fl: THREE.BufferGeometry[] = []
    const plume = (base: THREE.Vector3, dir: THREE.Vector3, len: number, w: number) => {
      const g = new THREE.PlaneGeometry(w, len, 1, 3).translate(0, len / 2, 0)
      g.attributes.uv.array.forEach((_v, i, arr) => { if (i % 2 === 1) (arr as Float32Array)[i] = 1 - (arr as Float32Array)[i] })
      const pa = g.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pa.count; i++) { const y = pa.getY(i) / len; pa.setX(i, pa.getX(i) * (1 - y * 0.2)); pa.setZ(i, -0.25 * len * y * y) } // 收尖、外卷
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize()))
      g.translate(base.x, base.y, base.z)
      paint(g, () => 0.7 + R() * 0.4)
      fl.push(g)
    }
    // 领口：围住浮囊下缘
    for (let i = 0; i < 110; i++) {
      const a = (i / 110) * Math.PI * 2 + R() * 0.08, r = 0.11 + R() * 0.03
      const base = V(-0.04 + Math.cos(a) * r, 0.1 + R() * 0.03, Math.sin(a) * r)
      plume(base, V(Math.cos(a) * 0.9, 1.1 + R() * 0.4, Math.sin(a) * 0.9), 0.11 + R() * 0.1, 0.06)
    
 yield;
 }
    // 身体表面的蓬羽
    for (let i = 0; i < 320; i++) {
      const t = R(), a = R() * Math.PI * 2
      const cx = -0.15 + t * 0.3, cy = 0.06 - t * 0.15
      const n = V(0.15 * (t - 0.5), Math.cos(a), Math.sin(a)).normalize()
      if (t > 0.78 && n.x > -0.2 && Math.abs(n.z) < 0.6 && n.y < 0.3) continue // 脸部留空
      const base = V(cx, cy, 0).addScaledVector(n, 0.11)
      plume(base, n.clone().add(V(-0.6, -0.5, 0)), 0.07 + R() * 0.08, 0.055)
    
 yield;
 }
    // 头顶与后脑的绒羽（脸前留空）
    for (let i = 0; i < 150; i++) {
      const n = new THREE.Vector3(R() - 0.5, R() - 0.2, R() - 0.5).normalize()
      if (n.x > 0.35 && n.y < 0.45 && Math.abs(n.z) < 0.55) continue
      plume(V(0.15, -0.09, 0).addScaledVector(n, 0.075), n.clone().add(V(-0.5, -0.2, 0)), 0.045 + R() * 0.04, 0.045)
    
 yield;
 }
    body.add(new THREE.Mesh(merge(fl.map(noUV)), plumeM))
  }
  yield;

  // ---------- 头：与身体连为一体，大黑眼、水平钩喙 ----------
  const head = new THREE.Group();
  yield; head.position.set(0.15, -0.09, 0);
  yield; body.add(head)
  yield;
  {
    const hg = new THREE.SphereGeometry(0.085, 20, 14).scale(1.05, 0.95, 1)
    paint(hg, (p) => 0.85 + 0.15 * sstep(-0.05, 0.08, p.y))
    head.add(new THREE.Mesh(noUV(hg), new THREE.MeshLambertMaterial({ color: male ? '#8a7860' : '#9c8a70', vertexColors: true, emissive: male ? '#40342a' : '#4a3c2e' })))
    const eyes: THREE.BufferGeometry[] = []
    for (const s of [-1, 1]) eyes.push(new THREE.SphereGeometry(0.03, 16, 12).scale(1.1, 0.85, 0.7).translate(0.03, 0.03, s * 0.072))
    head.add(new THREE.Mesh(merge(eyes), eyeM))
  }
  yield;
  const beak: THREE.Group[] = []
  yield;
  for (const s of [-1, 1]) {
    const b = new THREE.Group(); b.position.set(0.072, -0.03, s * 0.016); head.add(b)
    // 一片钩喙：宽根、向前下方伸出、尖端向内弯钩
    const pts = [V(0, 0, 0), V(0.045, -0.04, s * 0.02), V(0.07, -0.1, s * 0.016), V(0.068, -0.15, s * -0.008)]
    const g = sweep(pts, (t, _d, cs, sn) => (0.03 - 0.027 * t) * cap(t, 0.05) * ell(cs, sn, 1.15, 0.55), { radial: 10, seg: 14, vRep: 1, shade: (t) => 0.75 + 0.25 * t })
    b.add(new THREE.Mesh(g, beakM))
    beak.push(b)
  }
  yield;
  // 诱捕舌：从喙间垂下，舌尖一颗发光橙色肉球
  const lureM = new THREE.MeshBasicMaterial({ color: '#ffb048' })
  yield;
  const tongue = new THREE.Group();
  yield; tongue.position.set(0.11, -0.05, 0);
  yield; head.add(tongue)
  yield;
  {
    const pts = [V(0, 0, 0), V(0.02, -0.06, 0.01), V(0.0, -0.12, -0.01), V(0.015, -0.17, 0)]
    tongue.add(new THREE.Mesh(sweep(pts, (t) => (0.012 - 0.006 * t) * cap(t, 0.04), { radial: 8, seg: 12, shade: () => 0.9 }), pinkM))
  }
  yield;
  const lure = new THREE.Group();
  yield; lure.position.set(0.015, -0.185, 0);
  yield; tongue.add(lure)
  yield;
  {
    const lg = new THREE.SphereGeometry(0.02, 12, 10).scale(0.8, 1.3, 0.8)
    lure.add(new THREE.Mesh(lg, lureM), glowSprite('#ff9a30', 0.16, 0.85))
  }
  yield;

  // ---------- 短小前肢 + 猛禽腿 ----------
  const arms: THREE.Group[] = [], legs: THREE.Group[] = []
  yield;
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(0.1, -0.1, s * 0.07); body.add(a)
    const parts = [limbSeg([V(0, 0, 0), V(0.035, -0.03, s * 0.01), V(0.06, -0.045, s * 0.006)], 0.013, 0.01, 0.2, 0.3)]
    const cl: THREE.BufferGeometry[] = []
    for (let f = 0; f < 3; f++) {
      const fz = (f - 1) * 0.008, e = V(0.085, -0.06, s * 0.006 + fz)
      parts.push(limbSeg([V(0.058, -0.045, s * 0.006 + fz * 0.5), V(0.072, -0.05, s * 0.006 + fz), e], 0.005, 0.004, 0.1, 0.3))
      cl.push(new THREE.ConeGeometry(0.003, 0.014, 5).translate(0, 0.007, 0).rotateZ(-Math.PI / 2 - 0.9).translate(e.x, e.y, e.z))
    
 yield;
 }
    a.add(new THREE.Mesh(merge(parts), pinkM), new THREE.Mesh(merge(cl), talonM)); arms.push(a)
    // 腿：收在腹下，长胫 + 四趾弯爪（三前一后）
    const l = new THREE.Group(); l.position.set(-0.02, -0.11, s * 0.06); body.add(l)
    const lp = [limbSeg([V(0, 0, 0), V(-0.02, -0.06, s * 0.012), V(0.02, -0.11, s * 0.01)], 0.02, 0.012, 0.25, 0.25)]
    const lc: THREE.BufferGeometry[] = []
    const ank = V(0.02, -0.11, s * 0.01)
    for (let f = 0; f < 4; f++) {
      const back = f === 3, fz = back ? 0 : (f - 1) * 0.014
      const e = back ? V(-0.03, -0.135, s * 0.01) : V(0.07, -0.13, s * 0.01 + fz)
      lp.push(limbSeg([ank, ank.clone().lerp(e, 0.5).add(V(0, 0.004, 0)), e], 0.007, 0.005, 0.1, 0.3))
      lc.push(new THREE.ConeGeometry(0.0045, 0.028, 6).translate(0, 0.014, 0).rotateZ(back ? Math.PI / 2 + 0.9 : -Math.PI / 2 - 1.0).translate(e.x, e.y, e.z))
    
 yield;
 }
    l.add(new THREE.Mesh(merge(lp), pinkM), new THREE.Mesh(merge(lc), talonM)); legs.push(l)
  }
  yield;

  const lights: THREE.PointLight[] = []
  yield;
  if (o.lights) {
    const L1 = new THREE.PointLight('#b6ff5a', male ? 0.5 : 0.8, 4.5, 1.6); L1.position.copy(sac.position); body.add(L1)
    const L2 = new THREE.PointLight('#ff9a30', 0.02, 1.0, 2); lure.add(L2)
    lights.push(L1, L2)
  }
  yield;
  const rig: CurabiturRig = { sex, body, head, sac, beak, tongue, lure, arms, legs, glow: { core, membrane, lure: lureM, spores: sporesM }, sporePods, lights }
  yield;
  grp.userData.curabiturRig = rig
 complete=true

  yield;
  return grp

 }finally{if(!complete)disposeL8Tree(grp)}
}

/** 静态姿势：beak 喙张开 0–1；tongue 舌伸出长度 0（收回）→1（下垂诱捕）→2（猛地伸长）；tuck 收腿；strike 前扑捕食（腿与爪前伸） */
export function poseCurabitur(grp: THREE.Group, o: { beak?: number; tongue?: number; tuck?: number; strike?: number; glow?: number } = {}) {
  const rig = grp.userData.curabiturRig as CurabiturRig | undefined
  if (!rig) return
  const b = o.beak ?? 0.1, t = o.tongue ?? 1, k = o.tuck ?? 0, st = o.strike ?? 0
  rig.beak.forEach((g, i) => { const s = i === 0 ? -1 : 1; g.rotation.set(0, -s * b * 0.55, 0) })
  rig.tongue.visible = t > 0.02
  rig.tongue.scale.set(1, Math.max(0.05, t), 1)
  rig.lure.scale.set(1, 1 / Math.max(0.05, t), 1)
  rig.legs.forEach((l) => l.rotation.set(0, 0, k * 0.9 + st * 1.1))
  rig.arms.forEach((a) => a.rotation.set(0, 0, -st * 0.6 + k * 0.4))
  rig.body.rotation.z = -st * 0.25
  const g = o.glow ?? 1
  rig.glow.core.color.setRGB(0.86 * g, 1.0 * g, 0.48 * g)
  rig.glow.membrane.emissive.setRGB(0.23 * g, 0.48 * g, 0.09 * g)
}

// ---------- 道具 ----------
/** 受眷胶：玻璃罐装（拾取物）。fill 0–1 剩余量 */
export function buildCurabiturGelJar(fill = 1): THREE.Group {
  const grp = new THREE.Group(); grp.userData.entityType = 'curabitur-gel'
  const glass = new THREE.MeshPhongMaterial({ color: '#d8e8e0', specular: '#ffffff', shininess: 90, transparent: true, opacity: 0.28, depthWrite: false })
  const lid = new THREE.MeshLambertMaterial({ color: '#6a5a44' })
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.11, 18, 1, true).translate(0, 0.055, 0), glass)
  const h = 0.1 * fill
  const gel = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, h, 16).translate(0, h / 2 + 0.003, 0), new THREE.MeshBasicMaterial({ color: '#c8ff6a' }))
  const cap_ = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.018, 18).translate(0, 0.118, 0), lid)
  const halo = glowSprite('#b8ff60', 0.32, 0.55); halo.position.y = 0.05
  grp.add(gel, jar, cap_, halo)
  return grp
}
/** 涂了受眷胶的物件外层发光胶壳：包住任意网格（strength 0–1 = 剩余有效时间） */
export function gelCoat(target: THREE.Mesh, strength = 1): THREE.Mesh {
  const m = new THREE.Mesh(target.geometry, new THREE.MeshBasicMaterial({ color: new THREE.Color('#b8ff60').multiplyScalar(0.4 + 0.6 * strength), transparent: true, opacity: 0.35 + 0.3 * strength, blending: THREE.AdditiveBlending, depthWrite: false }))
  m.scale.setScalar(1.06); m.userData.gelCoat = true
  return m
}
/** 发光孢子（雄性散播，约 80 小时后腐解）：age 0 新鲜 → 1 将腐 */
export function buildCurabiturSpore(age = 0): THREE.Group {
  const grp = new THREE.Group(); grp.userData.entityType = 'curabitur-spore'
  const col = new THREE.Color('#ffb34a').lerp(new THREE.Color('#8a6a3a'), age * 0.7)
  grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: col })))
  grp.add(glowSprite(col, 0.09 * (1 - age * 0.6), 0.8))
  return grp
}
/** 孢子腐液：地上一滩褐绿色恶臭黏液（驱避死亡飞蛾），带几个冒泡 */
export function buildSporeRotPuddle(seed = 0, r = 0.35): THREE.Group {
  const R = rng(0x5707 + seed * 13)
  const grp = new THREE.Group(); grp.userData.entityType = 'curabitur-rot'
  const g = new THREE.CircleGeometry(1, 40), pa = g.attributes.position as THREE.BufferAttribute
  for (let i = 1; i < pa.count; i++) { const x = pa.getX(i), y = pa.getY(i), a = Math.atan2(y, x), k = r * (0.75 + 0.2 * Math.sin(a * 3 + seed) + 0.1 * Math.sin(a * 7 + seed * 2)); pa.setXY(i, x * k, y * k) }
  g.rotateX(-Math.PI / 2).translate(0, 0.004, 0)
  grp.add(new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: '#4a4426', specular: '#a8a070', shininess: 80, transparent: true, opacity: 0.88 })))
  const bub: THREE.BufferGeometry[] = []
  for (let i = 0; i < 9; i++) { const a = R() * 6.28, d = R() * r * 0.6; bub.push(new THREE.SphereGeometry(0.008 + R() * 0.012, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(Math.cos(a) * d, 0.004, Math.sin(a) * d)) }
  grp.add(new THREE.Mesh(merge(bub), new THREE.MeshPhongMaterial({ color: '#6a6236', specular: '#ffffff', shininess: 100, transparent: true, opacity: 0.7 })))
  return grp
}

function textures(){if(!TEX){const job=prepareCurabiturTextures();while(!job.next().done){/* standalone */}}return TEX!}
export function buildCurabiturMesh(sex:CurabiturSex='female',seed=0,o:{lights?:boolean}={}):THREE.Group{const job=buildCurabiturJob(sex,seed,o);let n=job.next();while(!n.done)n=job.next();return n.value}

const canvasTex:typeof sourceCanvasTex=(...args)=>{const t=sourceCanvasTex(...args);if(t)t.userData.entityShared=true;return t}
