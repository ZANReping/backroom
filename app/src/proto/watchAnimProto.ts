// 第 2 阶段动画预览：?anim=1&kind=<watcher|strider|mangled>&clip=<片段>&frames=N&dur=秒&view=<side|front|three>&real=1&cpu=1
// 页面把 N 帧画成网格（截图用），并把每帧的 dataURL 放进 window.__frames（拼 GIF 用）。
import * as THREE from 'three'
import { buildWatchMesh, watchBudget, WATCHER_HOVER } from '../game/renderer/neighborhoodWatchMesh'
import { buildMangledMesh, buildMangledShroud } from '../game/renderer/mangledMesh'
import { WATCH_CLIPS, poseWatch, type WatchKindAnim } from '../game/renderer/watchAnim'
import { setMaterialMode } from '../game/renderer/shared'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const kind = (Q.get('kind') ?? 'strider') as WatchKindAnim
const clips = WATCH_CLIPS[kind] as Record<string, { len: number; loop: boolean }>
const clip = Q.get('clip') ?? Object.keys(clips)[0]
const info = clips[clip]
const frames = +(Q.get('frames') ?? 8), dur = +(Q.get('dur') ?? info.len), view = Q.get('view') ?? 'three', real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const CW = +(Q.get('cw') ?? 420), CH = +(Q.get('ch') ?? 360)
const cols = Math.min(frames, +(Q.get('cols') ?? 4)), rows = Math.ceil(frames / cols)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(CW, CH); renderer.outputColorSpace = THREE.SRGBColorSpace
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1 }
const scene = new THREE.Scene(); scene.background = new THREE.Color(kind === 'mangled' ? '#56565a' : '#222220')
scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 0.9)); const sun = new THREE.DirectionalLight('#fff6e8', 1.6); sun.position.set(3, 6, 4); scene.add(sun)
const big = kind === 'mangled'
const fl = new THREE.Mesh(new THREE.PlaneGeometry(big ? 200 : 20, big ? 200 : 20), new THREE.MeshLambertMaterial({ color: '#4a4844' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const grid = new THREE.GridHelper(big ? 200 : 20, big ? 40 : 40, '#5a5854', '#55524d'); grid.position.y = 0.002; scene.add(grid)
const g = kind === 'mangled' ? buildMangledMesh() : buildWatchMesh(kind); scene.add(g)
if (kind === 'watcher') g.position.y = WATCHER_HOVER
if (big && Q.get('smoke') === '1') { scene.fog = new THREE.Fog('#5c5c60', 20, 160); scene.add(buildMangledShroud(0.8)) }
// 道具：被抓/被砸/被举的人形（挺进者）、捕获目标（残缺者）
const target = kind === 'mangled' ? new THREE.Vector3(10, 1.2, 6) : clip === 'present' ? new THREE.Vector3(1.5, 3.1, 0) : clip === 'reach' ? new THREE.Vector3(2.4, 1.0, 0.25) : new THREE.Vector3(1.9, 1.8, 0)
const S = kind === 'mangled' ? 34 : kind === 'watcher' ? 2.2 : 2.6
const C = kind === 'mangled' ? new THREE.Vector3(0, 20, 0) : kind === 'watcher' ? new THREE.Vector3(0, WATCHER_HOVER, 0) : new THREE.Vector3(0.4, 1.5, 0)
const cam = new THREE.PerspectiveCamera(34, CW / CH, 0.05, 600)
const dirs: Record<string, [number, number, number]> = { side: [0.05, 0.12, 1], front: [1, 0.2, 0.08], three: [0.75, 0.42, 0.85], back: [-0.8, 0.4, 0.6], low: [0.9, 0.05, 0.6] }
const d = new THREE.Vector3(...(dirs[view] ?? dirs.three)).normalize()
cam.position.copy(C).addScaledVector(d, S * 2.6); cam.lookAt(C)
const out = document.createElement('canvas'); out.width = cols * CW; out.height = rows * CH + 30
const ctx = out.getContext('2d')!; ctx.fillStyle = '#111'; ctx.fillRect(0, 0, out.width, out.height)
document.body.appendChild(out); out.style.display = 'block'
const urls: string[] = []
for (let i = 0; i < frames; i++) {
  const t = info.loop ? (i / frames) * dur : (i / Math.max(1, frames - 1)) * dur
  poseWatch(g, clip, t, { target, yaw: kind === 'watcher' ? 0.5 : 0, pitch: kind === 'watcher' ? -0.15 : 0 })
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
  renderer.render(scene, cam)
  ctx.drawImage(renderer.domElement, (i % cols) * CW, 30 + Math.floor(i / cols) * CH)
  ctx.fillStyle = '#ddd6c2'; ctx.font = '13px sans-serif'; ctx.fillText(`t=${t.toFixed(2)}s`, (i % cols) * CW + 8, 30 + Math.floor(i / cols) * CH + 18)
  urls.push(renderer.domElement.toDataURL('image/png'))
}
const b = watchBudget(g)
ctx.fillStyle = '#f3eedf'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(`${kind} · ${clip}（${info.loop ? '循环' : '单次'} ${info.len}s）· ${b.tris} 面 / ${b.bones} 骨${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}`, 10, 20)
const w = window as unknown as Record<string, unknown>
w.__frames = urls; w.__budget = b; w.__ready = true
