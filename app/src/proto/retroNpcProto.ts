// 原型预览页：复古 NPC 建模（?mode=lineup | compare | close | turn，&t=秒 动作时刻，&live=1 GPU 蒙皮实时）
// 无头 SwiftShader 下 GPU 蒙皮可能丢上下文，默认把当前姿势 CPU 烘焙成静态网格再渲染。
import * as THREE from 'three'
import { buildRetroNpc, loadRetroNpcTextures, RETRO_NPC_IDS, type RetroNpc, type RetroNpcId } from '../game/renderer/retroNpc'
import { buildPlayerModel } from '../game/renderer/playerModel'
import { NPCS, npcAvatar } from '../game/content/npcs'
import { buildAvatarModel, retroModelReady } from '../game/renderer/retroAvatar'
import { buildCharacterModel } from '../game/renderer/characterModel'
import { applyNpcGear } from '../game/renderer/npcGear'
import { DEFAULT_AVATAR, randomAvatar, HAIR_NAMES, TOP_STYLE_NAMES, PANTS_STYLE_NAMES, FACE_NAMES, BEARD_NAMES, type AvatarCfg } from '../game/core/avatar'
import type { EquipVisual } from '../game/renderer/playerModel'
import { mulberry } from '../game/renderer/shared'
import { buildHeldItem, buildRetroHand, heldHandPose, heldBox, LIGHTER_HAND_POSE, sleeveKindOf, vmAnimPose, vmat } from '../game/renderer/viewmodel'
import { buildFlashlightMesh } from '../game/renderer/flashlightMesh'
import { FLASH_HAND_POSE } from '../game/renderer/retroViewHand'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'

const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'lineup'
const T = Number(q.get('t') ?? 3.1)
const live = q.get('live') === '1'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#57513a'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 12, 40)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#6e6340' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(60, 8), new THREE.MeshLambertMaterial({ color: '#b3a564' })); wl.position.set(0, 4, -3); scene.add(wl)
scene.add(new THREE.HemisphereLight('#fff6dc', '#3a3628', 1.25)); const sun = new THREE.DirectionalLight('#fff4dc', 1.1); sun.position.set(2.5, 5, 6); scene.add(sun)
const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 80)
const lab = document.getElementById('lab')!
const NAMES: Record<RetroNpcId, string> = { kat: 'Kat · 监督者', tom: 'Tom · 厨师/店主', aiko: '佐藤爱子 · 跑堂', kowalski: '科瓦尔斯基 · 退休会计' }

/** 把当前骨骼姿势烘焙成静态网格（CPU 蒙皮）；挂在骨骼上的配饰按当前世界矩阵一并拷贝。 */
function bake(npc: RetroNpc, root?: THREE.Object3D): THREE.Object3D {
  const m = npc.mesh
  const top = root ?? npc.group
  top.updateMatrixWorld(true); m.skeleton.update()
  const src = m.geometry, pos = src.getAttribute('position')
  const out = new Float32Array(pos.count * 3), v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); out.set([v.x, v.y, v.z], i * 3) }
  const g = new THREE.BufferGeometry()
  for (const k of ['uv', 'color']) g.setAttribute(k, src.getAttribute(k))
  g.setAttribute('position', new THREE.BufferAttribute(out, 3)); g.computeVertexNormals()
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex ?? 0)
  const s = new THREE.Mesh(g, m.material); s.scale.copy(npc.group.scale)
  const holder = new THREE.Group(); holder.add(s)
  const inv = top.matrixWorld.clone().invert()
  m.traverse((o) => {
    const mm = o as THREE.Mesh
    if (!mm.isMesh || o === m) return
    const c = new THREE.Mesh(mm.geometry, mm.material)
    c.matrixAutoUpdate = false; c.matrix.copy(inv.clone().multiply(mm.matrixWorld)); holder.add(c)
  })
  return holder
}
/** 通用形象：等贴图到位后（池图异步下载）放进场景；返回包装组。 */
async function placeAvatar(model: THREE.Group, x: number, z: number, ry: number, t = T) {
  const npc = model.userData.retro as RetroNpc
  ;(model.userData.retroUpdate as (t: number) => void)(t)
  const obj = live ? model : bake(npc, model)
  obj.position.set(x, 0, z); obj.rotation.y = ry; scene.add(obj)
  return npc
}
async function texturesSettled() {
  for (let i = 0; i < 200; i++) { if (retroModelReady(scene)) return; await new Promise((r) => setTimeout(r, 100)) }
}
const AV = (o: Partial<AvatarCfg>): AvatarCfg => ({ ...DEFAULT_AVATAR, ...o })
function placeOldCfg(cfg: AvatarCfg, x: number, z: number, ry: number, npcId?: string) {
  const g = buildPlayerModel(cfg); if (npcId) applyNpcGear(g.userData.parts, npcId, NPCS[npcId]); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g)
}

async function place(id: RetroNpcId, x: number, z: number, ry: number, t = T) {
  const tex = await loadRetroNpcTextures(id)
  const npc = buildRetroNpc(id, tex)
  npc.update(t)
  const obj = live ? npc.group : bake(npc)
  obj.position.set(x, 0, z); obj.rotation.y = ry; scene.add(obj)
  return npc
}
function placeOld(id: RetroNpcId, x: number, z: number, ry: number) {
  const g = buildPlayerModel(npcAvatar(NPCS[id])); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g)
  let tris = 0, calls = 0; g.traverse((o: any) => { if (o.isMesh) { calls++; const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.getAttribute('position').count) / 3 } })
  return { tris, calls }
}
const label = (x: number, y: number, z: number, html: string) => { const p = new THREE.Vector3(x, y, z).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(-p.y * 0.5 + 0.5) * H}px">${html}</div>`) }

// ---------- 第一人称手部（v71）：网格多视口，每格一台 72° 相机 + vm 节点（与游戏同参数）----------
/** 调试：&fax=x,y,z&ffd=x,y,z&fat=x,y,z 覆盖手电左手握法（可按格子用 fax0/fax1…） */
function flashPoseOverride(c: { label: string }): typeof FLASH_HAND_POSE {
  const q = new URLSearchParams(location.search), v = (k: string) => q.get(k)?.split(',').map(Number) as [number, number, number] | undefined
  const i = (c as { idx?: number }).idx ?? 0
  return { ...FLASH_HAND_POSE, ...(v('fax' + i) || v('fax') ? { ax: v('fax' + i) ?? v('fax') } : {}), ...(v('ffd' + i) || v('ffd') ? { fdir: v('ffd' + i) ?? v('ffd') } : {}), ...(v('fat' + i) ? { at: v('fat' + i) } : {}) }
}
type HandCell = { label: string; item: string; anim?: { kind: 'use' | 'attack' | 'search' | 'inspect' | 'walk'; name?: string; pr?: number }; top?: number; flash?: boolean; lighter?: boolean; gloved?: boolean; suit?: boolean; skin?: string; old?: boolean }
async function handsMode() {
  const set = q.get('set') ?? 'items'
  const cells: HandCell[] = set === 'items' ? [
    { label: '空手（握拳）', item: '' }, { label: '撬棍', item: 'crowbar' }, { label: '管钳', item: 'wrench' }, { label: '木板', item: 'timber' },
    { label: '短刀', item: 'knife' }, { label: '消防斧', item: 'axe' }, { label: '荧光棒', item: 'glowstick' }, { label: '打火机（右手）', item: 'lighter' },
    { label: '枪糖手枪', item: 'guncandy' }, { label: '滋水枪', item: 'squirtgun' }, { label: '幸运牛奶', item: 'luckymilk' }, { label: '杏仁水（托举）', item: 'almond' },
  ] : set === 'anims' ? [
    { label: '出拳', item: '', anim: { kind: 'attack', name: 'punch', pr: 0.38 } }, { label: '挥砍（撬棍）', item: 'crowbar', anim: { kind: 'attack', name: 'swing', pr: 0.5 } },
    { label: '投掷', item: 'glowstick', anim: { kind: 'attack', name: 'throw', pr: 0.5 } }, { label: '滋水枪喷射', item: 'squirtgun', anim: { kind: 'attack', name: 'spray', pr: 0.25 } },
    { label: '瓶装饮用', item: 'almond', anim: { kind: 'use', name: 'bottleDrink', pr: 0.45 } }, { label: '进食', item: 'canned', anim: { kind: 'use', name: 'eat', pr: 0.5 } },
    { label: '医疗', item: 'bandage', anim: { kind: 'use', name: 'medical', pr: 0.5 } }, { label: '注射', item: 'liquidpain', anim: { kind: 'use', name: 'inject', pr: 0.5 } },
    { label: '换电池', item: 'battery', anim: { kind: 'use', name: 'battery', pr: 0.5 } }, { label: '搜索', item: 'knife', anim: { kind: 'search' } },
    { label: '检视（V，斧）', item: 'axe', anim: { kind: 'inspect', pr: 0.9 } }, { label: '检视（V，刀）', item: 'knife', anim: { kind: 'inspect', pr: 2.4 } },
  ] : set === 'flashtry' ? [
    { label: 'A', item: '', flash: true }, { label: 'B', item: '', flash: true }, { label: 'C', item: '', flash: true }, { label: 'D', item: '', flash: true },
  ] : set === 'flash' ? [
    { label: '手电（第一人称）', item: '', flash: true }, { label: '手电 + 撬棍', item: 'crowbar', flash: true }, { label: '打火机', item: '', lighter: true }, { label: '手电 · 戴手套', item: '', flash: true, gloved: true },
  ] : [
    { label: '左手手电 + 空手', item: '', flash: true }, { label: '左手打火机 + 刀', item: 'knife', lighter: true }, { label: 'T恤（短袖露前臂）', item: 'crowbar', top: 0, skin: '#7d5a3c' }, { label: '背心', item: 'axe', top: 5, skin: '#f0c8a8' },
    { label: '隔热手套', item: 'wrench', gloved: true }, { label: '绝缘服', item: 'timber', suit: true }, { label: '毛衣 + 手电', item: 'glowstick', top: 6, flash: true, skin: '#a87f5c' }, { label: '风衣', item: 'squirtgun', top: 7, skin: '#5a4030' },
    { label: '旧：方块手', item: 'crowbar', old: true }, { label: '旧：方块手 + 手电', item: '', flash: true, old: true }, { label: '新：同上', item: 'crowbar' }, { label: '新：同上', item: '', flash: true },
  ]
  const cols = cells.length <= 4 ? 2 : 4, rowsN = Math.ceil(cells.length / cols)
  const cw = Math.floor(W / cols), ch = Math.floor(H / rowsN)
  const jobs: { sc: THREE.Scene; cm: THREE.PerspectiveCamera }[] = []
  cells.forEach((c, i) => {
    ;(c as { idx?: number }).idx = i
    const sc = new THREE.Scene(); sc.background = new THREE.Color('#6b6136')
    sc.add(new THREE.HemisphereLight('#fff3d0', '#4a4330', 1.1)); const dl = new THREE.DirectionalLight('#fff0d0', 1.3); dl.position.set(-1, 2, 1.5); sc.add(dl)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshLambertMaterial({ color: '#b5a35e' })); wall.position.set(0, 0, -2.5); sc.add(wall)
    const cm = new THREE.PerspectiveCamera(72, cw / ch, 0.02, 20); sc.add(cm)
    const vm = new THREE.Group(); cm.add(vm)
    const look = { skin: c.skin ?? '#c9a58a', sleeve: c.suit ? '#3a5a3a' : '#3a3f46', sleeveKind: c.suit ? 'long' as const : sleeveKindOf(c.top ?? 3), topStyle: c.top ?? 3, plainSleeve: !!c.suit, gloved: c.gloved }
    let item: THREE.Group | null = null
    let hbox: ReturnType<typeof heldBox> | undefined
    if (c.item) { item = buildHeldItem(c.item); hbox = heldBox(item); vm.add(item); vm.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(item); const inv = new THREE.Matrix4().copy(vm.matrixWorld).invert(); bb.applyMatrix4(inv); ((window as any).__diag ??= []).push(c.item + ' ' + [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z].map((v) => v.toFixed(3)).join(',')) }
    if (c.old) {
      const sl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), vmat('#3a3f46')); sl.position.set(0.02, -0.05, 0.16); sl.rotation.x = 0.3; vm.add(sl)
      const hd = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.06, 0.11), vmat('#c9a58a')); hd.position.set(0, 0, -0.02); vm.add(hd)
    } else {
      const hand = buildRetroHand(); hand.setLook(look); hand.setPose(heldHandPose(c.item, hbox), item); vm.add(hand.group)
      if (c.anim?.kind === 'inspect' && item) {
        // 与 renderer 相同：绕握持点转物品，手只跟随前后/左右倾斜
        const ph = c.anim.pr ?? 1, b = item.position.clone(), hb = hand.group.position.clone(), sweep = Math.sin(ph) * .92
        const dE = new THREE.Euler(-.22 + Math.sin(ph * .63) * .18, .68 + sweep, Math.sin(ph * .77) * .1)
        const dq = new THREE.Quaternion().setFromEuler(dE)
        const rel = b.clone().sub(hb).applyQuaternion(dq)
        item.position.set(hb.x + rel.x - .055, hb.y + rel.y + .075, hb.z + rel.z - .025); item.quaternion.premultiply(dq)
        hand.group.position.set(hb.x - .055, hb.y + .075, hb.z - .025)
        hand.group.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(dE.x, 0, dE.z)))
      }
    }
    const a = c.anim
    const pose = vmAnimPose({ mx: 0, my: 0, bobPhase: 0, time: 0.4, usingItem: a?.kind === 'use' ? { t: (a.pr ?? 0.5) * 2, dur: 2, anim: a.name } : null,
      attackAnimT: a?.kind === 'attack' ? (1 - (a.pr ?? 0.5)) * 0.4 : 0, attackAnimDur: 0.4, attackAnimKind: a?.name, searching: a?.kind === 'search' })
    vm.position.set(pose.px, pose.py, pose.pz); vm.rotation.x = pose.rx; vm.rotation.z = pose.rz
    if (c.flash) {
      const vf = new THREE.Group(); const fl2 = buildFlashlightMesh({ lit: true }); fl2.scale.setScalar(0.9); fl2.position.z = 0.015; vf.add(fl2)
      if (c.old) { const lh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.055, 0.1), vmat('#c9a58a')); lh.position.set(0, -0.045, -0.06); vf.add(lh) }
      else { const lh = buildRetroHand({ left: true }); lh.setLook(look); lh.setPose(flashPoseOverride(c), fl2); vf.add(lh.group) }
      vf.position.set(-0.24, -0.28, -0.42); cm.add(vf)
    }
    if (c.lighter) {
      const vl = new THREE.Group()
      const solid = new THREE.Group(); vl.add(solid)
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.075, 0.032), vmat('#c9c2a8')); solid.add(body)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.03), vmat('#8a8a8a')); cap.position.set(0, 0.05, 0); solid.add(cap)
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.05, 6), new THREE.MeshBasicMaterial({ color: '#ffb347' })); flame.position.set(0, 0.095, 0); vl.add(flame)
      const lh = buildRetroHand({ left: true }); lh.setLook(look); lh.setPose(LIGHTER_HAND_POSE, solid); vl.add(lh.group)
      vl.position.set(-0.24, -0.28, -0.42); cm.add(vl)
    }
    if (q.get('zoom')) {
      // 特写：另放一台相机绕手部观察（yaw 弧度，0 = 第一人称同向）
      sc.updateMatrixWorld(true)
      const tgt = (q.get('left') ? new THREE.Vector3(-0.24, -0.29, -0.46) : new THREE.Vector3(0.27, -0.27, -0.6)).applyMatrix4(cm.matrixWorld)
      const yw = Number(q.get('yaw') ?? 0), pt = Number(q.get('pitch') ?? 0.35), dist = Number(q.get('dist') ?? 0.42)
      const c2 = new THREE.PerspectiveCamera(32, cw / ch, 0.01, 20)
      c2.position.set(tgt.x + Math.sin(yw) * Math.cos(pt) * dist, tgt.y + Math.sin(pt) * dist, tgt.z + Math.cos(yw) * Math.cos(pt) * dist)
      c2.lookAt(tgt); sc.add(c2); jobs.push({ sc, cm: c2 })
    } else jobs.push({ sc, cm })
    const x = (i % cols) * cw, y = Math.floor(i / cols) * ch
    const d = document.createElement('div'); d.className = 'l'; d.style.left = `${x + cw / 2}px`; d.style.top = `${y + 6}px`; d.innerHTML = c.label; lab.appendChild(d)
  })
  await new Promise((r) => setTimeout(r, 2500)) // 袖子贴图 / 物品贴图到位
  renderer.setScissorTest(true)
  jobs.forEach(({ sc, cm }, i) => {
    const x = (i % cols) * cw, y = H - (Math.floor(i / cols) + 1) * ch
    renderer.setViewport(x + 2, y + 2, cw - 4, ch - 4); renderer.setScissor(x + 2, y + 2, cw - 4, ch - 4)
    cm.aspect = (cw - 4) / (ch - 4); cm.updateProjectionMatrix(); renderer.render(sc, cm)
  })
  ;(window as any).__ready = true
}

async function main() {
  if (mode === 'hands') return handsMode()
  const ids = RETRO_NPC_IDS
  if (mode === 'close') {
    cam.fov = 24; cam.updateProjectionMatrix()
    cam.position.set(0, 1.63, 3.4); cam.lookAt(0, 1.6, 0)
    for (let i = 0; i < 4; i++) await place(ids[i], (i - 1.5) * 0.48, 0, 0.18 * (1.5 - i))
    cam.updateMatrixWorld()
    ids.forEach((id, i) => label((i - 1.5) * 0.48, 1.37, 0, NAMES[id]))
  } else if (mode === 'heads') {
    const id = (q.get('id') ?? 'aiko') as RetroNpcId
    const fov = Number(q.get('fov') ?? 22), cy = Number(q.get('cy') ?? 1.5), sp = Number(q.get('sp') ?? 0.6)
    cam.fov = fov; cam.updateProjectionMatrix()
    cam.position.set(0, cy + 0.02, 3.6); cam.lookAt(0, cy, 0); cam.updateMatrixWorld()
    const angs = [0, -0.8, -Math.PI / 2, Math.PI]
    for (let i = 0; i < 4; i++) await place(id, (i - 1.5) * sp, 0, angs[i])
    label(0, 1.86, 0, `${NAMES[id]} · 头部/领口 正面 / 3/4 / 侧面 / 背面`)
  } else if (mode === 'turn') {
    const id = (q.get('id') ?? 'aiko') as RetroNpcId
    cam.position.set(0, 1.25, 7.6); cam.lookAt(0, 1.0, 0); cam.updateMatrixWorld()
    const angs = [0, -0.8, -Math.PI / 2, Math.PI]
    for (let i = 0; i < 4; i++) await place(id, (i - 1.5) * 1.15, 0, angs[i])
    label(0, 2.05, 0, `${NAMES[id]} · 正面 / 3/4 / 侧面 / 背面`)
  } else if (mode === 'crowd') {
    // 随机 NPC 一群：每组左旧右新（同一 randomAvatar 配置 + 种子）
    const n = Number(q.get('n') ?? 6), seed0 = Number(q.get('seed') ?? 11)
    cam.position.set(0, 1.5, 10.2); cam.lookAt(0, 0.95, 0); cam.updateMatrixWorld()
    if (q.get('close') === '1') { cam.position.set(0, 1.56, 2.3); cam.lookAt(0, 1.5, 0); cam.updateMatrixWorld() }
    for (let i = 0; i < n; i++) {
      const sd = seed0 + i * 7, cfg = randomAvatar(mulberry(sd * 977))
      const x = (i - (n - 1) / 2) * (9.2 / n)
      if (q.get('old') !== '0') placeOldCfg(cfg, x - 0.36, 0, 0.15)
      await placeAvatar(buildAvatarModel(cfg, { seed: sd, driven: false }), q.get('old') === '0' ? x : x + 0.36, 0, -0.12)
      label(x, 0.06, 1.0, `<span class="s">${['男', '女'][cfg.gender]} · ${HAIR_NAMES[cfg.hair]} · ${TOP_STYLE_NAMES[cfg.topStyle]} · ${PANTS_STYLE_NAMES[cfg.pantsStyle]}</span>`)
    }
    label(0, 2.3, 0, q.get('old') === '0' ? '随机 NPC（新复古模型）' : '<span class="s">随机 NPC：每组左 = 现有方块模型，右 = 新复古模型（同一配置）</span>')
  } else if (mode === 'poolclose') {
    // v82：随机 NPC 池脸特写（看发际线与皮肤的交界）；&seed= &yaw= &n=
    const n = Number(q.get('n') ?? 6), seed0 = Number(q.get('seed') ?? 11), yaw = Number(q.get('yaw') ?? 0)
    cam.fov = 20; cam.updateProjectionMatrix()
    cam.position.set(0, 1.6, 3.3); cam.lookAt(0, 1.55, 0); cam.updateMatrixWorld()
    for (let i = 0; i < n; i++) {
      const sd = seed0 + i * 7, cfg = randomAvatar(mulberry(sd * 977))
      const x = (i - (n - 1) / 2) * 0.42
      await placeAvatar(buildAvatarModel(cfg, { seed: sd, driven: false }), x, 0, yaw)
      label(x, 1.3, 0, `<span class="s">${['男', '女'][cfg.gender]} · ${HAIR_NAMES[cfg.hair]}</span>`)
    }
  } else if (mode === 'named') {
    // 有名 NPC（固定配置 + 配饰）：左旧右新
    const ids = (q.get('ids') ?? 'kat,tom,aiko,kowalski').split(',')
    cam.position.set(0, 1.5, 10.2); cam.lookAt(0, 0.95, 0); cam.updateMatrixWorld()
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], def = NPCS[id], x = (i - (ids.length - 1) / 2) * (q.get('close') === '1' ? 0.62 : 9.2 / ids.length)
      if (!def) continue
      if (q.get('old') !== '0') placeOldCfg(npcAvatar(def), x - 0.36, 0, 0.15, id)
      const mdl = buildCharacterModel(npcAvatar(def), { npcId: id, npcDef: def, driven: q.get('walk') === '1' })
      if (q.get('walk') === '1') { // 模拟游戏内步态：renderer 直接改 parts（骨骼）的 rotation.x
        const pp = mdl.userData.parts as Record<string, THREE.Object3D>, ph = 1.1 + i
        pp.legL.rotation.x = Math.sin(ph) * 0.5; pp.legR.rotation.x = -Math.sin(ph) * 0.5
        pp.armL.rotation.x = -Math.sin(ph) * 0.4; pp.armR.rotation.x = Math.sin(ph) * 0.4; pp.head.rotation.y = 0.3
      }
      await placeAvatar(mdl, q.get('old') === '0' ? x : x + 0.36, 0, -0.12)
      label(x, 0.06, 1.0, `<span class="s">${def.name.slice(0, 14)}</span>`)
    }
  } else if (mode === 'hair') {
    // 发型 16 款（头肩特写，男女交替；&row=0|1 各 8 款）
    const row = Number(q.get('row') ?? 0)
    cam.fov = 20; cam.updateProjectionMatrix()
    cam.position.set(0, 1.62, 7.2); cam.lookAt(0, 1.52, 0); cam.updateMatrixWorld()
    const colors = ['#232326', '#4a3020', '#7a5a30', '#9a9a9e', '#8a3a2a']
    for (let c = 0; c < 8; c++) {
      const i = row * 8 + c, x = (c - 3.5) * 0.52
      const cfg = AV({ hair: i, gender: i % 2, hairColor: colors[i % 5], skin: ['#f0c8a8', '#c9a58a', '#a87f5c', '#7d5a3c', '#5a4030'][(i * 3) % 5], topStyle: i % 8, top: ['#3a3f46', '#5a4a3a', '#3a5a4a', '#4a3a5a', '#6a3a3a', '#8a8578', '#2e4a5e', '#6e6a2e'][i % 8] })
      const yq = q.get('yaw')
      await placeAvatar(buildAvatarModel(cfg, { driven: false }), x, 0, yq !== null ? Number(yq) : c % 2 ? 0.6 : -0.6, 0.2)
      label(x, 1.25, 0, `<span class="s">${HAIR_NAMES[i]}</span>`)
    }
  } else if (mode === 'player') {
    // 玩家捏人：上衣 8 款 / 裤 6 款 / 鞋 3 款 / 表情 4 种 / 眼镜胡须 / 装备
    const sets: [string, AvatarCfg, EquipVisual?][] = []
    const part = q.get('part') ?? 'tops'
    if (part === 'tops') for (let i = 0; i < 8; i++) sets.push([TOP_STYLE_NAMES[i], AV({ topStyle: i, gender: i % 2, top: ['#3a3f46', '#5a4a3a', '#3a5a4a', '#4a3a5a', '#6a3a3a', '#8a8578', '#2e4a5e', '#6e6a2e'][i], hair: [1, 11, 7, 3, 2, 15, 12, 9][i] })])
    if (part === 'pants') for (let i = 0; i < 6; i++) sets.push([`${PANTS_STYLE_NAMES[i]} · ${['便鞋', '运动鞋', '皮靴'][i % 3]}`, AV({ pantsStyle: i, shoes: i % 3, gender: i % 2, pants: ['#2a2d33', '#3a352e', '#4a4a42', '#2e3a4a', '#3a352e', '#5c5244'][i], hair: [1, 6, 2, 3, 15, 4][i] })])
    if (part === 'face') {
      for (let i = 0; i < 4; i++) sets.push([FACE_NAMES[i], AV({ face: i, gender: i % 2, hair: [1, 11, 3, 6][i], skin: ['#c9a58a', '#f0c8a8', '#7d5a3c', '#a87f5c'][i] })])
      sets.push(['圆框眼镜', AV({ glasses: 1, hair: 3 })], ['方框眼镜 + 山羊胡', AV({ glasses: 2, beard: 1, hair: 2, skin: '#a87f5c' })], ['墨镜 + 络腮胡', AV({ glasses: 3, beard: 2, hair: 12, skin: '#5a4030' })])
    }
    if (part === 'equip') {
      sets.push(['绝缘服 + 头灯', AV({}), { suit: true, headlamp: true }], ['保温服 + 隔热手套', AV({ gender: 1, hair: 15 }), { cavingsuit: true, gloves: true }], ['潜水面罩', AV({ hair: 2 }), { divemask: true }], ['夜视仪', AV({ gender: 1, hair: 8 }), { nightvision: true }])
    }
    const close = part === 'face'
    if (close) { cam.fov = 16; cam.updateProjectionMatrix(); cam.position.set(0, 1.6, 6.4); cam.lookAt(0, 1.56, 0) } else { cam.position.set(0, 1.45, 8.6); cam.lookAt(0, 0.95, 0) }
    cam.updateMatrixWorld()
    const sp = close ? 0.36 : 9 / sets.length
    for (let i = 0; i < sets.length; i++) {
      const x = (i - (sets.length - 1) / 2) * sp
      await placeAvatar(buildAvatarModel(sets[i][1], { ev: sets[i][2], driven: false }), x, 0, close ? 0 : -0.25 + (i % 2) * 0.5, close ? 0.2 : T)
      label(x, close ? 1.36 : 0.04, close ? 0 : 0.8, `<span class="s">${sets[i][0]}</span>`)
    }
  } else if (mode === 'beards') {
    // 胡须全款：正面一排 + &yaw= 转角；&walk 不适用
    cam.fov = q.get('close') ? 9 : 20; cam.updateProjectionMatrix(); cam.position.set(0, 1.62, 7.2); cam.lookAt(0, q.get('close') ? 1.6 : 1.52, 0); cam.updateMatrixWorld()
    const yq = Number(q.get('yaw') ?? 0.35)
    const n = BEARD_NAMES.length - 1
    for (let c = 0; c < n; c++) {
      const x = (c - (n - 1) / 2) * (q.get('close') ? 0.26 : 0.52)
      const cfg = AV({ beard: c + 1, hair: [1, 2, 3, 7, 12, 6, 13, 4, 9][c % 9], hairColor: ['#232326', '#4a3020', '#7a5a30', '#9a9a9e', '#2a2018'][c % 5], skin: ['#c9a58a', '#a87f5c', '#f0c8a8', '#7d5a3c', '#5a4030', '#d8b090'][c % 6] })
      const nn = await placeAvatar(buildAvatarModel(cfg, { driven: false }), x, 0, yq, 0.2)
      label(x, q.get('close') ? 1.45 : 1.25, 0, `<span class="s">${BEARD_NAMES[c + 1]}<br>${nn.diagnostics.triangles}面</span>`)
    }
  } else if (mode === 'faceling') {
    // L3 无面灵异常五官：&close=1 头部特写（一排 6 只），否则全身一排 8 只；&yaw= 转角；&seed0= 起始种子；&plain=1 普通无面灵
    const close = !!q.get('close'), yq = Number(q.get('yaw') ?? 0.25), s0 = Number(q.get('seed0') ?? 1)
    const n = Number(q.get('n') ?? (close ? 6 : 8)), sp = Number(q.get('sp') ?? (close ? 0.25 : 0.62))
    let top = 0
    const labs: [number, string][] = []
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * sp
      const g = buildEntityMesh('faceling', { l3face: !q.get('plain'), seed: s0 + i * 17 } as any)
      let av: THREE.Object3D | undefined
      g.traverse((o) => { if (!av && o.userData.retro) av = o })
      const npc = (av as THREE.Object3D).userData.retro as RetroNpc
      ;((av as THREE.Object3D).userData.retroUpdate as (t: number) => void)(0.2)
      g.updateMatrixWorld(true)
      const obj = live ? g : bake(npc, g)
      obj.position.set(x, 0, 0); obj.rotation.y = close ? yq * (i % 2 ? -1 : 1) : yq; scene.add(obj)
      obj.updateMatrixWorld(true)
      top = Math.max(top, new THREE.Box3().setFromObject(obj).max.y)
      const fp = (av as THREE.Object3D).userData.facePlan as { label?: string } | undefined
      labs.push([x, `<span class="s">#${s0 + i * 17}${fp?.label ? '<br>' + fp.label : ''}</span>`])
    }
    const hy = top - 0.17
    cam.fov = Number(q.get('fov') ?? (close ? 5.6 : 20)); cam.updateProjectionMatrix()
    cam.position.set(0, close ? hy + 0.04 : 1.4, close ? 11 : 8); cam.lookAt(0, close ? hy : 0.95, 0); cam.updateMatrixWorld()
    for (const [x, h] of labs) label(x, close ? hy - 0.15 : 0.04, close ? 0 : 0.8, h)
  } else if (mode === 'shades') {
    // 墨镜特写：正面 / 3/4 / 侧面 / 3/4 背光，四种肤色发型
    cam.fov = 11; cam.updateProjectionMatrix(); cam.position.set(0, 1.64, 6.4); cam.lookAt(0, 1.62, 0); cam.updateMatrixWorld()
    const cfgs = [AV({ glasses: 3, hair: 2 }), AV({ glasses: 3, hair: 11, gender: 1, skin: '#f0c8a8', hairColor: '#7a5a30' }), AV({ glasses: 3, beard: 2, hair: 12, skin: '#5a4030' }), AV({ glasses: 3, hair: 15, gender: 1, skin: '#a87f5c' })]
    const angs = [0, -0.7, -Math.PI / 2, 0.45]
    for (let i = 0; i < 4; i++) await placeAvatar(buildAvatarModel(cfgs[i], { driven: false }), (i - 1.5) * 0.36, 0, angs[i], 0.2)
  } else if (mode === 'compare') {
    cam.position.set(0, 1.55, 9.5); cam.lookAt(0, 0.95, 0); cam.updateMatrixWorld()
    let old = { tris: 0, calls: 0 }
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 1.55
      old = placeOld(ids[i], x - 0.36, 0, 0.12)
      await place(ids[i], x + 0.36, 0, -0.12)
      label(x, 0.08, 1.0, NAMES[ids[i]])
    }
    label(0, 2.25, 0, `<span class="s">每组左：现有方块模型（约 ${old.calls} 次绘制 / ${Math.round(old.tris)} 面）　右：新复古模型</span>`)
  } else {
    cam.position.set(0, 1.45, 8.2); cam.lookAt(0, 0.98, 0); cam.updateMatrixWorld()
    const diags: string[] = []
    for (let i = 0; i < 4; i++) {
      const n = await place(ids[i], (i - 1.5) * 1.25, 0, 0.25 * (1.5 - i) * 0.4)
      const d = n.diagnostics
      diags.push(`${d.triangles} 面 / ${d.drawCalls} 次绘制`)
      label((i - 1.5) * 1.25, 0.02, 0.6, `${NAMES[ids[i]]}<br><span class="s">${diags[i]} · ${d.bones} 骨骼</span>`)
    }
    ;(window as any).__diag = diags
  }
  await texturesSettled()
  renderer.render(scene, cam)
  ;(window as any).__ready = true
}
main().catch((e) => { console.error(e); (window as any).__err = String(e) })
