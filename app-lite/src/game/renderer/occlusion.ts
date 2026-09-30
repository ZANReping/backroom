import * as THREE from 'three'

/** An actual opaque, axis-aligned vertical rectangle from the rendered mesh. */
export interface OcclusionWall {
  axis: 'x' | 'z'
  plane: number
  low: number
  high: number
  bottom: number
  top: number
  facing: number
}

/**
 * Perspective projection of a convex box onto one opaque rectangle. Testing all
 * eight corners against the SAME wall is conservative: their convex hull is
 * covered too. Several independently blocked corner rays would not be safe
 * (a doorway between those rays could expose the middle of the object).
 */
export function wallOccludesBox(w: OcclusionWall, box: THREE.Box3, eye: THREE.Vector3): boolean {
  const ea = eye[w.axis], eb = w.axis === 'x' ? eye.z : eye.x
  const amin = box.min[w.axis], amax = box.max[w.axis]
  const bmin = w.axis === 'x' ? box.min.z : box.min.x
  const bmax = w.axis === 'x' ? box.max.z : box.max.x
  const d = w.plane - ea
  if (Math.abs(d) < .02 || (w.facing !== 0 && (ea - w.plane) * w.facing <= .02)) return false
  if (d > 0 ? amin <= w.plane + .02 : amax >= w.plane - .02) return false
  for (let side = 0; side < 2; side++) {
    const a = side === 0 ? amin : amax
    const t = d / (a - ea)
    const b0 = eb + (bmin - eb) * t, b1 = eb + (bmax - eb) * t
    const y0 = eye.y + (box.min.y - eye.y) * t, y1 = eye.y + (box.max.y - eye.y) * t
    if (b0 < w.low + .005 || b1 > w.high - .005 || y0 < w.bottom + .005 || y1 > w.top - .005) return false
  }
  return true
}

/** Extract only complete rectangular triangle pairs; apertures stay apertures. */
export function extractOcclusionWalls(root: THREE.Object3D): OcclusionWall[] {
  root.updateWorldMatrix(true, true)
  const walls: OcclusionWall[] = [], vertices = Array.from({length: 6}, () => new THREE.Vector3())
  const edge = new THREE.Vector3(), normal = new THREE.Vector3(), other = new THREE.Vector3()
  const bounds = new THREE.Box3(), size = new THREE.Vector3(), normalMatrix = new THREE.Matrix3()
  root.traverseVisible(node => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || Array.isArray(mesh.material)) return
    const mat = mesh.material
    if (!mat.visible || mat.transparent || mat.opacity < 1 || mat.alphaTest > 0 || mat.alphaHash || !mat.depthWrite || !mat.depthTest || !mat.colorWrite
      || mat.polygonOffset || mat.stencilWrite || mat.clippingPlanes?.length
      || (mat as THREE.ShaderMaterial).isShaderMaterial
      || (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile && mat.userData.occlusionOpaque !== true)) return
    const geo = mesh.geometry, p = geo.getAttribute('position'), normals = geo.getAttribute('normal'), index = geo.index
    if (!p) return
    normalMatrix.getNormalMatrix(mesh.matrixWorld)
    const count = Math.min(index?.count ?? p.count, geo.drawRange.start + geo.drawRange.count)
    for (let i = geo.drawRange.start; i + 5 < count; i += 6) {
      if(normals){normal.fromBufferAttribute(normals,index?index.getX(i):i).applyMatrix3(normalMatrix);if(Math.abs(normal.y)>.00001)continue}
      for (let j = 0; j < 6; j++) vertices[j].fromBufferAttribute(p, index ? index.getX(i + j) : i + j).applyMatrix4(mesh.matrixWorld)
      bounds.setFromPoints(vertices)
      bounds.getSize(size)
      const axis = size.x < .00001 ? 'x' : size.z < .00001 ? 'z' : null
      if (!axis || size.y < 1 || (axis === 'x' ? size.z : size.x) < .4) continue
      const points = new Set(vertices.map(v => `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`))
      if (points.size !== 4) continue
      // Two equal-area triangles can still overlap and leave a hole. A full
      // rectangle must share its diagonal, never a boundary edge.
      const shared = vertices.slice(0,3).filter(v=>vertices.slice(3).some(other=>v.distanceToSquared(other)<1e-12))
      if(shared.length!==2 || Math.abs(shared[0].y-shared[1].y)<.00001
        || Math.abs(shared[0][axis==='x'?'z':'x']-shared[1][axis==='x'?'z':'x'])<.00001)continue
      const low = axis === 'x' ? bounds.min.z : bounds.min.x, high = axis === 'x' ? bounds.max.z : bounds.max.x
      if (!vertices.every(v => {
        const b = axis === 'x' ? v.z : v.x
        return (Math.abs(b-low)<.00001 || Math.abs(b-high)<.00001) && (Math.abs(v.y-bounds.min.y)<.00001 || Math.abs(v.y-bounds.max.y)<.00001)
      })) continue
      normal.crossVectors(edge.subVectors(vertices[1],vertices[0]),other.subVectors(vertices[2],vertices[0]))
      const area = normal.length() / 2
      const sign = Math.sign(normal[axis])
      normal.crossVectors(edge.subVectors(vertices[4],vertices[3]),other.subVectors(vertices[5],vertices[3]))
      if (Math.sign(normal[axis]) !== sign || Math.abs(area + normal.length()/2 - (high-low)*size.y) > .0001) continue
      walls.push({axis,plane:bounds.min[axis],low,high,bottom:bounds.min.y,top:bounds.max.y,
        facing:mat.side===THREE.DoubleSide?0:mat.side===THREE.BackSide?-sign:sign})
    }
  })
  // Join touching coplanar rectangles only when their complete height matches.
  const groups = new Map<string, OcclusionWall[]>()
  for (const wall of walls) {
    const key = `${wall.axis}:${wall.plane.toFixed(5)}:${wall.bottom.toFixed(5)}:${wall.top.toFixed(5)}:${wall.facing}`
    const group = groups.get(key) ?? []; group.push(wall); groups.set(key,group)
  }
  const merged: OcclusionWall[] = []
  for (const group of groups.values()) {
    group.sort((a,b)=>a.low-b.low)
    let current = {...group[0]}
    for (let i=1;i<group.length;i++) {
      const next=group[i]
      if (next.low <= current.high + .00001) current.high=Math.max(current.high,next.high)
      else {merged.push(current);current={...next}}
    }
    merged.push(current)
  }
  return merged
}

type Candidate = {root: THREE.Object3D; owner: THREE.Object3D; bounds: THREE.Box3; origin: THREE.Vector3; wall?: OcclusionWall; epoch?: number; searchedAt?: THREE.Vector3}
type Record = {terrain: THREE.Object3D; origin: THREE.Vector3; lastPosition: THREE.Vector3; walls: OcclusionWall[]; candidates: Candidate[]}

/** Reuse a result only inside a certified camera volume; moving props invalidate their bounds. */
export class WallOcclusion {
  private records = new Map<THREE.Object3D, Record>()
  private activeWalls: OcclusionWall[] = []
  private box = new THREE.Box3()
  private position = new THREE.Vector3()
  private eye = new THREE.Vector3()
  private eyeCorner = new THREE.Vector3()
  private eyeRange = new THREE.Box3()
  private cacheValid = false
  private wasAllowed = false
  private geometryEpoch = 0
  private candidates = new Map<THREE.Object3D, Candidate>()
  private dirty = new Set<Candidate>()
  private searchQueue = new Set<Candidate>()
  enabled = true
  lastHidden = 0

  register(owner: THREE.Object3D, terrain: THREE.Object3D, roots: THREE.Object3D[]) {
    const candidates = roots.filter(root=>root.visible).map(root => {
      root.updateWorldMatrix(true,true)
      return {root,owner,bounds:new THREE.Box3().setFromObject(root).expandByScalar(.03),origin:root.getWorldPosition(new THREE.Vector3())}
    })
    for(const c of candidates)this.candidates.set(c.root,c)
    const origin=terrain.getWorldPosition(new THREE.Vector3())
    this.records.set(owner,{terrain,origin,lastPosition:origin.clone(),walls:extractOcclusionWalls(terrain),candidates})
    this.cacheValid=false
    // Adding a wall does not invalidate an existing occlusion certificate.
    for(const c of this.candidates.values())if(c.root.visible)this.searchQueue.add(c)
  }

  remove(owner: THREE.Object3D) {
    const rec=this.records.get(owner)
    if(!rec)return
    for(const c of rec.candidates){this.setHidden(c,false);this.candidates.delete(c.root);this.dirty.delete(c);this.searchQueue.delete(c)}
    this.records.delete(owner)
    this.cacheValid=false
    this.geometryEpoch++
  }

  clear() {for(const owner of this.records.keys())this.remove(owner);this.activeWalls=[]}

  changed(root: THREE.Object3D) {
    const c=this.candidates.get(root)
    if(!c)return
    c.bounds.setFromObject(root).expandByScalar(.03)
    root.getWorldPosition(c.origin)
    this.dirty.add(c)
  }

  private setHidden(c: Candidate, hidden: boolean) {
    if(c.root.visible===hidden)this.lastHidden+=hidden?1:-1
    c.root.visible=!hidden
  }

  private candidateBox(c: Candidate) {
    c.root.getWorldPosition(this.position).sub(c.origin)
    this.box.copy(c.bounds).translate(this.position)
  }

  private covers = (wall: OcclusionWall) => {
    if(!wallOccludesBox(wall,this.box,this.eye))return false
    // Certify every corner of the camera movement volume before reusing a result.
    for(let i=0;i<8;i++){
      this.eyeCorner.set(i&1?this.eyeRange.max.x:this.eyeRange.min.x,i&2?this.eyeRange.max.y:this.eyeRange.min.y,i&4?this.eyeRange.max.z:this.eyeRange.min.z)
      if(!wallOccludesBox(wall,this.box,this.eyeCorner))return false
    }
    return true
  }

  update(camera: THREE.Camera, allowed: boolean) {
    if(!this.enabled||!allowed){if(this.wasAllowed)for(const rec of this.records.values())for(const c of rec.candidates)c.root.visible=true;this.wasAllowed=false;this.cacheValid=false;this.lastHidden=0;this.searchQueue.clear();return}
    const started=performance.now()
    this.wasAllowed=true
    camera.getWorldPosition(this.eye)
    for(const rec of this.records.values()){
      rec.terrain.getWorldPosition(this.position)
      if(!rec.lastPosition.equals(this.position)){this.cacheValid=false;this.geometryEpoch++;rec.lastPosition.copy(this.position)}
    }
    const reuse=this.cacheValid&&this.eyeRange.containsPoint(this.eye)
    if(reuse&&!this.dirty.size&&!this.searchQueue.size)return
    if(!reuse){
      this.eyeRange.min.copy(this.eye).addScalar(-.2);this.eyeRange.max.copy(this.eye).addScalar(.2)
      this.cacheValid=true
      this.activeWalls.length=0
      for(const rec of this.records.values()) {
      rec.terrain.getWorldPosition(this.position).sub(rec.origin)
      for(const w of rec.walls) {
        const wall={...w,plane:w.plane+this.position[w.axis],low:w.low+(w.axis==='x'?this.position.z:this.position.x),high:w.high+(w.axis==='x'?this.position.z:this.position.x),bottom:w.bottom+this.position.y,top:w.top+this.position.y}
        if(wall.facing!==0&&(this.eye[wall.axis]-wall.plane)*wall.facing<=.02)continue
        if(Math.abs(this.eye[wall.axis]-wall.plane)>60)continue
        this.activeWalls.push(wall)
      }
      }
      this.activeWalls.sort((a,b)=>Math.abs(this.eye[a.axis]-a.plane)-Math.abs(this.eye[b.axis]-b.plane))
    }
    for(const [owner,rec] of this.records)for(const c of rec.candidates){
      if(reuse&&!this.dirty.has(c))continue
      if(!owner.visible){this.setHidden(c,false);this.searchQueue.delete(c);continue}
      this.candidateBox(c)
      if(c.epoch===this.geometryEpoch&&c.wall&&this.covers(c.wall)) {
        this.setHidden(c,true);this.searchQueue.delete(c)
      } else {
        // Restore immediately when the previous wall no longer proves coverage.
        // Searching for a NEW wall may wait; restoring visibility never waits.
        this.setHidden(c,false);c.wall=undefined
        if(this.dirty.has(c)||c.epoch!==this.geometryEpoch||!c.searchedAt||c.searchedAt.distanceToSquared(this.eye)>.75*.75)this.searchQueue.add(c)
      }
    }
    this.dirty.clear()
    // Negative searches dominated walking spikes in densely furnished rooms.
    // Spend at most a soft 1 ms per frame finding new occluders. Pending objects
    // remain visible; only proven coverage can hide one.
    for(const c of this.searchQueue) {
      if(performance.now()-started>=1)break
      this.searchQueue.delete(c)
      if(!c.owner.visible)continue
      this.candidateBox(c)
      c.wall=this.activeWalls.find(this.covers);c.epoch=this.geometryEpoch
      ;(c.searchedAt??=new THREE.Vector3()).copy(this.eye)
      this.setHidden(c,!!c.wall)
    }
  }
}
