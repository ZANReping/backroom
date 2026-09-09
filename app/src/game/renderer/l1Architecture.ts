import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameMap } from '../world/mapgen'
import type { LightSource,Structure } from '../core/types'
import { l1Hash,l1Profile,l1VaultAt } from '../world/l1Architecture'
import { l1Material,l1WorldUV } from './l1Materials'
import type { TerrainRange } from './geometry'
import { l1PuddleGeometry } from './l1Water'

type Fixture={mat:THREE.MeshBasicMaterial;seed:number;src?:LightSource}
type Surface=Parameters<typeof l1Material>[1]
export function buildL1Column(s:Structure):THREE.Group {
  const v=String(s.data?.l1Column),p=l1Profile(v),g=new THREE.Group()
  const h=v==='gothic'?1.96:p.height-.22
  const geo=v==='gothic'?new THREE.CylinderGeometry(.44,.49,h,20):new THREE.BoxGeometry(.98,h,.98)
  geo.translate(0,h/2,0);l1WorldUV(geo,s.x+.5,s.y+.5,.48)
  g.add(new THREE.Mesh(geo,l1Material(v,'concrete')))
  const base=new THREE.BoxGeometry(v==='gothic'?.98:1.04,.2,v==='gothic'?.98:1.04);base.translate(0,.1,0)
  g.add(new THREE.Mesh(base,l1Material(v,v==='ouroboros'?'peeling':'concrete')))
  if(v==='ouroboros'){
    const patch=new THREE.BoxGeometry(.986,2,.986);patch.translate(0,1.22,0)
    g.add(new THREE.Mesh(patch,l1Material(v,'peeling')))
  }
  if(v==='parking'){
    for(const x of [-.496,.496]){
      const stripe=new THREE.BoxGeometry(.008,.8,.075);stripe.translate(x,.55,.32)
      g.add(new THREE.Mesh(stripe,l1Material('gothic','line')))
    }
  }
  g.position.set(s.x+s.w/2,0,s.y+s.h/2)
  return g
}

/** All static services are material-batched; absolute world grid guarantees phase across chunk rebases. */
export function* buildL1Architecture(m:GameMap,range:TerrainRange,g:THREE.Group,lights:LightSource[],fixtures:Fixture[]):Generator<void> {
  const v=range.variant??'parking';if(v==='aisle'||v==='maintenance')return
  const H=l1Profile(v).height,ox=m.inf?.ox??0,oz=m.inf?.oy??0
  const {x0,z0,x1,z1}={x0:range.x0,z0:range.y0,x1:range.x1,z1:range.y1}
  const buckets=new Map<Surface,THREE.BufferGeometry[]>()
  try {
  const add=(geo:THREE.BufferGeometry,mat:Surface='concrete')=>{
    l1WorldUV(geo,ox,oz,mat==='ground'?.65:.35)
    const a=buckets.get(mat)??[];a.push(geo);buckets.set(mat,a)
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:Surface='concrete')=>{const b=new THREE.BoxGeometry(w,h,d);b.translate(x,y,z);add(b,mat)}
  const tube=(a:THREE.Vector3,b:THREE.Vector3,r:number,mat:Surface='metal')=>{
    const d=b.clone().sub(a),geo=new THREE.CylinderGeometry(r,r,d.length(),8)
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()))
    geo.translate(...a.clone().add(b).multiplyScalar(.5).toArray() as [number,number,number]);add(geo,mat)
  }
  const pipe=(ax:number,ay:number,az:number,bx:number,by:number,bz:number,r:number,mat:Surface='metal')=>tube(new THREE.Vector3(ax,ay,az),new THREE.Vector3(bx,by,bz),r,mat)
  const floor=(x:number,z:number)=>x>=0&&z>=0&&x<m.w&&z<m.h&&m.tiles[Math.floor(z)*m.w+Math.floor(x)]===1
  const mod=(x:number,n:number)=>(x%n+n)%n
  const columns=m.structures.filter(s=>s.data?.l1Column&&s.x>=x0&&s.x<x1&&s.y>=z0&&s.y<z1)
  if(v==='parking'){
    const puddles=l1PuddleGeometry(m,range)
    if(puddles){const mesh=new THREE.Mesh(puddles,l1Material(v,'wet'));mesh.userData.noCastShadow=true;mesh.name='l1-wet-floor';g.add(mesh)}
  }

  if(v==='gothic'){
    // Tile-local surfaces share analytic normals, including at chunk boundaries. No straight bridge boxes.
    const positions:number[]=[],normals:number[]=[],uv:number[]=[]
    const vert=(x:number,z:number)=>{
      const h=l1VaultAt(m,x,z),e=.015
      const dx=(l1VaultAt(m,x+e,z)-l1VaultAt(m,x-e,z))/(e*2)
      const dz=(l1VaultAt(m,x,z+e)-l1VaultAt(m,x,z-e))/(e*2)
      const n=new THREE.Vector3(dx,-1,dz).normalize();positions.push(x,h,z);normals.push(n.x,n.y,n.z);uv.push((x+ox)*.35,(z+oz)*.35)
    }
    for(let z=z0;z<z1;z+=.5)for(let x=x0;x<x1;x+=.5){
      if(!floor(x+.25,z+.25))continue
      vert(x,z);vert(x+.5,z);vert(x+.5,z+.5);vert(x,z);vert(x+.5,z+.5);vert(x,z+.5)
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2))
    const vault=new THREE.Mesh(geo,l1Material(v,'ceiling'));vault.name='l1-continuous-cross-vault';g.add(vault)
    for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++)if(floor(x,z)&&mod(x+ox,5)===2&&mod(z+oz,5)<3)box(x+.5,.014,z+.5,.065,.014,.92,'line')
  }
  yield
  for(let z=z0;z<z1;z++){
    const wz=z+oz
    for(let x=x0;x<x1;x++){
      if(!floor(x,z))continue
      const wx=x+ox
      // Main structural grid; services run between beams, not through the column shafts.
      if(v!=='gothic'){
        if(mod(wx-6,8)===0)box(x+.5,H-.23,z+.5,.6,.46,1.005)
        if(mod(wz-6,8)===0)box(x+.5,H-.27,z+.5,1.005,.54,.52)
        if(mod(wz-2,8)===0)box(x+.5,H-.12,z+.5,1.005,.24,.2)
      }
      if(v==='storage')for(let k=0;k<3;k++)box(x+(k+.5)/3,H-.035,z+.5,.035,.065,1.002,'metal')
      if(v!=='garden'&&v!=='gothic'){
        if(mod(wz-3,8)===0){
          pipe(x,H-.82,z+.5,x+1,H-.82,z+.5,v==='parking'?.045:.085,v==='ouroboros'?'red':'metal')
          if(mod(wx,3)===0){pipe(x+.5,H-.82,z+.5,x+.5,H-.08,z+.5,.012,'metal');pipe(x+.46,H-.82,z+.5,x+.54,H-.82,z+.5,v==='parking'?.057:.103,'metal')}
        }
        if(mod(wx-2,8)===0){
          box(x+.5,H-.56,z+.5,.35,.06,1.005,'metal')
          for(const dx of [-.17,.17])box(x+.5+dx,H-.49,z+.5,.025,.14,1.005,'metal')
          for(const dx of [-.11,-.035,.045,.11])pipe(x+.5+dx,H-.48,z,x+.5+dx,H-.48,z+1,.018,'cable')
          if(mod(wz,3)===0)for(const dx of [-.2,.2])pipe(x+.5+dx,H-.53,z+.5,x+.5+dx,H-.02,z+.5,.01)
        }
        if(v!=='parking'&&mod(wz-1,16)===0){
          pipe(x,H-1.13,z+.5,x+1,H-1.13,z+.5,.29)
          pipe(x+.47,H-1.13,z+.5,x+.53,H-1.13,z+.5,.306)
          if(mod(wx,4)===0)for(const dz of [-.32,.32])pipe(x+.5,H-1.18,z+.5+dz,x+.5,H-.06,z+.5+dz,.016)
        }
        // Small conduits connect trunk lines at right angles, with junction boxes.
        if(mod(wx-10,16)===0){pipe(x+.5,H-.38,z,x+.5,H-.38,z+1,.025);if(mod(wz-3,8)===0)box(x+.5,H-.38,z+.5,.2,.13,.22,'metal')}
      }
    }
    if((z-z0)%8===7)yield
  }

  for(const L of lights){
    if(!L.noFix)continue
    const y=L.fixZ??H-.4,x=L.x,z=L.y
    if(v==='garden'){
      // Recessed skylight; light proxies remain indoor and keep their independent supply.
      box(x,H+.055,z,2.7,.09,3.5,'concrete')
      for(const dx of [-1.4,1.4])box(x+dx,H-.12,z,.14,.25,3.7)
      for(const dz of [-1.8,1.8])box(x,H-.12,z+dz,2.8,.25,.14)
    }else{
      const w=v==='storage'?1.5:1.2,d=v==='storage'?.64:.22
      box(x,y+.065,z,w+.13,.12,d+.13,'metal')
      for(const dx of [-w*.38,w*.38])pipe(x+dx,y+.1,z,x+dx,H-.02,z,.012)
      pipe(x,y+.08,z,x,H-.4,z,.017,'cable')
      const points=[]
      for(let k=0;k<=8;k++){const t=k/8;points.push(new THREE.Vector3(x+t*1.8,y+.12+Math.sin(t*Math.PI)*-.23+(H-y-.5)*t,z))}
      if(v==='ouroboros')for(let k=0;k<8;k++)tube(points[k],points[k+1],.018,'cable')
    }
    const mat=new THREE.MeshBasicMaterial({color:L.color});mat.userData.base=new THREE.Color(L.color);mat.userData.l1Owned=true
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(v==='garden'?2.6:v==='storage'?1.5:1.14,.035,v==='garden'?3.4:v==='storage'?.6:.18),mat)
    lamp.position.set(x,y,z);lamp.name='l1-powered-luminaire';g.add(lamp);fixtures.push({mat,seed:L.flickerSeed,src:L})
    if(v==='parking'){
      const nearest=columns.reduce<Structure|undefined>((a,s)=>!a||Math.hypot(s.x-x,s.y-z)<Math.hypot(a.x-x,a.y-z)?s:a,undefined)
      if(nearest&&Math.hypot(nearest.x-x,nearest.y-z)<5){
        const geo=new THREE.BoxGeometry(.045,1.55,.12),f=new THREE.Mesh(geo,mat);f.position.set(nearest.x+1.075,2.45,nearest.y+.5);g.add(f)
        box(nearest.x+1.03,2.45,nearest.y+.5,.06,1.7,.2,'metal')
      }
    }
  }
  yield
  if(v==='ouroboros'){
    for(const s of columns.slice(0,6)){
      const patch=new THREE.BoxGeometry(1.1,1.85,.06);patch.rotateX(-.12);patch.translate(s.x+1.5,.93,s.y+.55);add(patch,'peeling')
      for(let k=0;k<6;k++)box(s.x+1.08+k*.16,.85,s.y+.3,.018,1.65,.03,'metal')
      for(let k=0;k<5;k++)box(s.x+1.45,.2+k*.3,s.y+.3,.98,.018,.03,'metal')
    }
  }
  if(v==='garden'){
    const near:THREE.BufferGeometry[]=[],mid:THREE.BufferGeometry[]=[],far:THREE.BufferGeometry[]=[]
    const card=(x:number,y:number,z:number,w:number,h:number,angle:number,n:number)=>{
      const geo=new THREE.PlaneGeometry(w,h);geo.rotateY(angle);geo.translate(x,y,z)
      near.push(geo);if(n%3===0)mid.push(geo.clone());if(n%7===0)far.push(geo.clone())
    }
    for(const s of columns){
      for(let k=0;k<38;k++){
        const a=k*2.4,h=.35+(k%13)*.46,r=.54+l1Hash(s.x+ox,k,8)*.12
        card(s.x+.5+Math.sin(a)*r,h,s.y+.5+Math.cos(a)*r,1.1,1.55,a,k)
      }
    }
    for(let z=z0+2;z<z1;z+=4)for(let x=x0+2;x<x1;x+=4){
      if(!floor(x,z))continue
      const h=l1Hash(x+ox,z+oz,17),len=2+h*3.2
      for(let j=0;j<5;j++)card(x+Math.sin(j)*.2,H-.5-j*len/5,z,1.2,len/3,.6+j*.22,j)
    }
    for(let z=z0;z<z1;z+=2)for(let x=x0;x<x1;x+=2){
      if(!floor(x,z))continue
      const r=l1Hash(x+ox,z+oz,11);card(x+.2+r,.13,z+.3,1.7,.3,r*6,Math.floor(r*19))
    }
    const lod=new THREE.LOD();lod.name='l1-ivy-lod';lod.position.set((x0+x1)/2,0,(z0+z1)/2)
    for(const [parts,dist]of [[near,0],[mid,24],[far,48]] as const){
      if(!parts.length)continue
      const geo=mergeGeometries(parts)!;for(const p of parts)p.dispose();geo.translate(-lod.position.x,0,-lod.position.z)
      const mesh=new THREE.Mesh(geo,l1Material(v,'leaf'));mesh.userData.noCastShadow=dist>0;lod.addLevel(mesh,dist)
    }
    g.add(lod)
    // Leaf-shaped dapple on ground: additive only in the small sun patches, never a global green ambient wash.
    const sunMat=new THREE.MeshBasicMaterial({color:'#d9d488',transparent:true,opacity:.19,depthWrite:false,blending:THREE.AdditiveBlending});sunMat.userData.l1Owned=true
    const patches:THREE.BufferGeometry[]=[]
    for(const L of lights)for(let i=0;i<24;i++){
      const x=L.x-2+l1Hash(L.x+ox,i,9)*4,z=L.y-2+l1Hash(L.y+oz,i,10)*5
      if(!floor(x,z))continue
      const p=new THREE.CircleGeometry(.07+l1Hash(i,L.y+oz)*.24,5);p.rotateX(-Math.PI/2);p.scale(1,1,2.1);p.translate(x,.019,z);patches.push(p)
    }
    if(patches.length){const mesh=new THREE.Mesh(mergeGeometries(patches)!,sunMat);mesh.userData.noCastShadow=true;g.add(mesh);for(const p of patches)p.dispose()}
  }
  for(const [surface,parts]of buckets){
    if(!parts.length)continue
    const mesh=new THREE.Mesh(mergeGeometries(parts)!,l1Material(v,surface));mesh.name=`l1-batch-${surface}`
    mesh.userData.noCastShadow=['metal','red','cable','line'].includes(surface)
    for(const p of parts)p.dispose();g.add(mesh)
  }
  } finally {for(const parts of buckets.values())for(const geo of parts)geo.dispose()}
}
