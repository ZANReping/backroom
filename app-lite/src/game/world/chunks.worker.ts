import './mapgen'
import { infiniteImplFor } from './infiniteRegistry'
import type { LevelDef } from '../core/types'

self.onmessage = (event: MessageEvent<{ key: string; def: LevelDef; seed: number; cx: number; cy: number }>) => {
  const { key, def, seed, cx, cy } = event.data
  try {
    const raw = infiniteImplFor(def.id).genRaw(def, seed, cx, cy)
    // Each result has a single owner. Transfer the large grid buffers without copying.
    const buffers = new Set<ArrayBuffer>()
    for (const value of Object.values(raw)) if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) buffers.add(value.buffer)
    self.postMessage({ key, raw }, { transfer: [...buffers] })
  } catch (error) { self.postMessage({ key, error: String(error) }) }
}
