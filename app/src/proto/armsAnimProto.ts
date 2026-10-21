// 原型页（第 2 阶段动画）：「手臂」（Entité 15-FR「Les Bras」）。
//   ?anim=<lurk|emerge|search|lunge|grab|drag|swallow|flinch|burnRetreat|spit|loop|attack>
//   &t=<秒>      固定在该时刻（不带 t 时实时循环播放）
//   &view=<side|player|under|close|vent2>   机位（默认按片段选）
//   &hud=min 只显示片段名（GIF 用）；&real=1 真实材质；&cpu=1 CPU 蒙皮替身（无头 SwiftShader 截图必开）；&seed=N
//   window.__render(t)：确定性重绘到时刻 t（动画器从 0 起以 1/60s 固定步长回放；道具/烟雾也只由 t 决定）
import * as THREE from 'three'
import { armsBudget, armsDebris, armsRig, armsVent, ARMS_VENT_DROP, buildArmsBurntDebris, buildArmsMesh, buildArmsVent, type ArmsRig } from '../game/renderer/armsMesh'
import { ARMS_CLIPS, ARMS_SEQUENCES, ArmsAnimator, armsClipDur, armsClipPose, armsGripPoint, armsLocalToWorld, armsPose, armsReplay, armsSequenceSegment, armsWorldToLocal, poseArms, type ArmsClip, type ArmsClipName, type ArmsClipOpts } from '../game/renderer/armsAnim'
import { setMaterialMode } from '../game/renderer/shared'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const CLIP = (Q.get('anim') || 'loop') as ArmsClipName
const real = Q.get('real') === '1'
const seed = +(Q.get('seed') ?? 3)
if (real) setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
if (real) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1 }
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#0b0b0a')
const lab = document.getElementById('lab')!
const CEIL = 3.0, MOUTH = CEIL - ARMS_VENT_DROP
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const R = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })() // 确定性随机（贴图噪点）

// ---------------------------------------------------------------------------- 场景
function concreteTex(base: string, n = 5000, rep = 4) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256
  const g = cv.getContext('2d')!; g.fillStyle = base; g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < n; i++) { const v = R() * 60 - 30; g.fillStyle = `rgba(${128 + v},${126 + v},${120 + v},0.18)`; g.fillRect(R() * 256, R() * 256, 1 + R() * 3, 1 + R() * 3) }
  for (let i = 0; i < 20; i++) { const x = R() * 256, y = R() * 256, r = 30 + R() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,38,34,0.12)'); gr.addColorStop(1, 'rgba(40,38,34,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r) }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; return t
}
{
  const size = 16
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: concreteTex('#6b6862', 6000, 6) })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
  const ce = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: concreteTex('#8a8781', 5000, 6) })); ce.rotation.x = Math.PI / 2; ce.position.y = CEIL; scene.add(ce)
  const wm = new THREE.MeshLambertMaterial({ map: concreteTex('#7a776f', 5000, 4) })
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(size, CEIL), wm); bw.position.set(0, CEIL / 2, -2.6); scene.add(bw)
  const lw = new THREE.Mesh(new THREE.PlaneGeometry(size, CEIL), wm); lw.rotation.y = Math.PI / 2; lw.position.set(-4.2, CEIL / 2, 0); scene.add(lw)
  // 远处一根柱子 + 地面一条排水沟，让空间有参照
  const pil = new THREE.Mesh(new THREE.BoxGeometry(0.5, CEIL, 0.5), wm); pil.position.set(2.4, CEIL / 2, -1.2); scene.add(pil)
}
// 主风口（玩家在它的 +Z 方向，格栅铰链在 -Z 边）
const vent = buildArmsVent(); vent.position.set(0, CEIL, 0); scene.add(vent)
const arms = buildArmsMesh(3, seed); armsVent(vent)!.anchor.add(arms)
const rig = armsRig(arms)!
// 另一个风口（spit：从远处的风口吐出玩家），+Z 朝向房间中央
const vent2 = buildArmsVent(); vent2.position.set(-2.7, CEIL, 1.4); vent2.rotation.y = Math.PI / 2; scene.add(vent2)
const arms2 = buildArmsMesh(1, seed + 2); armsVent(vent2)!.anchor.add(arms2)
const rig2 = armsRig(arms2)!

/** 1.75m 简易人形道具：原点 = 胸口（抓握挂载点），身体在 -Y 方向 */
function human() {
  const m = new THREE.MeshLambertMaterial({ color: '#8f8a7e' }), dark = new THREE.MeshLambertMaterial({ color: '#4a5058' })
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); body.position.y = -1.23
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 4, 10), dark); torso.position.y = 1.23; torso.scale.z = 0.62; body.add(torso)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m); head.position.y = 1.64; body.add(head)
  const legs: THREE.Object3D[] = []
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.78, 4, 8), new THREE.MeshLambertMaterial({ color: '#3b3a37' })); leg.position.set(s * 0.09, 0.45, 0); body.add(leg); legs.push(leg)
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.56, 4, 8), dark); arm.position.set(s * 0.23, 1.15, 0); body.add(arm); legs.push(arm)
  }
  // 手电筒（右手）
  const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.16, 10), new THREE.MeshLambertMaterial({ color: '#222' })); fl.rotation.x = Math.PI / 2; fl.position.set(0.23, 0.9, 0.08); body.add(fl)
  g.userData.limbs = legs
  return g
}
const prop = human(); scene.add(prop)
const P0 = V3(0, 1.23, 2.1) // 站立时胸口世界坐标
prop.rotation.y = Math.PI // 面朝风口（-Z）

// 灯光：L1 无灯区段——很暗的环境光 + 远处冷色应急灯；玩家手电（burnRetreat 时为强光）
scene.add(new THREE.HemisphereLight('#c4c1b6', '#2a2722', 0.85))
const emerg = new THREE.PointLight('#d6dcd8', 7, 10, 1.4); emerg.position.set(2.2, 2.2, 3.0); scene.add(emerg)
const rim = new THREE.PointLight('#b4ad9c', 4, 7, 1.5); rim.position.set(-1.6, 2.3, -1.0); scene.add(rim)
const key = new THREE.DirectionalLight('#e8e2d4', 0.9); key.position.set(4, 1.2, 3); scene.add(key)
const torch = new THREE.SpotLight('#fff4e2', 0, 14, 0.42, 0.5, 1.2); scene.add(torch, torch.target)
// 可见光柱（加色半透明圆锥），只在强光时显示
const beam = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.6, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#fff1d0', transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
beam.geometry.translate(0, -1.3, 0); beam.geometry.rotateX(-Math.PI / 2); scene.add(beam)
let debris: THREE.Object3D | null = null

// ---------------------------------------------------------------------------- 机位
const cam = new THREE.PerspectiveCamera(52, W / H, 0.03, 40)
const DEFAULT_VIEW: Record<string, string> = { lurk: 'under', emerge: 'under', search: 'player', lunge: 'side', grab: 'close', drag: 'side', swallow: 'side', flinch: 'side', burnRetreat: 'player', spit: 'vent2', loop: 'side', attack: 'side' }
const VIEW = Q.get('view') ?? DEFAULT_VIEW[CLIP] ?? 'side'
function placeCamera(grip: THREE.Vector3 | null, spitMode: boolean) {
  let view = VIEW
  if ((CLIP === 'loop' || CLIP === 'attack') && spitMode && view === 'side') view = 'vent2'
  cam.fov = 52
  if (view === 'side') { cam.position.set(3.9, 1.7, 1.15); cam.lookAt(0, 1.7, 0.95) }
  else if (view === 'player') { cam.position.set(1.15, 1.95, 3.75); cam.lookAt(-0.1, 1.85, 0.3) }
  else if (view === 'under') { cam.fov = 60; cam.position.set(0.85, 1.05, 1.7); cam.lookAt(0, 2.45, 0.05) }
  else if (view === 'close') { // 从抓取方向的侧面看手（与「管口→抓握点」水平方向垂直）
    const g = grip ?? V3(0, 1.4, 1.6), d = g.clone().sub(V3(0, MOUTH, 0)); d.y = 0; d.normalize()
    const side = V3(-d.z, 0, d.x)
    cam.position.copy(g).addScaledVector(side, 0.8).addScaledVector(d, -0.85); cam.position.y += 0.12
    cam.lookAt(g.x - d.x * 0.15, g.y + 0.1, g.z - d.z * 0.15); cam.fov = 48
  }
  else if (view === 'floor') { cam.fov = 62; cam.position.set(1.8, 1.3, 2.3); cam.lookAt(0, 1.2, 0) }
  else if (view === 'vent2') { cam.position.set(1.35, 1.55, 3.6); cam.lookAt(-1.6, 1.55, 1.3) }
  else if (view === 'wide') { cam.position.set(4.2, 2.0, 4.6); cam.lookAt(-0.6, 1.4, 0.6) }
  cam.updateProjectionMatrix()
}

// ---------------------------------------------------------------------------- 时间线
const optsMain = (): ArmsClipOpts => ({ count: 3, lead: 0, target: armsWorldToLocal(rig, P0) })
const optsSpit: ArmsClipOpts = { count: 1, lead: 0 }
interface Seg { clip: ArmsClip; local: number; index: number; start: number }
const isSeq = CLIP === 'loop' || CLIP === 'attack'
function segAt(t: number): Seg {
  if (isSeq) return armsSequenceSegment(CLIP as 'loop' | 'attack', t)
  return { clip: CLIP as ArmsClip, local: t, index: 0, start: 0 }
}
/** 主风口与第二风口的姿态（确定性回放，动画器从 0 起 1/60s 步长）；序列里 spit 段由第二个风口播放，主风口此时保持潜伏 */
function poseMain(t: number) {
  if (!isSeq) return CLIP === 'spit' ? armsPose(3) : armsReplay(CLIP, t, optsMain())
  // 序列：主风口在 spit 段替换成 lurk（同样经动画器平滑）
  return armsReplayCustom(t, (u) => { const s = segAt(u); return s.clip === 'spit' ? armsClipPoseSafe('lurk', s.local, optsMain()) : armsClipPoseSafe(s.clip, s.local, optsMain()) }, 3)
}
function poseSpit(t: number) {
  if (!isSeq) return CLIP === 'spit' ? armsReplay('spit', t, optsSpit) : armsPose(1)
  return armsReplayCustom(t, (u) => { const s = segAt(u); return s.clip === 'spit' ? armsClipPoseSafe('spit', s.local, optsSpit) : armsPose(1) }, 1)
}
function armsClipPoseSafe(c: ArmsClip, t: number, o: ArmsClipOpts) { return armsClipPose(c, t, o) }
function armsReplayCustom(t: number, fn: (u: number) => ReturnType<typeof armsPose>, count: number) {
  const dt = 1 / 60, an = new ArmsAnimator(count, fn(0))
  const n = Math.round(Math.max(0, t) / dt)
  for (let i = 1; i <= n; i++) { an.target = fn(i * dt); an.update(dt) }
  return an.pose
}

// ---------------------------------------------------------------------------- 道具（只由 t 决定）
const _g = new THREE.Vector3()
function gripAt(r: ArmsRig, poseFn: (t: number) => ReturnType<typeof armsPose>, t: number) {
  poseArms(r, poseFn(t), t); scene.updateMatrixWorld(true); return armsGripPoint(r, 0, new THREE.Vector3())
}
function setProp(chest: THREE.Vector3, tiltX: number, scale = 1, visible = true, yaw = Math.PI) {
  prop.visible = visible && scale > 0.02
  prop.position.copy(chest); prop.rotation.set(0, yaw, 0); prop.rotateX(tiltX); prop.scale.setScalar(Math.max(0.02, scale))
}
/** 被抓着悬吊：胸口挂在抓握点，脚沿拖拽方向拖后；胸口低于 1.23m 时身体倾斜让脚落在地面上 */
function hang(chest: THREE.Vector3, trail: number) {
  const h = chest.y
  const lean = h < 1.23 ? Math.acos(Math.min(1, Math.max(0.2, h) / 1.23)) : 0
  setProp(chest, lean + trail)
}
function updateProp(t: number, seg: Seg) {
  const c = seg.clip, u = seg.local
  torch.intensity = 0; beam.material.opacity = 0
  // 序列里：被吞之后到吐出之前道具不在场；吐出之后躺在地上，直到下一次出动时爬起来
  let afterSwallow = false, afterSpit = false
  if (CLIP === 'loop') { // ARMS_SEQUENCES.loop：6 swallow → 7 lurk → 8 spit → 9 lurk → 10 emerge
    afterSwallow = seg.index === 7
    afterSpit = seg.index === 9 || seg.index === 10
  }
  const standing = () => setProp(P0, 0)
  if (afterSwallow) { prop.visible = false; return }
  if (afterSpit) { // 躺在落点；下一次 emerge 前 1.5s 爬起来
    const land = spitLanding()
    const up = seg.index === 10 ? THREE.MathUtils.smoothstep(u, 0.2, 2.0) : 0
    setProp(land.pos.clone().lerp(P0, up), land.tilt * (1 - up), 1, true, Math.PI + (land.yaw - Math.PI) * (1 - up))
    return
  }
  switch (c) {
    case 'drag': { const g = gripAt(rig, poseMain, t); hang(g, -0.25 * THREE.MathUtils.smoothstep(u, 0, 1.2) + 0.05 * Math.sin(u * 7)); break }
    case 'swallow': {
      const g = gripAt(rig, poseMain, t)
      const k = THREE.MathUtils.clamp((MOUTH - 0.12 - g.y) / 0.75, 0, 1)
      hang(g, -0.15); prop.scale.setScalar(Math.max(0.02, k)); prop.visible = k > 0.03
      break
    }
    case 'grab': {
      // 爪扣上之前站立；扣紧后被轻轻提起（胸口跟着抓握点）
      if (u < 0.3) standing()
      else { const g = gripAt(rig, poseMain, t); g.lerp(P0, 1 - THREE.MathUtils.smoothstep(u, 0.3, 0.6)); hang(g, 0) }
      break
    }
    case 'flinch': {
      const rel = ARMS_CLIPS.flinch.events.release
      if (u < rel) { const g = gripAt(rig, poseMain, t); hang(g, 0) }
      else { const k = THREE.MathUtils.smoothstep(u, rel, rel + 0.5); const p = P0.clone(); p.z += 0.35 * k; p.y -= 0.12 * Math.sin(Math.PI * Math.min(1, k)); setProp(p, -0.25 * Math.sin(Math.PI * k)) }
      break
    }
    case 'burnRetreat': {
      standing()
      // 玩家举起手电：强光照向手臂
      const on = THREE.MathUtils.smoothstep(u, 0, 0.08) * (1 - THREE.MathUtils.smoothstep(u, 2.05, 2.35))
      const src = V3(P0.x + 0.18, 1.45, P0.z - 0.15), aim = V3(0, MOUTH - 0.85, 0.35)
      torch.position.copy(src); torch.target.position.copy(aim); torch.intensity = 60 * on
      beam.position.copy(src); beam.lookAt(aim); beam.material.opacity = 0.11 * on
      break
    }
    case 'spit': {
      const ev = ARMS_CLIPS.spit.events.release
      const S = segStartFor(t, u)
      if (u < ev) {
        const g = gripAt(rig2, poseSpit, t)
        const m2 = armsLocalToWorld(rig2, V3(0, 0, 0))
        const k = THREE.MathUtils.clamp((m2.y - 0.1 - g.y) / 0.7, 0, 1)
        hang(g, 0); prop.rotation.y = -Math.PI / 2; prop.scale.setScalar(Math.max(0.02, k)); prop.visible = k > 0.03
      } else {
        const land = spitLanding(), fall = ballistic(S, u - ev)
        setProp(fall.pos, fall.tilt, 1, true, land.yaw)
      }
      break
    }
    default: standing()
  }
}
let landingCache: { pos: THREE.Vector3; tilt: number; yaw: number; g0: THREE.Vector3; v0: THREE.Vector3 } | null = null
function segStartFor(t: number, u: number) { return t - u }
/** spit 的释放瞬间（第二风口的抓握点与速度）→ 抛物线落地 → 躺倒 */
function spitRelease(segStart: number) {
  if (landingCache) return landingCache
  const ev = ARMS_CLIPS.spit.events.release
  const g0 = gripAt(rig2, poseSpit, segStart + ev), gm = gripAt(rig2, poseSpit, segStart + ev - 0.06)
  const v0 = g0.clone().sub(gm).multiplyScalar(1 / 0.06)
  landingCache = { pos: V3(0, 0, 0), tilt: -Math.PI / 2, yaw: -Math.PI / 2, g0, v0 }
  const f = ballisticRaw(g0, v0, 9)
  landingCache.pos.copy(f.pos)
  return landingCache
}
function ballisticRaw(g0: THREE.Vector3, v0: THREE.Vector3, tau: number) {
  const g = 9.8, floorY = 0.2
  // 落地时刻：y(τ) = g0.y + v0.y τ − ½gτ² = floorY
  const a = 0.5 * g, b = -v0.y, cc = floorY - g0.y
  const tl = (-b + Math.sqrt(b * b - 4 * a * cc)) / (2 * a)
  const tt = Math.min(tau, tl)
  const pos = V3(g0.x + v0.x * tt * 0.6, g0.y + v0.y * tt - 0.5 * g * tt * tt, g0.z + v0.z * tt * 0.6)
  pos.y = Math.max(floorY, pos.y)
  const k = THREE.MathUtils.smoothstep(tau, 0, tl + 0.12)
  return { pos, tilt: -Math.PI / 2 * k - 0.3 * (1 - k), landed: tau >= tl }
}
function spitLanding() { const r = landingCache ?? spitRelease(spitSegStart()); return { pos: r.pos, tilt: -Math.PI / 2, yaw: r.yaw } }
function ballistic(segStart: number, tau: number) { const r = spitRelease(segStart); return ballisticRaw(r.g0, r.v0, tau) }
function spitSegStart() {
  if (!isSeq) return 0
  let s = 0; for (const x of (CLIP === 'loop' ? LOOP_SEQ() : [])) { if (x.clip === 'spit') return s; s += x.dur }
  return 0
}
const LOOP_SEQ = () => ARMS_SEQUENCES.loop

function updateDebris(t: number, seg: Seg) {
  // 焦皮碎片：burnRetreat 的 debris 时刻之后出现在格栅正下方，并在后续片段里继续冒烟（烟只由 t 决定）
  let t0 = -1
  if (seg.clip === 'burnRetreat') t0 = seg.start + ARMS_CLIPS.burnRetreat.events.debris
  else if (isSeq && CLIP === 'loop' && seg.index === ARMS_SEQUENCES.loop.length - 1) t0 = seg.start - ARMS_SEQUENCES.loop[seg.index - 1].dur + ARMS_CLIPS.burnRetreat.events.debris
  if (debris) { scene.remove(debris); debris = null }
  if (t0 < 0 || t < t0) return
  debris = buildArmsBurntDebris(seed); debris.position.set(0.05, 0, 0.12); scene.add(debris)
  const h = armsDebris(debris)!
  const age = t - t0
  h.update(age); h.setSmoke(Math.min(1, age / 0.4)); h.setEmber(0.6 * Math.exp(-age * 0.6) + 0.15)
}

// ---------------------------------------------------------------------------- 渲染
let budget = armsBudget(vent)
const caption = (seg: Seg, t: number) => {
  const info = ARMS_CLIPS[seg.clip]
  if (Q.get('hud') === 'min') { lab.innerHTML = `<div class="l" style="left:10px;top:6px;transform:none;text-align:left;font-size:14px">${seg.clip}<span class="s">&emsp;${info.label}</span></div>`; return }
  lab.innerHTML = `<div class="l" style="left:14px;top:10px;transform:none;text-align:left">${isSeq ? `${CLIP} · ` : ''}${seg.clip}<span class="s">&emsp;${info.label}</span><br><span class="s">t=${t.toFixed(2)}s${isSeq ? `（片段内 ${seg.local.toFixed(2)}s / ${info.dur}s）` : ` / ${armsClipDur(CLIP).toFixed(1)}s`} · 机位 ${VIEW}</span></div>` +
    `<div class="l" style="right:14px;left:auto;top:10px;transform:none"><span class="s">${budget.meshes} 网格 / ${budget.draws} 次绘制 / ${budget.tris} 三角面 / ${budget.bones} 骨骼${QA_CPU_SKIN ? ' · CPU 蒙皮' : ' · GPU 蒙皮'}${real ? ' · 真实材质' : ' · 经典材质'}</span></div>`
}
function renderAt(t: number) {
  const seg = segAt(t)
  const spitMode = (seg.clip === 'spit')
  // 道具需要的抓握点会临时摆姿，所以先算道具，最后再摆当前时刻
  updateProp(t, seg)
  poseArms(rig, poseMain(t), t)
  poseArms(rig2, poseSpit(t), t)
  scene.updateMatrixWorld(true)
  updateDebris(t, seg)
  const grip = armsGripPoint(rig, 0)
  placeCamera(seg.clip === 'grab' || seg.clip === 'flinch' ? grip : (VIEW === 'close' ? grip : null), spitMode)
  caption(seg, t)
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
  let retries = 0
  for (; retries < 6; retries++) {
    renderer.render(scene, cam)
    const bad = (renderer.info.programs ?? []).some((p) => (p as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false)
    if (!bad) break
  }
  return retries
}
budget = armsBudget(vent); void _g
const w = window as unknown as Record<string, unknown>
w.__render = (t: number) => { const r = renderAt(t); w.__t = t; w.__retries = r; w.__ready = true; return r }
w.__budget = budget
w.__dur = armsClipDur(CLIP)
const tq = Q.get('t')
if (tq !== null) (w.__render as (t: number) => number)(+tq)
else {
  const dur = armsClipDur(CLIP), start = performance.now()
  const loop = () => { const t = ((performance.now() - start) / 1000) % (dur + (isSeq ? 0 : 0.8)); renderAt(Math.min(t, dur)); requestAnimationFrame(loop) }
  w.__ready = true
  loop()
}
