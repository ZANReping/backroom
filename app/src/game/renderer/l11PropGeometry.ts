import * as THREE from 'three'
import type { L11PropPart } from '../content/l11PropKit'
import { l11PropShape } from '../content/l11PropShapes'

const prepared=new WeakMap<L11PropPart,{geometry:THREE.BufferGeometry;uv:Float32Array;matrix:THREE.Matrix4}>()

/** Unit geometry stays on the CPU; only CityBatch's merged buffers reach the GPU.
 * UV coordinates are metres, in the part's local frame, before its rotation.
 * A 5cm rail therefore never receives a whole 80cm sheet of wood grain. */
export function l11PropGeometry(p:L11PropPart){
  const hit=prepared.get(p);if(hit)return hit
  const {geometry,matrix}=l11PropShape(p)
  const pos=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),unitUV=geometry.getAttribute('uv'),uv=new Float32Array(pos.count*2)
  const dims=[p.w,p.h,p.d],grain=p.grain??(['x','y','z'] as const)[dims.indexOf(Math.max(...dims))],gi={x:0,y:1,z:2}[grain]
  const scale=p.uvScale??1,off=p.uvOffset??[p.x*.37+p.z*.19,p.y*.29]
  const a=p.w/2,b=p.d/2,circumference=Math.PI*(3*(a+b)-Math.sqrt((3*a+b)*(a+3*b)))
  for(let i=0;i<pos.count;i++){
    let u=0,v=0
    if(p.shape==='box'||p.shape==='plane'){
      const n=[Math.abs(normal.getX(i)),Math.abs(normal.getY(i)),Math.abs(normal.getZ(i))],major=n.indexOf(Math.max(...n)),axes=major===0?[2,1]:major===1?[0,2]:[0,1]
      if((p.surface==='wood'||p.surface==='rawwood')&&axes[1]===gi)axes.reverse()
      const q=[pos.getX(i)*p.w,pos.getY(i)*p.h,pos.getZ(i)*p.d]
      u=q[axes[0]];v=q[axes[1]]
    }else if(p.shape==='cylinder'){
      if(Math.abs(normal.getY(i))>.99){u=pos.getX(i)*p.w;v=pos.getZ(i)*p.d}
      else{u=unitUV.getX(i)*circumference;v=unitUV.getY(i)*p.h;if(p.surface==='wood'||p.surface==='rawwood')[u,v]=[v,u]}
    }else if(p.shape==='ring'){
      u=unitUV.getX(i)*Math.PI*(p.w+p.h-p.d*2)/2*(p.arc??Math.PI*2)/(Math.PI*2);v=unitUV.getY(i)*Math.PI*p.d
    }else{u=unitUV.getX(i)*Math.PI*(p.w+p.d)/2;v=unitUV.getY(i)*Math.PI*p.h/2}
    // Wood051 runs along U; the pale Wood092 scan runs along V.
    if(p.surface==='rawwood')[u,v]=[v,u]
    uv[i*2]=(u+off[0])*scale;uv[i*2+1]=(v+off[1])*scale
  }
  const value={geometry,uv,matrix};prepared.set(p,value);return value
}
