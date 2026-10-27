import * as THREE from 'three'
import { levelTexture } from './shared'

function mirrorFinish() {
  const texture=levelTexture('mirrors/surface.png',()=>{
    if(typeof document!=='undefined'){
      const c=document.createElement('canvas');c.width=c.height=2
      const ctx=c.getContext('2d')!;ctx.fillStyle='rgb(128,128,24)';ctx.fillRect(0,0,2,2)
      return new THREE.CanvasTexture(c)
    }
    const t=new THREE.DataTexture(new Uint8Array([128,128,24,255]),1,1);t.needsUpdate=true;return t
  })
  texture.colorSpace=THREE.NoColorSpace;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
  texture.generateMipmaps=true
  return texture
}

export type MirrorKind = 'silver' | 'blackglass'
export interface MirrorSpec { width: number; height: number; kind: MirrorKind; overlay?: boolean }
export type MirrorMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>

/** Local XY plane, +Z front. Keep this surface separate from static material batches. */
export function mirrorSurface(width: number, height: number, kind: MirrorKind = 'silver', geometry: THREE.BufferGeometry = new THREE.PlaneGeometry(width, height)): MirrorMesh {
  const material = new THREE.ShaderMaterial({
    name: 'scene-mirror-' + kind,
    uniforms: {
      reflectedScene: { value: null }, captureMatrix: { value: new THREE.Matrix4() },
      reflectionReady: { value: 0 }, reflectionStrength: { value: 1 },
      glass: { value: kind === 'blackglass' ? 1 : 0 }, overlay: { value: 0 },
      surfaceMap: { value: mirrorFinish() }, surfaceScale: { value: new THREE.Vector2(width/1.15,height/.85) },
      surfaceQuality: { value: 1 },
    },
    vertexShader: `varying vec4 vReflection;varying vec3 vNormal;varying vec3 vView;varying vec2 vSurface;varying vec2 vEdge;
      uniform mat4 captureMatrix;uniform vec2 surfaceScale;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){vec4 world=modelMatrix*vec4(position,1.);vReflection=captureMatrix*world;vSurface=uv*surfaceScale;vEdge=uv;
        vec4 view=modelViewMatrix*vec4(position,1.);vView=-view.xyz;vNormal=normalize(normalMatrix*normal);
        gl_Position=projectionMatrix*view;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform sampler2D reflectedScene;uniform sampler2D surfaceMap;uniform float surfaceQuality;uniform float reflectionReady;uniform float reflectionStrength;uniform float glass;uniform float overlay;
      varying vec4 vReflection;varying vec3 vNormal;varying vec3 vView;varying vec2 vSurface;varying vec2 vEdge;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec3 base=mix(vec3(.055,.061,.063),vec3(.006,.008,.011),glass);
        float opacity=1.-overlay;
        vec2 uv=vReflection.xy/max(vReflection.w,.00001);
        if(reflectionReady>.5&&vReflection.w>0.&&all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){
          vec3 finish=texture2D(surfaceMap,vSurface).rgb;
          float wipe=clamp(finish.b*1.6,0.,1.);
          // A lightly worn silver backing, not frosted glass: subpixel normal
          // variation and a compact roughness lobe retain readable faces and silhouettes.
          uv=clamp(uv+(finish.rg-.5)*mix(.0009,.0005,glass),vec2(.001),vec2(.999));
          float radius=mix(.0011,.0015,glass)+wipe*.0022;
          vec2 dx=vec2(radius,0.),dy=vec2(0.,radius);
          vec3 reflected=texture2D(reflectedScene,uv).rgb*.30;
          reflected+=(texture2D(reflectedScene,clamp(uv+dx,vec2(0.),vec2(1.))).rgb+texture2D(reflectedScene,clamp(uv-dx,vec2(0.),vec2(1.))).rgb+texture2D(reflectedScene,clamp(uv+dy,vec2(0.),vec2(1.))).rgb+texture2D(reflectedScene,clamp(uv-dy,vec2(0.),vec2(1.))).rgb)*.175;
          if(surfaceQuality>.5){
            reflected*=.7;
            reflected+=(texture2D(reflectedScene,clamp(uv+dx+dy,vec2(0.),vec2(1.))).rgb+texture2D(reflectedScene,clamp(uv+dx-dy,vec2(0.),vec2(1.))).rgb+texture2D(reflectedScene,clamp(uv-dx+dy,vec2(0.),vec2(1.))).rgb+texture2D(reflectedScene,clamp(uv-dx-dy,vec2(0.),vec2(1.))).rgb)*.075;
          }
          float edge=1.-smoothstep(0.,.045,min(min(vEdge.x,vEdge.y),min(1.-vEdge.x,1.-vEdge.y)));
          reflected*=1.-wipe*mix(.045,.025,glass)-edge*mix(.035,.01,glass);
          reflected+=vec3(.008,.009,.008)*wipe;
          float grazing=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),5.);
          float coating=mix(.90-wipe*.035,mix(.26,.78,grazing),glass);
          float amount=clamp(coating*reflectionStrength,0.,1.);
          base=mix(base,reflected*vec3(.985,1.,.995),mix(amount,1.,overlay));
          opacity=mix(1.,amount,overlay);
        }
        gl_FragColor=vec4(base,opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  material.userData.mirrorOwned = true
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'planar-mirror:' + kind
  mesh.userData.planarMirror = { width, height, kind } satisfies MirrorSpec
  mesh.userData.noCastShadow = true
  mesh.castShadow = false; mesh.receiveShadow = false
  // Geometry is the lifecycle owner in foyer, streamed batches and cancelled builds alike.
  let disposed = false
  geometry.addEventListener('dispose', () => { if (!disposed) { disposed = true; material.dispose() } })
  return mesh
}

export function isMirrorSurface(object: THREE.Object3D): object is MirrorMesh {
  return !!object.userData.planarMirror && (object as THREE.Mesh).isMesh === true
}

/** A separate copy retains a meaningful plane origin/normal after world-space batching. */
export function copyMirrorSurface(source: MirrorMesh): MirrorMesh {
  const spec = source.userData.planarMirror as MirrorSpec
  const result = mirrorSurface(spec.width, spec.height, spec.kind, source.geometry.clone())
  result.userData.planarMirror = { ...spec }
  result.applyMatrix4(source.matrixWorld)
  result.layers.mask = source.layers.mask
  result.visible = source.visible
  return result
}

/** Opaque city glass stays in its original material batch. Only the chosen facade
 * receives a live overlay, so thousands of sealed windows do not add draw calls.
 * All panes on a plane share one discontinuous mesh; mullions remain real geometry. */
export function addBatchedMirrorOverlays(parent: THREE.Object3D, geometry: THREE.BufferGeometry) {
  const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),index=geometry.index
  if(!p||!n)return
  const planes=new Map<string,{normal:THREE.Vector3;points:THREE.Vector3[]}>()
  for(let i=0;i<(index?.count??p.count);i+=3){
    const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k)
    const normal=new THREE.Vector3().fromBufferAttribute(n,ids[0]).normalize()
    if(Math.abs(normal.y)>.03)continue
    const first=new THREE.Vector3().fromBufferAttribute(p,ids[0]),constant=normal.dot(first)
    const key=[normal.x,normal.z,constant].map(v=>Math.round(v*1000)).join('/')
    let plane=planes.get(key);if(!plane){plane={normal,points:[]};planes.set(key,plane)}
    for(const id of ids)plane.points.push(new THREE.Vector3().fromBufferAttribute(p,id))
  }
  for(const {normal,points} of planes.values()){
    const tangent=new THREE.Vector3(normal.z,0,-normal.x),up=new THREE.Vector3(0,1,0),basis=new THREE.Matrix4().makeBasis(tangent,up,normal)
    const inverse=basis.clone().invert(),local=points.map(p=>p.clone().applyMatrix4(inverse)),bounds=new THREE.Box3().setFromPoints(local),center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3())
    if(size.x<.04||size.y<.04)continue
    const g=new THREE.BufferGeometry(),vertices:number[]=[],normals:number[]=[],uv:number[]=[]
    for(const v of local){vertices.push(v.x-center.x,v.y-center.y,0);normals.push(0,0,1);uv.push((v.x-bounds.min.x)/size.x,(v.y-bounds.min.y)/size.y)}
    g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
    const mirror=mirrorSurface(size.x,size.y,'blackglass',g)
    ;(mirror.userData.planarMirror as MirrorSpec).overlay=true
    mirror.material.uniforms.overlay.value=1;mirror.material.transparent=true;mirror.material.depthWrite=false
    mirror.applyMatrix4(basis);mirror.position.copy(center.applyMatrix4(basis)).addScaledVector(normal,.0015)
    mirror.visible=false;mirror.name='planar-mirror:sealed-facade';parent.add(mirror)
  }
}

let captureDepth = 0
export const inMirrorCapture = () => captureDepth > 0
export function mirrorCapture<T>(run: () => T): T {
  captureDepth++
  try { return run() } finally { captureDepth-- }
}
