import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { getMaterialMode } from './shared'
import { SKY_VISIBILITY_GLSL, skyVisibilityUniforms, setSkyAccess, type SkyOpening } from './skyVisibility'

/** Licensed photographic sky. No procedural noise texture is allocated for
 * L11. The separate directional light supplies the measured solar direction. */
export class L11Sky {
  readonly mesh:THREE.Mesh
  private material:THREE.ShaderMaterial
  private texture=new THREE.DataTexture(new Float32Array([.18,.28,.38,1]),1,1,THREE.RGBAFormat,THREE.FloatType)
  private quality=''
  private request=0
  private disposed=false
  private sun:THREE.Vector3
  private visibility=skyVisibilityUniforms()
  constructor(sun:THREE.Vector3){
    this.sun=sun
    this.texture.mapping=THREE.EquirectangularReflectionMapping;this.texture.colorSpace=THREE.LinearSRGBColorSpace;this.texture.userData={skyOwned:true,skyPending:true,fullEquirect:true};this.texture.needsUpdate=true
    this.material=new THREE.ShaderMaterial({
      uniforms:{...this.visibility,tSky:{value:this.texture},uCloud:{value:0},uFog:{value:0},uFogColor:{value:new THREE.Color('#c5d1d2')}},
      vertexShader:'varying vec3 vDirection; void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`varying vec3 vDirection;
        uniform sampler2D tSky;uniform float uCloud,uFog;uniform vec3 uFogColor;
        ${SKY_VISIBILITY_GLSL}
        void main(){
          vec3 d=normalize(vDirection);vec2 uv=vec2(atan(d.z,d.x)/6.28318530718+.5,asin(clamp(d.y,-1.,1.))/3.14159265359+.5);
          vec3 c=texture2D(tSky,uv).rgb;
          float l=dot(c,vec3(.2126,.7152,.0722));
          c=mix(c,vec3(l*.65+.12),uCloud);
          c=mix(c,uFogColor,uFog+pow(1.-max(d.y,0.),12.)*.12*(1.-uFog));
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          gl_FragColor.rgb=mix(uSkyIndoor,gl_FragColor.rgb,skyVisibility(d));
          #include <colorspace_fragment>
        }`,
      side:THREE.BackSide,depthWrite:false,fog:false,
    })
    this.material.userData.skyTexture=this.texture
    this.mesh=new THREE.Mesh(new THREE.SphereGeometry(42,48,24),this.material);this.mesh.name='l11-cc0-sky';this.mesh.renderOrder=-1000;this.mesh.frustumCulled=false;this.mesh.userData.sky=this;this.mesh.userData.noCastShadow=1
    this.setQuality(getMaterialMode()==='classic'?'low':'high')
  }
  setQuality(tier:'high'|'low'){
    if(this.disposed||tier===this.quality)return
    this.quality=tier;const request=++this.request
    this.texture.userData.skyPending=true
    new HDRLoader().setDataType(THREE.FloatType).load(`/textures/l11-sky/sky-${tier==='high'?'4k':'2k'}.hdr`,source=>{
      if(this.disposed||request!==this.request){source.dispose();return}
      const image=source.image as {data:Float32Array;width:number;height:number},data=new Float32Array(image.data.length)
      // The brightest source pixel is the sun. Rotate the panorama itself so
      // sky, reflection and shadows agree from every world-space viewpoint.
      let peak=0,brightest=0
      for(let i=0;i<image.data.length;i+=4){const l=image.data[i]*.2126+image.data[i+1]*.7152+image.data[i+2]*.0722;if(l>brightest){brightest=l;peak=i/4}}
      const sourceU=(peak%image.width)/image.width,targetU=Math.atan2(this.sun.z,this.sun.x)/(2*Math.PI)+.5,shift=Math.round((sourceU-targetU)*image.width)
      for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
        const from=(y*image.width+((x+shift)%image.width+image.width)%image.width)*4,to=(y*image.width+x)*4
        // Direct sunlight is rendered once by DirectionalLight. Clamp only
        // the HDR solar disc in the IBL source, retaining cloud radiance.
        for(let c=0;c<3;c++)data[to+c]=Math.min(4,image.data[from+c]);data[to+3]=1
      }
      this.texture.image={data,width:image.width,height:image.height};this.texture.flipY=source.flipY;this.texture.wrapS=THREE.RepeatWrapping;this.texture.minFilter=THREE.LinearFilter;this.texture.magFilter=THREE.LinearFilter;this.texture.needsUpdate=true;this.texture.userData.skyPending=false
      source.dispose()
    },undefined,error=>{if(request===this.request&&!this.disposed){this.texture.userData.skyPending=false;console.warn('L11 CC0 sky unavailable',error)}})
  }
  setWeather(coverage:number,fog:number){this.material.uniforms.uCloud.value=Math.max(0,Math.min(.85,coverage*1.6));this.material.uniforms.uFog.value=Math.max(0,Math.min(.9,fog))}
  setVisibility(amount:number,eye:THREE.Vector3,fog:THREE.Color,opening?:SkyOpening){setSkyAccess(this.visibility,amount,eye,fog,opening)}
  update(_renderer:THREE.WebGLRenderer,_time:number,fog?:THREE.Color){if(this.disposed||!this.mesh.visible)return;if(fog)this.material.uniforms.uFogColor.value.copy(fog)}
  dispose(){if(this.disposed)return;this.disposed=true;this.request++;this.texture.dispose();this.material.dispose();this.mesh.geometry.dispose()}
}
