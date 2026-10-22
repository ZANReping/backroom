// 小小：手臂网格的三角形边与鲨皮、面具、长矛的相交统计（每片段 6 帧）
import * as THREE from 'three'
import { buildTinyMesh } from '../src/game/renderer/tinyMesh'
import { animateTiny, sampleTiny, TINY_CLIPS } from '../src/game/renderer/tinyAnim'
const g = buildTinyMesh(); const P = g.userData.parts as Record<string, THREE.Object3D>
const under = (m: THREE.Object3D, roots: THREE.Object3D[]) => { for (let p: THREE.Object3D | null = m; p; p = p.parent) if (roots.includes(p)) return true; return false }
const all: THREE.Mesh[] = []; g.traverse((m) => { if ((m as THREE.Mesh).isMesh) all.push(m as THREE.Mesh) })
for (const m of all) { const mat = m.material as THREE.Material; mat.side = THREE.DoubleSide }
const rc = new THREE.Raycaster(); const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3()
const label = (m: THREE.Object3D) => under(m, [P.pelt]) ? 'pelt' : under(m, [P.hood, P.sharkJaw]) ? 'hood' : under(m, [P.spear]) ? 'spear' : under(m, [P.carL, P.carR]) ? 'mask' : under(m, [P.head]) ? 'head' : under(m, [P.torso]) && !under(m, [P.armL, P.armR]) ? 'torso' : under(m, [P.legL, P.legR]) ? 'leg' : 'other'
for (const clip of Object.keys(TINY_CLIPS)) {
  const c = TINY_CLIPS[clip]; const where: Record<string, number> = {}
  for (let i = 0; i < 6; i++) {
    const t = c.loop ? (i / 6) * c.dur : (i / 5) * c.dur
    animateTiny(g, sampleTiny(clip, t)); g.updateMatrixWorld(true)
    for (const side of ['L', 'R']) {
      const arm = all.filter((m) => under(m, [P['arm' + side]]) && !under(m, [P.spear]))
      const targets = all.filter((m) => !under(m, [P['arm' + side]]) && m.name !== 'glowSpots' && label(m) !== 'torso' && label(m) !== 'other')
      for (const m of arm) {
        const ng = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry; const pa = ng.attributes.position
        const sh = new THREE.Vector3(); P['arm' + side].getWorldPosition(sh)
        for (let k = 0; k < pa.count; k += 3) {
          a.fromBufferAttribute(pa, k).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pa, k + 1).applyMatrix4(m.matrixWorld)
          if (a.distanceTo(sh) < 0.06) continue
          d.subVectors(b, a); const len = d.length(); if (len < 1e-5) continue
          rc.set(a, d.normalize()); rc.far = len
          const h = rc.intersectObjects(targets, false)
          if (h.length) { const key = `${side}:${label(h[0].object)}@${t.toFixed(2)}`; where[key] = (where[key] ?? 0) + 1 }
        }
      }
    }
  }
  console.log(clip, JSON.stringify(where))
}
