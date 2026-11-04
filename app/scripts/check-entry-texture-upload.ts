import assert from 'node:assert/strict'
import * as THREE from 'three'
import { textureUploadReady, uploadTexture } from '../src/game/renderer/textureUpload'

let checks = 0
const check = (value: unknown, message: string) => { assert.ok(value, message); checks++ }
const renderer = () => {
  const calls: THREE.Texture[] = []
  return { calls, initTexture(texture: THREE.Texture) { calls.push(texture) } } as unknown as THREE.WebGLRenderer & { calls: THREE.Texture[] }
}

const texture = new THREE.Texture()
const a = renderer(), b = renderer()
check(!textureUploadReady(a, texture), 'not ready before upload')
check(uploadTexture(a, texture), 'first upload invokes renderer')
check(a.calls.length === 1, 'first upload count')
check(textureUploadReady(a, texture), 'same renderer is ready')
check(!uploadTexture(a, texture), 'duplicate upload is skipped')
check(a.calls.length === 1, 'duplicate does not invoke renderer')
check(uploadTexture(b, texture), 'second renderer uploads independently')
check(b.calls.length === 1, 'second renderer upload count')

texture.needsUpdate = true
check(uploadTexture(a, texture), 'texture needsUpdate creates a new version')
texture.source.needsUpdate = true
check(uploadTexture(a, texture), 'source needsUpdate creates a new version')

const failing = renderer()
let fail = true
failing.initTexture = ((original) => (value: THREE.Texture) => { if (fail) { fail = false; throw new Error('expected upload failure') } original.call(failing, value) })(failing.initTexture)
assert.throws(() => uploadTexture(failing, texture), /expected upload failure/)
check(uploadTexture(failing, texture), 'failed upload can retry')

texture.dispatchEvent({ type: 'dispose' })
check(uploadTexture(a, texture), 'dispose clears upload records')
check(a.calls.length === 4, 'dispose reupload count')

texture.dispose()
console.log(JSON.stringify({ passed: checks }))
