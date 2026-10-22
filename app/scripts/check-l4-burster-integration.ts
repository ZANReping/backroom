import assert from 'node:assert/strict'
import * as THREE from 'three'
import {createCanvas} from '@napi-rs/canvas'
import {compactL4Proxy,batchL4Static} from '../src/game/renderer/l4Batch'
import {buildBursterMesh,prepareBursterJob,bursterResourcesReady} from '../src/game/renderer/bursterMesh'
import {animateBurster,sampleBurster,setBursterCocoonCrack} from '../src/game/renderer/bursterAnim'
import {bursterFrame,bursterVision} from '../src/game/engine/bursterAI'
Object.assign(globalThis,{document:{createElement:()=>createCanvas(256,256)}})
const root=new THREE.Group(),mat=new THREE.MeshLambertMaterial();root.position.set(4,0,-3);root.rotation.y=.5
for(let i=0;i<30;i++){const m=new THREE.Mesh(new THREE.BoxGeometry(.3,.7,.2),mat);m.position.set(i*.2,0,0);root.add(m)}
root.userData.structure={id:'fixture'};root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),c=box.getCenter(new THREE.Vector3()),ray=new THREE.Raycaster(c.clone().add(new THREE.Vector3(0,10,0)),new THREE.Vector3(0,-1,0))
const before=ray.intersectObject(root,true).map(h=>h.distance)
const batch=new THREE.Group();batchL4Static(batch,[root]);compactL4Proxy(root)
const after=ray.intersectObject(root,true).map(h=>h.distance)
assert.equal(root.children.length,1);assert.ok(after.length&&before.length);assert.ok(Math.abs(after[0]-before[0])<1e-5);const boxAfter=new THREE.Box3().setFromObject(root);assert.ok(box.min.distanceTo(boxAfter.min)<1e-5&&box.max.distanceTo(boxAfter.max)<1e-5);assert.equal(root.userData.structure.id,'fixture');assert.equal(root.visible,false)
const tiny=new THREE.Group();tiny.add(new THREE.Mesh(new THREE.BoxGeometry(.1,.1,.1),mat));tiny.children[0].castShadow=true;const tinyBatch=new THREE.Group();batchL4Static(tinyBatch,[tiny]);assert.equal(tinyBatch.children[0].castShadow,false);assert.equal(tinyBatch.children[0].userData.noCastShadow,true)
for(let seed=0;seed<2;seed++){const job=prepareBursterJob(seed);let steps=0;while(!job.next().done){steps++;assert.ok(steps<100)}assert.ok(bursterResourcesReady(seed));assert.ok(steps>0)}
const a=buildBursterMesh(42),b=buildBursterMesh(42),resource=(root:THREE.Group)=>{const geo=new Set<THREE.BufferGeometry>(),mat=new Set<THREE.Material>(),tex=new Set<THREE.Texture>();root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry){geo.add(m.geometry);for(const v of Object.values(m.geometry.attributes))assert.ok(Array.from(v.array).every(Number.isFinite))}if(m.material)for(const a of Array.isArray(m.material)?m.material:[m.material]){mat.add(a);if((a as any).map)tex.add((a as any).map)}});return{geo,mat,tex}}
const A=resource(a),B=resource(b);assert.ok([...A.geo].every(g=>!B.geo.has(g)));assert.ok([...A.mat].every(m=>!B.mat.has(m)));assert.deepEqual(A.tex,B.tex)
const ar=a.userData.bursterRig,br=b.userData.bursterRig;assert.notEqual(ar.root,br.root);assert.notEqual(ar.blisters[0],br.blisters[0]);assert.ok(ar.blisterMesh.instanceMatrix!==br.blisterMesh.instanceMatrix)
for(const name of ['sleep','wake','crawl','chase','burst','wait','cocoon'])for(const t of [0,.2,.7,1.4,2]){animateBurster(a,sampleBurster(name,t));a.updateMatrixWorld(true);a.traverse(o=>assert.ok(o.matrixWorld.elements.every(Number.isFinite)))}
for(const crack of [0,.25,.5,.75,1,0])setBursterCocoonCrack(a,crack)
for(const g of A.geo)g.dispose();for(const m of A.mat)m.dispose();animateBurster(b,sampleBurster('burst',1));resource(b)
const eng:any={map:{inf:{ox:0,oy:0},entities:[]},player:{}};const f=bursterFrame(eng);f.globs.push({x:20,y:21,z:1,vx:0,vy:0,vz:0,t:0,owner:1,band:0});f.acid.blind=.5;eng.map.inf.ox=32;eng.map.inf.oy=-32;assert.equal(bursterFrame(eng).globs[0].x,-12);assert.equal(bursterFrame(eng).globs[0].y,53);eng.map={entities:[]};assert.equal(bursterFrame(eng).globs.length,0);assert.equal(bursterVision(eng).blind,0)
console.log(JSON.stringify({ok:true,proxyTriangles:root.children[0].geometry?.attributes.position.count/3,bursterGeometry:A.geo.size,bursterMaterials:A.mat.size,sharedTextures:A.tex.size,checks:'proxy raycast/transform/bounds, tiny caster suppression, cooperative templates, private rigs/buffers/materials, all animation clips, cocoon cracks, streaming rebase and scene reset'}))
