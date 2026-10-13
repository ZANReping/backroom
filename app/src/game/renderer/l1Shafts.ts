import * as THREE from 'three'
import type {LightSource} from '../core/types'
import type {GameMap} from '../world/mapgen'

/** Bounded translucent skylight volumes. Inspired by the soft silhouette of
 * threex.volumetricspotlight; original shader, no full-screen ray marching,
 * depth readback, extra light, render target or shadow pass. */
export class L1Shafts {
 readonly mesh:THREE.InstancedMesh
 private power=new THREE.InstancedBufferAttribute(new Float32Array(16),1)
 private matrix=new THREE.Matrix4()
 private rotation=new THREE.Quaternion()
 private scale=new THREE.Vector3(1,6.05,1.15)
 private position=new THREE.Vector3()
 private clearSources=new WeakMap<LightSource,boolean>()
 private lastStructures:unknown
 constructor(){
  const geometry=new THREE.CylinderGeometry(.92,.92,1,12,1,true);geometry.translate(0,-.5,0)
  geometry.setAttribute('shaftPower',this.power)
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:THREE.FrontSide,blending:THREE.AdditiveBlending,
   vertexShader:`attribute float shaftPower;varying float vHeight,vPower;varying vec3 vNormal,vWorld;
    void main(){vec3 p=position;vHeight=-position.y;vPower=shaftPower;
    vec4 w=modelMatrix*instanceMatrix*vec4(p,1.);float fall=-p.y*instanceMatrix[1].y;w.x+=fall*.347826;w.z-=fall*.217391;
    vWorld=w.xyz;vNormal=normalize(mat3(modelMatrix*instanceMatrix)*vec3(normal.x,0.,normal.z));gl_Position=projectionMatrix*viewMatrix*w;}`,
   fragmentShader:`varying float vHeight,vPower;varying vec3 vNormal,vWorld;
    void main(){vec3 view=normalize(cameraPosition-vWorld);float rim=pow(abs(dot(normalize(vNormal),view)),1.7);
    float ends=smoothstep(0.,.06,vHeight)*(1.-smoothstep(.70,1.,vHeight));
    float ray=pow(max(0.,dot(view,normalize(vec3(.365,-1.,-.23)))),4.);
    float density=.058*rim*ends*mix(.8,1.2,ray)*vPower;
    gl_FragColor=vec4(vec3(.91,.87,.70),density);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`})
  this.mesh=new THREE.InstancedMesh(geometry,material,16);this.mesh.name='l1-skylight-shafts';this.mesh.frustumCulled=false;this.mesh.visible=false;this.mesh.renderOrder=2
 }
 update(scene:THREE.Scene,m:GameMap,lights:LightSource[],enabled:boolean,time:number,warning:boolean){
  if(!this.mesh.parent)scene.add(this.mesh)
  this.mesh.visible=enabled&&!m.inf?.blackout;if(!this.mesh.visible)return
  if(this.lastStructures!==m.structures){this.lastStructures=m.structures;this.clearSources=new WeakMap()}
  let count=0
  for(const L of lights){
   if(!L.natural||!L.gen||(L.intensityMul??1)<=0)continue
   // Never shine through a solid wall on the slanted path to the floor.
   let clear=this.clearSources.get(L)??true;const h=(L.fixZ??6.38)-.2
   if(!this.clearSources.has(L))for(let i=1;i<=12;i++){
    const fall=h*i/12,x=L.x+fall*.347826,z=L.y-fall*.217391,y=h-fall,tx=Math.floor(x),tz=Math.floor(z)
    if(tx<0||tz<0||tx>=m.w||tz>=m.h||m.tiles[tz*m.w+tx]!==1||m.structures.some(s=>s.data?.l1Static&&s.solid&&x>=s.x&&x<=s.x+s.w&&z>=s.y&&z<=s.y+s.h&&y>=Number(s.data.bottom)&&y<=Number(s.data.top))){clear=false;break}
   }
   this.clearSources.set(L,clear)
   if(!clear)continue
   this.scale.set(1,h,1);this.position.set(L.x,h,L.y);this.matrix.compose(this.position,this.rotation,this.scale);this.mesh.setMatrixAt(count,this.matrix)
   this.power.setX(count,warning?(Math.sin(time*43+L.flickerSeed*29)>-.2?.1:1):1)
   if(++count===16)break
  }
  this.mesh.count=count;this.mesh.visible=count>0;this.mesh.instanceMatrix.needsUpdate=true;this.power.needsUpdate=true
 }
 dispose(){this.mesh.removeFromParent();this.mesh.geometry.dispose();(this.mesh.material as THREE.Material).dispose()}
}
