export type Ctx = CanvasRenderingContext2D
export interface PbrDraw {
  size: number
  color: (x: Ctx, s: number) => void
  height?: (x: Ctx, s: number) => void
  rough?: (x: Ctx, s: number) => void
  metal?: (x: Ctx, s: number) => void
  normalStrength?: number
}
export function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296) }
export type PhonoRecipe = { surface: 'wood' | 'brass' | 'record' | 'felt' | 'plate'; variant?: 'new' | 'old'; inner?: boolean; label?: string }
export type PbrPlane = { width: number; height: number; pixels: Uint8ClampedArray<ArrayBuffer> }
export type PbrPixels = Partial<Record<'map' | 'normalMap' | 'roughnessMap' | 'metalnessMap', PbrPlane>>
