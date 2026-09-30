import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { clone as cloneRig } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { MothForm } from '../entities/types'
import { mothTextures } from './mothTextures'

const templates = new Map<MothForm, THREE.Group>()
const DOWN = new THREE.Vector3(0, -1, 0)
type V = [number, number, number]

/** One cached, skinned rig per subform. Six material batches, even with articulated limbs. */
export function buildMothMesh(form: MothForm = 'male'): THREE.Group {
  let template = templates.get(form)
  if (!template) { template = makeMoth(form); templates.set(form, template) }
  const g = cloneRig(template) as THREE.Group, parts: Record<string, THREE.Object3D> = {}
  let skeleton: THREE.Skeleton | undefined
  g.traverse(o => {
    if (o.name) parts[o.name] = o
    const m = o as THREE.Mesh
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      const sk = m as THREE.SkinnedMesh
      if (skeleton) sk.skeleton = skeleton; else skeleton = sk.skeleton
    }
    if (m.isMesh) { m.geometry = m.geometry.clone(); m.material = (m.material as THREE.Material).clone() }
  })
  g.userData.parts = parts; g.userData.entityType = 'deathmoth'; g.userData.mothForm = form
  return g
}

function makeMoth(form: MothForm) {
  const root = new THREE.Group(), guard = form === 'guard', larva = form === 'larva', female = form === 'female'
  const tx = mothTextures(), bones: THREE.Bone[] = [], batches = new Map<THREE.Material, THREE.BufferGeometry[]>()
  const shell = new THREE.MeshStandardMaterial({ color: guard ? '#6a5945' : larva ? '#bbb3a1' : '#c5b37c', map: tx.skin, bumpMap: tx.relief, bumpScale: .0016, roughness: .88, vertexColors: true })
  const cuticle = new THREE.MeshStandardMaterial({ color: '#4b3928', map: tx.skin, roughness: .63, vertexColors: true })
  const eye = new THREE.MeshStandardMaterial({ color: '#273d31', bumpMap: tx.facets, bumpScale: .0008, roughness: .39, metalness: .14, vertexColors: true })
  const wingMat = new THREE.MeshStandardMaterial({ color: guard ? '#908065' : '#c0b991', map: tx.wing, bumpMap: tx.relief, bumpScale: .00065, side: THREE.DoubleSide, roughness: .86, vertexColors: true })
  const hair = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 1, vertexColors: true })
  const pale = new THREE.MeshStandardMaterial({ color: '#b1bdc8', map: tx.skin, bumpMap: tx.relief, bumpScale: .001, roughness: .91, vertexColors: true })
  let randState = 4189
  const rand = () => { randState = Math.imul(randState, 1664525) + 1013904223 | 0; return (randState >>> 0) / 4294967296 }
  function bone(name: string, pos: V, parent: THREE.Object3D = root) {
    const b = new THREE.Bone(); b.name = name; b.position.set(...pos); b.userData.rest = [...pos]
    parent.add(b); bones.push(b); return b
  }
  function add(geo: THREE.BufferGeometry, mat: THREE.Material, b: THREE.Bone, tint = 1, flex?: { tip: THREE.Bone; span: number }) {
    const p = geo.getAttribute('position'), n = p.count, indices = new Uint16Array(n * 4), weights = new Float32Array(n * 4), colors = new Float32Array(n * 3)
    const bi = bones.indexOf(b), ti = flex ? bones.indexOf(flex.tip) : bi
    for (let i = 0; i < n; i++) {
      const k = flex ? THREE.MathUtils.smoothstep(Math.abs(p.getZ(i)) / flex.span, .38, .95) * .85 : 0
      indices[i * 4] = bi; indices[i * 4 + 1] = ti; weights[i * 4] = 1 - k; weights[i * 4 + 1] = k
      colors.fill(tint, i * 3, i * 3 + 3)
    }
    if (!geo.getAttribute('normal')) geo.computeVertexNormals()
    if (!geo.getAttribute('uv')) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4))
    if (!geo.getAttribute('color')) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    root.updateMatrixWorld(true); geo.applyMatrix4(b.matrixWorld)
    const plain = geo.index ? geo.toNonIndexed() : geo
    if (plain !== geo) geo.dispose()
    const list = batches.get(mat) ?? []; list.push(plain); batches.set(mat, list)
  }
  function ell(b: THREE.Bone, p: V, size: V, mat = shell, tint = 1, detail = 14) {
    const geo = new THREE.SphereGeometry(1, detail, 9); geo.scale(...size).translate(...p); add(geo, mat, b, tint)
  }
  function rod(b: THREE.Bone, a: V, end: V, r: number, mat = cuticle, taper = .55) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...end), d = B.clone().sub(A)
    const geo = new THREE.CylinderGeometry(r * taper, r, d.length(), 6)
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())).translate(...A.add(B).multiplyScalar(.5).toArray())
    add(geo, mat, b)
  }
  // Curved tapered bristles; one merged skin batch instead of hundreds of separate rods.
  function fur(b: THREE.Bone, center: V, size: V, length: number, count: number, bristle = false) {
    const verts: number[] = [], colors: number[] = []
    for (let i = 0; i < count; i++) {
      const theta = rand() * Math.PI * 2, h = rand() * 1.85 - .85, r = Math.sqrt(1 - h * h)
      const dir = new THREE.Vector3(r * Math.cos(theta), h, r * Math.sin(theta))
      const start = new THREE.Vector3(center[0] + dir.x * size[0], center[1] + dir.y * size[1], center[2] + dir.z * size[2])
      const len = length * (.45 + rand() * .9), tip = start.clone().addScaledVector(dir, len)
      tip.x -= len * .30; tip.y -= len * .12
      const mid = start.clone().lerp(tip, .54).add(new THREE.Vector3(0, len * .14, 0))
      const sideways = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(len * (bristle ? .008 : .022))
      const shade = .30 + rand() * .43, col = bristle ? [shade * .65, shade * .59, shade * .46] : [shade, shade * .91, shade * .68]
      const points = [start.clone().add(sideways), start.clone().sub(sideways), mid.clone().addScaledVector(sideways, .45), start.clone().sub(sideways), mid.clone().sub(sideways), mid.clone().addScaledVector(sideways, .45), mid.clone().addScaledVector(sideways, .45), mid.clone().sub(sideways), tip]
      for (const v of points) { verts.push(v.x, v.y, v.z); colors.push(...col) }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); add(geo, hair, b)
  }
  if (larva) {
    for (let i = 0; i < 10; i++) {
      const taper = i === 0 ? .94 : .82 + Math.sin(i / 10 * Math.PI) * .22
      const b = bone(`mothSegment${i}`, [.108 - i * .024, .031, 0])
      ell(b, [0, 0, 0], [.017, .025 * taper, .025 * taper], i === 0 ? pale : shell, i === 0 ? 1 : .53 + .11 * Math.sin(i * 1.5))
      if (i === 0) {
        ell(b, [.014, .003, 0], [.006, .019, .020], pale)
        for (let j = 0; j < 11; j++) {
          const a = j * 2.399, y = Math.sin(a) * .016, z = Math.cos(a) * .017
          const mid: V = [.020, y * .65 + .002, z * .71 - .001]
          rod(b, [.019, y, z], mid, .00030, cuticle)
          rod(b, mid, [.020, y * .47 + .004, z * .44 + .001], .00021, cuticle)
        }
        for (const side of [-1, 1]) ell(b, [.018, -.012, side * .006], [.005, .005, .004], cuticle)
        fur(b, [.002, .004, 0], [.014, .016, .020], .052, 140, true)
      } else {
        for (const side of [-1, 1]) {
          ell(b, [-.002, .004, side * .022], [.003, .004, .0015], cuticle)
          if (i !== 8) {
            rod(b, [.003, -.017, side * .014], [.005, -.029, side * .024], i < 4 ? .0025 : .0045, i < 4 ? cuticle : shell)
            rod(b, [.005, -.029, side * .024], [.010, -.030, side * .026], .0018, cuticle)
          }
        }
        fur(b, [0, .002, 0], [.014, .022 * taper, .023 * taper], .035, 38, true)
      }
    }
  } else {
    const size = guard ? 2.75 : female ? 1.38 : 1, by = guard ? 1.055 : 0
    const body = bone('mothBody', [0, by, 0]), abdomen = bone('mothAbdomen', [-.033 * size, -.003, 0], body), head = bone('mothHead', [.041 * size, .003, 0], body)
    ell(body, [0, 0, 0], [.038 * size, .025 * size, .028 * size])
    for (let i = 0; i < 7; i++) {
      const t = 1 - i * .11
      ell(abdomen, [-i * .012 * size, -i * .0013 * size, 0], [.014 * size, .024 * t * size, .022 * t * size], shell, i % 2 ? .78 : .61)
    }
    ell(head, [0, .002, 0], [.022 * size, .021 * size, .023 * size], shell)
    fur(body, [0, .002, 0], [.032 * size, .022 * size, .026 * size], .012 * size, 780)
    fur(head, [0, .001, 0], [.017 * size, .016 * size, .018 * size], .009 * size, 260)
    fur(abdomen, [-.025 * size, .002, 0], [.035 * size, .016 * size, .017 * size], .010 * size, 70)
    if (female) ell(abdomen, [-.065 * size, -.012 * size, 0], [.013 * size, .009 * size, .012 * size], cuticle)
    for (const s of [-1, 1]) {
      ell(head, [.012 * size, .003 * size, s * .017 * size], [.011 * size, .016 * size, .012 * size], eye, 1, 20)
      ell(head, [.013 * size, .019 * size, s * .006 * size], [.003 * size, .003 * size, .003 * size], eye)
      const ant = bone(`mothAntenna${s}`, [.010 * size, .018 * size, s * .010 * size], head)
      for (let j = 0; j < 10; j++) {
        const a = j / 10, b = (j + 1) / 10, len = (female ? .064 : .075) * size
        const point = (t: number): V => [len * t, Math.sin(t * Math.PI * .8) * len * .33, s * len * (.25 * t + t * t * .33)]
        rod(ant, point(a), point(b), .0012 * size * (1 - a * .75), shell)
        for (const branch of [-1, 1]) { const p = point(b), fan = Math.sin(b * Math.PI) * len * (female ? .10 : .19); rod(ant, p, [p[0] - fan * .32, p[1] + .002 * size, p[2] + branch * fan], .00042 * size, shell) }
      }
      if (female || guard) {
        const jaw = bone(`mothJaw${s}`, [.016 * size, -.012 * size, s * .009 * size], head)
        rod(jaw, [0, 0, 0], [.021 * size, -.009 * size, s * .008 * size], .0055 * size)
        rod(jaw, [.021 * size, -.009 * size, s * .008 * size], [.030 * size, -.003 * size, -s * .006 * size], .0038 * size)
        for (let j = 0; j < 3; j++) rod(jaw, [.011 * size + j * .005 * size, -.007 * size, s * .004 * size], [.014 * size + j * .005 * size, -.006 * size, -s * .001 * size], .0011 * size)
      }
      for (let pair = 0; pair < 2; pair++) {
        const span = (guard ? .38 : female ? .45 : .33) * (pair ? .76 : 1), chord = (guard ? .20 : female ? .235 : .174) * (pair ? 1.02 : 1)
        const wing = bone(`mothWing${s}_${pair}`, [pair ? -.034 * size : 0, .012, s * .010 * size], body)
        const tip = bone(`mothWingTip${s}_${pair}`, [0, 0, s * span * .4], wing)
        const positions: number[] = [], uv: number[] = [], indices: number[] = [], rows = 18, cols = 7
        for (let r = 0; r <= rows; r++) {
          const u = r / rows, lead = chord * (pair ? .06 : .55) * Math.sin(u * Math.PI * .78)
          const width = chord * (Math.pow(Math.sin(Math.PI * u), .52) * .88 + .05)
          for (let c = 0; c <= cols; c++) {
            const v = c / cols, scallop = (c === cols ? Math.sin(u * Math.PI * 15) * .004 : 0) * u
            positions.push(lead - width * v + scallop, Math.sin(v * Math.PI) * span * .027 - u * u * span * .05, s * span * u)
            uv.push(u, v)
            if (r < rows && c < cols) { const a = r * (cols + 1) + c, b = a + cols + 1; indices.push(a, b, a + 1, b, b + 1, a + 1) }
          }
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(indices); geo.computeVertexNormals(); add(geo, wingMat, wing, 1, { tip, span })
      }
      const legs = guard ? 4 : 3
      for (let i = 0; i < legs; i++) {
        const hip: V = guard ? [.09 - i * .070, .995, s * .077] : [(.024 - i * .021) * size, -.017 * size, s * .018 * size]
        const upper = bone(`mothLeg${s}_${i}`, hip), a = guard ? .50 : .052 * size, b = guard ? .65 : .066 * size
        upper.userData.length = a; upper.userData.lowerLength = b
        rod(upper, [0, 0, 0], [0, -a, 0], guard ? .016 : .0042 * size)
        ell(upper, [0, -.01, 0], [guard ? .021 : .006, guard ? .025 : .008, guard ? .021 : .006], shell)
        const knee = bone(`mothKnee${s}_${i}`, [0, -a, 0], upper)
        ell(knee, [0, 0, 0], [guard ? .019 : .005, guard ? .021 : .006, guard ? .019 : .005], cuticle)
        rod(knee, [0, 0, 0], [0, -b, 0], guard ? .009 : .0027 * size)
        const foot = bone(`mothFoot${s}_${i}`, [0, -b, 0], knee)
        for (const t of [-1, 1]) rod(foot, [0, 0, 0], [guard ? .026 : .011 * size, 0, t * (guard ? .009 : .003)], guard ? .0038 : .0015)
        upper.userData.foot = guard ? [[.36, .15, -.13, -.37][i], .008, s * (i === 0 || i === 3 ? .36 : .41)] : [( .075 - i * .050) * size, -.09 * size, s * .076 * size]
      }
    }
    if (!female && !guard) {
      const prob = bone('mothProboscis', [.016, -.011, 0], head)
      for (let i = 0; i < 6; i++) rod(prob, [i * .011, -i * .003 - Math.sin(i / 6 * Math.PI) * .004, 0], [(i + 1) * .011, -(i + 1) * .003 - Math.sin((i + 1) / 6 * Math.PI) * .004, 0], .0012 - i * .00013, cuticle)
    }
  }
  root.updateMatrixWorld(true)
  const skeleton = new THREE.Skeleton(bones)
  for (const [mat, geometries] of batches) {
    const geometry = mergeGeometries(geometries)!, mesh = new THREE.SkinnedMesh(geometry, mat)
    mesh.bind(skeleton); mesh.castShadow = true; mesh.receiveShadow = true
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, guard ? .55 : 0, 0), guard ? 1.2 : larva ? .4 : .95)
    root.add(mesh); geometries.forEach(g => g.dispose())
  }
  root.userData.mothForm = form
  const parts: Record<string, THREE.Object3D> = {}; root.traverse(o => { if (o.name) parts[o.name] = o }); root.userData.parts = parts
  animateMoth(root, 0, 0, 0)
  delete root.userData.parts // Templates must not JSON-clone the entire bone graph through userData.
  return root
}

const target = new THREE.Vector3(), direction = new THREE.Vector3(), bend = new THREE.Vector3(), kneePoint = new THREE.Vector3(), upperDir = new THREE.Vector3(), q = new THREE.Quaternion(), inverse = new THREE.Quaternion()
/** Analytic two-joint legs, alternating support groups, delayed wingtip flex and body breathing. */
export function animateMoth(g: THREE.Group, time: number, dt: number, speed: number, attack = 0, death = 0) {
  const parts = g.userData.parts as Record<string, THREE.Object3D>, form = g.userData.mothForm as MothForm
  const guard = form === 'guard', larva = form === 'larva', life = 1 - death
  const phase = (g.userData.mothPhase ?? 0) + dt * Math.min(speed, 3.5) * (guard ? 7 : larva ? 85 : 7)
  g.userData.mothPhase = phase
  if (larva) {
    for (let i = 0; i < 10; i++) {
      const b = parts[`mothSegment${i}`], rest = b.userData.rest as V, wave = Math.sin(phase - i * .66) * life
      b.position.set(rest[0] + wave * .005, rest[1] + Math.max(0, wave) * .0025, Math.sin(phase * .7 - i * .45) * .002 * life)
      b.scale.set(1 - wave * .12, 1 + wave * .035, 1 + wave * .055); b.rotation.y = Math.sin(phase * .7 - i * .45) * .025 * life
    }
    return
  }
  const body = parts.mothBody, abdomen = parts.mothAbdomen, head = parts.mothHead
  const bob = Math.sin(time * 2.4) * (guard ? .004 : .0015) * life
  body.position.y = (body.userData.rest as V)[1] + bob
  abdomen.rotation.z = Math.sin(time * 2.8) * .035 * life; abdomen.scale.y = 1 + Math.sin(time * 3) * .024 * life
  head.rotation.y = Math.sin(time * 1.7) * .045 * life; head.rotation.z = -attack * .17
  for (const s of [-1, 1]) {
    const ant = parts[`mothAntenna${s}`]; ant.rotation.y = Math.sin(time * 3.3 + s) * .065 * life; ant.rotation.z = Math.sin(time * 2.7 + s * .4) * .065 * life - attack * .10
    const jaw = parts[`mothJaw${s}`]; if (jaw) jaw.rotation.y = s * (.10 + attack * .45 + Math.sin(time * 1.9) * .055) * life
    for (let pair = 0; pair < 2; pair++) {
      const wing = parts[`mothWing${s}_${pair}`], tip = parts[`mothWingTip${s}_${pair}`], beat = time * (form === 'female' ? 43 : 49) - pair * .30
      wing.rotation.x = s * (guard ? .16 + Math.sin(time * 2.6 - pair * .4) * .045 : .16 + Math.sin(beat) * (.90 + Math.min(speed, 3) * .05)) * life + s * death * .7
      wing.rotation.z = guard ? -.09 : Math.cos(beat) * .12 * life
      tip.rotation.x = s * Math.sin(guard ? time * 2.6 - .45 : beat - .52) * (guard ? .025 : .23) * life
    }
    for (let i = 0; i < (guard ? 4 : 3); i++) {
      const upper = parts[`mothLeg${s}_${i}`], lower = parts[`mothKnee${s}_${i}`], foot = parts[`mothFoot${s}_${i}`], rest = upper.userData.rest as V, f = upper.userData.foot as V
      upper.position.set(rest[0], rest[1] + bob, rest[2])
      const a = upper.userData.length as number, b = upper.userData.lowerLength as number
      const step = (phase / (Math.PI * 2) + i * .5 + (s > 0 ? .5 : 0)) % 1
      // 62% support phase: planted feet travel backwards; short swing clears the ground.
      const swing = Math.max(0, (step - .62) / .38), stride = guard && speed > .02 ? .19 : 0
      const dx = step < .62 ? ( .5 - step / .62) * stride : (-.5 + swing) * stride
      target.set(f[0] + dx, f[1] + (guard ? Math.sin(swing * Math.PI) * .10 : Math.sin(time * 3 + i + s) * .008) * life, f[2])
      if (death > 0) { target.y += death * (guard ? .48 : .03); target.z *= 1 - death * .55 }
      direction.copy(target).sub(upper.position)
      const d = THREE.MathUtils.clamp(direction.length(), Math.abs(a - b) + .0001, a + b - .0001); direction.normalize()
      const along = (a * a - b * b + d * d) / (2 * d), height = Math.sqrt(Math.max(0, a * a - along * along))
      bend.set(0, .65, s); bend.addScaledVector(direction, -bend.dot(direction)).normalize()
      kneePoint.copy(direction).multiplyScalar(along).addScaledVector(bend, height)
      upper.quaternion.setFromUnitVectors(DOWN, upperDir.copy(kneePoint).normalize())
      inverse.copy(upper.quaternion).invert()
      q.setFromUnitVectors(DOWN, direction.multiplyScalar(d).sub(kneePoint).normalize())
      lower.quaternion.copy(inverse).multiply(q)
      // Keep terminal claws level during stance instead of skating through the floor.
      foot.quaternion.copy(q).invert()
    }
  }
  if (parts.mothProboscis) parts.mothProboscis.rotation.z = Math.sin(time * 2) * .07 * life
}
