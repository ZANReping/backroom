import * as THREE from 'three'
import {l3NarrowProfile} from '../world/l3NarrowProfile'

export function l3NarrowPortal(x:number,z:number,direction:number){
  const pts=l3NarrowProfile().map(([px,py])=>[x+.5+px,py])
  // A single notched outline avoids the degenerate hole touching the bottom
  // edge. Its full thickness belongs to the narrow tile, not the public hall.
  const outline=[[x-.15,0],[x-.15,3.25],[x+1.15,3.25],[x+1.15,0],...pts.reverse()]
  const frame=new THREE.Shape(outline.map(([px,py])=>new THREE.Vector2(px,py)))
  const geometry=new THREE.ExtrudeGeometry(frame,{depth:.14,bevelEnabled:false})
  geometry.translate(0,0,direction>0?z+.86:z)
  return geometry
}
