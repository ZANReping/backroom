import * as THREE from 'three'
import type { GameMap } from '../world/mapgen'
import { bandOfPlayerZ, l11MapWater } from '../world/mapgen'
import { l11MetroRampHeight } from '../world/l11Metro'
import { l11TerrainHeight } from '../world/l11Hydrology'

/** Profiles also exist for retired generators/prototypes. They are not proof
 * that the current level has an outdoor sky. L4 has its own window/void fog. */
export function usesWorldSky(level: number): boolean {
  return level === 6 || level === 7 || level === 9 || level === 10 || level === 11
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export interface SkyOpening { x0: number; z0: number; x1: number; z1: number; height: number }
export interface SkyAccess {
  /** 0 stops both the sky draw and cloud render target updates. */
  amount: number
  /** Indoor distance atmosphere; independent of which direction the player looks. */
  enclosure: number
  opening?: SkyOpening
}

/** Only existing geometry supplies openings. No additional world generation,
 * ray marching, render passes, or camera-height-only metro classification. */
export function skyAccessAt(m: GameMap, level: number, x: number, y: number, feet: number, eye: number): SkyAccess {
  if (!usesWorldSky(level)) return { amount: 0, enclosure: 1 }
  if (level === 6 && bandOfPlayerZ(m, feet, x, y) < 0) return { amount: 0, enclosure: 1 }
  if (level === 7 && feet >= 2.65 && eye < 6 && m.up[Math.floor(y) * m.w + Math.floor(x)] === 1) {
    const door = m.structures.find(s => s.kind === 'hoteldoor' && s.data?.l7porch)
    // The entry cabin has no windows. Its sea door is its only sky aperture.
    if (door && !door.data?.open) return { amount: 0, enclosure: 1 }
  }
  if (level === 11 && m.inf && !l11MapWater(m, x, y)) {
    const wx = x + m.inf.ox, wy = y + m.inf.oy
    const i = Math.floor(y) * m.w + Math.floor(x)
    const ramp = l11MetroRampHeight(wx, wy, m.inf.seed)
    const ground = l11TerrainHeight(m.inf.seed, wx, wy)
    if ((ramp !== null || m.dn[i] === 1) && feet < ground - .2) {
      const sx = Math.round((wx - 27.5) / 512) * 512 + 26
      const sy = Math.round((wy - 125) / 512) * 512 + 120
      const height = l11TerrainHeight(m.inf.seed, sx + 1.5, sy)
      // This is the same 3 x 10 m open trench used by l11MetroRampHeight.
      // Below grade, a ray can see sky only if it exits through this opening.
      const opening = { x0: sx - m.inf.ox, z0: sy - m.inf.oy,
        x1: sx + 3 - m.inf.ox, z1: sy + 10 - m.inf.oy, height }
      const distance = Math.hypot(Math.max(opening.x0 - x, 0, x - opening.x1),
        Math.max(opening.z0 - y, 0, y - opening.z1))
      return { amount: distance < 48 ? 1 : 0, enclosure: smooth(.15, 3.2, height - eye),
        opening: eye < height ? opening : undefined }
    }
  }
  return { amount: 1, enclosure: 0 }
}

/** Match the end of opaque distance fog to the camera's real drawing range.
 * Otherwise clipped geometry reveals a different background even without sky. */
export function indoorFogRange(near: number, far: number, cameraFar: number): [number, number] {
  const end = Math.min(far, cameraFar * .94)
  return [Math.min(near, end * .72), end]
}

export function skyOpeningInView(opening: SkyOpening, camera: THREE.PerspectiveCamera,
  frustum = new THREE.Frustum(), matrix = new THREE.Matrix4(), bounds = new THREE.Box3()): boolean {
  camera.updateMatrixWorld()
  frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  bounds.min.set(opening.x0, opening.height - .015, opening.z0)
  bounds.max.set(opening.x1, opening.height + .015, opening.z1)
  return frustum.intersectsBox(bounds)
}

/** Shared shader contract for both HDR photographic and procedural skies.
 * Opening coordinates are camera-relative to remain stable during rebasing. */
export function skyVisibilityUniforms() {
  return { uSkyAmount: { value: 1 }, uSkyPortal: { value: 0 },
    uSkyOpening: { value: new THREE.Vector4() }, uSkyOpeningY: { value: 0 },
    uSkyIndoor: { value: new THREE.Color() } }
}
export type SkyVisibilityUniforms = ReturnType<typeof skyVisibilityUniforms>

export function setSkyAccess(u: SkyVisibilityUniforms, amount: number, eye: THREE.Vector3,
  fog: THREE.Color, opening?: SkyOpening) {
  u.uSkyAmount.value = Math.max(0, Math.min(1, amount))
  u.uSkyIndoor.value.copy(fog)
  u.uSkyPortal.value = opening ? 1 : 0
  if (opening) {
    u.uSkyOpening.value.set(opening.x0 - eye.x, opening.z0 - eye.z, opening.x1 - eye.x, opening.z1 - eye.z)
    u.uSkyOpeningY.value = opening.height - eye.y
  }
}

export const SKY_VISIBILITY_GLSL = /* glsl */`
uniform float uSkyAmount, uSkyPortal, uSkyOpeningY;
uniform vec4 uSkyOpening;
uniform vec3 uSkyIndoor;
float skyVisibility(vec3 direction) {
  if (uSkyPortal < .5) return uSkyAmount;
  if (direction.y <= .00001) return 0.;
  vec2 point = direction.xz * (uSkyOpeningY / direction.y);
  vec2 edge = min(point - uSkyOpening.xy, uSkyOpening.zw - point);
  float distance = min(edge.x, edge.y);
  // A subpixel feather prevents shimmer; the real trench walls still occlude.
  float width = max(.002, fwidth(distance));
  return uSkyAmount * smoothstep(-width, width, distance);
}
`
