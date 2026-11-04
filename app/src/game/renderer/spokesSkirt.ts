// [E28 裙摆穿腿] 迎宾女郎裙摆对腿胶囊的顶点级推出（蒙皮之后、投影之前）。
//   · 每帧由骨骼求 4 个锥形胶囊（左右 大腿段 / 小腿上段，网格局部 = 蒙皮输出空间），
//     裙摆顶点（aSkirt 权重）若陷进任一胶囊，沿胶囊径向推到表面外 SKIRT_MARGIN；迭代 3 次处理两腿夹缝。
//   · GPU 蒙皮：身体材质在 <skinning_vertex> 之后插入同一算法（GLSL），胶囊在 SkinnedMesh.onBeforeRender 里按实例更新；
//   · CPU（验收脚本）：skirtPushLocal 与 GLSL 逐行对应。
//   胶囊尺寸与 check-spokes-anim 的 legDepth 一致（半径取 spokesBody.legSdf × K）。
import * as THREE from 'three'
import { BONES, B } from './spokesRig'

export const SKIRT_MARGIN = 0.002
export const SKIRT_ITERS = 6
const JP = (n: string) => BONES[B[n]].pos as number[]
/** 腿网格只建到行李员空间 y 0.72（× K）：大腿胶囊从该高度起算 */
export const SKIRT_LEG_TOP = 0.72 * 0.925
export const SKIRT_F0 = (JP('thighL')[1] - SKIRT_LEG_TOP) / (JP('thighL')[1] - JP('shinL')[1])
/** [a 端半径, b 端半径]：大腿段（h→膝）、小腿上段（膝→膝 30% 到踝） */
export const SKIRT_CAP_R: [number, number][] = [[0.052, 0.04], [0.041, 0.036]]

export interface SkirtCaps { a: THREE.Vector3[]; b: THREE.Vector3[]; r: THREE.Vector2[] }
export const newSkirtCaps = (): SkirtCaps => ({ a: [0, 1, 2, 3].map(() => new THREE.Vector3()), b: [0, 1, 2, 3].map(() => new THREE.Vector3()), r: [0, 1, 2, 3].map(() => new THREE.Vector2()) })

const _t = new THREE.Vector3(), _k = new THREE.Vector3(), _f = new THREE.Vector3()
/** 由骨骼世界矩阵求胶囊（蒙皮输出空间 = bindMatrixInverse · 世界） */
export function updateSkirtCaps(sk: THREE.SkinnedMesh, bones: Record<string, THREE.Bone>, out: SkirtCaps) {
  const bi = sk.bindMatrixInverse
  let j = 0
  for (const S of ['L', 'R']) {
    _t.setFromMatrixPosition(bones['thigh' + S].matrixWorld).applyMatrix4(bi)
    _k.setFromMatrixPosition(bones['shin' + S].matrixWorld).applyMatrix4(bi)
    _f.setFromMatrixPosition(bones['foot' + S].matrixWorld).applyMatrix4(bi)
    out.a[j].copy(_t).lerp(_k, SKIRT_F0); out.b[j].copy(_k); out.r[j].set(SKIRT_CAP_R[0][0], SKIRT_CAP_R[0][1]); j++
    out.a[j].copy(_k); out.b[j].copy(_k).lerp(_f, 0.3); out.r[j].set(SKIRT_CAP_R[1][0], SKIRT_CAP_R[1][1]); j++
  }
  return out
}

const _ab = new THREE.Vector3(), _ap = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3()
/** 把蒙皮后的局部点 p 推出胶囊（w = aSkirt，0..1）。与 GLSL_SKIRT_PUSH 同一算法 */
export function skirtPushLocal(p: THREE.Vector3, caps: SkirtCaps, w: number) {
  if (w <= 0) return p
  for (let it = 0; it < SKIRT_ITERS; it++) {
    for (let i = 0; i < 4; i++) {
      _ab.subVectors(caps.b[i], caps.a[i]); _ap.subVectors(p, caps.a[i])
      const t = Math.min(1, Math.max(0, _ap.dot(_ab) / Math.max(1e-8, _ab.lengthSq())))
      _c.copy(caps.a[i]).addScaledVector(_ab, t)
      _d.subVectors(p, _c)
      const dist = _d.length(), r = caps.r[i].x + (caps.r[i].y - caps.r[i].x) * t + SKIRT_MARGIN
      if (dist < r) {
        if (dist < 1e-5) _d.set(0, 0, 1); else _d.multiplyScalar(1 / dist)
        p.addScaledVector(_d, (r - dist) * w)
      }
    }
  }
  return p
}

export const GLSL_SKIRT_DECL = 'attribute float aSkirt;\nuniform vec3 uSkA[4];\nuniform vec3 uSkB[4];\nuniform vec2 uSkR[4];\n'
export const GLSL_SKIRT_PUSH = `
if (aSkirt > 0.0) {
  for (int it = 0; it < ${SKIRT_ITERS}; it++) {
    for (int i = 0; i < 4; i++) {
      vec3 ab = uSkB[i] - uSkA[i];
      float t = clamp(dot(transformed - uSkA[i], ab) / max(1e-8, dot(ab, ab)), 0.0, 1.0);
      vec3 d = transformed - (uSkA[i] + ab * t);
      float dist = length(d), r = mix(uSkR[i].x, uSkR[i].y, t) + ${SKIRT_MARGIN.toFixed(4)};
      if (dist < r) transformed += (dist < 1e-5 ? vec3(0.0, 0.0, 1.0) : d / dist) * (r - dist) * aSkirt;
    }
  }
}
`

/** 每顶点裙摆权重：裙材质（aMat.x≈2）或裙骨（hem/skirt）权重，按静止高度 0.75→0.80 m 渐隐 */
export function skirtWeights(g: THREE.BufferGeometry, skirtBoneIdx: Set<number>) {
  const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, mat = g.attributes.aMat
  const out = new Float32Array(pos.count)
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  for (let i = 0; i < pos.count; i++) {
    let sum = 0
    for (let k = 0; k < 4; k++) if (skirtBoneIdx.has(si.getComponent(i, k))) sum += sw.getComponent(i, k)
    const isSkirt = mat && Math.abs(mat.getX(i) - 2) < 0.25 ? 1 : 0
    out[i] = Math.max(isSkirt * ss(0.0, 0.05, sum + 0.05), ss(0.05, 0.25, sum)) * (1 - ss(0.75, 0.8, pos.getY(i)))
  }
  return out
}

/** 给 SkinnedMesh 装上：aSkirt 属性（几何按 LOD 共享，算一次）+ 每实例胶囊 uniform（onBeforeRender 更新） */
export const SKIRT_UNI = { uSkA: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, -9, 0)) }, uSkB: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(0, -9, 0)) }, uSkR: { value: [0, 1, 2, 3].map(() => new THREE.Vector2()) } }
export function installSkirtCollide(sk: THREE.SkinnedMesh, bones: Record<string, THREE.Bone>) {
  const g = sk.geometry
  if (!g.attributes.aSkirt) {
    const idx = new Set(['hemL', 'hemR', 'skirtL', 'skirtR'].map((n) => B[n]).filter((x) => x !== undefined))
    g.setAttribute('aSkirt', new THREE.BufferAttribute(skirtWeights(g, idx), 1))
  }
  const caps = newSkirtCaps()
  sk.userData.skirtCaps = caps
  sk.onBeforeRender = (_r, _s, _c, _g, m) => {
    updateSkirtCaps(sk, bones, caps)
    for (let i = 0; i < 4; i++) { SKIRT_UNI.uSkA.value[i].copy(caps.a[i]); SKIRT_UNI.uSkB.value[i].copy(caps.b[i]); SKIRT_UNI.uSkR.value[i].copy(caps.r[i]) }
    ;(m as THREE.Material & { uniformsNeedUpdate?: boolean }).uniformsNeedUpdate = true
  }
}
