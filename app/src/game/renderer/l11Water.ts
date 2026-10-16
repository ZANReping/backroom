import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { clipping,rectangle,bounds,type Polygon } from '../world/l11Geometry'
import { applyWater,waterUniforms } from './water'
import { getMaterialMode,getReflectK,litMaterial } from './shared'
import type { GameMap } from '../world/mapgen'
import { L11_WATER_SURFACE,L11_WATER_DEPTH } from '../world/l11Hydrology'

const materials=new Map<string,THREE.Material>()
function material(high:boolean){
  const key=`${getMaterialMode()}:${high}`,hit=materials.get(key);if(hit)return hit
  const mat=litMaterial({color:'#526b65',transparent:true,opacity:.48,roughness:.17,metalness:0,side:THREE.DoubleSide,envBase:.85} as Parameters<typeof litMaterial>[0])
  applyWater(mat,'canal',high?'high':'low');mat.name=`l11-canal-water-${key}`;mat.userData.shared=true
  materials.set(key,mat);return mat
}

/** The L1 puddle reflection strategy adapted to one canal plane: one bounded
 * 1024×512 target at 15Hz, no per-chunk mirrors, no reflection shadow redraws. */
export class L11WaterReflection {
  private mirror:Reflector|null=null
  private key=''
  private last=-Infinity
  private water:THREE.Mesh[]=[]
  update(scene:THREE.Scene,m:GameMap,x:number,z:number,enabled:boolean,chunks:Iterable<{group:THREE.Group;wx:number;wy:number}>){
    if(!enabled||!m.inf||getReflectK()<=0){this.clear(scene);return}
    const sources:THREE.Mesh[]=[]
    for(const c of chunks)if(Math.abs(c.wx+16-x)<64&&Math.abs(c.wy+16-z)<64)c.group.traverse(o=>{if(o.name==='l11-canal-water')sources.push(o as THREE.Mesh)})
    if(!sources.length){this.clear(scene);return}
    const key=`${m.inf.ox},${m.inf.oy}:`+sources.map(s=>s.geometry.id).join(',')
    if(key!==this.key){
      this.key=key;this.water=sources;const positions:number[]=[],v=new THREE.Vector3()
      for(const source of sources){source.updateWorldMatrix(true,false);const p=source.geometry.getAttribute('position');for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld);positions.push(v.x,0,v.z)}}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.rotateX(Math.PI/2);geo.computeBoundingSphere()
      if(this.mirror){this.mirror.geometry.dispose();this.mirror.geometry=geo;this.last=-Infinity}
      else{
        const mirror=new Reflector(geo,{textureWidth:1024,textureHeight:512,multisample:0,clipBias:.003,shader:{
          name:'L11CanalReflection',uniforms:{strength:{value:1},time:waterUniforms.uWaterTime,origin:waterUniforms.uWaterOrigin,color:{value:new THREE.Color()},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()}},
          vertexShader:`uniform mat4 textureMatrix;varying vec4 vMirror;varying vec3 vView;varying vec2 vWater;
          void main(){vMirror=textureMatrix*vec4(position,1.);vec4 mv=modelViewMatrix*vec4(position,1.);vView=mv.xyz;vWater=(modelMatrix*vec4(position,1.)).xz;gl_Position=projectionMatrix*mv;}`,
          fragmentShader:`uniform float strength;uniform float time;uniform vec2 origin;uniform sampler2D tDiffuse;varying vec4 vMirror;varying vec3 vView;varying vec2 vWater;
          void main(){vec2 p=vWater+origin;vec4 uv=vMirror;
            vec2 ripple=vec2(sin(dot(p,vec2(.8,.43))+time*.8),cos(dot(p,vec2(-.4,1.1))-time*.6))*.45;
            ripple+=vec2(.62,.78)*cos(dot(p,vec2(4.1,5.2))-time*1.4)*.65;
            ripple+=vec2(-.91,.41)*cos(dot(p,vec2(-7.3,3.3))+time*1.1)*.38;
            ripple+=vec2(.28,.96)*cos(dot(p,vec2(16.2,31.7))+sin(p.x*.53)-time*2.7)*.3;
            ripple+=vec2(-.84,.54)*sin(dot(p,vec2(-38.4,12.6))+cos(p.y*.67)+time*3.4)*.19;
            uv.xy+=ripple*.005*uv.w;
            vec3 n=normalize(cross(dFdx(vView),dFdy(vView)));float f=.02+.98*pow(1.-abs(dot(n,normalize(vView))),5.);
            float fade=1.-smoothstep(32.,72.,length(vView));vec2 coord=uv.xy/uv.w;
            vec2 blur=vec2(.0026,.0042)*(1.+length(vView)*.025);
            vec3 c=texture2D(tDiffuse,coord).rgb*.4;
            c+=(texture2D(tDiffuse,coord+blur).rgb+texture2D(tDiffuse,coord-blur).rgb+texture2D(tDiffuse,coord+vec2(blur.x,-blur.y)).rgb+texture2D(tDiffuse,coord+vec2(-blur.x,blur.y)).rgb)*.15;
            c*=.40;
            gl_FragColor=vec4(c,strength*fade*min(.68,f));
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`
        }})
        // Reflector derives the mirror plane from its object's origin (+Z), so
        // the local mesh is zero-height and the water datum is on the object.
        mirror.rotation.x=-Math.PI/2;mirror.position.y=L11_WATER_SURFACE+.008;mirror.name='l11-canal-reflection';mirror.renderOrder=3
        const mat=mirror.material as THREE.ShaderMaterial;mat.transparent=true;mat.depthWrite=false
        mat.uniforms.time=waterUniforms.uWaterTime;mat.uniforms.origin=waterUniforms.uWaterOrigin
        const original=mirror.onBeforeRender.bind(mirror);let lens=''
        mirror.onBeforeRender=(renderer,...args)=>{
          const camera=args[1],projection=camera.projectionMatrix.elements,next=`${projection[0]},${projection[5]}`
          if(lens!==next){lens=next;this.last=-Infinity}
          const now=performance.now()/1000;if(now-this.last<1/15)return;this.last=now
          const auto=renderer.shadowMap.autoUpdate,visibility=this.water.map(o=>o.visible);renderer.shadowMap.autoUpdate=false
          // Reflection only contains the city/sky, never recursively the water.
          for(const o of this.water)o.visible=false
          try{original(renderer,...args)}finally{renderer.shadowMap.autoUpdate=auto;this.water.forEach((o,i)=>o.visible=visibility[i])}
        }
        this.mirror=mirror;scene.add(mirror)
      }
    }
    if(this.mirror)(this.mirror.material as THREE.ShaderMaterial).uniforms.strength.value=Math.min(1,getReflectK())
  }
  clear(scene:THREE.Scene){if(this.mirror){scene.remove(this.mirror);this.mirror.geometry.dispose();this.mirror.dispose();this.mirror=null}this.water=[];this.key='';this.last=-Infinity}
}
/** Clip the actual canal, not liquid tiles. World-aligned 2m subdivisions and
 * world-phase normals agree across chunk and infinite-window boundaries. */
export function l11CanalWater(polygons:Polygon[],ox:number,oy:number,high=false,cell=2):THREE.Mesh|null {
  const job=l11CanalWaterJob(polygons,ox,oy,high,cell);let next=job.next();while(!next.done)next=job.next();return next.value
}

/** Distant canals cover a large rectangle with mostly dry cells. Preserve the
 * exact clipping/UVs but reject dry bounds and yield between small wet batches. */
export function* l11CanalWaterJob(polygons:Polygon[],ox:number,oy:number,high=false,cell=2):Generator<void,THREE.Mesh|null,unknown>{
  if(!polygons.length)return null
  const merged=clipping.union(polygons[0],...polygons.slice(1)),bb=bounds(merged),positions:number[]=[],normals:number[]=[],uv:number[]=[],depth:number[]=[]
  const wetBounds=merged.map(p=>bounds(p));let processed=0
  yield
  for(let y=Math.floor(bb.y/cell)*cell;y<bb.y+bb.h;y+=cell)for(let x=Math.floor(bb.x/cell)*cell;x<bb.x+bb.w;x+=cell){
    if(!wetBounds.some(b=>x<b.x+b.w&&x+cell>b.x&&y<b.y+b.h&&y+cell>b.y))continue
    for(const p of clipping.intersection(merged,rectangle(x,y,cell,cell))){
      const rings=p.map(r=>r.slice(0,-1).map(q=>new THREE.Vector2(...q))),pts=rings.flat()
      for(const tri of THREE.ShapeUtils.triangulateShape(rings[0],rings.slice(1)))for(const i of [tri[0],tri[2],tri[1]]){
        const q=pts[i];positions.push(q.x-ox,L11_WATER_SURFACE,q.y-oy);normals.push(0,1,0);uv.push(q.x,q.y);depth.push(L11_WATER_DEPTH)
      }
    }
    if(++processed%8===0)yield
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('aDepth',new THREE.Float32BufferAttribute(depth,1));geo.computeBoundingSphere()
  const mesh=new THREE.Mesh(geo,material(high));mesh.name='l11-canal-water';mesh.receiveShadow=true;mesh.castShadow=false;mesh.userData.noCastShadow=1;mesh.renderOrder=2;return mesh
}
