// 原型预览页：无面灵 Entity 9 动作（?clip=wave|...|walk &who=adult,child &l3=1 &frames=16 &cols=4 &view=front|side|top）
// 同一时间轴按 30fps 连续推进 HumanoidMotion（步态有状态），在采样时刻把姿势 CPU 烘焙成静态网格，逐格渲染。
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { humanoidMotion } from '../game/renderer/humanoidMotion'
import { retroModelReady } from '../game/renderer/retroAvatar'
import { FACELING_CLIPS, type FacelingGesture } from '../game/renderer/facelingAnim'
import type { RetroNpc } from '../game/renderer/retroNpc'
import type { FacelingAge } from '../game/entities/facelingTraits'
const q = new URLSearchParams(location.search)
const clip = (q.get('clip') ?? 'wave') as FacelingGesture | 'walk' | 'idle'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#57513a')
const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#6e6340' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), new THREE.MeshLambertMaterial({ color: '#b3a564' })); wl.position.set(0, 4, -3); scene.add(wl)
scene.add(new THREE.HemisphereLight('#fff6dc', '#3a3628', 1.25)); const sun = new THREE.DirectionalLight('#fff4dc', 1.1); sun.position.set(2.5, 5, 6); scene.add(sun)
const lab = document.getElementById('lab')!
const meta = clip === 'walk' || clip === 'idle' ? { dur: clip === 'walk' ? 1.6 : 3, loop: true, zh: clip === 'walk' ? '步态' : '待机', child: false } : FACELING_CLIPS[clip]
const who = (q.get('who') ?? (meta.child ? 'child' : 'adult')).split(',') as FacelingAge[]
const work = q.get('work') as 'office' | 'shopkeeper' | null

function bake(npc: RetroNpc, root: THREE.Object3D): THREE.Object3D {
  const m = npc.mesh
  root.updateMatrixWorld(true); m.skeleton.update()
  const src = m.geometry, pos = src.getAttribute('position')
  const out = new Float32Array(pos.count * 3), v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); out.set([v.x, v.y, v.z], i * 3) }
  const g = new THREE.BufferGeometry()
  for (const k of ['uv', 'color']) g.setAttribute(k, src.getAttribute(k))
  g.setAttribute('position', new THREE.BufferAttribute(out, 3)); g.computeVertexNormals()
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex ?? 0)
  const holder = new THREE.Group()
  const s = new THREE.Mesh(g, m.material); s.matrixAutoUpdate = false; s.matrix.copy(m.matrixWorld); holder.add(s)
  m.traverse((o) => { const mm = o as THREE.Mesh; if (!mm.isMesh || o === m) return; const c = new THREE.Mesh(mm.geometry, mm.material); c.matrixAutoUpdate = false; c.matrix.copy(mm.matrixWorld); holder.add(c) })
  return holder
}

const frames = Number(q.get('frames') ?? 16), cols = Number(q.get('cols') ?? 4), rows = Math.ceil(frames / cols)
const tw = Math.floor(W / cols), th = Math.floor((H - 30) / rows)
const SP = 0.9
const actors = who.map((age, i) => {
  const g = buildEntityMesh('faceling', { seed: Number(q.get('seed') ?? 3) + i * 17, l3face: q.get('l3') === '1', facelingAge: age, facelingRole: work ?? undefined } as any)
  let av: THREE.Object3D | undefined; g.traverse((o) => { if (!av && o.userData.retro) av = o })
  return { g, age, npc: av!.userData.retro as RetroNpc, x0: (i - (who.length - 1) / 2) * SP }
})
const facing = Number(q.get('facing') ?? Math.PI / 2)
const samples: THREE.Object3D[][] = []
const dt = 1 / 30, dur = meta.dur
const times = Array.from({ length: frames }, (_, i) => meta.loop ? (i / frames) * dur : (i / (frames - 1)) * dur)
const lead = 1 // 先跑 1 秒让步态 / 站姿稳定
const speed = clip === 'walk' ? 1.1 : 0
for (const a of actors) {
  const hm = humanoidMotion(a.g)!
  const sp = speed * (a.age === 'elder' ? 0.6 : a.age === 'child' ? 0.85 : 1)
  const list: THREE.Object3D[] = []
  let k = 0
  for (let T = -lead; k < frames; T += dt) {
    const tt = Math.max(0, T), mx = sp * (T + lead)
    a.g.rotation.y = -facing; a.g.position.set(a.x0 + Math.cos(facing) * mx, 0, Math.sin(facing) * mx)
    a.g.userData.retroUpdate?.(tt + 3)
    hm.update({ time: T + lead, x: a.g.position.x, y: a.g.position.z, z: 0, facing, manner: 'faceling', age: a.age, work: work ?? undefined,
      gesture: clip === 'walk' || clip === 'idle' ? undefined : clip, gestureT: tt, gestureW: 1 })
    if (T >= times[k] - 1e-6) {
      const b = bake(a.npc, a.g)
      // 走路片段：把位移减掉，原地显示
      if (speed) b.position.set(-Math.cos(facing) * mx, 0, -Math.sin(facing) * mx)
      list.push(b); k++
    }
  }
  samples.push(list)
}
// 抱腿：在幼体正前方立一条「玩家的腿」作参照
if (clip === 'hug-leg') { const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.8, 4, 10), new THREE.MeshLambertMaterial({ color: '#2f3a4a' })); leg.position.set(actors[0].x0, 0.47, 0.27); scene.add(leg) }
const view = q.get('view') ?? (clip === 'tantrum' ? 'top' : 'front')
const tcam = new THREE.PerspectiveCamera(30, tw / th, 0.02, 60)
const span = (who.length - 1) * SP
const kid = actors.every((a) => a.age === 'child') ? 0.62 : 1
const ty = actors.every((a) => a.age === 'child') ? 0.55 : 0.95
if (view === 'side') { tcam.position.set((3.4 + span) * kid, ty + 0.3 * kid, 1.2 * kid); tcam.lookAt(0, ty, 0) }
else if (view === 'top') { tcam.position.set(1.2, 1.7, 1.8); tcam.lookAt(0, 0.15, 0.1) }
else if (view === 'q') { tcam.position.set(2.2 + span * 0.6, ty + 0.4, 3.0 + span); tcam.lookAt(0, ty, 0) }
else { tcam.position.set(0.9 * kid, ty + 0.25 * kid, (3.6 + span * 1.1) * kid); tcam.lookAt(0, ty, 0) }
renderer.setScissorTest(true); renderer.autoClear = false
lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:4px"><span class="s">${meta.zh}（${clip}）· ${who.join('/')}${q.get('l3') === '1' ? ' · 进化种' : ''} · ${dur}s · ${frames} 帧</span></div>`)
const draw = () => {
  renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.setClearColor('#111'); renderer.clear()
  for (let i = 0; i < frames; i++) {
    const shown = samples.map((l) => l[i]); for (const o of shown) scene.add(o)
    const c = i % cols, r = Math.floor(i / cols), x = c * tw, y = H - 30 - (r + 1) * th
    renderer.setViewport(x, y, tw, th); renderer.setScissor(x, y, tw, th); renderer.render(scene, tcam)
    for (const o of shown) scene.remove(o)
  }
}
const t1 = performance.now()
const loop = () => { draw(); const ok = actors.every((a) => retroModelReady(a.g)); if (!ok || performance.now() - t1 < 2000) requestAnimationFrame(loop); else (window as any).__ready = true }
loop()
