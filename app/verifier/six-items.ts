import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { buildItemMesh } from '../src/game/renderer/itemsMesh'
import { buildHeldItem, buildViewmodel } from '../src/game/renderer/viewmodel'
import { SIX_ITEM_TYPES } from '../src/game/renderer/sixItemMesh'
import { setMaterialMode } from '../src/game/renderer/shared'

const query=new URLSearchParams(location.search),mode=query.get('mode')==='realistic'?'realistic':'classic'
setMaterialMode(mode)
const baseline=query.has('baseline')
// The immutable pre-change factory is captured under .check before implementation.
const old=baseline?await import('./six-items-baseline'):null
const factory=old?.buildItemMesh??buildItemMesh
const names=['幸运豆奶','瓶装闪电','万能钥匙','幸运兔脚','一些口袋','福友玉']
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight-140);renderer.domElement.style.marginTop='140px';renderer.outputColorSpace=THREE.SRGBColorSpace
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1
document.body.prepend(renderer.domElement)
const scene=new THREE.Scene();scene.background=new THREE.Color('#151c1c')
const camera=new THREE.OrthographicCamera(-1.25,1.25,.83,-.83,.01,20)
camera.position.set(0,0,4);camera.lookAt(0,0,0)
const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();pmrem.dispose()
const ambient=new THREE.HemisphereLight('#ecf1de','#596863',1),key=new THREE.DirectionalLight('#fff1db',2),rim=new THREE.DirectionalLight('#c4dce3',1)
key.position.set(-2,3,4);rim.position.set(3,1,-2);scene.add(ambient,key,rim)
const light=new THREE.SpotLight('#fff4df',15,8,.75,.7,1);light.position.set(.2,.5,2.5);light.target.position.set(0,0,0);light.visible=false;scene.add(light,light.target)
const group=new THREE.Group();scene.add(group)
let models:THREE.Group[]=[],angle=Number(query.get('angle')??0)
function dispose(g:THREE.Object3D){const geos=new Set<THREE.BufferGeometry>(),mats=new Set<THREE.Material>();g.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry)geos.add(m.geometry);if(m.material)for(const mat of Array.isArray(m.material)?m.material:[m.material])mats.add(mat)});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());g.removeFromParent()}
function metrics(){return models.map((g,i)=>{let triangles=0,calls=0;g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh){triangles+=(m.geometry.index?.count??m.geometry.getAttribute('position').count)/3;calls+=Array.isArray(m.material)?m.geometry.groups.length:1}});return{type:SIX_ITEM_TYPES[i%6],triangles,calls}})}
function render(){renderer.render(scene,camera)}
function gallery(){for(const g of models)dispose(g);models=[];document.getElementById('labels')!.innerHTML='';for(const [i,type]of SIX_ITEM_TYPES.entries()){
  let g:THREE.Group
  if(query.has('held')){
    const vm=new THREE.Group(),flash=new THREE.Group(),poseCamera=new THREE.PerspectiveCamera()
    buildViewmodel(vm,flash,poseCamera);dispose(flash);vm.removeFromParent();vm.position.set(0,0,0)
    const held=baseline?factory(type,{halo:false}):buildHeldItem(type)
    if(baseline)held.position.set(0,.02,-.18)
    vm.add(held);g=vm
  }else g=factory(type,{halo:false})
  g.scale.setScalar(query.has('held')?1.4:1.72);g.position.set((i%3-1)*.79,.40-Math.floor(i/3)*.80,0);g.rotation.y=angle+(query.has('held')?-.25:0);group.add(g);models.push(g)
  const label=document.createElement('div');label.className='label';label.innerHTML=`${names[i]}<small>${type}</small>`;document.getElementById('labels')!.append(label)
}render()}
function dark(enabled:boolean){ambient.intensity=enabled?.03:1;key.visible=rim.visible=!enabled;light.visible=enabled;scene.environmentIntensity=enabled?.025:1;render()}
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight-140);render()})
document.getElementById('subtitle')!.textContent=`${baseline?'修改前':'六件细化模型'} · ${mode} · 共享 UV 图集 · ${query.has('held')?'手持姿态':'正面 / 背面 / 侧面'}`
document.getElementById('turn')!.onclick=()=>{angle+=Math.PI;for(const g of models)g.rotation.y=angle;render()}
document.getElementById('dark')!.onclick=()=>dark(!light.visible)
gallery()
// File textures publish their decoded source asynchronously after LoadingManager completion.
await Promise.all(['color','normal',...(mode==='realistic'?['roughness']:[])].map(async name=>{const i=new Image();i.src=`/textures/items-six/${name}.png`;await i.decode()}))
await new Promise(r=>setTimeout(r,600));await renderer.compileAsync(scene,camera);render()
document.getElementById('status')!.textContent=`${metrics().reduce((s,m)=>s+m.triangles,0)} triangles / ${renderer.info.render.calls} draws`
const frame=()=>new Promise<number>(r=>requestAnimationFrame(r))
const percentile=(a:number[],q:number)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]
async function bench(rounds=5,warm=60,samples=180,count=60,type=0){
  for(const g of models)dispose(g);models=[];document.getElementById('labels')!.innerHTML='';camera.left=-1.65;camera.right=1.65;camera.top=1.1;camera.bottom=-1.1;camera.updateProjectionMatrix()
  for(let i=0;i<count;i++){const g=factory(SIX_ITEM_TYPES[(i+type)%6],{halo:false});g.position.set(count===1?0:(i%10-4.5)*.3,count===1?0:(2.5-Math.floor(i/10))*.31,0);g.scale.setScalar(count===1?4:.8);group.add(g);models.push(g)}
  await renderer.compileAsync(scene,camera)
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info'),rows=[]
  for(let round=0;round<rounds;round++){
    for(let i=0;i<warm;i++){await frame();render()}
    const elapsed:number[]=[],draw:number[]=[];let previous=await frame()
    for(let i=0;i<samples;i++){const now=await frame();elapsed.push(now-previous);previous=now;const start=performance.now();render();gl.finish();draw.push(performance.now()-start)}
    rows.push({round,frameMedian:percentile(elapsed,.5),frameP95:percentile(elapsed,.95),drawMedian:percentile(draw,.5),drawP95:percentile(draw,.95),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory}})
    ;(window as any).__sixProgress={round:round+1,rounds,baseline,mode,rows};document.getElementById('status')!.textContent=`采样 ${round+1}/${rounds}`
  }
  return {baseline,mode,count,type:count===1?SIX_ITEM_TYPES[type]:'mixed',warm,samples,viewport:[innerWidth,innerHeight],renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),rows}
}
async function lifecycle(){const rows=[];for(let cycle=0;cycle<8;cycle++){gallery();render();rows.push({...renderer.info.memory})}return rows}
;(window as any).__six={ready:true,renderer,scene,camera,models,metrics,bench,lifecycle,render,dark,gallery,setAngle:(a:number)=>{angle=a;models.forEach(g=>g.rotation.y=a);render()}}
