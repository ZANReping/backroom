import assert from 'node:assert/strict'
import * as THREE from 'three'
import {buildL3Glass} from '../src/game/renderer/l3Glass'
const a=buildL3Glass(4.8,3.8),b=buildL3Glass(5.1,3.9)
let meshes=0,triangles=0
a.traverse(o=>{
 const m=o as THREE.Mesh;if(!m.isMesh)return
 meshes++;const mat=m.material as THREE.MeshStandardMaterial
 assert(!mat.map&&!mat.emissiveMap&&!mat.normalMap,'window is entirely modelled, no texture')
 const p=m.geometry.getAttribute('position');assert(p.count>100)
 for(let i=0;i<p.array.length;i++)assert(Number.isFinite(p.array[i]))
 triangles+=(m.geometry.index?.count??p.count)/3
 m.geometry.computeBoundingBox();assert(m.geometry.boundingBox!.max.z-m.geometry.boundingBox!.min.z>.01,'real depth')
})
assert.equal(meshes,3,'glass, lead and stone are only three draw calls')
assert(triangles<70000,'window has a bounded triangle budget')
assert.notEqual((a.children[0] as THREE.Mesh).geometry,(b.children[0] as THREE.Mesh).geometry,'streaming instances own their buffers')
const box=new THREE.Box3().setFromObject(a);assert(box.max.y<5.4&&box.min.y>1.2)
console.log(JSON.stringify({meshes,triangles,width:box.max.x-box.min.x,height:box.max.y-box.min.y,textureMaps:0}))
