// Focused geometry regression for the L0.2 construction props.  This is a
// headless check: it deliberately exercises the real renderer modules rather
// than duplicating their profiles in the test.
import * as THREE from 'three'
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  document: { createElement: (tag: string) => tag === 'canvas' ? createCanvas(16, 16) : { style: {}, appendChild() {} }, getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  localStorage: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) },
})

const { stripedConeGeometry, supportGeometry } = await import('../src/game/renderer/constructionGeometry')
const { Kit, sinkModel, toiletModel, workLamp } = await import('../src/game/renderer/l02Props')
const { housePartition, planHole } = await import('../src/game/world/l02Collapse')
const { houseLampPositions } = await import('../src/game/renderer/l02Scene')
let checks = 0
const ok = (value: unknown, message: string) => { checks++; if (!value) throw Error(message) }
const finite = (g: THREE.BufferGeometry, label: string) => {
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(name)
    if (!a) continue
    ok(Array.from(a.array).every(Number.isFinite), `${label}: ${name} contains non-finite values`)
  }
}
const meshList = (root: THREE.Object3D) => { const out: THREE.Mesh[] = []; root.traverse(o => { if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh) }); return out }

function coneCheck(spec: Parameters<typeof stripedConeGeometry>[0], label: string) {
  const parts = stripedConeGeometry(spec)
  ok(!!parts.body && !!parts.reflective, `${label}: both material regions exist`)
  finite(parts.body, `${label} body`); finite(parts.reflective, `${label} bands`)
  // Raycast both real regions together.  Testing the low/mid/high points of
  // every band (and the intervals between them) catches a buried or inverted
  // stripe, which a single midpoint comparison cannot detect.
  const body = new THREE.Mesh(parts.body, new THREE.MeshBasicMaterial()); body.userData.region = 'body'
  const reflective = new THREE.Mesh(parts.reflective, new THREE.MeshBasicMaterial()); reflective.userData.region = 'reflective'
  const root = new THREE.Group(); root.add(body, reflective)
  const cuts = [spec.bottomY, spec.topY, ...spec.bands.flatMap(([a, b]) => [a, b])].sort((a, b) => a - b)
  const sampleYs = new Set<number>()
  for (let i = 0; i < cuts.length - 1; i++) {
    const lo = cuts[i], hi = cuts[i + 1]
    if (hi - lo > 2e-4) sampleYs.add((lo + hi) / 2)
  }
  for (const [a, b] of spec.bands) for (const y of [a + 1e-4, (a + b) / 2, b - 1e-4]) if (y > spec.bottomY && y < spec.topY) sampleYs.add(y)
  const cardinal = [
    [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)],
    [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)],
  ] as const
  const radiusAt = (y: number) => THREE.MathUtils.lerp(spec.bottomRadius, spec.topRadius, (y - spec.bottomY) / (spec.topY - spec.bottomY))
  for (const y of sampleYs) for (const [origin, direction] of cardinal) {
    origin.y = y
    const hits = new THREE.Raycaster(origin, direction).intersectObject(root, true).sort((a, b) => a.distance - b.distance)
    ok(hits.length > 0, `${label}: frustum is raycastable at y=${y}`)
    const inBand = spec.bands.some(([a, b]) => y > a && y < b)
    const expected = inBand ? 'reflective' : 'body'
    ok(hits[0].object.userData.region === expected, `${label}: first hit at y=${y} uses ${expected} region`)
    ok(hits.every(h => h.object.userData.region === expected), `${label}: no overlapping region side hit at y=${y}`)
    const radial = Math.hypot(hits[0].point.x, hits[0].point.z)
    const polygonTol = radiusAt(y) * (1 - Math.cos(Math.PI / (spec.segments ?? 16))) + 1e-4
    ok(Math.abs(radial - radiusAt(y)) <= polygonTol, `${label}: radial profile matches frustum at y=${y}`)
  }
  parts.body.dispose(); parts.reflective.dispose()
}

coneCheck({ bottomY: .025, topY: .46, bottomRadius: .12, topRadius: .025, bands: [[.15, .22], [.28, .33]] }, 'L02 cone')
coneCheck({ bottomY: .035, topY: .695, bottomRadius: .15, topRadius: .012, bands: [[.375, .485]], segments: 18 }, 'entrance cone')

// Support endpoints must remain exact even for diagonal/offset directions.
for (const [from, to] of [[new THREE.Vector3(1, .2, -2), new THREE.Vector3(3.4, 1.7, .5)], [new THREE.Vector3(-.4, 2, .8), new THREE.Vector3(-.1, 2.2, 3.2)]]) {
  const g = supportGeometry(from, to, .08, .06, true); finite(g, 'support')
  const axis = to.clone().sub(from).normalize(), p = g.getAttribute('position')
  let lo = Infinity, hi = -Infinity
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const d = v.dot(axis); lo = Math.min(lo, d); hi = Math.max(hi, d) }
  ok(Math.abs(lo - from.dot(axis)) < 1e-4 && Math.abs(hi - to.dot(axis)) < 1e-4, 'support reaches both attachment planes')
  g.dispose()
}

const sink = new THREE.Group(); sinkModel(sink)
const toilet = new THREE.Group(); toiletModel(toilet)
for (const [root, name] of [[sink, 'sink'], [toilet, 'toilet']] as const) {
  const meshes = meshList(root); ok(meshes.length > 0 && meshes.length <= 8, `${name}: material-batched mesh count is bounded`)
  for (const m of meshes) finite(m.geometry, name)
}
const down = (root: THREE.Object3D, x: number, z: number, label: string) => {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.4, z), new THREE.Vector3(0, -1, 0))
  const hit = ray.intersectObject(root, true).sort((a, b) => a.distance - b.distance)[0]
  ok(!!hit, `${label}: downward ray hits geometry`)
  return hit!.point.y
}
ok(down(sink, 0, .02, 'sink basin') < .82, 'sink basin is hollow below the counter opening')
ok(down(sink, .23, .02, 'sink counter') > .84, 'sink counter remains solid outside the opening')
ok(down(toilet, .035, .075, 'toilet bowl') < .36, 'toilet bowl ray reaches the interior rather than a solid cap')

const lampKit = new Kit(); workLamp(lampKit, 0, 0, -1.2, -2.7)
const lamp = new THREE.Group(); lampKit.build(lamp, 'l02-test-lamp')
const lampMeshes = meshList(lamp); ok(lampMeshes.length <= 6, 'work lamp remains material-batched')
for (const m of lampMeshes) finite(m.geometry, 'work lamp')
const box = new THREE.Box3().setFromObject(lamp)
ok(box.min.y >= -2.71, 'work lamp has no cable/leg undershoot below its floor')
for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
  const ray = new THREE.Raycaster(new THREE.Vector3(-2 * Math.cos(angle), -2.65, -2 * Math.sin(angle)), new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)))
  ok(ray.intersectObject(lamp, true).length > 0, 'work lamp leg visible from azimuth ' + angle.toFixed(2))
}

// Exercise production hole plans, including both sides for every ramp direction.
const rectGap = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => Math.hypot(Math.max(r.x - x, 0, x - r.x - r.w), Math.max(r.y - y, 0, y - r.y - r.h))
const directions = new Set<string>()
for (const ox of [-1024, 0, 1024]) for (const oy of [-1024, 0, 1024]) for (const vertical of [false, true]) for (const flip of [.1, .4, .6, .9]) {
  const cx = 16 + ox, cy = 18 + oy
  const walls = vertical ? [{ x: cx + 2.5, y: cy - .1, w: .1, h: .2 }] : []
  const hole = planHole(cx, cy, walls, [], 1, 0, flip)
  ok(hole, 'actual production planner provides the fixture')
  const h = hole!, F = h.house, lamps = houseLampPositions(h); directions.add(h.rampDir)
  ok(lamps.length === 2, 'real plan retains two construction lights')
  for (const l of lamps) {
    ok(Math.abs(l.z - (-h.depth + 1.5)) < 1e-9, 'lamp height follows basement depth')
    ok(l.x >= F.x + .36 && l.y >= F.y + .36 && l.x <= F.x + F.w - .36 && l.y <= F.y + F.h - .36, 'lamp clears perimeter')
    ok(rectGap(h.ramp, l.x, l.y) >= .36 - 1e-6, 'lamp feet clear the real interior ramp strip')
    ok(housePartition(h).every(p => rectGap(p, l.x, l.y) >= .36 - 1e-6), 'lamp clears actual stud partitions')
  }
  ok(Math.hypot(lamps[0].x - lamps[1].x, lamps[0].y - lamps[1].y) >= .8, 'two lamps keep their own foot room')
}
ok(directions.size === 4, 'production fixtures cover px/nx/py/ny')

console.log(JSON.stringify({ checks, failures: 0, fixtureMeshes: { sink: meshList(sink).length, toilet: meshList(toilet).length, lamp: lampMeshes.length } }))
