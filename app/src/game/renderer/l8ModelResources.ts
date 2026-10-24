import * as THREE from 'three'
/** Instance geometry/materials are owned; procedural texture sources are shared. */
export function disposeL8Tree(root:THREE.Object3D){
 root.userData.releasePending?.()
 const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>(),skeletons=new Set<THREE.Skeleton>()
 root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geos.add(m.geometry);if((m as THREE.SkinnedMesh).isSkinnedMesh)skeletons.add((m as THREE.SkinnedMesh).skeleton);if(m.material)for(const a of Array.isArray(m.material)?m.material:[m.material])mats.add(a);if((m as THREE.InstancedMesh).isInstancedMesh)(m as THREE.InstancedMesh).dispose()})
 for(const g of geos)g.dispose();for(const m of mats)m.dispose();for(const s of skeletons)s.dispose()
}
