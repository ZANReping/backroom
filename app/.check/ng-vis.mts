import * as THREE from 'three'
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => null, style: {} }),
  getElementById: () => null, body: { appendChild: () => {} },
}
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh.ts')
const g = buildEntityMesh('nguithr')
const parts = g.userData.parts as Record<string, THREE.Object3D>
const count = (o: THREE.Object3D): number => 1 + o.children.reduce((a, c) => a + count(c), 0)
console.log('spiderBody 子树节点:', count(parts.spiderBody), '（应 >20，含头胸/腹/12 腿）')
console.log('sacGrp 子树节点:', count(parts.sacGrp))
// 模拟网囊阶段显隐：隐藏 spiderBody 后统计可见 mesh 数
parts.spiderBody.visible = false; parts.sacGrp.visible = true
let vis = 0
g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { let v = o.visible, p = o.parent; while (p) { v = v && p.visible; p = p.parent } if (v) vis++ } })
console.log('网囊阶段可见 mesh:', vis, '（应只剩网囊 4 件）')
