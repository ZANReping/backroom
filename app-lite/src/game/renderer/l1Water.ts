import { getReflectK } from './shared'
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'

import { l1StyleAt } from '../world/l1Architecture'
import type { GameMap } from '../world/mapgen'
import type { TerrainRange } from './geometry'
import { l1Puddles,l1PuddleField } from '../world/l1Puddles'
import {recordL1BuildStage} from './l1BuildMetrics'

/** Clip the union of leak footprints to half-metre cells and actual walkable tiles.
 * Shared edge samples have identical world coordinates; no overlapped alpha surfaces. */
export function l1PuddleGeometry(m:GameMap,r:TerrainRange):THREE.BufferGeometry|null {
 const job=l1PuddleGeometryJob(m,r);let step=job.next();while(!step.done)step=job.next();return step.value
}
export function *l1PuddleGeometryJob(m:GameMap,r:TerrainRange):Generator<void,THREE.BufferGeometry|null,unknown> {
 if(!m.inf)return null
 const ox=m.inf.ox,oz=m.inf.oy,positions:number[]=[],uv:number[]=[],normal:number[]=[]
 const puddles=new Map<string,ReturnType<typeof l1Puddles>>()
 const samples=new Map<number,number>()
 const sample=(x:number,z:number)=>{
  const index=Math.round(z*2)*(m.w*2+1)+Math.round(x*2),cached=samples.get(index);if(cached!==undefined)return cached
  const cx=Math.floor((x+ox)/32),cz=Math.floor((z+oz)/32),key=cx+','+cz
  let list=puddles.get(key);if(!list){list=l1Puddles(m.inf!.seed,cx,cz);puddles.set(key,list)}
  const value=list.reduce((v,p)=>Math.max(v,l1PuddleField(p,x+ox,z+oz)),-1);samples.set(index,value);return value
 }
 type V={x:number;z:number;k:number}
 const edge:number[]=[]
 const tri=(vs:V[])=>{
  const poly:V[]=[]
  for(let i=0;i<3;i++){
   const a=vs[i],b=vs[(i+1)%3];if(a.k>=0)poly.push(a)
   if((a.k>=0)!==(b.k>=0)){const t=a.k/(a.k-b.k);poly.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,k:0})}
  }
  for(let i=1;i<poly.length-1;i++)for(const p of [poly[0],poly[i],poly[i+1]]){positions.push(p.x,.012,p.z);normal.push(0,1,0);uv.push((p.x+ox)*.25,(p.z+oz)*.25);edge.push(Math.min(1,Math.max(0,p.k)*12))}
 }
 for(let z=Math.max(0,r.y0);z<Math.min(m.h,r.y1);z+=.5){
  yield
  for(let x=Math.max(0,r.x0);x<Math.min(m.w,r.x1);x+=.5){
  if(m.tiles[Math.floor(z)*m.w+Math.floor(x)]!==1||l1StyleAt(m,x,z)!=='parking')continue
  const a={x,z,k:sample(x,z)},b={x:x+.5,z,k:sample(x+.5,z)},c={x:x+.5,z:z+.5,k:sample(x+.5,z+.5)},d={x,z:z+.5,k:sample(x,z+.5)}
  tri([a,d,c]);tri([a,c,b])
  }
 }
 if(!positions.length)return null
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normal,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setAttribute('l1WetEdge',new THREE.Float32BufferAttribute(edge,1));return geo
}

/** One 512px reflection target for the nearest 3 × 3 parking chunks, capped at 15Hz. */
export class L1WaterReflection {
  private mirror:Reflector|null=null
  private key=''
  private last=-Infinity
  private blackout=false
  update(scene:THREE.Scene,m:GameMap,x:number,z:number,realistic:boolean,time:number,blackout:boolean,chunks:Iterable<{group:THREE.Group;wx:number;wy:number}>){
    if(!m.inf||l1StyleAt(m,x,z)!=='parking'||!realistic||getReflectK()<=0){this.clear(scene);return}
    const cx=Math.floor((x+m.inf.ox)/32),cz=Math.floor((z+m.inf.oy)/32),sources:THREE.Mesh[]=[]
    const x0=cx*32-m.inf.ox,z0=cz*32-m.inf.oy
    for(const c of chunks){
      if(Math.abs(c.wx-x0)>32||Math.abs(c.wy-z0)>32)continue
      const wet=c.group.children.find(o=>o.name==='l1-wet-floor') as THREE.Mesh|undefined
      if(wet)sources.push(wet)
    }
    // These are the exact, already prepared shorelines used by the visible wet
    // floor. Never resample nine chunks synchronously when the player moves.
    const key=`${m.inf.ox},${m.inf.oy}:`+sources.map(o=>o.geometry.id+':'+o.position.x+','+o.position.z).join('|')
    if(key!==this.key){
      this.key=key
      if(!sources.length){if(this.mirror)this.mirror.visible=false;return}
      const began=performance.now(),count=sources.reduce((n,o)=>n+o.geometry.getAttribute('position').count,0)
      const positions=new Float32Array(count*3),edges=new Float32Array(count),v=new THREE.Vector3();let offset=0
      for(const source of sources){
        source.updateWorldMatrix(true,false)
        const p=source.geometry.getAttribute('position'),e=source.geometry.getAttribute('l1WetEdge')
        for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(source.matrixWorld);positions.set([v.x,v.y,v.z],(offset+i)*3);edges[offset+i]=e.getX(i)}offset+=p.count
      }
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('l1WetEdge',new THREE.BufferAttribute(edges,1))
      // Reflector's reflection normal is local +Z, so transform XY geometry and rotate the object.
      geo.rotateX(Math.PI/2)
      recordL1BuildStage('reflectionReuseCpu',performance.now()-began)
      if(this.mirror){this.mirror.geometry.dispose();this.mirror.geometry=geo;this.mirror.visible=true;this.last=-Infinity}
      else{
      const shader={name:'L1WetReflection',uniforms:{strength:{value:1},color:{value:new THREE.Color()},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()}},
        vertexShader:`uniform mat4 textureMatrix;varying vec4 vMirror;attribute float l1WetEdge;varying float vWetEdge;varying vec3 vView;
          void main(){vWetEdge=l1WetEdge;vMirror=textureMatrix*vec4(position,1.);vec4 mv=modelViewMatrix*vec4(position,1.);vView=mv.xyz;gl_Position=projectionMatrix*mv;}`,
        fragmentShader:`uniform float strength;uniform vec3 color;uniform sampler2D tDiffuse;varying vec4 vMirror;varying float vWetEdge;varying vec3 vView;
          void main(){vec4 uv=vMirror;uv.xy+=sin(uv.yx*13.)*.0004*uv.w;
          vec3 c=texture2DProj(tDiffuse,uv).rgb;vec3 n=normalize(cross(dFdx(vView),dFdy(vView)));float grazing=1.-abs(dot(n,normalize(vView)));
          float fresnel=.02+.98*pow(grazing,5.);gl_FragColor=vec4(c*color,strength*smoothstep(0.,.8,vWetEdge)*fresnel);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`}
      // A shallow clear-water film reflects the light's colour. The previous
      // dark green multiplier absorbed ~80% of it before Fresnel attenuation.
      const mirror=new Reflector(geo,{textureWidth:512,textureHeight:512,multisample:0,color:0xe9eeeb,clipBias:.003,shader})
      mirror.rotation.x=-Math.PI/2;mirror.position.y=.006;const material=mirror.material as THREE.ShaderMaterial;material.transparent=true;material.depthWrite=false
      mirror.name='l1-single-puddle-reflection';mirror.renderOrder=1
      const original=mirror.onBeforeRender.bind(mirror)
      let projectionX=NaN,projectionY=NaN
      mirror.onBeforeRender=(renderer,...args)=>{
        if(time===-1)return
        // A resized viewport / changed FOV needs a matching reflection on its
        // first frame. Throttle motion updates, never reuse another lens.
        const projection=args[1].projectionMatrix.elements
        if(projection[0]!==projectionX||projection[5]!==projectionY){projectionX=projection[0];projectionY=projection[5];this.last=-Infinity}
        const now=performance.now()/1000
        if(now-this.last<1/15)return
        this.last=now
        const auto=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false
        try{original(renderer,...args)}finally{renderer.shadowMap.autoUpdate=auto}
      }
      this.mirror=mirror;scene.add(mirror)
      }
    }
    if(this.mirror)(this.mirror.material as THREE.ShaderMaterial).uniforms.strength.value=Math.min(1,getReflectK())
    if(blackout!==this.blackout){this.last=-Infinity;this.blackout=blackout}
  }
  clear(scene:THREE.Scene){if(this.mirror){scene.remove(this.mirror);this.mirror.geometry.dispose();this.mirror.dispose();this.mirror=null}this.key='';this.last=-Infinity}
}

