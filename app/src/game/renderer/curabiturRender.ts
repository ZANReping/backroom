// 受眷鸟（Entity 37）重制 阶段 3：游戏内渲染接入。
// - buildCurabiturEntityMesh：entitiesMesh.buildEntityMesh 的入口（外壳组；按 AI 决定的性别/seed 懒建 curabiturMesh 子模型）
// - animateCurabiturEntity：renderer 实体循环末尾调用；按 AI 状态（片段 + 0.25s 混合）驱动 curabiturAnim，死亡坠落
// - curabiturLights：受眷胶（手持/涂层/放置/未开封）与最近几只受眷鸟的 LightSource（交给渲染器灯光池，不在网格上挂 PointLight）
// - buildCurabiturItemMesh：三种物品的地面/手持模型
// - updateCurabiturView：腐液滩、下落中的孢子、散播时飘散的孢子粒子
// - curabiturCoatViewmodel：第一人称手持武器的受眷胶涂层（gelCoat）
import * as THREE from 'three'
import type { Engine } from '../engine'
import type { Entity } from '../entities'
import type { LightSource } from '../core/types'
import { floorHeight } from '../world/mapgen'
import { buildCurabiturMesh, buildCurabiturJob, buildCurabiturGelJar, buildCurabiturSpore, buildSporeRotPuddle, gelCoat, glowSprite } from './curabiturMesh'
import { sampleCurabitur, mixCurabiturPose, applyCurabiturPose, sampleCurabiturSpores, type CurabiturAnimOpts } from './curabiturAnim'
import {
  curabiturStateOf, ensureCurabitur, curabiturLightList, curabiturPuddles, curabiturFallingSpores, curabiturPlayer, curabiturHeldGlow,
  type CurabiturState,
} from '../engine/curabiturAI'
import { CB_ITEM, CURABITUR as C, CURABITUR_SPORE as SP } from '../engine/curabiturTuning'

// ---------------------------------------------------------------------------
// 实体模型
// ---------------------------------------------------------------------------
/** Complete body is present before GPU preparation and archive framing. */
export function* buildCurabiturEntityJob(opts:{curabiturSex?:'female'|'male';curabiturSeed?:number;seed?:number}={}):Generator<void,THREE.Group,unknown>{
 const sex=opts.curabiturSex??(Math.abs(opts.seed??0)%2?'male':'female'),seed=opts.curabiturSeed??opts.seed??0
 const body=yield* buildCurabiturJob(sex,seed,{lights:false})
 const g=new THREE.Group();g.userData.entityType='curabitur'
 g.add(body);g.userData.cbBody=body;g.userData.cbKey=sex+':'+seed;g.userData.cbRig=body.userData.curabiturRig
 body.traverse(o=>{o.castShadow=false;o.receiveShadow=false})
 return g
}
export function buildCurabiturEntityMesh(opts?:{curabiturSex?:'female'|'male';curabiturSeed?:number;seed?:number}):THREE.Group{
 const job=buildCurabiturEntityJob(opts);let n=job.next();while(!n.done)n=job.next();return n.value
}
function bodyOf(grp: THREE.Group): THREE.Group | undefined { return grp.userData.cbBody as THREE.Group | undefined }
function disposeTree(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh
    m.geometry?.dispose?.()
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []
    for (const mt of mats) mt.dispose()
  })
}
function ensureBody(grp: THREE.Group, st: CurabiturState): THREE.Group {
  const key = `${st.sex}:${st.seed}`
  let body = bodyOf(grp)
  if (body && grp.userData.cbKey === key) return body
  if (body) { grp.remove(body); disposeTree(body) }
  // 雄性孢子囊几何体会被动画改写：每只个体各建一份，不共享
  body = buildCurabiturMesh(st.sex, st.seed, { lights: false })
  body.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = false; m.receiveShadow = false } })
  grp.add(body)
  grp.userData.cbBody = body; grp.userData.cbKey = key
  grp.userData.cbRig = body.userData.curabiturRig
  return body
}

const animOpts = (st: CurabiturState, e: Entity, extra: CurabiturAnimOpts = {}): CurabiturAnimOpts => ({
  phase: (st.seed % 100) / 100 * 6.28, inPlace: true, noIntro: false,
  speed: st.moving ? e.def.speed * (st.mode === 'flee' ? C.fleeSpeed : C.roamSpeed) : 0, ...extra,
})

export function animateCurabiturEntity(grp: THREE.Group, e: Entity, eng: Engine, dt: number, distance: number, gz: number) {
  const st = curabiturStateOf(e) ?? ensureCurabitur(eng, e)
  const body = ensureBody(grp, st)
  const esc = e.def.scale ?? 1
  grp.scale.setScalar(esc)
  grp.rotation.set(0, -e.facing, 0)
  if (e.dead) {
    // 死亡：从死亡瞬间的高度坠到地面（death 片段自带下坠位移），之后侧躺不动
    const z0 = st.deathZ ?? gz, g = st.deathGround ?? floorHeight(eng.map!, e.x, e.y, 0)
    grp.position.y = z0
    const t = C.corpseTime - Math.max(0, e.deathT)
    const pose = sampleCurabitur(body, 'death', t, { fallHeight: Math.max(0, (z0 - g) / esc - 0.1) })
    applyCurabiturPose(body, pose)
    grp.visible = true
    return
  }
  grp.position.y = gz
  // 远处降频 / 停止（星群十几只同屏时只给近处满帧）
  if (distance > C.animStopR) return
  const acc = (grp.userData.cbAcc as number | undefined ?? 0) + dt
  if (distance > C.animFullR && acc < 0.1) { grp.userData.cbAcc = acc; return }
  grp.userData.cbAcc = 0
  const cur = sampleCurabitur(body, st.clip, st.clipT, animOpts(st, e))
  const pose = st.blend < 1 ? mixCurabiturPose(sampleCurabitur(body, st.prevClip, st.prevT + st.blend * 0.25, animOpts(st, e, { noIntro: true })), cur, st.blend * st.blend * (3 - 2 * st.blend)) : cur
  applyCurabiturPose(body, pose)
}

// ---------------------------------------------------------------------------
// 灯光（交给渲染器的灯光池）
// ---------------------------------------------------------------------------
const lightCaches = new WeakMap<Engine, Map<string, LightSource>>()
export function curabiturLights(eng: Engine): LightSource[] {
  let cache = lightCaches.get(eng)
  if (!cache) { cache = new Map(); lightCaches.set(eng, cache) }
  const out: LightSource[] = [], seen = new Set<string>()
  for (const L of curabiturLightList(eng)) {
    if (L.key.startsWith('b')) {
      const id = Number(L.key.slice(1)), entity = eng.map?.entities.find((e) => e.id === id)
      if (entity?.presentationPending) continue
    }
    let l = cache.get(L.key)
    if (!l) { l = { x: L.x, y: L.y, r: L.r, color: L.color, flickerSeed: 0, noFix: 1, keep: 1, intensityMul: L.intensityMul }; cache.set(L.key, l) }
    l.x = L.x; l.y = L.y; l.fixZ = L.z + 0.2; l.r = L.r; l.intensityMul = L.intensityMul
    seen.add(L.key); out.push(l)
  }
  for (const k of cache.keys()) if (!seen.has(k)) cache.delete(k)
  return out
}

// ---------------------------------------------------------------------------
// 物品模型
// ---------------------------------------------------------------------------
export function isCurabiturItem(type: string) { return type === CB_ITEM.gel || type === CB_ITEM.spore || type === CB_ITEM.repellent }
export function buildCurabiturItemMesh(type: string): THREE.Group {
  if (type === CB_ITEM.gel) { const g = buildCurabiturGelJar(1); g.scale.setScalar(1.25); return g }
  if (type === CB_ITEM.spore) {
    // 实物只有 1–2cm：地上放一小撮 3 颗，整体放大一点便于看见
    const g = new THREE.Group(); g.userData.entityType = 'curabitur-spore'
    for (const [x, z] of [[0, 0], [0.028, 0.012], [-0.012, 0.026]]) { const s = buildCurabiturSpore(0); s.position.set(x, 0.014, z); g.add(s) }
    g.scale.setScalar(1.8)
    return g
  }
  // 孢子驱蛾剂：小玻璃瓶装的褐绿腐液 + 软木塞
  const g = new THREE.Group(); g.userData.entityType = 'curabitur-repellent'
  const glass = new THREE.MeshPhongMaterial({ color: '#d8e0d0', specular: '#ffffff', shininess: 90, transparent: true, opacity: 0.3, depthWrite: false })
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.03, 0.085, 16).translate(0, 0.0425, 0), new THREE.MeshPhongMaterial({ color: '#4f4a24', specular: '#a8a070', shininess: 70 })))
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.1, 16, 1, true).translate(0, 0.05, 0), glass))
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.017, 0.022, 10).translate(0, 0.108, 0), new THREE.MeshLambertMaterial({ color: '#8a6a44' })))
  g.scale.setScalar(1.3)
  return g
}

// ---------------------------------------------------------------------------
// 世界视图：腐液滩、下落孢子、散播粒子
// ---------------------------------------------------------------------------
interface View {
  root: THREE.Group
  puddles: Map<object, THREE.Group>
  falling: Map<object, THREE.Group>
  emitters: { rig: THREE.Object3D; mat: THREE.Matrix4; t: number; key: number }[]
  points: THREE.Points
  bird: WeakMap<Entity, 1>
}
const VIEWS = new WeakMap<THREE.Scene, View>()
export function clearCurabiturView(scene: THREE.Scene) {
  const v = VIEWS.get(scene)
  if (!v) return
  scene.remove(v.root); disposeTree(v.root); VIEWS.delete(scene)
}
const MAX_PTS = 26 * 8
function viewOf(scene: THREE.Scene): View {
  let v = VIEWS.get(scene)
  if (v) return v
  const root = new THREE.Group(); root.name = 'curabitur-view'; scene.add(root)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(MAX_PTS * 3), 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(MAX_PTS * 3), 3))
  const points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }))
  points.frustumCulled = false
  root.add(points)
  v = { root, puddles: new Map(), falling: new Map(), emitters: [], points, bird: new WeakMap() }
  VIEWS.set(scene, v)
  return v
}

const _m = new THREE.Vector3()
export function updateCurabiturView(scene: THREE.Scene, eng: Engine, dt: number, entityMeshes: Map<number, THREE.Group>) {
  const m = eng.map
  if (!m) { clearCurabiturView(scene); return }
  let existing=VIEWS.get(scene)
  if(existing?.root.userData.curabiturMap!==m&&existing){clearCurabiturView(scene);existing=undefined}
  const puddles=curabiturPuddles(eng),falling=curabiturFallingSpores(eng)
  const releasing=m.entities.some(e=>!e.dead&&!e.presentationPending&&e.def.type==='curabitur'&&curabiturStateOf(e)?.clip==='spore_release')
  if(!existing&&!puddles.length&&!falling.length&&!releasing)return
  const v=existing??viewOf(scene)
  v.root.userData.curabiturMap=m
  const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  // 腐液滩：最后 20% 寿命渐隐缩小
  const seenP = new Set<object>()
  for (const q of puddles) {
    seenP.add(q)
    let g = v.puddles.get(q)
    if (!g) { g = buildSporeRotPuddle(q.seed, SP.puddleMeshR); v.root.add(g); v.puddles.set(q, g) }
    const k = Math.min(1, q.life / (q.max * 0.2))
    g.position.set(q.wx - ox, q.z, q.wy - oy)
    g.scale.setScalar(0.6 + 0.4 * k)
    g.traverse((o) => { const mt = (o as THREE.Mesh).material as THREE.MeshPhongMaterial | undefined; if (mt?.transparent) { mt.userData.base ??= mt.opacity; mt.opacity = mt.userData.base * k } })
  }
  for (const [q, g] of v.puddles) if (!seenP.has(q)) { v.root.remove(g); disposeTree(g); v.puddles.delete(q) }
  // 下落中的可拾取孢子
  const seenF = new Set<object>()
  for (const f of falling) {
    seenF.add(f)
    let g = v.falling.get(f)
    if (!g) { g = buildCurabiturSpore(0); g.scale.setScalar(1.6); v.root.add(g); v.falling.set(f, g) }
    g.position.set(f.wx - ox + Math.sin(f.age * 2.1 + f.seed) * 0.03, f.z, f.wy - oy + Math.cos(f.age * 1.7 + f.seed) * 0.03)
  }
  for (const [f, g] of v.falling) if (!seenF.has(f)) { v.root.remove(g); disposeTree(g); v.falling.delete(f) }
  // 散播粒子：雄性进入 spore_release 时记下当时的模型矩阵，之后按 sampleCurabiturSpores 的轨迹飘散，约 7s 后淡出
  for (const e of m.entities) {
    if (e.def.type !== 'curabitur' || e.dead) continue
    const st = curabiturStateOf(e), grp = entityMeshes.get(e.id), body = grp ? bodyOf(grp) : undefined
    if (!st || !body || st.sex !== 'male') continue
    if (st.clip === 'spore_release') {
      if (!v.bird.get(e)) {
        body.updateWorldMatrix(true, false)
        const mat = body.matrixWorld.clone(); mat.elements[12] += ox; mat.elements[14] += oy
        v.emitters.push({ rig: body, mat, t: st.clipT, key: e.id })
        if (v.emitters.length > 8) v.emitters.shift()
        v.bird.set(e, 1)
      }
    } else v.bird.delete(e)
  }
  const pos = v.points.geometry.attributes.position as THREE.BufferAttribute, col = v.points.geometry.attributes.color as THREE.BufferAttribute
  let n = 0
  for (let i = v.emitters.length - 1; i >= 0; i--) {
    const em = v.emitters[i]
    em.t += dt
    if (em.t > 7.5) { v.emitters.splice(i, 1); continue }
    const fade = Math.min(1, (7.5 - em.t) / 1.5)
    for (const sp of sampleCurabiturSpores(em.rig, em.t)) {
      if (sp.state !== 2 || n >= MAX_PTS) continue
      _m.copy(sp.pos).applyMatrix4(em.mat); _m.x -= ox; _m.z -= oy
      pos.setXYZ(n, _m.x, _m.y, _m.z)
      const g = sp.glow * fade
      col.setXYZ(n, 1.0 * g, 0.7 * g, 0.29 * g)
      n++
    }
  }
  for (let i = n; i < MAX_PTS; i++) pos.setXYZ(i, 0, -1000, 0)
  pos.needsUpdate = true; col.needsUpdate = true
  v.points.geometry.setDrawRange(0, Math.max(1, n))
  v.points.visible = n > 0
  if(!v.puddles.size&&!v.falling.size&&!v.emitters.length&&!releasing)clearCurabiturView(scene)
}

// ---------------------------------------------------------------------------
// 第一人称：手持武器的受眷胶涂层
// ---------------------------------------------------------------------------
export function curabiturCoatViewmodel(vmItem: THREE.Group | null, eng: Engine) {
  if (!vmItem) return
  const on = curabiturHeldGlow(eng) === 'coat'
  const k = on ? Math.max(0.25, Math.min(1, (curabiturPlayer(eng).coat?.left ?? 0) / 60)) : 0
  let shells = vmItem.userData.cbCoat as THREE.Mesh[] | undefined
  if (!shells && on) {
    shells = []
    const targets: THREE.Mesh[] = []
    vmItem.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh && !mm.userData.gelCoat && !(mm as unknown as THREE.Sprite).isSprite) targets.push(mm) })
    for (const t of targets.slice(0, 24)) { const s = gelCoat(t, 0.45); t.add(s); shells.push(s) }
    // 一点光晕，让涂层在暗处也看得出
    const halo = glowSprite('#b8ff60', 0.22, 0.35) as unknown as THREE.Mesh; vmItem.add(halo); shells.push(halo)
    vmItem.userData.cbCoat = shells
  }
  if (shells) for (const s of shells) {
    s.visible = on
    const mt = s.material as THREE.MeshBasicMaterial | THREE.SpriteMaterial
    mt.userData.base ??= mt.opacity
    mt.opacity = mt.userData.base * (0.5 + 0.5 * k)
  }
}
