import assert from 'node:assert/strict'
import * as THREE from 'three'
import { compileSceneJob, uploadSceneJob } from '../src/game/renderer/sceneWarmup'
let checks=0
const ok=(value:unknown,label:string)=>{assert(value,label);checks++}
const camera=new THREE.PerspectiveCamera(),scene=new THREE.Scene(),g=new THREE.BoxGeometry(),a=new THREE.MeshStandardMaterial(),b=new THREE.MeshBasicMaterial(),root=new THREE.Group()
root.userData.compileEquivalentMeshes=true
for(let i=0;i<40;i++){const mesh=new THREE.Mesh(g,i%2?a:b);mesh.position.x=i;root.add(mesh)}
const parents=root.children.map(o=>o.parent),matrices=root.children.map(o=>o.matrix.clone()),calls:THREE.Object3D[][]=[]
const renderer={info:{programs:[]},getRenderTarget:()=>null,setRenderTarget:()=>{},compileAsync:(view:THREE.Object3D)=>{const list:THREE.Object3D[]=[];view.traverse(o=>{if((o as THREE.Mesh).material)list.push(o)});calls.push(list);return Promise.resolve()},autoClear:true,shadowMap:{enabled:false,autoUpdate:false,needsUpdate:false},render:()=>{}} as unknown as THREE.WebGLRenderer
async function run(job:Generator<void,void,unknown>){for(let i=0;i<10000;i++){if(job.next().done)return;await Promise.resolve()}throw Error('Unfinished preparation')}
await run(compileSceneJob(renderer,root,camera,scene))
ok(calls.flat().length===2,'forty equivalent static meshes compile one representative per material')
ok(root.children.every((o,i)=>o.parent===parents[i]&&o.matrix.equals(matrices[i])),'representative selection never reparents or transforms live objects')
const plain=new THREE.Group();for(let i=0;i<17;i++)plain.add(new THREE.Mesh(g,a))
calls.length=0;await run(compileSceneJob(renderer,plain,camera,scene));ok(calls.length===3&&calls.flat().length===17,'unmarked roots preserve the existing preparation contract')
const variants=new THREE.Group();variants.userData.compileEquivalentMeshes=true
const add=(geo:THREE.BufferGeometry,material:THREE.Material=a)=>{const mesh=new THREE.Mesh(geo,material);variants.add(mesh);return mesh}
add(g);add(g.clone());add(g.clone().translate(10,0,0))
add(g.clone().deleteAttribute('normal'))
const tangent=g.clone();tangent.setAttribute('tangent',new THREE.Float32BufferAttribute(new Float32Array(tangent.getAttribute('position').count*4),4));add(tangent)
const uv1=g.clone();uv1.setAttribute('uv1',uv1.getAttribute('uv').clone());add(uv1)
const rgba=g.clone();rgba.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(rgba.getAttribute('position').count*4),4));add(rgba)
add(g.toNonIndexed())
variants.add(new THREE.SkinnedMesh(g,a),new THREE.SkinnedMesh(g,a),new THREE.InstancedMesh(g,a,1),new THREE.InstancedMesh(g,a,1))
const morph=g.clone();morph.morphAttributes.position=[g.getAttribute('position').clone()];add(morph);add(morph)
const raw=new THREE.ShaderMaterial();add(g,raw);add(g,raw)
calls.length=0;await run(compileSceneJob(renderer,variants,camera,scene))
ok(calls.flat().length===14,'normal/tangent/UV/color/index variants and every skinned, instanced, morph or custom shader object remain represented')
ok(calls.every(c=>c.length<=8),'driver submission batches remain bounded')
const submitted:THREE.Object3D[]=[]
renderer.render=(view:THREE.Object3D)=>{for(const o of view.children)if((o as THREE.Mesh).geometry){submitted.push(o);ok((o as THREE.Mesh).geometry.drawRange.count===0,'upload keeps zero draw ranges')}}
await run(uploadSceneJob(renderer,root,camera,scene))
ok(submitted.length===40&&new Set(submitted).size===40,'all forty real meshes still upload; only repeated compiler work is omitted')
ok(root.children.every(o=>(o as THREE.Mesh).geometry.drawRange.count===Infinity),'upload restores geometry ranges')
for(const geo of new Set([g,...variants.children.map(o=>(o as THREE.Mesh).geometry)]))geo.dispose();a.dispose();b.dispose();raw.dispose()
console.log(JSON.stringify({passed:checks,scope:'opt-in static shader representatives, exact feature variants and complete GPU uploads'}))
