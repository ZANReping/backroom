import * as THREE from 'three'
import type {GameMap} from '../world/mapgen'
import {h32} from '../world/infinite'

// One bounded volume per rectangular void. A shared 32 KiB 3D density texture
// replaces the former overlapping billboards and per-pixel procedural octaves.
export class L4VolumeFog {
  readonly group=new THREE.Group()
  readonly texture:THREE.Data3DTexture
  readonly material:THREE.ShaderMaterial
  private geometry=new THREE.BoxGeometry(40,320,40)
  private pool:THREE.Mesh[]=[]
  private camera=new THREE.Vector3()
  private center=new THREE.Vector3()
  private key=''
  constructor(){
    const N=32,data=new Uint8Array(N*N*N)
    // Deterministic periodic density; trilinear sampling smooths it in hardware.
    for(let z=0;z<N;z++)for(let y=0;y<N;y++)for(let x=0;x<N;x++)data[x+N*(y+N*z)]=h32(441,x,y,z)&255
    this.texture=new THREE.Data3DTexture(data,N,N,N)
    this.texture.format=THREE.RedFormat;this.texture.type=THREE.UnsignedByteType
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter
    this.texture.wrapS=this.texture.wrapT=this.texture.wrapR=THREE.RepeatWrapping
    this.texture.unpackAlignment=1;this.texture.needsUpdate=true
    this.material=new THREE.ShaderMaterial({
      glslVersion:THREE.GLSL3,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,
      uniforms:{densityTex:{value:this.texture},eye:{value:new THREE.Vector3()},origin:{value:new THREE.Vector3()},time:{value:0},steps:{value:16},strength:{value:.155}},
      vertexShader:`out vec3 localPoint;void main(){localPoint=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`precision highp sampler3D;
        uniform sampler3D densityTex;uniform vec3 eye,origin;uniform float time,strength;uniform int steps;
        in vec3 localPoint;out vec4 fragColor;
        #define gl_FragColor fragColor
        void main(){
          vec3 halfSize=vec3(20.,160.,20.);
          bool inside=all(lessThan(abs(eye),halfSize));
          if(inside==gl_FrontFacing)discard;
          vec3 ray=normalize(localPoint-eye);
          vec3 inv=1./(mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.00001)));
          vec3 a=(-halfSize-eye)*inv,b=(halfSize-eye)*inv;
          vec3 lo=min(a,b),hi=max(a,b);
          float enter=max(0.,max(lo.x,max(lo.y,lo.z))),leave=min(hi.x,min(hi.y,hi.z));
          if(leave<=enter)discard;
          // Above 70m, transmission is negligible; do not march hidden distance.
          float span=min(leave-enter,70.),ds=span/float(steps),trans=1.;vec3 sum=vec3(0.);
          float jitter=fract(dot(gl_FragCoord.xy,vec2(.754877666,.569840296)));
          for(int i=0;i<20;i++){
            if(i>=steps||trans<.015)break;
            vec3 p=eye+ray*(enter+(float(i)+.25+jitter*.5)*ds);
            vec3 world=p+origin+vec3(time*.22,-time*.075,time*.09);
            float n=texture(densityTex,world/320.).r*.78+texture(densityTex,world/96.).r*.22;
            float edge=smoothstep(0.,2.8,min(20.-abs(p.x),20.-abs(p.z)));
            float density=strength*mix(.2,1.8,smoothstep(.30,.70,n))*edge;
            float alpha=1.-exp(-density*ds);
            vec3 scattering=mix(vec3(.19,.245,.27),vec3(.39,.45,.47),n*.75+clamp(ray.y,0.,1.)*.18);
            sum+=trans*alpha*scattering;trans*=1.-alpha;
          }
          fragColor=vec4(sum/max(.001,1.-trans),1.-trans);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
    this.group.name='l4-bounded-volume-fog'
  }
  update(m:GameMap,scene:THREE.Scene,camera:THREE.Camera,x:number,z:number,time:number,quality:number){
    if(!this.group.parent)scene.add(this.group)
    this.group.visible=true
    const seed=m.inf!.seed,ox=m.inf!.ox,oy=m.inf!.oy
    const mx=Math.floor((x+ox-13)/80),mz=Math.floor((z+oy-13)/80),key=`${seed}:${mx}:${mz}:${ox}:${oy}`
    if(key!==this.key){
      this.key=key;let count=0
      for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
        const a=mx+dx,b=mz+dz,sx=1+h32(seed,0x4a01,a,b)%2,sy=1+h32(seed,0x4a02,a,b)%2
        let mesh=this.pool[count]
        if(!mesh){mesh=new THREE.Mesh(this.geometry,this.material);mesh.name='l4-volume';this.pool.push(mesh);this.group.add(mesh)
        }
        // Store world origin separately: callbacks survive streaming-window shifts.
        mesh.userData.worldOrigin=[13+a*80+sx*20+20,13+b*80+sy*20+20]
        mesh.onBeforeRender=()=>{
          mesh.getWorldPosition(this.center)
          const eye=this.material.uniforms.eye.value as THREE.Vector3;eye.copy(this.camera).sub(this.center)
          // Inside a void, the visible box face is BEHIND the facade's projecting
          // slab edges. Let the integrated fog reach the eye instead of failing
          // depth testing against that far face. Other volumes retain occlusion.
          this.material.depthTest=!(Math.abs(eye.x)<20&&Math.abs(eye.y)<160&&Math.abs(eye.z)<20)
          this.material.uniforms.origin.value.set(mesh.userData.worldOrigin[0],0,mesh.userData.worldOrigin[1]);this.material.uniformsNeedUpdate=true
        }
        mesh.position.set(mesh.userData.worldOrigin[0]-ox,0,mesh.userData.worldOrigin[1]-oy);count++
      }
    }
    camera.getWorldPosition(this.camera)
    this.material.uniforms.time.value=time;this.material.uniforms.steps.value=quality===0?12:quality===1?16:20
    for(const mesh of this.pool){const dx=Math.max(0,Math.abs(mesh.position.x-x)-20),dz=Math.max(0,Math.abs(mesh.position.z-z)-20);mesh.visible=dx*dx+dz*dz<85*85}
  }
  hide(){this.group.visible=false}
  dispose(){this.group.removeFromParent();this.geometry.dispose();this.material.dispose();this.texture.dispose();this.pool.length=0}
}
