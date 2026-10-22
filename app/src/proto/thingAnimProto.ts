// 第 2 阶段动画预览：?anim=<clip>[&view=far|head]——同一条模型连续模拟，12 帧依次画进 4×3 的格子里，
// 截图后由 scripts/verify-thing.mjs 切帧合成 GIF。
import * as THREE from 'three'
import { buildThingMesh, THING, updateThingLod } from '../game/renderer/thingMesh'
const S = THING.S
import { animateThing, makeThingAnimState, THING_CLIP_LEN, type ThingClip } from '../game/renderer/thingAnim'
const q = new URLSearchParams(location.search)
const clip = (q.get('anim') ?? 'cruise') as ThingClip
const close = clip === 'bite' || clip === 'flinch' || q.get('view') === 'head'
const W = innerWidth, H = innerHeight, COLS = 4, ROWS = 3, NF = COLS * ROWS
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15; renderer.autoClear = false
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#071521'); scene.fog = new THREE.FogExp2('#071521', (close ? 0.018 : 0.006) / S)
scene.add(new THREE.HemisphereLight('#b6d4e6', '#2a3640', 2.6))
const sun = new THREE.DirectionalLight('#cfe2f0', 1.1); sun.position.set(10, 30, 12); scene.add(sun)
const rim = new THREE.DirectionalLight('#6f9fbf', 1.2); rim.position.set(-8, 6, -10); scene.add(rim)
const g = buildThingMesh(); scene.add(g)
const st = makeThingAnimState()
const cam = new THREE.PerspectiveCamera(close ? 40 : 46, (W / COLS) / (H / ROWS), 0.1, 3000)
const DT = 1 / 30
let t = 0, yaw = 0, x = 0, y = 0, z = 0
const speed: Record<ThingClip, number> = { drift: 0.6 * S, cruise: 4 * S, circle: 6 * S, dash: 14 * S, bite: 2 * S, flinch: 1.5 * S, flee: 9 * S, glitch: 4 * S }
const step = (c: ThingClip, progress?: number) => {
  const v = speed[c]
  if (c === 'circle') yaw += v / (22 * S) * DT
  if (c === 'flee' && progress !== undefined && progress < 0.45) yaw += Math.PI / (0.45 * (THING_CLIP_LEN.flee ?? 2.4)) * DT // 0.45 段内调头 180°
  if (c === 'drift') y -= 0.05 * S * DT
  x += Math.cos(yaw) * v * DT; z -= Math.sin(yaw) * v * DT
  g.position.set(x, y, z); g.rotation.y = yaw
  animateThing(g, st, { t, dt: DT, clip: c, progress })
  t += DT
}
// 预热：先以 cruise（或 drift 本身）游 8 秒，让链条舒展
const warm: ThingClip = clip === 'drift' ? 'drift' : clip === 'circle' ? 'circle' : 'cruise'
for (let i = 0; i < 240; i++) step(warm)
const len = THING_CLIP_LEN[clip] ?? 3.0
const tw = W / COLS, th = H / ROWS
let stepCount = 0
renderer.setScissorTest(true)
renderer.clear()
for (let f = 0; f < NF; f++) {
  const t1 = (f / (NF - 1)) * len
  // 一次性片段从 0 开始计时
  const total = Math.round(t1 / DT)
  while (stepCount < total) { step(clip, THING_CLIP_LEN[clip] ? stepCount / Math.round(len / DT) : undefined); stepCount++ }
  const hp = new THREE.Vector3(x, y, z)
  const hw = new THREE.Vector3(); (g.userData.parts.head as THREE.Object3D).getWorldPosition(hw)
  const fwd = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  if (close) { const hp0 = hp.clone(); hp.copy(hp0).lerp(hw, 0.6); cam.position.copy(hp).addScaledVector(fwd, 3 * S).add(new THREE.Vector3(0, 2.5 * S, 0)).addScaledVector(new THREE.Vector3(-fwd.z, 0, fwd.x), -12 * S); cam.lookAt(hp.clone().addScaledVector(fwd, 0.5 * S).add(new THREE.Vector3(0, -1.6 * S, 0))) }
  else {
    // 俯视 3/4：看链中段，整条身体都在画面里
    const c0 = st.chain![12], mid = new THREE.Vector3(c0.x, c0.y, c0.z).lerp(hp, 0.35)
    cam.position.copy(mid).add(new THREE.Vector3(6, 34, 26).multiplyScalar(S)); cam.lookAt(mid)
  }
  const col = f % COLS, row = Math.floor(f / COLS)
  renderer.setViewport(col * tw, (ROWS - 1 - row) * th, tw, th); renderer.setScissor(col * tw, (ROWS - 1 - row) * th, tw, th)
  updateThingLod(g, cam.position, 99)
  renderer.clear(); renderer.render(scene, cam)
}
;(window as any).__ready = true
;(window as any).__info = { clip, len, segs: THING.segs }
