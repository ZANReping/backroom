// 前厅 RealityBreak 3D 场景（Three.js 实时渲染，独立 WebGL 上下文）。
// 坐标：原点 = 抓取瞬间的玩家眼睛，Y 向上，轴向与游戏 three 场景一致（六面抓取的基向量直接可用）。
// 分镜（秒）：
//   crack   0.0–1.9  裂缝从脚下沿碎片边缘向外扩散（裂缝透黄光），画面就是回程终点的真实世界
//   shatter 1.9–4.6  碎片由近到远剥落、翻滚，露出背后的黑暗虚空；3.2 s 起脚下塌空，开始下坠
//   void    4.6–6.2  虚空中下坠：环境碎片在四周缓慢翻滚、相对上升；镜头平视环顾
//   self    6.2–7.8  镜头缓慢俯视，看到自己的身体在下坠（衣服抖动），手机/手电飘出
//   maze    7.8–11.4 脚下远处的黄色迷宫（Level 0 俯视：墙纸墙体 + 荧光灯格）急速放大，穿过天花板层
//   impact  11.4–11.9 被荧光黄白淹没 → 撞击闪白 → 黑场（由 React 层接管）
// 碎片：InstancedMesh（一个三棱柱模板 × 每片三个角点等实例属性），动画全部在顶点着色器里按时间求值；
// 正面按「静止时的视线方向」采样六面图集，所以碎片飞走、翻滚后仍保持原来那块环境的图案。
import * as THREE from 'three'
import { buildBreakBody, type BreakAppearance } from './breakBody'
import type { BreakCubeCapture } from '@/game/core/breakCube'

export const TL = {
  crackEnd: 1.9,
  peelStart: 1.45,
  peelEnd: 4.4,
  fallStart: 3.2,
  voidStart: 4.6,
  lookDown0: 6.2,
  lookDown1: 7.8,
  mazeAppear: 5.6,
  ceil: 11.4,
  impact: 11.75,
  end: 11.95,
} as const

export type Stage3D = 'crack' | 'shatter' | 'void' | 'self' | 'maze' | 'impact'
export function stageAt(t: number): Stage3D {
  return t < TL.crackEnd ? 'crack' : t < TL.voidStart ? 'shatter' : t < TL.lookDown0 ? 'void' : t < TL.lookDown1 ? 'self' : t < TL.ceil ? 'maze' : 'impact'
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }
const lerp = (a: number, b: number, k: number) => a + (b - a) * k

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

/** 玩家相对碎片的累计下坠位移（碎片相对玩家上升，m）：起步加速后接近终端相对速度。 */
export function riseAt(t: number) {
  const a = 2.6, vmax = 3.4, t0 = TL.fallStart
  if (t <= t0) return 0
  const dt = t - t0, ta = vmax / a
  return dt < ta ? 0.5 * a * dt * dt : 0.5 * a * ta * ta + vmax * (dt - ta)
}
/** 迷宫天花板相对眼睛的高度（负数，m）：远处缓慢 → 最后急速逼近，TL.ceil 时到达。 */
export function mazeTopAt(t: number) {
  const s = clamp01((t - TL.mazeAppear) / (TL.ceil - TL.mazeAppear))
  return -300 * Math.pow(1 - s, 1.6)
}

// ---------------------------------------------------------------------------
// 碎片
// ---------------------------------------------------------------------------
const SHARD_VS = /* glsl */`
attribute vec3 tb;
attribute vec2 tdk;  // 厚度侧(0 正面 / 1 背面), 面类型(0 正面 / 1 背面 / 2 断面)
attribute vec3 aA;
attribute vec3 aB;
attribute vec3 aC;
attribute vec4 aP;   // 剥落时刻, 距脚下距离, 厚度, 上升系数
attribute vec4 aW;   // 旋转轴 xyz, 角速度
attribute vec3 aV;   // 剥落初速度
attribute vec4 aQ;   // 漂浮目标点 xyz, 靠拢系数
uniform float uT;
uniform float uRise;
varying vec3 vRest;
varying vec3 vBary;
varying float vKind;
varying float vDet;
varying float vDist;
varying vec3 vN;
varying float vDepth;
varying float vSeed;
mat3 rotAxis(vec3 a, float ang) {
  float s = sin(ang), c = cos(ang), oc = 1.0 - c;
  return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
              oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
              oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c);
}
void main() {
  float td = tdk.x, tk = tdk.y;
  vec3 n = normalize(cross(aB - aA, aC - aA));
  vec3 cen = (aA + aB + aC) / 3.0;
  if (dot(n, -cen) < 0.0) n = -n;
  vec3 rest = tb.x * aA + tb.y * aB + tb.z * aC;
  vec3 local = rest - cen - n * aP.z * td;
  float lt = max(0.0, uT - aP.x);
  float det = smoothstep(0.0, 0.45, lt);
  float ang = aW.w * lt + det * 0.18 * sign(aW.w);
  mat3 R = rotAxis(normalize(aW.xyz), ang);
  vec3 c = cen + aV * lt * det + vec3(0.0, uRise * mix(1.0, aP.w, det), 0.0);
  c = mix(c, aQ.xyz + vec3(0.0, uRise * aP.w, 0.0), smoothstep(0.0, 7.0, lt) * aQ.w);
  // 让开玩家所在的竖直通道（脚下的碎片不从脸上穿过）
  float hl = length(c.xz);
  float need = 3.2 + aP.z * 2.0;
  if (hl < need && hl > 1e-3) c.xz *= 1.0 + (need - hl) / hl * smoothstep(0.0, 1.6, lt);
  vec3 p = c + R * local;
  vN = R * n * (tk > 0.5 && tk < 1.5 ? -1.0 : 1.0);
  vRest = rest; vBary = tb; vKind = tk; vDet = det; vDist = aP.y;
  vSeed = fract(sin(dot(cen, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`
const SHARD_FS = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uR[6];
uniform vec3 uU[6];
uniform vec3 uF[6];
uniform float uFront;
uniform float uGlow;
uniform float uVoid;
uniform float uMaze;
varying vec3 vRest;
varying vec3 vBary;
varying float vKind;
varying float vDet;
varying float vDist;
varying vec3 vN;
varying float vDepth;
varying float vSeed;
vec3 envAt(vec3 d) {
  int best = 0; float bd = -2.0;
  vec3 R = uR[0], U = uU[0], F = uF[0];
  for (int i = 0; i < 6; i++) { float k = dot(d, uF[i]); if (k > bd) { bd = k; best = i; R = uR[i]; U = uU[i]; F = uF[i]; } }
  float x = clamp(dot(d, R) / bd, -0.996, 0.996), y = clamp(dot(d, U) / bd, -0.996, 0.996);
  float col = mod(float(best), 3.0), row = floor(float(best) / 3.0);
  vec2 uv = vec2((col + x * 0.5 + 0.5) / 3.0, 1.0 - (row + 0.5 - y * 0.5) / 2.0);
  return texture2D(uAtlas, uv).rgb;
}
void main() {
  float e = min(vBary.x, min(vBary.y, vBary.z));
  float w = max(fwidth(e), 1e-4);
  // 每条边的裂缝强弱不同（避免整齐的网格感）
  float ei = vBary.x <= min(vBary.y, vBary.z) ? 0.0 : (vBary.y <= vBary.z ? 1.0 : 2.0);
  float edgeK = 0.25 + 0.75 * fract(sin((vSeed + ei * 1.731) * 91.7) * 4375.85);
  float reach = smoothstep(0.0, 0.8, uFront - vDist);
  vec3 glowC = vec3(1.0, 0.8, 0.34);
  vec3 col;
  if (vKind > 1.5) {
    // 断面：暗，透出微弱的黄光
    col = vec3(0.045, 0.038, 0.03) + glowC * (0.05 + 0.13 * uGlow);
  } else {
    col = envAt(normalize(vRest));
    if (vKind > 0.5) col = col * 0.55 + vec3(0.015);
    vec3 nn = normalize(vN);
    float key = 0.85 + 0.4 * max(0.0, dot(nn, normalize(vec3(0.35, 0.8, 0.45))));
    col *= mix(1.0, key, vDet);
    col += vec3(0.05, 0.07, 0.1) * vDet * uVoid;                         // 冷光
    col += glowC * max(0.0, -nn.y) * uMaze * 0.5 * vDet;                 // 下方迷宫映上来的黄光
    // 裂缝：暗芯 + 黄光晕（裂缝前沿扫过之后出现），剥落后留为细亮边
    float core = 1.0 - smoothstep(w * 0.6, w * 1.6, e);
    float halo = 1.0 - smoothstep(w * 0.8, w * (2.5 + 4.0 * edgeK), e);
    col = mix(col, vec3(0.03, 0.022, 0.01), core * reach * edgeK * (1.0 - vDet * 0.8));
    col += glowC * halo * reach * uGlow * edgeK * (0.55 - 0.4 * vDet);
    col += glowC * core * vDet * 0.18 * edgeK;
  }
  col *= mix(1.0, exp(-max(0.0, vDepth - 12.0) * 0.03), uVoid);
  gl_FragColor = vec4(col, 1.0);
}
`

interface ShardSet { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; count: number }

/** 三棱柱模板：正面三角、背面三角、三个侧面（非索引）。 */
function prismTemplate() {
  const tb: number[] = [], tdk: number[] = []
  const B = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  const push = (b: number[], d: number, k: number) => { tb.push(...b); tdk.push(d, k) }
  push(B[0], 0, 0); push(B[1], 0, 0); push(B[2], 0, 0)
  push(B[0], 1, 1); push(B[2], 1, 1); push(B[1], 1, 1)
  for (let i = 0; i < 3; i++) {
    const a = B[i], b = B[(i + 1) % 3]
    push(a, 0, 2); push(b, 0, 2); push(b, 1, 2)
    push(a, 0, 2); push(b, 1, 2); push(a, 1, 2)
  }
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('tb', new THREE.Float32BufferAttribute(tb, 3))
  g.setAttribute('tdk', new THREE.Float32BufferAttribute(tdk, 2))
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Array(tb.length).fill(0), 3))
  return g
}

function buildShards(cube: BreakCubeCapture, lite: boolean, atlasTex: THREE.Texture): ShardSet {
  const r = rng(0x5eed3d)
  const tris: [number[], number[], number[], boolean][] = []
  const gy = Math.min(-0.6, Math.max(-2.5, cube.groundY))
  const R = 13.5
  // 地面：以脚下为圆心的抖动环形网格（内密外疏）
  const K = lite ? 5 : 6, N = lite ? 14 : 20
  const ring: number[][][] = [[[0, gy, 0]]]
  for (let k = 1; k <= K; k++) {
    const row: number[][] = []
    for (let i = 0; i < N; i++) {
      const rr = R * Math.pow(k / K, 1.55) * (k === K ? 1 : 0.8 + r() * 0.4)
      const a = (i / N) * Math.PI * 2 + (k === K ? 0 : (r() - 0.5) * (Math.PI / N) * 1.5)
      row.push([Math.cos(a) * rr, gy, Math.sin(a) * rr])
    }
    ring.push(row)
  }
  for (let i = 0; i < N; i++) tris.push([ring[0][0], ring[1][i], ring[1][(i + 1) % N], true])
  for (let k = 1; k < K; k++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, a = ring[k][i], b = ring[k][j], c = ring[k + 1][i], d = ring[k + 1][j]
    if (r() < 0.5) { tris.push([a, c, d, true]); tris.push([a, d, b, true]) } else { tris.push([a, c, b, true]); tris.push([b, c, d, true]) }
  }
  // 周围立面 + 夜空：球面带（从地面边缘的方向起），沿用地面外环的方位角保证接缝
  const L = lite ? 4 : 6
  const e0 = Math.atan2(gy, R)
  const lat: number[][][] = []
  for (let l = 0; l <= L; l++) {
    const row: number[][] = []
    const el = lerp(e0, Math.PI * 0.46, Math.pow(l / L, 1.35))
    for (let i = 0; i < N; i++) {
      const az = (i / N) * Math.PI * 2 + (l === 0 ? 0 : (r() - 0.5) * (Math.PI / N) * 1.4)
      const e = l === 0 ? e0 : el + (r() - 0.5) * 0.12
      const rr = l === 0 ? Math.hypot(R, gy) : R * (0.97 + r() * 0.06)
      row.push([Math.cos(az) * Math.cos(e) * rr, Math.sin(e) * rr, Math.sin(az) * Math.cos(e) * rr])
    }
    lat.push(row)
  }
  for (let l = 0; l < L; l++) for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, a = lat[l][i], b = lat[l][j], c = lat[l + 1][i], d = lat[l + 1][j]
    if (r() < 0.5) { tris.push([a, c, d, false]); tris.push([a, d, b, false]) } else { tris.push([a, c, b, false]); tris.push([b, c, d, false]) }
  }
  const top = [0, R, 0]
  for (let i = 0; i < N; i++) tris.push([lat[L][i], top, lat[L][(i + 1) % N], false])

  const n = tris.length
  const fA = new Float32Array(n * 3), fB = new Float32Array(n * 3), fC = new Float32Array(n * 3)
  const fP = new Float32Array(n * 4), fW = new Float32Array(n * 4), fV = new Float32Array(n * 3), fQ = new Float32Array(n * 4)
  const feet = new THREE.Vector3(0, gy, 0)
  const tmp = new THREE.Vector3()
  tris.forEach(([a, b, c, ground], i) => {
    fA.set(a, i * 3); fB.set(b, i * 3); fC.set(c, i * 3)
    const cx = (a[0] + b[0] + c[0]) / 3, cy = (a[1] + b[1] + c[1]) / 3, cz = (a[2] + b[2] + c[2]) / 3
    const dist = tmp.set(cx, cy, cz).distanceTo(feet)
    const size = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]))
    // 由近到远剥落：脚下最先（与下坠起点对齐），远处立面最后
    const delay = TL.peelStart + Math.pow(clamp01(dist / 20), 0.8) * (TL.peelEnd - TL.peelStart) + (r() - 0.5) * 0.35
    const thick = Math.min(0.32, Math.max(0.06, size * (ground ? 0.06 : 0.045) * (0.7 + r() * 0.6)))
    fP.set([Math.max(TL.peelStart - 0.1, delay), dist, thick, 0.35 + r() * 0.75], i * 4)
    const ax = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
    fW.set([ax.x, ax.y, ax.z, (r() < 0.5 ? -1 : 1) * (0.12 + r() * 0.55) * (ground ? 1.3 : 0.8)], i * 4)
    const hl = Math.max(0.01, Math.hypot(cx, cz))
    if (ground) fV.set([(cx / hl) * (0.6 + r() * 1.2), 0.5 + r() * 1.1, (cz / hl) * (0.6 + r() * 1.2)], i * 3)
    else fV.set([(-cx / hl) * (0.4 + r() * 0.8), 0.2 + r() * 0.6, (-cz / hl) * (0.4 + r() * 0.8)], i * 3)
    // 漂浮目标：玩家四周 2.5–11 m、上下 -38..6 m 的云团（向下看时脚下也有碎片掠过）
    const az = r() * Math.PI * 2, rad = 4.5 + Math.pow(r(), 0.8) * 11
    const yy = -38 * Math.pow(r(), 1.3) + 6 * r()
    fQ.set([Math.cos(az) * rad, yy, Math.sin(az) * rad, 0.3 + r() * 0.5], i * 4)
  })
  const g = prismTemplate()
  g.setAttribute('aA', new THREE.InstancedBufferAttribute(fA, 3))
  g.setAttribute('aB', new THREE.InstancedBufferAttribute(fB, 3))
  g.setAttribute('aC', new THREE.InstancedBufferAttribute(fC, 3))
  g.setAttribute('aP', new THREE.InstancedBufferAttribute(fP, 4))
  g.setAttribute('aW', new THREE.InstancedBufferAttribute(fW, 4))
  g.setAttribute('aV', new THREE.InstancedBufferAttribute(fV, 3))
  g.setAttribute('aQ', new THREE.InstancedBufferAttribute(fQ, 4))
  const vR: THREE.Vector3[] = [], vU: THREE.Vector3[] = [], vF: THREE.Vector3[] = []
  for (let i = 0; i < 6; i++) {
    const o = i * 9, B = cube.bases
    vR.push(new THREE.Vector3(B[o], B[o + 1], B[o + 2])); vU.push(new THREE.Vector3(B[o + 3], B[o + 4], B[o + 5])); vF.push(new THREE.Vector3(B[o + 6], B[o + 7], B[o + 8]))
  }
  const mat = new THREE.ShaderMaterial({
    vertexShader: SHARD_VS, fragmentShader: SHARD_FS, side: THREE.DoubleSide,
    uniforms: {
      uAtlas: { value: atlasTex }, uR: { value: vR }, uU: { value: vU }, uF: { value: vF },
      uT: { value: 0 }, uRise: { value: 0 }, uFront: { value: -1 }, uGlow: { value: 0 }, uVoid: { value: 0 }, uMaze: { value: 0 },
    },
  })
  // GPU 实例化：InstancedBufferGeometry（不用 InstancedMesh 的 instanceMatrix——每片自带 3 个角点 + 动画参数，
  // 再加 4 个矩阵槽会超过 16 个顶点属性上限）
  g.instanceCount = n
  const mesh = new THREE.Mesh(g, mat)
  mesh.frustumCulled = false
  return { mesh, mat, count: n }
}

// ---------------------------------------------------------------------------
// 黄色迷宫（Level 0 俯视）
// ---------------------------------------------------------------------------
const MAZE_VS = /* glsl */`
varying vec3 vW;
varying vec3 vNrm;
void main() {
  mat4 im = mat4(1.0);
#ifdef USE_INSTANCING
  im = instanceMatrix;
#endif
  vec4 wp = modelMatrix * im * vec4(position, 1.0);
  vW = wp.xyz;
  vNrm = normalize(mat3(modelMatrix * im) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const MAZE_FS = /* glsl */`
uniform sampler2D uTex;
uniform float uKind;     // 0 墙, 1 地毯, 2 灯管, 3 灯晕, 4 天花板
uniform float uFade;
uniform float uRad;
uniform float uTop;
uniform float uOpacity;
varying vec3 vW;
varying vec3 vNrm;
void main() {
  float r = length(vW.xz);
  float edge = 1.0 - smoothstep(uRad * 0.62, uRad, r);
  vec3 col; float a = 1.0;
  if (uKind < 0.5) {
    if (abs(vNrm.y) > 0.5) col = vec3(0.86, 0.8, 0.52);
    else {
      vec2 uv = vec2(abs(vNrm.x) > 0.5 ? vW.z : vW.x, vW.y) / 2.6;
      col = texture2D(uTex, uv).rgb * vec3(1.05, 1.0, 0.82);
      col *= 0.55 + 0.45 * smoothstep(uTop - 2.9, uTop - 0.4, vW.y);
    }
  } else if (uKind < 1.5) {
    col = texture2D(uTex, vW.xz / 2.2).rgb * vec3(0.78, 0.7, 0.5);
  } else if (uKind < 2.5) {
    col = vec3(1.25, 1.2, 1.0);
  } else if (uKind < 3.5) {
    a = 0.0;
    col = vec3(1.0, 0.9, 0.55) * 0.22;
  } else {
    col = texture2D(uTex, vW.xz / 1.2).rgb * vec3(1.0, 0.97, 0.85);
    a = uOpacity;
  }
  gl_FragColor = vec4(col * edge * uFade, a);
}
`

interface Maze { group: THREE.Group; mats: THREE.ShaderMaterial[]; ceil: THREE.ShaderMaterial; top: number; rad: number; instances: number }

function buildMaze(lite: boolean, tex: { wall: THREE.Texture; floor: THREE.Texture; ceil: THREE.Texture }): Maze {
  const r = rng(0x10ad0)
  const G = lite ? 44 : 64, CELL = 3, H = 2.8, T = 0.22
  const half = (G * CELL) / 2
  const mk = (kind: number, t: THREE.Texture | null, extra: Partial<THREE.ShaderMaterialParameters> = {}) => new THREE.ShaderMaterial({
    vertexShader: MAZE_VS, fragmentShader: MAZE_FS,
    uniforms: { uTex: { value: t }, uKind: { value: kind }, uFade: { value: 0 }, uRad: { value: half * 1.05 }, uTop: { value: H }, uOpacity: { value: 0 } },
    ...extra,
  })
  const group = new THREE.Group()
  const wallMat = mk(0, tex.wall), floorMat = mk(1, tex.floor), tubeMat = mk(2, null, { side: THREE.DoubleSide })
  const ceilMat = mk(4, tex.ceil, { transparent: true, depthWrite: false, side: THREE.DoubleSide })
  // 墙：随机格墙（不是完美迷宫——Level 0 那种开放又迷乱的格局），中心几格留空（落点）
  const walls: THREE.Matrix4[] = []
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    const cx = -half + i * CELL, cz = -half + j * CELL
    const nearC = Math.abs(i - G / 2) < 2 && Math.abs(j - G / 2) < 2
    if (nearC) continue
    const run = r()
    if (r() < 0.43) { p.set(cx + CELL, H / 2, cz + CELL / 2); s.set(T, H, CELL + T); walls.push(new THREE.Matrix4().compose(p, q, s)) }
    if (run < 0.43) { p.set(cx + CELL / 2, H / 2, cz + CELL); s.set(CELL + T, H, T); walls.push(new THREE.Matrix4().compose(p, q, s)) }
    if (r() < 0.035) { p.set(cx + CELL / 2, H / 2, cz + CELL / 2); s.set(0.7, H, 0.7); walls.push(new THREE.Matrix4().compose(p, q, s)) }
  }
  const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), wallMat, walls.length)
  walls.forEach((m, i) => wallMesh.setMatrixAt(i, m))
  wallMesh.frustumCulled = false
  group.add(wallMesh)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(G * CELL, G * CELL).rotateX(-Math.PI / 2), floorMat)
  floor.frustumCulled = false
  group.add(floor)
  // 荧光灯：每格一组（缺几盏），贴天花板高度
  const tubes: THREE.Matrix4[] = []
  const tq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    if ((i + j) % 2 === 1 || r() < 0.12) continue
    p.set(-half + i * CELL + CELL / 2, H - 0.03, -half + j * CELL + CELL / 2); s.set(1.2, 0.36, 1)
    tubes.push(new THREE.Matrix4().compose(p, tq, s))
  }
  const tubeMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), tubeMat, tubes.length)
  tubes.forEach((m, i) => tubeMesh.setMatrixAt(i, m))
  tubeMesh.frustumCulled = false
  group.add(tubeMesh)
  // 天花板层（快到时才显形，穿过的一瞬）
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(G * CELL, G * CELL).rotateX(-Math.PI / 2), ceilMat)
  ceil.position.y = H + 0.02
  ceil.frustumCulled = false
  ceil.renderOrder = 2
  group.add(ceil)
  return { group, mats: [wallMat, floorMat, tubeMat, ceilMat], ceil: ceilMat, top: H, rad: half * 1.05, instances: walls.length + tubes.length }
}

// ---------------------------------------------------------------------------
// 第一人称身体（下坠中，衣服抖动）+ 飘出的手机 / 手电
// ---------------------------------------------------------------------------
function buildDriftingProps() {
  const groups: THREE.Group[] = [], materials: THREE.Material[] = [], geometries: THREE.BufferGeometry[] = []
  const box = (x:number,y:number,z:number) => new THREE.BoxGeometry(x,y,z,2,2,2)
  const add = (g:THREE.BufferGeometry,m:THREE.Material,pos:[number,number,number],rot:[number,number,number]=[0,0,0],scale:[number,number,number]=[1,1,1],parent:THREE.Object3D) => {
    const mesh=new THREE.Mesh(g,m);mesh.position.set(...pos);mesh.rotation.set(...rot);mesh.scale.set(...scale);parent.add(mesh);geometries.push(g);materials.push(m);return mesh
  }
  // 飘出的手机（亮屏）与手电（镜头微亮）
  const phone = new THREE.Group()
  add(box(0.072, 0.15, 0.009), new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.35, metalness: 0.4 }), [0, 0, 0], [0, 0, 0], [1, 1, 1], phone)
  const scr = new THREE.MeshBasicMaterial({ color: 0x9fc4ff }); materials.push(scr)
  add(box(0.064, 0.138, 0.002), scr, [0, 0, -0.0055], [0, 0, 0], [1, 1, 1], phone)
  const torch = new THREE.Group()
  add(new THREE.CylinderGeometry(0.022, 0.018, 0.17, 12), new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.5, metalness: 0.7 }), [0, 0, 0], [0, 0, 0], [1, 1, 1], torch)
  const lens = new THREE.MeshBasicMaterial({ color: 0xfff2c8 }); materials.push(lens)
  add(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 12), lens, [0, 0.09, 0], [0, 0, 0], [1, 1, 1], torch)

  groups.push(phone,torch)
  return {groups,materials,geometries}
}

// ---------------------------------------------------------------------------
// 尘埃（虚空里的体积感）
// ---------------------------------------------------------------------------
const DUST_VS = /* glsl */`
attribute float aS;
uniform float uRise;
uniform float uSize;
varying float vA;
void main() {
  vec3 p = position;
  p.y = mod(p.y + uRise * (0.6 + aS * 0.8) + 40.0, 56.0) - 40.0;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + aS) * 12.0 / max(1.0, -mv.z);
  vA = (0.25 + 0.75 * aS) * smoothstep(48.0, 6.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`
const DUST_FS = /* glsl */`
uniform vec3 uCol;
uniform float uAmt;
varying float vA;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.0, length(d)) * vA * uAmt;
  gl_FragColor = vec4(uCol * a, a);
}
`

// ---------------------------------------------------------------------------
export interface BreakScene {
  renderer: THREE.WebGLRenderer
  shardCount: number
  mazeInstances: number
  /** 渲染时刻 t（秒），返回该帧渲染耗时（ms，CPU 侧提交）。 */
  render(t: number, w: number, h: number): number
  /** 叠加层用：当前迷宫天花板距离等（React 层画闪白/暗角）。 */
  info(t: number): { mazeTop: number; ceilK: number }
  prepare(w: number, h: number, cancelled?: () => boolean): Promise<void>
  setCapture(cube: BreakCubeCapture): void
  dispose(): void
}

export function createBreakScene(canvas: HTMLCanvasElement, cube: BreakCubeCapture, opts: { lite: boolean; reduced: boolean; appearance?: BreakAppearance }): BreakScene {
  const { lite, reduced } = opts
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.25))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.setClearColor(0x000000, 1)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  const camera = new THREE.PerspectiveCamera(cube.fov, 1, 0.04, 1200)
  const q0 = new THREE.Quaternion(...cube.quat)
  const e0 = new THREE.Euler().setFromQuaternion(q0, 'YXZ')
  const disposables: { dispose(): void }[] = []

  // 六面图集：图集像素就是游戏最终输出（已色调映射的 sRGB），着色器原样输出
  const atlasTex = new THREE.CanvasTexture(cube.atlas)
  atlasTex.colorSpace = THREE.NoColorSpace
  atlasTex.generateMipmaps = false
  atlasTex.minFilter = THREE.LinearFilter
  atlasTex.magFilter = THREE.LinearFilter
  disposables.push(atlasTex)
  let shards = buildShards(cube, lite, atlasTex)
  scene.add(shards.mesh)
  disposables.push(shards.mesh.geometry, shards.mat)

  // L0 贴图（与 Level 0 同一套墙纸 / 地毯 / 天花板）
  const base = (import.meta.env.BASE_URL ?? '/').replace(/\/?$/, '/')
  const loader = new THREE.TextureLoader(), textureReady: Promise<void>[] = []
  const loadTex = (f: string) => {
    let ready!: () => void
    textureReady.push(new Promise<void>(resolve => { ready = resolve }))
    const t = loader.load(`${base}textures/${f}`, () => ready(), undefined, () => ready())
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = THREE.NoColorSpace
    t.anisotropy = lite ? 1 : 4
    disposables.push(t); return t
  }
  const maze = buildMaze(lite, { wall: loadTex('l0_wall.jpg'), floor: loadTex('l0_floor.jpg'), ceil: loadTex('l0_ceil.jpg') })
  maze.group.visible = false
  scene.add(maze.group)
  maze.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) disposables.push(m.geometry) })
  disposables.push(...maze.mats)

  const body = buildBreakBody(opts.appearance)
  const props = buildDriftingProps()
  body.group.visible = false
  scene.add(body.group)
  for (const pr of props.groups) { pr.visible = false; scene.add(pr) }

  disposables.push(...props.materials,...props.geometries)

  // 灯光只照身体与道具（碎片/迷宫为自定义着色器）
  const amb = new THREE.HemisphereLight(0x9fb2c8, 0x3a2f18, 0.55)
  const key = new THREE.DirectionalLight(0xbcd0ff, 1.1); key.position.set(2, 5, 3)
  const under = new THREE.PointLight(0xffd27a, 0, 0, 0); under.position.set(0, -4, 0)
  scene.add(amb, key, under)

  // 尘埃
  const DN = lite ? 260 : 520
  const dr = rng(0xd057)
  const dp = new Float32Array(DN * 3), ds = new Float32Array(DN)
  for (let i = 0; i < DN; i++) { dp.set([(dr() - 0.5) * 30, -40 + dr() * 56, (dr() - 0.5) * 30], i * 3); ds[i] = dr() }
  const dg = new THREE.BufferGeometry()
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3))
  dg.setAttribute('aS', new THREE.BufferAttribute(ds, 1))
  const dm = new THREE.ShaderMaterial({ vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uRise: { value: 0 }, uSize: { value: 2.2 }, uCol: { value: new THREE.Color(0.75, 0.82, 0.95) }, uAmt: { value: 0 } } })
  const dust = new THREE.Points(dg, dm); dust.frustumCulled = false
  scene.add(dust)
  disposables.push(dg, dm)

  const yellow = new THREE.Color(1, 0.86, 0.5), cold = new THREE.Color(0.75, 0.82, 0.95)
  let lastW = 0, lastH = 0

  const camAt = (t: number) => {
    // 视角：起手 = 游戏相机；裂开时轻微震动；虚空中平视环顾；随后缓慢低头看自己，最后几乎垂直向下
    const lookK = smooth((t - 2.6) / 3.2)
    let yaw = e0.y + (reduced ? 0.25 : 0.62) * smooth((t - 2.8) / 4.2) - 0.18 * smooth((t - 6.6) / 3)
    let pitch = lerp(e0.x, 0.06, lookK)
    pitch = lerp(pitch, -1.32, smooth((t - TL.lookDown0) / (TL.lookDown1 - TL.lookDown0)))
    pitch = lerp(pitch, -1.5, smooth((t - 9.4) / 1.8))
    let roll = lerp(e0.z, 0, smooth(t / 2.5)) + (reduced ? 0 : Math.sin(t * 0.7) * 0.035 * smooth((t - 3) / 2))
    if (!reduced) {
      const sh = t < TL.crackEnd ? 0.002 + 0.006 * (t / TL.crackEnd) : t < TL.fallStart + 0.4 ? 0.009 : t > TL.ceil - 1.4 ? 0.006 * smooth((t - TL.ceil + 1.4) / 1.4) : 0.0015
      yaw += Math.sin(t * 53.1) * sh + Math.sin(t * 31.7) * sh * 0.6
      pitch += Math.sin(t * 47.3 + 1) * sh + Math.sin(t * 23.9) * sh * 0.5
      roll += Math.sin(t * 39.3 + 2) * sh * 0.6
    }
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'))
    camera.position.set(0, 0, 0)
    const fov = lerp(cube.fov, cube.fov + 10, smooth((t - TL.fallStart) / 3)) + 8 * smooth((t - 9.6) / 1.8)
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix() }
    return yaw
  }

  return {
    renderer,
    shardCount: shards.count,
    mazeInstances: maze.instances,
    info(t) {
      const top = mazeTopAt(t)
      return { mazeTop: top, ceilK: smooth((top + 7) / 7) }
    },
    async prepare(w, h, cancelled) {
      await Promise.all([Promise.all(textureReady), body.prepare(cancelled)])
      if (cancelled?.()) return
      renderer.setSize(w,h,false); lastW=w; lastH=h; camera.aspect=w/Math.max(1,h); camera.updateProjectionMatrix()
      maze.group.visible=true; body.group.visible=true; for (const p of props.groups) p.visible=true
      // Enumeration is synchronous; restore visibility before awaiting shader completion.
      const compiled=renderer.compileAsync(scene,camera)
      maze.group.visible=false; body.group.visible=false; for (const p of props.groups) p.visible=false
      await compiled
      if (cancelled?.()) return
      for (const d of disposables) if ((d as THREE.Texture).isTexture) renderer.initTexture(d as THREE.Texture)
      for (const texture of body.textures) renderer.initTexture(texture)
      await new Promise<void>(resolve => requestAnimationFrame(() => { if (!cancelled?.()) this.render(8,w,h); resolve() }))
      await new Promise<void>(resolve => requestAnimationFrame(() => { if (!cancelled?.()) this.render(0,w,h); resolve() }))
    },
    setCapture(next) {
      // Pose/FOV come from the final live camera, never from the earlier prewarm view.
      const changedGround=Math.abs(cube.groundY-next.groundY)>.02
      Object.assign(cube,next); q0.set(...next.quat); e0.setFromQuaternion(q0,'YXZ')
      // WebGL2 texStorage is immutable: a differently sized atlas needs fresh GPU storage.
      if (atlasTex.image.width !== next.atlas.width || atlasTex.image.height !== next.atlas.height) atlasTex.dispose()
      atlasTex.image=next.atlas; atlasTex.needsUpdate=true; renderer.initTexture(atlasTex)
      if (changedGround) {
        // Only replace instance data. Reuse the warmed material/program even if the player crouched.
        const nextShards=buildShards(cube,lite,atlasTex)
        nextShards.mat.dispose(); nextShards.mesh.material=shards.mat; nextShards.mat=shards.mat
        scene.remove(shards.mesh); shards.mesh.geometry.dispose()
        shards=nextShards; scene.add(shards.mesh); disposables.push(shards.mesh.geometry)
      }
      for(let i=0;i<6;i++)for(const [key,off]of [['uR',0],['uU',3],['uF',6]] as const)
        (shards.mat.uniforms[key].value[i] as THREE.Vector3).fromArray(next.bases,i*9+off)
      if ((globalThis as unknown as { __foyerAudit?: boolean }).__foyerAudit) (globalThis as unknown as { __breakSceneQA?: unknown }).__breakSceneQA={scene,camera,shards,atlasTex,renderer,body}
    },
    render(t, w, h) {
      const t0 = performance.now()
      if (w !== lastW || h !== lastH) { lastW = w; lastH = h; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix() }
      const yaw = camAt(t)
      const rise = riseAt(t)
      const voidK = smooth((t - TL.peelStart - 0.6) / 2.6)
      const mazeK = smooth((t - TL.lookDown1 + 0.6) / 3.4)
      const u = shards.mat.uniforms
      u.uT.value = t; u.uRise.value = rise
      u.uFront.value = 23 * Math.pow(clamp01((t - 0.05) / 2.6), 1.3)
      u.uGlow.value = smooth(t / 1.4) * (1 - 0.6 * voidK)
      u.uVoid.value = voidK; u.uMaze.value = mazeK
      // 身体：开始下坠后出现（在镜头下方），朝向跟随下坠起点的视线方向
      const bodyOn = t > TL.fallStart - 0.2
      body.group.visible = bodyOn
      body.update(t)
      body.group.rotation.set(0, yaw * 0.25 + e0.y * 0.75, 0)
      body.group.position.set(0, Math.sin(t * 1.3) * 0.015, 0)
      // 手脚随风轻摆
      // 道具：从手边飘出，缓慢翻滚、相对上升
      props.groups.forEach((pr, i) => {
        const lt = t - (TL.lookDown0 - 0.4 + i * 0.5)
        pr.visible = lt > 0
        if (lt <= 0) return
        const side = i === 0 ? 1 : -1
        const fwd = new THREE.Vector3(-Math.sin(e0.y), 0, -Math.cos(e0.y)), right = new THREE.Vector3(Math.cos(e0.y), 0, -Math.sin(e0.y))
        pr.position.copy(right.multiplyScalar(side * (0.55 + lt * 0.12))).addScaledVector(fwd, 0.35 + lt * 0.06)
        pr.position.y = -0.95 + lt * (0.22 + i * 0.08)
        pr.rotation.set(lt * (1.1 + i * 0.6), lt * 0.7, lt * (0.5 - i * 0.9))
      })
      under.intensity = 2.2 * mazeK * (1 + smooth((t - 9.5) / 1.8) * 2.5)
      under.position.y = Math.max(-40, mazeTopAt(t) * 0.25)
      key.intensity = 1.1 * (1 - 0.4 * mazeK)
      // 迷宫
      const top = mazeTopAt(t)
      maze.group.visible = t > TL.mazeAppear
      // 迷宫中心略偏向视线前方（低头时越过双腿就能看见），越近越回到正下方
      const off = Math.max(0, -top) * 0.32 * (1 - smooth((t - 10.2) / 1.1))
      maze.group.position.set(-Math.sin(e0.y) * off, top - maze.top, -Math.cos(e0.y) * off)
      const fade = smooth((t - TL.mazeAppear) / 2.2)
      for (const m of maze.mats) m.uniforms.uFade.value = fade
      maze.ceil.uniforms.uOpacity.value = 0.92 * smooth((top + 16) / 14)
      // 尘埃
      dm.uniforms.uRise.value = rise
      dm.uniforms.uAmt.value = smooth((t - TL.peelStart) / 2) * (reduced ? 0.5 : 1)
      ;(dm.uniforms.uCol.value as THREE.Color).copy(cold).lerp(yellow, mazeK)
      renderer.render(scene, camera)
      return performance.now() - t0
    },
    dispose() {
      body.dispose()
      for (const d of new Set(disposables)) { try { d.dispose() } catch { /* 已释放 */ } }
      renderer.dispose()
      try { renderer.forceContextLoss() } catch { /* 无 */ }
    },
  }
}
