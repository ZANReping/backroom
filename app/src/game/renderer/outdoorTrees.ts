import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Structure } from '../core/types'
import { configureSurfaceTexture, getMaterialMode, levelTexture, litMaterial, mulberry, makeCanvasCtx, toTex } from './shared'
import { l11FoliageGeometry } from './l11FoliageGeometry'
import { withL10Wind } from './l10Wind'

// L9/L10 reuse L11's individual leaf islands and branched construction, not
// its municipal pruning or city-specific grading. Sources: L11-ASSET-SOURCES.md.
export const OUTDOOR_TREE_FORMS = ['round', 'columnar', 'forked', 'spreading', 'windswept', 'open'] as const
type Level = 9 | 10
type TreeGeometry = { trunk: THREE.BufferGeometry; branches: THREE.BufferGeometry; leaves: THREE.BufferGeometry }
const prototypes = new Map<string, TreeGeometry>()
const materials = new Map<string, THREE.MeshLambertMaterial | THREE.MeshStandardMaterial>()
const maxPrototypes = 48 // two levels × six silhouettes × four branch arrangements
export const outdoorTreeCacheInfo = () => ({ entries: prototypes.size, maxEntries: maxPrototypes })
const positiveMod = (n: number, m: number) => ((n % m) + m) % m

/** World coordinates survive chunk rebasing; finite recipe choices bound memory. */
export function outdoorTreeIdentity(s: Structure, level: Level, origin = { x: 0, y: 0 }) {
  const x = Math.round((s.x + origin.x) * 100), y = Math.round((s.y + origin.y) * 100)
  const seed = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ level * 7919) >>> 0
  const authored = Number(level === 9 ? s.data?.style ?? 0 : s.data?.v ?? 0)
  return { form: positiveMod(authored + (seed >>> 9), 6), arrangement: seed % 4, yaw: (seed % 360) * Math.PI / 180 }
}

function colorize(g: THREE.BufferGeometry, color: THREE.Color, variation = 0, seed = 1) {
  const p = g.getAttribute('position'), rgb = new Float32Array(p.count * 3), rnd = mulberry(seed)
  for (let i = 0; i < p.count; i++) {
    // Four vertices per leaf get the same shade; no painted triangular facets.
    const shade = 1 - variation * rnd()
    const end = variation ? Math.min(p.count, i + 4) : p.count
    for (; i < end; i++) { rgb[i * 3] = color.r * shade; rgb[i * 3 + 1] = color.g * shade; rgb[i * 3 + 2] = color.b * shade }
    i--
  }
  g.setAttribute('color', new THREE.BufferAttribute(rgb, 3))
  return g
}

function branch(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, segments = 7) {
  const length = a.distanceTo(b), g = new THREE.CylinderGeometry(r1, r0, length, segments, 1)
  const uv = g.getAttribute('uv') as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * (r0 + r1) * 1.7, uv.getY(i) * length * .7)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()))
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return g
}

/** The returned geometry is instance-owned; cached originals never enter a scene. */
export function outdoorTreeGeometry(level: Level, form: number, arrangement: number): TreeGeometry {
  form = positiveMod(form, 6); arrangement = positiveMod(arrangement, 4)
  const key = `${level}:${form}:${arrangement}`, cached = prototypes.get(key)
  if (cached) return { trunk: cached.trunk.clone(), branches: cached.branches.clone(), leaves: cached.leaves.clone() }
  const rnd = mulberry(level * 887 + form * 997 + arrangement * 701), k = level === 10 ? 1 : .69
  const crown: { center: THREE.Vector3; size: [number, number, number] }[] = []
  const lobe = (x: number, y: number, z: number, w: number, h: number, d: number) => crown.push({ center: new THREE.Vector3(x * k, y * k, z * k), size: [w * k, h * k, d * k] })
  if (form === 1) { // narrow, vertically tiered crown
    lobe(0, 5.85, 0, 1.7, 2.3, 1.65)
    for (let i = 0; i < 6; i++) { const a = i * 2.4; lobe(Math.cos(a) * .65, 3.65 + i * .29, Math.sin(a) * .65, 1.65, 1.9, 1.65) }
  } else if (form === 2) { // two leaders with a visible fork and uneven crown tips
    for (let i = 0; i < 6; i++) { const side = i % 2 ? 1 : -1; lobe(side * (1.05 + rnd() * .25), 4.45 + Math.floor(i / 2) * .58, (rnd() - .5) * 1.7, 2.2, 2.2, 2.1) }
  } else if (form === 4) { // coherent prevailing-wind lean, not random rotation alone
    lobe(.95, 5.9, 0, 2.2, 2.2, 2.1)
    for (let i = 0; i < 6; i++) { const a = i * 2.4; lobe(.7 + Math.cos(a) * 1.1, 4.45 + rnd() * .65, Math.sin(a) * 1.1, 2.4, 1.9, 2.2) }
  } else {
    const broad = form === 3, sparse = form === 5, radius = broad ? 1.5 : sparse ? 1.45 : 1.0
    lobe(sparse ? -.35 : 0, 5.85, 0, broad ? 2.6 : 2.1, 2.3, broad ? 2.6 : 2.1)
    for (let i = 0, n = sparse ? 4 : 6; i < n; i++) {
      const a = i * Math.PI * 2 / n + rnd() * .3, w = sparse ? 1.7 : broad ? 2.45 : 2.15
      lobe(Math.cos(a) * radius, 4.7 + (rnd() - .5) * .65, Math.sin(a) * radius, w, sparse ? 1.9 : broad ? 1.8 : 2.1, w)
    }
  }
  const radius = level === 9 ? .18 : .29, trunkH = 2.45 * k
  const trunk = branch(new THREE.Vector3(), new THREE.Vector3(0, trunkH, 0), radius, radius * .68, 9)
  const wood: THREE.BufferGeometry[] = [], foliage: THREE.BufferGeometry[] = []
  const bark = new THREE.Color(level === 9 ? '#c7c2b3' : '#e2d8bf').multiplyScalar(1.35)
  crown.forEach(({ center, size }, i) => {
    const a = new THREE.Vector3(0, trunkH - .15 * k, 0)
    const bend = center.clone().multiplyScalar(.48); bend.y = trunkH + (center.y - trunkH) * .5
    bend.x += (rnd() - .5) * .25 * k
    wood.push(branch(a, bend, radius * .65, .075 * k), branch(bend, center, .075 * k, .026 * k))
    for (let j = 0; j < 3; j++) {
      const end = center.clone().add(new THREE.Vector3((rnd() - .5) * size[0] * .9, size[1] * (.16 + rnd() * .12), (rnd() - .5) * size[2] * .9))
      wood.push(branch(center, end, .027 * k, .009 * k, 5))
    }
    // Copy the L11 CPU source before translating, coloring, or disposing it.
    const g = l11FoliageGeometry(...size, level === 9 ? 1 : .65).clone().translate(center.x, center.y, center.z)
    const tint = new THREE.Color(level === 9 ? '#cbd5b7' : '#e4e7c1')
    tint.offsetHSL((form - 2) * .004, 0, (i % 3 - 1) * .018)
    colorize(g, tint, .2, arrangement * 61 + i * 97 + 1); foliage.push(g)
  })
  const branches = colorize(mergeGeometries(wood)!, bark)
  const leaves = mergeGeometries(foliage)!
  colorize(trunk, bark); wood.forEach(g => g.dispose()); foliage.forEach(g => g.dispose())
  // L10 keeps the existing seven-metre envelope despite different silhouettes.
  leaves.computeBoundingBox()
  const sy = (level === 10 ? 7 : 4.85) / leaves.boundingBox!.max.y
  for (const g of [trunk, branches, leaves]) { g.scale(1, sy, 1); g.computeBoundingBox(); g.computeBoundingSphere() }
  const result = { trunk, branches, leaves }
  if (prototypes.size >= maxPrototypes) {
    const [oldKey, old] = prototypes.entries().next().value!
    prototypes.delete(oldKey); Object.values(old).forEach(g => g.dispose())
  }
  prototypes.set(key, result)
  return { trunk: trunk.clone(), branches: branches.clone(), leaves: leaves.clone() }
}

function texture(name: string, color: boolean, transparent = false) {
  return configureSurfaceTexture(levelTexture(name, () => {
    const [canvas, ctx] = makeCanvasCtx(1, 1)
    ctx.fillStyle = !color && name.includes('normal') ? '#8080ff' : '#ffffff'
    if (!transparent) ctx.fillRect(0, 0, 1, 1)
    const t = toTex(canvas)
    t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true
    return t
  }), color ? THREE.SRGBColorSpace : THREE.NoColorSpace)
}

function treeMaterial(level: Level, leaf: boolean) {
  const key = `${getMaterialMode()}:${level}:${leaf}`, cached = materials.get(key)
  if (cached) return cached
  const prefix = leaf ? 'l11-foliage/2k/' : 'l11-bark/2k/'
  const m = litMaterial({ color: '#ffffff', vertexColors: true, map: texture(prefix + (leaf ? 'leaves.png' : 'color.jpg'), true, leaf),
    normalMap: texture(prefix + 'normal.jpg', false), normalScale: new THREE.Vector2(leaf ? .08 : .3, leaf ? .08 : .3),
    roughnessMap: getMaterialMode() === 'realistic' ? texture(prefix + 'roughness.jpg', false) : undefined,
    roughness: 1, envBase: leaf ? .1 : .04, alphaTest: leaf ? .42 : 0, side: leaf ? THREE.DoubleSide : THREE.FrontSide })
  if (leaf) {
    const previous = m.onBeforeCompile, previousKey = m.customProgramCacheKey()
    m.onBeforeCompile = (shader, renderer) => {
      previous.call(m, shader, renderer)
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal*=faceDirection;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor=max(roughnessFactor,.8);')
    }
    m.customProgramCacheKey = () => previousKey + ':outdoor-leaf-envelope-v1'
    if (level === 10) withL10Wind(m, { amp: .055, mode: 'leaf' })
  }
  m.name = `l${level}-cc0-tree-${leaf ? 'leaves' : 'bark'}`
  m.userData.shared = true
  if (level === 10) Object.assign(m.userData, { l10Wettable: 1, l10BaseRoughness: 1, l10BaseEnv: leaf ? .1 : .04 })
  materials.set(key, m)
  return m
}

export function buildOutdoorTree(s: Structure, level: Level, origin = { x: 0, y: 0 }) {
  const id = outdoorTreeIdentity(s, level, origin), geometries = outdoorTreeGeometry(level, id.form, id.arrangement)
  const group = new THREE.Group()
  for (const part of ['trunk', 'branches', 'leaves'] as const) {
    const mesh = new THREE.Mesh(geometries[part], treeMaterial(level, part === 'leaves'))
    mesh.name = `outdoor-tree-${part}`; mesh.castShadow = mesh.receiveShadow = true
    if (part !== 'trunk') mesh.userData.noCollision = 1
    group.add(mesh)
  }
  group.rotation.y = id.yaw
  if (level === 9) group.scale.setScalar(THREE.MathUtils.clamp(Number(s.data?.scale ?? 100) / 100, .65, 1.4))
  group.userData.treeForm = OUTDOOR_TREE_FORMS[id.form]
  group.userData.treeArrangement = id.arrangement
  return group
}
