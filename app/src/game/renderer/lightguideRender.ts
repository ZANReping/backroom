// 微光向导（Entity 35）重制——第 3 阶段：游戏内渲染接入。
//   buildLightguideEntityMesh(seed)：按实体 id 取 5–15cm 直径建模（不挂自带点光源，光源走全局灯光池）。
//   animateLightguideEntity(grp, e, dt)：按 AI 写入的 e.lg.clip / clipT / mood 采样阶段 2 的动画片段；
//     片段切换做 0.25s 姿态混合，颜色再做一次指数平滑；穿墙时叠加 phase 片段的淡出 / 色散环。
//   lightguideLights(eng)：把离玩家最近的 LIGHTGUIDE_LIGHT_CAP 只向导折算成 LightSource，交给渲染器的灯光池
//     （与荧光棒同一通道），因此同屏向导点光源数量有上限，也不会因为灯数变化触发着色器重编译。
import * as THREE from 'three'
import { buildLightguideMesh, type LightguideRig } from './lightguideMesh'
import { sampleLightguide, applyLightguidePose, mixLightguidePose, type LightguidePose, type LightguideAnimOpts } from './lightguideAnim'
import { lightguideSize } from '../engine/lightguideAI'
import type { Entity } from '../entities/types'
import type { Engine } from '../engine'
import type { LightSource } from '../core/types'
import { floorHeight } from '../world/mapgen'

/** 同屏最多几只向导真正发光照亮洞壁 */
export const LIGHTGUIDE_LIGHT_CAP = 3
/** 只有这个距离内的向导参与发光 */
export const LIGHTGUIDE_LIGHT_RANGE = 28
/** 这个距离内的向导合并成一盏光 */
export const LIGHTGUIDE_LIGHT_MERGE = 1.2
/** 片段切换混合时长（秒）/ 颜色平滑时间常数（秒） */
const BLEND_T = 0.25, COLOR_TAU = 0.15

interface RenderMem { key: string; from: LightguidePose | null; blendT: number; last: LightguidePose | null; col: { core: [number, number, number]; halo: [number, number, number]; ring: [number, number, number] } | null; shadowsOff: boolean }
/** 每只向导当前显示的光（供灯光池使用）：halo 颜色、亮度×可见度 */
const glow = new WeakMap<Entity, { color: string; power: number; t: number }>()
const _c = new THREE.Color()

export function buildLightguideEntityMesh(seed: number): THREE.Group {
  const g = buildLightguideMesh(lightguideSize(seed), 'idle', { lights: false })
  g.userData.lgRender = { key: '', from: null, blendT: 1, last: null, col: null, shadowsOff: false } as RenderMem
  return g
}

const lerp3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]

/** 采样当前姿态（纯函数部分，单测可直接调用） */
export function lightguideEntityPose(grp: THREE.Object3D, e: Entity): LightguidePose {
  const S = e.lg
  if (!S) return sampleLightguide(grp, 'wander', e.animT, { phase: e.id * 0.37 })
  const o: LightguideAnimOpts = { mood: S.mood, from: S.warnFrom, phase: S.clip === 'wander' ? e.id * 0.37 : 0 }
  if (S.clip === 'nest_orbit') { o.index = S.orbit.i; o.count = S.orbit.n; o.radius = S.orbit.r; o.mood = S.mood }
  if (S.clip === 'flee') o.dir = [1, 0.35, 0]
  const P = sampleLightguide(grp, S.clip, S.clipT, o)
  if (S.phaseT >= 0) {
    // 穿墙叠加：位置 / 颜色沿用主片段，只取 phase 片段的可见度与光晕变化
    const ph = sampleLightguide(grp, 'phase', S.phaseT, { mood: S.mood })
    P.alpha *= ph.alpha; P.ringK *= ph.ringK; P.haloK *= ph.haloK; P.innerK *= ph.innerK
  }
  P.bright *= S.dim
  return P
}

export function animateLightguideEntity(grp: THREE.Group, e: Entity, dt: number) {
  const rig = grp.userData.lightguideRig as LightguideRig | undefined
  if (!rig) return
  let mem = grp.userData.lgRender as RenderMem | undefined
  if (!mem) { mem = { key: '', from: null, blendT: 1, last: null, col: null, shadowsOff: false }; grp.userData.lgRender = mem }
  if (!mem.shadowsOff) { grp.traverse((o) => { o.castShadow = false; o.receiveShadow = false }); mem.shadowsOff = true }
  let P = lightguideEntityPose(grp, e)
  // 片段切换：从上一帧姿态混合过去（beckon 回绕不算切换——锚点已同步前移）
  const key = e.lg ? e.lg.clip : 'wander'
  if (key !== mem.key) { mem.from = mem.last; mem.blendT = 0; mem.key = key }
  if (mem.from && mem.blendT < BLEND_T) { mem.blendT += dt; const k = Math.min(1, mem.blendT / BLEND_T); P = mixLightguidePose(mem.from, P, k * k * (3 - 2 * k)) }
  // 颜色指数平滑（模式切换时颜色渐变，不跳变）
  const kc = 1 - Math.exp(-Math.max(0, dt) / COLOR_TAU)
  if (!mem.col) mem.col = { core: P.core, halo: P.halo, ring: P.ring }
  else mem.col = { core: lerp3(mem.col.core, P.core, kc), halo: lerp3(mem.col.halo, P.halo, kc), ring: lerp3(mem.col.ring, P.ring, kc) }
  P = { ...P, core: mem.col.core, halo: mem.col.halo, ring: mem.col.ring }
  mem.last = P
  applyLightguidePose(grp, P)
  const vis = e.dead || e.hidden ? 0 : Math.max(0, Math.min(1, P.alpha))
  glow.set(e, { color: '#' + _c.setRGB(...P.halo).getHexString(), power: Math.max(0, P.bright) * vis, t: performance.now() })
}

const lightCache = new WeakMap<Engine, Map<number, LightSource>>()
/** 灯光池通道：离玩家最近的 LIGHTGUIDE_LIGHT_CAP 只向导各贡献一盏小点光源 */
export function lightguideLights(eng: Engine): LightSource[] {
  const m = eng.map
  if (!m) return []
  let cache = lightCache.get(eng)
  if (!cache) { cache = new Map(); lightCache.set(eng, cache) }
  const p = eng.player
  const cands: { e: Entity; d: number }[] = []
  for (const e of m.entities) {
    // presentationPending：网格还在模型预热队列里（renderer 把整组藏起来，直到着色器编译、贴图和缓冲上传完成）。
    // 这期间光球本体看不见，若照常发光就会出现「地上有光、空中没球」——等网格可见后再一起亮。
    if (e.def.type !== 'lightguide' || e.dead || e.hidden || e.presentationPending) continue
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    if (d <= LIGHTGUIDE_LIGHT_RANGE) cands.push({ e, d })
  }
  cands.sort((a, b) => a.d - b.d)
  const out: LightSource[] = [], seen = new Set<number>()
  const picked: Entity[] = []
  for (const { e } of cands) {
    if (picked.length >= LIGHTGUIDE_LIGHT_CAP) break
    // 一组挤在一起的向导（守巢、随行）只算一盏光，避免几盏叠在一处把地面烧白、把光球本身淹没
    if (picked.some((q) => Math.hypot(q.x - e.x, q.y - e.y) < LIGHTGUIDE_LIGHT_MERGE)) continue
    picked.push(e)
  }
  for (const e of picked) {
    const gl = glow.get(e)
    const size = e.lg?.size ?? lightguideSize(e.id)
    let L = cache.get(e.id)
    if (!L) { L = { x: e.x, y: e.y, r: 2.2, color: '#9ff2ff', flickerSeed: 0, noFix: 1, keep: 1, intensityMul: 0.17 }; cache.set(e.id, L) }
    L.x = e.x; L.y = e.y
    // 守巢时光球贴近溪底：光源至少抬到离地 0.6m，避免在地面上烧出一块过曝的光斑
    const ground = floorHeight(m, e.x, e.y, 0)
    L.fixZ = Math.max(e.z, Number.isFinite(ground) ? ground + 0.6 : e.z) + 0.2
    L.color = gl?.color ?? '#ffe9c8'
    // 光球越大越亮、照得越远；亮度随片段（闪烁 / 穿墙淡出 / 逃离骤暗）实时变化
    const sizeK = 0.65 + (size - 0.05) * 6
    L.r = 1.7 + sizeK * 0.8
    L.intensityMul = 0.17 * sizeK * (gl ? gl.power : 1)
    seen.add(e.id); out.push(L)
  }
  for(const id of cache.keys())if(!seen.has(id))cache.delete(id)
  return out
}
