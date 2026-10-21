// 邻里守望 / 残缺者的游戏内表现：由 watchAI 的 e.nw（片段名、片段时间、注视点、辉光）驱动 watchAnim.poseWatch，
// 并负责观察者光束、挺进者把被抓的人吊在附肢间、残缺者的分部位分帧加载与 LOD、同化后的体型增长。
import * as THREE from 'three'
import { QA_CPU_SKIN, syncSceneCpuSkins } from './qaCpuSkin'
import type { Entity } from '../entities'
import { buildWatchMesh, WATCHER_HOVER } from './neighborhoodWatchMesh'
import { addMangledPart, buildMangledRig, buildMangledShroud, MANGLED_PARTS, prepareMangledPartJob, prepareMangledTextures, updateMangledLod, type Lod, type MangledPart } from './mangledMesh'
import { poseWatch } from './watchAnim'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const PREPARED = new Set<string>()
/** 游戏内构建：观察者/挺进者直接构建；残缺者只挂已经准备好的部位（其余在之后的帧里补上） */
export function buildNWMesh(type: 'watcher' | 'strider' | 'mangled'): THREE.Group {
  if (type !== 'mangled') return buildWatchMesh(type)
  if (!mangledGeometryReady(1)) { const job = prepareMangledJob(1); while (!job.next().done) { /* synchronous fallback for standalone callers; game/portraits prepare first */ } }
  const g = buildMangledRig()
  for (const p of MANGLED_PARTS) if (PREPARED.has(p + 1)) addMangledPart(g, p, 1)
  const shroud = buildMangledShroud(); shroud.name = 'mangled-shroud'; g.add(shroud)
  g.userData.parts = undefined
  return g
}
/** 分帧准备残缺者几何：每 yield 一次只构建一个部位（先远景精度，再精细精度） */
export function mangledGeometryReady(lod: Lod = 1) { return MANGLED_PARTS.every((p) => PREPARED.has(p + lod)) }
export function* prepareMangledJob(lod: Lod = 1): Generator<void, void> {
  yield* prepareMangledTextures()
  for (const p of MANGLED_PARTS) {
    if (PREPARED.has(p + lod)) continue
    yield
    yield* prepareMangledPartJob(p as MangledPart, lod); PREPARED.add(p + lod)
  }
}

const tmp = V(), tmp2 = V()
/** 把地图坐标差（dx, dy）与高度差转成模型局部坐标（+X 正面，rotation.y = -facing） */
function toLocal(facing: number, dx: number, dy: number, h: number, scale = 1) {
  const c = Math.cos(facing), s = Math.sin(facing)
  return V((dx * c + dy * s) / scale, h / scale, (-dx * s + dy * c) / scale)
}

function beamMesh(grp: THREE.Group): THREE.Mesh {
  let b = grp.userData.nwBeam as THREE.Mesh | undefined
  if (b) return b
  const geo = new THREE.CylinderGeometry(0.16, 0.34, 1, 12, 1, true); geo.translate(0, 0.5, 0); geo.rotateZ(-Math.PI / 2) // 沿 +X
  // 外层辉光：边缘随视角淡出（菲涅尔反向），看起来是一束光而不是一根实心白管；内层是细而亮的光芯
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#ffe6b0') }, uOpacity: { value: 0.55 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; void main(){ float f = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(uColor * pow(f, 2.2) * uOpacity, 1.0); }',
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  })
  b = new THREE.Mesh(geo, mat); b.frustumCulled = false; b.visible = false
  const coreGeo = new THREE.CylinderGeometry(0.05, 0.09, 1, 8, 1, true); coreGeo.translate(0, 0.5, 0); coreGeo.rotateZ(-Math.PI / 2)
  const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: '#fff8ec', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); core.frustumCulled = false
  b.add(core)
  grp.add(b); grp.userData.nwBeam = b
  return b
}

export interface NWRenderCtx { player: { x: number; y: number; z: number }; camera: THREE.Camera; growth: number; held: boolean }
export function animateNW(grp: THREE.Group, e: Entity, gz: number, ctx: NWRenderCtx) {
  animateNWPose(grp, e, gz, ctx)
  if (QA_CPU_SKIN && grp.visible) syncSceneCpuSkins(grp) // 仅 ?cpu=1 的 QA：无头 SwiftShader 画不了 GPU 蒙皮
}
function animateNWPose(grp: THREE.Group, e: Entity, gz: number, ctx: NWRenderCtx) {
  const s = e.nw
  const clip = s?.clip ?? (e.def.type === 'watcher' ? 'hover' : 'idle'), t = s?.clipT ?? e.animT
  const p = ctx.player
  if (e.def.type === 'watcher') {
    grp.position.y = gz + WATCHER_HOVER
    const dx = (s?.aimX ?? p.x) - e.x, dy = (s?.aimY ?? p.y) - e.y, dist = Math.hypot(dx, dy)
    const pitch = Math.atan2((s?.aimZ ?? 1.5) - gz - WATCHER_HOVER, Math.max(0.5, dist))
    poseWatch(grp, clip, t, { pitch: s && s.phase !== 'patrol' ? pitch : undefined })
    const beam = beamMesh(grp), on = clip === 'beam'
    beam.visible = on
    if (on) {
      const L = toLocal(e.facing, (s?.aimX ?? p.x) - e.x, (s?.aimY ?? p.y) - e.y, (s?.aimZ ?? p.z + 1.2) - gz - WATCHER_HOVER)
      L.x -= 1.1
      const len = L.length()
      beam.position.set(1.1, 0, 0)
      beam.scale.set(len, 1 + Math.sin(t * 60) * 0.08, 1 + Math.sin(t * 47) * 0.08)
      beam.quaternion.setFromUnitVectors(V(1, 0, 0), L.normalize())
      ;(beam.material as THREE.ShaderMaterial).uniforms.uOpacity.value = 0.45 + 0.15 * Math.sin(t * 33)
    }
    return
  }
  grp.position.y = gz
  if (e.def.type === 'strider') {
    const tgt = toLocal(e.facing, p.x - e.x, p.y - e.y, (ctx.held ? s?.holdZ ?? 1 : p.z + 0.9))
    poseWatch(grp, clip, t, { target: tgt, speed: clip === 'run' ? 7.5 : 2.9 })
    return
  }
  // 残缺者：同化后长大；分部位 LOD
  const k = ctx.growth
  grp.scale.setScalar(k)
  const tgt = toLocal(e.facing, p.x - e.x, p.y - e.y, ctx.held ? (s?.holdZ ?? 0) : p.z + 1, k)
  poseWatch(grp, clip, t, { target: tgt })
  for (const part of MANGLED_PARTS) if (PREPARED.has(part + 1) && !(grp.userData.mangledRig.parts[part])) addMangledPart(grp, part, 1)
  tmp.copy(ctx.camera.position); tmp2.copy(tmp)
  updateMangledLod(grp, tmp2)
}
/** 精细几何是否都准备好了（渲染器据此决定要不要继续排队准备 LOD0） */
export const mangledHiReady = () => mangledGeometryReady(0)
