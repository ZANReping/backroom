/* eslint-disable @typescript-eslint/no-explicit-any -- 预览页直接拼假实体 / 假引擎 */
// [bellhop] 行李员（Entity 135）阶段 3 场景预览（proto-bellhop3.html，必须 ?cpu=1）：
//   用 bellhopAI 的状态结构（BellhopEntState：mode / clip / modeT / headYaw / face）驱动游戏里同一条渲染路径
//   （bellhopRender.buildBellhopEntityMesh + animateBellhopEntity：LOD、片段混合、stillWatch 冻结、换脸），
//   10F 行李房用 syncBellhopRoom，图鉴用真实的 BellhopCodexFile。
//   ?shot=corridor|turn|deposit|tag|tea|annoyed|room|codex[&part=0|1]
//   场景是示意布景（红地毯走廊 / 墙纸 / 壁灯），不是游戏里的 L5 生成地图。
import '../game/engine' // 先按游戏的顺序把引擎图求值完（避免循环引用 TDZ）
import * as THREE from 'three'
import { createRoot } from 'react-dom/client'
import '../index.css'
import BellhopCodexFile from '@/components/BellhopCodexFile'
import { buildBellhopEntityMesh, animateBellhopEntity, syncBellhopRoom } from '../game/renderer/bellhopRender'
import { BELLHOP_CLIPS, type BellhopClip } from '../game/renderer/bellhopAnim'
import { BH, type BellhopEntState, type BellhopMode } from '../game/engine/bellhopAI'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
const shot = Q.get('shot') ?? 'corridor'
const W = innerWidth, H = innerHeight
const cap = document.getElementById('cap')!
const done = (info: Record<string, unknown> = {}) => requestAnimationFrame(() => requestAnimationFrame(() => { (window as any).__info = { shot, cpu: QA_CPU_SKIN, ...info }; (window as any).__ready = true }))
const CAPS: Record<string, [string, string]> = {
  corridor: ['走廊尽头候命', `出现在你所在楼层的长走廊尽头（${BH.spawnR[0]}–${BH.spawnR[1]} m、视线外）· 被看着时一动不动（stillWatch）`],
  turn: ['你回头，他也转头', `移开视线 ${BH.turnAfter}s 后：头已拧向你、脸换了一张（这里：长耳鸮）· 换脸只在视线外发生`],
  deposit: ['寄存', `${BH.serveR} m 内按 X：把手上的东西交给他（takeItem）`],
  tag: ['递行李牌', '换一张编号的黄铜行李牌（tagHand）· 凭牌取回 · 13 楼没收不到寄存物'],
  tea: ['请他喝茶', '递客房茶 / 咖啡 → 友好铃 + 饮茶（teaSip）· 免下一次领取代价'],
  annoyed: ['恼怒铃', `关注度 ≥ ${BH.refuseAt}：拒收寄存 · 沉闷一长声 = 关注度 +${BH.annoyAttn}，管家 / 看门人循声而来`],
  room: ['10F 行李房', '主厅角落的行李寄存处：被转运的寄存物 / 死亡遗物 / 「绅士的情书」'],
  codex: ['图鉴 · Entity 135 员工档案', 'BellhopCodexFile（见过的面孔 5/8 · tier 3 全解锁 · 情书一行 · 行李记录）'],
}
const [c1, c2] = CAPS[shot] ?? [shot, '']
cap.innerHTML = `${c1}<span class="s">${c2}${Q.get('part') ? ' · ' + (Q.get('part') === '0' ? '上半' : '下半') : ''}</span>`

if (shot === 'codex') {
  document.body.style.background = '#0b0a08'; cap.style.background = '#0b0a08'; cap.style.borderBottom = '1px solid #3a2e1c'
  const save = { floor: 10, ax: 0, ay: 0, f: 0, next: 139, deposits: [{ tag: 137, item: { type: 'flashlight', count: 1, t: 0 } }, { tag: 138, item: { type: 'skeleton', count: 1, t: 0 } }], room: [{ type: 'crowbar', count: 1, t: 0 }], held: [{ type: 'keycard', count: 1, t: 0 }], free: 1, loved: 1, letter: 1, face: 3, bag: [], n: { deposit: 4, claim: 2, refuse: 1, annoyed: 2, friendly: 7, tea: 1, moved: 1, keys: 1 } }
  const eng: any = { hotel: { bellhop: save }, hotelBook: { bhFaces: [0, 1, 3, 4, 6], bhLove: 1 } }
  const part = Number(Q.get('part') ?? 0)
  const ui = document.getElementById('ui')!
  ui.style.cssText = `position:absolute;left:50%;top:${44}px;width:${Math.min(620, W - 40)}px;transform:translateX(-50%)`
  createRoot(ui).render(<BellhopCodexFile engine={eng} tier={3} met={6} />)
  setTimeout(() => {
    const el = ui.firstElementChild as HTMLElement
    const h = el.getBoundingClientRect().height
    if (part === 1) ui.style.top = `${Math.min(44, H - h - 10)}px`
    done({ codexH: Math.round(h) })
  }, 600)
} else scene3d()

function scene3d() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
  document.body.prepend(renderer.domElement)
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#140e0b'); scene.fog = new THREE.Fog('#140e0b', 12, 34)
  const tex = (draw: (c: CanvasRenderingContext2D, s: number) => void, s = 128) => { const cv = document.createElement('canvas'); cv.width = cv.height = s; draw(cv.getContext('2d')!, s); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t }
  const carpet = tex((c, s) => { c.fillStyle = '#5a1a16'; c.fillRect(0, 0, s, s); c.strokeStyle = '#a07a3a'; c.lineWidth = 3; c.strokeRect(10, 10, s - 20, s - 20); c.fillStyle = '#7a2a20'; c.beginPath(); c.arc(s / 2, s / 2, 22, 0, 7); c.fill() }); carpet.repeat.set(3, 40)
  const paper = tex((c, s) => { c.fillStyle = '#5b2a26'; c.fillRect(0, 0, s, s); c.fillStyle = '#6e3430'; for (let i = 0; i < 4; i++) c.fillRect(i * 32 + 10, 0, 6, s); c.fillStyle = '#9a7a46'; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(i * 32 + 13, j * 32 + 16, 3.5, 0, 7); c.fill() } }); paper.repeat.set(20, 2)
  const room = shot === 'room'
  const L = 40, hw = room ? 4 : 1.25
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, L), new THREE.MeshStandardMaterial({ map: carpet, roughness: 1 })); fl.rotation.x = -Math.PI / 2; fl.position.z = -L / 2 + 6; fl.receiveShadow = true; scene.add(fl)
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, L), new THREE.MeshStandardMaterial({ color: '#3a2420', roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 3.0, -L / 2 + 6); scene.add(ceil)
  const wallMat = new THREE.MeshStandardMaterial({ map: paper, roughness: 1 }), wainMat = new THREE.MeshStandardMaterial({ color: '#2e1a12', roughness: 0.7 })
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(L, 3.0), wallMat); w.position.set(sx * hw, 1.5, -L / 2 + 6); w.rotation.y = -sx * Math.PI / 2; w.receiveShadow = true; scene.add(w)
    const b = new THREE.Mesh(new THREE.BoxGeometry(L, 0.9, 0.04), wainMat); b.position.set(sx * (hw - 0.02), 0.45, -L / 2 + 6); b.rotation.y = -sx * Math.PI / 2; scene.add(b)
  }
  const end = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 3), wallMat); end.position.set(0, 1.5, -L + 6); scene.add(end)
  scene.add(new THREE.HemisphereLight('#ffe2c0', '#2a120c', 0.55))
  for (let z = 4; z > -L + 6; z -= 5) { const p = new THREE.PointLight('#ffc88a', 5, 7, 1.6); p.position.set(0, 2.7, z); scene.add(p); const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe9c0' })); m.position.copy(p.position); scene.add(m) }
  const key = new THREE.SpotLight('#ffd9a0', 22, 14, 0.8, 0.5, 1.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0004; scene.add(key, key.target)

  // —— 行李员：facing = π/2 → 实体组 rotation.y = −π/2，模型正面 = +Z ——
  const grp = buildBellhopEntityMesh(); scene.add(grp)
  const e: any = { id: 2, x: 0, y: 0, z: 0, facing: Math.PI / 2, def: { type: 'bellhop', hp: 9999 }, hp: 9999, dead: false, state: 'idle' }
  const s: BellhopEntState = { mode: 'wait', modeT: 0, clip: 'idle', seq: 1, queue: [], watched: false, unseenT: 0, turned: true, headYaw: 0, face: 0, annoyCd: 0, hitT: 0 }
  e.bh = s
  const pose = (mode: BellhopMode, clip: BellhopClip, t: number, extra: Partial<BellhopEntState> = {}) => { Object.assign(s, { mode, clip, ...extra }); return t }
  const cam = new THREE.PerspectiveCamera(Number(Q.get('fov') ?? 50), W / H, 0.02, 80)
  let T = 0, dist = 4
  const hud: { msgs?: [string, string][]; x?: string } = {}
  let at = { x: 0, z: 0 }
  switch (shot) {
    case 'corridor': at = { x: 0, z: -15 }; T = pose('still', 'stillWatch', 0.5, { watched: true, face: 0 }); cam.position.set(0.2, 1.6, 4); cam.lookAt(0, 1.25, -15); cam.fov = 30; dist = 19; scene.fog = new THREE.Fog('#140e0b', 18, 40); break
    case 'turn': at = { x: 0, z: -3 }; e.facing = -Math.PI / 2 + 0.2; T = pose('still', 'stillWatch', 0.5, { watched: true, face: 3, headYaw: Math.PI - 0.2 }); cam.position.set(0.35, 1.62, 1.3); cam.lookAt(0, 1.55, -3); cam.fov = 42; dist = 4.3; break
    case 'deposit': at = { x: 0, z: -1.5 }; T = pose('serve', 'takeItem', 1.5, { face: 6 }); cam.position.set(0.25, 1.6, 0.4); cam.lookAt(0, 1.15, -1.3); hud.msgs = [['lore', '行李员双手接过「手电筒」，递给你一张黄铜行李牌：No.137。']]; hud.x = 'X  寄存'; dist = 2; break
    case 'tag': at = { x: 0, z: -1.5 }; T = pose('serve', 'tagHand', 1.5, { face: 6 }); cam.position.set(0.3, 1.58, 0.35); cam.lookAt(0, 1.2, -1.3); dist = 2; break
    case 'tea': at = { x: 0, z: -2 }; T = pose('serve', 'teaSip', 2.4, { face: 1 }); cam.position.set(0.5, 1.6, 0.2); cam.lookAt(0, 1.45, -2); hud.msgs = [['lore', '行李员托起茶碟，把杯子举到喙前，停了很久。铃声清脆地响了两下。']]; hud.x = 'X  递茶'; dist = 2.3; break
    case 'annoyed': at = { x: 0, z: -2.4 }; T = pose('ring', 'ringAnnoyed', 1.15, { face: 5 }); cam.position.set(0.6, 1.6, 0.6); cam.lookAt(0, 1.3, -2.4); hud.msgs = [['lore', '行李员没有伸手。他看着你，像在看一张已经填好日期的退房单。'], ['sys', '你寄存的 2 件东西被他送去了 10F 行李房。要的话，自己去取。']]; dist = 3; break
    case 'room': at = { x: 2.6, z: -6 }; e.facing = Math.PI / 2 + 0.6; T = pose('still', 'stillWatch', 0.5, { face: 4 }); syncBellhopRoom(scene, { x: -1.6, y: -3.2 }, 5); cam.position.set(0.8, 1.6, 1.6); cam.lookAt(-0.6, 0.9, -3.4); hud.x = 'X  翻找行李房'; hud.msgs = [['lore', '压在行李堆最底下的，是一封没贴邮票的信。信封上只写着：「致行李员」。']]; dist = 7; break
  }
  grp.position.set(at.x, 0, at.z); grp.rotation.y = -e.facing
  key.position.set(at.x + 1.2, 2.9, at.z + 2.4); key.target.position.set(at.x, 1, at.z)
  if (shot === 'corridor') { key.intensity = 40; key.distance = 8 }
  const C = BELLHOP_CLIPS[s.clip]
  const steps = Math.max(20, Math.round(Math.min(T, 3) * 30))
  const t0 = performance.now()
  // stillWatch：先放一段 idle 再切过去（冻结在切换那一刻）
  if (s.clip === 'stillWatch') { const want = s.clip; s.clip = 'idle'; for (let i = 0; i < 20; i++) { s.modeT = i / 30; animateBellhopEntity(grp, e, 1 / 30, dist) } s.clip = want; s.seq++ }
  for (let i = 0; i <= steps; i++) { s.modeT = C.loop ? i / 30 : Math.max(0, T - (steps - i) / 30); animateBellhopEntity(grp, e, 1 / 30, dist) }
  grp.updateMatrixWorld(true)
  if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
  renderer.render(scene, cam)
  const animMs = Math.round(performance.now() - t0)
  createRoot(document.getElementById('ui')!).render(<>
    {hud.msgs && <div className="msgs">{hud.msgs.map(([k, t]) => <div key={t} className={k === 'sys' ? 'sys' : k === 'dmg' ? 'dmg' : ''}>{t}</div>)}</div>}
    {hud.x && <div className="xbtn">{hud.x}</div>}
  </>)
  const lod = grp.userData.lod0 && (grp.userData.lod0 as THREE.Object3D).visible ? 0 : 1
  done({ mode: s.mode, clip: s.clip, t: T, lod, animMs, face: s.face })
}
