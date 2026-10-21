// 仅限 QA 的 CPU 蒙皮替身（?cpu=1，默认关闭）。
// 背景：无头 Chromium 的 SwiftShader（ANGLE→Vulkan）只要绘制任何 GPU 蒙皮网格，GPU 进程就以 exit_code=4 崩溃
// （见 PARTYGOER-REMAKE.md 的诊断）。Level 274 同时有鹉主杰瑞与多名复古人物 NPC（都是 SkinnedMesh），
// 因此这里做成通用版：打开开关后，场景里每个可见的 SkinnedMesh 只当骨架用（自身隐藏、不编译蒙皮程序），
// 同一套权重与骨骼矩阵在 CPU 上写回一个共享材质的静态替身网格。真实 GPU 不需要也不应开启。
import * as THREE from 'three'

export const QA_CPU_SKIN = typeof location !== 'undefined' && new URLSearchParams(location.search).get('cpu') === '1'

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _n = new THREE.Vector3()

/** 为一个 SkinnedMesh 建立 CPU 替身（同父节点、同局部变换、共享材质）；重复调用返回同一替身 */
export function attachCpuSkin(sk: THREE.SkinnedMesh): THREE.Mesh {
  const old = sk.userData.cpuProxy as THREE.Mesh | undefined
  if (old) return old
  const g = sk.geometry.clone()
  g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight')
  g.morphAttributes = {}
  const proxy = new THREE.Mesh(g, sk.material)
  proxy.frustumCulled = false
  proxy.castShadow = sk.castShadow; proxy.receiveShadow = sk.receiveShadow
  proxy.renderOrder = sk.renderOrder
  proxy.userData.cpuSkin = true
  sk.userData.cpuProxy = proxy
  sk.parent?.add(proxy)
  return proxy
}

/** 把骨骼当前姿态烘进替身（局部空间与 SkinnedMesh 相同） */
export function bakeCpuSkin(sk: THREE.SkinnedMesh) {
  const proxy = attachCpuSkin(sk)
  if (proxy.parent !== sk.parent) sk.parent?.add(proxy)
  proxy.position.copy(sk.position); proxy.quaternion.copy(sk.quaternion); proxy.scale.copy(sk.scale)
  proxy.visible = sk.userData.cpuWantVisible !== false
  sk.visible = false
  sk.skeleton.update()
  const src = sk.geometry, sp = src.attributes.position as THREE.BufferAttribute, sn = src.attributes.normal as THREE.BufferAttribute | undefined
  const dp = proxy.geometry.attributes.position as THREE.BufferAttribute, dn = proxy.geometry.attributes.normal as THREE.BufferAttribute | undefined
  // 带 morph 目标的蒙皮网格（如手臂的「伸长变细」）：先按 morphTargetInfluences 叠加位移，再做骨骼变换（与 GPU 顺序一致）
  const morphed = !!(src.morphAttributes.position?.length && sk.morphTargetInfluences?.some((x) => x !== 0))
  for (let i = 0; i < sp.count; i++) {
    if (morphed) THREE.Mesh.prototype.getVertexPosition.call(sk, i, _v)
    else _v.fromBufferAttribute(sp, i)
    if (sn && dn) { _n.fromBufferAttribute(sn, i); _a.copy(_v).addScaledVector(_n, 0.01) }
    sk.applyBoneTransform(i, _v)
    dp.setXYZ(i, _v.x, _v.y, _v.z)
    if (sn && dn) { sk.applyBoneTransform(i, _a); _a.sub(_v).normalize(); dn.setXYZ(i, _a.x, _a.y, _a.z) }
  }
  dp.needsUpdate = true
  if (dn) dn.needsUpdate = true
  proxy.geometry.computeBoundingSphere()
}

function worldVisible(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o.parent; p && p !== root; p = p.parent) if (!p.visible) return false
  return true
}

/** 每帧渲染前调用：给场景中所有（祖先可见的）SkinnedMesh 建替身并烘焙当前姿态 */
export function syncSceneCpuSkins(scene: THREE.Object3D) {
  const list: THREE.SkinnedMesh[] = []
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) list.push(o as THREE.SkinnedMesh) })
  scene.updateMatrixWorld(true)
  for (const sk of list) {
    // 首次接管时记下原本的可见性（模型自己藏起来的部件不显示替身）
    if (sk.userData.cpuWantVisible === undefined) sk.userData.cpuWantVisible = sk.visible
    if (!worldVisible(sk, scene)) { const p = sk.userData.cpuProxy as THREE.Mesh | undefined; if (p) p.visible = false; sk.visible = false; continue }
    bakeCpuSkin(sk)
  }
}
