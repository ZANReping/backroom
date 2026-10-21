// 第 2 阶段动画预览：?anim=1&kind=<male|female|juvenile>&clip=<片段>&frames=N&dur=秒&view=<side|front|three|top>&real=1
// 页面把 N 帧画成网格（截图用），并把每帧的 dataURL 放进 window.__frames（拼 GIF 用）。
import * as THREE from 'three'
import { buildWranglerMesh, buildBurrowHole, wranglerBudget, WRANGLER_DIM, type WranglerKind, type WranglerRig } from '../game/renderer/wranglerMesh'
import { poseWrangler, buildRockBulge, WRANGLER_CLIPS, type WranglerClip } from '../game/renderer/wranglerAnim'
import { setMaterialMode } from '../game/renderer/shared'

const Q = new URLSearchParams(location.search)
const kind = (Q.get('kind') ?? 'male') as WranglerKind
const clips = WRANGLER_CLIPS[kind]
const clip = (Q.get('clip') ?? Object.keys(clips)[0]) as WranglerClip
const info = clips[clip]!
const frames = +(Q.get('frames') ?? 8), dur = +(Q.get('dur') ?? info.len), view = Q.get('view') ?? 'three', real = Q.get('real') === '1'
if (real) setMaterialMode('realistic')
const CW = +(Q.get('cw') ?? 420), CH = +(Q.get('ch') ?? 360)
const cols = Math.min(frames, +(Q.get('cols') ?? 4)), rows = Math.ceil(frames / cols)
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(CW, CH); renderer.outputColorSpace = THREE.SRGBColorSpace
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15 }
const scene = new THREE.Scene(); scene.background = new THREE.Color('#262624')
scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 1.0)); const sun = new THREE.DirectionalLight('#fff6e8', 2.0); sun.position.set(4, 8, 6); scene.add(sun)
const rim = new THREE.DirectionalLight('#cfe0ff', 1.0); rim.position.set(-6, 4, -6); scene.add(rim)
const R = WRANGLER_DIM[kind].r, big = kind !== 'juvenile'
const fl = new THREE.Mesh(new THREE.PlaneGeometry(big ? 120 : 20, big ? 120 : 20), new THREE.MeshLambertMaterial({ color: '#4e4a44' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const grid = new THREE.GridHelper(big ? 120 : 20, big ? 60 : 40, '#5a5854', '#55524d'); grid.position.y = 0.003; scene.add(grid)
const g = buildWranglerMesh(kind, { pregnant: kind === 'female' && Q.get('pregnant') === '1' }); scene.add(g)
const rig = g.userData.wranglerRig as WranglerRig
// 道具
const wallClips = ['emerge', 'retreat']
let wall: THREE.Mesh | null = null, bulge: THREE.Mesh | null = null, hole: THREE.Group | null = null
if (wallClips.includes(clip)) {
  wall = new THREE.Mesh(new THREE.BoxGeometry(1, 30, 40), new THREE.MeshLambertMaterial({ color: '#5a5248' })); wall.position.set(-2.5, 15, 0); scene.add(wall)
  bulge = buildRockBulge(R); bulge.rotation.y = Math.PI / 2; bulge.position.set(-2, R * 3.4, 0); scene.add(bulge)
  hole = buildBurrowHole(R * 1.15, 3); hole.rotation.y = Math.PI / 2; hole.position.set(-1.98, R * 3.4, 0); scene.add(hole)
}
if (clip === 'graze') {
  const rock = new THREE.Mesh(new THREE.BoxGeometry(1.6, 8, 5), new THREE.MeshLambertMaterial({ color: '#5a5248' })); rock.position.set(3.35, 4, -1.2); scene.add(rock)
}
if (clip === 'drill') { hole = buildBurrowHole(R * 1.2, 5); hole.rotation.x = -Math.PI / 2; hole.position.set(0, 0.01, 0); scene.add(hole) }
let target: THREE.Vector3 | undefined
if (clip === 'strike' || clip === 'hypno') {
  target = new THREE.Vector3(R * 6.5, 1.2, 0)
  const m = new THREE.MeshLambertMaterial({ color: '#8c8a84' }), h = new THREE.Group()
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), m); torso.position.y = 1.23; h.add(torso)
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), m); hd.position.y = 1.64; h.add(hd)
  for (const s of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.78, 4, 8), m); leg.position.set(0, 0.45, s * 0.09); h.add(leg) }
  h.position.set(R * 7.2, 0, 0); scene.add(h)
}
// 镜头
const C = kind === 'juvenile' ? new THREE.Vector3(-0.8, 0.4, 0) : clip === 'emerge' || clip === 'retreat' ? new THREE.Vector3(R * 1.5, R * 2.6, 0) : clip === 'drill' ? new THREE.Vector3(-4, 1, 0) : clip === 'slither' ? new THREE.Vector3(-3, 0.5, 0) : clip === 'coil' ? new THREE.Vector3(-R * 2.5, R * 1.6, -R * 2.5) : new THREE.Vector3(0, R * 2.4, 0)
const S = kind === 'juvenile' ? 2.4 : clip === 'slither' || clip === 'drill' ? 13 : clip === 'coil' ? 8.5 : 6.5
const cam = new THREE.PerspectiveCamera(36, CW / CH, 0.05, 600)
const dirs: Record<string, [number, number, number]> = { side: [0.05, 0.25, 1], front: [1, 0.25, 0.1], three: [0.7, 0.5, 0.9], top: [0.05, 1, 0.2], back: [-0.8, 0.4, 0.6] }
const d = new THREE.Vector3(...(dirs[view] ?? dirs.three)).normalize()
cam.position.copy(C).addScaledVector(d, S * 2.2); cam.lookAt(C)
const out = document.createElement('canvas'); out.width = cols * CW; out.height = rows * CH + 30
const ctx = out.getContext('2d')!; ctx.fillStyle = '#111'; ctx.fillRect(0, 0, out.width, out.height)
document.body.appendChild(out); out.style.display = 'block'
const urls: string[] = []
for (let i = 0; i < frames; i++) {
  const t = info.loop ? (i / frames) * dur : (i / Math.max(1, frames - 1)) * dur
  const r = poseWrangler(rig, clip, t, { target })
  if (bulge) { bulge.userData.setBulge(r.rock); bulge.visible = (r.hole?.open ?? 0) < 0.5 }
  if (hole) hole.visible = (r.hole?.open ?? 1) > 0.5
  renderer.render(scene, cam)
  ctx.drawImage(renderer.domElement, (i % cols) * CW, 30 + Math.floor(i / cols) * CH)
  ctx.fillStyle = '#ddd6c2'; ctx.font = '13px sans-serif'; ctx.fillText(`t=${t.toFixed(2)}s`, (i % cols) * CW + 8, 30 + Math.floor(i / cols) * CH + 18)
  urls.push(renderer.domElement.toDataURL('image/png'))
}
const NAME: Record<string, string> = { male: '雄性', female: '雌性', juvenile: '幼体', slither: '爬行', coil: '栖息', drill: '钻地', emerge: '切出', hypno: '催眠', strike: '吞咽', graze: '啃岩', retreat: '后撤', hop: '蹦跳' }
const b = wranglerBudget(g)
ctx.fillStyle = '#f3eedf'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(`牧蛇${NAME[kind]} · ${NAME[clip]}（${info.loop ? '循环' : '单次'} ${info.len}s）· ${b.tris} 面`, 10, 20)
const w = window as unknown as Record<string, unknown>
w.__frames = urls; w.__budget = b; w.__ready = true
