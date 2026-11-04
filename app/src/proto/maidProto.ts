// [maid] 管家（Entity 111）阶段 1 建模预览：proto-maid.html?view=three|front|side|back|head|headside|cart|scene
import * as THREE from 'three'
import { buildMaidMesh, buildMaidCartMesh, maidTris } from '../game/renderer/maidMesh'
import { MAID_CLIPS, maidPose, applyMaidPose, type MaidClip } from '../game/renderer/maidAnim'
const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'three'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#5a4a3a')
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: '#6b2a22', roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor)
const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 5), new THREE.MeshStandardMaterial({ color: '#b39a6a', roughness: 1 })); wall.position.set(0, 2.5, -2.2); wall.receiveShadow = true; scene.add(wall)
scene.add(new THREE.HemisphereLight('#fff3dc', '#5a3a2a', 1.5))
const key = new THREE.DirectionalLight('#fff0d8', 2.2); key.position.set(2, 3.5, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 3, bottom: -1, near: 0.1, far: 12 }); key.shadow.bias = -0.0004; scene.add(key)
const fill = new THREE.DirectionalLight('#d8e0ff', 0.6); fill.position.set(-3, 1.5, 1); scene.add(fill)
const lab = document.getElementById('lab')!
const maid = buildMaidMesh(); maid.rotation.y = 0 // face 组已把 +Z 转到 +X；这里整体转回 +Z 朝镜头
maid.rotation.y = 0; maid.children[0].rotation.y = 0
const holder = new THREE.Group(); holder.add(maid); maid.rotation.y = 0; scene.add(holder)
maid.rotation.set(0, 0, 0) // 预览：正面朝 +Z
const cart = buildMaidCartMesh()
const tm = maidTris(maid), tc = maidTris(cart)
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 50)
const V: Record<string, [number[], number[]]> = {
  front: [[0, 1.15, 4.6], [0, 0.98, 0]],
  side: [[4.6, 1.15, 0], [0, 0.98, 0]],
  back: [[-0.8, 1.2, -4.4], [0, 0.98, 0]],
  three: [[2.5, 1.5, 3.8], [0, 0.95, 0]],
  head: [[0.0, 1.76, 0.95], [0, 1.72, 0]],
  headside: [[0.95, 1.76, 0.1], [0, 1.71, 0.04]],
  headback: [[-0.6, 1.82, -0.75], [0, 1.72, 0]],
  headq: [[0.6, 1.78, 0.75], [0, 1.72, 0.03]],
  cart: [[1.75, 1.55, 2.35], [0.02, 0.6, 0]],
  scene: [[2.6, 1.6, 3.6], [0.2, 0.85, 0]],
}
if (view === 'cart') { holder.remove(maid); scene.add(cart) }
if (view === 'scene') { cart.position.set(0.72, 0, 0.05); cart.rotation.y = 0; scene.add(cart); holder.rotation.y = Math.PI / 2; holder.position.set(-0.2, 0, 0) }
const [p, l] = V[view] ?? V.three
cam.position.set(p[0], p[1], p[2]); cam.lookAt(l[0], l[1], l[2])
lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:8px">管家 Entity 111 · ${view}<br><span class="s">本体 ${tm.tris} 三角形 / ${tm.meshes} 网格 · 清洁车 ${tc.tris} / ${tc.meshes}</span></div>`)
const box = new THREE.Box3().setFromObject(maid); ;(window as any).__info = { tm, tc, h: box.max.y, w: box.max.x - box.min.x }
const clip = q.get('clip') as MaidClip | null
if (clip && MAID_CLIPS[clip]) {
  // 动画网格：cols×rows 格，每格一个时刻（同一场景逐格摆姿势、裁剪渲染）
  const cols = +(q.get('cols') ?? 4), rows = +(q.get('rows') ?? 3), N = cols * rows, C = MAID_CLIPS[clip]
  const rig = maid.userData.maid
  const withCart = clip === 'push' || clip === 'park'
  if (withCart) scene.add(cart)
  cart.rotation.y = -Math.PI / 2
  const cv = q.get('cam') ?? (withCart ? 'c' : 'q')
  const camP: Record<string, [number[], number[]]> = { c: [[3.9, 1.6, -0.9], [0, 0.95, 0.45]], q: [[2.6, 1.55, 3.4], [0, 0.95, 0.15]], s: [[4.2, 1.2, 0.3], [0, 0.95, 0.3]], f: [[0, 1.3, 4.4], [0, 0.95, 0]], h: [[1.1, 1.75, 1.6], [0, 1.55, 0.1]] }
  const [cp, cl] = camP[cv] ?? camP.q
  const tw = Math.floor(W / cols), th = Math.floor(H / rows)
  const tc2 = new THREE.PerspectiveCamera(30, tw / th, 0.01, 50); tc2.position.set(cp[0], cp[1], cp[2]); tc2.lookAt(cl[0], cl[1], cl[2])
  renderer.setScissorTest(true); renderer.autoClear = true
  const hands = new THREE.Vector3(), tmp = new THREE.Vector3()
  const draw = () => {
    for (let i = 0; i < N; i++) {
      const t = C.loop ? (i / N) * C.dur : (i / (N - 1)) * C.dur
      applyMaidPose(rig, maidPose(clip, t))
      maid.updateMatrixWorld(true)
      if (withCart) { rig.armL.wrist.getWorldPosition(hands); rig.armR.wrist.getWorldPosition(tmp); hands.add(tmp).multiplyScalar(0.5); if (i === 0 || clip === 'push') cart.position.set(0, 0, hands.z + 0.58 + 0.02); (window as any).__hand = hands.toArray() }
      const c = i % cols, r = Math.floor(i / cols)
      renderer.setViewport(c * tw, H - (r + 1) * th, tw, th); renderer.setScissor(c * tw, H - (r + 1) * th, tw, th)
      renderer.render(scene, tc2)
      if (n === 0) lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${c * tw + tw / 2}px;top:${r * th + th - 22}px;font-size:12px">${t.toFixed(2)}s</div>`)
    }
  }
  lab.querySelector('.l')!.innerHTML = `管家 · ${C.zh} (${clip}) ${C.dur}s${C.loop ? ' 循环' : ''}`
  let n = 0; const loop = () => { draw(); if (++n < 6) requestAnimationFrame(loop); else (window as any).__ready = true }; loop()
} else {
let n = 0; const loop = () => { renderer.render(scene, cam); if (++n < 30) requestAnimationFrame(loop); else (window as any).__ready = true }; loop()

}
