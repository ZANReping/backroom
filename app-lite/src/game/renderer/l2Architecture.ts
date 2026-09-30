import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { LightSource, Structure } from '../core/types'
import type { GameMap } from '../world/mapgen'
import type { TerrainRange } from './geometry'
import { l2CorrX } from '../world/infiniteL2'
import { l2Material, l2WorldUV, type L2Surface } from './l2Materials'

type Fixture = {mat: THREE.MeshBasicMaterial; seed: number; src?: LightSource}
const mod=(x:number,n:number)=>(x%n+n)%n

/** Per-chunk batches of continuous pipe racks, cable trays and masonry services. */
export function* buildL2Architecture(m:GameMap,range:TerrainRange,g:THREE.Group,structures:Structure[],lights:LightSource[],fixtures:Fixture[]):Generator<void> {
  const v=range.variant??'tidy',ox=m.inf?.ox??0,oz=m.inf?.oy??0,seed=m.inf?.seed??0
  const buckets=new Map<L2Surface,THREE.BufferGeometry[]>()
  const add=(geo:THREE.BufferGeometry,s:L2Surface,worldUV=false)=>{
    if(worldUV)l2WorldUV(geo,ox,oz)
    const b=buckets.get(s)??[];b.push(geo);buckets.set(s,b)
  }
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,s:L2Surface)=>{
    const geo=new THREE.BoxGeometry(w,h,d);geo.translate(x,y,z);add(geo,s,true)
  }
  const pipe=(x:number,y:number,z:number,r:number,length:number,s:L2Surface,axis:'x'|'y'|'z'='z',open=false)=>{
    const geo=new THREE.CylinderGeometry(r,r,length,r>.3?24:10,1,open)
    if(axis==='z')geo.rotateX(Math.PI/2);else if(axis==='x')geo.rotateZ(Math.PI/2)
    geo.translate(x,y,z);add(geo,s)
  }
  const ring=(x:number,y:number,z:number,r:number,s:L2Surface,thick=.016)=>{
    const geo=new THREE.TorusGeometry(r,thick,5,r>.3?24:12);geo.translate(x,y,z);add(geo,s)
  }
  const floor=(x:number,z:number)=>x>=0&&z>=0&&x<m.w&&z<m.h&&m.tiles[Math.floor(z)*m.w+Math.floor(x)]===1
  const serviceKeys=new Set(m.structures.filter(s=>s.data?.l2Service===v).map(s=>`${s.data?.side}:${s.x}:${s.y}`))
  try {
    for(const s of structures) {
      if(!s.data?.l2Service)continue
      const side=Number(s.data.side),wall=side===0?s.x:s.x+s.w,cx=s.x+s.w/2,z=s.y+.5,phase=Number(s.data.phase)
      const narrow=v==='narrow',dirty=v==='dirty',dim=v==='dim',warped=v==='warped'
      const has=(y:number)=>serviceKeys.has(`${side}:${s.x}:${y}`)
      let runStart=-Infinity,runEnd=Infinity
      for(let d=1;d<=3;d++)if(!has(s.y-d)){runStart=s.y-d+1;break}
      for(let d=1;d<=3;d++)if(!has(s.y+d)){runEnd=s.y+d;break}
      const servicePipe=(h:number,r:number,mat:L2Surface)=>{
        // Account for the outside tube radius at the wall corner. The return
        // occupies up to two tiles for large ducts; adjacent straight pieces
        // are trimmed against the same run endpoints, including chunk seams.
        const bend=Math.max(Math.abs(cx-wall),r+.1),cut=r+.035+bend
        const lo=Math.max(s.y,runStart+cut),hi=Math.min(s.y+1,runEnd-cut)
        if(hi>lo)pipe(cx,h,(lo+hi)/2,r,hi-lo+.003,mat)
        for(const sign of [-1,1])if(sign===-1?runStart===s.y:runEnd===s.y+1){
          const edge=sign===-1?runStart:runEnd,tip=edge-sign*(r+.035),from=edge-sign*cut
          const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(cx,h,from),new THREE.Vector3(cx,h,tip),new THREE.Vector3(wall+(side===0?-.025:.025),h,tip))
          add(new THREE.TubeGeometry(curve,12,r,narrow?24:12,false),mat)
        }
      }
      if(dirty) {
        // Hollow, heavily corroded large-bore shell, visibly torn at discarded section ends.
        const geo=new THREE.CylinderGeometry(.49,.49,s.data.broken?.86:1.005,28,3,true)
        geo.rotateX(Math.PI/2)
        const p=geo.getAttribute('position') as THREE.BufferAttribute
        if(s.data.broken)for(let i=0;i<p.count;i++)if(Math.abs(p.getZ(i))>.4)p.setZ(i,p.getZ(i)+.028*Math.sin(i*19+phase))
        geo.computeVertexNormals();geo.translate(cx,.6,z);add(geo,'rust')
        if(mod(phase,4)===0)ring(cx,.6,z-.46,.475,'rust',.028)
        // Spalled fragments along the same occupied verge; the central lane stays clear.
        for(let n=0;n<4;n++) {
          const a=phase*13+n*2.1
          const shard=new THREE.BoxGeometry(.13+mod(phase+n,3)*.04,.035,.24)
          shard.rotateY(a);shard.rotateZ(Math.sin(a)*.2);shard.translate(cx+Math.sin(a)*.45,.025+n*.008,z+Math.cos(a)*.38);add(shard,n%2?'rust':'wall',true)
        }
      } else if(dim||warped) {
        for(const h of [.38,.86])servicePipe(h,.145,warped?'rust':'steel')
        if(mod(phase,3)===0)for(const h of [.38,.86]){
          ring(cx,h,z,.15,'steel');box((cx+wall)/2,h-.12,z,Math.abs(cx-wall)+.08,.035,.08,'steel')
        }
      } else {
        const r=narrow?.51:.295
        for(const h of narrow?[.65,1.79]:[.65,1.43]) {
          servicePipe(h,r,'insulation')
          const cut=r+.035+Math.max(s.w/2,r+.1)
          if(narrow)for(const off of [-.36,-.12,.12,.36])if(z+off>runStart+cut&&z+off<runEnd-cut)ring(cx,h,z+off,r+.006,'steel',.007)
          if(mod(phase,3)===0&&z>runStart+cut&&z<runEnd-cut)ring(cx,h,z,r+.018,narrow?'steel':'red',.025)
        }
        if(!narrow)servicePipe(2.06,.105,'steel')
      }
      if((v==='tidy'||v==='narrow')&&mod(phase,3)===0) {
        const post=side===0?s.x+s.w-.08:s.x+.08
        box(post,1.17,z,.045,2.34,.055,'steel');box(post,.025,z,.14,.05,.24,'steel')
        for(const h of [.15,1.1,2.23])box(cx,h,z,s.w,.05,.055,'steel')
      }
    }
    yield
    // True-world axes keep longitudinal services aligned when the streaming window rebases.
    for(let k=Math.floor((range.x0+ox-13)/24)-1;k<=Math.ceil((range.x1+ox-13)/24)+1;k++) {
      const X=l2CorrX(seed,k)-ox
      if(X<range.x0||X+2>=range.x1)continue
      for(let z=range.y0;z<range.y1;z++) {
        if(!floor(X+1,z))continue
        const wz=z+oz
        // A low, crowded service ceiling with an open ladder tray and visible copper wiring.
        const overhead=v==='dim'?[[.35,.065],[2.7,.07]]:v==='dirty'||v==='warped'?[[2.72,.035]]:[[.34,.09],[.65,.12],[1.02,.07],[1.91,.095],[2.3,.13],[2.65,.08]]
        for(const [dx,r] of overhead) {
          pipe(X+dx,2.52,z+.5,r,1.005,v==='dirty'||v==='warped'?'rust':v==='dim'?'steel':'insulation')
        }
        const tray=v==='dim'?2.2:1.53
        if(v!=='dirty'&&v!=='warped'){
          for(const dx of [-.16,.16])box(X+tray+dx,2.48,z+.5,.028,.10,1.005,'steel')
          for(const dz of [.15,.55,.95])box(X+tray,2.44,z+dz,.36,.025,.025,'steel')
        }
        for(const dx of [-.13,-.07,.02,.09])pipe(X+tray+dx,2.48,z+.5,.012,1.005,'black')
        if((v==='tidy'||v==='narrow')&&mod(wz,4)===0) {
          box(X+1.5,2.35,z+.5,2.98,.12,.075,'black')
          for(const dx of [.15,2.85])pipe(X+dx,2.53,z+.5,.018,.32,'steel','y')
        }
        if(v==='warped'&&mod(wz,6)===0) {
          for(const side of [0,1]) {
            const wall=side===0?X:X+3
            if(floor(wall+(side===0?-.2:.2),z))continue
            // Brick piers sit within the existing occupied pipe verge.
            box(wall+(side===0?.16:-.16),1.21,z+.5,.32,2.42,.78,'brick')
            box(wall+(side===0?.17:-.17),2.4,z+.5,.34,.13,.91,'brick')
          }
          box(X+1.5,2.24,z+.5,3,.2,.34,'brick')
          pipe(X+1.5,2.1,z+.63,.045,3,'rust','x')
        }
        if((v==='dim'||v==='warped')&&mod(wz,13)===3) {
          const puddle=new THREE.CircleGeometry(.65,17),p=puddle.getAttribute('position') as THREE.BufferAttribute
          for(let i=1;i<p.count;i++){const r=.78+.2*Math.sin(i*13+wz);p.setXY(i,p.getX(i)*r,p.getY(i)*r)}
          puddle.rotateX(-Math.PI/2);puddle.scale(.63,1,1.5)
          puddle.translate(X+1.5+Math.sin(wz)*.25,.009,z+.5);add(puddle,'wet')
        }
      }
      yield
    }
    for(const L of lights)if(L.l2Mount) {
      const group=new THREE.Group(),wall=L.l2Mount==='wall',h=L.fixZ??2.31
      const housing=new THREE.Mesh(new THREE.BoxGeometry(.25,.095,1.27),l2Material(v,'steel'))
      group.add(housing)
      const reflector=new THREE.Mesh(new THREE.BoxGeometry(.21,.015,1.18),l2Material('tidy','insulation'));reflector.position.y=-.055;group.add(reflector)
      const mat=new THREE.MeshBasicMaterial({color:L.color});mat.userData.base=new THREE.Color(L.color);mat.userData.l2Owned=true
      for(const x of [-.065,.065]) {
        const tube=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,1.1,10),mat)
        tube.rotation.x=Math.PI/2;tube.position.set(x,-.083,0);group.add(tube)
        for(const z of [-.565,.565]){
          const socket=new THREE.Mesh(new THREE.BoxGeometry(.054,.057,.04),l2Material(v,'black'));socket.position.set(x,-.075,z);group.add(socket)
        }
      }
      if(wall) {
        group.rotation.z=Math.PI/2
        // Protective wire guard on dark-area fixtures, as in the orange/blue reference.
        if(v==='dim'||v==='warped')for(let z=-.6;z<=.61;z+=.12) {
          const wire=new THREE.Mesh(new THREE.BoxGeometry(.27,.008,.008),l2Material(v,'steel'));wire.position.set(0,-.13,z);group.add(wire)
        }
      }
      group.rotation.y=L.l2Yaw??0;group.position.set(L.x,h,L.y);g.add(group)
      fixtures.push({mat,seed:L.flickerSeed,src:L})
      // Every housing is wired to its ceiling tray; skewed lights remain visibly suspended.
      if(wall) {
        box(L.x-.15,h+.15,L.y,.08,.17,.14,'steel')
        pipe(L.x-.15,(h+2.57)/2,L.y,.016,2.57-h,'steel','y')
      }else for(const dz of [-.48,.48])pipe(L.x,(h+2.7)/2,L.y+dz,.009,2.7-h,'black','y')
    }
    for(const [surface,geos] of buckets) {
      if(!geos.length)continue
      const merged=mergeGeometries(geos)!,mat=l2Material(v,surface)
      if(surface==='rust')mat.side=THREE.DoubleSide
      const mesh=new THREE.Mesh(merged,mat);mesh.name=`l2-${v}-${surface}`;g.add(mesh)
    }
  } finally {for(const geos of buckets.values())for(const geo of geos)geo.dispose()}
}
