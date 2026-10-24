import assert from 'node:assert/strict'
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'
import type { AvatarCfg } from '../src/game/core/avatar'
import type { PlayerState } from '../src/game/engine'
import type { EquipVisual } from '../src/game/renderer/playerModel'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) },
  window: { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { DEFAULT_AVATAR, saveAvatar, getAvatar } = await import('../src/game/core/avatar')
const { buildAvatarModel } = await import('../src/game/renderer/retroAvatar')
const { buildBreakBody, breakAppearance } = await import('../src/components/realityBreak3d/breakBody')
let checks = 0
const ok = (v: unknown, s: string) => { assert(v, s); checks++ }
const attrEqual = (a: THREE.BufferAttribute, b: THREE.BufferAttribute) => a.count === b.count && a.itemSize === b.itemSize && Array.from(a.array).every((v, i) => v === b.array[i])
const configs: [string, AvatarCfg, EquipVisual][] = [
  ['default', { ...DEFAULT_AVATAR }, {}],
  ['female dark shorts sneakers', { ...DEFAULT_AVATAR, gender: 1, skin: '#5a4030', pantsStyle: 1, shoes: 1 }, {}],
  ['male red windcoat cargo boots', { ...DEFAULT_AVATAR, top: '#6a3a3a', topStyle: 7, pantsStyle: 2, shoes: 2 }, {}],
  ['suit gloves headlamp', { ...DEFAULT_AVATAR }, { suit: true, gloves: true, headlamp: true }],
]

saveAvatar(configs[1][1])
const state = { hasGloves: true, hasSuit: false, equip: { body: { type: 'cavingsuit' }, head: { type: 'headlamp' } } } as unknown as PlayerState
const snapshot = breakAppearance(state)
ok(JSON.stringify(snapshot.avatar) === JSON.stringify(getAvatar()) && snapshot.avatar !== getAvatar(), 'snapshot copies current edited avatar')
ok(snapshot.equipment.gloves && snapshot.equipment.cavingsuit && snapshot.equipment.headlamp && !snapshot.equipment.suit && !snapshot.equipment.divemask, 'snapshot maps current equipment')
state.equip.head = null
ok(snapshot.equipment.headlamp, 'snapshot independent of subsequent equipment change')

for (const [label, avatar, equipment] of configs) {
  const body = buildBreakBody({ avatar, equipment })
  const production = buildAvatarModel(avatar, { ev: equipment, driven: true })
  const rig = production.userData.retro, br = body.model.userData.retro
  const mats = (Array.isArray(rig.mesh.material) ? rig.mesh.material : [rig.mesh.material]) as THREE.MeshLambertMaterial[]
  ok(body.group.children.includes(body.model) && br.mesh.isSkinnedMesh, label + ' uses production skinned avatar')
  ok(body.appearance.avatar !== avatar && body.appearance.equipment !== equipment, label + ' owns config snapshot')
  for (const name of ['position', 'uv', 'color', 'skinIndex', 'skinWeight']) {
    ok(attrEqual(rig.mesh.geometry.getAttribute(name), br.mesh.geometry.getAttribute(name)), label + ' production ' + name + ' preserved')
  }
  ok(body.textures.length > 0 && body.textures.includes(mats[0].map!), label + ' shares production cloth atlas')
  const full = rig.mesh.geometry, filtered = br.mesh.geometry, index = filtered.index!
  ok(index.count < (full.index?.count ?? full.getAttribute('position').count) && index.count > 0, label + ' removes near-camera head only')
  const hidden = new Set(br.mesh.skeleton.bones.flatMap((b: THREE.Bone, i: number) => b.name === 'head' || b.name === 'neck' ? [i] : []))
  const si = full.getAttribute('skinIndex'), sw = full.getAttribute('skinWeight')
  let clean = true
  for (let i = 0; i < index.count; i++) for (let k = 0; k < 4; k++) if (hidden.has(si.getComponent(index.getX(i), k)) && sw.getComponent(index.getX(i), k) >= .001) clean = false
  ok(clean, label + ' no head/neck clipping')
  ok(filtered.groups.every((g: THREE.GeometryGroup) => g.start + g.count <= index.count && g.count % 3 === 0), label + ' valid material groups')
  for (const t of [0, 3.2, 6.2, 7, 8, 11.4, 11.95]) {
    body.update(t)
    ok(Array.from(br.mesh.skeleton.boneMatrices).every(Number.isFinite), label + ' finite skinning t=' + t)
  }
  const before = br.bones.upperArmL.rotation.z
  body.update(3.2)
  ok(before !== br.bones.upperArmL.rotation.z && br.bones.thighL.rotation.x !== br.bones.thighR.rotation.x, label + ' asymmetric falling pose animates')
  body.dispose(); body.dispose(); rig.dispose()
}

const a = buildBreakBody({ avatar: { ...DEFAULT_AVATAR }, equipment: {} })
const b = buildBreakBody({ avatar: { ...DEFAULT_AVATAR }, equipment: {} })
const ar = a.model.userData.retro, br = b.model.userData.retro
ok(ar.mesh.geometry !== br.mesh.geometry && ar.mesh.material !== br.mesh.material && ar.mesh.skeleton !== br.mesh.skeleton, 'instances own geometry materials and skeleton')
ok(a.textures.some(t => b.textures.includes(t)), 'instances share atlas pool')
const disposedGeometries = new Set<THREE.BufferGeometry>(), dispose = THREE.BufferGeometry.prototype.dispose
THREE.BufferGeometry.prototype.dispose = function () { disposedGeometries.add(this); dispose.call(this) }
const materialDisposals = ar.mesh.material.map(() => 0)
ar.mesh.material.forEach((m: THREE.Material, i: number) => m.addEventListener('dispose', () => materialDisposals[i]++))
let sharedTextureDisposals = 0, skeletonDisposals = 0
for (const t of a.textures) t.addEventListener('dispose', () => sharedTextureDisposals++)
const skeletonDispose = ar.mesh.skeleton.dispose.bind(ar.mesh.skeleton)
ar.mesh.skeleton.dispose = () => { skeletonDisposals++; skeletonDispose() }
try { a.dispose(); a.dispose() } finally { THREE.BufferGeometry.prototype.dispose = dispose }
ok(disposedGeometries.size === 2 && disposedGeometries.has(ar.mesh.geometry), 'releases filtered and original geometry')
ok(materialDisposals.every((n: number) => n === 1) && skeletonDisposals === 1, 'owned materials and skeleton released once')
ok(sharedTextureDisposals === 0 && a.group.children.length === 0, 'retains shared atlases and detaches model')
b.update(7.2)
ok(Array.from(br.mesh.skeleton.boneMatrices).every(Number.isFinite) && br.mesh.geometry.attributes.position.count > 0, 'other instance still animates after disposal')
b.dispose()
ok(sharedTextureDisposals === 0, 'all cutscenes leave shared textures alive')
console.log(JSON.stringify({ checks, configs: configs.map(c => c[0]), ok: true }))
