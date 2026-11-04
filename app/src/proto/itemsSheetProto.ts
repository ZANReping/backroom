// 物品建模补全预览（ZAN 2026-11-01）：新做/改过的物品，每件三格——地面模型 ¾ 正面 / 背面 / 第一人称手持（含复古右手）。
// ?ids=a,b,…  &mode=realistic  &cols=2（每行物品数）  &cell=300
import '../game/renderer/renderer'
import * as THREE from 'three'
import { buildItemMesh } from '../game/renderer/itemsMesh'
import { buildHeldItem } from '../game/renderer/viewmodel'
import { buildRetroHand, heldBox, heldHandPose } from '../game/renderer/retroViewHand'
import { setMaterialMode } from '../game/renderer/shared'
import { ITEMS } from '../game/content/items'
const W = window as unknown as Record<string, unknown>, q = new URLSearchParams(location.search)
const ALL = () => Object.keys(ITEMS)
const DEFAULT = 'mahjongtile,key437,bagTag,roomtea,gentletter,dustmask,velvetcake,timber,cart_paper,cart_4440,cart_4570,shell_buck,shell_bird,shell_clump'
async function main() {
  if (q.get('mode') === 'realistic') setMaterialMode('realistic')
  await Promise.all(['bold 40px "Noto Sans SC"', '40px "Noto Sans SC"'].map(f => document.fonts.load(f, '致行李员中')))
  const ids = q.get('ids') === 'all' ? ALL() : (q.get('ids') ?? DEFAULT).split(',').filter(Boolean)
  const one = q.get('views') === 'front', NV = one ? 1 : 3
  const cols = Number(q.get('cols') ?? 2), cell = Number(q.get('cell') ?? 300), TOP = 34, LAB = 24
  const rows = Math.ceil(ids.length / cols), Wd = cols * NV * cell, Ht = TOP + rows * (cell + LAB)
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1); r.setSize(Wd, Ht)
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.autoClear = false
  document.body.append(r.domElement)
  document.querySelector('#title')!.textContent = `物品建模补全 · ${q.get('mode') ?? 'classic'} · 每件：¾ 正面 / 背面 / 第一人称`
  const labels = document.querySelector('#labels')!
  const light = (s: THREE.Scene) => { s.add(new THREE.HemisphereLight('#fff6ea', '#4a443c', 1.6)); const d = new THREE.DirectionalLight('#ffffff', 2.2); d.position.set(1, 2, 2); s.add(d); const b = new THREE.DirectionalLight('#9ab0ff', .6); b.position.set(-2, 1, -2); s.add(b) }
  type View = { scene: THREE.Scene; cam: THREE.Camera; x: number; y: number }
  const views: View[] = []
  ids.forEach((id, i) => {
    const cx = (i % cols) * NV * cell, cy = TOP + Math.floor(i / cols) * (cell + LAB)
    const lb = document.createElement('div'); lb.className = 'lb'; lb.style.left = cx + 8 + 'px'; lb.style.top = cy + 2 + 'px'
    lb.innerHTML = `${ITEMS[id]?.name ?? id}<span class="sub">${id}</span>`; labels.append(lb)
    for (const [k, rot] of (one ? [[0, -.5]] : [[0, -.5], [1, Math.PI - .5]]) as [number, number][]) {
      const s = new THREE.Scene(); s.background = new THREE.Color(k ? '#2c2925' : '#34302b'); light(s)
      const g = buildItemMesh(id, { halo: false }); g.rotation.y = rot
      const b = new THREE.Box3().setFromObject(g), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3())
      g.position.sub(c); s.add(g)
      const rad = Math.max(sz.x, sz.y, sz.z) * .62 + .02
      const cam = new THREE.PerspectiveCamera(30, 1, .005, 10); cam.position.set(0, rad * 1.2, rad * 3.4); cam.lookAt(0, 0, 0)
      // 统一尺度参考：右下角一根 10 cm 标尺
      const ruler = new THREE.Mesh(new THREE.BoxGeometry(.1, .002, .002), new THREE.MeshBasicMaterial({ color: '#e8b93c' })); ruler.position.set(rad * .55, -rad * .8, rad * .3); if (!k) s.add(ruler)
      views.push({ scene: s, cam, x: cx + k * cell, y: cy + LAB })
    }
    if (one) return
    // 第一人称：相机在原点看 -Z，vm 组在 (.27,-.3,-.55)，右手按物品包围盒求握法
    const s = new THREE.Scene(); s.background = new THREE.Color('#25221f'); light(s)
    // 相机在原点、vm 组在实机位置；用 28° 窄视角对准手持物放大（等效于把实机画面右下角裁出来）
    const cam = new THREE.PerspectiveCamera(28, 1, .01, 10)
    const vm = new THREE.Group(); vm.position.set(.27, -.3, -.55); vm.rotation.order = 'YXZ'; s.add(vm)
    const it = buildHeldItem(id), hand = buildRetroHand()
    hand.setPose(heldHandPose(id, heldBox(it)), it); vm.add(hand.group); vm.add(it)
    s.updateMatrixWorld(true); const hc = new THREE.Box3().setFromObject(it).getCenter(new THREE.Vector3())
    cam.position.set(0, 0, 0); cam.lookAt(hc.x - .03, hc.y - .02, hc.z)
    views.push({ scene: s, cam, x: (i % cols) * NV * cell + 2 * cell, y: cy + LAB })
  })
  const draw = () => {
    r.setScissorTest(false); r.setClearColor('#1a1816'); r.clear(); r.setScissorTest(true)
    for (const v of views) { const y = Ht - v.y - cell; r.setViewport(v.x + 2, y + 2, cell - 4, cell - 4); r.setScissor(v.x + 2, y + 2, cell - 4, cell - 4); r.render(v.scene, v.cam) }
  }
  let n = 0; const tick = () => { draw(); if (++n === 20) W.__ready = true; if (n < 40) requestAnimationFrame(tick) }; tick()
}
main().catch(e => { W.__err = String((e as Error).stack ?? e); console.error(e) })
