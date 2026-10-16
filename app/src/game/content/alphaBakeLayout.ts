import type { Structure } from '../core/types'
import { alphaParts, isAlphaKind, type AlphaPart } from './alphaDecor'

export const ALPHA_BAKE_VERSION = 1
export const ALPHA_BAKE_DENSITY = 5
export interface AlphaBakePart {
  part: AlphaPart; structure: Structure; x: number; y: number; z: number; c: number; s: number
}
/** Stable order is shared by the offline integrator and the instanced scene. */
export function alphaBakeParts(structures: Structure[]): AlphaBakePart[] {
  const result: AlphaBakePart[] = []
  for (const structure of structures) {
    if (!isAlphaKind(structure.kind)) continue
    const angle = Number(structure.data?.deg ?? 0) * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
    for (const part of alphaParts(structure)) {
      const x = part.x + part.w / 2 - structure.w / 2, z = part.y + part.d / 2 - structure.h / 2
      result.push({ part, structure, x: structure.x + structure.w / 2 + x * c + z * s, y: part.z + part.h / 2, z: structure.y + structure.h / 2 - x * s + z * c, c:Math.cos(angle+(part.yaw??0)), s:Math.sin(angle+(part.yaw??0)) })
    }
  }
  return result
}
/** FNV over all lighting-relevant geometry, including sub-parts without collision. */
export function alphaBakeFingerprint(parts: AlphaBakePart[], lights: unknown): string {
  let hash = 2166136261
  const feed = (v: string) => { for (let i = 0; i < v.length; i++) hash = Math.imul(hash ^ v.charCodeAt(i), 16777619) }
  const encode=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='number'?Math.round(x*1e6)/1e6:x)
  feed(String(ALPHA_BAKE_VERSION)); feed(encode(lights))
  for (const p of parts) feed(encode([p.x,p.y,p.z,p.c,p.s,p.part.w,p.part.h,p.part.d,p.part.surface,p.part.color,p.part.shape]))
  return (hash >>> 0).toString(16).padStart(8, '0')
}
