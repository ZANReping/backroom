// 枪械模型（鎏金兵械库特许店，阶段 2）：杠杆步枪 / 单动转轮 / 前装滑膛枪 / 活门后膛步枪 + 金属定装弹、纸包弹、火帽。
// 与双管猎枪同一套约定（firearmMesh.ts）：原点 = 右手握持中心，-Z = 枪口方向，+Y = 上，+X = 右；真实尺寸（米）。
// 活动部件都是独立节点，apply(ch) 把动画通道写进去：
//   杠杆步枪  lever 杠杆下压 · hammer 击锤 · bolt 枪机后退 · gate 装弹口弹簧片
//   单动转轮  hammer 击锤（0.45 半击发 / 1 全击发）· cyl 转轮角（弧度，绝对值）· gate 装弹门 · rod 退壳杆
//   前装      hammer · rodX/rodY/rodZ/rodRx 通条（枪坐标，直接给位置和翻转角）· cap 火帽显示
//   活门      block 活门 · hammer · ext 抽壳器
import * as THREE from 'three'
import { litMaterial } from './shared'
import { tube, cyl, mesh, boxUV, sideProfile, makeMats, brassTex, type GunRig } from './firearmMesh'
import { AMMO, type AmmoType } from '../content/firearms'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const node = (parent: THREE.Object3D, name: string, x = 0, y = 0, z = 0) => { const o = new THREE.Group(); o.name = name; o.position.set(x, y, z); parent.add(o); return o }
/** 绕 Z 车出的回转体：pts = [半径, z]（z 由 0 往负方向） */
function lathe(pts: [number, number][], seg = 18): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(Math.max(0.00001, r), -z)), seg)
  g.rotateX(-Math.PI / 2) // Lathe 的 +Y → -Z（与 tube 一致）
  return g
}
function box(w: number, h: number, d: number, x: number, y: number, z: number) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g }
function rodZ(r0: number, r1: number, z0: number, z1: number, x = 0, y = 0, seg = 14) { const g = cyl(r0, r1, Math.abs(z1 - z0), seg); g.rotateX(-Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); return g }

// ---------------------------------------------------------------- 弹药
const leadMat = () => litMaterial({ color: '#8e8e92', roughness: .55, metalness: .45, envBase: .2 })
const brassMat = () => litMaterial({ color: '#ffffff', map: brassTex(), roughness: .28, metalness: .88, envBase: .6 })
export const CART = {
  cart_4440: { rim: 0.00665, rimT: 0.0016, len: 0.0405, caseLen: 0.033 },
  cart_4570: { rim: 0.0076, rimT: 0.0017, len: 0.0745, caseLen: 0.0535 },
  cart_paper: { rim: 0.0095, rimT: 0, len: 0.072, caseLen: 0.072 },
} as const
/** 金属定装弹 / 纸包弹：原点 = 底缘中心（纸包为扎口尾端），弹头沿 -Z */
export function buildCartMesh(ammo: AmmoType, spent = false): THREE.Group {
  const g = new THREE.Group(); g.userData.shell = ammo
  if (ammo === 'cart_paper') {
    // 纸包弹（.69 弹丸 + 黑火药）：牛皮纸卷、尾部扭成一个结、前端包着弹丸鼓起
    const paper = litMaterial({ color: '#d8ccb0', roughness: .92 })
    g.add(mesh(lathe([[0, 0], [0.0025, -0.002], [0.002, -0.008], [0.0062, -0.014], [0.0085, -0.02], [0.0085, -0.05], [0.0095, -0.055], [0.0098, -0.062], [0.0085, -0.069], [0.004, -0.072], [0, -0.0722]], 14), paper))
    const twine = litMaterial({ color: '#6a5034', roughness: .9 })
    g.add(mesh(rodZ(0.0089, 0.0089, -0.0495, -0.0515, 0, 0, 14), twine)) // 弹丸处的扎线
    g.add(mesh(rodZ(0.0028, 0.0028, -0.006, -0.0075, 0, 0, 8), twine))
    return g
  }
  const c = CART[ammo as 'cart_4440']
  const brass = brassMat()
  // 弹壳：底缘 → 底部 → 壳身（.44-40 有瓶颈；.45-70 直筒微锥）→ 壳口
  const casePts: [number, number][] = ammo === 'cart_4440'
    ? [[0, 0], [c.rim, 0], [c.rim, -c.rimT], [0.0058, -c.rimT], [0.00595, -0.0028], [0.0059, -0.024], [0.0057, -0.0265], [0.0057, -c.caseLen], [spent ? 0.0052 : 0.0054, -c.caseLen]]
    : [[0, 0], [c.rim, 0], [c.rim, -c.rimT], [0.0065, -c.rimT], [0.0066, -0.003], [0.0062, -c.caseLen], [spent ? 0.0056 : 0.0058, -c.caseLen]]
  g.add(mesh(lathe(casePts, 18), brass))
  const pr = cyl(0.0024, 0.0024, 0.0005, 10); pr.rotateX(-Math.PI / 2); pr.translate(0, 0, spent ? 0.0001 : 0.0003)
  g.add(mesh(pr, litMaterial({ color: spent ? '#6a5a42' : '#b89a62', roughness: .35, metalness: .85 })))
  if (spent) {
    const ins = new THREE.CircleGeometry(ammo === 'cart_4440' ? 0.0052 : 0.0056, 12); ins.rotateY(Math.PI); ins.translate(0, 0, -c.caseLen + 0.0004)
    g.add(mesh(ins, litMaterial({ color: '#15100a', roughness: .9 })))
  } else {
    const r0 = ammo === 'cart_4440' ? 0.0054 : 0.0058, L = c.len - c.caseLen
    g.add(mesh(lathe([[r0, -c.caseLen + 0.001], [r0, -c.caseLen - L * 0.45], [r0 * 0.8, -c.caseLen - L * 0.75], [r0 * 0.42, -c.len + 0.0006], [0, -c.len]], 14), leadMat()))
  }
  return g
}
/** 火帽（铜质礼帽状）：原点 = 底沿，顶朝 +Y */
export function buildCapMesh(): THREE.Group {
  const g = new THREE.Group()
  const cu = litMaterial({ color: '#b9763c', roughness: .3, metalness: .9, envBase: .5 })
  const b = cyl(0.0029, 0.0027, 0.0042, 10); b.translate(0, 0.0021, 0); g.add(mesh(b, cu))
  const f = cyl(0.0036, 0.0036, 0.0006, 10); f.translate(0, 0.0003, 0); g.add(mesh(f, cu))
  return g
}

// ---------------------------------------------------------------- 共用：枪托
/** 步枪直托（侧视轮廓）：comb = 托腮线落差、butt = 托踵 / 托底高度；crescent = 新月形托底板 */
function stock(root: THREE.Object3D, mats: ReturnType<typeof makeMats>, o: { z0: number; z1: number; top0: number; comb: number; heel: number; toe: number; wrist: number; width: number; crescent?: boolean }) {
  const { z0, z1 } = o
  const pts: [number, number][] = [
    [z0, o.top0], [z0 + 0.025, o.top0 - 0.006], [z0 + 0.06, o.top0 - 0.019], [z0 + 0.11, o.comb], [z1 - 0.12, o.heel + 0.012], [z1, o.heel],
    ...(o.crescent ? [[z1 + 0.008, (o.heel + o.toe) * 0.33] as [number, number], [z1 + 0.004, (o.heel + o.toe) * 0.66] as [number, number]] : [[z1 + 0.004, (o.heel + o.toe) / 2] as [number, number]]),
    [z1 + (o.crescent ? 0.012 : 0.006), o.toe], [z1 - 0.1, o.toe + 0.022], [z0 + 0.13, o.wrist - 0.022], [z0 + 0.07, o.wrist], [z0 + 0.02, o.wrist + 0.002], [z0, o.wrist + 0.004],
  ]
  const g = sideProfile(pts, o.width, 0.008, (z) => z < z0 + 0.11 ? 0.8 : 0.8 + 0.2 * Math.min(1, (z - z0 - 0.11) / 0.12))
  root.add(mesh(boxUV(g, 3.2), mats.wood, 'stock'))
  const bp = sideProfile(o.crescent
    ? [[z1 - 0.004, o.heel + 0.006], [z1 + 0.004, o.heel + 0.004], [z1 + 0.014, (o.heel + o.toe) * 0.33], [z1 + 0.01, (o.heel + o.toe) * 0.66], [z1 + 0.018, o.toe - 0.008], [z1 + 0.006, o.toe - 0.004], [z1 + 0.002, (o.heel + o.toe) / 2]]
    : [[z1 - 0.002, o.heel], [z1 + 0.006, o.heel], [z1 + 0.012, o.toe], [z1 + 0.004, o.toe - 0.003], [z1 + 0.002, (o.heel + o.toe) / 2]], o.width * 0.97, 0.002)
  root.add(mesh(boxUV(bp, 10), mats.dark, 'buttplate'))
}

// ---------------------------------------------------------------- 杠杆步枪（.44-40，20 英寸卡宾）
export const LR = {
  receiverZ: -0.178, muzzleZ: -0.683, tubeY: -0.0205,
  leverPivot: V(0, -0.041, -0.138), leverOpen: 0.92,
  hammerPivot: V(0, 0.002, -0.014), hammerCock: 0.62,
  gate: V(0.0172, -0.023, -0.118), chamber: V(0, 0, -0.137),
  rear: V(0, 0.0158, -0.33), front: V(0, 0.0166, -0.666),
}
export function buildLeverRifle(): GunRig {
  const mats = makeMats()
  const brassM = litMaterial({ color: '#ffffff', map: brassTex(), roughness: .32, metalness: .9, envBase: .55 })
  const root = new THREE.Group(); root.name = 'leverrifle'
  stock(root, mats, { z0: -0.006, z1: 0.335, top0: 0.008, comb: -0.021, heel: -0.048, toe: -0.138, wrist: -0.039, width: 0.04, crescent: true })
  // 黄铜机匣（侧板 + 顶部开口）
  const rcv = sideProfile([[LR.receiverZ, 0.0125], [-0.11, 0.0125], [-0.1, 0.009], [-0.06, 0.009], [-0.05, 0.0125], [-0.012, 0.0125], [0.0, 0.006], [0.004, -0.012], [-0.002, -0.034], [-0.05, -0.043], [LR.receiverZ, -0.043]], 0.033, 0.003)
  root.add(mesh(boxUV(rcv, 7), brassM, 'receiver'))
  // 枪管（圆管）+ 管式弹仓 + 枪管箍 + 准星 / 表尺
  root.add(mesh(tube(LR.receiverZ, LR.muzzleZ, 0.0108, 0.0098, 0.0055, 26), mats.blued, 'barrel'))
  root.add(mesh(rodZ(0.0088, 0.0088, LR.receiverZ, -0.64, 0, LR.tubeY, 18), mats.blued, 'magtube'))
  root.add(mesh(rodZ(0.0092, 0.0092, -0.64, -0.648, 0, LR.tubeY, 18), mats.dark)) // 弹仓盖
  for (const z of [-0.43, -0.62]) {
    const band = new THREE.TorusGeometry(0.0102, 0.0025, 6, 20); band.scale(1, 1.55, 1); band.translate(0, -0.009, z)
    root.add(mesh(band, mats.blued))
  }
  root.add(mesh(box(0.0018, 0.007, 0.006, 0, 0.0132, -0.664), mats.bead, 'frontsight'))
  const rear = new THREE.Shape(); rear.moveTo(-0.011, 0); rear.lineTo(0.011, 0); rear.lineTo(0.011, 0.007); rear.quadraticCurveTo(0.006, 0.0075, 0.0018, 0.0052); rear.lineTo(0.0012, 0.0045); rear.lineTo(-0.0012, 0.0045); rear.lineTo(-0.0018, 0.0052); rear.quadraticCurveTo(-0.006, 0.0075, -0.011, 0.007); rear.closePath()
  const rg = new THREE.ExtrudeGeometry(rear, { depth: 0.002, bevelEnabled: false }); rg.translate(0, 0.0112, LR.rear.z - 0.001)
  root.add(mesh(rg, mats.blued, 'rearsight'))
  // 护木（卡宾短护木）+ 护木盖
  root.add(mesh(boxUV(sideProfile([[-0.43, -0.003], [-0.18, -0.003], [-0.18, -0.034], [-0.43, -0.031]], 0.03, 0.006), 3.2), mats.wood, 'forend'))
  // 鞍环（左侧）
  const ring = new THREE.TorusGeometry(0.009, 0.0013, 6, 16); ring.rotateY(Math.PI / 2); ring.translate(-0.019, -0.02, -0.06)
  root.add(mesh(ring, mats.blued))
  // 装弹口（右侧弹簧片，向内压开）
  const gate = node(root, 'gate', LR.gate.x - 0.001, LR.gate.y, LR.gate.z + 0.016)
  gate.add(mesh(box(0.0012, 0.011, 0.03, 0, 0, -0.015), mats.blued, 'gateplate'))
  // 扳机
  root.add(mesh(boxUV(sideProfile([[-0.033, -0.04], [-0.028, -0.04], [-0.024, -0.054], [-0.03, -0.061], [-0.034, -0.058]], 0.005, 0.0006), 20), mats.blued, 'trigger'))
  // 杠杆（轴在机匣前下方）：底边 → 扳机护圈 → 指环
  const lever = node(root, 'lever', LR.leverPivot.x, LR.leverPivot.y, LR.leverPivot.z)
  const lv = new THREE.Group(); lv.position.set(0, 0, 0); lever.add(lv)
  lv.add(mesh(box(0.012, 0.005, 0.1, 0, -0.003, 0.05), mats.blued, 'leverbar'))
  const loop = new THREE.TorusGeometry(0.026, 0.0034, 6, 22, Math.PI * 1.25); loop.rotateY(Math.PI / 2); loop.rotateX(-0.25); loop.translate(0, -0.03, 0.12)
  lv.add(mesh(loop, mats.blued, 'leverloop'))
  const guardBow = new THREE.TorusGeometry(0.018, 0.0028, 6, 18, Math.PI); guardBow.rotateY(Math.PI / 2); guardBow.rotateX(Math.PI); guardBow.translate(0, -0.007, 0.088)
  lv.add(mesh(guardBow, mats.blued))
  // 枪机（顶部后段，拉杆时后退）+ 击锤
  const bolt = node(root, 'bolt')
  bolt.add(mesh(box(0.012, 0.007, 0.06, 0, 0.0095, -0.04), mats.blued, 'boltbody'))
  const hammer = node(root, 'hammer', LR.hammerPivot.x, LR.hammerPivot.y, LR.hammerPivot.z)
  const hs = new THREE.Shape(); hs.moveTo(-0.004, 0); hs.lineTo(0.005, 0); hs.lineTo(0.004, 0.018); hs.quadraticCurveTo(0.008, 0.026, 0.018, 0.026); hs.lineTo(0.018, 0.031); hs.quadraticCurveTo(0.002, 0.03, -0.004, 0.02); hs.closePath()
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 1 })
  hg.rotateY(-Math.PI / 2); hg.translate(0.003, 0, 0)
  hammer.add(mesh(boxUV(hg, 14), mats.caseH, 'hammerbody'))
  // 膛（枪机后退时从顶部开口看得见）+ 抛壳口
  const chamber = node(root, 'chamber0', LR.chamber.x, LR.chamber.y, LR.chamber.z)
  const muzzle = node(root, 'muzzle', 0, 0, LR.muzzleZ)
  const ejectA = node(root, 'eject', 0, 0.014, -0.115)
  const gateA = node(root, 'gateA', LR.gate.x + 0.004, LR.gate.y, LR.gate.z + 0.03)
  gateA.rotation.y = 0.32 // 子弹顺着装弹口斜着压进去（弹头朝前偏内）
  const rig: GunRig = {
    type: 'leverrifle', root, parts: { lever, hammer, bolt, gate }, chambers: [chamber], muzzles: [muzzle],
    anchors: { eject: ejectA, gate: gateA },
    sight: { eye: V(0, 0.0182, 0.26), target: LR.front.clone().setY(0.0172) },
    apply(ch) {
      lever.rotation.x = LR.leverOpen * (ch.lever ?? 0)
      hammer.rotation.x = LR.hammerCock * (ch.hammer ?? 1)
      bolt.position.z = 0.052 * (ch.lever ?? 0)
      gate.rotation.y = -0.5 * (ch.gate ?? 0)
      chamber.visible = (ch.lever ?? 0) > 0.25 || (ch.showChamber ?? 0) > 0
    },
    mats, chamberKey: '',
  }
  root.userData.gunRig = rig
  return rig
}

// ---------------------------------------------------------------- 单动转轮（.44-40，7½ 英寸）
export const RV = {
  boreY: 0.052, cylAxis: V(0, 0.0385, -0.05), cylR: 0.0215, bolt: 0.0135, cylZ0: -0.029, cylZ1: -0.07,
  muzzleZ: -0.262, gateAngle: -0.36, hammerPivot: V(0, 0.054, -0.016), hammerCock: 0.82,
  rear: V(0, 0.0695, -0.026), front: V(0, 0.0665, -0.252),
}
/** 第 k 膛在转轮上的基准角（k = 0 在正上方，逆时针为正） */
export const rvChamberAngle = (k: number) => Math.PI / 2 + k * Math.PI / 3
export function buildRevolver(): GunRig {
  const mats = makeMats()
  const brassM = litMaterial({ color: '#ffffff', map: brassTex(), roughness: .32, metalness: .9, envBase: .55 })
  const root = new THREE.Group(); root.name = 'revolver'
  // 握把（犁柄形）：胡桃木护板 + 黄铜前握条 + 钢后握条
  root.add(mesh(boxUV(sideProfile([[-0.02, 0.022], [0.006, 0.024], [0.016, 0.004], [0.026, -0.034], [0.036, -0.07], [0.033, -0.086], [0.006, -0.086], [-0.006, -0.06], [-0.013, -0.024]], 0.031, 0.006), 4), mats.wood, 'grip'))
  root.add(mesh(boxUV(sideProfile([[0.006, 0.026], [0.012, 0.026], [0.02, 0.004], [0.031, -0.034], [0.041, -0.07], [0.038, -0.088], [0.033, -0.088], [0.035, -0.07], [0.025, -0.034], [0.014, 0.004]], 0.012, 0.002), 10), mats.blued, 'backstrap'))
  root.add(mesh(boxUV(sideProfile([[-0.022, 0.022], [-0.016, 0.022], [-0.009, -0.024], [-0.002, -0.06], [0.004, -0.088], [-0.002, -0.088], [-0.008, -0.06], [-0.015, -0.024]], 0.012, 0.002), 10), brassM, 'frontstrap'))
  // 框架（渗碳彩纹）：顶梁 + 前框 + 后挡板 + 下框，中间是转轮窗
  const F = (g: THREE.BufferGeometry, n?: string) => root.add(mesh(boxUV(g, 12), mats.caseH, n))
  F(box(0.019, 0.007, 0.05, 0, 0.0655, -0.05), 'topstrap')
  F(box(0.03, 0.04, 0.008, 0, 0.044, -0.0735))
  F(box(0.034, 0.05, 0.009, 0, 0.042, -0.0245), 'recoilshield')
  F(box(0.029, 0.009, 0.05, 0, 0.0165, -0.05))
  F(box(0.022, 0.01, 0.03, 0, 0.022, -0.012))
  root.add(mesh(rodZ(0.0028, 0.0028, -0.072, -0.085, 0, RV.cylAxis.y, 10), mats.blued)) // 转轮轴销
  // 枪管 + 退壳杆护套 + 准星
  root.add(mesh(tube(-0.075, RV.muzzleZ, 0.0092, 0.0088, 0.0054, 22).translate(0, RV.boreY, 0), mats.blued, 'barrel'))
  const gx = Math.cos(RV.gateAngle) * RV.bolt, gy = RV.cylAxis.y + Math.sin(RV.gateAngle) * RV.bolt
  root.add(mesh(rodZ(0.0041, 0.0041, -0.085, -0.2, gx * 0.86, gy + 0.004, 12), mats.blued, 'rodhousing'))
  root.add(mesh(box(0.0018, 0.006, 0.008, 0, RV.boreY + 0.0115, RV.front.z), mats.blued, 'frontsight'))
  // 退壳杆（拇指钮在护套前端，往后推把空壳捅出装弹门）
  const rod = node(root, 'rod')
  rod.add(mesh(rodZ(0.0019, 0.0019, -0.08, -0.19, gx, gy, 8), mats.dark))
  rod.add(mesh(rodZ(0.0046, 0.0046, -0.19, -0.2, gx * 0.86 + 0.004, gy + 0.004, 10), mats.blued, 'rodknob'))
  // 转轮（六膛，可整体旋转）
  const cylG = node(root, 'cyl', RV.cylAxis.x, RV.cylAxis.y, RV.cylAxis.z)
  const L = RV.cylZ0 - RV.cylZ1
  const cg = new THREE.CylinderGeometry(RV.cylR, RV.cylR, L, 30); cg.rotateX(Math.PI / 2)
  cylG.add(mesh(boxUV(cg, 14), mats.blued, 'cylinder'))
  for (let k = 0; k < 6; k++) { // 转轮锁槽 + 膛口深色
    const a = rvChamberAngle(k) + Math.PI / 6
    cylG.add(mesh(box(0.003, 0.0016, 0.006, Math.cos(a) * RV.cylR, Math.sin(a) * RV.cylR, 0.008), mats.dark))
    const a2 = rvChamberAngle(k), hole = new THREE.CircleGeometry(0.0058, 12); hole.rotateY(Math.PI); hole.translate(Math.cos(a2) * RV.bolt, Math.sin(a2) * RV.bolt, -L / 2 - 0.0003)
    cylG.add(mesh(hole, mats.bore))
  }
  const chambers: THREE.Group[] = []
  for (let k = 0; k < 6; k++) { const a = rvChamberAngle(k); chambers.push(node(cylG, `chamber${k}`, Math.cos(a) * RV.bolt, Math.sin(a) * RV.bolt, L / 2 - 0.0012)) }
  // 装弹门（后挡板右侧，绕竖轴向外翻开）
  const gate = node(root, 'gate', 0.017, gy, -0.02)
  gate.add(mesh(box(0.0022, 0.012, 0.009, 0.001, 0, -0.0045), mats.caseH, 'gateplate'))
  // 击锤 + 扳机 + 黄铜护圈
  const hammer = node(root, 'hammer', RV.hammerPivot.x, RV.hammerPivot.y, RV.hammerPivot.z)
  const hs = new THREE.Shape(); hs.moveTo(-0.004, -0.006); hs.lineTo(0.004, -0.006); hs.lineTo(0.006, 0.012); hs.quadraticCurveTo(0.012, 0.022, 0.026, 0.02); hs.lineTo(0.027, 0.026); hs.quadraticCurveTo(0.004, 0.03, -0.005, 0.016); hs.closePath()
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.0065, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 1 }); hg.rotateY(-Math.PI / 2); hg.translate(0.0032, 0, 0)
  hammer.add(mesh(boxUV(hg, 14), mats.caseH, 'hammerbody'))
  const trig = node(root, 'trigger', 0, 0.016, -0.026)
  trig.add(mesh(boxUV(sideProfile([[-0.003, 0], [0.003, 0], [0.005, -0.012], [0.0, -0.02], [-0.002, -0.018]], 0.0045, 0.0005), 20), mats.blued))
  const guard = new THREE.TorusGeometry(0.0155, 0.0025, 6, 18, Math.PI); guard.rotateY(Math.PI / 2); guard.rotateX(Math.PI); guard.scale(1, 1.05, 1.15); guard.translate(0, 0.014, -0.02)
  root.add(mesh(guard, brassM, 'guard'))
  const muzzle = node(root, 'muzzle', 0, RV.boreY, RV.muzzleZ)
  // 装弹门处的弹位参考：子弹顺着转轮轴方向从门口推进膛
  const gateA = node(root, 'gateA', gx, gy, RV.cylZ0 + 0.0005)
  const ejectA = node(root, 'eject', gx + 0.004, gy, RV.cylZ0 + 0.01)
  const rig: GunRig = {
    type: 'revolver', root, parts: { hammer, cyl: cylG, gate, rod, trigger: trig }, chambers, muzzles: [muzzle],
    anchors: { gate: gateA, eject: ejectA },
    sight: { eye: V(0, RV.rear.y + 0.0012, 0.46), target: RV.front.clone().setY(RV.front.y + 0.0006) },
    apply(ch) {
      hammer.rotation.x = RV.hammerCock * (ch.hammer ?? 0)
      cylG.rotation.z = ch.cyl ?? 0
      gate.rotation.y = 1.25 * (ch.gate ?? 0)
      rod.position.z = 0.062 * (ch.rod ?? 0)
      trig.rotation.x = 0.3 * (ch.trig ?? 0)
    },
    mats, chamberKey: '',
  }
  root.userData.gunRig = rig
  return rig
}

// ---------------------------------------------------------------- 前装滑膛枪（.69，42 英寸）
export const MK = {
  breechZ: -0.072, muzzleZ: -1.14, rodY: -0.0235, rodLen: 0.94,
  nipple: V(0.0128, 0.0105, -0.066), hammerPivot: V(0.021, -0.003, -0.03), hammerCock: 0.95,
  front: V(0, 0.0176, -1.112),
}
export function buildMusket(): GunRig {
  const mats = makeMats()
  const iron = litMaterial({ color: '#9ea2a4', roughness: .38, metalness: .85, envBase: .5 }) // 白铁（亮光处理的军用枪管）
  const root = new THREE.Group(); root.name = 'musket'
  stock(root, mats, { z0: -0.01, z1: 0.36, top0: 0.006, comb: -0.023, heel: -0.054, toe: -0.15, wrist: -0.041, width: 0.042 })
  // 前托：贴着枪管一直到第三道箍
  root.add(mesh(boxUV(sideProfile([[-1.0, -0.006], [-0.02, -0.006], [-0.01, -0.036], [-0.12, -0.044], [-0.5, -0.036], [-1.0, -0.03]], 0.036, 0.006), 3), mats.wood, 'forestock'))
  root.add(mesh(tube(MK.breechZ, MK.muzzleZ, 0.0145, 0.0116, 0.0089, 28), iron, 'barrel'))
  root.add(mesh(rodZ(0.0118, 0.0118, MK.breechZ + 0.004, MK.breechZ - 0.002, 0, 0, 20), iron)) // 尾栓
  for (const [z, w] of [[-0.42, 0.016], [-0.72, 0.012], [-0.985, 0.022]] as const) {
    const band = new THREE.CylinderGeometry(0.0165, 0.0165, w, 22, 1, true); band.rotateX(Math.PI / 2); band.scale(1.12, 1.28, 1); band.translate(0, -0.011, z)
    root.add(mesh(band, iron))
  }
  root.add(mesh(box(0.002, 0.0055, 0.008, 0, 0.0145, MK.front.z), iron, 'frontsight'))
  root.add(mesh(box(0.008, 0.0035, 0.016, 0, 0.0145, -0.03), iron, 'rearnotch'))
  // 火帽座（凸台 + 火门锥）
  root.add(mesh(box(0.009, 0.01, 0.012, 0.011, 0.004, MK.nipple.z), iron, 'bolster'))
  root.add(mesh(rodZ(0.0018, 0.0026, 0, 0.0075, 0, 0, 8).rotateX(-Math.PI / 2).translate(MK.nipple.x, MK.nipple.y - 0.002, MK.nipple.z), iron, 'nipple'))
  const capN = node(root, 'cap', MK.nipple.x, MK.nipple.y + 0.0045, MK.nipple.z)
  capN.add(buildCapMesh())
  // 枪机板 + 击锤 + 扳机 + 护圈 + 托底板已在 stock 里
  root.add(mesh(boxUV(sideProfile([[-0.15, 0.002], [-0.02, 0.002], [0.0, -0.008], [-0.01, -0.024], [-0.15, -0.022]], 0.004, 0.0008), 12).translate(0.0185, 0, 0), iron, 'lockplate'))
  const hammer = node(root, 'hammer', MK.hammerPivot.x, MK.hammerPivot.y, MK.hammerPivot.z)
  const hs = new THREE.Shape(); hs.moveTo(-0.006, -0.005); hs.lineTo(0.006, -0.006); hs.lineTo(0.006, 0.012); hs.quadraticCurveTo(-0.008, 0.024, -0.036, 0.022); hs.lineTo(-0.038, 0.012); hs.lineTo(-0.03, 0.012); hs.quadraticCurveTo(-0.01, 0.014, -0.006, 0.004); hs.closePath()
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0007, bevelThickness: 0.0007, bevelSegments: 1 })
  hg.rotateY(-Math.PI / 2); hg.translate(0.003, 0, 0)
  hammer.add(mesh(boxUV(hg, 14), iron, 'hammerbody'))
  root.add(mesh(boxUV(sideProfile([[-0.034, -0.038], [-0.028, -0.038], [-0.024, -0.054], [-0.03, -0.062], [-0.034, -0.058]], 0.005, 0.0006), 20), iron, 'trigger'))
  const guard = new THREE.TorusGeometry(0.03, 0.0026, 6, 22, Math.PI); guard.rotateY(Math.PI / 2); guard.rotateX(Math.PI); guard.scale(1, 0.7, 1.2); guard.translate(0, -0.038, -0.022)
  root.add(mesh(guard, iron))
  // 通条：原点 = 喇叭形通条头（朝枪口一端），杆身往枪尾方向延伸
  const rod = node(root, 'rod', 0, MK.rodY, MK.muzzleZ + 0.006)
  rod.add(mesh(rodZ(0.0041, 0.0041, 0.004, MK.rodLen, 0, 0, 10), iron, 'rodshaft'))
  rod.add(mesh(lathe([[0.0042, -0.004], [0.0058, 0.0], [0.006, 0.012], [0.0044, 0.02]], 12), iron, 'rodhead'))
  const muzzle = node(root, 'muzzle', 0, 0, MK.muzzleZ)
  const mouth = node(root, 'mouthA', 0, 0, MK.muzzleZ - 0.004); mouth.rotation.x = Math.PI // 往膛里装东西的方向（-Z 朝枪尾）
  const rig: GunRig = {
    type: 'musket', root, parts: { hammer, rod, cap: capN }, chambers: [], muzzles: [muzzle],
    anchors: { mouth, nipple: capN },
    sight: { eye: V(0, 0.0215, 0.26), target: MK.front.clone().setY(0.0172) },
    apply(ch) {
      hammer.rotation.x = MK.hammerCock * (ch.hammer ?? 0)
      rod.position.set(ch.rodX ?? 0, MK.rodY + (ch.rodY ?? 0), MK.muzzleZ + 0.006 + (ch.rodZ ?? 0))
      rod.rotation.x = ch.rodRx ?? 0
      capN.visible = (ch.cap ?? 0) > 0.5
    },
    mats, chamberKey: '',
  }
  root.userData.gunRig = rig
  return rig
}

// ---------------------------------------------------------------- 活门后膛步枪（.45-70，32½ 英寸）
export const TD = {
  breechZ: -0.128, muzzleZ: -0.955, hinge: V(0, 0.0148, -0.126), blockOpen: 1.75,
  hammerPivot: V(0.0205, -0.004, -0.004), hammerCock: 0.9, chamber: V(0, 0, -0.1265),
  rearZ: -0.235, front: V(0, 0.0162, -0.945),
}
export function buildTrapdoor(): GunRig {
  const mats = makeMats()
  const root = new THREE.Group(); root.name = 'trapdoor'
  stock(root, mats, { z0: -0.01, z1: 0.335, top0: 0.006, comb: -0.023, heel: -0.052, toe: -0.142, wrist: -0.04, width: 0.04 })
  root.add(mesh(boxUV(sideProfile([[-0.86, -0.004], [-0.13, -0.004], [-0.12, -0.034], [-0.2, -0.041], [-0.5, -0.033], [-0.86, -0.027]], 0.034, 0.006), 3), mats.wood, 'forestock'))
  root.add(mesh(tube(TD.breechZ, TD.muzzleZ, 0.0128, 0.0097, 0.0058, 26), mats.blued, 'barrel'))
  // 机匣（活门座）+ 尾柄
  root.add(mesh(boxUV(sideProfile([[-0.13, 0.0], [-0.02, 0.0], [0.004, -0.004], [0.004, -0.016], [-0.13, -0.016]], 0.03, 0.002), 10), mats.caseH, 'receiver'))
  root.add(mesh(box(0.012, 0.003, 0.05, 0, 0.0085, 0.02), mats.blued)) // 上尾柄
  // 活门：铰链在前上方，往前掀
  const block = node(root, 'block', TD.hinge.x, TD.hinge.y, TD.hinge.z)
  block.add(mesh(boxUV(sideProfile([[0.004, 0.002], [0.098, 0.0], [0.1, -0.004], [0.098, -0.02], [0.004, -0.021]], 0.023, 0.0018), 14), mats.caseH, 'blockbody'))
  block.add(mesh(box(0.006, 0.004, 0.012, 0.0095, 0.0035, 0.088), mats.blued, 'thumbpiece')) // 右后方的拇指扳
  block.add(mesh(rodZ(0.0035, 0.0035, -0.004, 0.004, 0, -0.002, 10).rotateY(Math.PI / 2), mats.dark)) // 铰链销
  const ext = node(root, 'ext', 0, -0.006, -0.126)
  ext.add(mesh(box(0.008, 0.004, 0.006, 0, 0, 0), mats.dark))
  // 枪机板 + 击锤 + 扳机 + 护圈
  root.add(mesh(boxUV(sideProfile([[-0.12, -0.002], [0.0, -0.002], [0.016, -0.01], [0.004, -0.026], [-0.12, -0.024]], 0.004, 0.0008), 12).translate(0.0175, 0, 0), mats.caseH, 'lockplate'))
  const hammer = node(root, 'hammer', TD.hammerPivot.x, TD.hammerPivot.y, TD.hammerPivot.z)
  const hs = new THREE.Shape(); hs.moveTo(-0.006, -0.005); hs.lineTo(0.006, -0.006); hs.lineTo(0.006, 0.01); hs.quadraticCurveTo(-0.006, 0.024, -0.034, 0.02); hs.lineTo(-0.035, 0.012); hs.quadraticCurveTo(-0.01, 0.012, -0.006, 0.003); hs.closePath()
  const hg = new THREE.ExtrudeGeometry(hs, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0007, bevelThickness: 0.0007, bevelSegments: 1 })
  hg.rotateY(-Math.PI / 2); hg.translate(0.003, 0, 0)
  hammer.add(mesh(boxUV(hg, 14), mats.caseH, 'hammerbody'))
  root.add(mesh(boxUV(sideProfile([[-0.032, -0.03], [-0.026, -0.03], [-0.022, -0.046], [-0.028, -0.054], [-0.032, -0.05]], 0.005, 0.0006), 20), mats.blued, 'trigger'))
  const guard = new THREE.TorusGeometry(0.028, 0.0025, 6, 22, Math.PI); guard.rotateY(Math.PI / 2); guard.rotateX(Math.PI); guard.scale(1, 0.7, 1.2); guard.translate(0, -0.03, -0.02)
  root.add(mesh(guard, mats.blued))
  for (const [z, w] of [[-0.5, 0.012], [-0.83, 0.02]] as const) {
    const band = new THREE.CylinderGeometry(0.0155, 0.0155, w, 22, 1, true); band.rotateX(Math.PI / 2); band.scale(1.1, 1.25, 1); band.translate(0, -0.009, z)
    root.add(mesh(band, mats.blued))
  }
  root.add(mesh(rodZ(0.0032, 0.0032, -0.2, -0.95, 0, -0.022, 8), mats.blued)) // 擦枪杆
  root.add(mesh(box(0.0018, 0.0062, 0.009, 0, 0.0128, TD.front.z), mats.blued, 'frontsight'))
  // 立框表尺（折叠状态）
  root.add(mesh(box(0.014, 0.0035, 0.05, 0, 0.0125, TD.rearZ), mats.blued, 'rearbase'))
  const leaf = new THREE.Shape(); leaf.moveTo(-0.006, 0); leaf.lineTo(0.006, 0); leaf.lineTo(0.006, 0.0042); leaf.lineTo(0.0012, 0.0042); leaf.lineTo(0.0008, 0.0026); leaf.lineTo(-0.0008, 0.0026); leaf.lineTo(-0.0012, 0.0042); leaf.lineTo(-0.006, 0.0042); leaf.closePath()
  root.add(mesh(new THREE.ExtrudeGeometry(leaf, { depth: 0.002, bevelEnabled: false }).translate(0, 0.0142, TD.rearZ + 0.018), mats.blued, 'rearleaf'))
  const chamber = node(root, 'chamber0', TD.chamber.x, TD.chamber.y, TD.chamber.z)
  const muzzle = node(root, 'muzzle', 0, 0, TD.muzzleZ)
  const ejectA = node(root, 'eject', 0, 0.006, -0.11)
  const rig: GunRig = {
    type: 'trapdoor', root, parts: { block, hammer, ext }, chambers: [chamber], muzzles: [muzzle],
    anchors: { eject: ejectA },
    sight: { eye: V(0, 0.0185, 0.26), target: TD.front.clone().setY(0.0165) },
    apply(ch) {
      block.rotation.x = -TD.blockOpen * (ch.block ?? 0)
      hammer.rotation.x = TD.hammerCock * (ch.hammer ?? 1)
      ext.position.z = 0.008 * (ch.ext ?? 0)
      chamber.visible = (ch.block ?? 0) > 0.3
    },
    mats, chamberKey: '',
  }
  root.userData.gunRig = rig
  return rig
}

void AMMO
