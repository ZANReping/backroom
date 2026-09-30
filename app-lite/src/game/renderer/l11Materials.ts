import * as THREE from 'three'
import { levelTexture, noiseTexture } from './shared'

export type L11MaterialKind = 'concrete' | 'asphalt' | 'brick' | 'plaster' | 'tile' | 'metal' | 'wood' | 'grass' | 'glass' | 'sealedglass' | 'paint'

const materialCache = new Map<string, THREE.MeshStandardMaterial>()
const prefixes: Partial<Record<L11MaterialKind, string>> = {
  concrete: 'l11_concrete', asphalt: 'l11_asphalt', brick: 'l11_brick', plaster: 'l11_plaster',
  tile: 'l11_tiles', metal: 'l11_metal', wood: 'l11_wood',
}

function mapTexture(name: string, fallback: () => THREE.Texture, linear = false): THREE.Texture {
  const texture = levelTexture(name, fallback)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace
  return texture
}

export function l11Material(kind: L11MaterialKind, tint?: string): THREE.MeshStandardMaterial {
  const key = `${kind}:${tint ?? ''}`
  const cached = materialCache.get(key)
  if (cached) return cached

  const color = tint ?? (kind === 'grass' ? '#65734a' : kind === 'sealedglass' ? '#263944' : '#ffffff')
  const fallback = () => noiseTexture(color, color, 128)
  let map: THREE.Texture | undefined
  let normalMap: THREE.Texture | undefined
  let roughnessMap: THREE.Texture | undefined
  if (prefixes[kind]) {
    const prefix = prefixes[kind]!
    map = mapTexture(`${prefix}.jpg`, fallback)
    normalMap = mapTexture(`${prefix}_normal.jpg`, () => noiseTexture('#8080ff', '#7f7fff'), true)
    roughnessMap = mapTexture(`${prefix}_roughness.jpg`, () => noiseTexture('#d8d8d8', '#c8c8c8'), true)
  } else if (kind === 'grass') {
    map = noiseTexture('#718451', '#425331', 128)
  } else if (kind === 'paint') {
    map = noiseTexture(color, color, 128)
  }

  const envBase = kind === 'metal' ? 0.5 : kind === 'glass' ? 0.42 : kind === 'sealedglass' ? 0.28 : 0.18
  const params: THREE.MeshStandardMaterialParameters = {
    color,
    ...(map?{map}:{}),
    ...(normalMap?{normalMap}:{}),
    ...(roughnessMap?{roughnessMap}:{}),
    roughness: kind === 'concrete' ? 0.8 : kind === 'asphalt' ? 0.94 : kind === 'metal' ? 0.34 : kind === 'wood' ? 0.7 : kind === 'glass' ? 0.14 : kind === 'sealedglass' ? 0.24 : 0.72,
    metalness: kind === 'metal' ? 0.65 : kind === 'sealedglass' ? 0.3 : kind === 'glass' ? 0.05 : 0,
    envMapIntensity: envBase,
    emissive: '#ffffff',
    ...(map?{emissiveMap:map}:{}),
    emissiveIntensity: kind==='glass'||kind==='sealedglass'?0:0.025,
  }
  const material = kind === 'glass'
    ? new THREE.MeshPhysicalMaterial({ ...params, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ ...params, transparent: false, side: THREE.DoubleSide })
  material.userData.shared = true
  material.userData.envBase = envBase
  if(kind!=='glass'&&kind!=='sealedglass'){
    material.userData.l10Wettable=true
    material.userData.l10BaseRoughness=material.roughness
    material.userData.l10BaseEnv=envBase
  }
  materialCache.set(key, material)
  return material
}
