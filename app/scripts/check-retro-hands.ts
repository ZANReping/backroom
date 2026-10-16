import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { ITEMS } from '../src/game/content/items'
import { buildHandCollider, buildRetroHand, heldHandPose, heldBox, FLASH_HAND_POSE, LIGHTER_HAND_POSE, sleeveKindOf } from '../src/game/renderer/retroViewHand'
import { buildHeldItem, vmAnimPose } from '../src/game/renderer/viewmodel'
// Image upload is exercised in the browser suite; this stand-in only lets the
// ownership checks observe the shared Texture without fetching a DOM image.
Object.defineProperty(globalThis, 'document', { value: { createElement: (tag: string) => tag === 'canvas' ? createCanvas(256, 256) : {}, createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) } })
let checks = 0
const ok = (v: unknown, s: string) => { assert(v, s); checks++ }
const finite = (a: ArrayLike<number>) => Array.from(a).every(Number.isFinite)
function inspectItem(g: THREE.Object3D, label: string) {
  let meshes = 0, tris = 0
  g.updateMatrixWorld(true); g.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; meshes++; const p = m.geometry.getAttribute('position'); tris += (m.geometry.index?.count ?? p.count) / 3; for (const n of ['position','normal','uv','color']) { const a = m.geometry.getAttribute(n); if (!a) continue; ok(finite(a.array), `${label} finite ${n}`) } }); return { meshes, tris }
}
const itemTypes = ['', 'guncandy', ...Object.keys(ITEMS)]
const stats: any[] = []
for (const type of itemTypes) for (const side of [false, true]) for (const sleeve of ['long','short','none'] as const) {
  const item = type ? buildHeldItem(type) : undefined
  const hand = buildRetroHand({ left: side }); hand.setLook({ skin: '#c9a58a', sleeve: '#3a3f46', sleeveKind: sleeve, topStyle: 3, plainSleeve: true })
  const box = item ? heldBox(item) : undefined; hand.setPose(heldHandPose(type, box), item)
  hand.group.updateMatrixWorld(true); let handTris = 0, handMeshes = 0; hand.group.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) { handMeshes++; handTris += (m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3; for (const [name, a] of Object.entries(m.geometry.attributes)) { ok(finite(a.array), `${type}/${side}/${sleeve} hand finite ${name}`); if (name === 'uv') ok(Array.from(a.array).every(v => v >= -1e-5 && v <= 1.00001), `${type}/${side}/${sleeve} hand UV bounds`) } } }); ok(handTris <= 1200 && handMeshes <= 2, `${type}/${side}/${sleeve} hand budget`)
  if (item) { stats.push({ type, side, sleeve, handTris, handMeshes, ...inspectItem(item, `${type}/${side}/${sleeve}`) }); item.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); if (Array.isArray(m.material)) m.material.forEach(x => x.dispose()); else m.material?.dispose() }) }
  hand.dispose(); hand.dispose()
}

// Verify every observed pose is disposed once (including those evicted while
// still previously displayed), and shared textures survive instance disposal.
const a=buildRetroHand(), b=buildRetroHand()
const observed=new Map<THREE.BufferGeometry,number>()
function observe(){for(const g of [a.skin.geometry,a.sleeve.geometry])if(!observed.has(g)){observed.set(g,0);g.addEventListener('dispose',()=>observed.set(g,observed.get(g)!+1))}}
observe()
const look={skin:'#c9a58a',sleeve:'#3a3f46',sleeveKind:'long' as const,topStyle:3}
a.setLook(look);b.setLook(look);observe()
const map=(a.sleeve.material as THREE.MeshLambertMaterial).map!
let textureDisposals=0;map.addEventListener('dispose',()=>textureDisposals++)
ok(map===(b.sleeve.material as THREE.MeshLambertMaterial).map,'shared sleeve texture')
const first=buildHeldItem('almond'),pose=heldHandPose('almond',heldBox(first));a.setPose(pose,first);observe()
const initial=a.skin.geometry;a.setPose(pose,first);ok(a.skin.geometry===initial,'same item reuses pose geometry')
let materialDisposals=0
for(const m of [a.skin.material,a.sleeve.material] as THREE.Material[])m.addEventListener('dispose',()=>materialDisposals++)
for(let i=0;i<24;i++){a.setPose({...pose,at:[i*.001,pose.at[1],pose.at[2]]},first);observe()}
ok([...observed.values()].some(n=>n===1),'bounded cache evicts geometry')
a.dispose();a.dispose()
ok([...observed.values()].every(n=>n===1),'all observed cached geometry disposed exactly once')
ok(materialDisposals===2,'private materials disposed exactly once')
ok(textureDisposals===0&&b.skin.geometry.attributes.position.count>0,'second instance and shared texture survive')
b.dispose()
first.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();for(const mat of Array.isArray(m.material)?m.material:[m.material])mat?.dispose()})
// A moved parent must cancel out of the item-parent to hand transform.
const parent=new THREE.Group(),solid=new THREE.Mesh(new THREE.BoxGeometry(.04,.08,.04),new THREE.MeshLambertMaterial())
parent.add(solid);solid.position.set(.025,0,-.03)
const plain=buildHandCollider(solid,new THREE.Matrix4(),false)
parent.position.set(4,2,-3);parent.rotation.set(.2,.4,.1);parent.scale.setScalar(2)
const transformed=buildHandCollider(solid,new THREE.Matrix4(),false)
ok(transformed.count===plain.count,'transformed parent leaves local surface sampling invariant')
for(const p of [[.045,0,-.03],[.025,.04,-.03],[.3,0,0]] as [number,number,number][])ok(plain.near(p,.004)===transformed.near(p,.004),'collider parent-local probe')
const root=new THREE.Group(),hidden=new THREE.Group();root.add(hidden);hidden.add(solid);hidden.visible=false
ok(buildHandCollider(root,new THREE.Matrix4(),false).count===0,'invisible ancestor omits collider triangles')
solid.geometry.dispose();solid.material.dispose()
for (const sk of ['long','short','none'] as const) ok(sleeveKindOf(sk === 'long' ? 1 : sk === 'short' ? 0 : 5) === sk, `sleeve ${sk}`)
for (const p of [FLASH_HAND_POSE, LIGHTER_HAND_POSE]) ok(p.at.every(Number.isFinite) && (p.fdir ?? [1]).every(Number.isFinite), 'hand pose finite')
for (const usingItem of [null,{t:0,dur:2,anim:'drink'},{t:1,dur:2,anim:'eat'},{t:2,dur:2,anim:'medical'}]) { const p=vmAnimPose({mx:.4,my:.2,bobPhase:.7,time:1,usingItem,attackAnimT:0,attackAnimDur:1}); ok(Object.values(p).every(v=>typeof v==='number'&&Number.isFinite(v)),'vm pose finite') }
mkdirSync('reports/hands-import',{recursive:true}); writeFileSync('reports/hands-import/geometry.json', JSON.stringify({ checks, itemTypes: itemTypes.length, stats }, null, 2)); console.log(JSON.stringify({checks, itemTypes:itemTypes.length, stats:stats.length}, null, 2))
