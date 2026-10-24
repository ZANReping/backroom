// 原型预览页：售货机重制（?mode=lineup | e36 | close&variant=normal|e36 | products | back），可加 &cam=x,y,z&look=x,y,z
import * as THREE from 'three'
import { animateVending, VENDING_CLIPS, type VendingClip } from '../game/renderer/vendingAnim'
import { buildVendingMachine, buildProduct, NORMAL_BRANDS, NORMAL_PRODUCTS, E36_PRODUCTS, PRODUCT_NAME, type VendingHandles } from '../game/renderer/vendingMesh'
const q = new URLSearchParams(location.search)
const mode = q.has('anim') ? 'anim' : q.get('mode') ?? 'lineup'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#151413')
const cam = new THREE.PerspectiveCamera(34, W / H, 0.02, 80)
const lab = document.getElementById('lab')!
const info: any = {}
const count = (g: THREE.Object3D) => { let c = 0, t = 0; g.traverse((m: any) => { if (m.isMesh && m.visible !== false) { c++; t += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 } }); return { meshes: c, tris: Math.round(t) } }
const labels: [THREE.Vector3, string][] = []
const label = (x: number, y: number, z: number, html: string) => labels.push([new THREE.Vector3(x, y, z), html])
const flush = () => { cam.updateMatrixWorld(); for (const [v, html] of labels) { const p = v.clone().project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(0.5 - p.y * 0.5) * H}px">${html}</div>`) } }
function room(w: number, wall = '#6e6a5e', floor = '#3a3732') {
  const wl = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, 0.2), new THREE.MeshStandardMaterial({ color: wall, roughness: 0.95 })); wl.position.set(0, 1.6, -0.5); wl.receiveShadow = true; scene.add(wl)
  const fl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 6), new THREE.MeshStandardMaterial({ color: floor, roughness: 0.9 })); fl.position.set(0, -0.025, 2); fl.receiveShadow = true; scene.add(fl)
}
const lights = (k = 1) => {
  scene.add(new THREE.HemisphereLight('#e9e4d8', '#2a2622', 0.7 * k))
  const d = new THREE.DirectionalLight('#fff2dc', 1.3 * k); d.position.set(-2.5, 4, 5); d.castShadow = true; d.shadow.mapSize.set(2048, 2048)
  Object.assign(d.shadow.camera, { left: -6, right: 6, top: 4, bottom: -2 }); scene.add(d)
}
const put = (x: number, opts: Parameters<typeof buildVendingMachine>[0], ry = 0) => { const g = buildVendingMachine(opts); g.position.x = x; g.rotation.y = ry; scene.add(g); return g }
if (mode === 'lineup') {
  room(8); lights()
  const all = [...NORMAL_BRANDS.map((b, i) => ({ variant: 'normal' as const, brand: b, seed: i + 1, jammed: i === 2 })), { variant: "e36" as const, seed: 9, brand: undefined as any, jammed: false }]
  all.forEach((o, i) => { const x = (i - 2) * 1.25; const g = put(x, o); info[o.brand ?? 'e36'] = count(g); label(x, -0.05, 0.4, (o.variant === 'e36' ? 'Entity 36 · KINDRED' : (o.brand + (o.jammed ? '（卡货）' : ''))) + `<br><span class="s">${info[o.brand ?? 'e36'].meshes} 网格 · ${info[o.brand ?? 'e36'].tris} 三角形</span>`) })
  cam.position.set(0, 1.25, 8.2); cam.lookAt(0, 1.0, 0)
} else if (mode === 'e36') {
  room(9, '#5e5a50'); lights()
  const a = put(-2.6, { variant: 'e36', seed: 3 }); label(-2.6, -0.05, 0.4, '休眠（正面）')
  const b = put(-0.9, { variant: 'e36', seed: 3 }, Math.PI); label(-0.9, -0.05, 0.4, '背面标语')
  const c = put(0.9, { variant: 'e36', seed: 3, mad: true }); label(0.9, -0.05, 0.4, '活化：底门骷髅腿')
  const H = (c.userData.vending as VendingHandles); const ta = H.topArm; ta.root.visible = true; ta.root.rotation.set(-2.4, 0, 0.2); ta.elbow.rotation.x = 1.2; ta.wrist.rotation.x = 0.4
  const lid = H.hatchTop.getObjectByName('lid')!; lid.rotation.x = -1.6
  const d = put(2.7, { variant: 'e36', seed: 3, dismantled: true }, Math.PI); label(2.7, -0.05, 0.4, '拆解：后部暗格')
  info.e36 = count(a); info.mad = count(c); info.back = count(b); info.dis = count(d)
  cam.position.set(0, 1.5, 8.6); cam.lookAt(0, 1.1, 0)
} else if (mode === 'close') {
  room(3); lights()
  const v = (q.get('variant') ?? 'normal') as 'normal' | 'e36'
  const g = put(0, { variant: v, brand: (q.get('brand') as any) ?? undefined, seed: 2 })
  info.close = count(g)
  cam.position.set(0.35, 1.25, 2.3); cam.lookAt(-0.02, 1.02, 0)
} else if (mode === 'products') {
  lights(1.2)
  const ids = [...NORMAL_PRODUCTS, ...E36_PRODUCTS]
  const cols = 5
  ids.forEach((id, i) => { const g = buildProduct(id); const x = (i % cols - 2) * 0.24, y = -Math.floor(i / cols) * 0.3; g.position.set(x, y, 0); g.scale.setScalar(1.3); scene.add(g); label(x, y - 0.04, 0, PRODUCT_NAME[id]) })
  const pl = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ color: '#2a2826' })); pl.position.z = -0.12; pl.position.y = -0.2; scene.add(pl)
  cam.position.set(0, -0.15, 2.2); cam.lookAt(0, -0.22, 0)
} else if (mode === 'arm') {
  room(4); lights()
  const g = put(0, { variant: 'e36', seed: 5, mad: true }, -0.6)
  const H = g.userData.vending as VendingHandles; H.topArm.root.visible = true; H.topArm.root.rotation.set(-2.2, 0, 0.3); H.topArm.elbow.rotation.x = 1.0
  ;(H.hatchTop.getObjectByName('lid')!).rotation.x = -1.6
  H.pusher.root.visible = true; H.pusher.elbow.rotation.x = 1.9; H.pusher.wrist.rotation.x = -0.6
  cam.position.set(2.9, 2.5, 4.6); cam.lookAt(0, 1.7, 0)
}

if (mode === 'anim') {
  room(5); lights()
  const clip = (q.get('clip') ?? 'idle') as VendingClip
  const C = VENDING_CLIPS[clip]
  const g = put(0, { variant: C.e36 ? 'e36' : 'normal', brand: C.e36 ? undefined : 'northstar', seed: 3, dismantled: clip === 'whisper' }, 0)
  let man: THREE.Object3D | null = null
  if (['chop', 'grab', 'stun'].includes(clip)) {
    man = new THREE.Group()
    const bd = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.05, 4, 10), new THREE.MeshStandardMaterial({ color: '#34404e', roughness: 0.8 })); bd.position.y = 0.75; man.add(bd)
    const hd = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: '#c9a58a', roughness: 0.7 })); hd.position.y = 1.62; man.add(hd)
    man.position.set(0.1, 0, clip === 'stun' ? 2.0 : 1.35); man.traverse((o: any) => { if (o.isMesh) o.castShadow = true }); scene.add(man)
  }
  const frames = Number(q.get('frames') ?? 16), cols = Number(q.get('cols') ?? 4)
  const rows = Math.ceil(frames / cols)
  const tw = Math.floor(W / cols), th = Math.floor((H - 30) / rows)
  const tcam = new THREE.PerspectiveCamera(34, tw / th, 0.02, 60)
  const view = q.get('view') ?? ({ idle: 'front', coil: 'close', jam: 'close', hand: 'close', restock: 'front', whisper: 'corpse', open: 'arm', chop: 'arm', grab: 'arm' } as Record<string, string>)[clip] ?? 'side'
  if (view === 'close') { tcam.position.set(0.35, 0.75, 1.75); tcam.lookAt(-0.05, 0.6, 0) }
  else if (view === 'legs') { tcam.position.set(1.5, 0.55, 1.7); tcam.lookAt(0, 0.5, 0.1) }
  else if (view === 'legs2') { tcam.position.set(-1.9, 0.4, 0.3); tcam.lookAt(0, 0.5, 0) }
  else if (view === 'corpse2') { tcam.position.set(0.1, 0.95, -1.15); tcam.lookAt(-0.1, 0.8, -0.2) }
  else if (view === 'corpse') { tcam.position.set(0.3, 1.0, -2.2); tcam.lookAt(0, 0.55, -0.2) }
  else if (view === 'cut') {
    // 剖面：沿出货那一列的中线把机器切开（只留 x ≤ 切面的一半），从右侧看内部的搁板 / 螺旋线 / 落货通道 / 取货斗
    const sl = Number(q.get('slot') ?? 5), cx = [-0.255, -0.085, 0.085, 0.255][sl % 4] - 0.07
    renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), cx)]
    tcam.position.set(cx + 2.5, 0.95, 1.05); tcam.lookAt(cx, 0.82, 0.1)
    const cl = new THREE.PointLight('#fff2dc', 5, 3, 1.2); cl.position.set(cx + 0.6, 1.0, 0.6); scene.add(cl); scene.add(new THREE.AmbientLight('#ffffff', 0.6))
  }
  else if (view === 'arm') { tcam.position.set(4.6, 2.6, 4.4); tcam.lookAt(0, 2.0, 0.6) }
  else if (view === 'front') { tcam.position.set(0.5, 1.3, 3.6); tcam.lookAt(0, 1.0, 0) }
  else if (view === 'back') { tcam.position.set(0.6, 1.2, -2.6); tcam.lookAt(0, 0.9, 0) }
  else { tcam.position.set(3.6, 2.2, 4.2); tcam.lookAt(0, 1.45, 0.5) }
  renderer.setScissorTest(true); renderer.autoClear = false
  lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${W / 2}px;top:4px"><span class="s">${C.zh} · ${clip} · ${C.dur}s · ${frames} 帧</span></div>`)
  if (clip === 'whisper') { const pl = new THREE.PointLight('#ffd9a8', 6, 4, 1.5); pl.position.set(0.3, 1.3, -1.2); scene.add(pl) }
  if (clip === 'whisper') { const wl = scene.children.find((o: any) => o.isMesh && o.position.z === -0.5); if (wl) wl.visible = false }
  const draw = () => {
    renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H); renderer.setClearColor('#111'); renderer.clear()
    for (let i = 0; i < frames; i++) {
      const t = C.loop ? (i / frames) * C.dur : (i / (frames - 1)) * C.dur
      animateVending(g, clip, t, { slot: Number(q.get('slot') ?? 5), time: 3 + t })
      const c = i % cols, r = Math.floor(i / cols)
      const x = c * tw, y = H - 30 - (r + 1) * th
      renderer.setViewport(x, y, tw, th); renderer.setScissor(x, y, tw, th); renderer.render(scene, tcam)
    }
  }
  const t1 = performance.now(); const l2 = () => { draw(); if (performance.now() - t1 < 2500) requestAnimationFrame(l2); else (window as any).__ready = true }; l2()
}
const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null
const c = vec(q.get('cam')), l = vec(q.get('look')); if (c) cam.position.copy(c); if (l) cam.lookAt(l)
flush()
;(window as any).__info = info
const t0 = performance.now(); const loop = () => { if (mode === 'anim') return; renderer.render(scene, cam); if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else (window as any).__ready = true }; loop()
