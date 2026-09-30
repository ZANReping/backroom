import * as THREE from 'three'

const cachedWorld = new WeakMap<THREE.Object3D, THREE.Matrix4>()
const updateNormally = THREE.Object3D.prototype.updateMatrixWorld

function updateStaticBranch(this: THREE.Object3D, force?: boolean) {
  const previous = cachedWorld.get(this)!
  // A world-position/bounds query can update this node before the render pass.
  // Still propagate that change to its descendants, even after the dirty flag
  // was cleared by updateWorldMatrix(true, false).
  const changed = !previous.equals(this.matrixWorld)
  if (!force && !changed && !this.matrixAutoUpdate && !this.matrixWorldNeedsUpdate) return
  updateNormally.call(this, force || changed)
  previous.copy(this.matrixWorld)
}

/**
 * Freeze a completed world tree, excluding whole animated subtrees. Only cache
 * maximal, fully static branches. The caller's root stays traversable because
 * chunk rebasing moves its direct children independently. Descendants of a
 * cached branch must remain static; explicit updateMatrixWorld(true) and
 * updateWorldMatrix(..., true) still perform a complete refresh.
 */
export function freezeStaticTree(root: THREE.Object3D, dynamic: ReadonlySet<THREE.Object3D>) {
  const staticNodes = new Set<THREE.Object3D>()
  const freeze = (node: THREE.Object3D): boolean => {
    if (dynamic.has(node)) return false
    node.updateMatrix()
    node.matrixAutoUpdate = false
    let complete = node.updateMatrixWorld === updateNormally || node.updateMatrixWorld === updateStaticBranch
    for (const child of node.children) if (!freeze(child)) complete = false
    if (complete) staticNodes.add(node)
    return complete
  }
  freeze(root)
  root.updateMatrixWorld(true)
  const cacheChildren = (parent: THREE.Object3D) => {
    for (const child of parent.children) {
      if (staticNodes.has(child)) {
        if (child.children.length) {
          cachedWorld.set(child, child.matrixWorld.clone())
          child.updateMatrixWorld = updateStaticBranch
        }
      } else if (!dynamic.has(child)) cacheChildren(child)
    }
  }
  cacheChildren(root)
}
