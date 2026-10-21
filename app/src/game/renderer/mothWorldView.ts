// 死亡飞蛾巢穴与机制的渲染（Entity 4 重制·第 3 阶段）：
//   巢道具：按 inf.mothNests 登记的主巢/卫星巢，在玩家 28m 内建出覆层、门框增生、孵化囊、卵柱、地面卵堆；远离即回收（共享几何/材质不释放）。
//   被打破的卵：inf.mothEggs[巢:道具] 计数 → 隐藏对应数量的卵实例。
//   酸池：mothFx(eng).acid → 半透明黄绿圆斑（随时间淡出）；胶状球：mothFx(eng).gels → buildMothGelBall。
import * as THREE from 'three'
import type { Engine } from '../engine'
import { afterSceneCompile } from './sceneWarmup'
import { mothFx } from '../engine/mothAI'
import { nestProps, type MothNestDesc } from '../world/mothNests'
import { floorHeight } from '../world/mapgen'
import { buildMothDoorGrowth, buildMothEggCluster, buildMothEggPillar, buildMothGelBall, buildMothNestCoat, setEggHidden } from './mothNestMesh'

const NEST_R = 28
let ACID_GEO: THREE.CircleGeometry | undefined, ACID_MAT: THREE.MeshBasicMaterial | undefined
function acidMesh() {
  ACID_GEO ??= new THREE.CircleGeometry(1, 28)
  ACID_MAT ??= new THREE.MeshBasicMaterial({ color: '#b8c24a', transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
  const m = new THREE.Mesh(ACID_GEO.clone(), ACID_MAT.clone()); m.rotation.x = -Math.PI / 2; m.renderOrder = 3
  return m
}

export class MothWorldView {
  root = new THREE.Group()
  private nests = new Map<string, { grp: THREE.Group; eggs: { key: string; im: THREE.InstancedMesh; shown: number }[]; job?: Generator<void, void> }>()
  private acid: THREE.Mesh[] = []
  private gels = new Map<string, THREE.Group>()
  private scene: THREE.Scene
  constructor(scene: THREE.Scene) { this.scene = scene; this.root.name = 'mothWorld'; scene.add(this.root) }

  private mapRef: unknown
  sync(eng: Engine, wallH: number) {
    const m = eng.map; if (!m) return
    if (!this.root.parent) this.scene.add(this.root)
    if (this.mapRef !== m) { this.mapRef = m; this.reset() } // 换层/重开：全部重建
    const inf = m.inf, ox = inf?.ox ?? 0, oy = inf?.oy ?? 0, p = eng.player
    // ---- 巢 ----
    const want = new Set<string>()
    const buildDeadline = performance.now() + 1.5
    for (const n of Object.values(inf?.mothNests ?? {})) {
      if (Math.hypot(n.cx - ox - p.x, n.cy - oy - p.y) > NEST_R) continue
      want.add(n.id)
      let rec = this.nests.get(n.id)
      if (!rec) { rec = { grp: new THREE.Group(), eggs: [] }; rec.grp.name = 'mothNest:' + n.id; rec.job = this.buildNestJob(eng, n, wallH, rec); this.nests.set(n.id, rec); this.root.add(rec.grp) }
      if (rec.job && performance.now() < buildDeadline && rec.job.next().done) rec.job = undefined
      rec.grp.position.set(-ox, 0, -oy) // 巢道具按世界坐标摆放，整体随窗口原点平移
      for (const eg of rec.eggs) {
        const broken = Math.min(eg.im.count, inf?.mothEggs?.[`${n.id}:${eg.key}`] ?? 0)
        while (eg.shown > eg.im.count - broken) { eg.shown--; setEggHidden(eg.im, eg.shown, true) }
      }
    }
    for (const [id, rec] of this.nests) if (!want.has(id)) { rec.job?.return(); this.drop(rec.grp); this.nests.delete(id) }
    // ---- 酸池 ----
    const fx = mothFx(eng)
    while (this.acid.length < fx.acid.length) { const a = acidMesh(); this.acid.push(a); this.root.add(a) }
    while (this.acid.length > fx.acid.length) this.drop(this.acid.pop()!)
    this.acid.forEach((mesh, i) => {
      const a = fx.acid[i]
      mesh.visible = !!a
      if (!a) return
      const k = Math.min(1, a.t / 0.25) * (1 - Math.max(0, (a.t - (a.T - 1.5)) / 1.5))
      mesh.position.set(a.x - ox, a.z + 0.02, a.y - oy); mesh.scale.setScalar(a.r * (0.6 + 0.4 * Math.min(1, a.t / 0.4)))
      ;(mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * k
    })
    // ---- 胶状球 ----
    for (const g of fx.gels) {
      const key = `${g.x.toFixed(2)},${g.y.toFixed(2)}`
      let b = this.gels.get(key)
      if (!b) { b = buildMothGelBall(g.seed, 0.34); this.root.add(b); this.gels.set(key, b) }
      b.position.set(g.x - ox, g.z, g.y - oy)
    }
  }

  private *buildNestJob(eng: Engine, n: MothNestDesc, wallH: number, rec: { grp: THREE.Group; eggs: { key: string; im: THREE.InstancedMesh; shown: number }[] }): Generator<void, void> {
    const { grp, eggs } = rec
    const m = eng.map!, inf = m.inf, ox = inf?.ox ?? 0, oy = inf?.oy ?? 0
    const ground = (x: number, y: number) => floorHeight(m, x - ox, y - oy)
    const yawOf = (nx: number, ny: number) => Math.atan2(nx, ny) // 局部 +Z → 世界法线（地图 x→x, 地图 y→z）
    let i = 0
    for (const pr of nestProps(n, wallH)) {
      yield
      i++
      let o: THREE.Group
      if (pr.kind === 'coat') { o = buildMothNestCoat(n.seed + i, pr.w, pr.ht, n.kind === 'main' ? 0.24 : 0.16); o.position.set(pr.x + pr.nx * 0.01, ground(pr.x + pr.nx * 0.5, pr.y + pr.ny * 0.5) + pr.h, pr.y + pr.ny * 0.01); o.rotation.y = yawOf(pr.nx, pr.ny) }
      else if (pr.kind === 'door') { o = buildMothDoorGrowth(n.seed + i, pr.w, pr.ht); o.position.set(pr.x, ground(pr.x + 0.5, pr.y), pr.y); o.rotation.y = yawOf(pr.nx, pr.ny) }
      else if (pr.kind === 'sac') { o = buildMothEggCluster(n.seed + i, pr.eggs, pr.r, 'lo'); o.position.set(pr.x, ground(pr.x, pr.y) + pr.h, pr.y); o.rotation.y = yawOf(-pr.nx, -pr.ny) + Math.PI } // 背面贴进墙角
      else if (pr.kind === 'pillar') { o = buildMothEggPillar(n.seed + i, pr.ht); o.position.set(pr.x, ground(pr.x, pr.y), pr.y) }
      else { o = buildMothEggCluster(n.seed + i, pr.eggs, pr.r, 'lo'); o.rotation.x = -Math.PI / 2; o.position.set(pr.x, ground(pr.x, pr.y), pr.y) } // 地面卵堆
      const im = o.userData.eggs as THREE.InstancedMesh | undefined
      if (im) eggs.push({ key: pr.key, im, shown: im.count })
      grp.add(o)
    }
  }

  private drop(root: THREE.Object3D) {
    root.removeFromParent()
    afterSceneCompile(root, () => {
      const geos = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>()
      root.traverse(o => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) geos.add(mesh.geometry)
        if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mats.add(m)
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose()
      })
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
      root.clear()
    })
  }
  private reset() {
    for (const rec of this.nests.values()) rec.job?.return()
    for (const child of [...this.root.children]) this.drop(child)
    this.nests.clear(); this.gels.clear(); this.acid = []
  }
  dispose() { this.reset(); this.root.removeFromParent(); this.mapRef = undefined }
}
