import * as THREE from 'three'
import { levelTexture, litMaterial } from './shared'

const solidFallback = (pixels: number[][], width: number, height: number) => {
  const data = new Uint8Array(pixels.flat())
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
  texture.needsUpdate = true
  return texture
}

function cannedLabelTexture() {
  const texture = levelTexture('item_canned_label_uv.png', () => solidFallback([
    [176, 55, 42, 255], [223, 190, 116, 255], [86, 93, 55, 255], [176, 55, 42, 255],
    [220, 190, 129, 255], [176, 55, 42, 255], [220, 190, 129, 255], [86, 93, 55, 255],
  ], 4, 2))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  // 三张近方形标签环绕罐身，保持生成式圆章与麦穗图案的正确纵横比。
  texture.repeat.set(3, 1)
  return texture
}

function bandageGauzeTexture() {
  const texture = levelTexture('item_bandage_gauze_uv.png', () => solidFallback([
    [231, 225, 207, 255], [196, 190, 174, 255],
    [203, 197, 181, 255], [239, 233, 215, 255],
  ], 2, 2))
  texture.colorSpace = THREE.SRGBColorSpace
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
  mesh.userData.supplyPart = name
  mesh.position.set(x, y, z)
  mesh.rotation.set(rx, ry, rz)
  root.add(mesh)
  return mesh
}

/** 旧式无品牌罐装食品：纸标签、卷边端盖、压槽与易拉环均为独立轮廓。 */
export function buildCannedFoodMesh(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'canned-food-model'
  root.userData.detailedSupplyModel = 1

  const labelTexture = cannedLabelTexture()
  const metal = litMaterial({ color: '#9c9b94', emissive: '#555550', emissiveIntensity: 0.1, roughness: 0.42, metalness: 0.72, envBase: 0.25 })
  const edgeMetal = litMaterial({ color: '#bebbb1', emissive: '#66645f', emissiveIntensity: 0.1, roughness: 0.3, metalness: 0.82, envBase: 0.34 })
  const grooveMetal = litMaterial({ color: '#666660', emissive: '#353532', emissiveIntensity: 0.08, roughness: 0.5, metalness: 0.68, envBase: 0.2 })
  const label = litMaterial({
    color: '#ffffff', map: labelTexture,
    emissive: '#ffffff', emissiveMap: labelTexture, emissiveIntensity: 0.22,
    roughness: 0.9, metalness: 0, envBase: 0.03,
  })

  add(root, new THREE.CylinderGeometry(0.098, 0.098, 0.202, 20), metal, 'tin-body')
  // openEnded 标签套筒只覆盖罐身侧壁，不让纸张错误铺到金属盖面。
  add(root, new THREE.CylinderGeometry(0.101, 0.101, 0.158, 24, 1, true), label, 'paper-label', 0, -0.004)
  add(root, new THREE.BoxGeometry(0.004, 0.154, 0.024), label, 'label-overlap-seam', 0.1015, -0.004)

  add(root, new THREE.CylinderGeometry(0.101, 0.101, 0.011, 24), edgeMetal, 'top-lid', 0, 0.1055)
  add(root, new THREE.CylinderGeometry(0.101, 0.101, 0.011, 24), edgeMetal, 'bottom-lid', 0, -0.1055)
  add(root, new THREE.TorusGeometry(0.098, 0.006, 6, 24), edgeMetal, 'top-rolled-seam', 0, 0.111, 0, Math.PI / 2)
  add(root, new THREE.TorusGeometry(0.098, 0.006, 6, 24), edgeMetal, 'bottom-rolled-seam', 0, -0.111, 0, Math.PI / 2)
  add(root, new THREE.TorusGeometry(0.078, 0.0026, 5, 24), grooveMetal, 'top-press-groove', 0, 0.1125, 0, Math.PI / 2)
  add(root, new THREE.TorusGeometry(0.078, 0.0026, 5, 24), grooveMetal, 'bottom-press-groove', 0, -0.1125, 0, Math.PI / 2)

  const tab = add(root, new THREE.TorusGeometry(0.021, 0.004, 5, 14), edgeMetal, 'pull-tab', 0, 0.117, 0.013, Math.PI / 2)
  tab.scale.x = 1.45
  add(root, new THREE.CylinderGeometry(0.006, 0.006, 0.006, 10), grooveMetal, 'pull-tab-rivet', 0, 0.118, -0.008)
  add(root, new THREE.BoxGeometry(0.011, 0.004, 0.027), edgeMetal, 'pull-tab-bridge', 0, 0.117, -0.001)
  return root
}

function bandageTailGeometry() {
  const centers = [
    new THREE.Vector3(-0.012, -0.054, 0.015),
    new THREE.Vector3(0.045, -0.077, 0.033),
    new THREE.Vector3(0.11, -0.088, 0.038),
    new THREE.Vector3(0.18, -0.108, 0.018),
    new THREE.Vector3(0.25, -0.137, -0.014),
  ]
  const halfWidth = 0.052
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (let i = 0; i < centers.length; i++) {
    const p = centers[i]
    positions.push(p.x, p.y, p.z - halfWidth, p.x, p.y, p.z + halfWidth)
    uvs.push(i * 0.7, 0, i * 0.7, 1)
    if (i < centers.length - 1) {
      const a = i * 2
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

/** 卷状医用绷带：织纹卷体、同心层、纸芯、弯曲垂带与少量散纱。 */
export function buildBandageMesh(): THREE.Group {
  const root = new THREE.Group()
  root.name = 'bandage-roll-model'
  root.userData.detailedSupplyModel = 1

  const gauzeTexture = bandageGauzeTexture()
  const gauze = litMaterial({
    color: '#f0eadb', map: gauzeTexture,
    emissive: '#ffffff', emissiveMap: gauzeTexture, emissiveIntensity: 0.18,
    roughness: 0.98, metalness: 0, envBase: 0.02, side: THREE.DoubleSide,
  })
  const layer = litMaterial({ color: '#d8d1bf', emissive: '#b8b09f', emissiveIntensity: 0.12, roughness: 1, metalness: 0, envBase: 0.01 })
  const core = litMaterial({ color: '#807767', emissive: '#4a443a', emissiveIntensity: 0.1, roughness: 1, metalness: 0, envBase: 0.01, side: THREE.DoubleSide })

  // CylinderGeometry 的 0/1/2 材质组分别对应侧壁、顶面和底面；三面都保留棉纱 UV。
  add(root, new THREE.CylinderGeometry(0.096, 0.096, 0.116, 24, 1, false), [gauze, gauze, gauze], 'gauze-roll', 0, 0, 0, Math.PI / 2)
  for (const z of [-0.06, 0.06]) {
    add(root, new THREE.TorusGeometry(0.085, 0.0032, 4, 24), layer, `outer-layer-${z > 0 ? 'front' : 'back'}`, 0, 0, z)
    add(root, new THREE.TorusGeometry(0.068, 0.0028, 4, 24), layer, `middle-layer-${z > 0 ? 'front' : 'back'}`, 0, 0, z + Math.sign(z) * 0.001)
    add(root, new THREE.TorusGeometry(0.049, 0.0025, 4, 20), layer, `inner-layer-${z > 0 ? 'front' : 'back'}`, 0, 0, z + Math.sign(z) * 0.002)
    add(root, new THREE.CircleGeometry(0.022, 16), core, `roll-core-${z > 0 ? 'front' : 'back'}`, 0, 0, z + Math.sign(z) * 0.004, 0, z < 0 ? Math.PI : 0)
    add(root, new THREE.TorusGeometry(0.025, 0.0035, 4, 16), layer, `core-rim-${z > 0 ? 'front' : 'back'}`, 0, 0, z + Math.sign(z) * 0.005)
  }

  add(root, bandageTailGeometry(), gauze, 'loose-gauze-tail')
  const threadMat = litMaterial({ color: '#ddd5c2', emissive: '#b8b09f', emissiveIntensity: 0.12, roughness: 1, envBase: 0.01 })
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.245, -0.138, -0.014 + side * 0.045),
      new THREE.Vector3(0.272, -0.145, -0.02 + side * 0.049),
      new THREE.Vector3(0.292, -0.155, -0.027 + side * 0.053),
    ])
    add(root, new THREE.TubeGeometry(curve, 4, 0.0014, 4, false), threadMat, `frayed-thread-${side < 0 ? 'left' : 'right'}`)
  }
  return root
}
