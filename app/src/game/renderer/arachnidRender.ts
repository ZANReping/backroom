// L8 蛛形纲重制——阶段 3：渲染接入（实体模型 + 片段播放 + 蛛巢 / 网 / 茧 / 酸雾特效 + 符文点光源）。
// 只读 AI 状态（e.arachnid、getArachnidWorld），不改任何游戏数值。renderer.ts 里的接入点都带 `// [L8-arachnid]`：
//   buildEntityMesh → buildArachnidEntityMesh；每帧 animateArachnidEntity；死亡分支 arachnidDeathPose；
//   portableLights 追加 arachnidLights；updateEntities 末尾 updateArachnidWorldView。
// 性能：远处个体降频（>18m 隔帧、>32m 每 4 帧采样一次）；幼蛛潮 / 螨群走 arachnidMesh 的 InstancedMesh；
// 同屏只给最近的 2 只符文个体 + 1 个蛛巢挂点光源（走渲染器自己的光源排序与上限）。
import * as THREE from 'three'
import type { Engine } from '../engine'
import type { Entity } from '../entities/types'
import type { LightSource } from '../core/types'
import { floorHeight } from '../world/mapgen'
import { buildArachnidJob, buildRuneNest, buildHumanCocoon, type ArachnidVariant, type ArachnidRig } from './arachnidMesh'
import { sampleArachnid, applyArachnidPose, mixArachnidPose, arachnidEmitter, breatheRuneNest, type ArachnidPose, type ArachnidClip } from './arachnidAnim'
import { ensureArachnid, getArachnidWorld, arachnidWebs, ARACHNID_STATS, type ArachnidKind } from '../engine/arachnidAI'
import { isArachnidKind } from '../engine/arachnidStats'

const BLEND = 0.18

/** entitiesMesh 接入：按变种建模（seed = 实体 id，保证重建一致） */
export function* buildArachnidEntityJob(opts?: { arachnidVariant?: string; arachnidMother?: boolean; seed?: number }): Generator<void, THREE.Group, unknown> {
  const v: ArachnidKind = isArachnidKind(opts?.arachnidVariant) ? opts!.arachnidVariant as ArachnidKind : 'wolf'
  const grp = yield* buildArachnidJob(v as ArachnidVariant, Math.abs(opts?.seed ?? 0) % 9973, { mother: !!opts?.arachnidMother })
  grp.userData.entityType = 'arachnid'
  grp.userData.arachnidVariant = v
  // 游戏内可读性：螨（3–8mm）与幼蛛（4–6cm）按真实尺寸在 2m 外只有一两个像素，个体放大（团的范围不变）
  const rig = grp.userData.arachnidRig as ArachnidRig | undefined
  const k = v === 'mitecloud' ? 2.6 : v === 'broodswarm' ? 1.5 : 1
  if (k !== 1 && rig?.swarm?.[0]) {
    const im = rig.swarm[0], mm = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sv = new THREE.Vector3()
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, mm); mm.decompose(p, q, sv); if (p.y < 0.04) p.y *= k; mm.compose(p, q, sv.multiplyScalar(k)); im.setMatrixAt(i, mm) }
    im.instanceMatrix.needsUpdate = true
  }
  return grp
}

interface AnimRec { clip: ArachnidClip | ''; prev: ArachnidPose | null; blend: number; last: ArachnidPose | null; frame: number }

/** 每帧：按 AI 的片段与片段时间采样姿态，片段切换时 0.18s 混合（跳扑落地硬切） */
export function animateArachnidEntity(grp: THREE.Group, e: Entity, _time: number, gz: number, dt: number, distance: number) {
  const ar = e.arachnid ?? ensureArachnid(e)
  if (!grp.userData.arachnidRig) return
  const rec: AnimRec = grp.userData.arAnim ??= { clip: '', prev: null, blend: 0, last: null, frame: 0 }
  rec.frame++
  grp.position.y = gz
  // 远处降频
  if (rec.last && ((distance > 32 && rec.frame % 4 !== 0) || (distance > 18 && rec.frame % 2 !== 0))) return
  const rig = grp.userData.arachnidRig as ArachnidRig
  const swarm = rig.kind === 'swarm'
  let clip: ArachnidClip = ar.clip, t = ar.clipT
  if (e.dead) {
    if (swarm) { clip = 'swarm_flow'; t = ar.clipT } else { clip = 'death'; t = Math.max(0, (ar.deadT !== undefined ? 2.4 - e.deathT : 0)) }
  }
  if (clip !== rec.clip) {
    if (rec.last && !ar.noBlend && !swarm) { rec.prev = rec.last; rec.blend = BLEND } else { rec.prev = null; rec.blend = 0 }
    rec.clip = clip
  }
  const sc = e.def.scale ?? 1
  const moving = clip === 'walk' || clip === 'run' || clip === 'swarm_flow'
  let pose = sampleArachnid(grp, clip, t, {
    speed: moving ? Math.max(0.001, ar.speed / sc) : undefined,
    phase: (e.id % 13) * 0.11, seed: e.id,
    regrow: ar.kind === 'regen' ? ar.regrow : undefined,
  })
  // 符文个体追猎时发光增强
  if (ARACHNID_STATS[ar.kind].flags.runic && (ar.mode === 'chase' || ar.mode === 'attack' || ar.mode === 'rear')) pose.glow *= 1.3
  if (ar.kind === 'undying' && ar.mode === 'dormant') pose.glow *= 0.6 + 0.4 * Math.sin(_time * 3)
  if (rec.prev && rec.blend > 0) {
    pose = mixArachnidPose(rec.prev, pose, 1 - rec.blend / BLEND)
    rec.blend -= dt * (distance > 18 ? 2 : 1)
    if (rec.blend <= 0) rec.prev = null
  }
  applyArachnidPose(grp, pose)
  if (rig.setEngorge && clip !== 'feed' && Math.abs((rig.engorge ?? 0) - ar.engorge) > 0.01) rig.setEngorge(ar.engorge)
  rec.last = pose
}

/** 死亡分支：death 片段由 animateArachnidEntity 播放；群体只做消散缩小 */
export function arachnidDeathPose(grp: THREE.Group, e: Entity, _d: number, gz: number) {
  const d=Math.min(1,Math.max(0,1-e.deathT/2.4))
  grp.position.y = gz
  const rig = grp.userData.arachnidRig as ArachnidRig | undefined
  if (rig?.kind === 'swarm') grp.scale.setScalar(Math.max(0.01, (e.def.scale ?? 1) * (1 - Math.min(1, d * 1.6))))
  else grp.scale.setScalar(e.def.scale ?? 1)
}

// ======================================================================
// 符文点光源（走渲染器 portableLights）
// ======================================================================
const LIGHT_CACHE = new WeakMap<Engine, Map<string, LightSource>>()
const RUNE_COLOR: Partial<Record<ArachnidKind, string>> = { widow: '#ff3b52', fireproof: '#ff8a2a', regen: '#c86cff', undying: '#7f9cff', anoxic: '#5fe0ff', colossus: '#8a6cff' }
export function arachnidLights(eng: Engine): LightSource[] {
  const m = eng.map
  if (!m || eng.levelDef.id !== 8) return []
  let cache = LIGHT_CACHE.get(eng)
  if (!cache) { cache = new Map(); LIGHT_CACHE.set(eng, cache) }
  const p = eng.player, out: LightSource[] = []
  const add = (id: string, x: number, y: number, z: number, color: string, r: number, k: number) => {
    let l = cache!.get(id)
    if (!l) { l = { x, y, r, color, flickerSeed: 0, noFix: 1, keep: 1, intensityMul: k }; cache!.set(id, l) }
    l.x = x; l.y = y; l.fixZ = z; l.color = color
    out.push(l)
  }
  const runic = m.entities.filter((e) => !e.dead && !e.presentationPending && e.def.type === 'arachnid' && e.arachnid && ARACHNID_STATS[e.arachnid.kind].flags.runic)
    .map((e) => ({ e, d: Math.hypot(e.x - p.x, e.y - p.y) })).filter((q) => q.d < 14).sort((a, b) => a.d - b.d).slice(0, 2)
  for (const { e } of runic) add(`a${e.id}`, e.x, e.y, e.z + (e.arachnid!.kind === 'colossus' ? 1.2 : 0.45), RUNE_COLOR[e.arachnid!.kind] ?? '#8a6cff', e.arachnid!.kind === 'colossus' ? 4.5 : 2.6, 0.3)
  const w = getArachnidWorld(eng), ox = m.inf?.ox ?? 0, oy = m.inf?.oy ?? 0
  const nest = w.nests.map((n) => ({ n, d: Math.hypot(n.zx - ox - p.x, n.zy - oy - p.y) })).filter((q) => q.d < 18).sort((a, b) => a.d - b.d)[0]
  if (nest) { const n = nest.n, x = n.x + n.dx * 0.9 - ox, y = n.y + n.dy * 0.9 - oy; add(`n${n.id}`, x, y, floorHeight(m, x, y, 0) + 1.1, '#8a6cff', 3.4, 0.38) }
  for (const id of [...cache.keys()]) if (!out.includes(cache.get(id)!)) cache.delete(id)
  return out
}

// ======================================================================
// 世界视图：蛛巢、茧、网、酸雾
// ======================================================================
interface Puff { mesh: THREE.Mesh; vx: number; vy: number; vz: number; t: number; life: number; grow: number }
interface View {
  scene: THREE.Scene
  map: unknown
  ox:number;oy:number
  root: THREE.Group
  nests: Map<string, { grp: THREE.Group; cocoons: Map<string, THREE.Mesh> }>
  webs: Map<string, THREE.Group>
  puffs: Puff[]
  seenFx: number
  silk: Map<number, THREE.Line>
}
const VIEWS=new WeakMap<THREE.Scene,View>()
let webGeo: { lines: THREE.BufferGeometry; disc: THREE.CircleGeometry } | null = null
const webLineMat = new THREE.LineBasicMaterial({ color: '#e9e5da', transparent: true, opacity: 0.7, depthWrite: false })
const webDiscMat = new THREE.MeshBasicMaterial({ color: '#dcd8cc', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
const puffMat = new THREE.MeshBasicMaterial({ color: '#b9dc4c', transparent: true, opacity: 0.45, depthWrite: false })
const burnMat = new THREE.MeshBasicMaterial({ color: '#ff9a3a', transparent: true, opacity: 0.7, depthWrite: false })
const dustMat = new THREE.MeshBasicMaterial({ color: '#8c7a62', transparent: true, opacity: 0.5, depthWrite: false })
const silkMat = new THREE.LineBasicMaterial({ color: '#f2efe6', transparent: true, opacity: 0.8 })
const puffGeo = new THREE.SphereGeometry(0.5, 10, 8)

/** 一张竖立的圆网：12 根辐射丝 + 9 圈螺旋丝 + 极淡的网面（网面在 XY 平面、法线 +Z） */
function webGeometry() {
  if (webGeo) return webGeo
  const pts: number[] = [], R = 0.85
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; pts.push(0, 0, 0, Math.cos(a) * R, Math.sin(a) * R, 0) }
  for (let ring = 1; ring <= 9; ring++) {
    const r0 = (ring / 9.6) * R
    for (let k = 0; k < 12; k++) {
      const a0 = (k / 12) * Math.PI * 2, a1 = ((k + 1) / 12) * Math.PI * 2
      const s0 = r0 * (1 + 0.04 * Math.sin(k * 3.1 + ring)), s1 = r0 * (1 + 0.04 * Math.sin((k + 1) * 3.1 + ring))
      // 两辐射丝之间的丝略向内下垂
      const am = (a0 + a1) / 2, sm = (s0 + s1) / 2 * 0.95
      pts.push(Math.cos(a0) * s0, Math.sin(a0) * s0, 0, Math.cos(am) * sm, Math.sin(am) * sm, 0, Math.cos(am) * sm, Math.sin(am) * sm, 0, Math.cos(a1) * s1, Math.sin(a1) * s1, 0)
    }
  }
  // 四根锚丝拉到岩壁 / 地面
  for (const [x, y] of [[-1.3, 0.9], [1.3, 0.8], [-1.1, -0.95], [1.2, -0.95]]) pts.push(x * 0.6, y * 0.6, 0, x, y, 0)
  const lines = new THREE.BufferGeometry(); lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  webGeo = { lines, disc: new THREE.CircleGeometry(R, 24) }
  return webGeo
}
function buildWebMesh(): THREE.Group {
  const g = webGeometry(), grp = new THREE.Group()
  const ls = new THREE.LineSegments(g.lines, webLineMat); ls.renderOrder = 2
  const disc = new THREE.Mesh(g.disc, webDiscMat); disc.renderOrder = 1
  grp.add(ls, disc)
  grp.userData.arachnidWeb = 1
  return grp
}

function disposeGroup(o:THREE.Object3D){
 const sharedMats=new Set<THREE.Material>([webLineMat,webDiscMat,puffMat,burnMat,dustMat,silkMat]),mats=new Set<THREE.Material>(),geos=new Set<THREE.BufferGeometry>()
 o.traverse(c=>{const m=c as THREE.Mesh;if(m.geometry&&m.geometry!==webGeo?.lines&&m.geometry!==webGeo?.disc&&m.geometry!==puffGeo)geos.add(m.geometry);if(m.material)for(const mt of Array.isArray(m.material)?m.material:[m.material])if(!sharedMats.has(mt))mats.add(mt)})
 for(const g of geos)g.dispose();for(const m of mats)m.dispose()
}
export function clearArachnidWorldView(scene:THREE.Scene){const v=VIEWS.get(scene);if(!v)return;v.root.removeFromParent();disposeGroup(v.root);VIEWS.delete(scene)}
export function updateArachnidWorldView(scene: THREE.Scene, eng: Engine, time: number, dt: number, meshOf?: (id: number) => THREE.Object3D | undefined) {
 const m=eng.map
 if(!m||eng.levelDef.id!==8||!m.inf){clearArachnidWorldView(scene);return}
 let V=VIEWS.get(scene)
 if(V&&V.map!==m){clearArachnidWorldView(scene);V=undefined}
 const ox=m.inf.ox,oy=m.inf.oy
 if(!V){const root=new THREE.Group();root.name='arachnid-world';scene.add(root);V={scene,map:m,ox,oy,root,nests:new Map(),webs:new Map(),puffs:[],seenFx:-1,silk:new Map()};VIEWS.set(scene,V)}
 const dx=V.ox-ox,dy=V.oy-oy
 if(dx||dy){for(const p of V.puffs){p.mesh.position.x+=dx;p.mesh.position.z+=dy}for(const l of V.silk.values())l.geometry.translate(dx,0,dy);V.ox=ox;V.oy=oy}
 const w=getArachnidWorld(eng),p=eng.player
  // ---- 蛛巢与茧 ----
  const live = new Set<string>()
  for (const n of w.nests) {
    const cx = n.zx - ox, cy = n.zy - oy
    if (Math.hypot(cx - p.x, cy - p.y) > 48) continue
    live.add(n.id)
    let rec = V.nests.get(n.id)
    if (!rec) {
      const grp = buildRuneNest(n.seed)
      const x = n.x - ox, y = n.y - oy
      grp.position.set(x, floorHeight(m, x, y, 0) - 0.05, y)
      // 巢网模型的两面贴墙网在本地 x=0 / z=0，向 +x+z 铺开：让本地对角线指向洞内
      grp.rotation.y = Math.PI / 4 - Math.atan2(n.dy, n.dx)
      grp.scale.setScalar(1.25)
      const cocoons = new Map<string, THREE.Mesh>()
      for (const c of n.cocoons) {
        const mesh = buildHumanCocoon(n.seed + c.id.length * 7 + cocoons.size)
        const lx = c.x - ox, ly = c.y - oy
        mesh.position.set(lx, floorHeight(m, lx, ly, 0) + 0.78, ly)
        mesh.rotation.set(0.18, c.rot, 0.12) // 斜靠在网上
        V.root.add(mesh)
        cocoons.set(c.id, mesh)
      }
      V.root.add(grp)
      rec = { grp, cocoons }
      V.nests.set(n.id, rec)
    }
    // 窗口平移后重新落位
    const x = n.x - ox, y = n.y - oy
    rec.grp.position.x = x; rec.grp.position.z = y
    for (const c of n.cocoons) {
      const mesh = rec.cocoons.get(c.id)
      if (!mesh) continue
      mesh.visible = !w.cocoonsTaken.has(c.id)
      mesh.position.x = c.x - ox; mesh.position.z = c.y - oy
    }
    breatheRuneNest(rec.grp, time)
  }
  for (const [id, rec] of V.nests) if (!live.has(id)) { V.root.remove(rec.grp); disposeGroup(rec.grp); for (const c of rec.cocoons.values()) { V.root.remove(c); disposeGroup(c) } V.nests.delete(id) }
  // ---- 网 ----
  const webs = arachnidWebs(eng), liveW = new Set<string>()
  for (const web of webs) {
    const x = web.x - ox, y = web.y - oy
    if (Math.hypot(x - p.x, y - p.y) > 40) continue
    liveW.add(web.id)
    let g = V.webs.get(web.id)
    if (!g) {
      g = buildWebMesh()
      g.rotation.y = Math.atan2(web.nx, web.ny)
      V.root.add(g); V.webs.set(web.id, g)
    }
    g.position.set(x, floorHeight(m, x, y, 0) + 0.85, y)
    // 被缠住时网轻轻抖
    const trapped = w.webId === web.id && w.webT > 0
    g.scale.setScalar(1 + (trapped ? Math.sin(time * 30) * 0.03 : Math.sin(time * 0.8 + x) * 0.01))
  }
  for (const [id, g] of V.webs) if (!liveW.has(id)) { V.root.remove(g); V.webs.delete(id) }
  // ---- 特效事件 ----
  for (const f of w.fx) {
    if (f.t <= V.seenFx) continue
    const x = f.x - ox, y = f.y - oy
    if (f.kind === 'spray') {
      // 从鞭蝎尾基酸腺喷出（arachnidEmitter 给模型空间喷口位置）
      let sx = x, sy = y, sz = f.z
      const grp = f.id !== undefined ? meshOf?.(f.id) : undefined
      const em = grp && grp.userData.arachnidRig ? arachnidEmitter(grp, 'spray') : null
      if (grp && em) { const wp = em.pos.clone().applyMatrix4(grp.matrixWorld); sx = wp.x; sy = wp.z; sz = wp.y }
      for (let k = 0; k < 3; k++) {
        const mesh = new THREE.Mesh(puffGeo, puffMat.clone()); mesh.position.set(sx, sz, sy); mesh.scale.setScalar(0.12)
        V.root.add(mesh)
        const a = Math.atan2(f.dy ?? 0, f.dx ?? 1) + (Math.random() - 0.5) * 0.5, sp = 2.6 + Math.random() * 1.2
        V.puffs.push({ mesh, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.4 + Math.random() * 0.3, t: 0, life: 1.0, grow: 1.1 })
      }
    } else if (f.kind === 'webburn' || f.kind === 'disperse') {
      for (let k = 0; k < 5; k++) {
        const mesh = new THREE.Mesh(puffGeo, (f.kind === 'webburn' ? burnMat : dustMat).clone()); mesh.position.set(x + (Math.random() - 0.5) * 0.6, floorHeight(m, x, y, 0) + (f.kind === 'webburn' ? 0.9 : 0.15), y + (Math.random() - 0.5) * 0.6); mesh.scale.setScalar(0.1)
        V.root.add(mesh)
        V.puffs.push({ mesh, vx: (Math.random() - 0.5) * 1.2, vy: (Math.random() - 0.5) * 1.2, vz: 0.6, t: 0, life: 0.7, grow: 0.8 })
      }
    } else if (f.kind === 'silk' && f.id !== undefined) {
      const grp = meshOf?.(f.id)
      const em = grp && grp.userData.arachnidRig ? arachnidEmitter(grp, 'spinner') : null
      if (grp && em) {
        let line = V.silk.get(f.id)
        if (!line) { line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), silkMat); V.root.add(line); V.silk.set(f.id, line) }
        const a = em.pos.clone().applyMatrix4(grp.matrixWorld)
        const b = new THREE.Vector3(0.7, 0.75, 0.15 * Math.sin(time * 6)).applyMatrix4(grp.matrixWorld)
        line.geometry.setFromPoints([a, b]); line.userData.t = time; line.visible = true
      }
    }
  }
  if (w.fx.length) V.seenFx = Math.max(V.seenFx, ...w.fx.map((f) => f.t))
  for (const [id, line] of V.silk) if (time - (line.userData.t ?? 0) > 0.2) { V.root.remove(line); line.geometry.dispose(); V.silk.delete(id) }
  for (let i = V.puffs.length - 1; i >= 0; i--) {
    const q = V.puffs[i]
    q.t += dt
    const k = q.t / q.life
    q.mesh.position.x += q.vx * dt; q.mesh.position.z += q.vy * dt; q.mesh.position.y += q.vz * dt
    q.vx *= 1 - dt * 1.5; q.vy *= 1 - dt * 1.5
    q.mesh.scale.setScalar(0.12 + k * q.grow)
    ;(q.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k)
    if (k >= 1) { V.root.remove(q.mesh); (q.mesh.material as THREE.Material).dispose(); V.puffs.splice(i, 1) }
  }
}

export function buildArachnidEntityMesh(opts?:{arachnidVariant?:string;arachnidMother?:boolean;seed?:number}):THREE.Group{const job=buildArachnidEntityJob(opts);let n=job.next();while(!n.done)n=job.next();return n.value}
