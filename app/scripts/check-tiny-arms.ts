// 小小手臂穿模检查：每个动画片段取 24 帧，统计手臂顶点落进躯干/头/腿（封闭体）里的数量，
// 以及上臂、前臂骨段穿过鲨鱼皮（单层面片）的次数。用法：npm run check:tiny-arms
import * as THREE from 'three'
import { buildTinyMesh } from '../src/game/renderer/tinyMesh'
import { animateTiny, sampleTiny, TINY_CLIPS } from '../src/game/renderer/tinyAnim'
const g = buildTinyMesh()
const P = g.userData.parts as Record<string, THREE.Object3D>
const meshesOf = (o: THREE.Object3D, skip: (m: THREE.Object3D) => boolean) => { const r: THREE.Mesh[] = []; o.traverse((m) => { if ((m as THREE.Mesh).isMesh && !skip(m)) r.push(m as THREE.Mesh) }); return r }
const inSpear = (m: THREE.Object3D) => { for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p === P.spear) return true; return false }
const inArm = (m: THREE.Object3D, side: string) => { for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p === P['arm' + side]) return true; return false }
const inPelt = (m: THREE.Object3D) => { for (let p: THREE.Object3D | null = m; p; p = p.parent) if (p === P.pelt || p === P.hood || p === P.sharkJaw) return true; return false }
const torsoBody = P.torso.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh
const skull = P.head.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh
const legs = ['legL', 'legR', 'kneeL', 'kneeR'].flatMap((k) => P[k].children.filter((c) => (c as THREE.Mesh).isMesh && c.name !== 'glowSpots') as THREE.Mesh[])
const solids = [torsoBody, skull, ...legs]
for (const s of solids) (s.material as THREE.Material).side = THREE.DoubleSide
const pelt = meshesOf(P.torso, (m) => !inPelt(m)).concat(meshesOf(P.head, (m) => !inPelt(m)))
const rc = new THREE.Raycaster(); const dirs = [new THREE.Vector3(1, 0.13, 0.07).normalize(), new THREE.Vector3(-0.1, 1, 0.2).normalize(), new THREE.Vector3(0.2, -0.1, 1).normalize()]
const v = new THREE.Vector3()
const inside = (p: THREE.Vector3, m: THREE.Mesh) => { let n = 0; for (const d of dirs) { rc.set(p, d); if (rc.intersectObject(m, false).length % 2 === 1) n++ } return n >= 2 }
const report: Record<string, any> = {}
for (const clip of Object.keys(TINY_CLIPS)) {
  const c = TINY_CLIPS[clip]; let worst = 0, worstT = 0, total = 0, peltHits = 0; const where: Record<string, number> = {}
  for (let i = 0; i < 24; i++) {
    const t = c.loop ? (i / 24) * c.dur : (i / 23) * c.dur
    animateTiny(g, sampleTiny(clip, t)); g.updateMatrixWorld(true)
    let n = 0
    for (const side of ['L', 'R']) {
      const arm = meshesOf(P['arm' + side], (m) => inSpear(m) || m.name === 'glowSpots')
      for (const m of arm) {
        const pa = m.geometry.attributes.position
        for (let k = 0; k < pa.count; k += 3) {
          v.fromBufferAttribute(pa, k).applyMatrix4(m.matrixWorld)
          // 肩关节附近的顶点本来就埋在躯干里，跳过
          const sh = new THREE.Vector3(); P['arm' + side].getWorldPosition(sh); if (v.distanceTo(sh) < Number(process.env.SKIP ?? 0.06)) continue
          for (const s of solids) if (inside(v, s)) { n++; const key = side + ':' + (s === torsoBody ? 'torso' : s === skull ? 'head' : 'leg'); where[key] = (where[key] ?? 0) + 1; break }
        }
      }
      // 骨段与鲨皮相交
      const a = new THREE.Vector3(), b = new THREE.Vector3(), h = new THREE.Vector3()
      P['arm' + side].getWorldPosition(a); P['elbow' + side].getWorldPosition(b); P['hand' + side].getWorldPosition(h)
      for (const [p0, p1] of [[a, b], [b, h]]) { const d = p1.clone().sub(p0); const len = d.length(); rc.set(p0, d.normalize()); rc.far = len; const hits = rc.intersectObjects(pelt, false).filter((x) => x.distance > 0.06); if (hits.length) { peltHits++; where[side + ':pelt'] = (where[side + ':pelt'] ?? 0) + 1 } rc.far = Infinity }
    }
    // 矛杆（握点两侧）穿过身体或鲨皮
    {
      const sp = P.spear; const o = new THREE.Vector3(); sp.getWorldPosition(o); const ax = new THREE.Vector3(0, 1, 0).applyQuaternion(sp.getWorldQuaternion(new THREE.Quaternion()))
      for (const [d, len] of [[ax.clone(), 1.6], [ax.clone().negate(), 1.2]] as const) { rc.set(o.clone().addScaledVector(d, 0.12), d); rc.far = len; const hs = rc.intersectObjects([...solids, ...pelt], false); if (hs.length) where['spear:' + (pelt.includes(hs[0].object as THREE.Mesh) ? 'pelt' : 'body')] = (where['spear:' + (pelt.includes(hs[0].object as THREE.Mesh) ? 'pelt' : 'body')] ?? 0) + 1; rc.far = Infinity }
    }
    total += n; if (n > worst) { worst = n; worstT = +t.toFixed(2) }
  }
  report[clip] = { total, worst, worstT, peltHits, where }
}
console.log(JSON.stringify(report, null, 1))

if (Object.values(report).some(v => v.total > 0 || v.peltHits > 0)) throw new Error('Tiny arm intersection regression')
