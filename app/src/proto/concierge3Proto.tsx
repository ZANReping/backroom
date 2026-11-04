/* eslint-disable @typescript-eslint/no-explicit-any -- 预览页直接拼假实体 / 假引擎 */
// [concierge] 看门人（Entity 131）阶段 3 场景预览（proto-concierge3.html，必须 ?cpu=1）：
//   用 conciergeAI 的状态结构（ConciergeEntState：mode / clip / modeT / gaze / lift / struggle）驱动游戏里同一条渲染路径
//   （conciergeRender.buildConciergeEntityMesh + animateConciergeEntity：LOD、前台、远处升降梯、片段混合），
//   HUD 用真实的 ConciergeHud（挂眼 / 挣脱条 / 13 楼黑屏），图鉴用真实的 ConciergeCodexFile。
//   ?shot=desk|eye|talk|tackle|bind|drag|stuff|rope|black|wake|codex[&part=0|1]
//   场景是示意布景（地毯 / 墙纸 / 吊灯），不是游戏里的 L5 生成地图。
import '../game/engine' // 先按游戏的顺序把引擎图求值完（直接从 conciergeAI 进入会撞上 infinite ↔ infiniteL2 的循环引用 TDZ）
import * as THREE from 'three'
import { createRoot } from 'react-dom/client'
import '../index.css'
import ConciergeHud from '@/components/ConciergeHud'
import ConciergeCodexFile from '@/components/ConciergeCodexFile'
import { buildConciergeEntityMesh, animateConciergeEntity } from '../game/renderer/conciergeRender'
import { CONCIERGE_CLIPS, conciergeHandPoint, type ConciergeClip } from '../game/renderer/conciergeAnim'
import type { ConciergeRig } from '../game/renderer/conciergeMesh'
import { CC, conciergeDebug, conciergeGlobal, type ConciergeEntState, type ConciergeMode } from '../game/engine/conciergeAI'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const shot = Q.get('shot') ?? 'desk'
const W = innerWidth, H = innerHeight
const cap = document.getElementById('cap')!
const done = (info: Record<string, unknown> = {}) => requestAnimationFrame(() => requestAnimationFrame(() => { (window as any).__info = { shot, cpu: QA_CPU_SKIN, ...info }; (window as any).__ready = true }))
const CAPS: Record<string, [string, string]> = {
  desk: ['前台待机（1F 主厅）', 'mode=desk · idle · 目光跟着住客 · 台上话筒 + 盘好的螺旋电话线'],
  eye: ['追踪中 · 视野边缘闪眼', `mode=track · 被注视时站定抬前臂 armWatch · HUD 挂眼 ${CC.eyeShow}s / ${CC.eyeEvery[0]}–${CC.eyeEvery[1]}s 一次`],
  talk: ['拦截搭话', `朝真出口走 → 眨眼瞬移到身后 · ${CC.talkT}s 不表态或走开 ${CC.talkLeave}m = 拒绝`],
  tackle: ['扑倒', `追逐 ${CC.run}/${CC.rageRun} m/s → 扑倒 ${CC.tackleDmg} 伤害 · ${CC.tackleWin}s 内连按 ${CC.tackleNeed} 下挣开`],
  bind: ['捆绑', `${CC.bindT}s 内连按 ${CC.bindNeed} 下（每秒衰减 ${CC.bindDecay}）挣脱`],
  drag: ['拖行', `单手拖着倒退 ${CC.drag} m/s → 最近的送菜升降梯（墙里的小木厢）`],
  stuff: ['塞进送菜升降梯', 'stuffLift · 2.75 s 拉门关上 → 黑屏开始'],
  rope: ['拉绳', 'pullRope · 绳子一下一下往上拽 → wipeHands 擦手回岗'],
  black: ['13 楼 · 黑屏', `${CC.blackDur}s 黑屏 + 每 ${CC.ropeEvery}s 一声拉绳`],
  wake: ['员工通道醒来', `钥匙全丢 · HP −${CC.liftHp} · 理智 −${CC.liftSanity} · 关注度 +${CC.liftAttn} · 随机 1–12 层`],
  codex: ['图鉴 · Entity 131 员工档案', 'ConciergeCodexFile（tier 3 全解锁 + 前台记录）'],
}
const [c1, c2] = CAPS[shot] ?? [shot, '']
cap.innerHTML = `${c1}<span class="s">${c2}${Q.get('part') ? ' · ' + (Q.get('part') === '0' ? '上半' : '下半') : ''}</span>`

// ---------- 图鉴 ----------
if (shot === 'codex') {
  document.body.style.background = '#0b0a08'
  document.body.style.overflow = 'hidden'; cap.style.background = '#0b0a08'; cap.style.borderBottom = '1px solid #3a2e1c'
  const save = { met: 1, talks: 4, follows: 1, chases: 3, binds: 2, escapes: 1, lifts: 1, gnaws: 2, key437: 1 }
  const eng: any = { hotel: { concierge: save } }
  const part = Number(Q.get('part') ?? 0)
  const ui = document.getElementById('ui')!
  ui.style.cssText = `position:absolute;left:50%;top:${44}px;width:${Math.min(620, W - 40)}px;transform:translateX(-50%)`
  createRoot(ui).render(<ConciergeCodexFile engine={eng} tier={3} met={6} />)
  setTimeout(() => {
    const el = ui.firstElementChild as HTMLElement
    const h = el.getBoundingClientRect().height
    if (part === 1) ui.style.top = `${Math.min(44, H - h - 10)}px`; if (part === 1) (ui.style as any).zIndex = '1'; cap.style.zIndex = '80'
    done({ codexH: Math.round(h) })
  }, 400)
} else scene3d()

function scene3d() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.prepend(renderer.domElement)
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#1c1410'); scene.fog = new THREE.Fog('#1c1410', 9, 26)
  // —— 布景：酒红地毯 + 墙纸 + 护墙板 + 天花 ——
  const tex = (draw: (c: CanvasRenderingContext2D, s: number) => void, s = 128, rep = 1) => { const cv = document.createElement('canvas'); cv.width = cv.height = s; draw(cv.getContext('2d')!, s); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.colorSpace = THREE.SRGBColorSpace; return t }
  const carpet = tex((c, s) => { c.fillStyle = '#5a1a16'; c.fillRect(0, 0, s, s); c.strokeStyle = '#a07a3a'; c.lineWidth = 3; c.strokeRect(10, 10, s - 20, s - 20); c.fillStyle = '#7a2a20'; c.beginPath(); c.arc(s / 2, s / 2, 22, 0, 7); c.fill() }, 128, 20)
  const paper = tex((c, s) => { c.fillStyle = '#5b4a30'; c.fillRect(0, 0, s, s); c.fillStyle = '#6e5a3a'; for (let i = 0; i < 4; i++) c.fillRect(i * 32 + 10, 0, 6, s); c.fillStyle = '#8a7046'; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(i * 32 + 13, j * 32 + 16, 4, 0, 7); c.fill() } }, 128, 1)
  paper.repeat.set(12, 2)
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; scene.add(fl)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#3a2c20', roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 3.2; scene.add(ceil)
  const wallMat = new THREE.MeshStandardMaterial({ map: paper, roughness: 1 }), wainMat = new THREE.MeshStandardMaterial({ color: '#3a2416', roughness: 0.7 })
  const wall = (x: number, z: number, ry: number, len: number) => {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), wallMat); w.position.set(x, 1.6, z); w.rotation.y = ry; w.receiveShadow = true; scene.add(w)
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.95, 0.04), wainMat); b.position.set(x, 0.475, z); b.rotation.y = ry; b.translateZ(0.02); b.receiveShadow = true; scene.add(b)
  }
  scene.add(new THREE.HemisphereLight('#ffe9c8', '#3a1e14', 0.9))
  const key = new THREE.SpotLight('#ffd9a0', 26, 18, 0.9, 0.5, 1.6); key.position.set(1.2, 3.1, 2.2); key.target.position.set(0, 0.8, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; scene.add(key, key.target)
  const fill = new THREE.PointLight('#ffb070', 8, 10, 1.5); fill.position.set(-2.2, 2.6, 1.5); scene.add(fill)
  const bulb = (x: number, z: number) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff0c8' })); m.position.set(x, 3.0, z); scene.add(m) }
  const corridor = shot === 'eye' || shot === 'wake' || shot === 'drag' || shot === 'stuff' || shot === 'rope'
  if (corridor) { const hw = shot === 'wake' ? 0.85 : 1.6; wall(-hw, 0, Math.PI / 2, 40); wall(hw, 0, -Math.PI / 2, 40); for (let z = -12; z <= 12; z += 4) bulb(0, z) }
  else { wall(0, -3.2, 0, 24); wall(-6, 0, Math.PI / 2, 24); wall(6, 0, -Math.PI / 2, 24); bulb(-1.5, 1); bulb(1.8, 2.5) }
  if (shot === 'wake') { // 员工通道：墙上刷的字 + 冷一点的灯
    scene.background = new THREE.Color('#141210'); wallMat.map = null; wallMat.color.set('#5d5a50'); wainMat.color.set('#2c2a26'); carpet.repeat.set(1, 1); (fl.material as THREE.MeshStandardMaterial).map = null; (fl.material as THREE.MeshStandardMaterial).color.set('#3b3833')
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const c = cv.getContext('2d')!; c.fillStyle = '#d8d2c0'; c.font = 'bold 72px "Noto Sans CJK SC"'; c.textAlign = 'center'; c.fillText('仅供员工使用', 256, 92)
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 1 })); sign.position.set(0.84, 1.55, -2.6); sign.rotation.y = -Math.PI / 2; scene.add(sign)
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 40, 10), new THREE.MeshStandardMaterial({ color: '#6a5a48', metalness: 0.5, roughness: 0.6 })); pipe.rotation.x = Math.PI / 2; pipe.position.set(-0.7, 2.7, 0); scene.add(pipe)
    key.color.set('#d8e0ff'); key.intensity = 45; fill.intensity = 14; fill.position.set(0, 2.6, -3); key.position.set(0, 3.0, -1.5); key.target.position.set(0, 0.5, -4)
  }

  // —— 看门人：游戏同一条渲染路径；facing = π/2 → 实体组 rotation.y = −π/2，模型空间 = 世界空间（正面 +Z）——
  const grp = buildConciergeEntityMesh(); scene.add(grp)
  const e: any = { id: 3, x: 0, y: 0, z: 0, facing: Math.PI / 2, def: { type: 'concierge', hp: 9999 }, hp: 9999, dead: false, state: 'idle' }
  grp.position.set(0, 0, 0); grp.rotation.y = -e.facing
  const s: ConciergeEntState = { mode: 'desk', modeT: 0, clip: 'idle', seq: 1, rev: false, speed: 0, watched: false, gaze: null, blinkTo: null, blinkDone: false, after: 'talk', blinkCd: 2, struggle: 0, need: 0, lift: null, metal: null, rageT: 0, graceT: 0, lostT: 0, stuckT: 0, leadLose: 0, lead: null, phase: 0 }
  e.cg = s
  const pose = (mode: ConciergeMode, clip: ConciergeClip, t: number, extra: Partial<ConciergeEntState> = {}) => { Object.assign(s, { mode, clip, ...extra }); return t }
  let desk: { x: number; y: number; f: number } | null = null
  const cam = new THREE.PerspectiveCamera(Number(Q.get('fov') ?? 50), W / H, 0.02, 60)
  let T = 0
  let victim: ReturnType<typeof makeVictim> | null = null
  const hud: { eye?: boolean; black?: 'lift' | 'wake'; msgs?: [string, string][]; x?: string } = {}
  // 玩家 = 相机（第一人称镜头放在眼高 1.6 m）
  switch (shot) {
    case 'desk': desk = { x: 0, y: 0, f: Math.PI / 2 }; T = pose('desk', 'idle', 2.2, { gaze: [0.9, 1.55, 3.1] }); cam.position.set(1.15, 1.62, 3.3); cam.lookAt(-0.15, 1.15, 0.2); break
    case 'eye': T = pose('track', 'armWatch', 1.5, { gaze: [0.3, 1.6, 4.0], watched: true }); cam.position.set(0.3, 1.6, 4.0); cam.lookAt(0, 1.3, 0); hud.eye = true; break
    case 'talk': T = pose('talk', 'talk', 1.1, { gaze: [0.15, 1.6, 2.3] }); cam.position.set(0.15, 1.6, 2.3); cam.lookAt(0, 1.55, 0); cam.fov = 58; cam.updateProjectionMatrix()
      hud.msgs = [['lore', '看门人：「你需要帮助吗？我可以把宴会的方向指给你……」'], ['sys', '（X 跟他走 · 走开 = 拒绝）']]; hud.x = 'X  跟他走'; break
    case 'tackle': T = pose('tackle', 'trip', 1.1, { phase: 1, struggle: 3.2 }); victim = makeVictim('tackle'); cam.position.set(2.6, 1.7, 2.6); cam.lookAt(0, 0.35, 0.7); break
    case 'bind': T = pose('bind', 'bind', 2.0, { struggle: 4.6 }); victim = makeVictim('bind'); cam.position.set(2.3, 1.5, 2.5); cam.lookAt(0, 0.6, 0.35); break
    case 'drag': T = pose('drag', 'drag', 0.5, { speed: 0.64, lift: { x: 0, y: -3.2, f: Math.PI / 2 } }); victim = makeVictim('drag'); cam.position.set(1.35, 1.45, 3.4); cam.lookAt(0, 0.7, -0.4); break
    case 'stuff': T = pose('stuff', 'stuffLift', 2.2, { phase: 0, lift: { x: 0, y: 0.92, f: -Math.PI / 2 } }); victim = makeVictim('stuff'); cam.position.set(2.5, 1.45, -0.6); cam.lookAt(0.1, 0.95, 0.45); break
    case 'rope': T = pose('stuff', 'pullRope', 0.5, { phase: 1, speed: 0, lift: { x: 0, y: 0.92, f: -Math.PI / 2 } }); cam.position.set(2.4, 1.55, -1.3); cam.lookAt(0.2, 1.35, 0.35); break
    case 'black': hud.black = 'lift'; break
    case 'wake': hud.black = 'wake'; grp.visible = false; cam.position.set(0.1, 0.95, 1.5); cam.lookAt(0.3, 1.05, -3); cam.fov = 62; cam.updateProjectionMatrix()
      hud.msgs = [['lore', '黑暗里，绳子一下一下地往上拽。很久以后，轿厢停了。门外的走廊有人在哼歌。'], ['sys', '口袋轻了——身上的钥匙（2 件）都不见了。'], ['lore', '你在一条窄窄的员工通道里醒来，墙上刷着「仅供员工使用」。手腕上还有绳子勒过的印子。']]; break
  }
  if (victim) scene.add(victim.g)
  // 逐帧推进到 T（非循环片段用 modeT；循环片段按 speed 推进），让混合 / 二级动作稳定
  const rig = () => ((grp.userData.lod0 ? grp.userData.rig0 : grp.userData.rig1) as ConciergeRig)
  const C = CONCIERGE_CLIPS[s.clip]
  if (C.loop && C.speed && !s.speed) s.speed = Math.abs(C.speed)
  const steps = Math.max(20, Math.round(Math.min(T, 3) * 30))
  const t0 = performance.now()
  for (let i = 0; i <= steps; i++) {
    const t = T - (steps - i) / 30
    s.modeT = Math.max(0, t)
    animateConciergeEntity(grp, e as any, 1 / 30, 0, { desk, distance: 4 })
  }
  grp.updateMatrixWorld(true)
  if (victim) victim.update(rig(), s.clip, T)
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
  renderer.render(scene, cam)
  const animMs = Math.round(performance.now() - t0)

  // —— HUD（真实 ConciergeHud，喂一个只含查询所需字段的假引擎）——
  const eng: any = { map: { entities: [e], inf: {} }, time: 100, player: { x: 0, y: 0 }, levelDef: { id: 5 } }
  const w = conciergeDebug(eng) as any
  if (hud.eye) { w.eyeUntil = eng.time + CC.eyeShow * 0.5; w.eyeX = 3.5; w.eyeY = 38; w.eyeRot = 90 }
  const g = conciergeGlobal(eng) as any
  if (hud.black === 'lift') { g.blackDur = CC.blackDur; g.black = CC.blackDur - 2 }
  if (hud.black === 'wake') { g.wake = CC.wakeFade * 0.28 }
  if (shot === 'drag' || shot === 'stuff' || shot === 'rope') { /* struggle HUD 读 e.cg：drag / stuff = 「被捆住了」 */ }
  createRoot(document.getElementById('ui')!).render(<>
    <ConciergeHud engine={eng} isMobile={false} />
    {hud.msgs && <div className="msgs">{hud.msgs.map(([k, t]) => <div key={t} className={k === 'sys' ? 'sys' : k === 'dmg' ? 'dmg' : ''}>{t}</div>)}</div>}
    {hud.x && <div className="xbtn">{hud.x}</div>}
  </>)
  const lod = grp.userData.lod0 && (grp.userData.lod0 as THREE.Object3D).visible ? 0 : 1
  done({ mode: s.mode, clip: s.clip, t: T, lod, animMs })
}

/** 示意「人」（被扑 / 被捆 / 被拖 / 被塞）：几段胶囊（同 conciergeProto 阶段 2） */
function makeVictim(kind: 'tackle' | 'bind' | 'drag' | 'stuff') {
  const g = new THREE.Group()
  const cloth = new THREE.MeshStandardMaterial({ color: '#41566e', roughness: 0.9 }), skin = new THREE.MeshStandardMaterial({ color: '#c99a7a', roughness: 0.8 }), pant = new THREE.MeshStandardMaterial({ color: '#2c2b30', roughness: 0.9 })
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.38, 6, 12), cloth), head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), skin)
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.7, 6, 12), pant)
  const tG = new THREE.Group(); tG.add(torso); torso.position.y = -0.34; g.add(tG)
  head.position.y = 0.11; tG.add(head); const lG = new THREE.Group(); lG.position.y = -0.68; tG.add(lG); lG.add(legs); legs.position.y = -0.45
  for (const m of [torso, head, legs]) { m.castShadow = true; m.receiveShadow = true }
  const hp = new THREE.Vector3(), hq = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0)
  return {
    g,
    update(rig: ConciergeRig, _clip: string, t: number) {
      if (kind === 'drag') {
        conciergeHandPoint(rig, 'R', hp)
        const dir = new THREE.Vector3(0, -(hp.y - 0.15), 0.62).normalize()
        tG.position.copy(hp); tG.quaternion.setFromUnitVectors(down, dir)
        lG.quaternion.copy(tG.quaternion.clone().invert().multiply(new THREE.Quaternion().setFromUnitVectors(down, new THREE.Vector3(0, -0.05, 1).normalize())))
      } else if (kind === 'bind') {
        tG.position.set(-0.22, 0.16, 0.6); tG.quaternion.setFromUnitVectors(down, new THREE.Vector3(1, 0, 0)); lG.quaternion.identity()
      } else if (kind === 'tackle') { // 仰面倒在他身前，头朝 −X
        tG.position.set(-0.55, 0.16, 0.85); tG.quaternion.setFromUnitVectors(down, new THREE.Vector3(1, 0, 0.15).normalize()); lG.quaternion.identity()
      } else {
        conciergeHandPoint(rig, 'L', hp); conciergeHandPoint(rig, 'R', hq); hp.add(hq).multiplyScalar(0.5)
        const slide = t > 2.75 ? (t - 2.75) * 0.5 : 0
        tG.position.set(0.5, hp.y + 0.13, hp.z + 0.12 + slide); tG.quaternion.setFromUnitVectors(down, new THREE.Vector3(-1, 0, 0))
        lG.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), t < 2.3 ? 0.9 : 0.2)
      }
    },
  }
}
