import * as THREE from 'three'
import type {GameMap} from '../world/mapgen'
import type {Structure,LightSource} from '../core/types'
import type {TerrainRange} from './geometry'
import {l3Height,l3StyleAt,l3ArchProfile,L3_NARROW_TINT} from '../world/l3Architecture'
import {L3Builder} from './l3Meshes'
import {l3WorldUV} from './l3Materials'
import {col} from './shared'
import {buildL3Pipes} from './l3Pipes'
import {buildL3PurpleBrick} from './l3PurpleBrick'
import {l3NarrowProfile} from '../world/l3NarrowProfile'
import {l3NarrowPortal} from './l3NarrowPortal'

function shell(points:number[][],z0:number,z1:number){
  const pos:number[]=[],uv:number[]=[],indices:number[]=[]
  let distance=0
  for(let i=0;i<points.length;i++){
    if(i)distance+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1])
    for(const z of [z0,z1]){pos.push(points[i][0],points[i][1],z);uv.push(z*.8,distance*.8)}
  }
  for(let i=0;i<points.length-1;i++){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g
}

export function* buildL3Architecture(m:GameMap,r:TerrainRange,group:THREE.Group,structures:Structure[],lights:LightSource[],fixtures:{mat:THREE.MeshBasicMaterial;seed:number;src?:LightSource}[]):Generator<void> {
  const v=r.variant??'lit',H=l3Height(v),b=new L3Builder(v),oz=m.inf?.oy??0
  // Ceiling concrete uses the same world UV basis as the terrain to avoid exposed brick seams.
  const concreteBox=(x:number,y:number,z:number,w:number,h:number,d:number)=>{
    const geo=new THREE.BoxGeometry(w,h,d)
    geo.translate(x,y,z)
    l3WorldUV(geo,m.inf?.ox??0,m.inf?.oy??0,.45)
    b.add(geo,'ceiling',false)
  }
  const floor=(x:number,z:number)=>x>=0&&z>=0&&x<m.w&&z<m.h&&m.tiles[z*m.w+x]===1
  const narrow=(x:number,z:number)=>m.tint[z*m.w+x]===L3_NARROW_TINT
  const room=['assembly','genhall','boiler','sanct'].includes(v)
  const occupied=(x:number,z:number)=>structures.some(s=>s.solid&&x+.5>=s.x&&x+.5<s.x+s.w&&z+.5>=s.y&&z+.5<s.y+s.h)
  for(let z=r.y0;z<r.y1;z++) {
    for(let x=r.x0;x<r.x1;x++) {
      if(!floor(x,z))continue
      const localH=l3Height(l3StyleAt(m,x+.5,z+.5))
      // Close unequal ceiling heights at streaming chunk boundaries.
      for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]){
        const nx=x+dx,nz=z+dz
        if(!floor(nx,nz))continue
        const nh=l3Height(l3StyleAt(m,nx+.5,nz+.5))
        if(nh<localH-.01){
          concreteBox(x+.5+dx*.5,(localH+nh)/2,z+.5+dz*.5,dx?.12:1,localH-nh,dz?.12:1)
          b.box(x+.5+dx*.5,nh-.07,z+.5+dz*.5,dx?.24:1,.14,dz?.24:1,'iron')
        }
      }
      if(narrow(x,z)) {
        const pts=l3NarrowProfile().map(([px,py])=>[x+.5+px,py])
        b.add(shell(pts,z,z+1),'brick',false)
        for(const dz of [-1,1])if(floor(x,z+dz)&&!narrow(x,z+dz)){
          b.add(l3NarrowPortal(x,z,dz),'brick')
        }
        continue
      }
      if(v==='sanct')continue
      // Concrete lintel/fascia and dark skirting run only along actual wall faces.
      for(const [dx,dz]of [[-1,0],[1,0],[0,-1],[0,1]]) {
        if(floor(x+dx,z+dz))continue
        const wx=x+.5+dx*.485,wz=z+.5+dz*.485
        if(!room||v==='assembly')concreteBox(wx,localH-.315,wz,dx?.08:1,.67,dz?.08:1)
        b.box(wx,.095,wz,dx?.055:1,.19,dz?.055:1,'brick')
      }
      // Overhead beams and parallel pipes emphasise the factory's high ceiling.
      if((z+oz)%6===0&&!occupied(x,z))concreteBox(x+.5,localH-.155,z+.5,1,.35,.25)
    }
    if((z-r.y0)%8===0)yield
  }
  yield* buildL3Pipes(m,r,b,structures)
  const purple=buildL3PurpleBrick(m,Math.floor((r.x0+(m.inf?.ox??0))/32),Math.floor((r.y0+(m.inf?.oy??0))/32))
  if(purple)group.add(purple)
  // Basilica: nave and side aisles share a continuous pointed brick vault.
  if(v==='sanct') {
    const x0=r.x0,z0=r.y0
    for(const [a,c,base,rise]of [[2,10.5,4.53,2.2],[10.5,21.5,4.53,3.75],[21.5,30,4.53,2.2]]) {
      const pts:number[][]=[]
      for(let j=0;j<=48;j++){const t=j/48;pts.push([x0+a+(c-a)*t,base+rise*l3ArchProfile(t)])}
      b.add(shell(pts,z0+2,z0+30),'brick',true)
      for(const zz of [5.5,12.5,19.5,26.5]) {
        const rib=pts.map(([x,y])=>[x,y-.025,z0+zz]);b.tube(rib,.13,'brick')
        // Secondary ribs define the Gothic bay edges without suspended tips.
        b.tube(pts.map(([x,y])=>[x,y+.11,z0+zz-.22]),.065,'brick')
      }
    }
    // Longitudinal pointed arcades over the two classical colonnades.
    for(const xx of [10.5,21.5])for(const zz of [5.5,12.5,19.5]) {
      const pts:number[][]=[];for(let j=0;j<=32;j++){const t=j/32;pts.push([x0+xx,4.53+2.1*l3ArchProfile(t),z0+zz+7*t])}b.tube(pts,.18,'brick')
    }
  }
  // Two-tube fluorescent housings / compact caged incandescent fixtures.
  for(const L of lights) {
    const x=L.x,z=L.y,y=L.fixZ??H-.25,nn=narrow(Math.floor(x),Math.floor(z)),warm=nn||v==='boiler'||v==='sanct'||v==='dark'
    const material=new THREE.MeshBasicMaterial({color:L.color});material.userData.base=col(L.color)
    if(y<1.5) {
      b.box(x,.12,z,.28,.2,.28,'iron')
      const lens=new THREE.Mesh(new THREE.CircleGeometry(.10,16),material);lens.rotation.x=-Math.PI/2;lens.position.set(x,.225,z);group.add(lens)
    } else if(warm) {
      b.box(x,y+.05,z,.20,.08,.2,'iron')
      const bulb=new THREE.Mesh(new THREE.SphereGeometry(.065,10,8),material);bulb.position.set(x,y-.075,z);group.add(bulb)
      for(const dx of [-.085,.085])b.box(x+dx,y-.085,z,.009,.22,.14,'iron')
      b.ring(x,y-.085,z,.085,'iron')
    } else {
      b.box(x,y+.04,z,.24,.09,1.24,'paint')
      for(const dx of [-.067,.067]){const tube=new THREE.Mesh(new THREE.CylinderGeometry(.023,.023,1.14,10),material);tube.rotation.x=Math.PI/2;tube.position.set(x+dx,y-.018,z);group.add(tube)}
      for(const dz of [-.6,.6])b.box(x,y-.005,z+dz,.23,.06,.05,'iron')
    }
    const roof=l3Height(l3StyleAt(m,x,z))
    if(y>=1.5&&y<roof-.4)b.cyl(x,(y+roof)/2,z,.009,roof-y,'iron')
    fixtures.push({mat:material,seed:L.flickerSeed,src:L})
  }
  group.add(b.finish())
}
