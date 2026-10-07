import * as THREE from 'three'
import {PhotoPass,PhotoRenderPass} from '../src/game/renderer/photoPass'

/** Real GPU regression: an unoccluded oblique plane must not develop AO stripes. */
export function verifyPhotoAO(renderer:THREE.WebGLRenderer){
 const target=renderer.getRenderTarget(),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),auto=renderer.autoClear
 const rows:{quality:number;width:number;height:number;angle:number;flatMean:number;flatP99:number;contactMax:number;contactPixels:number}[]=[]
 try{
  for(const quality of [1,2])for(const [width,height,angle]of [[640,480,.55],[641,479,-.65]]){
   const camera=new THREE.PerspectiveCamera(65,width/height,.05,100),scene=new THREE.Scene(),mat=new THREE.MeshBasicMaterial({color:'white',side:THREE.DoubleSide})
   const wall=new THREE.Mesh(new THREE.PlaneGeometry(40,40),mat);wall.position.z=-4;wall.rotation.y=angle;scene.add(wall)
   const read=new THREE.WebGLRenderTarget(width,height),write=new THREE.WebGLRenderTarget(width,height),photo=new PhotoPass(camera),beauty=new PhotoRenderPass(scene,camera,photo)
   photo.quality=quality;photo.setSize(width,height)
   const sample=()=>{beauty.render(renderer,write,read,0,false);photo.render(renderer,write,read);const pixels=new Uint8Array(photo.aoTarget.width*photo.aoTarget.height*4);renderer.readRenderTargetPixels(photo.aoTarget,0,0,photo.aoTarget.width,photo.aoTarget.height,pixels);const values:number[]=[];for(let y=8;y<photo.aoTarget.height-8;y++)for(let x=8;x<photo.aoTarget.width-8;x++)values.push(pixels[(y*photo.aoTarget.width+x)*4]);values.sort((a,b)=>a-b);return values}
   try{
    const flat=sample(),occluder=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.4,1.4),mat);occluder.position.set(0,0,-3.6);scene.add(occluder)
    const contact=sample();occluder.geometry.dispose()
    const row={quality,width,height,angle,flatMean:flat.reduce((a,b)=>a+b,0)/flat.length,flatP99:flat[Math.floor(flat.length*.99)],contactMax:contact[contact.length-1],contactPixels:contact.filter(v=>v>4).length};rows.push(row)
    if(row.flatMean>.75||row.flatP99>3)throw Error('False AO on flat plane: '+JSON.stringify(row))
    if(row.contactMax<8||row.contactPixels<20)throw Error('AO contact shadow disappeared: '+JSON.stringify(row))
   }finally{wall.geometry.dispose();mat.dispose();photo.dispose();beauty.dispose();read.dispose();write.dispose()}
  }
 }finally{renderer.setRenderTarget(target);renderer.setClearColor(clear,alpha);renderer.autoClear=auto}
 return{pass:true,rows,halation:verifyLampHalation(renderer)}
}

/** HDR-only halo must stay next to the emitter and leave a flat image alone. */
function verifyLampHalation(renderer:THREE.WebGLRenderer){
 const previous=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha()
 const size=128,camera=new THREE.PerspectiveCamera(65,1,.05,100),scene=new THREE.Scene()
 const material=new THREE.MeshBasicMaterial({color:new THREE.Color(2,2,2),toneMapped:false}),lamp=new THREE.Mesh(new THREE.PlaneGeometry(.16,.16),material);lamp.position.z=-2;scene.add(lamp)
 const input=new THREE.WebGLRenderTarget(size,size,{type:THREE.HalfFloatType}),output=new THREE.WebGLRenderTarget(size,size),photo=new PhotoPass(camera)
 photo.quality=0;photo.setSize(size,size)
 try{
  renderer.setClearColor(new THREE.Color(.025,.025,.025),1);renderer.setRenderTarget(input);renderer.render(scene,camera)
  const read=(gain:number)=>{photo.material.uniforms.halation.value=gain;photo.render(renderer,output,input);const data=new Uint8Array(size*size*4);renderer.readRenderTargetPixels(output,0,0,size,size,data);return data}
  const clear=read(0),halo=read(.075);let changed=0,farChanged=0,maxDifference=0
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,d=halo[i]-clear[i];if(d>0){changed++;if(Math.hypot(x-size/2,y-size/2)>16)farChanged++}maxDifference=Math.max(maxDifference,d)}
  lamp.visible=false;renderer.setRenderTarget(input);renderer.render(scene,camera)
  const flatA=read(0),flatB=read(.075),flatDifference=Math.max(...flatA.map((v,i)=>Math.abs(v-flatB[i])))
  if(changed<4||maxDifference<1||farChanged||flatDifference)throw Error('Unbounded or inactive lamp halo: '+JSON.stringify({changed,farChanged,maxDifference,flatDifference}))
  return{changed,farChanged,maxDifference,flatDifference}
 }finally{photo.dispose();input.dispose();output.dispose();lamp.geometry.dispose();material.dispose();renderer.setRenderTarget(previous);renderer.setClearColor(color,alpha)}
}
