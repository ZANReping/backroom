import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

type Lamp={x:number;y:number;round:boolean;width?:number;depth?:number}
type Parts={frame:THREE.BufferGeometry[];recess:THREE.BufferGeometry[];diffuser:THREE.BufferGeometry[]}

function place(g:THREE.BufferGeometry,x:number,y:number,z:number){
 g.translate(x,y,z)
 return g
}

/** Creates the low-poly fixture pieces; callers own and dispose every geometry. */
export function buildL0FixtureParts(lamp:Lamp,ceilingHeight:number):Parts{
 const out:Parts={frame:[],recess:[],diffuser:[]}
 const cx=lamp.x,cz=lamp.y,bottom=ceilingHeight-.05
 if(lamp.round){
  const ring=new THREE.TorusGeometry(.151,.018,4,12);ring.rotateX(Math.PI/2)
  out.frame.push(place(ring,cx,bottom,cz))
  out.recess.push(place(new THREE.CylinderGeometry(.133,.133,.012,12),cx,bottom+.026,cz))
  out.diffuser.push(place(new THREE.CylinderGeometry(.123,.123,.012,12),cx,bottom+.008,cz))
  return out
 }
 const w=(lamp.width??1.2)*.875,d=lamp.depth??.6,b=.010
 const barH=.014,barY=bottom+.005
 // Thin flush trim only; the suspended black housing has been removed.
 for(const [x,z,bw,bd]of [[cx,cz-d/2+b/2,w,b],[cx,cz+d/2-b/2,w,b],[cx-w/2+b/2,cz,b,d-2*b],[cx+w/2-b/2,cz,b,d-2*b]] as const)
  out.frame.push(place(new THREE.BoxGeometry(bw,barH,bd),x,barY,z))
 // A shallow, non-emissive reflector/recess behind the tubes.
 out.recess.push(place(new RoundedBoxGeometry(w-2*b,barH*.25,d-2*b,1,.004),cx,bottom+.028,cz))
 // Four parallel fluorescent tubes along the long axis. The diffuser list is
 // deliberately limited to these four visible emitters; the grille is frame geometry.
 const tubeLength=Math.max(.2,w-2*b-.12), tubeRadius=Math.min(.022,Math.max(.012,d*.0367))
 const tubeZ=[-.165,-.055,.055,.165].map(v=>cz+v*(d/.6))
 for(const z of tubeZ){
  const tube=new THREE.CylinderGeometry(tubeRadius,tubeRadius,tubeLength,6)
  tube.rotateZ(Math.PI/2)
  out.diffuser.push(place(tube,cx,bottom-.018,z))
  for(const x of [cx-tubeLength/2+.025,cx+tubeLength/2-.025])
   out.frame.push(place(new THREE.BoxGeometry(.028,.035,.065),x,bottom-.018,z))
 }
 // Six thin cross slats form a shallow square grille without covering the lamps.
 for(let i=1;i<=6;i++){
  const x=cx-tubeLength/2+(tubeLength*i/7)
   out.frame.push(place(new THREE.BoxGeometry(.012,.012,d-2*b-.025),x,bottom-.050,cz))
 }
 return out
}
