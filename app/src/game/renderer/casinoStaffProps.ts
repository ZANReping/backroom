// [casino] 赌场员工道具（静态网格，挂在骨骼下；阶段 3 动画直接带着走）。
//   酒保 E164：摇酒壶（clawL）、鸡尾酒杯（clawR）、抹布（搭在右前腿膝上 legR1b）
//   假肢人：长烟杆 / 杆管（handR，ref3 横握的那根）
//   Billy：手托的 11 号台球（heldBall，ref4）
//   荷官：一副扑克（handR）；侍应：托盘 + 筹码堆 + 杯（handL）
// 所有道具在模型空间（静止姿态）里给坐标，挂到骨上时减去骨的静止位置（静止时骨无旋转）。
// 杯身用 SM.screen 槽位，在道具网格里换成透明玻璃材质（员工本体不用这个槽位以外的玻璃）。
import * as THREE from 'three'
import { Chunk, SM, hx, mixc, surf, blob, ballSphere, lathe, box, vo, add, sub, scl, nrm, type V3, type SOpt } from './casinoStaffKit'
import { TILES, staffMaterials } from './casinoStaffMat'
import { makeStaffRig, PROS_GRIP_OFF, type StaffWho } from './casinoStaffRig'

const W0 = (_p: V3, acc: { add: (b: number, w: number) => unknown }) => { acc.add(0, 1) }
const O = (col: SOpt['col'], mat: number, x: Partial<SOpt> = {}): SOpt => ({ col, mat, w: W0 as never, fb: 0, ...x })
export interface PropDef { name: string; bone: string; build: (ch: Chunk) => void; glass?: boolean }

const CHROME = hx('#d8dbe0'), BRASS = hx('#d0a24c')
function glassGeo(ch: Chunk, base: V3, kind: 'coupe' | 'rocks') {
  const prof: [number, number][] = kind === 'coupe' ? [[0, 0], [0.035, 0], [0.036, 0.004], [0.006, 0.01], [0.004, 0.07], [0.012, 0.085], [0.05, 0.1], [0.056, 0.12], [0.054, 0.121]] : [[0, 0], [0.038, 0], [0.04, 0.012], [0.042, 0.085], [0.04, 0.086]]
  lathe(ch, base, [0, 1, 0], prof, 24, vo(O(hx('#e8f2f4'), SM.screen, { rough: 0.05 })))
}
function liquid(ch: Chunk, base: V3, kind: 'coupe' | 'rocks', col: string) {
  if (kind === 'coupe') lathe(ch, add(base, [0, 0.087, 0]), [0, 1, 0], [[0, 0.03], [0.044, 0.03], [0.028, 0.012], [0.01, 0.002], [0, 0]].reverse() as [number, number][], 20, vo(O(hx(col), SM.dark, { rough: 0.1 })))
  else lathe(ch, add(base, [0, 0.006, 0]), [0, 1, 0], [[0, 0], [0.036, 0], [0.037, 0.05], [0, 0.05]], 20, vo(O(hx(col), SM.dark, { rough: 0.1 })))
}

export const STAFF_PROPS: Partial<Record<StaffWho, PropDef[]>> = {
  bartender: [
    { name: 'shaker', bone: 'clawL', build: (ch) => {
      const R = makeStaffRig('bartender'), t = R.J.legL1Tip, b: V3 = add(t, [-0.02, -0.07, 0.03])
      lathe(ch, b, [0, 1, 0], [[0, 0], [0.034, 0], [0.036, 0.004], [0.044, 0.1], [0.045, 0.105], [0.041, 0.108]], 24, vo(O(CHROME, SM.metal, { metal: 1, rough: 0.18 })))
      lathe(ch, add(b, [0, 0.104, 0]), [0, 1, 0], [[0.041, 0], [0.044, 0.006], [0.033, 0.05], [0.016, 0.068], [0.017, 0.085], [0.012, 0.09], [0, 0.092]], 24, vo(O(CHROME, SM.metal, { metal: 1, rough: 0.15 })))
      lathe(ch, add(b, [0, 0.14, 0]), [0, 1, 0], [[0.03, 0], [0.032, 0.006], [0.03, 0.012]], 24, vo(O(BRASS, SM.metal, { metal: 1 })))
    } },
    { name: 'rag', bone: 'legR1b', build: (ch) => {
      const R = makeStaffRig('bartender'), t = add(R.J.legR1Knee, [0.09, 0.0, 0.0])
      const S = (z0: number) => (u: number, v: number): V3 => { const x = (u - 0.5) * 0.22, d = v * 0.3; return add(t, [x * (1 - 0.3 * v) - 0.02, -d + 0.01, z0 + 0.025 * Math.sin(u * Math.PI * 4 + v * 2) * v + 0.03 * v]) }
      surf(ch, S(0.01), 16, 12, O((_p, u, v) => (Math.abs(((u * 6) % 1) - 0.5) < 0.08 ? hx('#b0186a') : v > 0.94 ? hx('#d9b25a') : hx('#efe9dc')), SM.cloth, { su: 0.22, sv: 0.3 }))
      surf(ch, S(0.007), 16, 12, O(hx('#d8d0c0'), SM.cloth, { su: 0.22, sv: 0.3, flip: true }))
    } },
    { name: 'glass', bone: 'clawR', glass: true, build: (ch) => { const R = makeStaffRig('bartender'), b: V3 = add(R.J.legR1Tip, [0.0, -0.075, 0.02]); glassGeo(ch, b, 'coupe'); liquid(ch, b, 'coupe', '#d0204a'); blob(ch, add(b, [0.03, 0.12, 0]), [0.01, 0.01, 0.01], 10, 6, O(hx('#a00a20'), SM.dark, { rough: 0.2 })) } },
  ],
  prosthetic: [
    { name: 'stick', bone: 'handR', build: (ch) => {
      const R = makeStaffRig('prosthetic'), h = add(R.J.wristR, PROS_GRIP_OFF)
      const a: V3 = add(h, [0.06, 0.004, 0.0]), b: V3 = add(h, [-0.3, 0.02, -0.01]), ax = nrm(sub(b, a)), L = 0.36
      lathe(ch, a, ax, [[0, 0], [0.011, 0], [0.012, L * 0.6], [0.014, L - 0.04], [0.0, L - 0.04]], 16, vo(O(hx('#3a2216'), SM.wood)))
      lathe(ch, add(a, scl(ax, L - 0.045)), ax, [[0.0, 0], [0.018, 0], [0.019, 0.04], [0.015, 0.042], [0.014, 0.004], [0, 0.004]], 16, vo(O(BRASS, SM.metal, { metal: 1, rough: 0.3 })))
      lathe(ch, add(a, scl(ax, L * 0.55)), ax, [[0.0125, 0], [0.015, 0.004], [0.015, 0.014], [0.0125, 0.018]], 16, vo(O(BRASS, SM.metal, { metal: 1 })))
    } },
  ],
  billy: [
    { name: 'ball11', bone: 'heldBall', build: (ch) => { const R = makeStaffRig('billy'), c = add(R.J.handTipR, [0.0, 0.05, 0.0]); ballSphere(ch, c, 0.06, 32, 20, O([1, 1, 1], SM.ball), TILES.ball11, { x: [0.9, 0, -0.44], y: [0, 1, 0], z: [0.44, 0, 0.9] }) } },
  ],
  dealer: [
    { name: 'cards', bone: 'handR', build: (ch) => {
      const R = makeStaffRig('dealer'), c = add(R.J.handTipR, [0.0, 0.03, 0.035])
      box(ch, c, [1, 0, 0], [0, 0, 1], [0, 1, 0], 0.032, 0.044, 0.01, vo(O((p) => (Math.abs(p[1] - c[1]) > 0.0085 ? hx('#b0142a') : hx('#f2ece0')), SM.dark, { rough: 0.5 })))
    } },
  ],
  waiter: [
    { name: 'tray', bone: 'handL', build: (ch) => {
      const R = makeStaffRig('waiter'), c = add(R.J.handTipL, [0.02, 0.02, 0.12])
      lathe(ch, c, [0, 1, 0], [[0, 0], [0.18, 0], [0.19, 0.012], [0.185, 0.016], [0.176, 0.008], [0, 0.008]], 32, vo(O(BRASS, SM.metal, { metal: 1, rough: 0.25 })))
      const chip = (x: number, z: number, n: number, col: string) => { for (let i = 0; i < n; i++) lathe(ch, add(c, [x, 0.008 + i * 0.0034, z]), [0, 1, 0], [[0, 0], [0.019, 0], [0.0195, 0.0016], [0.019, 0.0032], [0, 0.0032]], 14, vo(O(mixc(hx(col), [1, 1, 1], i % 2 ? 0.0 : 0.15), SM.dark, { rough: 0.4 }))) }
      chip(-0.07, 0.04, 8, '#c8261e'); chip(-0.03, 0.08, 5, '#1f4fb8'); chip(-0.09, -0.02, 6, '#e8b818'); chip(-0.04, -0.06, 4, '#1d7a3a')
      const g: V3 = add(c, [0.07, 0.008, -0.01]); glassGeo(ch, g, 'rocks'); liquid(ch, g, 'rocks', '#c88a2a')
    } },
  ],
}
let GLASS: THREE.Material | null = null
function toMesh(ch: Chunk): THREE.Mesh {
  const g = new THREE.BufferGeometry(), nT = ch.idx.length / 3
  const matOf = (t: number) => ch.mat[ch.idx[t * 3] * 2]
  const order = Array.from({ length: nT }, (_, i) => i).sort((a, b) => matOf(a) - matOf(b)), idx = new Uint32Array(nT * 3)
  let start = 0, cur = -1
  order.forEach((t, k) => { const m = matOf(t); if (m !== cur) { if (cur >= 0) g.addGroup(start * 3, (k - start) * 3, cur); cur = m; start = k } idx.set([ch.idx[t * 3], ch.idx[t * 3 + 1], ch.idx[t * 3 + 2]], k * 3) })
  if (cur >= 0) g.addGroup(start * 3, (nT - start) * 3, cur)
  g.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(ch.uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1))
  const mats = staffMaterials().slice()
  if (!GLASS) GLASS = new THREE.MeshPhysicalMaterial({ color: '#f2fbff', roughness: 0.04, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false })
  mats[SM.screen] = GLASS
  return new THREE.Mesh(g, mats)
}
/** 纯几何三角形数（check 用） */
export function staffPropTris(who: StaffWho) { let n = 0; for (const p of STAFF_PROPS[who] ?? []) { const ch = new Chunk(); p.build(ch); n += ch.idx.length / 3 } return n }
/** 把道具挂到 buildCasinoStaff 返回的组的骨骼上，返回挂上的网格 */
export function attachStaffProps(g: THREE.Group): THREE.Mesh[] {
  const rig = g.userData.staff as { who: StaffWho; bones: Record<string, THREE.Bone>; def: { BONES: { name: string; pos: V3 }[] } } | undefined
  if (!rig) return []
  const out: THREE.Mesh[] = []
  for (const p of STAFF_PROPS[rig.who] ?? []) {
    const ch = new Chunk(); p.build(ch)
    const mesh = toMesh(ch)
    const bone = rig.bones[p.bone], bp = rig.def.BONES.find((b) => b.name === p.bone)!.pos
    mesh.position.set(-bp[0], -bp[1], -bp[2]); mesh.name = 'prop-' + p.name; mesh.castShadow = true
    bone.add(mesh); out.push(mesh)
  }
  return out
}
