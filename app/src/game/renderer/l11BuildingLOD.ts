import * as THREE from 'three'
import { bounds } from '../world/l11Geometry'
import type { L11Building } from '../world/l11Types'

/** A long building must retain its bays while the player is beside any face.
 * THREE's origin distance would simplify a 116m block while standing at its door. */
export class L11BuildingLOD extends THREE.LOD {
  private envelope:THREE.Box3
  private eye=new THREE.Vector3()
  private active=0
  constructor(building:L11Building){
    super()
    const b=bounds(building.localFootprint)
    this.envelope=new THREE.Box3(new THREE.Vector3(b.x,0,b.y),new THREE.Vector3(b.x+b.w,building.floors*3,b.y+b.h))
  }
  override update(camera:THREE.Camera){
    camera.getWorldPosition(this.eye);this.worldToLocal(this.eye)
    const distance=this.envelope.distanceToPoint(this.eye)/(camera as THREE.PerspectiveCamera).zoom
    let index=0
    for(let i=1;i<this.levels.length;i++){
      const level=this.levels[i],threshold=level.distance*(level.object.visible?1-level.hysteresis:1)
      if(distance<threshold)break
      index=i
    }
    for(let i=0;i<this.levels.length;i++)this.levels[i].object.visible=i===index
    this.active=index
  }
  override getCurrentLevel(){return this.active}
}
