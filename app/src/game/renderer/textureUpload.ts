import type * as THREE from 'three'

type UploadRecord = { version: number; sourceVersion: number }

const records = new WeakMap<THREE.Texture, WeakMap<THREE.WebGLRenderer, UploadRecord>>()
const disposeHooks = new WeakSet<THREE.Texture>()

function sourceVersion(texture: THREE.Texture) {
  return texture.source?.version ?? 0
}

function ensureRecordMap(texture: THREE.Texture) {
  let map = records.get(texture)
  if (!map) {
    map = new WeakMap<THREE.WebGLRenderer, UploadRecord>()
    records.set(texture, map)
  }
  if (!disposeHooks.has(texture)) {
    texture.addEventListener('dispose', () => records.delete(texture))
    disposeHooks.add(texture)
  }
  return map
}

/** Returns whether this renderer already owns the current texture upload. */
export function textureUploadReady(renderer: THREE.WebGLRenderer, texture: THREE.Texture): boolean {
  const record = records.get(texture)?.get(renderer)
  return !!record && record.version === texture.version && record.sourceVersion === sourceVersion(texture)
}

/** Uploads one texture version once per renderer. Returns true when a call was made. */
export function uploadTexture(renderer: THREE.WebGLRenderer, texture: THREE.Texture): boolean {
  if (textureUploadReady(renderer, texture)) return false
  renderer.initTexture(texture)
  ensureRecordMap(texture).set(renderer, { version: texture.version, sourceVersion: sourceVersion(texture) })
  return true
}
