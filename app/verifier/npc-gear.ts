import * as THREE from 'three'
import { NPCS, npcAvatar,brcWorkerDef,jerryFollowerDef } from '../src/game/content/npcs'
import { buildCharacterModel } from '../src/game/renderer/characterModel'
import { retroModelReady } from '../src/game/renderer/retroAvatar'
import { disposeCharacterModel } from '../src/game/renderer/retroResources'
import { buildNpcEntityPreview } from '../src/game/renderer/npcEntityPreview'
import { poseNpcGuitarHands } from '../src/game/renderer/npcGearPose'
const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true})
renderer.setSize(1920,1080);renderer.setPixelRatio(1);renderer.setClearColor(0x292c2b)
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping
document.body.appendChild(renderer.domElement)
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(33,1, .01,30)
scene.add(new THREE.HemisphereLight(0xd6e0ec,0x71675a,2.2))
const key=new THREE.DirectionalLight(0xffe4c7,2.6);key.position.set(-2,4,5);scene.add(key)
let models:THREE.Group[]=[]
const workers=Array.from({length:8},(_,i)=>brcWorkerDef(400,3,2,i)),follower=jerryFollowerDef(1,2,0)
const defs={...NPCS,...Object.fromEntries([...workers,follower].map(d=>[d.id,d]))},ids=Object.keys(defs)
const stats=(m:THREE.Object3D)=>{let triangles=0,draws=0;m.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.geometry||!mesh.visible)return;triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;draws+=mesh.geometry.groups.length||1});return {triangles,draws}}
async function show(selected:string[],angle=0,pose='idle',close=false){
 for(const m of models){scene.remove(m);disposeCharacterModel(m)}models=[]
 const labels=document.getElementById('labels')!;labels.innerHTML=''
 for(const id of selected){const m=buildNpcEntityPreview(id)??buildCharacterModel(npcAvatar(defs[id]),{npcId:id,npcDef:defs[id],driven:pose!=='idle'});models.push(m);scene.add(m)}
 for(let i=0;i<300&&!models.every(retroModelReady);i++)await new Promise(r=>setTimeout(r,30))
 if(!models.every(retroModelReady))throw Error('Texture timeout')
 renderer.setScissorTest(true)
 const cols=selected.length<=4?selected.length:4,rows=Math.ceil(selected.length/cols),w=1920/cols,h=1080/rows
 for(let i=0;i<models.length;i++){
  models.forEach((m,j)=>m.visible=i===j);const m=models[i];m.userData.retroUpdate?.(1.25);m.rotation.y=angle
  const rig=m.userData.retro,bones=rig?.bones
  if(bones&&pose==='walk'){bones.upperArmL.rotation.x=.65;bones.foreArmL.rotation.x=-.5;bones.upperArmR.rotation.x=-.6;bones.thighL.rotation.x=-.6;bones.shinL.rotation.x=.35;bones.thighR.rotation.x=.5;bones.head.rotation.y=.5}
  if(bones&&pose.startsWith('seated')){bones.thighL.rotation.x=bones.thighR.rotation.x=-1.5;bones.shinL.rotation.x=bones.shinR.rotation.x=1.5;bones.spine.rotation.x=.15;bones.head.rotation.y=-.5;if(pose.endsWith('isolated'))rig.mesh.visible=false}
  if(bones&&pose==='playing'){const g=bones.spine.children.find((o:THREE.Object3D)=>o.userData.joeyGuitar);if(g){g.position.fromArray(g.userData.gearPlay);g.rotation.set(0,-.1,.95);poseNpcGuitarHands(rig,g,1,1.25)}}
  const x=(i%cols)*w,y=1080-(Math.floor(i/cols)+1)*h
  renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);camera.aspect=w/h
  camera.position.set(0,close?1.65:1.15,close?1.05:3.45);camera.lookAt(0,close?1.62:1.0,0);camera.updateProjectionMatrix();renderer.render(scene,camera)
  const label=document.createElement('div');label.className='label';label.style.cssText=`left:${x}px;top:${1080-y-35}px;width:${w}px;height:24px`;label.textContent=selected[i]+' / '+defs[selected[i]].name;labels.appendChild(label)
 }
 renderer.setScissorTest(false)
 const result=models.map((m,i)=>({id:selected[i],...stats(m),gear:m.userData.npcGear??null}));return result
}
Object.assign(window,{gearQA:{ids,show,stats:()=>renderer.info.memory}})
await show(ids.slice(0,8));(window as any).gearReady=true
