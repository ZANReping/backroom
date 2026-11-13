import { phonoTextureRecipe } from './phonoTextureRecipe'
import { normalPixels } from './normalPixels'
import type { Ctx, PhonoRecipe, PbrPixels } from './pbrDraw'

self.onmessage = ({ data }: MessageEvent<{ id: number; recipe?: PhonoRecipe; height?: { width: number; height: number; pixels: Uint8ClampedArray<ArrayBuffer>; strength: number } }>) => {
  try {
    const started = performance.now(), planes: PbrPixels = {}
    if (data.height) {
      const h = data.height
      planes.normalMap = { width: h.width, height: h.height, pixels: normalPixels(h.pixels, h.width, h.height, h.strength) }
    } else if (data.recipe) {
      const draw = phonoTextureRecipe(data.recipe)
      const paint = (fn: (ctx: Ctx, s: number) => void) => {
        const canvas = new OffscreenCanvas(draw.size, draw.size), ctx = canvas.getContext('2d')!
        fn(ctx as unknown as Ctx, draw.size)
        return { width: draw.size, height: draw.size, pixels: ctx.getImageData(0, 0, draw.size, draw.size).data }
      }
      planes.map = paint(draw.color)
      if (draw.height) { const h = paint(draw.height); planes.normalMap = { ...h, pixels: normalPixels(h.pixels, h.width, h.height, draw.normalStrength ?? 2) } }
      if (draw.rough) planes.roughnessMap = paint(draw.rough)
      if (draw.metal) planes.metalnessMap = paint(draw.metal)
    } else throw new Error('Missing PBR recipe')
    self.postMessage({ id: data.id, planes, ms: performance.now() - started }, { transfer: Object.values(planes).map(p => p.pixels.buffer) })
  } catch (error) { self.postMessage({ id: data.id, error: String(error) }) }
}
