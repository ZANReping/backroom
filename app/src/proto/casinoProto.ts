// [casino] Level 5.1 赌场预览：proto-casino.html?cpu=1&view=hall|foyer|slots|tables|roulette|bar|vip|marquee|marqueeoff|chips|pbr|free[&cam=x,y,z&at=x,y,z&fov=][&t=秒]
//   free：自由漫游（WASD + 鼠标拖拽转向，Q/E 升降）。window.__ready / __info（三角形、绘制调用、实例数、生成耗时）
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { buildCasinoScene, buildCasinoMarquee, buildChipStacks } from '../game/renderer/casinoScene'
import { casinoMaterial, CASINO_SURFACES, bakeCasinoSurface } from '../game/renderer/casinoMaterials'
import { OX, OY } from '../game/content/casinoLayout'
const q = new URLSearchParams(location.search), view = q.get('view') ?? 'hall'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = Number(q.get('exp') ?? 1.15)
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#050203'); scene.fog = new THREE.Fog('#0a0405', 18, 70)
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 60), W / H, 0.03, 200)
const t0 = performance.now()
const X = (v: number) => OX + v, Z = (v: number) => OY + v
type CamDef = [number[], number[], number?]
const VIEWS: Record<string, CamDef> = {
  hall: [[X(26), 5.4, Z(35.4)], [X(24), 1.0, Z(10)], 72], foyer: [[X(26), 1.65, Z(35.4)], [X(26), 1.5, Z(24)], 68],
  slots: [[X(15.3), 1.6, Z(15.9)], [X(5), 1.15, Z(14.5)], 62], tables: [[X(16.2), 2.5, Z(14.6)], [X(25), 0.8, Z(5.6)], 62],
  roulette: [[X(27.7), 1.75, Z(15.7)], [X(25.6), 0.9, Z(14)], 45], bar: [[X(35.2), 1.7, Z(14.2)], [X(44.8), 1.5, Z(8.2)], 70],
  vip: [[X(5.5), 1.7, Z(11.8)], [X(5.5), 0.9, Z(3)], 64], chips: [[X(19.05), 1.12, Z(3.15)], [X(19.1), 0.87, Z(2.65)], 40], free: [[X(26), 1.65, Z(34)], [X(26), 1.6, Z(24)], 70],
}
let info: Record<string, unknown> = {}
let update = (_dt: number) => {}
if (view === 'marquee' || view === 'marqueeoff') {
  // L5 贝弗莉室墙面上的大门外观：玫瑰地毯 + 象牙墙
  const on = view === 'marquee'
  const mq = buildCasinoMarquee(); scene.add(mq.group)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 5.78), new THREE.MeshStandardMaterial({ color: '#b7a183', roughness: 0.9 })); wall.position.set(0, 2.89, -0.01); scene.add(wall)
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), new THREE.MeshStandardMaterial({ color: '#5a2228', roughness: 0.95 })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  scene.add(new THREE.HemisphereLight('#ffe3bd', '#301010', on ? 0.25 : 0.4))
  if (on) { const pl = new THREE.PointLight('#ffb070', 30, 12, 1.4); pl.position.set(0, 2.4, 2.2); scene.add(pl); const p2 = new THREE.PointLight('#ff4040', 12, 9, 1.5); p2.position.set(0, 4.6, 1.6); scene.add(p2) }
  else { const pl = new THREE.PointLight('#ffe3bd', 10, 14, 1.4); pl.position.set(3, 4, 6); scene.add(pl) }
  mq.update(1.3, on); cam.position.set(0, 1.7, 9.5); cam.lookAt(0, 3.0, 0)
  info = { tris: mq.tris }
} else if (view === 'pbr') {
  // PBR 贴图样板：每种表面一个球 + 一块方板
  scene.background = new THREE.Color('#151012')
  scene.add(new THREE.HemisphereLight('#ffffff', '#202020', 0.6)); const d = new THREE.DirectionalLight('#fff4e0', 2.4); d.position.set(3, 5, 6); scene.add(d)
  const list = CASINO_SURFACES.filter((s) => s !== 'screen'), cols = 6
  list.forEach((s, i) => {
    const x = (i % cols - (cols - 1) / 2) * 1.5, y = -Math.floor(i / cols) * 1.55 + 1.6
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), casinoMaterial(s, 1)); m.position.set(x - 0.0, y, 0); m.rotation.x = -0.25; scene.add(m)
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 16), casinoMaterial(s, 2)); sp.position.set(x + 0.42, y - 0.42, 0.35); scene.add(sp)
  })
  info.surfaces = Object.fromEntries(list.map((s) => [s, { nan: bakeCasinoSurface(s).nan, size: bakeCasinoSurface(s).size }]))
  cam.position.set(0, 0.1, 8.6); cam.lookAt(0, 0.05, 0)
} else {
  const cs = buildCasinoScene({ lights: true }); scene.add(cs.group)
  if (view === 'chips') { const g = new THREE.Group(); buildChipStacks(g, [{ x: X(19.35), y: Z(2.6), seed: 3, big: 1 }], 0.87); scene.add(g) }
  info.lmMean = +cs.lightmap.mean.toFixed(3)
  const v = VIEWS[view] ?? VIEWS.hall
  const cq = q.get('cam')?.split(',').map(Number), aq = q.get('at')?.split(',').map(Number)
  cam.position.fromArray(cq ?? v[0]); cam.lookAt(new THREE.Vector3().fromArray(aq ?? v[1])); if (v[2] && !q.get('fov')) { cam.fov = v[2]; cam.updateProjectionMatrix() }
  cs.update(Number(q.get('t') ?? 2.3))
  update = (dt) => cs.update(dt)
  info = { ...cs.stats(), marqueeTris: cs.marquee.tris }
  if (view === 'free') {
    const keys = new Set<string>(); window.addEventListener('keydown', (e: KeyboardEvent) => keys.add(e.key.toLowerCase())); window.addEventListener('keyup', (e: KeyboardEvent) => keys.delete(e.key.toLowerCase()))
    let yaw = Math.PI, pitch = 0, drag = false; addEventListener('mousedown', () => (drag = true)); addEventListener('mouseup', () => (drag = false)); window.addEventListener('mousemove', (e: MouseEvent) => { if (drag) { yaw -= e.movementX * 0.004; pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.004)) } })
    const u0 = update; update = (dt) => { u0(dt); const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new THREE.Vector3(-f.z, 0, f.x), sp = 4 * dt; if (keys.has('w')) cam.position.addScaledVector(f, sp); if (keys.has('s')) cam.position.addScaledVector(f, -sp); if (keys.has('d')) cam.position.addScaledVector(r, sp); if (keys.has('a')) cam.position.addScaledVector(r, -sp); if (keys.has('e')) cam.position.y += sp; if (keys.has('q')) cam.position.y -= sp; cam.rotation.set(pitch, yaw, 0, 'YXZ') }
  }
}
info.genMs = Math.round(performance.now() - t0)
// 自发光 bloom（同游戏管线 UnrealBloomPass；?bloom=0 关）
let composer: EffectComposer | null = null
if (q.get('bloom') !== '0' && view !== 'pbr') { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, cam)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), Number(q.get('bloomk') ?? 0.4), 0.45, 0.9)); composer.addPass(new OutputPass()) }
const draw = () => (composer ? composer.render() : renderer.render(scene, cam))
renderer.render(scene, cam)
info.calls = renderer.info.render.calls; info.rTris = renderer.info.render.triangles
;(window as unknown as { __info: unknown }).__info = info
document.getElementById('hud')!.textContent = q.get('nolab') ? '' : `${view} · ${JSON.stringify(info).slice(0, 160)}`
let last = performance.now(), frames = 0
const loop = () => { const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); draw(); if (++frames === 3) (window as unknown as { __ready: boolean }).__ready = true; requestAnimationFrame(loop) }
loop()
