// 原型预览页：窃皮者重制（?mode=poses | face | door）
//  poses：伪装（人皮 · 落单接近 + 头顶气泡）/ L5 侍者人皮 / 剥皮现形 / 真身·温顺游荡 / 真身·饥饿追猎 / 扑击
//  face：真身头部正面与 3/4、人皮破绽（同一外观：普通 NPC vs 人皮）
//  door：复刻附图——黄绿色空房间，真身从黑暗门洞里探出半个身子
// 复古人皮模型在 SwiftShader 下 CPU 烘焙蒙皮（&live=1 走 GPU）
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { animateSkinStealer } from '../game/renderer/skinStealerMesh'
import { buildAvatarModel, retroModelReady } from '../game/renderer/retroAvatar'
import type { RetroNpc } from '../game/renderer/retroNpc'
import { randomAvatar } from '../game/core/avatar'
import { mulberry } from '../game/renderer/shared'
const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'poses'
const live = q.get('live') === '1'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const door = mode === 'door'
const scene = new THREE.Scene(); scene.background = new THREE.Color(door ? '#8f9268' : '#5e5530'); scene.fog = new THREE.Fog(scene.background as THREE.Color, door ? 12 : 9, 34)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: door ? '#7f7f6c' : '#6e5f36' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
if (!door) { const wl = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshLambertMaterial({ color: '#b8aa62' })); wl.position.set(0, 3, -2.5); scene.add(wl) }
scene.add(new THREE.HemisphereLight('#fff6dc', '#3a3628', 1.15)); const sun = new THREE.DirectionalLight('#fff7e0', 1.15); sun.position.set(3, 6, 5); scene.add(sun)
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 34), W / H, 0.05, 60)
const lab = document.getElementById('lab')!
const label = (x: number, html: string, y = H - 70) => { const p = new THREE.Vector3(x, 0, 0).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${y}px">${html}</div>`) }

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
  const s = new THREE.Mesh(g, m.material); s.scale.copy(npc.group.scale)
  const holder = new THREE.Group(); holder.add(s)
  const inv = root.matrixWorld.clone().invert()
  m.traverse((o) => { const mm = o as THREE.Mesh; if (!mm.isMesh || o === m) return; const c = new THREE.Mesh(mm.geometry, mm.material); c.matrixAutoUpdate = false; c.matrix.copy(inv.clone().multiply(mm.matrixWorld)); holder.add(c) })
  return holder
}
/** 人皮伪装（与 renderer.humanDisguiseMesh 相同的配置）；walk = 步态相位（手臂几乎不摆） */
function skinModel(seed: number, opts: { bellhop?: boolean; stolen?: boolean; walk?: number } = {}) {
  const av = randomAvatar(mulberry(seed >>> 0))
  if (opts.bellhop) Object.assign(av, { top: '#6e2a2e', topStyle: 3, pants: '#1c1a1e', pantsStyle: 0, shoes: 2 })
  const pm = buildAvatarModel(av, { seed: seed % 100000, stolen: opts.stolen ?? true })
  const parts = pm.userData.parts as Record<string, THREE.Object3D>
  if (opts.walk !== undefined) {
    const g = opts.walk, a = 0.45
    parts.legL.rotation.x = Math.sin(g) * a; parts.legR.rotation.x = -Math.sin(g) * a
    parts.armL.rotation.x = -Math.sin(g) * a * 0.12; parts.armR.rotation.x = Math.sin(g) * a * 0.12
  }
  ;(pm.userData.retroUpdate as (t: number) => void)(3.1)
  return pm
}
function place(model: THREE.Group, x: number, z: number, ry: number) {
  const obj = live ? model : bake(model.userData.retro as RetroNpc, model)
  obj.position.set(x, 0, z); obj.rotation.y = ry; scene.add(obj); return obj
}
function bubble(text: string, x: number, y: number, z: number) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = 'rgba(248,246,232,0.94)'; g.fillRect(4, 4, 504, 120); g.strokeStyle = 'rgba(60,52,40,0.9)'; g.lineWidth = 3; g.strokeRect(4, 4, 504, 120)
  let size = 36; g.textAlign = 'center'; g.textBaseline = 'middle'
  do { g.font = `${size}px 'Noto Serif CJK SC','SimSun',serif`; size -= 2 } while (g.measureText(text).width > 472 && size > 16)
  g.fillStyle = '#2a2620'; g.fillText(text, 256, 66)
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }))
  m.position.set(x, y, z); scene.add(m)
}
/** 真身：按相位/状态跑若干帧（建立运动量）后定格 */
function trueForm(x: number, z: number, ry: number, o: { phase: string; state: string; v?: number; animT?: number; lunge?: number; emerge?: number; seed?: number; asym?: number; t?: number }) {
  const g = buildEntityMesh('skinstealer', { seed: o.seed ?? 4 })
  if (o.asym !== undefined) g.userData.ssAsym = o.asym
  g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g)
  const animT = o.animT ?? 0.4, v = o.v ?? 0, t0 = o.t ?? 2.2
  const e: any = { id: o.seed ?? 4, state: o.state, animT, lungeT: 0, ss: { phase: o.phase, emerge: o.emerge ?? 0 } }
  for (let i = 0; i < 60; i++) { e.animT = animT - (60 - i) * v / 30; animateSkinStealer(g, e, t0 - (60 - i) / 30, 0) }
  e.animT = animT; e.lungeT = o.lunge ?? 0; animateSkinStealer(g, e, t0, 0)
  g.position.x = x; g.position.z = z
  let calls = 0, tris = 0; g.traverse((m: any) => { if (m.isMesh) { calls++; const gi = m.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3 } })
  return { g, calls, tris }
}

async function settled() { for (let i = 0; i < 200; i++) { if (retroModelReady(scene)) return; await new Promise((r) => setTimeout(r, 100)) } }

async function main() {
  if (mode === 'face') {
    cam.position.set(0, 1.75, 3.2); cam.lookAt(0, 1.72, 0)
    // 真身头部：正面 + 3/4（模型高 2.15 m，头比人高；略降低放置让头部与人皮同高）
    const a = trueForm(-1.05, 0, -Math.PI / 2, { phase: 'docile', state: 'idle', asym: 0.2, t: 0.01 })
    a.g.position.y = -0.33
    const b = trueForm(-0.35, 0, -Math.PI / 2 + 0.75, { phase: 'docile', state: 'idle', asym: 0.2, t: 0.01, seed: 9 })
    b.g.position.y = -0.33
    // 同一外观：普通 NPC vs 人皮（略高、蜡黄、眼窝深陷）
    const seed = Number(q.get('seed') ?? 911)
    place(skinModel(seed, { stolen: false }), 0.4, 0, 0.15)
    place(skinModel(seed, { stolen: true }), 1.05, 0, -0.15)
    await settled()
    label(-1.05, '真身 · 正面<br><span class="s">深陷眼窝里的纯白眼球</span>', H - 90)
    label(-0.35, '真身 · 3/4<br><span class="s">长颅 · 凹颊 · 吸盘状凸起</span>', H - 90)
    label(0.4, '普通流浪者', H - 90)
    label(1.05, '同一张脸的人皮<br><span class="s">略高 · 蜡黄 · 眼窝更深</span>', H - 90)
  } else if (door) {
    // 黄绿色空房间 + 黑色门洞；真身侧身从门里探出，一只手臂抬起（附图）
    const wallM = new THREE.MeshLambertMaterial({ color: '#b6b98a' })
    const back = new THREE.Mesh(new THREE.BoxGeometry(14, 3.2, 0.2), wallM); back.position.set(0, 1.6, -1.2); scene.add(back)
    const hole = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.35, 0.24), new THREE.MeshBasicMaterial({ color: '#0d0c09' })); hole.position.set(-0.3, 1.175, -1.18); scene.add(hole)
    const frame = new THREE.MeshLambertMaterial({ color: '#2a2418' })
    for (const sx of [-0.88, 0.28]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.3), frame); f.position.set(sx, 1.2, -1.15); scene.add(f) }
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.2, 10), wallM); side.position.set(-4.5, 1.6, 3); scene.add(side)
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(14, 0.12, 0.05), new THREE.MeshLambertMaterial({ color: '#2e3a2a' })); skirt.position.set(0, 0.06, -1.08); scene.add(skirt)
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.35, 0.05), new THREE.MeshBasicMaterial({ color: '#141210' })); vent.position.set(3.3, 0.45, -1.08); scene.add(vent)
    cam.position.set(1.4, 1.5, 5.4); cam.lookAt(-0.25, 1.2, -0.8)
    trueForm(-0.3, -0.75, -Math.PI / 2 + 0.25, { phase: 'docile', state: 'idle', asym: 0.9, t: 3.3 })
  } else {
    cam.position.set(0, 2.05, 17.5); cam.lookAt(0, 1.1, 0)
    const xs = [-6.5, -3.9, -1.3, 1.3, 3.9, 6.5]
    // ① 人皮伪装：落单时装作流浪者走近，头顶冒出借来的话
    place(skinModel(4021, { walk: 0.9 }), xs[0], 0, 0.35)
    bubble('后半夜换岗前再巡一遍。', xs[0], 2.35, 0)
    // ② L5：酒店侍者人皮
    place(skinModel(77, { bellhop: true }), xs[1], 0, 0.2)
    bubble('Bonjour ? Vous êtes là ?', xs[1], 2.35, 0)
    // ③ 剥皮现形：人皮塌落淡出，真身从里面撑开（人皮不留下）
    const peel = skinModel(4021)
    const po = place(peel, xs[2], 0, 0.3)
    po.scale.set(1.12, 0.86, 1.12)
    po.traverse((o: any) => { if (o.isMesh) { const ms = Array.isArray(o.material) ? o.material : [o.material]; o.material = ms.map((mt: THREE.Material) => { const c = mt.clone(); c.transparent = true; c.opacity = 0.4; c.depthWrite = false; return c }); if (!Array.isArray(ms)) o.material = o.material[0] } })
    trueForm(xs[2], -0.05, -Math.PI / 2 + 0.3, { phase: 'reveal', state: 'chase', emerge: 0.55 })
    // ④ 温顺：漫无目的地游荡（一只手半抬）
    trueForm(xs[3], 0, -Math.PI / 2 + 0.5, { phase: 'docile', state: 'wander', v: 0.7, asym: 0.9 })
    // ⑤ 饥饿追猎：前倾、低头、长臂摆动
    trueForm(xs[4], 0, -Math.PI / 2 + 0.55, { phase: 'hunt', state: 'chase', v: 2.6, animT: 1.1 })
    // ⑥ 扑击：双臂前探
    const s = trueForm(xs[5], 0, -Math.PI / 2 + 0.6, { phase: 'hunt', state: 'attack', v: 0.5, lunge: 0.2 })
    await settled()
    const names = ['人皮伪装<br><span class="s">落单 · 走近 · 借来的话</span>', 'Level 5 侍者人皮', '剥皮现形<br><span class="s">人皮塌落消失</span>', '真身 · 温顺游荡', '真身 · 饥饿追猎', '扑击 · 徒手撕扯']
    names.forEach((n, i) => label(xs[i], n))
    lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:14px"><span class="s">真身 ${s.calls} 次绘制 · ${Math.round(s.tris)} 三角面</span></div>`)
    ;(window as any).__diag = { calls: s.calls, tris: Math.round(s.tris) }
  }
  cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__ready = true
}
main().catch((e) => { (window as any).__err = String(e?.stack ?? e) })
