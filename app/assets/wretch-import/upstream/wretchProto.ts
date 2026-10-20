// 原型预览页：悲尸重制（?mode=lineup | face | poses | mutants | old）
//  lineup：四种变体并排（蹒跚 / 疾行 / 有智 / 突变）+ 同一路人的生前样子
//  face：脸部特写（正面 / 3/4 / 颅顶溶穿）
//  poses：蹒跚拖步 · 待机抓挠 · 撞门 · 扑抓 · 疾行四肢跃步 · 有智型抡铁管
//  mutants：突变个体的几种组合
//  old：旧版方块模型（对比用；在旧代码树里运行）
// 复古人体在 SwiftShader 下 CPU 烘焙蒙皮（&live=1 走 GPU）
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { animateWretch, wretchSpec } from '../game/renderer/wretchMesh'
import { buildAvatarModel, retroModelReady } from '../game/renderer/retroAvatar'
import type { RetroNpc } from '../game/renderer/retroNpc'
import { randomAvatar } from '../game/core/avatar'
import { wretchKind, wretchLook, WRETCH_KIND_NAME, type WretchKind } from '../game/engine/wretchAI'
const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'lineup'
const live = q.get('live') === '1'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#3c3a34'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 10, 34)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#4a463c' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshLambertMaterial({ color: '#5c5a50' })); wl.position.set(0, 3, -2.5); scene.add(wl)
scene.add(new THREE.HemisphereLight('#fff2dc', '#2a2620', 1.2)); const sun = new THREE.DirectionalLight('#fff4e0', 1.2); sun.position.set(3, 6, 5); scene.add(sun)
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 34), W / H, 0.05, 60)
const lab = document.getElementById('lab')!
const label = (x: number, html: string, y = H - 70) => { const p = new THREE.Vector3(x, 0, 0).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${y}px">${html}</div>`) }
const mul = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

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
  const inv = root.matrixWorld.clone().invert()
  const s = new THREE.Mesh(g, m.material); s.matrixAutoUpdate = false; s.matrix.copy(inv.clone().multiply(m.matrixWorld)); holder.add(s)
  m.traverse((o) => { const mm = o as THREE.Mesh; if (!mm.isMesh || o === m) return; const c = new THREE.Mesh(mm.geometry, mm.material); c.matrixAutoUpdate = false; c.matrix.copy(inv.clone().multiply(mm.matrixWorld)); holder.add(c) })
  return holder
}
/** 找出某种变体的 id（变体由 id 决定） */
function idOf(kind: WretchKind, skip = 0, pred?: (id: number) => boolean) { let n = 0; for (let id = 1; id < 20000; id++) if (wretchKind(id) === kind && (!pred || pred(id)) && n++ === skip) return id; return 1 }
/** 一只悲尸：按状态跑若干帧后定格；返回场景里的对象 */
function wretch(id: number, x: number, z: number, ry: number, o: { state?: string; v?: number; animT?: number; lunge?: number; t?: number; scratch?: number; bash?: boolean } = {}) {
  const g = buildEntityMesh('wretch', { seed: id })
  g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g)
  const animT = o.animT ?? 0.4, v = o.v ?? 0, t0 = o.t ?? 2.2
  const e: any = { id, state: o.state ?? 'wander', animT, lungeT: 0, wr: { scratchT: o.scratch ?? 0, bashS: o.bash ? {} : undefined } }
  for (let i = 0; i < 60; i++) { e.animT = animT - (60 - i) * v / 30; animateWretch(g, e, t0 - (60 - i) / 30, 0) }
  e.animT = animT; e.lungeT = o.lunge ?? 0; animateWretch(g, e, t0, 0)
  const npc = g.userData.retro as RetroNpc
  let calls = 0, tris = 0; g.traverse((m: any) => { if (m.isMesh) { calls += m.geometry.groups?.length || 1; const gi = m.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3 } })
  if (!live) { scene.remove(g); const b = bake(npc, g); b.position.set(x, 0, z); b.rotation.y = ry; scene.add(b) }
  return { calls, tris, diag: npc.diagnostics }
}
function human(id: number, x: number, z: number, ry: number) {
  const av = randomAvatar(mul((id * 2654435761) >>> 0))
  const pm = buildAvatarModel(av, { seed: id % 100000 })
  ;(pm.userData.retroUpdate as (t: number) => void)(3.1)
  const obj = live ? pm : bake(pm.userData.retro as RetroNpc, pm)
  obj.position.set(x, 0, z); obj.rotation.y = ry; scene.add(obj)
}
async function settled() { for (let i = 0; i < 200; i++) { if (retroModelReady(scene)) return; await new Promise((r) => setTimeout(r, 100)) } }

async function main() {
  const diag: any = {}
  if (mode === 'face') {
    cam.position.set(0, 1.62, 2.3); cam.lookAt(0, 1.55, 0)
    const a = idOf('shambler', 0, (id) => !wretchLook(id).brain), b = idOf('shambler', 1, (id) => wretchLook(id).brain), c = idOf('mutant', 0, (id) => !!wretchLook(id).mutant?.eyes)
    wretch(a, -0.75, 0, -Math.PI / 2, { t: 0.4 })
    wretch(b, 0, 0, -Math.PI / 2 + 0.7, { t: 0.4 })
    wretch(c, 0.75, 0, -Math.PI / 2 - 0.35, { t: 0.4 })
    await settled()
    label(-0.75, '正面<br><span class="s">唇睑溶解 · 裂到脸颊的长牙 · 外露眼球</span>', H - 90)
    label(0, '3/4 · 颅顶溶穿<br><span class="s">露出发黄的脑</span>', H - 90)
    label(0.75, '突变个体<br><span class="s">错位长出的眼球</span>', H - 90)
  } else if (mode === 'poses') {
    cam.position.set(0, 1.9, 15.5); cam.lookAt(0, 1.0, 0)
    const xs = [-6.2, -3.7, -1.25, 1.25, 3.7, 6.2]
    const sh = idOf('shambler', 2), sh2 = idOf('shambler', 3), sp = idOf('sprinter', 0), sm = idOf('smart', 0)
    wretch(sh, xs[0], 0, -Math.PI / 2 + 0.5, { state: 'chase', v: 1.6, animT: 0.9 })
    wretch(sh2, xs[1], 0, -Math.PI / 2 + 0.35, { state: 'wander', scratch: 2 })
    wretch(sh, xs[2], 0, -Math.PI / 2 - 0.8, { state: 'attack', bash: true, t: 2.31 })
    wretch(sh2, xs[3], 0, -Math.PI / 2 + 0.55, { state: 'chase', lunge: 0.12, v: 0.3 })
    const r = wretch(sp, xs[4], 0, -Math.PI / 2 + 1.0, { state: 'chase', v: 4.6, animT: 1.05 })
    wretch(sm, xs[5], 0, -Math.PI / 2 + 0.6, { state: 'chase', lunge: 0.42, v: 0.3 })
    await settled()
    const names = ['蹒跚拖步<br><span class="s">一条腿拖着、头歪向一侧</span>', '待机 · 抓挠自己', '撞门<br><span class="s">肩撞 + 双拳捶打</span>', '扑抓', '疾行型<br><span class="s">四肢着地的跃步</span>', '有智型<br><span class="s">抡起锈铁管</span>']
    names.forEach((n, i) => label(xs[i], n))
    diag.sprinter = r
  } else if (mode === 'mutants') {
    cam.position.set(0, 1.7, 9.5); cam.lookAt(0, 1.15, 0)
    const xs = [-3.3, -1.1, 1.1, 3.3]
    for (let i = 0; i < 4; i++) { const id = idOf('mutant', i); const L = wretchLook(id).mutant!; wretch(id, xs[i], 0, -Math.PI / 2 + (i % 2 ? -0.8 : 0.8), { t: 1 + i }); label(xs[i], `突变 #${i + 1}<br><span class="s">${[L.eyes ? `多眼×${L.eyes}` : '', L.arm ? '第三条手臂' : '', L.wings ? '肋骨翅膀' : '', L.jaw ? '裂颌' : ''].filter(Boolean).join(' · ')}</span>`) }
    await settled()
  } else {
    cam.position.set(0, 1.75, 11.5); cam.lookAt(0, 1.05, 0)
    const xs = [-4.2, -2.1, 0, 2.1, 4.2]
    const ids = [idOf('shambler', 0), idOf('shambler', 0), idOf('sprinter', 1), idOf('smart', 1), idOf('mutant', 1)]
    human(ids[0], xs[0], 0, 0.2)
    const rs = [
      wretch(ids[1], xs[1], 0, -Math.PI / 2 + 0.35, { t: 1.3 }),
      wretch(ids[2], xs[2], 0, -Math.PI / 2 + 0.6, { t: 2.1 }),
      wretch(ids[3], xs[3], 0, -Math.PI / 2 + 0.25, { t: 0.7 }),
      wretch(ids[4], xs[4], 0, -Math.PI / 2 - 0.4, { t: 1.9 }),
    ]
    await settled()
    label(xs[0], '生前<br><span class="s">同一个路人</span>')
    ;(['shambler', 'sprinter', 'smart', 'mutant'] as WretchKind[]).forEach((k, i) => label(xs[i + 1], `${WRETCH_KIND_NAME[k]}<br><span class="s">${rs[i].diag.triangles} 三角面 · ${rs[i].calls} 次绘制</span>`))
    diag.lineup = rs.map((r) => ({ tris: r.diag.triangles, calls: r.calls, parts: r.diag.partTriangles }))
    diag.spec = wretchSpec(ids[1]).spec.wretch
  }
  ;(window as any).__diag = diag
  cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__ready = true
}
main().catch((e) => { (window as any).__err = String(e?.stack ?? e) })
