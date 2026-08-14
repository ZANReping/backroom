import * as THREE from 'three'
import { levelTexture, litMaterial } from './shared'

export type FlashlightOrientation = 'forward' | 'ground'

export interface FlashlightMeshOptions {
  lit?: boolean
  orientation?: FlashlightOrientation
}

type AtlasPanel = 'metal' | 'rubber'

const fallbackAtlas = () => {
  // 左半为枪灰金属、右半为深色橡胶；浏览器会异步替换为真实 UV 图。
  const data = new Uint8Array([
    47, 49, 50, 255,
    24, 25, 25, 255,
  ])
  const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

function flashlightAtlas() {
  const tex = levelTexture('flashlight_uv_atlas.png', fallbackAtlas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

/**
 * 把 Three 内建几何的 UV 真正压入图集指定半区；留出 1% 内边距，避免 mipmap 在金属/橡胶分界串色。
 */
export function remapFlashlightUvs<T extends THREE.BufferGeometry>(geometry: T, panel: AtlasPanel): T {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute | undefined
  if (!uv) return geometry
  const lo = panel === 'metal' ? 0.01 : 0.51
  const hi = panel === 'metal' ? 0.49 : 0.99
  for (let i = 0; i < uv.count; i++) uv.setX(i, lo + uv.getX(i) * (hi - lo))
  uv.needsUpdate = true
  return geometry
}

/**
 * 老式战术手电低模。默认沿相机 -Z 指向前方；ground 版旋到 +X，供掉落物/投掷物共用。
 * 大轮廓由几何提供，细小金属拉丝、划痕与菱形防滑纹来自真实 UV 图集。
 */
export function buildFlashlightMesh(options: FlashlightMeshOptions = {}): THREE.Group {
  const root = new THREE.Group()
  root.name = 'flashlight-model'
  root.userData.flashlightModel = 1
  const atlas = flashlightAtlas()
  const metal = litMaterial({
    color: '#d8d8d8', map: atlas, bumpMap: atlas, bumpScale: 0.008,
    roughness: 0.46, metalness: 0.62, envBase: 0.3,
  })
  const rubber = litMaterial({
    color: '#d0d0d0', map: atlas, bumpMap: atlas, bumpScale: 0.025,
    roughness: 0.94, metalness: 0, envBase: 0.04,
  })
  const darkMetal = litMaterial({ color: '#4f5356', roughness: 0.38, metalness: 0.72, envBase: 0.34 })
  const redRubber = litMaterial({ color: '#9c332d', roughness: 0.8, metalness: 0, envBase: 0.04 })

  const add = (
    geometry: THREE.BufferGeometry, material: THREE.Material, name: string,
    x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0,
  ) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.userData.flashlightPart = name
    mesh.position.set(x, y, z)
    mesh.rotation.set(rx, ry, rz)
    root.add(mesh)
    return mesh
  }
  const cyl = (
    rt: number, rb: number, length: number, material: THREE.Material, name: string, z: number,
    panel?: AtlasPanel, segments = 20,
  ) => {
    let geo = new THREE.CylinderGeometry(rt, rb, length, segments)
    if (panel) geo = remapFlashlightUvs(geo, panel)
    return add(geo, material, name, 0, 0, z, Math.PI / 2)
  }

  // 后段：可拆尾盖、橡胶防滑握把、前后止滑环。
  cyl(0.043, 0.043, 0.055, metal, 'tail-cap', 0.075, 'metal')
  cyl(0.047, 0.047, 0.014, darkMetal, 'tail-seal', 0.043)
  cyl(0.04, 0.04, 0.22, rubber, 'knurled-grip', -0.073, 'rubber', 24)
  cyl(0.047, 0.047, 0.016, metal, 'rear-collar', 0.031, 'metal')
  cyl(0.047, 0.047, 0.018, metal, 'front-collar', -0.184, 'metal')
  cyl(0.025, 0.025, 0.016, redRubber, 'tail-switch', 0.111, undefined, 16)

  // 侧按键与金属抱夹；按键有真实凸起，抱夹轻微离开筒身形成清楚轮廓。
  add(remapFlashlightUvs(new THREE.BoxGeometry(0.035, 0.012, 0.062), 'rubber'), rubber, 'switch-bed', 0, 0.043, -0.083)
  add(new THREE.BoxGeometry(0.024, 0.01, 0.034), redRubber, 'side-switch', 0, 0.052, -0.083)
  add(remapFlashlightUvs(new THREE.BoxGeometry(0.009, 0.014, 0.145), 'metal'), metal, 'pocket-clip', 0.043, 0, -0.035)

  // 灯颈、三道散热环与外扩灯头；20/28 边取代旧八边形轮廓。
  cyl(0.044, 0.044, 0.06, metal, 'neck', -0.221, 'metal')
  for (let i = 0; i < 3; i++) cyl(0.054, 0.054, 0.009, darkMetal, `cooling-fin-${i + 1}`, -0.202 - i * 0.018, undefined, 24)
  cyl(0.052, 0.076, 0.09, metal, 'flared-head', -0.286, 'metal', 28)
  cyl(0.081, 0.081, 0.026, darkMetal, 'bezel', -0.344, undefined, 28)
  const antiRoll = remapFlashlightUvs(new THREE.TorusGeometry(0.077, 0.005, 6, 28), 'metal')
  add(antiRoll, metal, 'anti-roll-ring', 0, 0, -0.331)

  // 内凹反光杯、玻璃与 LED 发光芯。地面版不自发光，手持点亮时只让灯芯/镜片发亮。
  const reflector = new THREE.MeshStandardMaterial({
    color: '#d5d7d8', roughness: 0.14, metalness: 0.92, side: THREE.DoubleSide,
  })
  add(new THREE.RingGeometry(0.019, 0.069, 32), reflector, 'reflector-cup', 0, 0, -0.359)
  const lens = new THREE.MeshPhysicalMaterial({
    color: options.lit ? '#fff5d8' : '#b8c6c6',
    emissive: options.lit ? '#ffe9ad' : '#000000',
    emissiveIntensity: options.lit ? 0.7 : 0,
    transparent: true, opacity: 0.48, transmission: 0.18,
    roughness: 0.08, metalness: 0, side: THREE.DoubleSide, depthWrite: false,
  })
  add(new THREE.CircleGeometry(0.069, 32), lens, 'glass-lens', 0, 0, -0.362)
  const emitter = new THREE.MeshBasicMaterial({ color: options.lit ? '#fff0bd' : '#acaeaa', side: THREE.DoubleSide })
  add(new THREE.CircleGeometry(0.017, 20), emitter, 'led-emitter', 0, 0, -0.364)

  // 尾部挂绳环（轮廓件，不用贴图伪造）。
  add(new THREE.TorusGeometry(0.014, 0.0028, 6, 16), darkMetal, 'lanyard-loop', 0.026, 0, 0.113, 0, Math.PI / 2)

  if (options.orientation === 'ground') root.rotation.y = -Math.PI / 2
  return root
}
