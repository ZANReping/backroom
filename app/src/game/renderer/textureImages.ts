import * as THREE from 'three'

// Decode compressed bytes asynchronously. createImageBitmap(HTMLImageElement)
// can perform the expensive pixel conversion synchronously on the render thread.
const MAX_IMAGE_BYTES = 16 * 1024 * 1024
const MAX_READY_BYTES = 64 * 1024 * 1024
const waiting: { run: () => Promise<ImageBitmap | null>; resolve: (image: ImageBitmap | null) => void }[] = []
let active = 0, readyBytes = 0

function pump() {
  while (active < 2 && waiting.length) {
    const job = waiting.shift()!
    active++
    void job.run().then(job.resolve, () => job.resolve(null)).finally(() => { active--; pump() })
  }
}

function decodeBitmap(image: HTMLImageElement, url: string, flipY: boolean, premultiplyAlpha: boolean): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== 'function' || typeof fetch !== 'function'
    || image.width * image.height * 4 > MAX_IMAGE_BYTES || waiting.length >= 32) return Promise.resolve(null)
  return new Promise(resolve => {
    waiting.push({ resolve, run: async () => {
      const controller = new AbortController()
      let expired = false, timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<null>(done => {
        timer = setTimeout(() => { expired = true; controller.abort(); done(null) }, 5000)
      })
      const decode = fetch(url, { signal: controller.signal }).then(response => {
        if (!response.ok) throw new Error(`Texture response ${response.status}`)
        return response.blob()
      }).then(blob => createImageBitmap(blob, {
        imageOrientation: flipY ? 'flipY' : 'none',
        premultiplyAlpha: premultiplyAlpha ? 'premultiply' : 'none',
        colorSpaceConversion: 'none',
      })).then(bitmap => {
        if (expired) { bitmap.close(); return null }
        return bitmap
      })
      try { return await Promise.race([decode, timeout]) }
      catch { return null } // The already decoded HTML image remains usable.
      finally { clearTimeout(timer) }
    } })
    pump()
  })
}

type Entry = {
  texture: THREE.Texture; image: HTMLImageElement; url: string; source: THREE.Source<unknown>
  bitmap: ImageBitmap | null; bytes: number; epoch: number; uploaded: boolean; pending: boolean
}
const entries = new WeakMap<THREE.Texture, Entry>()
const ready = new Set<Entry>()

function release(entry: Entry) {
  if (!entry.bitmap) return
  // Restore an ordinary image without dirtying the Source: its pixels are the
  // same, and the current GPU allocation stays valid. Later quality changes,
  // context restoration and another WebGLRenderer can always upload this image.
  if (entry.source.data === entry.bitmap) entry.source.data = entry.image
  entry.bitmap.close(); entry.bitmap = null
  ready.delete(entry); readyBytes -= entry.bytes; entry.bytes = 0
}

function retain(entry: Entry, bitmap: ImageBitmap) {
  entry.bitmap = bitmap; entry.bytes = bitmap.width * bitmap.height * 4
  entry.source.data = bitmap
  ready.add(entry); readyBytes += entry.bytes
  while (readyBytes > MAX_READY_BYTES) release(ready.values().next().value!)
}

/** Publish the complete image only after optional asynchronous conversion.
 * Bitmaps are temporary upload staging buffers, never an unbounded image cache.
 */
export async function publishTextureImage(texture: THREE.Texture, loaded: THREE.Texture, url: string): Promise<void> {
  const image = loaded.image as HTMLImageElement
  try { await image.decode?.() } catch { /* TextureLoader's normal fallback remains available. */ }
  const bitmap = await decodeBitmap(image, url, loaded.flipY, loaded.premultiplyAlpha)
  // Dispose while the placeholder still has its old Source. Swapping first
  // corrupts Three's per-Source GPU ownership when the texture is retired later.
  texture.dispose()
  texture.source = loaded.source
  const flags = texture as unknown as {
    isDataTexture?: boolean; isCanvasTexture?: boolean; isCompressedTexture?: boolean
    isVideoTexture?: boolean; isFramebufferTexture?: boolean
  }
  flags.isDataTexture = false; flags.isCanvasTexture = false; flags.isCompressedTexture = false
  flags.isVideoTexture = false; flags.isFramebufferTexture = false
  texture.flipY = loaded.flipY; texture.premultiplyAlpha = loaded.premultiplyAlpha
  texture.unpackAlignment = loaded.unpackAlignment; texture.format = loaded.format
  texture.type = loaded.type; texture.internalFormat = loaded.internalFormat
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true

  let entry = entries.get(texture)
  if (!entry) {
    entry = { texture, image, url, source: texture.source, bitmap: null, bytes: 0, epoch: 0, uploaded: false, pending: false }
    entries.set(texture, entry)
    const current = entry, onUpdate = texture.onUpdate
    texture.onUpdate = updated => {
      current.uploaded = true
      release(current)
      onUpdate?.call(texture, updated)
    }
    texture.addEventListener('dispose', () => {
      current.epoch++; current.uploaded = false; current.pending = false
      release(current)
    })
  }
  Object.assign(entry, { image, url, source: texture.source, uploaded: false, pending: false })
  if (bitmap) retain(entry, bitmap)
  texture.userData.loadedImage = 1
  texture.needsUpdate = true
}

/** A retired cached image may be staged again before a new chunk uses it.
 * If a draw wins the race, keep its upload and discard the unnecessary bitmap.
 */
export function prepareCachedTextureImage(texture: THREE.Texture): void {
  const entry = entries.get(texture)
  if (!entry || entry.uploaded || entry.bitmap || entry.pending || texture.source !== entry.source) return
  entry.pending = true
  const epoch = entry.epoch, source = entry.source
  void decodeBitmap(entry.image, entry.url, texture.flipY, texture.premultiplyAlpha).then(bitmap => {
    if (entry.epoch !== epoch || entry.source !== source || texture.source !== source || entry.uploaded) { bitmap?.close(); return }
    if (bitmap) { retain(entry, bitmap); texture.needsUpdate = true }
  }).finally(() => { if (entry.epoch === epoch) entry.pending = false })
}
