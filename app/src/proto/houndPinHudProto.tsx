/* eslint-disable @typescript-eslint/no-explicit-any -- 预览页直接拼假实体 */
// 猎犬（Entity 8）阶段 3.1：扑倒压制挣脱进度条 HUD 预览（proto-hound-pinhud.html）。
// 第一人称被压倒视角（眼高 HD.PIN_EYE、上仰 + 侧倾同 renderer houndPinK=1）+ 真实 HoundPinBar（index.css 同一套 HUD 样式）。
// ?cpu=1（无头 SwiftShader 必须）&mobile=1（移动端：同 TouchControls 位置画一个「挣脱」情境按钮，检查不重叠）
// &p=0.55 进度 &bite=0.8 红闪 &left=4.2 剩余秒 &flash=1 手电照脸 &theme=amber|liminal|…
import * as THREE from 'three'
import { createRoot } from 'react-dom/client'
import '../index.css'
import { HoundPinBar } from '@/components/houndPinHud'
import { buildHoundMesh, animateHound } from '../game/renderer/houndMesh'
import { HD, type HoundPinHud } from '../game/engine/houndAI'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

const Q = new URLSearchParams(location.search)
document.documentElement.dataset.theme = Q.get('theme') ?? 'amber'
const mobile = Q.get('mobile') === '1'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.setPixelRatio(1)
document.body.prepend(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a261c'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 4, 18)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#6b6146' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const ceil = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshLambertMaterial({ color: '#b8ad86' })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 2.7; scene.add(ceil)
for (let i = -3; i <= 3; i++) { const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 1.1), new THREE.MeshBasicMaterial({ color: '#fffbe6' })); lp.rotation.x = Math.PI / 2; lp.position.set(i * 2.4 - 0.6, 2.69, 0.3); scene.add(lp) }
scene.add(new THREE.HemisphereLight('#fff4d0', '#3a3220', 1.1))
const sun = new THREE.DirectionalLight('#fff1cc', 1.2); sun.position.set(-1, 5, 2); scene.add(sun)

// 猎犬压在玩家身上（同 houndProto stage3：猎犬在 X、朝 +x，玩家躺在 X + PIN_OFF）
const X = 0, off = HD.PIN_OFF
const g = buildHoundMesh(false, 4, 'hostile') as THREE.Group; scene.add(g)
const e: any = { id: 0, state: 'attack', animT: 0, x: X, y: 0, facing: 0, hp: 35, dead: false, deathT: 0, attackCd: 0, lungeT: 0, hd: { phase: 'pin', crouch: 0, howlPose: 0, sit: 0, jaw: 1, wag: 0 } }
g.position.set(X, 0, 0); g.rotation.y = 0
for (let i = 0; i < 24; i++) animateHound(g, e, 0.5 + i / 30, 0, { dist: off, px: X + off, py: 0 })
g.updateMatrixWorld(true)
const head = new THREE.Vector3(); g.userData.houndRig.head.getWorldPosition(head)

// 第一人称：躺在地上，眼高 PIN_EYE，看向压在胸口的猎犬头部，再叠加 renderer 的上仰 0.22 与侧倾 0.32
const cam = new THREE.PerspectiveCamera(Number(Q.get('fov') ?? 70), W / H, 0.02, 60)
// 示意图把镜头往脚那边退 0.6 m、略偏一侧，才能同时看到猎犬的脸和压在胸口的前爪（游戏里镜头就在胸口上方，只看得到头发和爪子）
cam.position.set(X + off + 0.6, HD.PIN_EYE, 0.22)
cam.lookAt(head.x, head.y + 0.2, head.z)
cam.rotateZ(-0.32 * 0.5)
cam.updateMatrixWorld()
if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
renderer.render(scene, cam)

const s: HoundPinHud = {
  progress: Number(Q.get('p') ?? 0.55), struggle: 0, need: HD.PIN_NEED,
  left: Number(Q.get('left') ?? 4.2), max: HD.PIN_MAX,
  bite: Number(Q.get('bite') ?? 0.8), flash: Q.get('flash') === '1', kind: 'hostile',
}
s.struggle = s.progress * s.need
// 视角震动的暗角（游戏里由 renderer 的 camShake 负责，这里只画 HUD）
const btn: React.CSSProperties = { position: 'fixed', width: 64, height: 64, right: 22, bottom: H > W ? 270 : 210, borderRadius: '50%', border: '2px solid var(--amber)', color: 'var(--amber)', background: 'color-mix(in srgb, var(--panel) 70%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, zIndex: 40 }
createRoot(document.getElementById('ui')!).render(<>
  <HoundPinBar s={s} isMobile={mobile} />
  {mobile && <div data-touch-id="special" style={btn}>挣脱</div>}
</>)
requestAnimationFrame(() => requestAnimationFrame(() => {
  const bar = document.querySelector('[data-hound-pin]')?.getBoundingClientRect()
  const b = document.querySelector('[data-touch-id="special"]')?.getBoundingClientRect()
  const overlap = !!(bar && b && bar.left < b.right && bar.right > b.left && bar.top < b.bottom && bar.bottom > b.top)
  ;(window as any).__info = { mobile, bar: bar && [Math.round(bar.left), Math.round(bar.top), Math.round(bar.width), Math.round(bar.height)], button: b && [Math.round(b.left), Math.round(b.top)], overlap, head: head.toArray().map((v) => +v.toFixed(2)) }
  ;(window as any).__ready = true
}))
