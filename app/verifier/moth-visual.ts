import * as THREE from 'three'
import {buildMothMesh,animateMoth} from '../src/game/renderer/mothMeshes'
import type {MothForm} from '../src/game/entities/types'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'
const canvas=document.querySelector('canvas')!,renderer=new THREE.WebGLRenderer({canvas,antialias:true}),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.001,30),controls=new OrbitControls(camera,canvas)
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(2,devicePixelRatio));renderer.toneMapping=THREE.ACESFilmicToneMapping
scene.background=new THREE.Color('#111512');scene.add(new THREE.HemisphereLight('#e5e6d3','#17110d',1.6))
const key=new THREE.DirectionalLight('#fff0dc',3);key.position.set(2,3,1);scene.add(key)
const rim=new THREE.DirectionalLight('#a3c6d4',1.5);rim.position.set(-1,1,-2);scene.add(rim)
const ground=new THREE.GridHelper(4,40,'#343c34','#232b25');scene.add(ground)
let model:THREE.Group|undefined,playing=true,time=0,last=performance.now()
function show(form:MothForm){
 if(model){scene.remove(model);const sk=new Set<THREE.Skeleton>();model.traverse(o=>{const m=o as THREE.SkinnedMesh;if(m.isMesh){m.geometry.dispose();(m.material as THREE.Material).dispose()}if(m.skeleton)sk.add(m.skeleton)});sk.forEach(s=>s.dispose())}
 model=buildMothMesh(form);scene.add(model);model.updateMatrixWorld(true)
 const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3()),d=Math.max(size.x,size.y,size.z)*1.8
 controls.target.copy(center);camera.position.set(center.x+d,center.y+d*.40,center.z+d*.60);controls.update();ground.visible=form==='guard'||form==='larva'
 return size.toArray()
}
function pose(t:number,speed=1.2){playing=false;time=t;if(model){animateMoth(model,t,1/60,speed);model.updateMatrixWorld(true)}renderer.render(scene,camera)}
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-form]'))b.onclick=()=>show(b.dataset.form as MothForm)
document.querySelector('#play')!.addEventListener('click',()=>playing=!playing)
Object.assign(window,{mothQA:{show,pose,scene,camera,renderer,get model(){return model},get playing(){return playing}}});show('female')
function frame(now:number){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;if(playing&&model){time+=dt;animateMoth(model,time,dt,1.2)}controls.update();renderer.render(scene,camera)}requestAnimationFrame(frame)
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)})
