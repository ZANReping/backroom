import * as THREE from 'three'
import {l4Material} from './l4Materials'

const wood=new THREE.MeshStandardMaterial({color:'#59432e',roughness:.86})
const worn=new THREE.MeshStandardMaterial({color:'#796044',roughness:.92})
const dark=new THREE.MeshBasicMaterial({color:'#08090a'})
/** A closed shaft, with every tread inside the actual three-tile floor opening. */
export function buildL4OldStairs(){
  const g=new THREE.Group();g.name='l4-classical-stair-exit'
  const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat:THREE.Material)=>{
    const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat)
    m.position.set(x,y,z);m.castShadow=mat!==dark;m.receiveShadow=true;g.add(m);return m
  }
  const wall=l4Material('wall'),edge=l4Material('trim')
  for(const x of [-.54,.54]){
    box(.08,3.8,3,x,-1.9,-2,wall)
    box(.09,.05,3,x,.025,-2,wood)
    box(.07,.07,2.98,x,.90,-2,worn)
    for(let i=0;i<9;i++){
      const z=-.57-i*.355
      box(.04,.85,.04,x,.445,z,wood)
      box(.073,.12,.073,x,.49,z,worn)
    }
    for(const z of [-.55,-3.44]){
      box(.105,.98,.105,x,.49,z,wood)
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.065,8,6),worn);cap.position.set(x,1.005,z);g.add(cap)
    }
    // Sloping stringers support the tread ends below the landing rail.
    const stringer=box(.06,.17,Math.hypot(2.6,3.2),x*.85,-1.69,-1.8,wood)
    stringer.rotation.x=-Math.atan2(3.2,2.6)
  }
  for(let i=0;i<13;i++){
    const z=-.6-i*.2,top=-(i+.5)*3.2/13
    const tread=box(.96,.075,.204,0,top-.0375,z,i===6?wood:worn);tread.name='l4-oldstairs-tread'
    box(.96,3.2/13,.025,0,top-3.2/26,z-.09,wood)
    box(.92,.008,.022,0,top+.004,z+.08,edge)
  }
  box(.99,.09,.40,0,-3.245,-3.3,wood)
  box(1.16,.07,.07,0,.90,-3.46,worn)
  for(const x of [-.3,0,.3])box(.04,.85,.04,x,.445,-3.46,wood)
  box(1.08,3.8,.06,0,-1.9,-3.51,wall)
  box(1,.03,3.05,0,-3.8,-2,dark)
  return g
}
