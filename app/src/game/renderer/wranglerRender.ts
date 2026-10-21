// 牧蛇游戏内渲染：把 wranglerAI 的世界坐标轨迹喂给脊线着色器，并管理岩壁上的洞口/鼓包/卵枝和被吞时的黑屏。
import * as THREE from 'three'
import type { Entity } from '../entities'
import type { Engine } from '../engine'
import { buildWranglerMesh, buildBurrowHole, buildEggBranch, setWranglerSpine, setWranglerMouth, setWranglerBulge, WRANGLER_DIM, type WranglerRig, type WranglerKind } from './wranglerMesh'
import { poseWrangler, buildRockBulge } from './wranglerAnim'
import { wranglerBlackout, wranglerEggs, wranglerHoles, wranglerOrigin, WR } from '../engine/wranglerAI'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const smooth = (a: number, b: number, t: number) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k) }

/** entitiesMesh 入口：按 AI 决定的变种建模（变种在首个 AI tick 才确定，renderer 会在变种变化时重建） */
export function buildWranglerEntity(kind: WranglerKind = 'male', pregnant = false) {
  const g = buildWranglerMesh(kind, { pregnant, light: false, lod: 0 })
  g.userData.wranglerKind = kind; g.userData.wranglerPregnant = pregnant
  return g
}

/**
 * 每帧摆位。成体：组放回世界原点，用轨迹（窗口坐标）直接驱动脊线；幼体：沿用通用的位置/朝向，只播蹦跳/盘踞片段。
 */
export function animateWrangler(grp: THREE.Group, e: Entity, eng: Engine, time: number) {
  const s = e.wg, rig = grp.userData.wranglerRig as WranglerRig | undefined
  if (!s || !rig) return
  if (s.kind === 'juvenile') { poseWrangler(rig, s.clip === 'coil' ? 'coil' : 'hop', time % 4); grp.visible = !e.dead; return }
  grp.position.set(0, 0, 0); grp.rotation.set(0, 0, 0); grp.scale.setScalar(1)
  const show = s.phase !== 'under' && s.trail.length > 1 && !e.dead
  grp.visible = show
  if (!show) return
  const [ox, oy] = wranglerOrigin(eng), R = WRANGLER_DIM[s.kind].r
  const headY = e.z + s.headZ
  const path: THREE.Vector3[] = []
  let acc = 0
  for (let i = 0; i < s.trail.length; i++) {
    const q = s.trail[i]
    if (i > 0) acc += Math.hypot(q.x - s.trail[i - 1].x, q.y - s.trail[i - 1].y)
    // 颈部 3.5m 内从头的高度过渡到贴地
    const lift = 1 - smooth(0, 3.5, acc)
    path.push(V(q.x - ox, q.z + R + (headY - (q.z + R)) * lift, q.y - oy))
    if (acc > rig.len + 4) break
  }
  // 催眠：头在 8 字里缓慢摆动；蓄力：头往后缩、抬高
  const sway = s.phase === 'hypno' || (s.phase === 'hunt' && s.gaze > 0) ? 1 : 0
  if (path.length > 1) {
    const t0 = path[0].clone().sub(path[1]).setY(0).normalize(), side = V(-t0.z, 0, t0.x)
    const back = s.phase === 'windup' ? smooth(0, WR.WINDUP, s.t) * R * 1.6 : 0
    let a2 = 0
    for (let i = 0; i < path.length; i++) {
      if (i > 0) a2 += path[i].distanceTo(path[i - 1])
      const w = 1 - smooth(0, 5, a2)
      if (w <= 0) break
      path[i].addScaledVector(side, Math.sin(time * 1.9) * 0.55 * R * sway * w)
      path[i].y += Math.sin(time * 3.8) * 0.2 * R * sway * w + back * 0.5 * w
      path[i].addScaledVector(t0, -back * w)
    }
  }
  setWranglerSpine(rig, path)
  setWranglerMouth(rig, s.mouth)
  setWranglerBulge(rig, s.bulge)
  // 眼睛光随催眠进度增亮
  if (rig.headRig.light) rig.headRig.light.intensity = (s.kind === 'male' ? 2.2 : 2.6) * (1 + s.gaze * 0.8)
}

// ---------------------------------------------------------------------------
// 岩壁道具 + 黑屏
// ---------------------------------------------------------------------------
interface PropState { holes: Map<number, { hole: THREE.Group; bulge: THREE.Mesh }>; eggs: Map<number, THREE.Group>; black?: THREE.Mesh }
const props = new WeakMap<THREE.Scene, PropState & {map?:Engine['map']}>()
function disposeProp(root:THREE.Object3D){const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geos.add(m.geometry);if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material])mats.add(mat)});root.removeFromParent();for(const g of geos)g.dispose();for(const m of mats)m.dispose()}
export function clearWranglerProps(scene:THREE.Scene){const st=props.get(scene);if(!st)return;for(const o of st.holes.values()){disposeProp(o.hole);disposeProp(o.bulge)}for(const egg of st.eggs.values())disposeProp(egg);if(st.black)disposeProp(st.black);props.delete(scene)}
export function syncWranglerProps(scene: THREE.Scene, camera: THREE.Camera, eng: Engine) {
  let st = props.get(scene)
  if(st && st.map!==eng.map){clearWranglerProps(scene);st=undefined}
  if (!st) { st = { holes: new Map(), eggs: new Map(), map:eng.map }; props.set(scene, st) }
  const [ox, oy] = wranglerOrigin(eng)
  const live = new Set<number>()
  for (const h of wranglerHoles(eng)) {
    live.add(h.id)
    let o = st.holes.get(h.id)
    if (!o) {
      o = { hole: buildBurrowHole(h.r, h.id), bulge: buildRockBulge(h.r / 1.15) }
      scene.add(o.hole); scene.add(o.bulge); st.holes.set(h.id, o)
    }
    const yaw = Math.atan2(h.nx, h.ny)
    o.hole.position.set(h.x - ox + h.nx * 0.02, h.z, h.y - oy + h.ny * 0.02); o.hole.rotation.y = yaw
    o.bulge.position.set(h.x - ox + h.nx * 0.01, h.z, h.y - oy + h.ny * 0.01); o.bulge.rotation.y = yaw
    o.hole.visible = h.open > 0.5
    o.bulge.visible = h.open <= 0.5 && h.rock > 0.01
    if (o.bulge.visible) o.bulge.userData.setBulge(h.rock)
  }
  for (const [id, o] of st.holes) if (!live.has(id)) { disposeProp(o.hole); disposeProp(o.bulge); st.holes.delete(id) }
  const liveE = new Set<number>()
  for (const g of wranglerEggs(eng)) {
    liveE.add(g.seed)
    let m = st.eggs.get(g.seed)
    if (!m) { m = buildEggBranch(g.seed, 1, 1); scene.add(m); st.eggs.set(g.seed, m) }
    m.position.set(g.x - ox, g.z + 1.3, g.y - oy); m.rotation.y = Math.atan2(g.nx, g.ny)
    m.visible = !g.burnt
  }
  for (const [id, m] of st.eggs) if (!liveE.has(id)) { disposeProp(m); st.eggs.delete(id) }
  // 被吞的黑屏：贴在相机前的黑色面片
  const k = wranglerBlackout(eng)
  if (k > 0.001 && !st.black) {
    st.black = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, depthTest: false, depthWrite: false }))
    st.black.renderOrder = 10000; st.black.frustumCulled = false; st.black.position.z = -0.12
    camera.add(st.black); if (!camera.parent) scene.add(camera)
  }
  if (st.black) { st.black.visible = k > 0.001; (st.black.material as THREE.MeshBasicMaterial).opacity = Math.min(1, k) }
}
