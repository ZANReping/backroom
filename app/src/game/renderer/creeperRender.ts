// [creeper] 爬菌（Entity 17）重制·阶段 3：渲染接入。
//   · buildCreeperEntityMesh：实体 type 'creeper' 的模型——尸鼠 / 蛛形纲感染体（creeperMesh.buildInfectedRat / buildInfectedArachnid，1–4 阶）、
//     爬菌人（buildCreeperHuman，模型 +Z 朝前，外面套一层把 +Z 转到实体的 +X）。
//   · animateCreeperEntity：按 creeperAI 的片段（e.cr.clip / clipT / speed）驱动 creeperAnim：走 / 爬按实际速度同步推进率（不打滑），
//     一次性片段（攻击 / 抽搐 / 扑击 / 尖叫）直接用 AI 的片段时间（命中帧与 AI 结算同一时刻），尸体用 death 片段。
//     扑击的根位移由 AI 推动实体本身（creeperAI.creeperLungeRoot），片段里身体按同一条曲线留在根上。
//   · LOD（applyCreepLod）：近 / 中 / 远三档——中档起隐藏绒毛晕与菌丝、绒球换低模几何、实例数按距离递减，远档再隐藏宿主的细小部件；
//     creepMeshStats 统计当前可见三角形数与绘制次数（proto ?view=lod 与 check:creeper 用）。
//   · CreeperWorldView：孢子团（感染体尸体处）与墙角的僵尸蜘蛛装饰（engine 的 creepRun.spores / decor，世界坐标）。
//   · CreepViewHands：第一人称手臂接入——病程 2–4 阶给右手 / 左手挂 creepHandOverlay，3、4 阶空手时播 handTwitch（4 阶爪形空手）。
// 渲染层每帧 setCreepTime(t) 一次（绒球呼吸 / 余烬明灭）。
import * as THREE from 'three'
import type { Entity } from '../entities'
import type { Engine } from '../engine'
// 只引类型：不在模块加载时引入 engine/creeperAI（避免 renderer → engine → world 的循环导入顺序问题）；数值随状态一起带过来
import { buildZombieSpiderDecor, creepBallGeoLod, creepHandOverlay, growCreep, CreepSurface, type CreepStage, type CreepHandOverlay } from './creeperMesh'
import { animateCreeper, animateCreepHand, creeperClipInfo, CREEPER_CLIPS, CREEP_WALK_NATURAL, type CreeperClip } from './creeperAnim'
import type { RetroHand, HandPose } from './retroViewHand'
import type { RatMorph } from '../entities/rats'
import type { ArachnidVariant } from './arachnidMesh'
import { floorHeight } from '../world/mapgen'
import { buildCreeperHumanJob,buildInfectedRatJob,buildInfectedArachnidJob } from './creeperMesh'
import { prepareRatTextures } from './ratMesh'
import { prepareArachnidTextures } from './arachnidMesh'
import { disposeL8Tree } from './l8ModelResources'

export interface CreepMeshOpts { host: 'rat' | 'arachnid' | 'human'; stage: number; morph?: RatMorph; variant?: string; seed: number }

/** LOD 三档：距离阈值（m）与每档参数 */
export const CREEP_LOD = {
  NEAR: 6, FAR: 14,
  levels: [
    { name: '近', ballGeo: 0 as const, inst: 1, halo: true, thread: true, shadow: true, detail: true },
    { name: '中', ballGeo: 1 as const, inst: 0.6, halo: false, thread: false, shadow: false, detail: true },
    { name: '远', ballGeo: 2 as const, inst: 0.3, halo: false, thread: false, shadow: false, detail: false },
  ],
  /** 远档隐藏的「细小部件」：包围球半径（m，按实体缩放前）小于这个值的非菌体网格（眼珠、爪尖、牙、毛壳之类） */
  DETAIL_R: 0.022,
}
export type CreepLod = 0 | 1 | 2
export const creepLodLevel = (d: number): CreepLod => d < CREEP_LOD.NEAR ? 0 : d < CREEP_LOD.FAR ? 1 : 2

interface LodBook { balls: { m: THREE.InstancedMesh; full: number; geo0: THREE.BufferGeometry }[]; halos: THREE.Object3D[]; threads: THREE.Object3D[]; details: THREE.Object3D[]; emberHalos: THREE.Object3D[]; lod: number }
function lodBook(grp: THREE.Object3D): LodBook {
  const had = grp.userData.creepLod as LodBook | undefined
  if (had) return had
  const b: LodBook = { balls: [], halos: [], threads: [], details: [], emberHalos: [], lod: -1 }
  grp.updateMatrixWorld(true)
  grp.traverse((o) => {
    const k = o.userData.creep
    if (k === 'ball') b.balls.push({ m: o as THREE.InstancedMesh, full: (o as THREE.InstancedMesh).count, geo0: (o as THREE.Mesh).geometry })
    else if (k === 'halo') b.halos.push(o)
    else if (k === 'thread') b.threads.push(o)
    else if (k === 'emberHalo') b.emberHalos.push(o)
    else if (!k && (o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) {
      const g = (o as THREE.Mesh).geometry
      if (!g.boundingSphere) g.computeBoundingSphere()
      const sc = new THREE.Vector3(); o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc)
      if ((g.boundingSphere?.radius ?? 1) * Math.max(sc.x, sc.y, sc.z) < CREEP_LOD.DETAIL_R) b.details.push(o)
    }
  })
  grp.userData.creepLod = b
  return b
}
/** 套用 LOD 档（只在档位变化时改东西） */
export function applyCreepLod(grp: THREE.Object3D, lod: CreepLod) {
  const b = lodBook(grp)
  if (b.lod === lod) return
  b.lod = lod
  const L = CREEP_LOD.levels[lod]
  for (const x of b.balls) {
    x.m.geometry = L.ballGeo === 0 ? x.geo0 : creepBallGeoLod(L.ballGeo)
    const n = Math.min(x.full, Math.floor(x.full * L.inst + 0.5))
    x.m.count = n; x.m.visible = n > 0; x.m.castShadow = L.shadow
  }
  for (const h of b.halos) h.visible = L.halo
  for (const h of b.emberHalos) h.visible = lod < 2
  for (const t of b.threads) t.visible = L.thread
  for (const d of b.details) d.visible = L.detail
}
/** 当前可见的三角形数与绘制次数（实例化按 count 计；LineSegments 计一次绘制、不计三角形） */
export function creepMeshStats(root: THREE.Object3D) {
  let tris = 0, draws = 0
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return
    const m = o as THREE.Mesh
    if (m.isMesh || (o as THREE.LineSegments).isLineSegments) {
      draws++
      if (m.isMesh) { const g = m.geometry, k = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += (m as THREE.InstancedMesh).isInstancedMesh ? k * (m as THREE.InstancedMesh).count : k }
    }
    for (const c of o.children) walk(c)
  }
  walk(root)
  return { tris: Math.round(tris), draws }
}

const SPIDERS: readonly ArachnidVariant[] = ['wolf', 'weaver', 'harvestman', 'blindcave', 'jumper']
/** 实体模型：根 group 的 +X 朝前；动画目标在 userData.creepTarget */
export const creepMeshKey=(o?:CreepMeshOpts)=>JSON.stringify([o?.host??'rat',o?.stage??2,o?.morph??'common',o?.variant??'wolf',o?.seed??0])
export function buildCreeperEntityMesh(o?:CreepMeshOpts):THREE.Group { const job=buildCreeperEntityJob(o);let n=job.next();while(!n.done)n=job.next();return n.value }
export function* buildCreeperEntityJob(o?:CreepMeshOpts):Generator<void,THREE.Group,unknown> {
 const host=o?.host??'rat',seed=o?.seed??0,root=new THREE.Group();root.name='creeper-entity'
 let target:THREE.Group|undefined,complete=false
 try {
  if(host==='rat')yield*prepareRatTextures(o?.morph??'common')
  if(host==='arachnid')yield*prepareArachnidTextures()
  yield
  if(host==='human'){target=yield*buildCreeperHumanJob(seed%97);target.rotation.y=Math.PI/2}
  else {const st=Math.max(1,Math.min(4,o?.stage??2)) as CreepStage;target=host==='rat'?yield*buildInfectedRatJob(o?.morph??'common',seed,st):yield*buildInfectedArachnidJob((SPIDERS as readonly string[]).includes(o?.variant??'')?o!.variant as ArachnidVariant:'wolf',seed,st)}
  root.add(target);root.userData.entityType='creeper';root.userData.parts={};root.userData.creepTarget=target
  root.userData.creepHost=host;root.userData.creepStage=host==='human'?5:Math.max(1,Math.min(4,o?.stage??2));root.userData.creepKey=creepMeshKey(o)
  yield;lodBook(root);complete=true;return root
 }finally{if(!complete){if(target&&!root.children.includes(target))root.add(target);disposeL8Tree(root)}}
}

interface CreepAnimState { clip: string; t: number }
/** 推进动画状态（不碰网格；Node 验收直接跑）。返回本帧要播的片段与时间 */
export function stepCreepAnim(st: CreepAnimState, e: Entity, dt: number): CreepAnimState {
  const s = e.cr
  const human = s?.host === 'human'
  if (e.dead) { st.clip = 'death'; st.t = Math.max(0, (s?.corpseT ?? 3.2) - Math.max(0, e.deathT)); return st }
  let want = s?.clip ?? (human ? 'idle' : 'walk')
  const speed = s?.speed ?? 0
  if (want === 'walk' && speed < 0.02) want = 'idle' // 原地不动时不播走路
  if (want === 'crawl' && speed < 0.02) want = 'idle'
  const oneShot = want === 'attack' || want === 'twitch' || want === 'lunge' || want === 'scream'
  if (oneShot) { st.clip = want; st.t = s?.clipT ?? 0; return st }
  if (want !== st.clip) { st.clip = want; st.t = 0 }
  if (want === 'walk' && s) {
    const sp = s.host === 'arachnid', stage = Math.max(1, Math.min(4, s.stage)) as CreepStage
    const nat = (sp ? CREEP_WALK_NATURAL.spider : CREEP_WALK_NATURAL.rat) * (creeperClipInfo('host', 'walk', stage, { spider: sp }).speed ?? 1) * (e.def.scale ?? 1)
    st.t += dt * Math.min(3, Math.max(0.4, speed / nat))
  } else if (want === 'crawl') st.t += dt * Math.min(4.5, Math.max(0.5, speed / (CREEPER_CLIPS.human.crawl.speed ?? 0.22)))
  else st.t += dt
  return st
}

/** 每帧（renderer.updateEntities 的最后）：片段采样 + LOD。覆盖通用的位置 / 死亡变换 */
export function animateCreeperEntity(grp: THREE.Group, e: Entity, dt: number, gz: number, distance: number) {
  const target = grp.userData.creepTarget as THREE.Object3D | undefined
  if (!target) return
  const st = (grp.userData.creepAnim ??= { clip: '', t: 0 }) as CreepAnimState
  stepCreepAnim(st, e, dt)
  const stage = (e.cr?.host === 'human' ? 4 : Math.max(1, Math.min(4, e.cr?.stage ?? grp.userData.creepStage ?? 2))) as CreepStage
  if (distance < 40) animateCreeper(target, st.clip as CreeperClip, st.t, stage, { seed: e.cr?.seed })
  grp.position.y = gz
  grp.rotation.set(0, -e.facing, 0)
  grp.scale.setScalar(e.def.scale ?? 1)
  applyCreepLod(grp, creepLodLevel(distance))
}

// ============================================================================
// 孢子团 / 僵尸蜘蛛
// ============================================================================
/** 孢子团：地上一片发白的霉斑 + 一小簇绒球（中间一颗大的），菌丝垂下 */
export function buildSporeClusterMesh(seed = 0): THREE.Group {
  const g = new THREE.Group(); g.name = 'creeper-spores'
  const node = new THREE.Group(); g.add(node)
  const disc = new CreepSurface()
  const N = 10, r = 0.22
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2
    disc.addTriangle(new THREE.Vector3(0, 0.005, 0), new THREE.Vector3(Math.cos(a0) * r, 0.005, Math.sin(a0) * r), new THREE.Vector3(Math.cos(a1) * r, 0.005, Math.sin(a1) * r))
  }
  const pad = new THREE.Mesh(new THREE.CircleGeometry(r * 1.15, 40).rotateX(-Math.PI / 2).translate(0, 0.004, 0), new THREE.MeshLambertMaterial({ color: '#c9c5b8', transparent: true, opacity: 0.75, depthWrite: false }))
  pad.name = 'spore-pad'; pad.userData.creep = 'pad'; node.add(pad)
  const growth = growCreep([{ node, surface: disc, core: { p: new THREE.Vector3(0, 0.035, 0), r: 0.045 }, joints: [{ p: new THREE.Vector3(0.08, 0.02, 0.05), r: 0.012 }, { p: new THREE.Vector3(-0.07, 0.02, -0.06), r: 0.01 }] }], 3, { seed, size: 0.5, density: 0.45 })
  g.userData.creep = { spores: true, growth }
  return g
}

/** 孢子团与僵尸蜘蛛的场景对象（按 engine.creepRun 同步） */
export class CreeperWorldView {
  private spores = new Map<number, THREE.Group>()
  private decor = new Map<string, THREE.Group>()
  private scene: THREE.Scene
  private hooks?:{prepare(g:THREE.Group):void;ready(g:THREE.Group):boolean;retire(g:THREE.Group):void}
  constructor(scene: THREE.Scene, hooks?:{prepare(g:THREE.Group):void;ready(g:THREE.Group):boolean;retire(g:THREE.Group):void}) { this.scene = scene;this.hooks=hooks }
  private map:Engine['map']|undefined
  private retire(g:THREE.Group){g.removeFromParent();if(this.hooks)this.hooks.retire(g);else disposeGroup(g)}
  sync(engine: Engine, wallH = 3) {
    const m = engine.map, r = engine.creepRun
    if(this.map!==m){this.clear();this.map=m}
    let builds=0
    const seen = new Set<unknown>()
    if (m) {
      const ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0, p = engine.player, lv = engine.levelDef.id
      for (const s of r.spores) {
        if (s.level !== lv) continue
        const x = s.wx - ox, y = s.wy - oy
        if (Math.hypot(x - p.x, y - p.y) > 36) continue
        seen.add(s.id)
        let g = this.spores.get(s.id)
        if (!g) { if(builds++)continue;g = buildSporeClusterMesh(s.seed); this.scene.add(g); this.spores.set(s.id, g);this.hooks?.prepare(g) }
        g.visible=this.hooks?.ready(g)??true
        g.position.set(x, s.z, y)
        g.scale.setScalar(Math.min(1, 0.4 + ((s.life ?? s.t) - s.t) * 0.6)) // 刚死时从尸体里慢慢鼓出来
        applyCreepLod(g, creepLodLevel(Math.hypot(x - p.x, y - p.y)))
      }
      for (const list of r.decor.values()) for (const dd of list) {
        if (!dd.id.startsWith(lv+':')||r.burnedDecor.has(dd.id)) continue
        const x = dd.wx - ox, y = dd.wy - oy
        const dist = Math.hypot(x - p.x, y - p.y)
        if (dist > 30) continue
        seen.add(dd.id)
        let g = this.decor.get(dd.id)
        if (!g) { if(builds++)continue;g = new THREE.Group(); g.add(buildZombieSpiderDecor(dd.seed % 997)); this.scene.add(g); this.decor.set(dd.id, g);this.hooks?.prepare(g) }
        g.visible=this.hooks?.ready(g)??true
        const gz = floorHeight(m, Math.min(m.w - 1, Math.max(0, x)), Math.min(m.h - 1, Math.max(0, y)))
        g.position.set(x, gz + Math.min(dd.z, wallH - 0.25), y)
        g.rotation.y = dd.rot
        applyCreepLod(g, creepLodLevel(dist))
      }
    }
    for (const [id, g] of this.spores) if (!seen.has(id)) { this.retire(g); this.spores.delete(id) }
    for (const [id, g] of this.decor) if (!seen.has(id)) { this.retire(g); this.decor.delete(id) }
  }
  clear() { for (const g of [...this.spores.values(), ...this.decor.values()]) { this.scene.remove(g); disposeGroup(g) } this.spores.clear(); this.decor.clear() }
}
function disposeGroup(g:THREE.Object3D){disposeL8Tree(g)}

// ============================================================================
// 第一人称手臂
// ============================================================================
/**
 * 病程 2–4 阶的手臂菌斑接入：每只手一个 creepHandOverlay（懒建）；阶段变化时 setStage，手的握姿几何变化后 sync。
 * twitch：3、4 阶且这只手空着时播 handTwitch（每帧先把手腕复位到 baseQ，再叠加抽动），返回 true 表示这一帧接管了这只手的握姿。
 */
export class CreepViewHands {
  private ov = new Map<RetroHand, CreepHandOverlay>()
  stage: 0 | 2 | 3 | 4 = 0
  setStage(s: 0 | 2 | 3 | 4) { this.stage = s }
  /** 每帧：同步一只手的菌斑；twitch 给出时（空手）播手指痉挛 */
  update(hand: RetroHand, t: number, twitch?: { base?: HandPose; baseQ?: THREE.Quaternion; seed?: number }): boolean {
    const st = this.stage as CreepStage
    let o = this.ov.get(hand)
    if (!o && st >= 2) { o = creepHandOverlay(hand, st, 3); this.ov.set(hand, o) }
    if (!o) return false
    if (o.stage !== st) o.setStage(st)
    o.group.visible = st >= 2
    let took = false
    if (twitch && st >= 3) {
      if (twitch.baseQ) hand.group.quaternion.copy(twitch.baseQ)
      animateCreepHand(hand, o, 'handTwitch', t, st, twitch.base, twitch.seed ?? 0)
      took = true
    } else o.sync()
    o.group.visible=st>=2&&(hand.skin.material as THREE.Material).opacity>=.996
    return took
  }
  dispose() { for (const o of this.ov.values()) o.dispose(); this.ov.clear() }
}
