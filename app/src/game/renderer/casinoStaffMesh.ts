// [casino] Level 5.1 赌场员工 阶段 2：静态模型 + 绑定骨架 + LOD（动画在阶段 3）。
//   buildCasinoStaff(who, { lod, palette }) → THREE.Group（rotation.y = π/2、userData.facesZ = 1，与爵士脑 / 厨师同约定），
//   内含一个 SkinnedMesh（按材质号分组，材质见 casinoStaffMat）+ 骨架；userData.staff = { who, def, bones, body, lod, stats }。
//   各角色几何：casinoStaffHeroes.ts（Louie / 假肢人 / Billy / 酒保 E164）、casinoStaffCrew.ts（背景员工 3 种，可换色）。
//   LOD0 约 40–60k 三角形（背景员工 8–15k），LOD1 ≈ 1/3，LOD2 ≈ 1/10。
import * as THREE from 'three'
import { makeStaffRig, type StaffWho, type StaffRigDef } from './casinoStaffRig'
import { Chunk, Skin, LOD_Q, SM_NAMES, KIT } from './casinoStaffKit'
import { buildLouie, buildProsthetic, buildBilly, buildBartender } from './casinoStaffHeroes'
import { buildCrew, CREW_PALETTES, type CrewPalette } from './casinoStaffCrew'
import { staffMaterials } from './casinoStaffMat'
export { CREW_PALETTES, type CrewPalette }

export const STAFF_LODS = 3
/** 写实化精度倍数（分段数 × q；三角形约 × q²）：主要员工 LOD0 ≈ 90–130k、背景员工 25–40k */
export const STAFF_DENS: Record<string, number> = { louie: 0.8, prosthetic: 0.9, billy: 1.0, bartender: 1.25, dealer: 1.05, waiter: 1.12, guard: 1.1 }
export interface StaffGeo { geo: THREE.BufferGeometry; tris: number; mats: number[]; parts: Record<string, number>; genMs: number }
const cache = new Map<string, StaffGeo>()

function toGeometry(ch: Chunk): { geo: THREE.BufferGeometry; mats: number[] } {
  const nT = ch.idx.length / 3, matOf = (t: number) => ch.mat[ch.idx[t * 3] * 2]
  const order = Array.from({ length: nT }, (_, i) => i).sort((a, b) => matOf(a) - matOf(b))
  const idx = new Uint32Array(nT * 3), mats: number[] = []
  const geo = new THREE.BufferGeometry()
  let start = 0, cur = -1
  order.forEach((t, k) => {
    const m = matOf(t)
    if (m !== cur) { if (cur >= 0) geo.addGroup(start * 3, (k - start) * 3, cur); cur = m; start = k; mats.push(m) }
    idx[k * 3] = ch.idx[t * 3]; idx[k * 3 + 1] = ch.idx[t * 3 + 1]; idx[k * 3 + 2] = ch.idx[t * 3 + 2]
  })
  if (cur >= 0) geo.addGroup(start * 3, (nT - start) * 3, cur)
  geo.setAttribute('position', new THREE.Float32BufferAttribute(ch.pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(ch.nrm, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(ch.col, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(ch.uv, 2))
  const ex = new Float32Array(ch.mat.length / 2), rg = new Float32Array(ch.mat.length / 2)
  for (let i = 0; i < ex.length; i++) { ex[i] = ch.mat[i * 2 + 1]; rg[i] = ch.rm[i * 2] }
  geo.setAttribute('aEx', new THREE.BufferAttribute(ex, 1)); geo.setAttribute('aRgh', new THREE.BufferAttribute(rg, 1))
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ch.si, 4))
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(ch.sw, 4))
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  geo.computeBoundingBox(); geo.computeBoundingSphere()
  return { geo, mats }
}

/** 纯几何（node 可跑，check 用） */
export function buildStaffGeometry(who: StaffWho, lod = 0, palette = 0): StaffGeo {
  lod = Math.max(0, Math.min(STAFF_LODS - 1, lod))
  const key = `${who}:${lod}:${palette}`
  const hit = cache.get(key); if (hit) return hit
  const t0 = performance.now()
  const R = makeStaffRig(who), ch = new Chunk(), sk = new Skin(R), q = LOD_Q[lod] * (STAFF_DENS[who] ?? 1)
  const parts: Record<string, number> = {}
  const mark = (name: string, f: () => void) => { const a = ch.idx.length; f(); parts[name] = (parts[name] ?? 0) + (ch.idx.length - a) / 3 }
  const ctx = { ch, sk, q, R, mark, lod }
  KIT.lod = lod
  if (who === 'louie') buildLouie(ctx)
  else if (who === 'prosthetic') buildProsthetic(ctx)
  else if (who === 'billy') buildBilly(ctx)
  else if (who === 'bartender') buildBartender(ctx)
  else buildCrew(ctx, who, CREW_PALETTES[palette % CREW_PALETTES.length])
  const { geo, mats } = toGeometry(ch)
  const r: StaffGeo = { geo, tris: ch.idx.length / 3, mats, parts, genMs: Math.round(performance.now() - t0) }
  cache.set(key, r)
  return r
}
export interface BuildCtx { ch: Chunk; sk: Skin; q: number; R: StaffRigDef; mark: (name: string, f: () => void) => void; lod: number }

export interface StaffRig { who: StaffWho; def: StaffRigDef; root: THREE.Bone; bones: Record<string, THREE.Bone>; body: THREE.SkinnedMesh; lod: number }
/** 浏览器：建 SkinnedMesh + 骨架 */
export function buildCasinoStaff(who: StaffWho, opts: { lod?: number; palette?: number } = {}): THREE.Group {
  const lod = Math.max(0, Math.min(STAFF_LODS - 1, opts.lod ?? 0))
  const def = makeStaffRig(who), g = buildStaffGeometry(who, lod, opts.palette ?? 0)
  const face = new THREE.Group(); face.name = 'staff-' + who; face.rotation.y = Math.PI / 2; face.userData.facesZ = 1
  const bones: THREE.Bone[] = []
  for (const d of def.BONES) {
    const b = new THREE.Bone(); b.name = d.name
    const pp = d.parent >= 0 ? def.BONES[d.parent].pos : [0, 0, 0]
    b.position.set(d.pos[0] - pp[0], d.pos[1] - pp[1], d.pos[2] - pp[2])
    if (d.parent >= 0) bones[d.parent].add(b)
    bones.push(b)
  }
  face.add(bones[0])
  const mats = staffMaterials()
  const body = new THREE.SkinnedMesh(g.geo, mats); body.name = 'staffBody'; body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false
  face.add(body); face.updateMatrixWorld(true)
  body.bind(new THREE.Skeleton(bones), body.matrixWorld)
  for (const b of bones) b.userData.rest = { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }
  const bn: Record<string, THREE.Bone> = {}; def.BONES.forEach((d, i) => (bn[d.name] = bones[i]))
  const rig: StaffRig = { who, def, root: bones[0], bones: bn, body, lod }
  face.userData.staff = rig
  face.userData.staffStats = { tris: g.tris, mats: g.mats.map((m) => SM_NAMES[m]), parts: g.parts, genMs: g.genMs }
  return face
}
export function staffTris(o: THREE.Object3D) {
  let n = 0
  o.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh && m.geometry) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 })
  return n
}
