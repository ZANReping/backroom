import * as THREE from 'three'
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {gearMaterial} from './npcGearGeometry'
/** Tiny's non-human rig keeps its own proportions; its carried bone weapon shares NPC surface style. */
export function buildNpcBoneSpear(){
 const pieces:THREE.BufferGeometry[]=[]
 const add=(g:THREE.BufferGeometry,color:string,tile:number)=>{
  const uv=g.attributes.uv,c=new THREE.Color(color),colors=new Float32Array(g.attributes.position.count*3)
  for(let i=0;i<uv.count;i++){uv.setXY(i,(tile%4*64+2.5+uv.getX(i)*59)/256,1-(Math.floor(tile/4)*64+2.5+(1-uv.getY(i))*59)/256);colors.set([c.r,c.g,c.b],i*3)}
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(g)
 }
 const shaft=new THREE.CylinderGeometry(.022,.028,2.7,8);shaft.translate(0,.6,0);add(shaft,'#c1b79d',4)
 const blade=new THREE.CylinderGeometry(.001,.051,.48,5);blade.scale(.5,1,1);blade.translate(0,2.17,0);add(blade,'#cfc5ac',2)
 for(let i=0;i<6;i++){const band=new THREE.CylinderGeometry(.033,.034,.026,8);band.translate(0,-.1+i*.03,0);add(band,'#3c403c',1)}
 const geometry=mergeGeometries(pieces,false);for(const p of pieces)p.dispose()
 const root=new THREE.Group();root.name='Tiny fitted bone spear';root.userData.gripX=.055;root.userData.retroNpcProp=true
 root.position.set(.055,-.91,0);root.rotation.z=-1.35
 root.add(new THREE.Mesh(geometry,gearMaterial()));return root
}
