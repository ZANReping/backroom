import { getReflectK } from './shared'
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { l1StyleAt } from '../world/l1Architecture'
import type { GameMap } from '../world/mapgen'
import type { TerrainRange } from './geometry'
import { l1Puddles } from '../world/l1Puddles'

export function l1PuddleGeometry(m:GameMap,r:TerrainRange):THREE.BufferGeometry|null {
  const ox=m.inf?.ox??0,oz=m.inf?.oy??0,parts:THREE.BufferGeometry[]=[]
  const f=(x:number,z:number)=>x>=0&&z>=0&&x<m.w&&z<m.h&&m.tiles[Math.floor(z)*m.w+Math.floor(x)]===1
  if(!m.inf)return null
  const c0x=Math.floor((r.x0+ox)/32),c1x=Math.floor((r.x1+ox-1)/32),c0y=Math.floor((r.y0+oz)/32),c1y=Math.floor((r.y1+oz-1)/32)
  for(let cy=c0y;cy<=c1y;cy++)for(let cx=c0x;cx<=c1x;cx++)for(const p of l1Puddles(m.inf.seed,cx,cy)){
    if(p.x+p.rx<r.x0+ox||p.x-p.rx>r.x1+ox||p.y+p.ry<r.y0+oz||p.y-p.ry>r.y1+oz)continue
    const lx=p.x-ox,lz=p.y-oz
    if(!f(lx-p.rx,lz-p.ry)||!f(lx+p.rx,lz+p.ry)||!f(lx-p.rx,lz+p.ry)||!f(lx+p.rx,lz-p.ry))continue
    const shape=new THREE.Shape()
    for(let i=0;i<=24;i++){
      const a=i/24*Math.PI*2,k=.9+.08*Math.sin(a*3+p.phase)+.045*Math.cos(a*7+p.phase*.7),u=Math.cos(a)*p.rx*k,v=Math.sin(a)*p.ry*k
      const px=u*Math.cos(p.angle)-v*Math.sin(p.angle),pz=u*Math.sin(p.angle)+v*Math.cos(p.angle);i?shape.lineTo(px,pz):shape.moveTo(px,pz)
    }
    const geo=new THREE.ShapeGeometry(shape);geo.rotateX(-Math.PI/2);geo.translate(lx,.022,lz);parts.push(geo)
  }
  if(!parts.length)return null
  const result=mergeGeometries(parts);for(const p of parts)p.dispose();return result
}

/** One 512px reflection target for the current parking chunk, capped at 15Hz. */
export class L1WaterReflection {
  private mirror:Reflector|null=null
  private key=''
  private last=-Infinity
  private blackout=false
  update(scene:THREE.Scene,m:GameMap,x:number,z:number,realistic:boolean,time:number,blackout:boolean){
    if(!m.inf||l1StyleAt(m,x,z)!=='parking'||!realistic||getReflectK()<=0){this.clear(scene);return}
    const cx=Math.floor((x+m.inf.ox)/32),cz=Math.floor((z+m.inf.oy)/32),key=`${cx},${cz}:${m.inf.ox},${m.inf.oy}`
    if(key!==this.key){
      this.clear(scene);this.key=key
      const x0=cx*32-m.inf.ox,z0=cz*32-m.inf.oy
      const geo=l1PuddleGeometry(m,{x0,y0:z0,x1:x0+32,y1:z0+32});if(!geo)return
      // Reflector's reflection normal is local +Z, so transform XY geometry and rotate the object.
      geo.rotateX(Math.PI/2)
      const shader={name:'L1WetReflection',uniforms:{color:{value:new THREE.Color()},tDiffuse:{value:null},textureMatrix:{value:new THREE.Matrix4()}},
        vertexShader:`uniform mat4 textureMatrix;varying vec4 vMirror;
          void main(){vMirror=textureMatrix*vec4(position,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader:`uniform vec3 color;uniform sampler2D tDiffuse;varying vec4 vMirror;
          void main(){vec4 uv=vMirror;uv.xy+=sin(uv.yx*13.)*.0004*uv.w;
          vec3 c=texture2DProj(tDiffuse,uv).rgb;gl_FragColor=vec4(c*color,.46);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          }`}
      const mirror=new Reflector(geo,{textureWidth:512,textureHeight:512,multisample:0,color:0x737d75,clipBias:.003,shader})
      mirror.rotation.x=-Math.PI/2;mirror.position.y=.006;const material=mirror.material as THREE.ShaderMaterial;material.transparent=true;material.depthWrite=false
      mirror.name='l1-single-puddle-reflection';mirror.renderOrder=1
      const original=mirror.onBeforeRender.bind(mirror)
      mirror.onBeforeRender=(renderer,...args)=>{
        if(time===-1)return
        const now=performance.now()/1000
        if(now-this.last<1/15)return
        this.last=now
        const auto=renderer.shadowMap.autoUpdate;renderer.shadowMap.autoUpdate=false
        try{original(renderer,...args)}finally{renderer.shadowMap.autoUpdate=auto}
      }
      this.mirror=mirror;scene.add(mirror)
    }
    if(blackout!==this.blackout){this.last=-Infinity;this.blackout=blackout}
  }
  clear(scene:THREE.Scene){if(this.mirror){scene.remove(this.mirror);this.mirror.geometry.dispose();this.mirror.dispose();this.mirror=null}this.key='';this.last=-Infinity}
}

