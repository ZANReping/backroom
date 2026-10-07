import * as THREE from 'three'
import {Pass,FullScreenQuad} from 'three/examples/jsm/postprocessing/Pass.js'
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js'
const vertexShader=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`
/** Shared loss-of-focus curve. Taking the maximum avoids doubling blur when
 * a low-sanity player crosses a red-room loop. The engine owns the red decay. */
export function perceptionBlur(sanity:number,red:number){const k=Math.max(0,Math.min(1,(40-sanity)/40));return Math.max(.8*k*k,Math.max(0,Math.min(1,red))*.9)}
/** Borrow the beauty pass depth attachment; never draw the scene twice for AO. */
export class PhotoRenderPass extends RenderPass {
 private photo:PhotoPass
 constructor(scene:THREE.Scene,camera:THREE.Camera,photo:PhotoPass){super(scene,camera);this.photo=photo}
 override render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget,dt:number,mask:boolean){
  if(this.photo.quality&&!read.depthTexture){read.depthTexture=new THREE.DepthTexture(read.width,read.height,THREE.UnsignedIntType);read.dispose()}
  this.photo.sourceDepth=read.depthTexture
  super.render(renderer,write,read,dt,mask)
 }
}
/** Eight AO samples at half resolution, followed by a linear-color composite. */
export class PhotoPass extends Pass {
 readonly aoTarget=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false})
 readonly aoMaterial=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,vertexShader,uniforms:{tDepth:{value:null},inverseProjection:{value:new THREE.Matrix4()},resolution:{value:new THREE.Vector2(1,1)}},fragmentShader:`
 varying vec2 vUv;uniform sampler2D tDepth;uniform mat4 inverseProjection;uniform vec2 resolution;
 // Reconstruct from the sampled full-resolution texel centre. Half-resolution
 // UVs otherwise lie on texel boundaries: nearest-depth rounding changes the
 // reconstructed normal from column to column and creates false wall stripes.
 vec2 centre(vec2 uv){return(clamp(floor(uv*resolution),vec2(0.),resolution-1.)+.5)/resolution;}
 vec3 point(vec2 uv){uv=centre(uv);float d=texture2D(tDepth,uv).x;vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
 void main(){float occ=0.;
 vec2 uv0=centre(vUv);
 if(texture2D(tDepth,uv0).x<.99999){vec3 p=point(uv0);vec2 pixel=1./resolution;
 vec3 left=p-point(uv0-vec2(pixel.x,0.)),right=point(uv0+vec2(pixel.x,0.))-p;
 vec3 down=p-point(uv0-vec2(0.,pixel.y)),up=point(uv0+vec2(0.,pixel.y))-p;
 vec3 px=dot(left,left)<dot(right,right)?left:right,py=dot(down,down)<dot(up,up)?down:up;
 vec3 n=normalize(cross(px,py));if(n.z<0.)n=-n;float radius=clamp(.35/max(.1,-p.z),.001,.07);
 for(int i=0;i<8;i++){float a=float(i)*2.39996;vec2 uv=uv0+vec2(cos(a),sin(a))*radius*(.35+float(i)/12.);
 vec3 v=point(clamp(uv,pixel,1.-pixel))-p;float d=length(v);
 occ+=max(0.,dot(n,v/max(.001,d))-.12)*(1.-smoothstep(.05,.8,d));}}
 gl_FragColor=vec4(vec3(clamp(occ/3.,0.,1.)),1.);}`})
 readonly material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,vertexShader,uniforms:{tDiffuse:{value:null},tAO:{value:this.aoTarget.texture},tDepth:{value:null},resolution:{value:new THREE.Vector2(1,1)},aoSize:{value:new THREE.Vector2(1,1)},cameraRange:{value:new THREE.Vector2(.05,100)},halation:{value:0},white:{value:new THREE.Vector3(1,1,1)},saturation:{value:1},strength:{value:.32},aoOn:{value:0}},fragmentShader:`
 varying vec2 vUv;uniform sampler2D tDiffuse,tAO,tDepth;uniform vec3 white;uniform vec2 resolution,aoSize,cameraRange;uniform float saturation,strength,aoOn,halation;
 float viewDepth(vec2 uv){float d=texture2D(tDepth,uv).r;return cameraRange.x*cameraRange.y/(cameraRange.y-(cameraRange.y-cameraRange.x)*d);}
 float upsampleAO(){
  vec2 base=floor(vUv*aoSize-.5),f=fract(vUv*aoSize-.5);float centre=viewDepth(vUv),sum=0.,weight=0.;
  // Depth-aware reconstruction keeps foreground contact shading on its own
  // surface instead of spreading a dark fringe over the wall behind it.
  for(int x=0;x<2;x++)for(int y=0;y<2;y++){
   vec2 uv=clamp((base+vec2(float(x),float(y))+.5)/aoSize,.5/aoSize,1.-.5/aoSize);
   float w=(x==0?1.-f.x:f.x)*(y==0?1.-f.y:f.y)*exp2(-abs(viewDepth(uv)-centre)*24.);
   sum+=texture2D(tAO,uv).r*w;weight+=w;
  }return weight>.0001?sum/weight:0.;
 }
 vec3 highlight(vec2 uv){vec3 c=texture2D(tDiffuse,uv).rgb;float l=dot(c,vec3(.2126,.7152,.0722));return c*(max(0.,l-1.18)/max(l,.001));}
 void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;if(aoOn>.5)c*=1.-strength*upsampleAO();
 if(halation>0.){vec2 d=2.2/resolution;vec3 h=highlight(vUv+vec2(d.x,0.))+highlight(vUv-vec2(d.x,0.))+highlight(vUv+vec2(0.,d.y))+highlight(vUv-vec2(0.,d.y));
 h+=(highlight(vUv+d*1.4)+highlight(vUv-d*1.4)+highlight(vUv+vec2(d.x,-d.y)*1.4)+highlight(vUv+vec2(-d.x,d.y)*1.4))*.5;c+=h*(halation/6.);}
 c*=white;float lum=dot(c,vec3(.2126,.7152,.0722));c=mix(vec3(lum),c,saturation);gl_FragColor=vec4(c,1.);}`})
 private quad=new FullScreenQuad(this.material)
 private aoQuad=new FullScreenQuad(this.aoMaterial)
 quality=1
 sourceDepth:THREE.DepthTexture|null=null
 private camera:THREE.PerspectiveCamera
 constructor(camera:THREE.PerspectiveCamera){super();this.camera=camera}
 override setSize(w:number,h:number){const scale=this.quality===2?.75:.5;this.aoTarget.setSize(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale)));this.aoMaterial.uniforms.resolution.value.set(w,h);this.material.uniforms.resolution.value.set(w,h);this.material.uniforms.aoSize.value.set(this.aoTarget.width,this.aoTarget.height)}
 override render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget){
  const on=!!this.quality&&!!this.sourceDepth
  if(on){this.aoMaterial.uniforms.tDepth.value=this.sourceDepth;this.aoMaterial.uniforms.inverseProjection.value.copy(this.camera.projectionMatrixInverse);renderer.setRenderTarget(this.aoTarget);this.aoQuad.render(renderer)}
  this.material.uniforms.aoOn.value=on?1:0;this.material.uniforms.tDiffuse.value=read.texture
  this.material.uniforms.tDepth.value=this.sourceDepth;this.material.uniforms.cameraRange.value.set(this.camera.near,this.camera.far)
  renderer.setRenderTarget(this.renderToScreen?null:write);this.quad.render(renderer)
 }
 override dispose(){this.aoTarget.dispose();this.aoMaterial.dispose();this.material.dispose();this.quad.dispose();this.aoQuad.dispose();this.sourceDepth=null}
}
export const PhotoFinishShader={uniforms:{tDiffuse:{value:null},time:{value:0},grain:{value:.0015},vignette:{value:.12},blur:{value:0},scanline:{value:0},resolution:{value:new THREE.Vector2(1,1)}},vertexShader,fragmentShader:`
 varying vec2 vUv;uniform sampler2D tDiffuse;uniform float time,grain,vignette,blur,scanline;uniform vec2 resolution;
 void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;if(blur>.001){
 vec2 d=vec2(1.4*blur)/resolution;c=vec3(0.);
 // Compact binomial Gaussian. Adjacent taps avoid the doubled lamp edges of
 // the former sparse diagonal blur; the uniform branch is skipped at rest.
 for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++){
 float wx=abs(x)==2?1.:abs(x)==1?4.:6.;float wy=abs(y)==2?1.:abs(y)==1?4.:6.;
 c+=texture2D(tDiffuse,vUv+vec2(float(x),float(y))*d).rgb*(wx*wy/256.);
 }
 }
 float noise=fract(sin(dot(gl_FragCoord.xy+floor(time*24.),vec2(12.9898,78.233)))*43758.5453)-.5;
 vec2 p=vUv*2.-1.;c*=1.-vignette*smoothstep(.25,1.7,dot(p,p));c*=1.-scanline*(.5+.5*cos(gl_FragCoord.y*3.14159));c+=noise*grain;gl_FragColor=vec4(c,1.);}`}

