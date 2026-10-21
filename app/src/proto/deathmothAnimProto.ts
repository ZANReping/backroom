// 死亡飞蛾第 2 阶段动画预览：?anim=1&form=<male|female|guard|larva>&clip=<片段>&frames=N&dur=秒&view=<side|front|three|top>&real=1&cpu=1
// 页面把 N 帧画成网格（截图用），并把每帧的 dataURL 放进 window.__frames（拼 GIF 用）。
import * as THREE from 'three'
import { buildDeathmothMesh, mothBudget } from '../game/renderer/deathmothMesh'
import { MOTH_CLIPS, poseMoth, type MothClip } from '../game/renderer/deathmothAnim'
import { setMaterialMode } from '../game/renderer/shared'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import type { MothForm } from '../game/entities/types'

const Q = new URLSearchParams(location.search)
const form = (Q.get('form') ?? 'guard') as MothForm
const clip = (Q.get('clip') ?? Object.keys(MOTH_CLIPS[form])[0]) as MothClip
const info = MOTH_CLIPS[form][clip]
const frames = +(Q.get('frames') ?? 8), dur = +(Q.get('dur') ?? info.len), view = Q.get('view') ?? 'three', real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const CW = +(Q.get('cw') ?? 420), CH = +(Q.get('ch') ?? 360)
const cols = Math.min(frames, +(Q.get('cols') ?? 4)), rows = Math.ceil(frames / cols)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(CW, CH); renderer.outputColorSpace = THREE.SRGBColorSpace
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15 }
const scene = new THREE.Scene(); scene.background = new THREE.Color('#222220')
scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 0.9)); const sun = new THREE.DirectionalLight('#fff6e8', 1.7); sun.position.set(2, 4, 3); scene.add(sun)
const fill = new THREE.DirectionalLight('#cfd8ff', 0.45); fill.position.set(-3, 1, -2); scene.add(fill)
const ground = form === 'guard' || form === 'larva' || clip === 'feed'
if (ground) { const fl = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshLambertMaterial({ color: '#4a4844' })); fl.rotation.x = -Math.PI / 2; fl.position.y = clip === 'feed' ? -0.045 : 0; scene.add(fl); const grid = new THREE.GridHelper(6, 60, '#5a5854', '#55524d'); grid.position.y = fl.position.y + 0.001; scene.add(grid) }
const g = buildDeathmothMesh(form); scene.add(g)
const S = form === 'guard' ? 0.72 : form === 'larva' ? 0.14 : form === 'female' ? 0.42 : 0.34
const C = form === 'guard' ? new THREE.Vector3(0.05, 0.45, 0) : form === 'larva' ? new THREE.Vector3(0, 0.03, 0) : new THREE.Vector3(-0.01, 0, 0)
const cam = new THREE.PerspectiveCamera(32, CW / CH, 0.005, 50)
const dirs: Record<string, [number, number, number]> = { side: [0.05, 0.12, 1], front: [1, 0.25, 0.08], three: [0.75, 0.45, 0.85], top: [0.001, 1, 0.0001], back: [-0.8, 0.4, 0.6] }
const d = new THREE.Vector3(...(dirs[view] ?? dirs.three)).normalize()
cam.position.copy(C).addScaledVector(d, S * 3.4); if (view === 'top') cam.up.set(1, 0, 0); cam.lookAt(C)
const out = document.createElement('canvas'); out.width = cols * CW; out.height = rows * CH + 30
const ctx = out.getContext('2d')!; ctx.fillStyle = '#111'; ctx.fillRect(0, 0, out.width, out.height)
document.body.appendChild(out); out.style.display = 'block'
const urls: string[] = []
for (let i = 0; i < frames; i++) {
  const t = info.loop ? (i / frames) * dur : (i / Math.max(1, frames - 1)) * dur
  poseMoth(g, clip, t, { speed: form === 'guard' ? (clip === 'run' ? 3 : 1.2) : 1.5 })
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
  renderer.render(scene, cam)
  ctx.drawImage(renderer.domElement, (i % cols) * CW, 30 + Math.floor(i / cols) * CH)
  ctx.fillStyle = '#ddd6c2'; ctx.font = '13px sans-serif'; ctx.fillText(`t=${t.toFixed(2)}s`, (i % cols) * CW + 8, 30 + Math.floor(i / cols) * CH + 18)
  urls.push(renderer.domElement.toDataURL('image/png'))
}
const b = mothBudget(g)
ctx.fillStyle = '#f3eedf'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(`${form} · ${clip}（${info.loop ? '循环' : '单次'} ${info.len}s）· ${b.tris} 面 / ${b.bones} 骨${QA_CPU_SKIN ? ' · CPU 蒙皮' : ''}`, 10, 20)
const w = window as unknown as Record<string, unknown>
w.__frames = urls; w.__budget = b; w.__ready = true
