// [ferren] Ferren（Entity 92）重制·阶段 3 机制预览：proto-ferren-mech.html?mech=sleep|eat|noclip|play
// 页面里跑真实的 Engine + 商人之家 tradersWorld 地图 + ferrenAI（与 check:ferren 同一套），再用游戏的 buildStructure（笼子围栏 / 窝 / 食盆）
// 与 ferrenRender.animateFerrenEntity（片段推进 / 混合 / 进窝 / 小被子）渲染。截图由 scripts/verify-ferren.mjs 的 mech-* 视图驱动（端口 3494）。
import * as THREE from 'three'
import { Engine } from '../game/engine'
import { levelDefOf } from '../game/levels'
import { createTradersMap, ensureTradersAt } from '../game/world/tradersWorld'
import { FERREN_CAGE } from '../game/content/ferrenCage'
import * as F from '../game/engine/ferrenAI'
import { buildStructure } from '../game/renderer/structures'
import { buildFerrenMesh } from '../game/renderer/ferrenMesh'
import { animateFerrenEntity } from '../game/renderer/ferrenRender'
import type { Entity } from '../game/entities'

const q = new URLSearchParams(location.search)
const mode = q.get('mech') ?? 'sleep'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const lab = document.getElementById('lab')!
const info: Record<string, unknown> = {}

// ---------- 真实引擎 + 商人之家地图 ----------
const eng = new Engine() as any
eng.player.level = 102
eng.map = createTradersMap(levelDefOf(102)!, 4242)
ensureTradersAt(eng.map, FERREN_CAGE.spawn.x, FERREN_CAGE.spawn.y, 40)
eng.explored = new Uint8Array(eng.map.w * eng.map.h).fill(1)
eng.emit = () => {}; eng.persist = () => {}
const msgs: string[] = []; const msg0 = eng.msg.bind(eng); eng.msg = (t: string, k?: any) => { msgs.push(t); msg0(t, k) }
Object.assign(eng.player, { x: 330, y: 158, z: 0, hp: 100, sanity: 70 })
eng.rep = { meg: 0, bntg: 0 }
const DT = 1 / 30
const fer = () => eng.map.entities.find((e: Entity) => e.def.type === 'ferren' && !e.dead) as Entity
const tick = () => { eng.updateEntities(DT, 1); F.stepFerrenWorld(eng, DT); eng.time += DT }
const setPhase = (kind: string, at: number, idx = 0) => { const ph = F.FERREN_SCHEDULE.filter((p) => p.kind === kind)[idx]; const [a, b] = F.phaseSeconds(ph); eng.ferrenRun.clock = 3 * F.FR.CYCLE + a + (b - a) * at }
const until = (test: () => boolean, secs: number, each?: () => void) => { for (let t = 0; t < secs && !test(); t += DT) { each?.(); tick() } return test() }
const press = () => { eng.specialHeld = true; tick(); eng.specialHeld = false; tick() }

// ---------- 场景 ----------
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2b2925')
const CX = (FERREN_CAGE.x0 + FERREN_CAGE.x1) / 2, CY = (FERREN_CAGE.y0 + FERREN_CAGE.y1) / 2
const floorMat = new THREE.MeshStandardMaterial({ color: '#9d978a', roughness: 0.85 })
const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.set(CX, 0, CY); floor.receiveShadow = true; scene.add(floor)
for (let i = -7; i <= 7; i++) { // 地砖缝
  const l1 = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.01), new THREE.MeshBasicMaterial({ color: '#86806f' })); l1.rotation.x = -Math.PI / 2; l1.position.set(CX, 0.001, Math.round(CY) + i); scene.add(l1)
  const l2 = l1.clone(); l2.rotation.z = Math.PI / 2; l2.position.set(Math.round(CX) + i, 0.001, CY); scene.add(l2)
}
scene.add(new THREE.HemisphereLight('#f4efe2', '#5c5648', 1.5))
const key = new THREE.DirectionalLight('#fff4e2', 2.2); key.position.set(CX + 2.5, 5, CY + 3); key.target.position.set(CX, 0, CY); scene.add(key.target)
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 14 }); key.shadow.bias = -0.0004; scene.add(key)
const def = levelDefOf(102)!
for (const s of eng.map.structures) if (s.kind.startsWith('ferren')) { const g = buildStructure(s, def, eng.map, 4.8); if (g) { g.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } }); scene.add(g) } }
const ferret = buildFerrenMesh(); scene.add(ferret)
// 玩家（简化的人形占位：腿 + 躯干 + 头）
const player = new THREE.Group()
{ const m = new THREE.MeshStandardMaterial({ color: '#4d5a6b', roughness: 0.8 }), skin = new THREE.MeshStandardMaterial({ color: '#d7b49a', roughness: 0.7 })
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.22), m); leg.position.y = 0.4; player.add(leg)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.26), m); body.position.y = 1.12; player.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin); head.position.y = 1.58; player.add(head)
  player.traverse((o: any) => { if (o.isMesh) o.castShadow = true }) }
scene.add(player)
const place = (e: Entity) => { ferret.position.set(e.x, 0, e.y); ferret.rotation.y = -e.facing }
const placePlayer = () => { player.position.set(eng.player.x, 0, eng.player.y); player.rotation.y = Math.atan2(fer().x - eng.player.x, fer().y - eng.player.y) }
const label = (html: string, x = W / 2, y = 8) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${html}</div>`)
const cam = new THREE.PerspectiveCamera(32, W / H, 0.02, 60)
const look = (px: number, py: number, pz: number, tx: number, ty: number, tz: number) => { cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz) }
/** 把 AI 状态逐帧喂给渲染层，让片段推进 / 混合与游戏里一致 */
const animate = (secs: number, each?: () => void) => { for (let t = 0; t < secs; t += DT) { each?.(); tick(); const e = fer(); place(e); animateFerrenEntity(ferret, e, DT, 0, eng.ferrenRun.tuck !== null && eng.ferrenRun.tuck === F.sleepSessionKey(eng.ferrenRun.clock)) } }
const show = (always = false) => { player.visible = always || Math.hypot(eng.player.x - CX, eng.player.y - CY) < 6; placePlayer() }

let tiles: { cam: THREE.PerspectiveCamera; draw: () => void; flash: number; text: string }[] | null = null
if (mode === 'sleep') {
  setPhase('sleep', 0.2)
  until(() => fer().fr?.act === 'nestSleep', 40)
  animate(1)
  eng.player.x = fer().x + 0.75; eng.player.y = fer().y - 0.55
  const can = F.ferrenSpecial(eng)
  press(); animate(1.5)
  info.special = can?.label; info.tuck = eng.ferrenRun.tuck; info.status = F.ferrenStatusText(eng, fer())
  eng.player.x = 330; eng.player.y = 158; show()
  look(FERREN_CAGE.nest.x + 0.85, 0.85, FERREN_CAGE.nest.y - 0.9, FERREN_CAGE.nest.x, 0.06, FERREN_CAGE.nest.y)
  label(`Ferren 窝里睡觉 · 按 X「${can?.label ?? '-'}」之后<br><span class="s">${info.status}</span>`)
} else if (mode === 'eat') {
  setPhase('meal', 0.15, 2)
  until(() => fer().fr?.act === 'eat', 30)
  animate(2.3)
  eng.player.x = 330; eng.player.y = 158; show()
  info.status = F.ferrenStatusText(eng, fer())
  const e = fer()
  const fx = Math.cos(e.facing), fy = Math.sin(e.facing), sx = -fy, sy = fx // 侧面机位：看得到他低头对着食盆
  look(e.x + sx * 1.35 + fx * 0.2, 0.75, e.y + sy * 1.35 + fy * 0.2, (e.x + FERREN_CAGE.bowl.x) / 2, 0.07, (e.y + FERREN_CAGE.bowl.y) / 2)
  info.facingToBowl = +Math.abs(Math.atan2(FERREN_CAGE.bowl.y - e.y, FERREN_CAGE.bowl.x - e.x) - e.facing).toFixed(2)
  label(`Ferren 食盆进食<br><span class="s">${info.status}</span>`)
} else if (mode === 'play') {
  setPhase('play', 0.3)
  F.FR.SPONT_RATE = 0
  until(() => fer().fr?.act === 'idle', 10)
  eng.player.x = 336.7; eng.player.y = 148.3
  until(() => fer().fr?.act === 'rub', 20)
  animate(1.2)
  show()
  info.status = F.ferrenStatusText(eng, fer()); info.special = F.ferrenSpecial(eng)?.label
  look(CX + 3.6, 2.9, CY + 4.0, CX + 0.2, 0.55, CY - 0.4)
  label(`娱乐时间：玩家进笼，Ferren 跟过来蹭 · X =「${info.special}」<br><span class="s">${info.status}</span>`)
} else {
  // 切行带人：娱乐时贴着他（0.5 m），自发切行到笼外——6 格依次是缩团 / 闪烁发光 / 消失换位（全白）/ 落地 / 闪白褪去 / 回过神
  setPhase('play', 0.25)
  F.FR.SPONT_RATE = 0
  animate(1)
  eng.player.x = fer().x + 0.5; eng.player.y = fer().y
  fer().fr!.spontCd = 0; F.FR.SPONT_RATE = 1e6; tick(); F.FR.SPONT_RATE = 0
  const n0 = fer().fr!.noclip!
  info.from = [+fer().x.toFixed(2), +fer().y.toFixed(2)]; info.dest = [+n0.dx.toFixed(2), +n0.dy.toFixed(2)]
  const marks = [0.5, 1.15, 1.42, 1.9, 2.5, 3.9]
  const snaps: { t: number; flash: number; san: number; text: string; cam: THREE.PerspectiveCamera; state: () => void }[] = []
  const recorded: { fx: number; fy: number; ff: number; px: number; py: number; flash: number; san: number; fr: any; t: number }[] = []
  let t = DT
  for (const mk of marks) {
    for (; t < mk; t += DT) { const done = fer().fr?.noclip?.done; if (!done) { eng.player.x = fer().x + 0.5; eng.player.y = fer().y } tick(); const e = fer(); place(e); animateFerrenEntity(ferret, e, DT, 0, false) }
    const e = fer()
    recorded.push({ fx: e.x, fy: e.y, ff: e.facing, px: eng.player.x, py: eng.player.y, flash: eng.ferrenRun.flash, san: eng.player.sanity, fr: e.fr, t })
    // 这一刻的姿势存下来（克隆网格太重：直接截这一格）
    const c = new THREE.PerspectiveCamera(36, (W / 3) / ((H - 40) / 2), 0.02, 60)
    // 跟拍：机位跟着 Ferren 当前所在（换位前在笼里，换位后在落点）
    c.position.set(e.x + 1.9, 2.3, e.y + 2.6); c.lookAt(e.x - 0.1, 0.35, e.y)
    snaps.push({ t, flash: eng.ferrenRun.flash, san: eng.player.sanity, text: `t=${t.toFixed(2)}s · ${e.fr?.noclip ? (e.fr.noclip.done ? '已换位（落点）' : '切行中（笼里）') : '切行结束'} · 闪白 ${eng.ferrenRun.flash.toFixed(2)} · 理智 ${eng.player.sanity} · 玩家离他 ${Math.hypot(eng.player.x - e.x, eng.player.y - e.y).toFixed(2)} m`, cam: c, state: () => {} })
    // 立即画这一格到离屏目标
    show(true)
    const rt = new THREE.WebGLRenderTarget(Math.floor(W / 3), Math.floor((H - 40) / 2)); rt.texture.colorSpace = THREE.SRGBColorSpace
    renderer.setRenderTarget(rt); renderer.render(scene, c); renderer.setRenderTarget(null)
    ;(snaps.at(-1) as any).rt = rt
  }
  info.carried = eng.ferrenRun.carried; info.frames = recorded.map((r) => ({ t: +r.t.toFixed(2), flash: +r.flash.toFixed(2), san: r.san, ferren: [+r.fx.toFixed(2), +r.fy.toFixed(2)], player: [+r.px.toFixed(2), +r.py.toFixed(2)] }))
  info.msg = msgs.at(-1)
  // 拼 3×2：每格把离屏图贴到全屏四边形上 + 闪白层
  const quadScene = new THREE.Scene(), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 2)
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: null, toneMapped: false })); quad.position.z = -0.8; quadScene.add(quad)
  const white = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: '#f7f6ff', transparent: true, opacity: 0, toneMapped: false, depthTest: false })); white.position.z = -0.4; white.renderOrder = 2; quadScene.add(white)
  tiles = snaps.map((s) => ({ cam: s.cam, flash: s.flash, text: s.text, draw: () => { (quad.material as THREE.MeshBasicMaterial).map = (s as any).rt.texture; (quad.material as THREE.MeshBasicMaterial).needsUpdate = true; (white.material as THREE.MeshBasicMaterial).opacity = Math.min(1, s.flash) * 0.92; renderer.render(quadScene, ortho) } }))
  label(`切行带人：贴着 Ferren（0.5 m）时他自发切行——玩家一起被带走，落在他旁边（闪白层 = HUD 的 data-ferren-flash）`, W / 2, 4)
  const tw = Math.floor(W / 3), th = Math.floor((H - 40) / 2)
  tiles.forEach((tl, i) => label(`<span class="s">${tl.text}</span>`, (i % 3) * tw + tw / 2, 40 + Math.floor(i / 3) * th + th - 26))
  info.msgs = msgs.slice(-3)
}
;(window as any).__info = info

const t0 = performance.now()
const loop = () => {
  if (tiles) {
    const tw = Math.floor(W / 3), th = Math.floor((H - 40) / 2)
    renderer.setScissorTest(true); renderer.autoClear = false
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.setClearColor('#111'); renderer.clear()
    tiles.forEach((tl, i) => { const x = (i % 3) * tw, y = H - 40 - (Math.floor(i / 3) + 1) * th; renderer.setViewport(x + 2, y + 2, tw - 4, th - 4); renderer.setScissor(x + 2, y + 2, tw - 4, th - 4); tl.draw() })
  } else renderer.render(scene, cam)
  if (performance.now() - t0 < 1500) requestAnimationFrame(loop); else (window as any).__ready = true
}
loop()
