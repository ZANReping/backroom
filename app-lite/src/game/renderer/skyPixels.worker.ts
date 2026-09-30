import { SKY_PROFILES, renderSkyPixels } from './skyPixels'

self.onmessage = ({ data }: MessageEvent<{ id: number }>) => {
  try {
    const pixels = renderSkyPixels(SKY_PROFILES[data.id], data.id)
    self.postMessage({ id: data.id, pixels: pixels.buffer }, { transfer: [pixels.buffer] })
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) })
  }
}
