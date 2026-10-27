import * as THREE from 'three'
import { getReflectK } from './shared'
import { isMirrorSurface, mirrorCapture, type MirrorMesh, type MirrorSpec } from './mirrorSurface'

export interface MirrorQuality { size: number; planes: number; hz: number; distance: number }
export function mirrorQuality(quality: number, mobile = false): MirrorQuality {
  return mobile || quality <= 0 ? { size: 256, planes: 1, hz: 15, distance: 18 }
    : quality >= 2 ? { size: 1024, planes: 2, hz: 60, distance: 40 }
    : { size: 512, planes: 2, hz: 30, distance: 28 }
}
interface Candidate { mesh: MirrorMesh; position: THREE.Vector3; normal: THREE.Vector3; plane: THREE.Plane; score: number }
interface PlaneGroup { plane: THREE.Plane; meshes: Candidate[]; score: number }
interface CaptureSlot {
  target: THREE.WebGLRenderTarget; camera: THREE.PerspectiveCamera; plane: THREE.Plane;
  matrix: THREE.Matrix4; eye: THREE.Vector3; rotation: THREE.Quaternion; lens: string;
  updated: number; seen: number; valid: boolean; members: Set<MirrorMesh>
}
const bias = new THREE.Matrix4().set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1)
const samePlane = (a: THREE.Plane, b: THREE.Plane) => a.normal.dot(b.normal) > .99999 && Math.abs(a.constant - b.constant) < .015

/** Reflected eye/up and an oblique near plane, as in Three.js Reflector (MIT).
 * The source camera's first-person children are deliberately never cloned. */
export function mirrorCamera(source: THREE.PerspectiveCamera, plane: THREE.Plane, target: THREE.PerspectiveCamera, matrix: THREE.Matrix4, aperture?: THREE.Vector3[]): boolean {
  source.updateWorldMatrix(true, false)
  const eye = source.getWorldPosition(new THREE.Vector3())
  if (plane.distanceToPoint(eye) <= .025) return false
  const reflectPoint = (v: THREE.Vector3) => v.addScaledVector(plane.normal, -2 * plane.distanceToPoint(v))
  target.position.copy(reflectPoint(eye.clone()))
  const rotation = source.getWorldQuaternion(new THREE.Quaternion())
  const toward = reflectPoint(eye.clone().add(new THREE.Vector3(0,0,-1).applyQuaternion(rotation)))
  target.up.set(0,1,0).applyQuaternion(rotation).reflect(plane.normal)
  target.lookAt(toward); target.near = source.near; target.far = source.far
  target.layers.mask = source.layers.mask
  target.updateMatrixWorld(true)
  target.projectionMatrix.copy(source.projectionMatrix)
  // Crop the capture to the real mirror aperture. Projective lookup compensates
  // the crop, avoiding a full-FOV extra world view for small mirrors.
  if(aperture?.length){
    const vp=new THREE.Matrix4().multiplyMatrices(target.projectionMatrix,target.matrixWorldInverse)
    let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity
    for(const point of aperture){const v=new THREE.Vector4(point.x,point.y,point.z,1).applyMatrix4(vp);if(v.w<=.0001)continue;const x=v.x/v.w,y=v.y/v.w;left=Math.min(left,x);right=Math.max(right,x);bottom=Math.min(bottom,y);top=Math.max(top,y)}
    left=Math.max(-1.01,left-.005);right=Math.min(1.01,right+.005);bottom=Math.max(-1.01,bottom-.005);top=Math.min(1.01,top+.005)
    if(right-left>.0001&&top-bottom>.0001){const sx=2/(right-left),sy=2/(top-bottom);target.projectionMatrix.premultiply(new THREE.Matrix4().set(sx,0,0,-(right+left)/(right-left),0,sy,0,-(top+bottom)/(top-bottom),0,0,1,0,0,0,0,1))}
  }
  // Project the original plane before oblique clipping (x/y/w are unaffected by clipping).
  matrix.copy(bias).multiply(target.projectionMatrix).multiply(target.matrixWorldInverse)
  const clip = plane.clone().applyMatrix4(target.matrixWorldInverse)
  const c = new THREE.Vector4(clip.normal.x, clip.normal.y, clip.normal.z, clip.constant)
  const p = target.projectionMatrix.elements
  const q = new THREE.Vector4((Math.sign(c.x)+p[8])/p[0], (Math.sign(c.y)+p[9])/p[5], -1, (1+p[10])/p[14])
  const denominator = c.dot(q)
  if (Math.abs(denominator) < 1e-8) return false
  c.multiplyScalar(2/denominator)
  p[2]=c.x; p[6]=c.y; p[10]=c.z+1-.0003; p[14]=c.w
  target.projectionMatrixInverse.copy(target.projectionMatrix).invert()
  return true
}

/** All actual mirror models share a strictly bounded reflection pool. Coplanar panes
 * share one view; at most one additional world draw is submitted in a main frame. */
export class SceneMirrors {
  private meshes: MirrorMesh[] = []
  private slots: CaptureSlot[] = []
  private scanAt = -Infinity
  private mapKey: unknown = null
  private sightCache = new WeakMap<MirrorMesh,{eye:THREE.Vector3;point:THREE.Vector3;at:number;value:boolean}>()
  private tier = ''
  private tick = 0
  private frustum = new THREE.Frustum()
  private sphere = new THREE.Sphere()
  private viewProjection = new THREE.Matrix4()
  readonly stats = { surfaces: 0, visible: 0, planes: 0, targets: 0, updates: 0, framePasses: 0, calls: 0, triangles: 0, cpuMs: 0, size: 0 }

  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, now: number,
    quality: number, mobile: boolean, mapKey: unknown, enabled: boolean,
    beforeCapture: () => (() => void), visibleTest?: (mesh:MirrorMesh, point:THREE.Vector3, normal:THREE.Vector3)=>boolean) {
    this.stats.framePasses = this.stats.calls = this.stats.triangles = this.stats.cpuMs = 0
    if (this.mapKey !== mapKey) { this.clear(); this.mapKey = mapKey }
    if (now - this.scanAt > .2) {
      const previous = new Set(this.meshes); this.meshes = []
      scene.traverse(o => { if (isMirrorSurface(o)) { this.meshes.push(o); previous.delete(o) } })
      for (const mesh of previous) this.unbind(mesh)
      this.scanAt = now; this.stats.surfaces = this.meshes.length
    }
    const q = mirrorQuality(quality, mobile), key = `${q.size}/${q.planes}`
    if (key !== this.tier) { this.releaseSlots(); this.tier = key }
    this.stats.size = q.size
    camera.updateWorldMatrix(true,false)
    this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.viewProjection)
    const eye = camera.getWorldPosition(new THREE.Vector3()), groups: PlaneGroup[] = []
    let visible = 0
    for (const mesh of this.meshes) {
      const u = mesh.material.uniforms
      u.reflectionStrength.value = Math.min(1.1, Math.max(0, getReflectK()))
      u.surfaceQuality.value = q.size>256?1:0
      const spec = mesh.userData.planarMirror as MirrorSpec
      if (!enabled || getReflectK() <= .001 || !this.visibleInScene(mesh, scene, !!spec.overlay)) continue
      mesh.updateWorldMatrix(true,false)
      const position = mesh.getWorldPosition(new THREE.Vector3())
      const normal = new THREE.Vector3(0,0,1).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)).normalize()
      // Tall sealed facades must be eligible beside their lower panes, even if
      // the facade origin is fifty metres above the street.
      if(spec.overlay){
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox()
        const local=mesh.worldToLocal(eye.clone())
        mesh.geometry.boundingBox!.clampPoint(local,local)
        position.copy(local.applyMatrix4(mesh.matrixWorld))
      }
      const delta = eye.clone().sub(position), distance = delta.length()
      if (distance > q.distance || delta.dot(normal) <= .025) continue
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
      this.sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld)
      if (!this.frustum.intersectsSphere(this.sphere)) continue
      if(visibleTest&&spec.kind==='silver'&&distance>3){
        let cached=this.sightCache.get(mesh)
        if(!cached||now-cached.at>.25||cached.eye.distanceToSquared(eye)>.04||cached.point.distanceToSquared(position)>.01){cached={eye:eye.clone(),point:position.clone(),at:now,value:visibleTest(mesh,position,normal)};this.sightCache.set(mesh,cached)}
        if(!cached.value)continue
      }
      const projected = Math.min(2, spec.width*spec.height * Math.max(.025,delta.dot(normal)/Math.max(.01,distance)) / Math.max(.25,distance*distance))
      if (projected < .00022) continue
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal,position)
      const score = projected*(spec.kind==='silver'?6:1)/(1+distance*.05), candidate: Candidate = {mesh,position,normal,plane,score}
      let group = groups.find(g=>samePlane(g.plane,plane))
      if (!group) { group={plane,meshes:[],score:0};groups.push(group) }
      group.meshes.push(candidate);group.score+=score;visible++
    }
    this.stats.visible = visible
    groups.sort((a,b)=>b.score-a.score)
    const chosen = groups.slice(0,q.planes), used = new Set<CaptureSlot>()
    const assignments: { slot: CaptureSlot; group: PlaneGroup; urgency: number }[] = []
    for (const group of chosen) {
      let slot = this.slots.find(s=>!used.has(s)&&samePlane(s.plane,group.plane))
      if (!slot) slot = this.slots.find(s=>!used.has(s)&&!chosen.some(g=>samePlane(s.plane,g.plane)))
      if (!slot && this.slots.length < q.planes) {
        slot={target:new THREE.WebGLRenderTarget(q.size,q.size,{type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false,samples:0}),
          camera:new THREE.PerspectiveCamera(),plane:group.plane.clone(),matrix:new THREE.Matrix4(),eye:new THREE.Vector3(),rotation:new THREE.Quaternion(),
          lens:'',updated:-Infinity,seen:now,valid:false,members:new Set()}
        slot.target.texture.name='bounded-scene-mirror'; slot.camera.name='mirror-camera'; this.slots.push(slot)
      }
      if (!slot) continue
      if (!samePlane(slot.plane,group.plane)) { this.resetSlot(slot);slot.plane.copy(group.plane) }
      slot.seen=now;used.add(slot)
      const lens=camera.projectionMatrix.elements.join(',')
      const moved=slot.eye.distanceToSquared(eye)>.001**2||slot.rotation.angleTo(camera.quaternion)>.0005||slot.lens!==lens
      const onlyWindows=group.meshes.every(({mesh})=>(mesh.userData.planarMirror as MirrorSpec).kind==='blackglass')
      const refresh=onlyWindows?Math.min(15,q.hz):moved?q.hz:Math.min(15,q.hz)
      const urgency=!slot.valid?1e9:now-slot.updated>=1/refresh ? (moved?10:1)*(now-slot.updated):0
      assignments.push({slot,group,urgency})
    }
    const activeMeshes=new Set(chosen.flatMap(g=>g.meshes.map(c=>c.mesh)))
    for (const slot of this.slots) for (const mesh of slot.members) if (!activeMeshes.has(mesh)) { this.unbind(mesh);slot.members.delete(mesh) }
    this.stats.planes=assignments.length
    // Limit to one capture per rendered frame even on first sight / opposing mirrors.
    const work=assignments.filter(a=>a.urgency>0).sort((a,b)=>b.urgency-a.urgency)[0]
    if (work) this.capture(renderer,scene,camera,work.slot,work.group,now,beforeCapture)
    for (const {slot,group} of assignments) {
      for (const {mesh} of group.meshes) {
        slot.members.add(mesh)
        const u=mesh.material.uniforms
        u.reflectedScene.value=slot.target.texture;u.captureMatrix.value=slot.matrix;u.reflectionReady.value=slot.valid?1:0
        if ((mesh.userData.planarMirror as MirrorSpec).overlay) mesh.visible=slot.valid
      }
    }
    for (let i=this.slots.length-1;i>=0;i--) if (now-this.slots[i].seen>1) { this.disposeSlot(this.slots[i]);this.slots.splice(i,1) }
    this.stats.targets=this.slots.length
    this.tick++
  }

  private visibleInScene(mesh: THREE.Object3D, scene: THREE.Scene, overlay=false) {
    let current: THREE.Object3D|null=overlay?mesh.parent:mesh
    while(current){if(!current.visible)return false;if(current===scene)return true;current=current.parent}
    return false
  }
  private capture(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, slot: CaptureSlot, group: PlaneGroup, now: number, prepare: ()=>(()=>void)) {
    const aperture:THREE.Vector3[]=[]
    for(const {mesh} of group.meshes){if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox!;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])aperture.push(new THREE.Vector3(x,y,0).applyMatrix4(mesh.matrixWorld))}
    if(!mirrorCamera(camera,slot.plane,slot.camera,slot.matrix,aperture))return
    const started=performance.now(),restore=prepare(),hidden:THREE.Object3D[]=[]
    const target=renderer.getRenderTarget(),face=renderer.getActiveCubeFace(),mip=renderer.getActiveMipmapLevel()
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),test=renderer.getScissorTest()
    const xr=renderer.xr.enabled,auto=renderer.shadowMap.autoUpdate,needs=renderer.shadowMap.needsUpdate
    const info=renderer.info.autoReset
    try {
      // One bounce, including other mirrors' neutral coating, with no feedback into the sampled target.
      for(const mesh of this.meshes)if(mesh.visible){mesh.visible=false;hidden.push(mesh)}
      renderer.xr.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=false
      renderer.info.autoReset=false
      const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles
      renderer.setRenderTarget(slot.target);renderer.setScissorTest(false);renderer.clear()
      mirrorCapture(()=>renderer.render(scene,slot.camera))
      this.stats.calls=renderer.info.render.calls-calls;this.stats.triangles=renderer.info.render.triangles-triangles
      this.stats.framePasses=1;this.stats.updates++;slot.valid=true;slot.updated=now
      camera.getWorldPosition(slot.eye);camera.getWorldQuaternion(slot.rotation);slot.lens=camera.projectionMatrix.elements.join(',')
    } finally {
      for(const mesh of hidden)mesh.visible=true
      renderer.xr.enabled=xr;renderer.shadowMap.autoUpdate=auto;renderer.shadowMap.needsUpdate=needs;renderer.info.autoReset=info
      renderer.setRenderTarget(target,face,mip);renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(test)
      restore();this.stats.cpuMs=performance.now()-started
    }
  }
  private unbind(mesh: MirrorMesh) { const u=mesh.material.uniforms;u.reflectionReady.value=0;u.reflectedScene.value=null;if((mesh.userData.planarMirror as MirrorSpec).overlay)mesh.visible=false }
  private resetSlot(slot: CaptureSlot) { for(const mesh of slot.members)this.unbind(mesh);slot.members.clear();slot.valid=false }
  private disposeSlot(slot: CaptureSlot) { this.resetSlot(slot);slot.target.dispose() }
  private releaseSlots(){for(const slot of this.slots)this.disposeSlot(slot);this.slots=[];this.stats.targets=0}
  clear(){this.releaseSlots();for(const mesh of this.meshes)this.unbind(mesh);this.meshes=[];this.sightCache=new WeakMap();this.scanAt=-Infinity;this.mapKey=null;this.stats.surfaces=this.stats.visible=this.stats.planes=0}
}
