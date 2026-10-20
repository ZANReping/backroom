import * as THREE from 'three'
import {NPCS,npcAvatar,brcWorkerDef,genRandomNpcs} from '../src/game/content/npcs'
import {ALPHA_PEOPLE} from '../src/game/content/alphaPeople'
import {L11_PEOPLE} from '../src/game/content/l11People'
import {DEFAULT_AVATAR} from '../src/game/core/avatar'
import {buildCharacterModel} from '../src/game/renderer/characterModel'
import {buildAvatarModel,retroModelReady,npcSeed} from '../src/game/renderer/retroAvatar'
import {disposeCharacterModel} from '../src/game/renderer/retroResources'
import {npcPortrait} from '../src/components/npcPortrait'
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,1080);renderer.setPixelRatio(1);renderer.setClearColor(0x292c2b);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.appendChild(renderer.domElement)
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(33,1,.01,20)
scene.add(new THREE.HemisphereLight(0xd6e0ec,0x71675a,2.2));const key=new THREE.DirectionalLight(0xffe4c7,2.6);key.position.set(-2,4,5);scene.add(key)
const defs=Object.fromEntries([...Object.values(NPCS),...Object.values(ALPHA_PEOPLE),...L11_PEOPLE].map(d=>[d.id,d]))
let models:THREE.Group[]=[]
const source=(m:THREE.Object3D)=>{const face=m.userData.retro.mesh.material[1] as THREE.MeshLambertMaterial;return{path:face.map?.userData.url??face.map?.image?.src,cacheKey:face.customProgramCacheKey(),opaque:!face.transparent,geometries:renderer.info.memory.geometries}}
async function ready(){for(let i=0;i<300&&!models.every(retroModelReady);i++)await new Promise(r=>setTimeout(r,30));if(!models.every(retroModelReady))throw Error('Face texture timeout')}
async function show(ids:string[],angle=.22,blink=false){
 for(const m of models){scene.remove(m);disposeCharacterModel(m)}models=[]
 const labels=document.getElementById('labels')!;labels.innerHTML=''
 for(const id of ids){const d=defs[id],m=buildCharacterModel(npcAvatar(d),{npcId:id,npcDef:d,driven:true});models.push(m);scene.add(m)}await ready()
 return draw(ids,angle,blink)
}
function draw(ids:string[],angle:number,blink:boolean){
 const cols=ids.length<=4?ids.length:4,rows=Math.ceil(ids.length/cols),w=1920/cols,h=1080/rows;renderer.setScissorTest(true)
 const result=[]
 for(let i=0;i<models.length;i++){
  models.forEach((m,j)=>m.visible=i===j);const m=models[i],rig=m.userData.retro;m.rotation.y=angle
  for(let t=0;t<120;t++){rig.update(t*.08);if(String(rig.mesh.material[1].map?.image?.src).includes('-blink.png')===blink)break}
  const x=i%cols*w,y=1080-(Math.floor(i/cols)+1)*h
  renderer.setViewport(x,y,w,h);renderer.setScissor(x,y,w,h);camera.aspect=w/h;camera.position.set(0,1.63,ids.length<=4?1.02:1.38);camera.lookAt(0,1.57,0);camera.updateProjectionMatrix();renderer.render(scene,camera)
  const label=document.createElement('div');label.className='label';label.style.cssText=`left:${x}px;top:${1080-y-28}px;width:${w}px`;label.textContent=ids[i]+' / '+(defs[ids[i]]?.name??ids[i]);document.getElementById('labels')!.appendChild(label)
  result.push({id:ids[i],...source(m)})
 }renderer.setScissorTest(false);return result
}
async function hair(){
 for(const m of models){scene.remove(m);disposeCharacterModel(m)}models=[];document.getElementById('labels')!.innerHTML=''
 const rows=[['red','#a84230',1],['blond','#c8af6f',1],['gray','#aaaaaa',1],['bald','#39312c',0]] as const
 for(const [name,color,hair] of rows){const m=buildAvatarModel({...DEFAULT_AVATAR,hair,hairColor:color},{seed:npcSeed('lan')});models.push(m);scene.add(m)}await ready();return draw(rows.map(v=>v[0]),.22,false)
}
async function checks(){
 let checks=0;const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks++},ids=Object.keys(defs).filter(id=>!['kat','tom','aiko','kowalski','tiny'].includes(id)&&defs[id].faction!=='brc'),namedPaths=[]
 for(let i=0;i<ids.length;i+=8){const result=await show(ids.slice(i,i+8));for(const r of result){ok(String(r.path).includes('/named/'+r.id+'/neutral.png'),'named face '+r.id);ok(r.opaque,'face opaque '+r.id);namedPaths.push(r.path)}}
 await show(['lan','morel','faust','nightingale']);const portraits=[]
 for(let i=0;i<models.length;i++){const rig=models[i].userData.retro,face=rig.mesh.material[1] as THREE.MeshLambertMaterial;let closed=false,closedTime=0
  for(let t=0;t<100;t++){rig.update(t*.08);if(String(face.map?.image?.src).includes('neutral-blink.png')){closed=true;closedTime=t*.08;break}}
  ok(closed,'blink '+i);rig.update(closedTime+.32);ok(!String(face.map?.image?.src).includes('neutral-blink.png'),'blink recovers '+i)
  const id=['lan','morel','faust','nightingale'][i],image=npcPortrait(npcAvatar(defs[id]),id,defs[id],160,'identity');ok(image.startsWith('data:image/'),'portrait '+id);portraits.push({id,image})
 }
 const random=genRandomNpcs(()=>.44,1)[0],generic=buildCharacterModel(npcAvatar(random),{npcId:random.id,npcDef:random}),worker=brcWorkerDef(55,0,0,0),brc=buildCharacterModel(npcAvatar(worker),{npcId:worker.id,npcDef:worker}),player=buildAvatarModel(DEFAULT_AVATAR)
 for(let i=0;i<240&&![generic,brc,player].every(retroModelReady);i++)await new Promise(r=>setTimeout(r,30))
 ok(String(source(generic).path).includes('/pool/'),'random NPC keeps pool');ok(String(source(player).path).includes('/pool/'),'player keeps expression pool');ok(String(brc.userData.retro.mesh.material[2].map.image.src).includes('/faceless/'),'BRC remains faceless')
 for(const m of [generic,brc,player])disposeCharacterModel(m)
 return {checks,named:ids.length,namedPaths,portraits}
}
async function portraits(ids:string[]){
 await show(ids,0,false)
 return ids.map(id=>({id,image:npcPortrait(npcAvatar(defs[id]),id,defs[id],240,'identity')}))
}
Object.assign(window,{faceQA:{ids:Object.keys(defs).filter(id=>id!=='tiny'),show,hair,checks,portraits,stats:()=>({...renderer.info.memory,programs:renderer.info.programs?.length})}})
await show(['lan','otis','irene','nightingale']);(window as any).faceReady=true
