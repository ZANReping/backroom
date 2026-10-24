/* eslint-disable @typescript-eslint/no-explicit-any -- 原型页，不进生产包 */
// NPC 待机动作预览：?mode=acts1 | acts2 | life | compare
//  acts1/acts2：小动作陈列（每格取动作中段）；life：坐长椅/靠墙/闲聊/注视/挥手；compare：同一 NPC 修改前后各 4 个时刻
import * as THREE from 'three'
import { preloadRetroAvatarTextures, retroModelReady } from '../game/renderer/retroAvatar'
import { buildCharacterModel } from '../game/renderer/characterModel'
import { humanoidMotion } from '../game/renderer/humanoidMotion'
import { applyIdleUpper, type IdleFrame } from '../game/renderer/npcIdlePose'
import { applySeatedPose } from '../game/renderer/seatedPlayer'
import { IDLE_ACT_DUR, type IdleAct } from '../game/engine/npcIdle'
import { NPCS, npcAvatar } from '../game/content/npcs'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const mode = Q.get('mode') ?? 'acts1'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#c9c08e')
const fl = new THREE.Mesh(new THREE.PlaneGeometry(800, 80), new THREE.MeshLambertMaterial({ color: '#8f8460' })); fl.rotation.x = -Math.PI / 2; fl.position.x = 300; scene.add(fl)
scene.add(new THREE.HemisphereLight('#fff8e0', '#5a5038', 1.3)); const sun = new THREE.DirectionalLight('#fff6e6', 1.6); sun.position.set(2, 5, 6); scene.add(sun)
const lab = document.getElementById('lab')!
const label = (x: number, y: number, txt: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${txt}</div>`)
const cells: { cam: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }[] = []
const models: THREE.Object3D[] = []
const IDS = Object.keys(NPCS).filter(id => !NPCS[id].workLoop)
const FACE = -Math.PI / 2

interface Spec { id: string; x: number; z?: number; rot?: number; idle?: Partial<IdleFrame> | null; act?: IdleAct; at?: number; seat?: number; lean?: boolean; look?: THREE.Vector3; time?: number; label?: string }
function place(s: Spec) {
  const def = NPCS[s.id]
  const pm = buildCharacterModel(npcAvatar(def), { npcId: s.id, npcDef: def, driven: true })
  const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; inner.add(pm)
  const g = new THREE.Group(); g.add(inner); g.position.set(s.x, 0, s.z ?? 0); g.rotation.y = s.rot ?? FACE; scene.add(g)
  scene.updateMatrixWorld(true)
  const hm = humanoidMotion(pm)!
  const seed = [...s.id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261)
  const dur = s.act ? (IDLE_ACT_DUR[s.act][0] + IDLE_ACT_DUR[s.act][1]) / 2 : 0
  const actT = s.act ? dur * (s.at ?? .5) : 0
  const T0 = s.time ?? 3
  // 先站 T0 秒让重心/落脚稳定，再推进动作到目标时刻（30 fps）
  const steps = Math.ceil((T0 + actT) * 30)
  for (let i = 0; i <= steps; i++) {
    const t = i / 30, at = Math.max(0, t - T0)
    const idle: IdleFrame | undefined = s.idle === null ? undefined : {
      seed, act: s.act && t >= T0 ? s.act : '', actT: at, actDur: dur, look: s.look ? { x: s.look.x, y: s.look.z, z: s.look.y } : null, lookK: s.look ? Math.min(1, t / .45) : 0,
      lean: s.lean ? Math.min(1, t / .8) : 0, leanArms: (['cross', 'back', 'front'] as const)[seed % 3], temper: 'plain', ...(s.idle ?? {}),
    }
    hm.update({ time: t + 10, x: s.x, y: s.z ?? 0, z: 0, facing: -g.rotation.y, special: false, ground: () => 0, idle } as any)
    if (s.seat && idle) {
      let av: THREE.Object3D | undefined; pm.traverse(o => { if (!av && o.userData.retro) av = o })
      applySeatedPose(av as THREE.Group, { blend: 1, seatHeight: s.seat, relaxed: false, time: t + 10 })
      applyIdleUpper(hm.rig, { ...idle, seated: true }, { time: t + 10, x: s.x, y: s.z ?? 0, z: 0, facing: -g.rotation.y, scale: hm.rig.group.scale.y }, 0)
    }
  }
  models.push(pm)
  return g
}
function cell(i: number, cols: number, rows: number, x: number, name: string, opt: { side?: boolean; wide?: boolean; cz?: number } = {}) {
  const cw = W / cols, ch = H / rows, c = new THREE.PerspectiveCamera(opt.wide ? 40 : 30, cw / ch, .05, 60)
  const cz = opt.cz ?? 0
  if (opt.side) { c.position.set(x + 3.6, 1.35, cz + 1.1); c.lookAt(x, 1.0, cz) } else { c.position.set(x + 1.3, 1.3, cz + 4.4); c.lookAt(x, .98, cz) }
  const col = i % cols, row = Math.floor(i / cols)
  cells.push({ cam: c, x: col * cw, y: (rows - 1 - row) * ch, w: cw, h: ch })
  label(col * cw + cw / 2, row * ch + ch - 30, name)
}

const ACTS1: [IdleAct, string, number?][] = [['look', '环顾四周', .3], ['stretch', '伸懒腰'], ['neck', '揉后颈'], ['watch', '看手表'], ['scratch', '挠头'], ['cross', '抱臂'], ['hips', '叉腰'], ['back', '背手'],
  ['yawn', '打哈欠'], ['wipe', '擦汗', .4], ['dust', '拍裤腿'], ['shuffle', '换脚', .45]]
const ACTS2: [IdleAct, string, number?][] = [['clipboard', '翻写字板'], ['radio', '对讲机'], ['hardhat', '扶安全帽'], ['headphones', '扶耳机'], ['satchel', '捋挎包带', .35], ['tools', '清点工具/擦手'],
  ['medic', '检查医疗包'], ['scan', '警戒环顾'], ['crouch', '蹲下看地面'], ['count', '清点货物'], ['wave', '挥手招呼', .45], ['nod', '点头', .25]]
if (mode === 'acts1' || mode === 'acts2') {
  const list = mode === 'acts1' ? ACTS1 : ACTS2, cols = 6, rows = 2
  list.forEach(([act, name, at], i) => {
    const x = i * 12, id = IDS[(i * 7 + (mode === 'acts2' ? 3 : 0)) % IDS.length]
    place({ id, x, act, at, look: act === 'wave' || act === 'nod' ? new THREE.Vector3(x + 1.3, 1.6, 4.4) : undefined })
    cell(i, cols, rows, x, name)
  })
} else if (mode === 'life') {
  const cols = 3, rows = 2
  // 1 坐长椅
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.4, .46, .42), new THREE.MeshLambertMaterial({ color: '#6b4e34' })); bench.position.set(0, .23, -.08); scene.add(bench)
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.4, .5, .06), new THREE.MeshLambertMaterial({ color: '#6b4e34' })); back.position.set(0, .75, -.3); scene.add(back)
  place({ id: IDS[2], x: 0, seat: .46, act: 'book' }); cell(0, cols, rows, 0, '坐长椅 · 看书')
  // 2 靠墙
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 3, .2), new THREE.MeshLambertMaterial({ color: '#d8cf98' })); wall.position.set(12, 1.5, -.34); scene.add(wall)
  place({ id: IDS[5], x: 12, lean: true }); cell(1, cols, rows, 12, '靠墙站')
  const wall2 = wall.clone(); wall2.position.x = 24; scene.add(wall2)
  place({ id: IDS[9], x: 24, lean: true, act: 'watch' }); cell(2, cols, rows, 24, '靠墙 · 看手表', { side: false })
  // 4 闲聊（说话者 + 听者）
  place({ id: IDS[11], x: 36 - .65, rot: 0, idle: { chat: true, talking: true }, look: new THREE.Vector3(36.65, 1.55, 0), time: 4.2 })
  place({ id: IDS[14], x: 36 + .65, rot: Math.PI, idle: { chat: true, talking: false }, look: new THREE.Vector3(35.35, 1.55, 0), time: 4.4 })
  cell(3, cols, rows, 36, '两人闲聊（左说右听）', { wide: true })
  // 5 注视玩家（玩家在相机处）
  place({ id: IDS[17], x: 48, rot: FACE - .9, look: new THREE.Vector3(49.3, 1.6, 4.4) }); cell(4, cols, rows, 48, '转头注视玩家')
  // 6 坐着注视
  const b2 = bench.clone(); b2.position.x = 60; scene.add(b2); const bk2 = back.clone(); bk2.position.x = 60; scene.add(bk2)
  place({ id: IDS[20], x: 60, seat: .46, look: new THREE.Vector3(61.3, 1.6, 4.4) }); cell(5, cols, rows, 60, '坐着 · 抬头看玩家')
} else {
  // compare：上排修改前（原站姿），下排修改后（待机层），同一 NPC 在 4 个时刻
  const cols = 4, rows = 2, id = Q.get('id') ?? IDS[4]
  const times = [3, 7.4, 12.8, 19.1]
  times.forEach((t, i) => { const x = i * 12; place({ id, x, idle: null, time: t }); cell(i, cols, rows, x, `修改前 t=${t}s`) })
  const acts: (IdleAct | undefined)[] = [undefined, 'cross', 'neck', 'look']
  times.forEach((t, i) => { const x = 60 + i * 12; place({ id, x, time: t, act: acts[i], at: .45 }); cell(4 + i, cols, rows, x, `修改后 t=${t}s${acts[i] ? ' · ' + ({ cross: '抱臂', neck: '揉后颈', look: '环顾' } as any)[acts[i]!] : ' · 换重心'}`) })
}

preloadRetroAvatarTextures()
for (let i = 0; i < 80 && models.some(m => !retroModelReady(m)); i++) await new Promise(r => setTimeout(r, 100))
scene.updateMatrixWorld(true)
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
for (let k = 0; k < 6; k++) { // SwiftShader 首帧偶发 VALIDATE_STATUS false：重绘直到所有程序可用
  renderer.setScissorTest(true)
  for (const c of cells) { renderer.setViewport(c.x, c.y, c.w, c.h); renderer.setScissor(c.x, c.y, c.w, c.h); renderer.render(scene, c.cam) }
  renderer.setScissorTest(false)
  if (!(renderer.info.programs ?? []).some((p: any) => p.diagnostics && p.diagnostics.runnable === false)) break
  await new Promise(r => setTimeout(r, 200))
}
;(window as any).__ready = true
