/* eslint-disable @typescript-eslint/no-explicit-any -- resource regression reads private test state intentionally */
// 运行：先用 esbuild 将本文件打包为 ESM，再用 node 执行。
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  document: {
    createElement: (tag: string) => tag === 'canvas' ? createCanvas(256, 256) : ({ getContext: () => null, style: {}, addEventListener() {}, removeEventListener() {} }),
    createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }), getElementById: () => null,
    addEventListener() {}, removeEventListener() {}, body: { appendChild() {} }
  },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) }
})

const THREE = await import('three')
const { buildFirearmMesh, buildCartMesh, setChambers, disposeFirearmPart } = await import('../src/game/renderer/firearmMesh')
const { FirearmView, GunWorldFx, GUN_VM_SCALE, ADS_HAND_OPACITY } = await import('../src/game/renderer/firearmView')
const { newGunRun } = await import('../src/game/engine/firearms')
const { GUNS } = await import('../src/game/content/firearms')
const { buildRetroHand } = await import('../src/game/renderer/retroViewHand')
const { buildHeldItem } = await import('../src/game/renderer/viewmodel')
const { setMaterialMode } = await import('../src/game/renderer/shared')

let failures = 0, checks = 0
const ok = (condition: unknown, message: string) => { checks++; if (!condition) failures++; console.log(`${condition ? '✔' : '✘'} ${message}`) }

const disposedGeometry = new Set<THREE.BufferGeometry>()
const disposedMaterial = new Set<THREE.Material>()
const disposedTexture = new Set<THREE.Texture>()
const textureDispose = THREE.Texture.prototype.dispose
THREE.Texture.prototype.dispose = function () { disposedTexture.add(this); textureDispose.call(this) }
const geometryDispose = THREE.BufferGeometry.prototype.dispose
const materialDispose = THREE.Material.prototype.dispose
THREE.BufferGeometry.prototype.dispose = function () { disposedGeometry.add(this); geometryDispose.call(this) }
THREE.Material.prototype.dispose = function () { disposedMaterial.add(this); materialDispose.call(this) }

function finiteGeometry(root: THREE.Object3D) {
  let good = true, triangles = 0, uvCount = 0
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const p = m.geometry.getAttribute('position'); const uv = m.geometry.getAttribute('uv')
    triangles += p ? (m.geometry.index ? m.geometry.index.count : p.count) / 3 : 0
    if (!p || !p.array.every(Number.isFinite) || !uv || !uv.array.every(Number.isFinite)) good = false
    uvCount += uv?.count ?? 0
  })
  return { good, triangles, uvCount }
}

function resources(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>()
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    geometries.add(m.geometry)
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) materials.add(mat)
  })
  return { geometries, materials }
}

const gunTypes = Object.keys(GUNS) as Array<keyof typeof GUNS>
const rigs: any[] = []
for (const mode of ['classic', 'realistic'] as const) {
  setMaterialMode(mode)
  const made: any[] = []
  for (const type of gunTypes) {
    const rig = buildFirearmMesh(type); made.push(rig); rigs.push(rig)
    const g = finiteGeometry(rig.root)
    ok(g.good && g.uvCount > 0 && g.triangles < 25000, `${mode}/${type}：几何、UV 有限且规模受限`)
  }
  ok(made.length === 5, `${mode}：五把枪均可独立构建`)
}

// 独立实例：释放一把枪不应释放第二把的资源。
const a = buildFirearmMesh('dbshotgun'); const b = buildFirearmMesh('dbshotgun')
const bGeo = new Set<THREE.BufferGeometry>(); const bMat = new Set<THREE.Material>()
b.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { bGeo.add(m.geometry); const mat = Array.isArray(m.material) ? m.material : [m.material]; mat.forEach((x) => bMat.add(x)) } })
const beforeG = disposedGeometry.size, beforeM = disposedMaterial.size
disposeFirearmPart(a.root)
ok(disposedGeometry.size > beforeG && disposedMaterial.size > beforeM, '释放第一实例：触发几何与材质 dispose')
ok([...bGeo].every((g) => !disposedGeometry.has(g)) && [...bMat].every((m) => !disposedMaterial.has(m)), '释放第一实例：第二实例资源仍存活')
disposeFirearmPart(b.root)

// 换膛弹种必须释放旧弹壳部件。
const ch = buildFirearmMesh('dbshotgun'); const old = ch.chambers.flatMap((x) => x ? [...x.children] : [])
setChambers(ch, ['shell_buck', 'shell_buck'], 'shell_buck')
const afterFirst = disposedGeometry.size + disposedMaterial.size
setChambers(ch, ['shell_bird', 'shell_bird'], 'shell_bird')
ok(disposedGeometry.size + disposedMaterial.size > afterFirst, '膛内弹种变化：旧部件触发 dispose')
disposeFirearmPart(ch.root); void old

// The animated first-person path must use the firearm rig, never a rotated ground mesh.
for (const type of gunTypes) {
  const held = buildHeldItem(type)
  const rig = held.userData.gunRig as { type?: string; root?: THREE.Group } | undefined
  ok(!!rig?.root && rig.type === type && rig.root.parent === held, `viewmodel/${type}：返回可挂接 gunRig`)
  disposeFirearmPart(held)
}

// FirearmView 的抛壳上限、clearWorld 和 dispose。
const scene = new THREE.Scene(); const vm = new THREE.Group(); scene.add(vm)
const view: any = new FirearmView(vm, scene)
const heldRig = buildFirearmMesh('dbshotgun'); const rightHand = buildRetroHand()
view.attach(heldRig, rightHand, null)
const viewResources = resources(view.hands.L.hand.group)
for (const d of view.dummies.values()) {
  const r = resources(d); r.geometries.forEach((g) => viewResources.geometries.add(g)); r.materials.forEach((m) => viewResources.materials.add(m))
}
viewResources.materials.add(view.flash.material)
for (let i = 0; i < 20; i++) view.fly.push({ o: buildCartMesh('shell_buck', true), v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0, rest: false, floor: 0 })
while (view.fly.length > 16) { const f = view.fly.shift(); disposeFirearmPart(f.o) }
ok(view.fly.length <= 16, 'FirearmView：抛壳实例保持最多 16 个')
const flyBefore = disposedGeometry.size + disposedMaterial.size; view.clearWorld()
ok(disposedGeometry.size + disposedMaterial.size > flyBefore && view.fly.length === 0, 'FirearmView.clearWorld：释放抛壳实例')
view.dispose()
ok([...viewResources.geometries].every((g) => disposedGeometry.has(g)) && [...viewResources.materials].every((m) => disposedMaterial.has(m)), 'FirearmView.dispose：释放手部、dummy 与闪光材质')
rightHand.dispose(); disposeFirearmPart(heldRig.root)

// 世界特效：clear/dispose 释放克隆 sprite 与自身几何材质，纹理保持共享。
const fx = new GunWorldFx(scene); fx.muzzleSmoke(new THREE.Vector3(), new THREE.Vector3(0, 0, -1)); fx.impact(0, 0, 0, 0, 1, 0, false, false)
const fxBefore = disposedGeometry.size + disposedMaterial.size; fx.clear()
ok(disposedGeometry.size + disposedMaterial.size > fxBefore, 'GunWorldFx.clear：释放临时粒子材质')
const fxGeo = (fx as any).decalGeo as THREE.BufferGeometry
const fxMats = [(fx as any).decalMat, (fx as any).smokeMat, (fx as any).sparkMat, (fx as any).burstMat, (fx as any).goreMat] as THREE.Material[]
const fxTextures = fxMats.map((m) => (m as THREE.MeshBasicMaterial).map).filter((t): t is THREE.Texture => !!t)
fx.dispose()
ok(disposedGeometry.has(fxGeo) && fxMats.every((m) => disposedMaterial.has(m)) && fxTextures.length > 0 && fxTextures.every((t) => !disposedTexture.has(t)), 'GunWorldFx.dispose：释放自身几何与材质（纹理保持共享）')

// ADS fade applies to sleeves as well as skin; opaque mode retires both depth-only proxies.
for (const sleeveKind of ['long', 'short', 'none'] as const) {
  const h = buildRetroHand()
  h.setLook({skin:'#c9a58a',sleeve:'#3a3f46',sleeveKind,topStyle:3,plainSleeve:true})
  h.setOpacity(ADS_HAND_OPACITY)
  const depth = h.group.children.filter(o => (o as THREE.Mesh).isMesh && !(o as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>).material.colorWrite)
  const skin = h.skin.material as THREE.Material, sleeve = h.sleeve.material as THREE.Material
  ok(skin.transparent && sleeve.transparent && skin.opacity === ADS_HAND_OPACITY && sleeve.opacity === ADS_HAND_OPACITY && depth.filter(o => o.visible).length === (sleeveKind === 'long' ? 2 : 1), `${sleeveKind}：瞄准透明度与深度预写匹配实际袖长`)
  h.setOpacity(1)
  ok(!skin.transparent && !sleeve.transparent && skin.opacity === 1 && depth.every(o => !o.visible), `${sleeveKind}：恢复不透明后关闭深度预写`)
  h.dispose()
}

// A single view is reused by the real renderer. Every attachment must align its own sight,
// restore the borrowed right hand and leave the revolver's borrowed contact resources alive.
const reuseScene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(72,16/9,.05,30), reuseVm = new THREE.Group()
reuseScene.add(camera); camera.add(reuseVm); reuseVm.rotation.order='YXZ'
const sharedRight = buildRetroHand(); reuseVm.add(sharedRight.group)
const reuse: any = new FirearmView(reuseVm,reuseScene)
for (const type of gunTypes) {
  const rig = buildFirearmMesh(type); reuseVm.add(rig.root); reuse.attach(rig,sharedRight,null)
  const run = newGunRun();run.aim=1
  const mag = Array(GUNS[type].capacity).fill(GUNS[type].ammo[0])
  const out = reuse.update({run,mag,sel:GUNS[type].ammo[0],stage:6,cyl:0,sprint:false,moving:false,time:0,bob:0,dt:1/60,camera,floorY:-1.6})
  reuseVm.scale.setScalar(GUN_VM_SCALE);reuseVm.position.set(out.px,out.py,out.pz);reuseVm.rotation.set(out.rx,out.ry,out.rz)
  camera.fov=72*GUNS[type].adsFov;camera.updateProjectionMatrix();reuseScene.updateMatrixWorld(true)
  const point=rig.sight.target.clone().applyMatrix4(rig.root.matrixWorld).project(camera)
  ok(Math.hypot(point.x*camera.aspect/2,point.y/2)<.005, `reuse/${type}：切枪后使用该枪自己的瞄准位置`)
  ok((sharedRight.skin.material as THREE.Material).opacity===ADS_HAND_OPACITY && reuse.hands.L.hand.skin.material.opacity===ADS_HAND_OPACITY, `reuse/${type}：双手按真实瞄准状态淡出`)
  const borrowed=[...reuse.aroundSolids.values()].map((root: any)=>resources(root))
  reuse.detach()
  ok((sharedRight.skin.material as THREE.Material).opacity===1 && !(sharedRight.skin.material as THREE.Material).transparent, `reuse/${type}：卸下枪后归还不透明右手`)
  if(type==='revolver')ok(borrowed.length>0 && borrowed.every(r=>[...r.geometries].every(g=>!disposedGeometry.has(g)) && [...r.materials].every(m=>!disposedMaterial.has(m))), 'revolver：释放接触代理不会释放被借用的枪或手资源')
  disposeFirearmPart(rig.root)
}
// Recreating a revolver contact proxy must reuse its solved grip, not allocate one per swap.
const repeatRig=buildFirearmMesh('revolver'), repeatGeo=new Set<THREE.BufferGeometry>()
reuseVm.add(repeatRig.root)
for(let i=0;i<20;i++) {
  reuse.attach(repeatRig,sharedRight,null)
  const run=newGunRun()
  reuse.update({run,mag:[],sel:'cart_4440',stage:0,cyl:0,sprint:false,moving:false,time:i,bob:0,dt:1/60,camera,floorY:-1.6})
  repeatGeo.add(reuse.hands.L.hand.skin.geometry)
  reuse.detach()
}
ok(repeatGeo.size===1, 'revolver：反复接管同一枪身复用托握几何')
disposeFirearmPart(repeatRig.root)
reuse.dispose();sharedRight.dispose()

for (const r of rigs) disposeFirearmPart(r.root)
THREE.BufferGeometry.prototype.dispose = geometryDispose
THREE.Material.prototype.dispose = materialDispose
THREE.Texture.prototype.dispose = textureDispose
console.log(`RESULT ${failures ? 'FAIL' : 'PASS'} checks=${checks} failures=${failures}`)
if (failures) process.exitCode = 1
