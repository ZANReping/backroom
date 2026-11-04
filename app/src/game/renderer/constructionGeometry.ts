import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Matching frustum sections share their exact radius at each stripe boundary. */
export function stripedConeGeometry(spec: {
  bottomY: number; topY: number; bottomRadius: number; topRadius: number
  bands: readonly (readonly [number, number])[]; segments?: number
}) {
  const { bottomY, topY, bottomRadius, topRadius, bands, segments = 16 } = spec
  const radiusAt = (y: number) => THREE.MathUtils.lerp(bottomRadius, topRadius, (y - bottomY) / (topY - bottomY))
  const cuts = [...new Set([bottomY, topY, ...bands.flatMap(b => [...b])])].filter(y => y >= bottomY && y <= topY).sort((a, b) => a - b)
  const body: THREE.BufferGeometry[] = [], reflective: THREE.BufferGeometry[] = []
  for (let i = 1; i < cuts.length; i++) {
    const lo = cuts[i - 1], hi = cuts[i], mid = (lo + hi) / 2
    const geometry = new THREE.CylinderGeometry(radiusAt(hi), radiusAt(lo), hi - lo, segments, 1, true)
    geometry.translate(0, mid, 0)
    const p = geometry.getAttribute('position'), uv = geometry.getAttribute('uv')
    for (let v = 0; v < p.count; v++) uv.setY(v, (p.getY(v) - bottomY) / (topY - bottomY))
    ;(bands.some(([a, b]) => mid > a && mid < b) ? reflective : body).push(geometry)
  }
  if (topRadius > 0) {
    const cap = new THREE.CircleGeometry(topRadius, segments)
    cap.rotateX(-Math.PI / 2); cap.translate(0, topY, 0); body.push(cap)
  }
  const merge = (parts: THREE.BufferGeometry[]) => {
    if (!parts.length) return null
    const result = mergeGeometries(parts)
    parts.forEach(g => g.dispose())
    return result
  }
  return { body: merge(body)!, reflective: merge(reflective)! }
}

/** Orient supports from actual attachment points rather than unrelated Euler angles. */
export function supportGeometry(from: THREE.Vector3, to: THREE.Vector3, width: number, depth = width, round = false) {
  const direction = to.clone().sub(from), length = direction.length()
  const geometry = round ? new THREE.CylinderGeometry(width / 2, width / 2, length, 6) : new THREE.BoxGeometry(width, length, depth)
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.divideScalar(length)))
  geometry.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
  return geometry
}
