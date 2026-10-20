import * as THREE from 'three'
import {DEFAULT_AVATAR,SKIN_OPTIONS} from '../src/game/core/avatar'
const before=new URLSearchParams(location.search).has('before')
const base=before?'/.cache/poolface-v82-holster-before/src/game':'/src/game'
const {buildAvatarModel,retroModelReady}=await import(/* @vite-ignore */base+'/renderer/retroAvatar.ts')
const {retroTexture}=await import(/* @vite-ignore */base+'/renderer/retroNpc.ts')
const {disposeCharacterModel}=await import(/* @vite-ignore */base+'/renderer/retroResources.ts')
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,1080);renderer.setPixelRatio(1);renderer.setClearColor(0x292c2b);renderer.outputColorSpace=THREE.SRGBColorSpace;document.body.append(renderer.domElement)
const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(28,640/1080,.01,20)
scene.add(new THREE.HemisphereLight(0xd6e0ec,0x71675a,2.2));const key=new THREE.DirectionalLight(0xffe4c7,2.6);key.position.set(-2,4,5);scene.add(key)
let models:THREE.Group[]=[]
const wait=(ms=30)=>new Promise(r=>setTimeout(r,ms)),frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()))
async function view(gender=0,tier=2,blink=false,color='#39312c',hair=1){
 for(const m of models){scene.remove(m);disposeCharacterModel(m)}models=[];document.getElementById('labels')!.replaceChildren()
 for(let v=0;v<3;v++){
  const m=buildAvatarModel({...DEFAULT_AVATAR,gender,skin:SKIN_OPTIONS[tier],hairColor:color,hair},{seed:v,driven:false})
  if(before){const id=`${gender?'f':'m'}${tier}-${v}`,url='/.cache/poolface-v82-holster-before/public/textures/npc-retro/pool/'+id;m.userData.retro.setFace(retroTexture(url+'/neutral.png'),retroTexture(url+'/neutral-blink.png'))}
  models.push(m);scene.add(m)
 }
 for(let i=0;i<400&&!models.every(retroModelReady);i++)await wait()
 if(!models.every(retroModelReady))throw Error('Pool texture readiness timeout')
 renderer.setScissorTest(true);const result=[]
 for(let i=0;i<3;i++){
  models.forEach((m,j)=>m.visible=i===j);const m=models[i],rig=m.userData.retro,mat=rig.mesh.material[1] as THREE.MeshLambertMaterial
  for(let t=0;t<150;t++){rig.update(t*.08);if(String(mat.map?.image?.src).includes('-blink.png')===blink)break}
  m.rotation.y=.22;renderer.setViewport(i*640,0,640,1080);renderer.setScissor(i*640,0,640,1080);cam.position.set(0,1.60,1.12);cam.lookAt(0,1.57,0);cam.updateMatrixWorld();renderer.render(scene,cam)
  const label=document.createElement('div');label.className='label';label.style.cssText=`left:${i*640}px;width:640px`;label.textContent=`${before?'导入前':'v82'} · ${gender?'f':'m'}${tier}-${i}${blink?' · 闭眼':''}${hair===0?' · 光头':''}`;document.getElementById('labels')!.append(label)
  result.push({id:`${gender?'f':'m'}${tier}-${i}`,path:mat.map?.image?.src,opaque:!mat.transparent,key:mat.customProgramCacheKey(),uvFinite:Array.from(rig.mesh.geometry.attributes.uv.array).every(Number.isFinite),geometry:rig.mesh.geometry.uuid,groups:rig.mesh.geometry.groups.length})
 }
 renderer.setScissorTest(false);await frame();return{gender,tier,blink,color,hair,models:result,memory:{...renderer.info.memory}}
}
async function checks(){
 let checks=0;const ok=(v:unknown,s:string)=>{if(!v)throw Error(s);checks++},records=[]
 for(let g=0;g<2;g++)for(let t=0;t<5;t++){
  const result=await view(g,t);records.push(result)
  for(const m of result.models){ok(m.opaque,'opaque face '+m.id);ok(m.uvFinite,'finite face UV '+m.id);ok(m.path.includes('/pool/'+m.id+'/neutral.png'),'registered face pair '+m.id);ok(before||m.key.includes('retro-face-hair-v82'),'v82 shader key '+m.id)}
 }
 const closed=await view(0,2,true);ok(closed.models.every(m=>m.path.includes('neutral-blink.png')),'Real rig blink texture swap')
 const resources=[];for(let i=0;i<4;i++){await view(0,2);resources.push({...renderer.info.memory})}
 ok(resources.slice(1).every(m=>m.geometries===resources[1].geometries&&m.textures===resources[1].textures),'Avatar rebuild GPU resources stabilize')
 return{checks,faces:30,records,resources}
}
Object.assign(window,{poolQA:{view,checks,stats:()=>({memory:{...renderer.info.memory},programs:renderer.info.programs?.length})}})
await view();(window as any).poolReady=true
