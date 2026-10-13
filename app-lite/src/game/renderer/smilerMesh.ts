// v61：笑魇（Entity 3）重制模型——5 个变种，模型正面 +X。
// 主体 Nigrum ignem：纯黑、边缘随时间翻卷的「黑火」，用 Lambert + 顶点着色器位移实现（保留雾效）；
// 发光的眼与齿（Ardenti risu）为 MeshBasic，可随 AI 的 grin / glow / vis 动画开合、明暗、隐现。
// 齿列等重复小件合并为单个几何体，单只 10~21 个 mesh（不含阴影和后处理重复绘制）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Entity } from '../entities'
import type { SmilerKind } from '../entities/smilers'
import { GREAT_WAIST, SMILER_STOP, greatAttackBend, greatCeilingBend } from '../entities/smilerPose'

const SMILER_TIME = { value: 0 }

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

/** 黑火材质：沿法线的多频位移，越往上越剧烈，形成翻卷的火舌轮廓 */
function flameMat(color: string, amp: number, opacity = 1) {
  const mat = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSmTime = SMILER_TIME
    sh.uniforms.uSmAmp = { value: amp }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSmTime;\nuniform float uSmAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float smUp = clamp(position.y * 0.6 + 0.2, 0.15, 1.6);
        float smN = sin(position.y * 9.0 - uSmTime * 6.0 + position.x * 7.0)
                  + 0.6 * sin(position.z * 13.0 + uSmTime * 8.3 + position.y * 4.0)
                  + 0.35 * sin((position.x + position.z) * 21.0 - uSmTime * 11.0);
        transformed += normal * smN * uSmAmp * smUp;
        transformed.y += max(0.0, smN) * uSmAmp * 0.8 * smUp;`)
  }
  mat.customProgramCacheKey = () => `smilerFlame${amp.toFixed(3)}`
  return mat
}
const glowMat = (color: string) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })

/** 车削轮廓 + 种子化不规则扰动（静态），返回几何体 */
function lumpyLathe(profile: [number, number][], seg: number, seed: number, jitter: number, sz = 1) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y))
  const g = new THREE.LatheGeometry(pts, seg)
  g.scale(1, 1, sz)
  const rnd = mulberry(seed), pos = g.attributes.position as THREE.BufferAttribute
  const cache = new Map<string, number>()
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`
    let k = cache.get(key)
    if (k === undefined) { k = 1 + (rnd() - 0.5) * jitter; cache.set(key, k) } // 接缝顶点同值，避免裂缝
    pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k)
  }
  g.computeVertexNormals()
  return g
}

/** 齿列：沿 smile 曲线排布的锥形/方形齿，合并为一个几何体。dir=-1 上排齿尖朝下，+1 下排齿尖朝上 */
function teethRow(n: number, width: number, curve: number, len: number, dir: number, shape: 'fang' | 'square' | 'needle', x0: number) {
  const gs: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5 // -0.5..0.5
    const z = u * width
    const y = curve * (u * 2) ** 2 // 嘴角上翘
    const l = len * (shape === 'square' ? 1 : 1 - Math.abs(u) * 0.55)
    let g: THREE.BufferGeometry
    if (shape === 'square') g = new THREE.BoxGeometry(0.02, l, width / n * 0.78)
    else { g = new THREE.ConeGeometry(shape === 'needle' ? 0.009 : 0.017, l, 4); if (dir > 0) g.rotateX(Math.PI) }
    g.translate(x0 - Math.abs(u) * width * 0.35, y + (dir < 0 ? -l / 2 : l / 2), z)
    gs.push(g)
  }
  return mergeGeometries(gs)!
}

/** 口腔：沿笑弧排布的一串黑色薄块（位于齿列之后），随 grin 纵向拉开 */
function mouthStrip(n: number, width: number, curve: number, h: number, x0: number) {
  const gs: THREE.BufferGeometry[] = []
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5
    const hh = h * (1 - Math.abs(u) * 1.2)
    const cy = curve * (u * 2) ** 2
    const b = new THREE.BoxGeometry(0.012, Math.max(0.01, hh), width / (n - 1) * 1.15).translate(x0 - Math.abs(u) * width * 0.35, cy, u * width)
    b.setAttribute('cy', new THREE.Float32BufferAttribute(new Array(b.attributes.position.count).fill(cy), 1))
    gs.push(b)
  }
  const g = mergeGeometries(gs)!
  g.userData.baseY = Float32Array.from((g.attributes.position as THREE.BufferAttribute).array as Float32Array).filter((_, i) => i % 3 === 1)
  return g
}
/** 只在各块自身中心处纵向拉开（嘴角不会被整体缩放甩出脸外） */
function openMouth(m: THREE.Mesh, k: number) {
  const g = m.geometry, pos = g.attributes.position as THREE.BufferAttribute, cy = g.attributes.cy as THREE.BufferAttribute
  const base = g.userData.baseY as Float32Array
  if (!cy || !base || g.userData.k === k) return
  g.userData.k = k
  for (let i = 0; i < pos.count; i++) pos.setY(i, cy.getX(i) + (base[i] - cy.getX(i)) * k)
  pos.needsUpdate = true
}

/** 关节肢：一段段圆柱合并到 pivot 下，pivot 位于肩/髋；segments 为 [长度, 绕 z 弯折角, 粗细] */
function limb(segs: [number, number, number][], mat: THREE.Material, claws = 0) {
  const pivot = new THREE.Group()
  let parent: THREE.Object3D = pivot
  for (const [len, bend, r] of segs) {
    const j = new THREE.Group()
    j.rotation.z = bend
    parent.add(j)
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r, len, 5).translate(0, -len / 2, 0), mat)
    j.add(m)
    const next = new THREE.Group(); next.position.y = -len; j.add(next)
    parent = next
  }
  if (claws) {
    const cg: THREE.BufferGeometry[] = []
    for (let i = 0; i < claws; i++) cg.push(new THREE.ConeGeometry(0.012, 0.14, 4).rotateZ(Math.PI).rotateX((i - (claws - 1) / 2) * 0.35).translate(0.02, -0.06, (i - (claws - 1) / 2) * 0.03))
    parent.add(new THREE.Mesh(mergeGeometries(cg)!, mat))
  }
  return pivot
}

const rig0Float = (k: SmilerKind) => k === 'common' || k === 'phantom'

export interface SmilerRig {
  kind: SmilerKind
  body: THREE.Object3D
  face: THREE.Group
  upper: THREE.Mesh
  lower: THREE.Mesh
  eyes: THREE.Mesh
  limbs: THREE.Object3D[]
  bodyMats: THREE.Material[]
  glowMats: THREE.MeshBasicMaterial[]
  glowBase: THREE.Color[]
  float: number // 悬浮高度（0=着地行走）
  mouthY: number
  waist?: THREE.Group
  head?: THREE.Group
  bend?: number
  bentGeometry?: { geometry: THREE.BufferGeometry; rest: Float32Array; angle: number }[]
}

export interface SmilerView {
  headroom: number
  eyeAboveFeet: number
  distance: number
  dt: number
}

// Deform only the giant's two existing body meshes. Rest positions stay instance-owned;
// quantization avoids buffer uploads when the pose has settled. Feet remain planted.
function bendBody(rig: SmilerRig, bend: number, pitch: number) {
  const angle = Math.round(bend * 100) / 100, tilt = Math.round(pitch * 100) / 100
  const fx=rig.head!.position.x, fy=rig.mouthY-GREAT_WAIST
  const hx=fx*Math.cos(angle)+fy*Math.sin(angle),hy=GREAT_WAIST+fy*Math.cos(angle)-fx*Math.sin(angle)
  const hc=Math.cos(tilt),hs=Math.sin(tilt),key=angle*10000+tilt*10+fx
  for (const part of rig.bentGeometry ?? []) {
    if (part.angle === key) continue
    part.angle = key
    const pos = part.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = part.rest[i * 3], y = part.rest[i * 3 + 1]
      const u = THREE.MathUtils.clamp((y - GREAT_WAIST) / .35, 0, 1)
      const a = angle * u * u * (3 - 2 * u), c = Math.cos(a), s = Math.sin(a)
      const bx=x*c+(y-GREAT_WAIST)*s,by=GREAT_WAIST+(y-GREAT_WAIST)*c-x*s
      const n=THREE.MathUtils.smoothstep(y,1.1,1.45)
      // The neck counter-rotates with the face, keeping the eyes outside the black body.
      const nx=hx+(x-fx)*hc-(y-rig.mouthY)*hs,ny=hy+(x-fx)*hs+(y-rig.mouthY)*hc
      pos.setXYZ(i, bx+(nx-bx)*n,by+(ny-by)*n,part.rest[i*3+2])
    }
    pos.needsUpdate = true
    part.geometry.computeVertexNormals()
    part.geometry.computeBoundingBox()
    part.geometry.computeBoundingSphere()
  }
}

export function buildSmilerMesh(kind: SmilerKind, seed = 0): THREE.Group {
  const grp = new THREE.Group()
  grp.userData.entityType = 'smiler'
  grp.userData.parts = {}
  const rnd = mulberry(0x5311 + seed * 7919)
  const glowC = kind === 'phantom' ? '#d6ecff' : kind === 'starved' ? '#ece4bf' : '#f6f3ea'
  const bodyOpacity = kind === 'phantom' ? 0.82 : 1
  const fm = flameMat(kind === 'phantom' ? '#07080c' : '#040404', kind === 'phantom' ? 0.05 : kind === 'great' ? 0.05 : 0.035, bodyOpacity)
  const limbMat = new THREE.MeshLambertMaterial({ color: '#050505', transparent: bodyOpacity < 1, opacity: bodyOpacity })
  const gm = glowMat(glowC)
  const mouthMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true })
  const face = new THREE.Group()
  const waist = kind === 'great' ? new THREE.Group() : undefined
  const head = waist ? new THREE.Group() : undefined
  if (waist) { waist.position.y = GREAT_WAIST; grp.add(waist) }
  if(head){head.position.set(.36,1.32-GREAT_WAIST,0);waist!.add(head)}
  const bentGeometry: NonNullable<SmilerRig['bentGeometry']> = []
  const bendable = (mesh: THREE.Mesh) => {
    if (waist) bentGeometry.push({ geometry: mesh.geometry, rest: Float32Array.from(mesh.geometry.getAttribute('position').array), angle: NaN })
    return mesh
  }
  const upperBody = (part: THREE.Object3D) => {
    if (waist) { part.position.y -= GREAT_WAIST; waist.add(part) }
    else grp.add(part)
  }
  const limbs: THREE.Object3D[] = []
  let body: THREE.Object3D
  let upper: THREE.Mesh, lower: THREE.Mesh, eyes: THREE.Mesh
  let float = 0.12, mouthY = 0

  const eyeGeo = (pts: [number, number, number][], r: number, ring = false) => mergeGeometries(pts.map(([x, y, z]) => {
    const g = ring ? new THREE.TorusGeometry(r, r * 0.28, 4, 12).rotateY(Math.PI / 2) : new THREE.SphereGeometry(r, 8, 6).scale(0.45, 0.8, 1)
    return g.translate(x, y, z)
  }))!

  if (kind === 'canid') {
    // 四足：水平拉长的黑火躯体 + 前伸长吻；吻部两侧排齿
    const g = lumpyLathe([[0.001, -0.55], [0.17, -0.45], [0.24, -0.15], [0.26, 0.15], [0.2, 0.42], [0.1, 0.56], [0.001, 0.6]], 9, seed + 3, 0.22, 0.8)
    g.rotateZ(-Math.PI / 2) // 轴向转到 +X
    body = new THREE.Mesh(g, fm)
    body.position.set(-0.05, 0.62, 0)
    grp.add(body)
    const head = new THREE.Mesh(lumpyLathe([[0.001, -0.18], [0.13, -0.1], [0.13, 0.08], [0.08, 0.22], [0.04, 0.3], [0.001, 0.32]], 8, seed + 5, 0.15, 0.85).rotateZ(-Math.PI / 2), fm)
    head.position.set(0.55, 0.72, 0)
    grp.add(head)
    for (const z of [-0.07, 0.07]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 4), fm); ear.position.set(0.5, 0.88, z); ear.rotation.z = 0.35; grp.add(ear) }
    face.position.set(0.66, 0.68, 0)
    eyes = new THREE.Mesh(eyeGeo([[0.02, 0.11, -0.065], [0.02, 0.11, 0.065]], 0.032), gm)
    upper = new THREE.Mesh(teethRow(9, 0.17, 0.035, 0.05, -1, 'fang', 0.1), gm)
    lower = new THREE.Mesh(teethRow(8, 0.15, 0.03, 0.045, 1, 'fang', 0.09), gm)
    const mouth = new THREE.Mesh(mouthStrip(9, 0.17, 0.035, 0.04, 0.07), mouthMat)
    mouth.userData.mouth = 1
    face.add(mouth, eyes, upper, lower)
    // 四肢：前后各两条，反折关节
    for (const [x, z, front] of [[0.32, -0.14, 1], [0.32, 0.14, 1], [-0.42, -0.14, 0], [-0.42, 0.14, 0]] as const) {
      const L = limb([[0.32, front ? 0.25 : -0.35, 0.05], [0.34, front ? -0.55 : 0.75, 0.04]], limbMat, 3)
      L.position.set(x, 0.62, z)
      grp.add(L); limbs.push(L)
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.55, 5).rotateZ(Math.PI / 2 + 0.5), fm)
    tail.position.set(-0.75, 0.75, 0); grp.add(tail); limbs.push(tail)
    float = 0
  } else {
    const H = kind === 'starved' ? 2.05 : kind === 'great' ? 1.75 : kind === 'phantom' ? 1.6 : 1.7
    const prof: [number, number][] = kind === 'starved'
      ? [[0.001, 0.35], [0.12, 0.45], [0.15, 0.8], [0.11, 1.15], [0.16, 1.45], [0.17, 1.62], [0.14, 1.78], [0.16, 1.9], [0.08, 2.02], [0.001, 2.05]]
      : kind === 'phantom'
        ? [[0.001, 0.1], [0.12, 0.25], [0.22, 0.6], [0.2, 1.0], [0.23, 1.3], [0.22, 1.46], [0.14, 1.56], [0.001, H]]
        : kind === 'great'
          ? [[0.001, 0.05], [0.42, 0.2], [0.5, 0.6], [0.46, 1.0], [0.38, 1.3], [0.34, 1.5], [0.25, 1.68], [0.001, H]]
          : [[0.001, 0.05], [0.2, 0.2], [0.3, 0.5], [0.26, 0.85], [0.3, 1.12], [0.27, 1.32], [0.24, 1.48], [0.15, 1.6], [0.001, H]]
    body = bendable(new THREE.Mesh(lumpyLathe(prof, kind === 'great' ? 12 : 10, seed + 11, kind === 'starved' ? 0.12 : 0.32, 0.82), fm))
    grp.add(body)
    // 外缘火舌（合并成一个网格）
    const tongues: THREE.BufferGeometry[] = []
    const nT = kind === 'starved' ? 5 : kind === 'great' ? 14 : 9
    for (let i = 0; i < nT; i++) {
      const a = rnd() * Math.PI * 2, y = 0.3 + rnd() * (H - 0.5), r = (kind === 'great' ? 0.36 : 0.2) + rnd() * 0.1
      tongues.push(new THREE.ConeGeometry(0.04 + rnd() * 0.05, 0.2 + rnd() * 0.3, 4).rotateZ((rnd() - 0.5) * 1.2).translate(Math.cos(a) * r, y, Math.sin(a) * r * 0.82))
    }
    // 头顶火舌：几根向上翻卷的尖锥，让轮廓像火而不是墓碑
    const nC = kind === 'starved' ? 3 : kind === 'great' ? 6 : 5
    const topR = prof[prof.length - 2][0]
    for (let i = 0; i < nC; i++) {
      const a = (i / nC) * Math.PI * 2 + rnd() * 0.6
      const hgt = (kind === 'great' ? 0.35 : 0.22) + rnd() * 0.3
      tongues.push(new THREE.ConeGeometry(0.05 + rnd() * 0.05, hgt, 5).rotateZ((rnd() - 0.5) * 0.8).rotateX((rnd() - 0.5) * 0.6)
        .translate(Math.cos(a) * topR * 0.7, H - 0.12 + hgt / 2 - rnd() * 0.1, Math.sin(a) * topR * 0.6))
    }
    // 下摆烟缕：底部向外飘散的短锥
    if (rig0Float(kind)) for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2
      tongues.push(new THREE.ConeGeometry(0.06, 0.3 + rnd() * 0.2, 4).rotateZ(Math.PI + (rnd() - 0.5) * 0.9).translate(Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.2))
    }
    grp.add(bendable(new THREE.Mesh(mergeGeometries(tongues)!, fm)))
    mouthY = kind === 'starved' ? 1.78 : kind === 'great' ? 1.32 : 1.3
    const fx = kind === 'great' ? 0.36 : kind === 'starved' ? 0.23 : 0.32
    face.position.set(fx, mouthY, 0)
    if (kind === 'phantom') {
      eyes = new THREE.Mesh(eyeGeo([[0.02, 0.2, -0.09], [0.02, 0.2, 0.09]], 0.05, true), gm)
      upper = new THREE.Mesh(teethRow(8, 0.36, 0.05, 0.045, -1, 'square', 0.03), gm)
      lower = new THREE.Mesh(teethRow(8, 0.34, 0.045, 0.04, 1, 'square', 0.02), gm)
    } else if (kind === 'starved') {
      eyes = new THREE.Mesh(eyeGeo([[0.015, 0.13, -0.05], [0.015, 0.13, 0.05]], 0.025), gm)
      upper = new THREE.Mesh(teethRow(13, 0.24, 0.035, 0.07, -1, 'needle', 0.03), gm)
      lower = new THREE.Mesh(teethRow(12, 0.22, 0.03, 0.065, 1, 'needle', 0.025), gm)
    } else if (kind === 'great') {
      eyes = new THREE.Mesh(eyeGeo([[0.02, 0.26, -0.11], [0.02, 0.26, 0.11], [0.0, 0.36, -0.2], [0.0, 0.36, 0.2]], 0.05), gm)
      upper = new THREE.Mesh(mergeGeometries([teethRow(15, 0.62, 0.11, 0.1, -1, 'fang', 0.04), teethRow(11, 0.48, 0.09, 0.07, -1, 'fang', -0.01).translate(0, -0.01, 0)])!, gm)
      lower = new THREE.Mesh(mergeGeometries([teethRow(14, 0.58, 0.1, 0.09, 1, 'fang', 0.035), teethRow(10, 0.44, 0.08, 0.06, 1, 'fang', -0.015)])!, gm)
      const horns: THREE.BufferGeometry[] = []
      for (const s of [-1, 1]) {
        let prev = new THREE.Vector3(0.1, 1.62, s * 0.2)
        for (let i = 0; i < 4; i++) { // 弯角：4 节锥段向后上方弯曲
          const next = prev.clone().add(new THREE.Vector3(-0.06 - i * 0.03, 0.14 - i * 0.02, s * 0.06))
          const len = prev.distanceTo(next) + 0.02
          const seg = new THREE.CylinderGeometry(0.05 - i * 0.012, 0.065 - i * 0.012, len, 6)
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), next.clone().sub(prev).normalize())
          seg.applyQuaternion(q).translate((prev.x + next.x) / 2, (prev.y + next.y) / 2, (prev.z + next.z) / 2)
          horns.push(seg); prev = next
        }
        horns.push(new THREE.ConeGeometry(0.03, 0.12, 6).translate(prev.x - 0.03, prev.y + 0.05, prev.z))
      }
      const hornMesh=new THREE.Mesh(mergeGeometries(horns)!,new THREE.MeshLambertMaterial({color:'#16130f'}))
      hornMesh.position.set(-.36,-1.32,0);head!.add(hornMesh)
    } else {
      eyes = new THREE.Mesh(eyeGeo([[0.02, 0.21, -0.1], [0.02, 0.21, 0.1]], 0.05), gm)
      upper = new THREE.Mesh(teethRow(13, 0.44, 0.09, 0.075, -1, 'fang', 0.03), gm)
      lower = new THREE.Mesh(teethRow(12, 0.4, 0.08, 0.065, 1, 'fang', 0.025), gm)
    }
    const mw = kind === 'great' ? 0.62 : kind === 'starved' ? 0.24 : kind === 'phantom' ? 0.36 : 0.44
    const mc = kind === 'great' ? 0.11 : kind === 'starved' ? 0.035 : kind === 'phantom' ? 0.05 : 0.09
    const mouth = new THREE.Mesh(mouthStrip(13, mw, mc, 0.05, 0.0), mouthMat)
    mouth.userData.mouth = 1
    face.add(mouth, eyes, upper, lower)
    // 手臂：普通/幽影为悬浮的反折细臂；饥饿为拖地长臂；巨笑魇为撑地巨臂
    const armSpec: Record<string, [number, number, number][]> = {
      common: [[0.38, 0.35, 0.045], [0.36, -2.0, 0.038], [0.12, 1.1, 0.03]],
      phantom: [[0.34, 0.4, 0.035], [0.34, -2.1, 0.03]],
      starved: [[0.6, 0.18, 0.04], [0.62, -0.35, 0.033], [0.18, 0.4, 0.025]],
      great: [[0.6, 0.45, 0.11], [0.62, -0.8, 0.09]],
    }
    const shY = kind === 'starved' ? 1.62 : kind === 'great' ? 1.35 : 1.22
    const shZ = kind === 'great' ? 0.5 : kind === 'starved' ? 0.2 : 0.3
    for (const s of [-1, 1]) {
      const L = limb(armSpec[kind], limbMat, kind === 'phantom' ? 0 : kind === 'great' ? 4 : 3)
      L.position.set(0.02, shY, s * shZ)
      L.rotation.x = s * (kind === 'great' ? 0.55 : 0.32)
      upperBody(L); limbs.push(L)
    }
    if (kind === 'starved' || kind === 'great') float = 0
  }
  if(head){face.position.set(0,0,0);head.add(face)}else upperBody(face)

  const rig: SmilerRig = {
    kind, body, face, upper, lower, eyes, limbs,
    bodyMats: [fm, limbMat], glowMats: [gm], glowBase: [gm.color.clone()], float, mouthY,
    waist, head, bentGeometry, bend: 0,
  }
  grp.userData.smilerRig = rig
  grp.userData.smilerKind = kind
  // 冒烟脚本按 Basic 材质质心判正面：眼齿全在 +X 一侧
  for (const m of [eyes, upper, lower]) m.userData.face = 1
  return grp
}

/** 每帧由 renderer 调用（死亡动画之前） */
export function animateSmiler(grp: THREE.Group, e: Entity, time: number, gz: number, view?: SmilerView) {
  const rig = grp.userData.smilerRig as SmilerRig | undefined
  if (!rig) return
  SMILER_TIME.value = time
  const s = e.sm
  const t = time + e.id * 1.7
  const vis = s?.vis ?? 1, grin = s?.grin ?? 0.15, glow = s?.glow ?? 0.8
  // 可见度（幽影笑魇）：身体先于眼齿消失，留下一点余光
  const bodyA = rig.kind === 'phantom' ? 0.82 * vis : 1
  for (const mtl of rig.bodyMats) { const m = mtl as THREE.MeshLambertMaterial; m.opacity = bodyA; m.transparent = bodyA < 1; m.depthWrite = bodyA >= 1 }
  const flick = rig.kind === 'phantom' ? 1 : 0.9 + Math.sin(t * 13) * 0.05 + Math.sin(t * 31) * 0.05
  const gA = Math.min(1, Math.max(0, rig.kind === 'phantom' ? vis * 1.2 : 1))
  rig.glowMats.forEach((m, i) => { m.opacity = gA; m.color.copy(rig.glowBase[i]).multiplyScalar(Math.max(0.15, glow * flick)) })
  // 咧嘴：上排抬、下排落、嘴角拉宽
  const open = grin
  rig.upper.position.y = open * 0.035
  rig.lower.position.y = -open * (rig.kind === 'great' ? 0.12 : 0.075)
  if (rig.kind === 'starved') rig.lower.position.y += Math.sin(t * 38) * 0.006 * (0.4 + open) // 牙齿打颤
  const wide = 1 + open * 0.22
  rig.upper.scale.set(1, 1, wide); rig.lower.scale.set(1, 1, wide)
  const mouth = rig.face.children.find((c) => c.userData.mouth)
  if (mouth) { openMouth(mouth as THREE.Mesh, Math.round((0.3 + open * (rig.kind === 'great' ? 4.2 : 2.8)) * 20) / 20); mouth.scale.set(1, 1, wide); ((mouth as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = bodyA }
  // 眼：偶尔眨（短暂熄灭）
  rig.eyes.scale.y = (Math.sin(t * 0.7) > 0.985 ? 0.1 : 1)
  // 身体呼吸 / 翻涌
  const chase = e.state === 'chase' || e.state === 'attack'
  rig.body.scale.set(1 + Math.sin(t * 2.1) * 0.03, 1 + Math.sin(t * 1.7 + 1) * 0.025, 1 + Math.sin(t * 2.4 + 2) * 0.03)
  const gait = e.animT * (rig.kind === 'canid' ? 6.5 : 4)
  if (rig.kind === 'canid') {
    rig.limbs.slice(0, 4).forEach((L, i) => { L.rotation.z = Math.sin(gait + (i === 0 || i === 3 ? 0 : Math.PI)) * (chase ? 0.6 : 0.35) })
    rig.limbs[4].rotation.y = Math.sin(t * (chase ? 9 : 3)) * 0.35
    grp.position.y = gz + Math.abs(Math.sin(gait)) * 0.04
    rig.face.rotation.z = chase ? -0.1 : Math.sin(t * 0.6) * 0.08
  } else {
    // 手臂：悬浮个体缓慢抽搐摆动；饥饿/巨笑魇随步伐拖动
    rig.limbs.forEach((L, i) => {
      const s2 = i ? 1 : -1
      if (rig.float > 0) L.rotation.z = Math.sin(t * 1.3 + i) * 0.18 + (chase ? -0.5 : 0)
      else L.rotation.z = Math.sin(gait + i * Math.PI) * (chase ? 0.45 : 0.25) - (rig.kind === 'great' ? 0.25 : 0.1)
      void s2
    })
    if (rig.float > 0) grp.position.y = gz + rig.float + Math.sin(t * 2.2) * 0.1
    else grp.position.y = gz + Math.abs(Math.sin(gait)) * (rig.kind === 'great' ? 0.05 : 0.03)
    // 前倾：追击时上身压低前冲
    if(rig.head)rig.head.position.x=.36+(chase?.04:0)
    else rig.face.position.x = (rig.kind === 'starved' ? 0.23 : 0.32) + (chase ? 0.04 : 0)
    grp.rotation.z = rig.kind !== 'great' && chase ? -0.12 : 0
  }
  if (rig.waist) {
    const scale = e.def.scale ?? 1
    const roofBend = view ? greatCeilingBend(view.headroom, scale) : s?.ceilingBend ?? 0
    const combat = s && ['stalk', 'pounce', 'flank', 'standoff'].includes(s.phase)
    const focus = view && combat ? 1 - THREE.MathUtils.smoothstep(view.distance, SMILER_STOP.great + .2, SMILER_STOP.great + 2) : 0
    const target = Math.max(roofBend, view ? greatAttackBend(view.eyeAboveFeet, scale) * focus : 0)
    const damp = 1 - Math.exp(-9 * Math.min(.1, view?.dt ?? 1 / 60))
    // A new roof must be respected on the first frame; standing back up is smoothed.
    const bend = rig.bend = Math.max(roofBend, (rig.bend ?? 0) + (target - (rig.bend ?? 0)) * damp)
    rig.waist.rotation.z = -bend
    rig.body.scale.set(1, 1, 1)
    grp.position.y = gz
    const c = Math.cos(bend), sn = Math.sin(bend)
    const fx = rig.head!.position.x, fy = rig.head!.position.y
    const faceX = (fx * c + fy * sn) * scale
    const faceY = (GREAT_WAIST + fy * c - fx * sn + .18) * scale
    const pitch = view ? THREE.MathUtils.clamp(Math.atan2(view.eyeAboveFeet - faceY, Math.max(.4, view.distance - faceX)), -.6, .6) * focus : 0
    rig.head!.rotation.z = bend + pitch
    bendBody(rig,bend,pitch)
    // Counter-rotate the shoulders partially: arms hang below the bent torso.
    rig.limbs.forEach(L => { L.rotation.z += bend * .7 })
  }
  // 面部轻微歪头（对峙时缓慢倾斜，更瘆人）
  if (s?.phase === 'standoff') rig.face.rotation.x = Math.sin(t * 0.5) * 0.25
  else rig.face.rotation.x *= 0.9
}
