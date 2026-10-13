// 原型预览页：钝人重制（?mode=poses | close | wall）
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { animateDuller } from '../game/renderer/dullerMesh'
import { buildItemMesh } from '../game/renderer/itemsMesh'
const mode = new URLSearchParams(location.search).get('mode') ?? 'poses'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const park = mode === 'wall'
const scene = new THREE.Scene(); scene.background = new THREE.Color(park ? '#8a8d8c' : '#5e5530'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 9, 32)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: park ? '#6d706d' : '#6e5f36' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
if (!park) { const wl = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshLambertMaterial({ color: '#b8aa62' })); wl.position.set(0, 3, -2.5); scene.add(wl) }
scene.add(new THREE.HemisphereLight('#fff6dc', '#3a3628', 1.15)); const sun = new THREE.DirectionalLight('#fff7e0', 1.2); sun.position.set(3, 6, 5); scene.add(sun)
const cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 60)
const lab = document.getElementById('lab')!
const label = (x: number, html: string) => { const p = new THREE.Vector3(x, 0, 0).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${H - 70}px">${html}</div>`) }
const pose = (phase: string, st: string, dl: any, x: number, z: number, rotY: number, animT: number, carry?: string) => {
  const g = buildEntityMesh('duller', { seed: 3 })
  if (carry) { const it = buildItemMesh(carry, { halo: false }); it.scale.multiplyScalar(0.85); (g.userData.dullerRig.carry as THREE.Group).add(it) }
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g)
  const e: any = { id: 3, state: st, animT, dl: { phase, reach: 0, reachLen: 1, wallD: -1, sway: 1, run: 0, ...dl } }
  // 先跑两帧建立运动量（walk/run 姿态需要 animT 的变化率）
  const v = dl.v ?? 0
  for (let i = 0; i < 40; i++) { e.animT = animT - (40 - i) * v / 30; animateDuller(g, e, 1.3 + i / 30, 0) }
  e.animT = animT; animateDuller(g, e, 1.3 + 40 / 30, 0)
  let c = 0; g.traverse((m: any) => { if (m.isMesh) c++ }); return c
}
if (mode === 'wall') {
  // 复刻附图：停车场白柱，柱后的钝人把双臂「切」出柱面，柱面晕开黑渍
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 0.7), new THREE.MeshLambertMaterial({ color: '#e7e5df' })); pillar.position.set(0, 1.6, 0.75); scene.add(pillar)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#4a4b48', side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.2; scene.add(ceil)
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: '#c9b54a' })); line.rotation.x = -Math.PI / 2; line.rotation.z = 0.9; line.position.set(1.5, 0.005, 3); scene.add(line)
  cam.position.set(-0.6, 1.45, 4.6); cam.lookAt(0.1, 1.2, 0.8)
  pose('reach', 'attack', { reach: 1, reachLen: 2.5, wallD: 1.12, sway: 0.2 }, 0, 0, -Math.PI / 2, 0.3)
} else if (mode === 'close') {
  cam.position.set(1.7, 1.85, 1.6); cam.lookAt(0.05, 1.62, 0)
  pose('lurk', 'investigate', {}, 0, 0, -0.35, 0.2)
} else {
  cam.position.set(0, 2.0, 15.5); cam.lookAt(0, 1.05, 0)
  const items: [string, string, any, string, number, string?][] = [
    ['roam', 'wander', {}, '站姿：摇晃、歪颈', 0],
    ['roam', 'wander', { v: 1.4 }, '游荡：不自然的步态', 0.55],
    ['lurk', 'investigate', { v: 0.6 }, '携带随机物品', 1.1, 'canned'],
    ['reach', 'attack', { reach: 1, reachLen: 2.2, sway: 0.2 }, '伸臂：前臂伸长数倍', 0.3],
    ['flee', 'stunned', { run: 1, v: 3.4 }, '被注意到：急速逃离', 0.4]]
  let calls = 0
  items.forEach(([ph, st, dl, name, aT, carry], i) => { const x = (i - 2) * 3.0; calls = Math.max(calls, pose(ph, st, dl, x - (i === 3 ? 0.9 : 0), 0, -0.6, aT, carry)); label(x, name) })
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px"><span class="s">单只约 ${calls} 次绘制</span></div>`)
}
cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__ready = true
