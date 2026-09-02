// Object 15「火盐」：带真实 UV 的六棱矿晶簇。供地面掉落、投掷物与第一人称手持共用。
import * as THREE from 'three'
import { levelTexture, litMaterial, noiseTexture } from './shared'

function crystalMaterial(tint: string, glow: string, intensity: number) {
  const uv = levelTexture('item_firesalt_crystal_uv.png', () => noiseTexture('#e76c25', '#ffb34c', 192))
  uv.colorSpace = THREE.SRGBColorSpace
  uv.repeat.set(1.15, 1.9)
  return litMaterial({
    color: tint,
    map: uv,
    emissive: glow,
    emissiveIntensity: intensity,
    roughness: 0.34,
    metalness: 0.04,
    envBase: 0.5,
    flatShading: true,
  })
}

/** 根节点底面位于 y=0，整体尺寸约 23cm，避免旧方块碎晶的玩具感。 */
export function buildFiresaltMesh(): THREE.Group {
  const root = new THREE.Group()
  const mats = [
    crystalMaterial('#ffb15d', '#6d1605', 0.34),
    crystalMaterial('#ff7b32', '#8a2108', 0.42),
    crystalMaterial('#ffd07a', '#6f1c05', 0.3),
  ]

  const addCrystal = (
    x: number, z: number, height: number, radius: number,
    leanX: number, leanZ: number, material: THREE.Material,
  ) => {
    const g = new THREE.Group()
    // 纵向略收尖的晶柱与独立晶尖均自带完整 0..1 UV；六边切面会真实捕获高光。
    const shaftH = height * 0.72
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius, shaftH, 6, 2, false), material)
    shaft.position.y = shaftH * 0.5
    shaft.castShadow = true; shaft.receiveShadow = true
    const tip = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.72, height * 0.28, 6, 1, false), material)
    tip.position.y = shaftH + height * 0.14
    tip.rotation.y = Math.PI / 6
    tip.castShadow = true; tip.receiveShadow = true
    g.add(shaft, tip)
    g.position.set(x, 0.012, z)
    g.rotation.x = leanX
    g.rotation.z = leanZ
    root.add(g)
  }

  // 一枚主晶、三枚伴生晶和两枚低矮断晶，轮廓从各角度都不再是三只长方体。
  addCrystal(-0.025, 0.006, 0.235, 0.047, 0.07, -0.13, mats[0])
  addCrystal(0.047, -0.018, 0.17, 0.039, -0.12, 0.24, mats[1])
  addCrystal(-0.067, -0.028, 0.14, 0.034, 0.18, -0.32, mats[2])
  addCrystal(0.015, 0.056, 0.125, 0.031, -0.2, 0.12, mats[1])
  addCrystal(0.078, 0.047, 0.09, 0.027, 0.13, 0.42, mats[0])
  addCrystal(-0.085, 0.046, 0.08, 0.025, -0.16, -0.46, mats[2])

  const matrix = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.105, 0),
    litMaterial({
      color: '#8b3218', map: levelTexture('item_firesalt_crystal_uv.png', () => noiseTexture('#9b3518', '#d85b22', 128)),
      emissive: '#421006', emissiveIntensity: 0.2, roughness: 0.62, metalness: 0.02, envBase: 0.24,
      flatShading: true,
    }),
  )
  matrix.scale.set(1.05, 0.24, 0.82)
  matrix.position.y = 0.012
  matrix.rotation.y = 0.38
  matrix.castShadow = true; matrix.receiveShadow = true
  root.add(matrix)

  // 基部散落的薄片使晶簇与地面自然衔接，也强化受到冲击就会崩裂的质感。
  for (const [x, z, r, ry] of [[-0.105, 0.015, 0.027, 0.2], [0.105, -0.016, 0.024, -0.5], [0.012, -0.092, 0.022, 0.8]] as const) {
    const chip = new THREE.Mesh(new THREE.OctahedronGeometry(r, 0), mats[1])
    chip.scale.y = 0.42
    chip.position.set(x, r * 0.35, z)
    chip.rotation.y = ry
    chip.castShadow = true
    root.add(chip)
  }

  return root
}
