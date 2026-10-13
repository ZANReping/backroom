// 原型预览页：猎犬重制（?mode=poses | close）
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { animateHound } from '../game/renderer/houndMesh'
const mode = new URLSearchParams(location.search).get('mode') ?? 'poses'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#5e5530'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 8, 30)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#6e5f36' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshLambertMaterial({ color: '#b8aa62' })); wl.position.set(0, 3, -2.5); scene.add(wl)
scene.add(new THREE.HemisphereLight('#fff2c0', '#3a321a', 1.1)); const sun = new THREE.DirectionalLight('#fff3c8', 1.3); sun.position.set(3, 5, 4); scene.add(sun)
const cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 60)
const lab = document.getElementById('lab')!
const label = (x: number, html: string) => { const p = new THREE.Vector3(x, 0, 0).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${H - 70}px">${html}</div>`) }
const pose = (neutral: boolean, phase: string, st: string, hd: any, x: number, z: number, rotY: number, animT = 0.6) => {
  const g = buildEntityMesh('hound', { houndNeutral: neutral, seed: 2 })
  g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g)
  const e: any = { id: 1, state: st, animT, hd: { neutral, phase, crouch: 0, howlPose: 0, sit: 0, jaw: 0, wag: 0, ...hd } }
  animateHound(g, e, 1.7, 0); g.position.x = x; g.position.z = z
  let c = 0; g.traverse((m: any) => { if (m.isMesh) c++ }); return c
}
if (mode === 'side') {
  cam.position.set(0.1, 0.85, 2.3); cam.lookAt(0.05, 0.58, 0)
  pose(false, 'stalk', 'wander', { crouch: 0.2 }, 0, 0, 0, 0.5)
} else if (mode === 'close') {
  cam.position.set(0.9, 0.95, 1.9); cam.lookAt(0.45, 0.68, 0)
  pose(false, 'charge', 'chase', { jaw: 0.7 }, 0, 0, -0.55, 0.2)
} else {
  cam.position.set(0, 2.2, 13); cam.lookAt(0, 0.55, 0)
  const items: [boolean, string, string, any, string, number][] = [
    [false, 'stalk', 'chase', { crouch: 0.45 }, '潜行逼近', 0.7], [false, 'charge', 'chase', { jaw: 0.6 }, '冲锋', 0.35],
    [false, 'howl', 'chase', { howlPose: 1, jaw: 1 }, '仰头嚎叫', 0], [false, 'cower', 'stunned', { crouch: 1, jaw: 0.25 }, '被直视：伏低后退', 0],
    [true, 'sit', 'wander', { sit: 1, wag: 1 }, 'L11 中立：坐下观察', 0]]
  let calls = 0
  items.forEach(([n, ph, st, hd, name, aT], i) => { const x = (i - 2) * 2.6; calls = pose(n, ph, st, hd, x - 0.35, 0, -0.5, aT); label(x, name) })
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px"><span class="s">单只 ${calls} 次绘制</span></div>`)
}
cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__ready = true
