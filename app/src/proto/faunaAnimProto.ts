// 受眷鸟 · 微光向导 第 2 阶段动画预览（由 faunaProto.ts 在 URL 带 anim= 时加载）
//   ?anim=<片段>&ent=bird|guide&t=<秒>                 单帧（整窗渲染）
//   ?anim=<片段>&ent=bird|guide&frames=N[&dur=秒]       N 帧网格（截图验收），每帧 dataURL 放进 window.__frames（拼 GIF）
//   其它：sex=female|male（鸟，spore_release 默认雄性）；cw/ch/cols 单格尺寸与列数；
//         wrap=1：总图用——按真实时间轴采样，单次片段播完后停 hold 秒再重播；from/to：向导 color_shift / warn 的情绪色
import * as THREE from 'three'
import { buildCurabiturMesh, buildCurabiturSpore } from '../game/renderer/curabiturMesh'
import { CURABITUR_CLIPS, animCurabitur, sampleCurabiturSpores, type CurabiturClip } from '../game/renderer/curabiturAnim'
import { buildLightguideMesh, type LightguideMood } from '../game/renderer/lightguideMesh'
import { LIGHTGUIDE_CLIPS, animLightguide, type LightguideClip, type LightguideAnimOpts } from '../game/renderer/lightguideAnim'

const Q = new URLSearchParams(location.search)
const clip = Q.get('anim') ?? 'float_idle'
const ent = (Q.get('ent') ?? (clip in LIGHTGUIDE_CLIPS && !(clip in CURABITUR_CLIPS.male) ? 'guide' : 'bird')) as 'bird' | 'guide'
const sex = (Q.get('sex') ?? (clip === 'spore_release' ? 'male' : 'female')) as 'female' | 'male'
const info = ent === 'bird' ? (CURABITUR_CLIPS[sex][clip as CurabiturClip] ?? CURABITUR_CLIPS[sex].float_idle!) : LIGHTGUIDE_CLIPS[clip as LightguideClip]
const single = Q.has('t') && !Q.has('frames')
const frames = single ? 1 : +(Q.get('frames') ?? 8), dur = +(Q.get('dur') ?? info.len)
const wrap = Q.get('wrap') === '1', hold = +(Q.get('hold') ?? 0.6)
const CW = single ? innerWidth : +(Q.get('cw') ?? 380), CH = single ? innerHeight : +(Q.get('ch') ?? 340)
const cols = Math.min(frames, +(Q.get('cols') ?? 4)), rows = Math.ceil(frames / cols), HEAD = single ? 0 : 28

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(CW, CH); renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const plane = (w: number, h: number, col: string) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ color: col }))
const floor = plane(30, 30, '#4a4640'); floor.rotation.x = -Math.PI / 2; scene.add(floor)
const cam = new THREE.PerspectiveCamera(32, CW / CH, 0.02, 80)
const frame = (C: THREE.Vector3, dir: THREE.Vector3, dist: number) => { cam.position.copy(C).addScaledVector(dir.normalize(), dist); cam.lookAt(C) }

const dirQ = Q.get('dir') ? new THREE.Vector3(...(Q.get('dir')!.split(',').map(Number) as [number, number, number])) : null
let step: (t: number) => void
if (ent === 'bird') {
  // 洞穴里的弱光：主光从侧后方来，镜头一侧是背光面（检查背光自发光补偿）
  scene.background = new THREE.Color('#10131a')
  scene.add(new THREE.HemisphereLight('#9aa4c0', '#14120f', 0.55))
  const key = new THREE.DirectionalLight('#dfe6ff', 0.8); key.position.set(2, 3.5, -1.5); scene.add(key)
  const wall = plane(14, 5, '#5c574e'); wall.position.set(0, 2.5, -1.6); scene.add(wall)
  const g = buildCurabiturMesh(sex, 0, { lights: true }); g.position.set(0, 1.05, 0); scene.add(g)
  const F: Record<string, [THREE.Vector3, number]> = {
    float_idle: [V(0.03, 0.12, 0), 2.5], drift: [V(0, 0.1, 0), 3.2], lure: [V(0.06, -0.02, 0), 2.7], strike: [V(0.14, 0.06, 0), 2.7], eat: [V(0.1, 0.0, 0), 1.7],
    spore_release: [V(0, 0.12, 0), 2.2], flee: [V(-0.15, 0.95, 0), 5.0], hit: [V(0, 0.12, 0), 2.5], death: [V(0.04, -0.28, 0), 3.5],
  }
  const [C, dist] = F[clip] ?? F.float_idle
  frame(C.add(g.position), dirQ ?? V(0.5, 0.1, 1), dist * (+(Q.get('zoom') ?? 1)))
  // eat：喙边叼着一只死亡飞蛾替身（深褐身体 + 两片残翅），只为看清咀嚼
  if (clip === 'eat') {
    const r = g.userData.curabiturRig, prey = new THREE.Group(), pm = new THREE.MeshLambertMaterial({ color: '#4a3a2c', side: THREE.DoubleSide })
    prey.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8).scale(1.8, 0.8, 0.8), pm))
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.05).translate(0, 0.025, 0), pm); w.rotation.set(s * 1.1, 0, 0.4); w.position.z = s * 0.01; prey.add(w) }
    prey.position.set(0.125, -0.2, 0.0); prey.rotation.set(0.5, 0, -1.2); prey.scale.setScalar(1.3); r.head.add(prey)
  }
  // 孢子小精灵：spore_release 时按轨迹函数摆放
  const spores: THREE.Group[] = []
  if (clip === 'spore_release' && sex === 'male') sampleCurabiturSpores(g, 0).forEach(() => { const s = buildCurabiturSpore(0); g.add(s); spores.push(s) })
  step = (t) => {
    animCurabitur(g, clip as CurabiturClip, t)
    if (spores.length) sampleCurabiturSpores(g, t).forEach((p, i) => {
      const s = spores[i]; s.visible = p.state > 0; s.position.copy(p.pos)
      s.scale.setScalar(p.state === 1 ? 0.6 + 0.4 * p.glow : 0.8 + 0.25 * p.glow)
    })
  }
} else {
  scene.background = new THREE.Color('#07090f')
  scene.add(new THREE.HemisphereLight('#c8d0e8', '#1a1814', 0.07))
  const wall = plane(16, 6, '#4e4a44'); wall.position.set(0, 3, clip === 'flee' ? -7 : -1.2); scene.add(wall)
  const o: LightguideAnimOpts = { from: (Q.get('from') ?? undefined) as LightguideMood | undefined, to: (Q.get('to') ?? undefined) as LightguideMood | undefined }
  if (clip === 'color_shift') { o.from ??= 'idle'; o.to ??= 'guide' }
  const guides: { g: THREE.Group; o: LightguideAnimOpts }[] = []
  if (clip === 'nest_orbit') {
    // 氙弹珠巢：地上一小堆发淡金光的弹珠，三只向导绕着它转
    const R = (() => { let s = 3; return () => (s = (s * 16807) % 2147483647) / 2147483647 })()
    const mm = new THREE.MeshPhongMaterial({ color: '#d8d0b0', emissive: '#6a5a20', specular: '#ffffff', shininess: 120 })
    for (let i = 0; i < 22; i++) { const a = R() * 6.28, d = R() * 0.1, m = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), mm); m.position.set(Math.cos(a) * d, 0.016 + (i > 14 ? 0.025 : 0), Math.sin(a) * d); scene.add(m) }
    for (let i = 0; i < 3; i++) { const g = buildLightguideMesh(0.07 + i * 0.015, 'nest', { lights: i === 0 }); g.position.set(0, 0.2, 0); scene.add(g); guides.push({ g, o: { ...o, index: i, count: 3, radius: 0.3 + i * 0.04, phase: i * 0.7 } }) }
    frame(V(0, 0.12, 0), V(0.3, 1.1, 1), 1.8)
  } else {
    const mood: LightguideMood = clip === 'beckon' ? 'guide' : clip === 'warn' ? (o.from ?? 'guide') : clip === 'flee' ? 'warn' : clip === 'color_shift' ? o.from! : clip === 'phase' ? 'guide' : 'idle'
    const g = buildLightguideMesh(0.1, mood, { lights: true }); g.position.set(0, 1.1, 0); scene.add(g); guides.push({ g, o })
    if (clip === 'phase') { const w = plane(1.4, 2.2, '#6a645a'); (w.material as THREE.MeshLambertMaterial).side = THREE.DoubleSide; w.rotation.y = Math.PI / 2; w.position.set(0.25, 1.1, 0); scene.add(w) }
    const F: Record<string, [THREE.Vector3, THREE.Vector3, number]> = {
      wander: [V(0, 0, 0), V(0.15, 0.12, 1), 1.4], beckon: [V(0.4, 0.03, 0), V(0.1, 0.3, 1), 2.6], warn: [V(0, 0, 0), V(0.15, 0.12, 1), 1.0],
      color_shift: [V(0, 0, 0), V(0.15, 0.12, 1), 1.0], flee: [V(0.3, 0.12, -0.6), V(-0.2, 0.12, 1), 1.7], phase: [V(0.25, 0, 0), V(-0.4, 0.15, 1), 1.6],
    }
    const [C, d, dist] = F[clip] ?? F.wander
    frame(C.add(g.position), dirQ ?? d, dist * (+(Q.get('zoom') ?? 1)))
  }
  step = (t) => { for (const { g, o: go } of guides) animLightguide(g, clip as LightguideClip, t, go) }
}

const out = document.createElement('canvas'); out.width = cols * CW; out.height = rows * CH + HEAD
const ctx = out.getContext('2d')!; ctx.fillStyle = '#111'; ctx.fillRect(0, 0, out.width, out.height)
document.body.appendChild(out); out.style.display = 'block'
const urls: string[] = [], times: number[] = []
for (let i = 0; i < frames; i++) {
  let t: number
  if (single) t = +(Q.get('t') ?? 0)
  else if (wrap) { const tl = (i / frames) * dur; t = info.loop ? tl : Math.min(info.len, tl % (info.len + hold)) }
  else t = info.loop ? (i / frames) * dur : (i / Math.max(1, frames - 1)) * dur
  step(t)
  renderer.render(scene, cam)
  ctx.drawImage(renderer.domElement, (i % cols) * CW, HEAD + Math.floor(i / cols) * CH)
  if (!single) { ctx.fillStyle = '#ddd6c2'; ctx.font = '13px sans-serif'; ctx.fillText(`t=${t.toFixed(2)}s`, (i % cols) * CW + 8, HEAD + Math.floor(i / cols) * CH + 18) }
  urls.push(renderer.domElement.toDataURL('image/png')); times.push(t)
}
if (!single) { ctx.fillStyle = '#f3eedf'; ctx.font = 'bold 15px sans-serif'; ctx.fillText(`${ent}${ent === 'bird' ? ' ' + sex : ''} / ${clip} (${info.loop ? 'loop' : 'once'} ${info.len}s)`, 10, 19) }
const w = window as unknown as Record<string, unknown>
w.__frames = urls; w.__times = times; w.__info = { ent, sex, clip, len: info.len, loop: info.loop }; w.__ready = true
