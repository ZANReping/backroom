import * as THREE from 'three'

const OMIT = new Set(['id', 'uuid', 'name', 'version', '_listeners'])
const encode = (value: unknown, seen = new Set<object>()): string | undefined => {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'number') return `number:${Object.is(value,-0)?'-0':String(value)}`
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value !== 'object') return undefined
  if ((value as THREE.Texture).isTexture) return `texture:${(value as THREE.Texture).uuid}`
  if ((value as THREE.Color).isColor) { const v = value as THREE.Color; return `color:${v.r},${v.g},${v.b}` }
  if ((value as THREE.Vector2).isVector2) { const v = value as THREE.Vector2; return `v2:${v.x},${v.y}` }
  if ((value as THREE.Vector3).isVector3) { const v = value as THREE.Vector3; return `v3:${v.x},${v.y},${v.z}` }
  if ((value as THREE.Vector4).isVector4) { const v = value as THREE.Vector4; return `v4:${v.x},${v.y},${v.z},${v.w}` }
  if ((value as THREE.Euler).isEuler) { const v = value as THREE.Euler; return `euler:${v.x},${v.y},${v.z},${v.order}` }
  if (seen.has(value)) return undefined
  seen.add(value)
  if (Array.isArray(value)) {
    const a = value.map((v) => encode(v, seen))
    seen.delete(value)
    return a.some((v) => v === undefined) ? undefined : `[${a.join(',')}]`
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>
    const prototype = Object.getPrototypeOf(object)
    if (prototype !== Object.prototype && prototype !== null) return undefined
    const parts: string[] = []
    for (const key of Object.keys(object).sort()) {
      const encoded = encode(object[key], seen); if (encoded === undefined) return undefined
      parts.push(`${JSON.stringify(key)}:${encoded}`)
    }
    seen.delete(object)
    return `{${parts.join(',')}}`
  }
  return undefined
}

export const materialBatchKey = (mat: THREE.Material, diffuseColor?: THREE.Color) => {
  if ((mat as THREE.ShaderMaterial).isShaderMaterial || mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile || mat.clippingPlanes?.length) return `unique:${mat.uuid}`
  const props: Record<string, unknown> = {}
  for (const key of Object.keys(mat as unknown as Record<string, unknown>).sort()) if (!OMIT.has(key)) props[key] = key === 'color' && diffuseColor ? diffuseColor : (mat as unknown as Record<string, unknown>)[key]
  const encoded = encode(props)
  return encoded === undefined ? `unique:${mat.uuid}` : `${mat.type}|${encoded}`
}
