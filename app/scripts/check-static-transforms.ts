import * as THREE from 'three'
import { freezeStaticTree } from '../src/game/renderer/staticTransforms'

type Tree = { root: THREE.Group; staticGrandchild: THREE.Object3D; dynamicChild: THREE.Object3D; dynamic: Set<THREE.Object3D> }
const makeTree = (): Tree => {
  const root = new THREE.Group(); root.name = 'root'
  const branch = new THREE.Group(); branch.name = 'branch'
  const nested = new THREE.Group(); nested.name = 'nested'
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); leaf.name = 'static-leaf'
  nested.add(leaf); branch.add(nested); root.add(branch)
  const sibling = new THREE.Group(); sibling.name = 'second-static-branch'
  const siblingLeaf = new THREE.Object3D(); siblingLeaf.name = 'second-static-leaf'; siblingLeaf.position.set(-2, 3, 1)
  sibling.add(siblingLeaf); root.add(sibling)
  const dynamic = new THREE.Group(); dynamic.name = 'dynamic'
  const dynamicChild = new THREE.Group(); dynamicChild.name = 'dynamic-child'
  const dynamicLeaf = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); dynamicLeaf.name = 'dynamic-leaf'
  dynamicChild.add(dynamicLeaf); dynamic.add(dynamicChild); root.add(dynamic)
  root.updateMatrixWorld(true)
  return { root, staticGrandchild: leaf, dynamicChild, dynamic: new Set([dynamic]) }
}
const freezeBaseline = (root: THREE.Object3D, dynamic: ReadonlySet<THREE.Object3D>) => {
  const visit = (node: THREE.Object3D) => { if (dynamic.has(node)) return; node.updateMatrix(); node.matrixAutoUpdate = false; for (const child of node.children) visit(child) }
  visit(root); root.updateMatrixWorld(true)
}
const allNodes = (root: THREE.Object3D) => { const out: THREE.Object3D[] = []; root.traverse(n => out.push(n)); return out }
const trees = [makeTree(), makeTree()]
freezeStaticTree(trees[0].root, trees[0].dynamic); freezeBaseline(trees[1].root, trees[1].dynamic)
let checks = 0
const compare = (label: string) => {
  const a = allNodes(trees[0].root), b = allNodes(trees[1].root)
  if (a.length !== b.length) throw new Error(`${label}: node count differs`)
  for (let i = 0; i < a.length; i++) { checks++; if (!a[i].matrixWorld.elements.every((v, j) => Object.is(v, b[i].matrixWorld.elements[j]))) throw new Error(`${label}: ${a[i].name} matrix differs`) }
}
const step = (label: string, fn: (t: Tree) => void) => { fn(trees[0]); fn(trees[1]); trees[0].root.updateMatrixWorld(); trees[1].root.updateMatrixWorld(); compare(label) }
for (let pass=0;pass<2;pass++) {
freezeStaticTree(trees[0].root, trees[0].dynamic); freezeBaseline(trees[1].root, trees[1].dynamic)
compare(`freeze ${pass}`)
for (let i = 0; i < 10; i++) { trees[0].root.updateMatrixWorld(); trees[1].root.updateMatrixWorld(); compare(`idle ${i}`) }
step('chunk child move', t => { t.root.children[0].position.x += 2; t.root.children[0].updateMatrix() })
step('parent move', t => { t.root.position.z += 3; t.root.updateMatrix() })
step('dynamic rotate scale', t => { t.dynamicChild.rotation.y += .4; t.dynamicChild.scale.set(1.2, .8, 1.1); t.dynamicChild.updateMatrix() })
step('visibility', t => { t.staticGrandchild.visible = !t.staticGrandchild.visible })
step('forced world update', t => { t.staticGrandchild.position.y+=.3; t.staticGrandchild.updateMatrix(); t.root.updateMatrixWorld(true) })
step('updateWorldMatrix', t => { t.staticGrandchild.position.z-=.2; t.staticGrandchild.updateMatrix(); t.root.updateWorldMatrix(true, true) })
for (const t of trees) { const branch=t.root.children[0]; branch.position.x+=.25; branch.updateMatrix(); branch.getWorldPosition(new THREE.Vector3()) }
trees[0].root.updateMatrixWorld(); trees[1].root.updateMatrixWorld(true); compare('world position refresh propagates to descendants')
let visits = 0
const original = trees[0].staticGrandchild.updateMatrixWorld
trees[0].staticGrandchild.updateMatrixWorld = function (force?: boolean) { visits++; return original.call(this, force) }
trees[0].root.updateMatrixWorld(); trees[0].root.updateMatrixWorld(); if (visits !== 0) throw new Error(`static descendants visited during idle frame: ${visits}`)
checks++
trees[0].staticGrandchild.updateMatrixWorld = original
}
console.log(`static transform regression passed: ${checks} checks`)
