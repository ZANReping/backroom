import assert from 'node:assert/strict'
import * as THREE from 'three'
import { prepareCachedTextureImage, publishTextureImage } from '../src/game/renderer/textureImages'

const savedFetch = globalThis.fetch, savedBitmap = globalThis.createImageBitmap
const textures: THREE.Texture[] = [], bitmaps: FakeBitmap[] = []
let checks = 0
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++ }
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
class FakeBitmap {
  width = 2048; height = 2048; closes = 0
  close() { this.closes++; this.width = this.height = 0 }
}
const image = { width: 2048, height: 2048, decode: async () => undefined } as HTMLImageElement
const make = () => { const t = new THREE.Texture(); textures.push(t); return t }
const loaded = new THREE.Texture(image)
const response = { ok: true, blob: async () => new Blob() } as Response
try {
  let inFlight = 0, maximum = 0, requests = 0
  const releaseRequests: (() => void)[] = []
  globalThis.fetch = (() => {
    requests++; maximum = Math.max(maximum, ++inFlight)
    return new Promise<Response>(resolve => releaseRequests.push(() => { inFlight--; resolve(response) }))
  }) as typeof fetch
  globalThis.createImageBitmap = ((_blob: Blob, options: ImageBitmapOptions) => {
    check(options.imageOrientation === 'flipY' && options.premultiplyAlpha === 'none' && options.colorSpaceConversion === 'none', 'bitmap options match normal Three Texture upload')
    const bitmap = new FakeBitmap(); bitmaps.push(bitmap)
    return Promise.resolve(bitmap as unknown as ImageBitmap)
  }) as typeof createImageBitmap
  const batch = Array.from({ length: 40 }, make)
  const jobs = batch.map(texture => publishTextureImage(texture, new THREE.Texture(image), '/fixture.png'))
  await flush()
  check(requests === 2 && maximum === 2, 'only two fetch/decode jobs start concurrently')
  check(batch.filter(t => t.userData.loadedImage).length === 6, 'queue overflow uses HTML fallback instead of retaining more work')
  while (releaseRequests.length) { releaseRequests.shift()!(); await flush() }
  await Promise.all(jobs)
  check(requests === 34 && maximum === 2, 'queue is capped at 32 plus two active jobs')
  check(bitmaps.filter(b => b.width > 0).length === 4, 'ready staging buffers are capped at 64 MiB')
  for (const texture of batch) {
    const source = texture.source, version = texture.version, sourceVersion = source.version
    if (texture.image instanceof FakeBitmap) {
      const bitmap = texture.image
      texture.onUpdate?.(texture)
      check(bitmap.closes === 1, 'first upload closes its staging bitmap once')
    }
    check(texture.image === image && texture.source === source && texture.version === version && source.version === sourceVersion, 'eviction/upload restores original image without dirtying source')
    texture.dispose()
  }
  check(bitmaps.every(b => b.closes === 1), 'all allocated bitmaps released exactly once')

  const oversizedImage = { width: 2049, height: 2048, decode: async () => undefined } as HTMLImageElement
  const oversized = make(), previousRequests = requests
  await publishTextureImage(oversized, new THREE.Texture(oversizedImage), '/oversized.png')
  check(requests === previousRequests && oversized.image === oversizedImage, 'images above 16 MiB bypass temporary bitmap allocation')

  globalThis.fetch = (async () => response) as typeof fetch
  const recycled = make(); let updates = 0
  recycled.onUpdate = () => { updates++ }
  await publishTextureImage(recycled, loaded, '/fixture.png')
  const first = recycled.image as FakeBitmap
  recycled.onUpdate?.(recycled)
  check(first.closes === 1 && updates === 1, 'existing onUpdate callback is preserved')
  recycled.dispose(); prepareCachedTextureImage(recycled); prepareCachedTextureImage(recycled)
  await flush()
  check(recycled.image instanceof FakeBitmap, 'retired texture prepares a new bitmap')
  const second = recycled.image as FakeBitmap
  recycled.dispose(); recycled.dispose()
  check(second.closes === 1 && recycled.image === image, 'repeated disposal closes staging once and restores image')

  // Delayed native work is discarded when a texture is uploaded or disposed.
  for (const winner of ['dispose', 'upload']) {
    let finish: ((bitmap: ImageBitmap) => void) | undefined
    globalThis.createImageBitmap = (() => new Promise<ImageBitmap>(resolve => { finish = resolve })) as typeof createImageBitmap
    prepareCachedTextureImage(recycled); await flush()
    check(!!finish, 'refresh decoder starts')
    const source = recycled.source, version = recycled.version
    if (winner === 'dispose') recycled.dispose(); else recycled.onUpdate?.(recycled)
    const late = new FakeBitmap(); finish!(late as unknown as ImageBitmap); await flush()
    check(late.closes === 1 && recycled.source === source && recycled.image === image && recycled.version === version, `${winner} prevents late publication and releases result`)
    recycled.dispose()
  }

  globalThis.createImageBitmap = (() => Promise.reject(new Error('decoder failure'))) as typeof createImageBitmap
  const failed = make(); await publishTextureImage(failed, new THREE.Texture(image), '/fixture.png')
  check(failed.image === image && failed.userData.loadedImage === 1, 'decode rejection retains the decoded HTML image')

  let finishLate: ((bitmap: ImageBitmap) => void) | undefined
  globalThis.createImageBitmap = (() => new Promise<ImageBitmap>(resolve => { finishLate = resolve })) as typeof createImageBitmap
  const timedOut = make(); await publishTextureImage(timedOut, new THREE.Texture(image), '/fixture.png')
  check(timedOut.image === image && timedOut.userData.loadedImage === 1, 'timeout falls back without blocking texture readiness')
  const late = new FakeBitmap(); finishLate!(late as unknown as ImageBitmap); await flush()
  check(late.closes === 1 && timedOut.image === image, 'bitmap arriving after timeout is closed')
} finally {
  for (const texture of textures) texture.dispose()
  globalThis.fetch = savedFetch; globalThis.createImageBitmap = savedBitmap
}
console.log(`texture image lifecycle regression passed: ${checks} checks`)
