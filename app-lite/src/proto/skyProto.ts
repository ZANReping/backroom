// v65 天空/体积云预览：?level=10&yaw=0.5&pitch=0.2&t=0&grid=1（grid=1 时 3×3 拼图展示 L2~L11）
import * as THREE from 'three'
import { makeSkyMesh, skyLightDir, SKY_PROFILES } from '../game/renderer/skybox'
import type { SkySystem } from '../game/renderer/skySystem'
import type { LevelDef } from '../game/core/types'
import { setMaterialMode } from '../game/renderer/shared'

const q = new URLSearchParams(location.search)
setMaterialMode(q.get('mode') === 'classic' ? 'classic' : 'realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: false })
renderer.setSize(W, H)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.autoClear = false
document.body.appendChild(renderer.domElement)
const grid = q.get('grid') === '1'
const ids = grid ? [2, 3, 4, 5, 6, 7, 9, 10, 11] : [Number(q.get('level') ?? 10)]
const t = Number(q.get('t') ?? 0)
const freeze = q.get('freeze') === '1'
const quality = q.get('quality') === 'low' || q.get('mode') === 'classic' ? 'low' : 'high'
const pitch = Number(q.get('pitch') ?? .22)
const fogCols: Record<number, string> = { 2: '#38342d', 3: '#0a0e16', 4: '#4e5458', 5: '#121a30', 6: '#020308', 7: '#5f7177', 9: '#0b0e12', 10: '#7d8285', 11: '#a1aaac' }
const views = ids.map(id => {
  const scene = new THREE.Scene()
  const sky = makeSkyMesh({ w: 0, h: 0 } as never, { id } as LevelDef)!
  scene.add(sky)
  scene.fog = new THREE.Fog(fogCols[id] ?? '#777', 5, 40)
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: '#4a4a40' }))
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  scene.add(new THREE.HemisphereLight('#ffffff', '#444444', SKY_PROFILES[id].sunLight ?? .4))
  const cam = new THREE.PerspectiveCamera(75, grid ? (W / 3) / (H / 3) : W / H, .1, 60)
  cam.position.set(0, 1.6, 0)
  const L = skyLightDir(id)
  const yaw = q.has('yaw') ? Number(q.get('yaw')) : Math.atan2(L.x, L.z) + .5
  cam.rotation.order = 'YXZ'
  cam.rotation.set(pitch, yaw + Math.PI, 0)
  sky.position.copy(cam.position)
  if (!sky.userData.sky) sky.position.y = id === 9 || id === 10 || id === 11 ? 1.6 : 5.5
  const sys = sky.userData.sky as SkySystem | undefined
  const dbg = q.get('dbg')
  if (sys) {
    sys.setQuality(quality)
    const su = (sys as unknown as { skyMat: THREE.ShaderMaterial }).skyMat.uniforms
    if (dbg === 'nobody') su.uBodyK.value = 0
    if (dbg === 'nocirrus') su.uCirrus.value = 0
    if (dbg === 'noclouds') sys.setWeather(-1, 0)
  }
  return { id, scene, cam, sys }
})
let frame = 0
;(window as unknown as { __skyInfo: () => unknown }).__skyInfo = () => views.map(v => ({
  id: v.id, quality: (v.sys as unknown as { q: unknown }).q,
}))
let raf = 0
;(window as unknown as { __probe: () => unknown }).__probe = () => {
  const v = views[0]; const sys = v.sys as unknown as { rt: THREE.WebGLRenderTarget }
  const L = skyLightDir(v.id).normalize()
  const u = ((Math.atan2(L.z, L.x) / (2 * Math.PI)) % 1 + 1) % 1
  const vv = Math.pow((L.y + .06) / 1.06, 1 / 1.5)
  const W2 = sys.rt.width, H2 = sys.rt.height
  const out: number[][] = []
  for (const dx of [-12, -4, 0, 4, 12]) {
    const buf = new Uint16Array(4)
    renderer.readRenderTargetPixels(sys.rt, Math.floor(u * W2) + dx, Math.floor(vv * H2), 1, 1, buf)
    out.push([...buf].map(h => THREE.DataUtils.fromHalfFloat(h)))
  }
  return out
}
function loop() {
  frame++
  renderer.setScissorTest(false)
  renderer.setViewport(0, 0, W, H); renderer.clear()
  views.forEach((v, i) => {
    const time = freeze ? t : t + frame / 60
    if (v.sys) v.sys.update(renderer, time, (v.scene.fog as THREE.Fog).color)
    else { const um = (v.scene.getObjectByName('skybox') as THREE.Mesh).material as THREE.ShaderMaterial; if (um.uniforms?.uTime) um.uniforms.uTime.value = time }
    if (grid) {
      const x = (i % 3) * W / 3, y = (2 - Math.floor(i / 3)) * H / 3
      renderer.setViewport(x, y, W / 3, H / 3); renderer.setScissor(x, y, W / 3, H / 3); renderer.setScissorTest(true)
    }
    renderer.render(v.scene, v.cam)
  })
  ;(window as unknown as { __frames: number }).__frames = frame
  raf = requestAnimationFrame(loop)
}
loop()
addEventListener('pagehide', () => {
  cancelAnimationFrame(raf)
  for (const v of views) {
    v.sys?.dispose()
    const ground = v.scene.children.find(o => o.name !== 'skybox' && (o as THREE.Mesh).isMesh) as THREE.Mesh | undefined
    if (ground) { ground.geometry.dispose(); (ground.material as THREE.Material).dispose() }
  }
  renderer.dispose()
})
