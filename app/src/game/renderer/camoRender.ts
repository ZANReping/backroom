// 迷彩爬行者（Entity 31）重制阶段 3：渲染接入层。
//  · buildCamoEntity：阶段 1 的四臂潜伏者网格 + 手上的巨石；把所有伪装材质的岩面采样改成「共享统一量」，
//    并在三平面坐标上加窗口原点偏移，使岩面纹理与 L8 洞壁（caveVolume 的世界坐标三平面投影）完全对齐。
//  · animateCamo：按 AI 的 e.cc.clip / clipT 采样阶段 2 的片段，切片段时 0.18s 混合；远处降频或停采样。
//  · animateCamoDeath：死亡片段。syncCamoBoulders：砸地后留在原地的巨石。
// 共享统一量：uRock（当前生态带洞壁贴图）、uRockScale、uRockTint、uRockOffset 全体实例同一组对象，每帧只按玩家
// 所在生态带更新一次；每只个体只有自己的 uCamo。程序共享同一个 cache key，不会每只编译一份。
import * as THREE from 'three'
import { buildCamoCrawlerJob, buildCamoBoulder, type CamoRig } from './camoCrawlerMesh'
import { sampleCamo, applyCamoPose, mixCamoPose, CAMO_CLIPS, CAMO_IDLE_LEVEL, type CamoClip, type CamoPose, type CamoAnimOpts } from './camoCrawlerAnim'
import { levelTexture } from './shared'
import { infiniteImplFor } from '../world/infiniteRegistry'
import { CS, chunkKey } from '../world/infinite'
import { camoBoulders, type CamoBoulder } from '../engine/camoAI'
import type { Entity } from '../entities'
import type { Engine } from '../engine'

/** 渲染 LOD：14m 内每帧采样；14–30m 以 8Hz 采样；30m 外停在最后一个姿态 */
export const CAMO_RENDER = { NEAR: 14, FAR: 30, MID_HZ: 8, BLEND: 0.18, BOULDER_VIEW: 40 } as const

// ---------- 共享伪装统一量 ----------
const SHARED = {
  uRock: { value: null as THREE.Texture | null },
  uRockScale: { value: 1.1 },
  uRockTint: { value: new THREE.Color(1, 1, 1) },
  uRockOffset: { value: new THREE.Vector3() },
}
let fallbackRock: THREE.Texture | null = null
let sharedStamp = -1, sharedEngine: Engine | null = null, sharedVariant = ''
/** 伪装岩面的亮度修正：爬行者用 Lambert/Phong，洞壁是 PBR（粗糙度≈1、环境光底），同色时爬行者会偏亮一点 */
const TINT_GAIN = 0.92
/** 盲眼的最大融合比例 */
const EYE_CAMO = 0.86

/** 共享统一量随玩家所在生态带切换（每帧最多一次） */
export function updateCamoShared(eng: Engine) {
  if (sharedEngine === eng && sharedStamp === eng.time) return
  sharedEngine = eng; sharedStamp = eng.time
  const m = eng.map
  if (!m) return
  const inf = m.inf
  SHARED.uRockOffset.value.set(inf?.ox ?? 0, 0, inf?.oy ?? 0)
  const volume = m.caveVolumeId !== undefined ? infiniteImplFor(m.caveVolumeId).caveVolume : undefined
  if (!volume || !inf) {
    if (sharedVariant !== '-') { sharedVariant = '-'; SHARED.uRock.value = fallbackRock; SHARED.uRockScale.value = 1.1; SHARED.uRockTint.value.setRGB(1, 1, 1) }
    return
  }
  const p = eng.player
  const variant = inf.chunks.get(chunkKey(Math.floor((p.x + inf.ox) / CS), Math.floor((p.y + inf.oy) / CS)))?.variant ?? ''
  if (variant === sharedVariant) return
  sharedVariant = variant
  const spec = volume.materials?.[variant] ?? { texture: volume.texture ?? 'l8_wall.jpg', color: volume.color, textureScale: undefined }
  SHARED.uRock.value = levelTexture(spec.texture, () => fallbackRock ?? new THREE.Texture())
  SHARED.uRockScale.value = spec.textureScale ?? 0.34
  SHARED.uRockTint.value.set(spec.color ?? volume.color ?? '#8a8272').multiplyScalar(TINT_GAIN)
}

/** 把一只个体的伪装材质接到共享统一量上，并给三平面坐标加窗口原点偏移（必须在首次编译前调用） */
function shareCamoUniforms(grp: THREE.Group) {
  const rig = grp.userData.camoRig as CamoRig
  fallbackRock ??= rig.camo.uRock.value
  if (!SHARED.uRock.value) SHARED.uRock.value = fallbackRock
  rig.camo.uRock = SHARED.uRock; rig.camo.uRockScale = SHARED.uRockScale; rig.camo.uRockTint = SHARED.uRockTint
  const done = new Set<THREE.Material>()
  grp.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (done.has(mat) || mat.customProgramCacheKey?.() !== 'camo31') continue
      done.add(mat)
      // 乳白盲眼：伪装时只融 86%，远处仍能隐约看到两点浑浊的白（设定：只有盲眼和淡淡的轮廓暗边能察觉）
      const eye = !!mesh.userData.face && (mat as THREE.MeshPhongMaterial).isMeshPhongMaterial
      const base = mat.onBeforeCompile
      mat.onBeforeCompile = (sh, r) => {
        base.call(mat, sh, r)
        sh.uniforms.uRockOffset = SHARED.uRockOffset
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uRockOffset;')
          .replace('vCw = (modelMatrix * vec4(transformed, 1.0)).xyz;', 'vCw = (modelMatrix * vec4(transformed, 1.0)).xyz + uRockOffset;')
        if (eye) sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb = mix(diffuseColor.rgb, rk, uCamo);', 'diffuseColor.rgb = mix(diffuseColor.rgb, rk, uCamo * EYE_CAMO);').replace('#include <common>', '#include <common>\n#define EYE_CAMO ' + EYE_CAMO.toFixed(2))
      }
      mat.customProgramCacheKey = () => eye ? 'camo31-world-eye' : 'camo31-world'
      mat.needsUpdate = true
    }
  })
}

let seedCounter = 0
/** 实体网格（entitiesMesh.buildEntityMesh 钩子） */
export function* buildCamoEntityJob(seed?: number): Generator<void, THREE.Group, unknown> {
  const s = seed ?? seedCounter++
  const grp = yield* buildCamoCrawlerJob(s)
  shareCamoUniforms(grp)
  const boulder = buildCamoBoulder(s, 0.32)
  boulder.visible = false
  grp.add(boulder)
  grp.userData.camoBoulder = boulder
  grp.userData.camoBoulderSeed = s
  return grp
}

const smooth = (t: number) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k) }

/** 没有 AI 状态（联机客人端的提线木偶）时按通用 state 选片段 */
function fallbackClip(e: Entity): CamoClip {
  return e.state === 'chase' || e.state === 'attack' ? 'run' : e.state === 'wander' || e.state === 'investigate' ? 'walk' : 'idle_camo'
}

/** 每帧动画（renderer.ts 实体循环钩子） */
export function animateCamo(grp: THREE.Group, e: Entity, dt: number, distance: number, gz: number, eng: Engine) {
  const ud = grp.userData
  if (!ud.camoRig) return
  updateCamoShared(eng)
  // 手上的巨石与 AI 落地巨石用同一个种子：砸地瞬间的交接看不出来
  if (ud.camoBoulderSeed !== e.id) {
    const old = ud.camoBoulder as THREE.Mesh
    const b = buildCamoBoulder(e.id, 0.32)
    b.visible = false; b.castShadow = old.castShadow; b.receiveShadow = old.receiveShadow
    grp.remove(old); old.geometry.dispose(); (old.material as THREE.Material).dispose()
    grp.add(b); ud.camoBoulder = b; ud.camoBoulderSeed = e.id
  }
  grp.position.y = gz
  const st = e.cc
  const clip = st?.clip ?? fallbackClip(e)
  const t = st ? st.clipT : eng.time + e.id * 0.37
  const changed = clip !== ud.camoClip
  ud.camoAcc = (ud.camoAcc ?? 0) + dt
  ud.camoFade = (ud.camoFade ?? 1) + dt
  const interval = distance < CAMO_RENDER.NEAR ? 0 : distance < CAMO_RENDER.FAR ? 1 / CAMO_RENDER.MID_HZ : Infinity
  if (ud.camoPose && !changed && ud.camoAcc < interval) return
  ud.camoAcc = 0
  if (changed) { ud.camoFrom = ud.camoPose ?? null; ud.camoFade = 0; ud.camoClip = clip }
  const opts: CamoAnimOpts = { phase: (e.id % 7) * 0.37, soundYaw: st?.soundYaw ?? 0.6, camo: st ? st.camo : CAMO_IDLE_LEVEL }
  if (clip === 'distracted' && st) {
    // 落点换到模型空间（模型正面 +X；渲染朝向 rotation.y = -facing），距离夹到 0.9m 内
    const f = -grp.rotation.y, m = eng.map
    const dx = st.distractWX - (m?.inf?.ox ?? 0) - e.x, dy = st.distractWY - (m?.inf?.oy ?? 0) - e.y
    let lx = dx * Math.cos(f) + dy * Math.sin(f), lz = -dx * Math.sin(f) + dy * Math.cos(f)
    const l = Math.hypot(lx, lz)
    if (l > 0.9) { lx *= 0.9 / l; lz *= 0.9 / l }
    if (lx < 0.35) lx = 0.35
    opts.target = new THREE.Vector3(lx, 0, lz)
  }
  let pose: CamoPose = sampleCamo(grp, clip, t, opts)
  const from = ud.camoFrom as CamoPose | null
  if (from && ud.camoFade < CAMO_RENDER.BLEND) pose = mixCamoPose(from, pose, smooth(ud.camoFade / CAMO_RENDER.BLEND))
  applyCamoPose(grp, pose, ud.camoBoulder as THREE.Mesh)
  // 砸地后巨石交给世界（syncCamoBoulders），手上的这块隐藏
  if (st && st.mode === 'slam' && st.impactDone) (ud.camoBoulder as THREE.Mesh).visible = false
  ud.camoPose = pose
}

/** 死亡：deathT 1.4 → 0 映射到 death 片段 0 → 1.8s */
export function animateCamoDeath(grp: THREE.Group, e: Entity, gz: number, dt: number) {
  const ud = grp.userData
  if (!ud.camoRig) return
  grp.position.y = gz
  grp.rotation.z = 0
  const t = (1 - Math.max(0, e.deathT) / 1.4) * CAMO_CLIPS.death.len
  if (ud.camoClip !== 'death') { ud.camoFrom = ud.camoPose ?? null; ud.camoFade = 0; ud.camoClip = 'death' }
  ud.camoFade = (ud.camoFade ?? 0) + dt
  let pose = sampleCamo(grp, 'death', t, { phase: (e.id % 7) * 0.37 })
  const from = ud.camoFrom as CamoPose | null
  if (from && ud.camoFade < CAMO_RENDER.BLEND) pose = mixCamoPose(from, pose, smooth(ud.camoFade / CAMO_RENDER.BLEND))
  applyCamoPose(grp, pose, ud.camoBoulder as THREE.Mesh)
  ud.camoPose = pose
}

// ---------- 留在地上的巨石 ----------
const boulderViews = new WeakMap<THREE.Scene, { map: object | null; views: Map<number, THREE.Mesh> }>()
export function clearCamoBoulders(scene: THREE.Scene) {
  const state = boulderViews.get(scene)
  if (!state) return
  for (const mesh of state.views.values()) { scene.remove(mesh); mesh.geometry.dispose(); const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; for (const mat of mats) mat.dispose() }
  state.views.clear(); boulderViews.delete(scene)
}
/** 每帧同步（renderer.ts 钩子）：创建/移除/定位巨石；最后 1 秒沉入地面消失 */
export function syncCamoBoulders(scene: THREE.Scene, eng: Engine) {
  let state = boulderViews.get(scene)
  const list: readonly CamoBoulder[] = camoBoulders(eng)
  if (!state) { if (!list.length) return; state = { map: eng.map, views: new Map() }; boulderViews.set(scene, state) }
  if (state.map !== eng.map) { clearCamoBoulders(scene); if (!list.length) return; state = { map: eng.map, views: new Map() }; boulderViews.set(scene, state) }
  const views = state.views
  const m = eng.map, p = eng.player, X = m?.inf?.ox ?? 0, Y = m?.inf?.oy ?? 0
  const seen = new Set<number>()
  for (const b of list) {
    const x = b.wx - X, y = b.wy - Y
    if (Math.hypot(x - p.x, y - p.y) > CAMO_RENDER.BOULDER_VIEW) continue
    seen.add(b.id)
    let mesh = views.get(b.id)
    if (!mesh) {
      mesh = buildCamoBoulder(Math.floor(b.seed), 0.32)
      mesh.castShadow = true; mesh.receiveShadow = true
      mesh.rotation.y = -b.rot
      scene.add(mesh); views.set(b.id, mesh)
    }
    const sink = b.life < 1 ? (1 - b.life) * 0.6 : 0
    mesh.position.set(x, b.z + 0.25 - sink, y)
  }
  for (const [id, mesh] of views) {
    if (seen.has(id)) continue
    scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); views.delete(id)
  }
}

export function buildCamoEntity(seed?:number):THREE.Group{const job=buildCamoEntityJob(seed);let n=job.next();while(!n.done)n=job.next();return n.value}
