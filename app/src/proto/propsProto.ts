import '../game/renderer/renderer'
import * as THREE from 'three'
import {buildL1Prop} from '../game/renderer/l1Props'
try{
const r=new THREE.WebGLRenderer({antialias:true});r.setSize(1440,810);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.ACESFilmicToneMapping;document.body.append(r.domElement)
const s=new THREE.Scene();s.background=new THREE.Color('#3a3c3a')
s.add(new THREE.HemisphereLight('#f4f2ea','#4a4a44',1.3));const d=new THREE.DirectionalLight('#fff8ec',2.2);d.position.set(3,6,5);s.add(d)
const fl=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.MeshStandardMaterial({color:'#77786f',roughness:.9}));fl.rotation.x=-Math.PI/2;s.add(fl)
const kinds=new URLSearchParams(location.search).get('k')?.split(',')??['foldingtable','seat','panel','louver','extinguisher','paintcan','caution','crate']
kinds.forEach((k,i)=>{const o=buildL1Prop({kind:'crate',x:(i%4)*1.7-3.4,y:Math.floor(i/4)*1.5-2.2,w:1,h:1,solid:false,data:{l1Prop:k,deg:k==='caution'?35:k==='seat'?160:200}} as any);if(o)s.add(o)})
const cam=new THREE.PerspectiveCamera(40,1440/810,.05,100);cam.position.set(0,2.4,4.6);cam.lookAt(0,.4,-1.1)
r.render(s,cam);setTimeout(()=>{r.render(s,cam);(window as any).__ready=true},1500)
}catch(e){(window as any).__err=String(e)}
