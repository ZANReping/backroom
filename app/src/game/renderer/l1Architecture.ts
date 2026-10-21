import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameMap } from '../world/mapgen'
import type { LightSource,Structure } from '../core/types'
import { l1Hash,l1Profile,l1VaultAt } from '../world/l1Architecture'
import { l1Material,l1WorldUV } from './l1Materials'
import type { TerrainRange } from './geometry'
import { l1PuddleGeometry } from './l1Water'
import { coalesceL1Runs,type L1ServiceRun } from './l1ServiceRuns'
import {l1PathRoom} from '../world/l1Spatial'

type Fixture={mat:THREE.MeshBasicMaterial;seed:number;src?:LightSource;batch?:THREE.InstancedMesh;index?:number}
type Surface=Parameters<typeof l1Material>[1]
// Repeated services share immutable primitive data; building a chunk does not
// allocate thousands of temporary Three.js geometries for ribs and conduits.
const serviceBox=new THREE.BoxGeometry(1,1,1)
const serviceTube=new THREE.CylinderGeometry(1,1,1,8)
export function buildL1Column(s:Structure,ox=0,oz=0):THREE.Group {
  const v=String(s.data?.l1Column),p=l1Profile(v),g=new THREE.Group()
  // Bury the shaft cap inside the vault: the sampled underside defines the
  // visible springing and cannot leave a narrow gap above the circular shaft.
  const h=v==='gothic'?2.4:p.height-.22
  const geo=v==='gothic'||s.data?.l1Round?new THREE.CylinderGeometry(v==='gothic'?.49:.44,.49,h,20):new THREE.BoxGeometry(s.w-.02,h,s.h-.02)
  geo.translate(0,h/2,0)
  if(v==='gothic'||s.data?.l1Round){const uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*Math.PI*.98*.32,uv.getY(i)*h*.32)}
  else l1WorldUV(geo,s.x+ox+.5,s.y+oz+.5,.32)
  const dress=Number(s.data?.l1Dress??Math.floor(l1Hash(s.x+ox,s.y+oz,507)*5)),round=v==='gothic'||s.data?.l1Round
  g.add(new THREE.Mesh(geo,l1Material(v,v==='ouroboros'?'columnRaw':v!=='gothic'&&dress===0?'columnPaint':'column')))
  // The radial springing is part of the continuous vault itself. A second
  // coincident collar would z-fight with that surface around the shaft.
  const parts=new Map<Surface,THREE.BufferGeometry[]>()
  const part=(geo:THREE.BufferGeometry,surface:Surface)=>{l1WorldUV(geo,s.x+ox+s.w/2,s.y+oz+s.h/2,.32);const list=parts.get(surface)??[];list.push(geo);parts.set(surface,list)}
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,surface:Surface)=>{const a=new THREE.BoxGeometry(w,h,d);a.translate(x,y,z);part(a,surface)}
  const radius=s.w/2
  if(v==='ouroboros'){
    // Asymmetric stripped paint/formwork faces; do not wrap every shaft with
    // the same full cube. The repaired bands vary in height and coverage.
    const ph=1.4+dress*.26
    for(const side of dress%2?[0,2]:[1,2,3]){
      const a=new THREE.BoxGeometry(s.w-.04,ph,.014);a.translate(0,.16+ph/2,radius-.003);a.rotateY(side*Math.PI/2);part(a,dress===3?'columnPaint':'peeling')
    }
    if(dress>1)box(radius+.006,.75,0,.015,1.25,.28,'guard')
  }else if(v==='gothic'){
    const base=new THREE.CylinderGeometry(.495,.51,.56,20);base.translate(0,.28,0);part(base,'columnRaw')
    if(dress===3){const seam=new THREE.TorusGeometry(.493,.012,4,20);seam.rotateX(Math.PI/2);seam.translate(0,.65,0);part(seam,'columnRaw')}
  }else if(v!=='garden'&&dress>0){
    if(dress===1||dress===4){
      // Low protective corner angles on only selected square columns.
      if(!round)for(const sign of [-1,1]){box(sign*(radius-.005),.44,radius-.01,.025,.88,.095,'guard');box(sign*(radius-.04),.44,radius+.005,.085,.88,.022,'guard')}
      else {const cuff=new THREE.CylinderGeometry(.495,.5,.42,20);cuff.translate(0,.21,0);part(cuff,'columnRaw')}
    }
    if(dress===2||dress===4){
      const pipe=new THREE.CylinderGeometry(.027,.027,h-.35,8);pipe.translate(radius+.015,(h+.15)/2,0);part(pipe,dress===4?'red':'whitePipe')
      for(let y=.65;y<h;y+=1.15)box(radius+.025,y,0,.04,.045,.105,'metal')
      box(radius+.037,.95,0,.09,.14,.12,'metal')
    }
    if(dress===3&&!round){
      box(0,h*.44,radius-.002,s.w-.045,h*.6,.016,'columnPaint')
      for(const y of [.52,1.58])for(const x of [-.24,.24])box(x,y,radius+.008,.028,.025,.008,'columnRaw')
    }
  }
  for(const [surface,list]of parts){g.add(new THREE.Mesh(mergeGeometries(list)!,l1Material(v,surface)));for(const a of list)a.dispose()}
  g.userData.l1Dress=dress
  g.position.set(s.x+s.w/2,0,s.y+s.h/2)
  return g
}

/** All static services are material-batched; absolute world grid guarantees phase across chunk rebases. */
export function* buildL1Architecture(m:GameMap,range:TerrainRange,g:THREE.Group,lights:LightSource[],fixtures:Fixture[]):Generator<void> {
  const v=range.variant??'parking';if(v==='aisle')return
  const H=l1Profile(v).height,ox=m.inf?.ox??0,oz=m.inf?.oy??0
  const {x0,z0,x1,z1}={x0:range.x0,z0:range.y0,x1:range.x1,z1:range.y1}
  const room=v==='maintenance'?l1PathRoom(m.inf?.seed??0,Math.floor((x0+ox)/32),Math.floor((z0+oz)/32)):null
  const inRoom=(x:number,z:number)=>!!room&&x+ox>room.x0&&x+ox<room.x1&&z+oz>room.y0&&z+oz<room.y1
  const buckets=new Map<Surface,THREE.BufferGeometry[]>()
  const services=new Map<Surface,{p:number[];n:number[];uv:number[];index:number[]}>()
  const runs:L1ServiceRun[]=[],runShapes=new Map<string,{kind:'box'|'pipe';axis:0|2;x:number;y:number;z:number;w:number;h:number;d:number;mat:Surface}>()
  try {
  const add=(geo:THREE.BufferGeometry,mat:Surface='concrete')=>{
    l1WorldUV(geo,ox,oz,mat==='ground'?.65:.35)
    const a=buckets.get(mat)??[];a.push(geo);buckets.set(mat,a)
  }
  const service=(template:THREE.BufferGeometry,x:number,y:number,z:number,w:number,h:number,d:number,mat:Surface,q?:THREE.Quaternion)=>{
    let a=services.get(mat);if(!a){a={p:[],n:[],uv:[],index:[]};services.set(mat,a)}
    const p=template.getAttribute('position'),n=template.getAttribute('normal'),offset=a.p.length/3,scale=mat==='ground'?.65:.35
    const vertex=new THREE.Vector3(),normal=new THREE.Vector3()
    for(let i=0;i<p.count;i++){
      vertex.set(p.getX(i)*w,p.getY(i)*h,p.getZ(i)*d);normal.set(n.getX(i)/w,n.getY(i)/h,n.getZ(i)/d).normalize()
      if(q){vertex.applyQuaternion(q);normal.applyQuaternion(q)}
      vertex.x+=x;vertex.y+=y;vertex.z+=z
      a.p.push(vertex.x,vertex.y,vertex.z);a.n.push(normal.x,normal.y,normal.z)
      const top=Math.abs(normal.y)>.55,xFace=Math.abs(normal.x)>Math.abs(normal.z)
      a.uv.push((top?vertex.x+ox:xFace?vertex.z+oz:vertex.x+ox)*scale,(top?vertex.z+oz:vertex.y)*scale)
    }
    const index=template.index!;for(let i=0;i<index.count;i++)a.index.push(offset+index.getX(i))
  }
  const run=(kind:'box'|'pipe',axis:0|2,x:number,y:number,z:number,w:number,h:number,d:number,mat:Surface,length:number)=>{
    const center=axis===0?x:z
    const key=[kind,axis,mat,...[axis===0?z:x,y,axis===0?w:d,h].map(n=>n.toFixed(6))].join(':')
    runShapes.set(key,{kind,axis,x,y,z,w,h,d,mat});runs.push({key,start:center-length/2,end:center+length/2})
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,mat:Surface='concrete')=>{
    // Only the repeated one-metre beams/ribs/trays qualify. Fittings keep their geometry.
    if(w>=1&&w<=1.006&&h<.5&&d<.7)run('box',0,x,y,z,d,h,d,mat,w)
    else if(d>=1&&d<=1.006&&h<.5&&w<.7)run('box',2,x,y,z,w,h,w,mat,d)
    else service(serviceBox,x,y,z,w,h,d,mat)
  }
  const tube=(a:THREE.Vector3,b:THREE.Vector3,r:number,mat:Surface='metal')=>{
    const d=b.clone().sub(a),length=d.length(),q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize())
    service(serviceTube,(a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2,r,length,r,mat,q)
  }
  const pipe=(ax:number,ay:number,az:number,bx:number,by:number,bz:number,r:number,mat:Surface='metal')=>{
    if(ay===by&&az===bz&&Math.abs(bx-ax)===1)run('pipe',0,(ax+bx)/2,ay,az,r,1,r,mat,1)
    else if(ay===by&&ax===bx&&Math.abs(bz-az)===1)run('pipe',2,ax,ay,(az+bz)/2,r,1,r,mat,1)
    else tube(new THREE.Vector3(ax,ay,az),new THREE.Vector3(bx,by,bz),r,mat)
  }
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
    for(let z=z0;z<z1;z+=.25){for(let x=x0;x<x1;x+=.25){
      if(!floor(x+.125,z+.125))continue
      vert(x,z);vert(x+.25,z);vert(x+.25,z+.25);vert(x,z);vert(x+.25,z+.25);vert(x,z+.25)
    }
    if(Math.round((z-z0)*4)%16===15)yield}
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
      if(v!=='gothic'&&v!=='maintenance'){
        if(mod(wx-6,8)===0)box(x+.5,H-.18,z+.5,.58,.36,1.005,v==='storage'?'metal':'concrete')
        if(mod(wz-6,8)===0)box(x+.5,H-.16,z+.5,1.005,.32,.48,v==='storage'?'metal':'concrete')
        if(mod(wz-2,8)===0)box(x+.5,H-.065,z+.5,1.005,.13,.16,v==='storage'?'metal':'concrete')
      }
      if(v==='maintenance'&&!inRoom(x+.5,z+.5)&&mod(wz-1,3)===0)box(x+.5,H-.1,z+.5,1.002,.2,.17,'concrete')
      if(v==='storage')for(let k=0;k<3;k++)box(x+(k+.5)/3,H-.035,z+.5,.035,.065,1.002,'metal')
      if(v!=='garden'&&v!=='gothic'&&!inRoom(x+.5,z+.5)){
        if(mod(wz-3,8)===0){
          const drop=v==='maintenance'?.19:v==='parking'?.37:.82,radius=v==='maintenance'?.025:v==='parking'?.035:.085
          pipe(x,H-drop,z+.5,x+1,H-drop,z+.5,radius,v==='ouroboros'?'red':'whitePipe')
          if(mod(wx,3)===0){pipe(x+.5,H-drop,z+.5,x+.5,H-.08,z+.5,.009,'metal');pipe(x+.46,H-drop,z+.5,x+.54,H-drop,z+.5,radius+.009,'metal')}
        }
        if(v!=='maintenance'&&mod(wx-2,8)===0){
          box(x+.5,H-.34,z+.5,.25,.035,1.005,'metal')
          for(const dx of [-.12,.12])box(x+.5+dx,H-.30,z+.5,.018,.09,1.005,'metal')
          for(const dx of [-.075,0,.075])pipe(x+.5+dx,H-.30,z,x+.5+dx,H-.30,z+1,.013,'cable')
          if(mod(wz,3)===0)for(const dx of [-.2,.2])pipe(x+.5+dx,H-.53,z+.5,x+.5+dx,H-.02,z+.5,.01)
        }
        if(v!=='parking'&&v!=='maintenance'&&mod(wz-1,16)===0){
          pipe(x,H-1.13,z+.5,x+1,H-1.13,z+.5,.29)
          pipe(x+.47,H-1.13,z+.5,x+.53,H-1.13,z+.5,.306)
          if(mod(wx,4)===0)for(const dz of [-.32,.32])pipe(x+.5,H-1.18,z+.5+dz,x+.5,H-.06,z+.5+dz,.016)
        }
        // Small conduits connect trunk lines at right angles, with junction boxes.
        if(mod(wx-10,16)===0){pipe(x+.5,H-.38,z,x+.5,H-.38,z+1,.025);if(mod(wz-3,8)===0)box(x+.5,H-.38,z+.5,.2,.13,.22,'metal')}
        // Red parallel service bundles and larger white return pipes. Their
        // straight runs are coalesced across cells, including negative worlds.
        const dense=v==='ouroboros'||v==='parking'&&l1Hash(Math.floor(wx/24),Math.floor(wz/24),m.inf?.seed??0)>.35
        if(dense&&mod(wx-5,8)===0){
          for(let k=0;k<(v==='ouroboros'?6:4);k++)pipe(x+.08+k*.14,H-.52,z,x+.08+k*.14,H-.52,z+1,.018,'red')
          if(mod(wz,4)===0){box(x+.45,H-.55,z+.5,.95,.035,.045,'metal');pipe(x+.84,H-.55,z+.5,x+.84,H-.035,z+.5,.012,'metal')}
        }
        if((v==='parking'||v==='ouroboros')&&mod(wz-7,16)===0){
          pipe(x,H-.68,z+.38,x+1,H-.68,z+.38,v==='ouroboros'?.17:.095,'whitePipe')
          if(mod(wx,4)===0)pipe(x+.46,H-.68,z+.38,x+.54,H-.68,z+.38,v==='ouroboros'?.185:.108,'metal')
        }
      }
    }
    if((z-z0)%8===7)yield
  }

  if(room){
    const x=room.x1-ox-.18,back=room.y0-oz+.3,front=room.y1-oz-.2,y=H-.22
    pipe(x,y,back,x,y,front,.026)
    pipe(room.x0-ox+.1,y,front-.65,x,y,front-.65,.026)
    for(let z=back+.4;z<front;z+=2){pipe(x,y,z,x,H-.035,z,.008);pipe(x,y,z-.04,x,y,z+.04,.033)}
    pipe(x,y,back,x,H-.57,back,.026)
  }

  const emitter=new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false});emitter.userData.base=new THREE.Color('#ffffff');emitter.userData.l1Owned=true
  const lamps=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),emitter,lights.length*3)
  lamps.name='l1-batched-fluorescent-tubes';let lampIndex=0
  const lampMatrix=new THREE.Matrix4(),lampQuaternion=new THREE.Quaternion()
  const emit=(L:LightSource,x:number,y:number,z:number,w:number,h:number,d:number)=>{
    const index=lampIndex++;lampMatrix.compose(new THREE.Vector3(x,y,z),lampQuaternion,new THREE.Vector3(w,h,d));lamps.setMatrixAt(index,lampMatrix)
    lamps.setColorAt(index,new THREE.Color(L.color).multiplyScalar(L.keep?1.2:L.natural?1.05:3.2*Math.pow(L.intensityMul??1,.3)))
    fixtures.push({mat:emitter,seed:L.flickerSeed,src:L,batch:lamps,index})
  }
  for(const L of lights){
    if(!L.noFix)continue
    const y=L.fixZ??H-.4,x=L.x,z=L.y
    if(L.keep){box(x,y+.025,z,.4,.22,.08,'cable');emit(L,x,y,z,.34,.14,.085);continue}
    if(v==='maintenance'&&inRoom(x,z)){
      box(x,y+.035,z,.19,.055,1.28,'metal')
      for(const dx of [-.047,.047])emit(L,x+dx,y,z,.032,.032,1.18)
      continue
    }
    if(v==='garden'){
      // Recessed skylight; the anomalous daylight follows the native power event.
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
    if(v==='garden'||v==='storage')emit(L,x,y,z,v==='garden'?2.6:1.5,.035,v==='garden'?3.4:.6)
    else for(const dz of [-.057,.057])emit(L,x,y,z+dz,1.14,.037,.037)
    if(v==='parking'){
      const nearest=columns.reduce<Structure|undefined>((a,s)=>!a||Math.hypot(s.x-x,s.y-z)<Math.hypot(a.x-x,a.y-z)?s:a,undefined)
      if(nearest&&Math.hypot(nearest.x-x,nearest.y-z)<5){
        emit(L,nearest.x+1.025,2.1,nearest.y+.5,.038,1.35,.055)
        box(nearest.x+1.005,2.1,nearest.y+.5,.025,1.43,.12,'metal')
      }
    }
  }
  if(lampIndex){lamps.count=lampIndex;lamps.instanceMatrix.needsUpdate=true;lamps.computeBoundingSphere();g.add(lamps)}
  else{lamps.geometry.dispose();emitter.dispose()}
  yield
  if(v==='ouroboros'){
    for(const s of columns.slice(0,6)){
      const patch=new THREE.BoxGeometry(1.1,1.85,.06);patch.rotateX(-.12);patch.translate(s.x+1.5,.93,s.y+.55);add(patch,'peeling')
      for(let k=0;k<6;k++)box(s.x+1.08+k*.16,.85,s.y+.3,.018,1.65,.03,'metal')
      for(let k=0;k<5;k++)box(s.x+1.45,.2+k*.3,s.y+.3,.98,.018,.03,'metal')
    }
  }
  if(v==='garden'){
    // Write quads directly: thousands of small leaves do not allocate thousands of geometries.
    const layers=[0,1,2].map(()=>({p:[] as number[],n:[] as number[],uv:[] as number[]}))
    const card=(x:number,y:number,z:number,w:number,h:number,angle:number,n:number,tilt=0)=>{
      const ca=Math.cos(angle),sa=Math.sin(angle),ct=Math.cos(tilt),st=Math.sin(tilt)
      const roll=l1Hash((x+ox)*117,(y+z+oz)*131,51)*Math.PI*2,cr=Math.cos(roll),sr=Math.sin(roll)
      for(let lod=0;lod<3;lod++){
        if(lod===1&&n%3||lod===2&&n%7)continue
        const a=layers[lod]
        for(const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
          const pu=(u-.5)*w,pv=(v-.5)*h,px=pu*cr-pv*sr,py=pu*sr+pv*cr
          a.p.push(x+px*ca+py*st*sa,y+py*ct,z-px*sa+py*st*ca)
          a.n.push(sa*ct,-st,ca*ct);a.uv.push(.002+u*.442,.365+v*.634)
        }
      }
    }
    // v3: the second foliage atlas (public/textures/l1/garden/atlas.png): 0 trailing vine, 1 fern, 2 shrub, 3 grass tuft.
    const layers2=[0,1,2].map(()=>({p:[] as number[],n:[] as number[],uv:[] as number[]}))
    const sprite=(x:number,y:number,z:number,w:number,h:number,angle:number,q:number,n:number,cross=true)=>{
      const u0=(q%2)*.5+.004,v0=(q<2?.5:0)+.004
      for(const extra of cross?[0,Math.PI/2]:[0]){
        const ca=Math.cos(angle+extra),sa=Math.sin(angle+extra)
        for(let lod=0;lod<3;lod++){
          if(lod===1&&n%2||lod===2&&n%5)continue
          const a=layers2[lod]
          for(const [u,v] of [[0,0],[1,0],[1,1],[0,0],[1,1],[0,1]]){
            const pu=(u-.5)*w
            a.p.push(x+pu*ca,y+v*h,z-pu*sa);a.n.push(sa,0,ca);a.uv.push(u0+u*.492,v0+v*.492)
          }
        }
      }
    }
    for(const s of columns){
      // v3: ivy cover varies per column — bare, patchy, or smothered
      const cover=l1Hash(s.x+ox,s.y+oz,61),kMax=cover<.18?60:cover<.5?320:cover<.85?650:950
      if(l1Hash(s.x+ox,s.y+oz,63)<.35)for(let j=0;j<2+Math.floor(cover*3);j++){
        const a=j*2.1+cover*6,r=s.w/2+.35+l1Hash(j,s.x+ox,65)*.4,sz=.7+l1Hash(j,s.y+oz,67)*.7
        sprite(s.x+s.w/2+Math.cos(a)*r,0,s.y+s.h/2+Math.sin(a)*r,sz*1.15,sz,a,2,j)
      }
      for(let k=0;k<kMax;k++){
        const a=k*2.4,h=.15+l1Hash(s.x+ox,k,19)*(H-.4),side=k%4,u=(l1Hash(k,s.y+oz,23)-.5)*s.w,r=s.w/2+.018
        const dx=side<2?(side===0?r:-r):u,dz=side>=2?(side===2?r:-r):u
        card(s.x+s.w/2+dx,h,s.y+s.h/2+dz,.12,.17,side<2?Math.PI/2:0,k,Math.sin(a)*.25)
      }
    }
    for(let z=z0+2;z<z1;z+=4)for(let x=x0+2;x<x1;x+=4){
      if(!floor(x,z))continue
      const h=l1Hash(x+ox,z+oz,17),len=2+h*3.2
      // v3: thin trailing vine strands, in clumps; some bays stay open
      const vn=l1Hash((x+ox)*3,(z+oz)*3,71)
      if(vn<.55)for(let j=0;j<1+Math.floor(vn*6);j++){
        const L=1.6+l1Hash(j,(x+ox)*5,73)*(H-2.2),sx=x+(l1Hash(j,z+oz,75)-.5)*3.4,sz=z+(l1Hash(j,x+ox,77)-.5)*3.4
        if(floor(sx,sz))sprite(sx,H-L,sz,.45+L*.08,L,l1Hash(j,j,79)*3,0,j)
      }
      if(h<.3)continue
      for(let j=0;j<110;j++){
        const a=j*2.4,t=j/110
        card(x+Math.sin(a)*.17+Math.sin(t*4)*.18,H-.2-t*len,z+Math.cos(a)*.15,.11,.16,a,j)
      }
    }
    // v2 C: ref 花园段 floor is a continuous moss/clover carpet — smaller, flatter, denser cards over a mossy ground
    for(let z=z0;z<z1;z+=.7)for(let x=x0;x<x1;x+=.7){
      if(!floor(x,z))continue
      const r=l1Hash((x+ox)*7,(z+oz)*7,11)
      const jx=(r-.5)*.6,jz=(l1Hash((x+ox)*11,(z+oz)*11,37)-.5)*.6
      for(let j=0;j<4;j++)card(x+.3+jx+Math.sin(j*1.7)*.16,.025+r*.035,z+.3+jz+Math.cos(j*1.7)*.16,.085,.12,r*6+j,j,-1.25)
      // v3: fern drifts and grass tufts follow a slow field, so patches read as distinct plantings
      const fern=l1Hash(Math.floor((x+ox)/6),Math.floor((z+oz)/6),81),tuft=l1Hash(Math.floor((x+ox)/5),Math.floor((z+oz)/5),83)
      if(fern>.68&&r<.32){const sz=.55+r*1.6;sprite(x+.3+jx,0,z+.3+jz,sz*1.2,sz,r*9,1,Math.floor(r*97))}
      else if(tuft>.62&&r>.82){const sz=.3+(r-.82)*2.6;sprite(x+.3+jx,0,z+.3+jz,sz*1.3,sz,r*7,3,Math.floor(r*89))}
    }
    const lod=new THREE.LOD();lod.name='l1-ivy-lod';lod.position.set((x0+x1)/2,0,(z0+z1)/2)
    for(let i=0;i<layers.length;i++){
      const a=layers[i],dist=[0,24,48][i];if(!a.p.length)continue
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(a.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(a.n,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(a.uv,2));geo.translate(-lod.position.x,0,-lod.position.z)
      const mesh=new THREE.Mesh(geo,l1Material(v,'leaf'));mesh.userData.noCastShadow=dist>0;lod.addLevel(mesh,dist)
    }
    g.add(lod)
    const lod2=new THREE.LOD();lod2.name='l1-garden-plants-lod';lod2.position.copy(lod.position)
    for(let i=0;i<layers2.length;i++){
      const a=layers2[i],dist=[0,26,52][i];if(!a.p.length)continue
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(a.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(a.n,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(a.uv,2));geo.translate(-lod2.position.x,0,-lod2.position.z)
      const mesh=new THREE.Mesh(geo,l1Material(v,'plant'));mesh.userData.noCastShadow=dist>0;lod2.addLevel(mesh,dist)
    }
    if(lod2.levels.length)g.add(lod2)
    // Dapple is produced by the existing shadowed sun and alpha-tested foliage.
  }
  // Remove hidden end caps and repeated vertices before creating GPU buffers.
  // Gaps from walls remain separate runs; world UV projection is unchanged.
  let runIndex=0
  for(const span of coalesceL1Runs(runs)){
    const s=runShapes.get(span.key)!,center=(span.start+span.end)/2,length=span.end-span.start
    if(s.kind==='box')service(serviceBox,s.axis===0?center:s.x,s.y,s.axis===2?center:s.z,s.axis===0?length:s.w,s.h,s.axis===2?length:s.d,s.mat)
    else tube(new THREE.Vector3(s.axis===0?span.start:s.x,s.y,s.axis===2?span.start:s.z),new THREE.Vector3(s.axis===0?span.end:s.x,s.y,s.axis===2?span.end:s.z),s.w,s.mat)
    if(++runIndex%64===0)yield
  }
  for(const [surface,a]of services){
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(a.p,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(a.n,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(a.uv,2));geo.setIndex(a.index)
    const parts=buckets.get(surface)??[];parts.push(geo);buckets.set(surface,parts)
  }
  for(const [surface,parts]of buckets){
    if(!parts.length)continue
    const mesh=new THREE.Mesh(mergeGeometries(parts)!,l1Material(v,surface));mesh.name=`l1-batch-${surface}`
    mesh.userData.noCastShadow=['metal','red','whitePipe','cable','line'].includes(surface)
    for(const p of parts)p.dispose();g.add(mesh)
  }
  } finally {for(const parts of buckets.values())for(const geo of parts)geo.dispose()}
}
