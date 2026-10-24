// 批发市场 v2 新物品一排预览：生产 buildItemMesh（含 refined market 图集），无光晕底座。?ids=a,b&view=front|top
import '../game/renderer/renderer'
import * as THREE from 'three'
import {buildItemMesh} from '../game/renderer/itemsMesh'
const W=window as unknown as Record<string,unknown>,q=new URLSearchParams(location.search)
try{
 const ids=(q.get('ids')??'memoryjuice,laughrepellent,babelbalm,outdoorkit,traumakit,saltbox').split(',')
 const scene=new THREE.Scene();scene.background=new THREE.Color('#3a3631')
 const r=new THREE.WebGLRenderer({antialias:true});r.setSize(innerWidth,innerHeight);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(r.domElement)
 scene.add(new THREE.HemisphereLight('#fff6ea','#4a443c',2.2));const d=new THREE.DirectionalLight('#ffffff',2.4);d.position.set(1,2,2);scene.add(d)
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(6,3),new THREE.MeshLambertMaterial({color:'#6a645a'}));floor.rotation.x=-Math.PI/2;scene.add(floor)
 const gap=.34,x0=-(ids.length-1)*gap/2
 ids.forEach((id,i)=>{const g=buildItemMesh(id,{halo:false} as never) as THREE.Object3D;const b=new THREE.Box3().setFromObject(g);g.position.x=x0+i*gap-(b.min.x+b.max.x)/2;g.position.z=-(b.min.z+b.max.z)/2;g.position.y-=b.min.y;g.rotation.y=Number(q.get('rot')??-.35);scene.add(g)})
 const cam=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.01,20)
 if(q.get('view')==='top'){cam.position.set(0,1.3,.9)}else cam.position.set(0,.55,2.1);cam.lookAt(0,.08,0)
 let n=0;const tick=()=>{r.render(scene,cam);if(++n===30)W.__ready=true;requestAnimationFrame(tick)};setTimeout(tick,3000)
}catch(e){W.__err=String((e as Error).stack??e);console.error(e)}
