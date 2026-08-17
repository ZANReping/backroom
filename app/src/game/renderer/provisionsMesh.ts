import * as THREE from 'three'
import { levelTexture, litMaterial } from './shared'

type WaterKind = 'almond' | 'cashew'

function fallbackTexture(colors: [number, number, number][]) {
  const data = new Uint8Array(colors.flatMap(([r, g, b]) => [r, g, b, 255]))
  const texture = new THREE.DataTexture(data, 2, 2, THREE.RGBAFormat)
  texture.needsUpdate = true
  return texture
}

function provisionTexture(file: string, colors: [number, number, number][]) {
  const texture = levelTexture(file, () => fallbackTexture(colors))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  texture.anisotropy = 4
  return texture
}

function add(
  root: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  name: string,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  mesh.userData.provisionPart = name
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  root.add(mesh)
  return mesh
}

/** 带完整钢壳、绝缘环、正负极和热缩包装 UV 的 AA 电池。 */
export function buildBatteryMesh(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'battery-model'
  root.userData.detailedProvisionModel = 1

  const atlas = provisionTexture('item_battery_wrapper_uv.png', [
    [28, 29, 28], [176, 135, 52],
    [31, 31, 29], [206, 167, 75],
  ])
  const wrapper = litMaterial({
    color: '#ffffff', map: atlas,
    emissive: '#ffffff', emissiveMap: atlas, emissiveIntensity: 0.06,
    roughness: 0.72, metalness: 0.08, envBase: 0.08,
  })
  const steel = litMaterial({ color: '#bbbdb8', roughness: 0.34, metalness: 0.82, envBase: 0.34 })
  const darkSteel = litMaterial({ color: '#686b68', roughness: 0.42, metalness: 0.7, envBase: 0.24 })
  const insulator = litMaterial({ color: '#171817', roughness: 0.9, metalness: 0, envBase: 0.02 })

  // 钢制电芯位于包装下方；openEnded 包装只覆盖侧壁，不污染金属端面 UV。
  add(root, new THREE.CylinderGeometry(0.067, 0.067, 0.246, 28), darkSteel, 'steel-cell')
  add(root, new THREE.CylinderGeometry(0.069, 0.069, 0.224, 32, 1, true), wrapper, 'printed-wrapper')
  add(root, new THREE.BoxGeometry(0.0028, 0.216, 0.018), wrapper, 'wrapper-overlap-seam', 0.0695)

  // 顶部卷边、黑色绝缘垫和凸起正极。
  add(root, new THREE.TorusGeometry(0.061, 0.006, 6, 28), steel, 'positive-crimp', 0, 0.125, 0, Math.PI / 2)
  add(root, new THREE.CylinderGeometry(0.057, 0.057, 0.009, 28), insulator, 'positive-insulator', 0, 0.128)
  add(root, new THREE.CylinderGeometry(0.031, 0.031, 0.018, 24), steel, 'positive-terminal', 0, 0.14)
  add(root, new THREE.TorusGeometry(0.027, 0.0025, 5, 20), darkSteel, 'positive-terminal-rim', 0, 0.15, 0, Math.PI / 2)

  // 负极为略内凹的平端，外侧保留压边环。
  add(root, new THREE.TorusGeometry(0.061, 0.006, 6, 28), darkSteel, 'negative-crimp', 0, -0.125, 0, Math.PI / 2)
  add(root, new THREE.CylinderGeometry(0.054, 0.054, 0.006, 28), steel, 'negative-terminal', 0, -0.13)
  add(root, new THREE.TorusGeometry(0.039, 0.002, 5, 24), darkSteel, 'negative-press-groove', 0, -0.134, 0, Math.PI / 2)

  // CylinderGeometry 主标签中心位于局部 -Z；转向相机侧，第一人称手持时能直接看到 BATTERY 字样。
  root.rotation.y = Math.PI
  return root
}

function capHandleGeometry() {
  const shape = new THREE.Shape()
  shape.moveTo(-0.06, 0)
  shape.lineTo(-0.054, 0.064)
  shape.quadraticCurveTo(-0.049, 0.092, -0.026, 0.108)
  shape.quadraticCurveTo(0, 0.119, 0.026, 0.108)
  shape.quadraticCurveTo(0.049, 0.092, 0.054, 0.064)
  shape.lineTo(0.06, 0)
  shape.closePath()
  const hole = new THREE.Path()
  hole.absellipse(0, 0.064, 0.024, 0.029, 0, Math.PI * 2, false, 0)
  shape.holes.push(hole)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.025, steps: 1, curveSegments: 18,
    bevelEnabled: true, bevelSegments: 2, bevelSize: 0.0035, bevelThickness: 0.003,
  })
  geometry.translate(0, 0, -0.0125)
  geometry.computeVertexNormals()
  return geometry
}

/** 参考老式不锈钢保温杯：圆柱杯身、收肩、旋盖、提环和金属挂绳。 */
export function buildWaterThermosMesh(kind: WaterKind): THREE.Group {
  const root = new THREE.Group()
  root.name = `${kind}-water-thermos-model`
  root.userData.detailedProvisionModel = 1

  const almond = kind === 'almond'
  const atlas = provisionTexture(
    almond ? 'item_almond_thermos_uv.png' : 'item_cashew_thermos_uv.png',
    almond
      ? [[171, 168, 156], [232, 221, 190], [79, 101, 65], [184, 180, 164]]
      : [[157, 154, 147], [190, 157, 110], [104, 75, 52], [169, 164, 151]],
  )
  const printedSteel = litMaterial({
    color: '#ffffff', map: atlas,
    emissive: '#ffffff', emissiveMap: atlas, emissiveIntensity: 0.055,
    roughness: almond ? 0.5 : 0.62, metalness: 0.48, envBase: 0.24,
  })
  const steel = litMaterial({ color: almond ? '#aaa9a2' : '#97968f', roughness: 0.33, metalness: 0.86, envBase: 0.38 })
  const edgeSteel = litMaterial({ color: '#c2c2bc', roughness: 0.24, metalness: 0.92, envBase: 0.46 })
  const cap = litMaterial({ color: almond ? '#202724' : '#29221d', roughness: 0.76, metalness: 0.03, envBase: 0.04 })
  const gasket = litMaterial({ color: almond ? '#55775b' : '#775634', roughness: 0.88, metalness: 0, envBase: 0.03 })

  // 侧壁使用完整环绕 UV；端盖与收肩保持真实金属材质，避免标签被拉到顶面。
  add(root, new THREE.CylinderGeometry(0.086, 0.086, 0.318, 32, 1, true), printedSteel, 'thermos-printed-body')
  add(root, new THREE.CylinderGeometry(0.087, 0.087, 0.012, 32), edgeSteel, 'thermos-base', 0, -0.164)
  add(root, new THREE.TorusGeometry(0.081, 0.005, 6, 32), steel, 'thermos-base-roll', 0, -0.168, 0, Math.PI / 2)
  add(root, new THREE.CylinderGeometry(0.057, 0.086, 0.055, 32), steel, 'thermos-shoulder', 0, 0.185)
  add(root, new THREE.CylinderGeometry(0.057, 0.057, 0.022, 28), steel, 'thermos-neck', 0, 0.222)
  add(root, new THREE.TorusGeometry(0.058, 0.004, 6, 28), edgeSteel, 'neck-thread-rim', 0, 0.229, 0, Math.PI / 2)
  add(root, new THREE.CylinderGeometry(0.066, 0.066, 0.018, 28), gasket, 'colored-gasket', 0, 0.238)

  // 黑色锥形旋盖与参考图一致，上方是带真实镂空的整体提环，而不是贴图画出来的洞。
  add(root, new THREE.CylinderGeometry(0.049, 0.068, 0.071, 28), cap, 'tapered-screw-cap', 0, 0.277)
  add(root, new THREE.TorusGeometry(0.062, 0.004, 5, 28), edgeSteel, 'cap-metal-band', 0, 0.245, 0, Math.PI / 2)
  add(root, capHandleGeometry(), cap, 'cap-carry-loop', 0, 0.299)

  // 细金属挂绳从提环绕到颈部，作为近景轮廓细节。
  const cordCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.028, 0.365, 0.013),
    new THREE.Vector3(0.074, 0.343, 0.019),
    new THREE.Vector3(0.079, 0.284, 0.015),
    new THREE.Vector3(0.064, 0.247, 0.008),
  ])
  add(root, new THREE.TubeGeometry(cordCurve, 12, 0.0023, 5, false), edgeSteel, 'cap-lanyard')

  // 标签主面朝第一人称相机；地面模型仍随掉落物整体缓慢旋转。
  root.rotation.y = Math.PI
  // 保温杯原型约 36cm 高，和同场景罐头/绷带相比显得过大；统一缩到约 28cm，
  // 地面掉落物、投掷物与第一人称手持模型都会继承同一比例。
  root.scale.setScalar(0.78)
  return root
}
