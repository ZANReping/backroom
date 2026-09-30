import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Structure } from '../core/types'
import type { GameMap } from '../world/mapgen'
import { doorNeedsRotate } from '../world/mapgen'
import { h32 } from '../world/infinite'
import { l5Material, l5WorldUV, type L5Surface } from './l5Materials'
import { makeCanvasCtx, toTex, getMaterialMode } from './shared'
import { buildL5RoomStructure } from './l5RoomMeshes'
import { buildL5PoolStructure } from './l5PoolMeshes'
import { L5_DECOR_DEFS } from '../content/l5Decor'
import { cloneRenderGeometry } from './renderGeometry'

const bulb = new THREE.MeshBasicMaterial({ color: '#fff1ce' })
const glass = new THREE.MeshBasicMaterial({ color: '#cad6dc' })
const books = ['#654231','#263e3d','#6b3427','#716044','#302a20'].map(color=>new THREE.MeshLambertMaterial({color}))
const numberMaterials = new Map<number, THREE.Material>()
function numberMat(n:number){
  let m=numberMaterials.get(n);if(m)return m
  const [c,g]=makeCanvasCtx(128,64);g.fillStyle='#b99a58';g.fillRect(0,0,128,64);g.strokeStyle='#5a4324';g.lineWidth=4;g.strokeRect(5,5,118,54);g.font='bold 29px Georgia';g.fillStyle='#302315';g.textAlign='center';g.textBaseline='middle';g.fillText(String(n),64,34)
  m=new THREE.MeshLambertMaterial({map:toTex(c)});numberMaterials.set(n,m);return m
}
function mesh(g:THREE.Group,geo:THREE.BufferGeometry,mat:L5Surface|THREE.Material,x=0,y=0,z=0){
  if(typeof mat==='string')l5WorldUV(geo,0,0,mat==='upholstery'?2:.6)
  const m=new THREE.Mesh(geo,typeof mat==='string'?l5Material(mat):mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m
}
const box=(g:THREE.Group,w:number,h:number,d:number,mat:L5Surface,x=0,y=0,z=0)=>mesh(g,new THREE.BoxGeometry(w,h,d),mat,x,y,z)
const cyl=(g:THREE.Group,rt:number,rb:number,h:number,mat:L5Surface,x=0,y=0,z=0,n=20)=>mesh(g,new THREE.CylinderGeometry(rt,rb,h,n),mat,x,y,z)
const sphere=(g:THREE.Group,r:number,mat:L5Surface|THREE.Material,x=0,y=0,z=0)=>mesh(g,new THREE.SphereGeometry(r,12,8),mat,x,y,z)
function tube(g:THREE.Group,points:number[][],r:number,mat:L5Surface){return mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number]))),16,r,6,false),mat)}
function ring(g:THREE.Group,r:number,t:number,y:number,mat:L5Surface){const a=mesh(g,new THREE.TorusGeometry(r,t,6,32),mat,0,y);a.rotation.x=Math.PI/2;return a}
function lathe(g:THREE.Group,pts:number[][],s:L5Surface,x=0,y=0,z=0){return mesh(g,new THREE.LatheGeometry(pts.map(p=>new THREE.Vector2(p[0],p[1])),32),s,x,y,z)}
function rosette(g:THREE.Group,r:number,x:number,y:number,z:number,rot=0){
  const a=new THREE.Group();a.position.set(x,y,z);a.rotation.y=rot;g.add(a)
  const disk=cyl(a,r,r,.025,'gold');disk.rotation.x=Math.PI/2
  for(let i=0;i<8;i++){const t=i/8*Math.PI*2,m=sphere(a,r*.29,'bronze',Math.sin(t)*r*.62,Math.cos(t)*r*.62,.02);m.scale.set(.72,1,.3)}
  sphere(a,r*.2,'gold',0,0,.035).scale.z=.4
}

function foliage(g:THREE.Group,orchid=false){
  const leaves:THREE.BufferGeometry[]=[],petals:THREE.BufferGeometry[]=[],stems:THREE.BufferGeometry[]=[]
  const leaf=(start:THREE.Vector3,end:THREE.Vector3,width:number,bend:number,flower=false)=>{
    const dir=end.clone().sub(start),side=new THREE.Vector3(-dir.z,.07,dir.x).normalize().multiplyScalar(width),p:number[]=[],uv:number[]=[],indices:number[]=[]
    for(let j=0;j<=6;j++){
      const t=j/6,center=start.clone().lerp(end,t);center.y+=Math.sin(t*Math.PI)*bend
      const w=Math.sin(t*Math.PI)*.94+.012
      for(const s of [-1,1]){const v=center.clone().addScaledVector(side,w*s);p.push(v.x,v.y,v.z);uv.push((s+1)/2,t)}
      if(j<6){const k=j*2;indices.push(k,k+1,k+2,k+1,k+3,k+2)}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();(flower?petals:leaves).push(geo)
  }
  if(orchid){
    for(let i=0;i<9;i++){const a=i*2.4;leaf(new THREE.Vector3(0,.12,0),new THREE.Vector3(Math.cos(a)*.52,.19+ i%3*.05,Math.sin(a)*.52),.13,.26)}
    for(let i=0;i<5;i++){
      const a=i*2.3,top=new THREE.Vector3(Math.sin(a)*.36,1.0+i%2*.14,Math.cos(a)*.32),c=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.13,0),top.clone().multiplyScalar(.72).add(new THREE.Vector3(0,.12,0)),top]);stems.push(new THREE.TubeGeometry(c,12,.009,4,false))
      for(let j=0;j<4;j++){
        const f=top.clone().add(new THREE.Vector3(j*.06-.09,-j*.055,Math.sin(j)*.06));
        for(let k=0;k<5;k++){const t=k/5*Math.PI*2;leaf(f,f.clone().add(new THREE.Vector3(Math.sin(t)*.105,Math.cos(t)*.105,.035)),.042,.013,true)}
      }
    }
  }else{
    // Arching palm fronds with individually tapered leaflets, not crossed rectangular cards.
    for(let i=0;i<17;i++){
      const a=i*2.3999,base=new THREE.Vector3(Math.cos(a)*.1,.47,Math.sin(a)*.1),tip=new THREE.Vector3(Math.cos(a)*(1.0+i%3*.17),1.42+(i%4)*.15,Math.sin(a)*(1.0+i%3*.17)),crest=tip.clone().multiplyScalar(.43);crest.y=2.12+(i%3)*.14
      const curve=new THREE.CatmullRomCurve3([base,crest,tip]);stems.push(new THREE.TubeGeometry(curve,12,.009,4,false))
      for(let k=2;k<13;k++){
        const t=k/14,p=curve.getPoint(t),spread=.28*Math.sin(t*Math.PI)+.015
        for(const s of [-1,1])leaf(p,p.clone().add(new THREE.Vector3(Math.cos(a+s*.85)*spread,.01-.2*t,Math.sin(a+s*.85)*spread)),.025,.04)
      }
    }
  }
  const visual=new THREE.Group();visual.userData.noCollision=true;g.add(visual)
  for(const [geos,mat]of [[leaves,'leaf'],[petals,'petal'],[stems,'stem']] as const)if(geos.length){const merged=mergeGeometries(geos,false)!;mesh(visual,merged,mat);geos.forEach(geo=>geo.dispose())}
}

function addBulb(g:THREE.Group,x:number,y:number,z:number){cyl(g,.028,.038,.20,'ivory',x,y-.10,z);cyl(g,.078,.07,.028,'gold',x,y-.21,z);sphere(g,.05,bulb,x,y+.037,z).scale.set(.7,1.55,.7)}

// Repeated carved columns, palms and chandeliers are expensive to tessellate.
// Cache only coordinate-independent static templates, and give every live chunk
// its own geometries so unloading it cannot dispose another chunk's buffers.
const templates=new Map<string,THREE.Group>()
const reusable=new Set(['redpillar','chandelier','planter','libshelf','sconce','sofa'])
export function buildL5Structure(s:Structure,H:number,m:GameMap):THREE.Group|null{
  if(!reusable.has(s.kind))return buildL5StructureUncached(s,H,m)
  const key=JSON.stringify([getMaterialMode(),s.kind,H,s.w,s.h,s.data?.l5,s.data?.profile,s.data?.deg,s.data?.color])
  let template=templates.get(key)
  if(!template){
    const fresh=buildL5StructureUncached(s,H,m);if(!fresh)return null
    template=fresh
    if(templates.size>=32){const first=templates.keys().next().value!;templates.get(first)!.traverse(o=>(o as THREE.Mesh).geometry?.dispose());templates.delete(first)}
    templates.set(key,template)
  }
  const copy=template.clone(true)
  copy.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.geometry)mesh.geometry=cloneRenderGeometry(mesh.geometry)})
  return copy
}

/** Uncached factory also supports reproducible construction-cost checks. */
export function buildL5StructureUncached(s:Structure,H:number,m:GameMap):THREE.Group|null{
  const pool=buildL5PoolStructure(s);if(pool){pool.rotation.y=Number(s.data?.deg??0)*Math.PI/180;return pool}
  const room=buildL5RoomStructure(s,H,m);if(room)return room
  if(!s.data?.l5&&!['redpillar','chandelier','sconce','hoteldoor'].includes(s.kind))return null
  const g=new THREE.Group();g.name=`l5-reference-${s.kind}`
  switch(s.kind){
    case 'redpillar': {
      box(g,.62,H-.72,.62,'redMarble',0,(H-.72)/2+.28)
      box(g,.76,.28,.76,'ivory',0,.14)
      for(const [w,h,y]of [[.82,.05,.285],[.69,.065,H-.49],[.80,.10,H-.32],[.9,.10,H-.19],[.96,.09,H-.08]])box(g,w,h,w,'gold',0,y)
      box(g,.70,.26,.70,'bronze',0,H-.48)
      for(let side=0;side<4;side++){
        const trim=new THREE.Group();trim.rotation.y=side*Math.PI/2;g.add(trim)
        for(const x of [-.292,.292]){
          box(trim,.022,H-.9,.019,'gold',x,H/2,.32)
          for(let k=0;k<19;k++){const a=k*.55;const bead=sphere(trim,.025,'gold',x+Math.sin(a)*.016,.55+k*(H-.99)/19,.333);bead.scale.y=1.5}
        }
        for(let k=0;k<7;k++)box(trim,.024,.2,.031,'gold',-.28+k*.093,H-.48,.372)
        rosette(trim,.074,0,H-.43,.386)
      }
      break
    }
    case 'ceilingbeam': {
      const alongY=s.data?.axis==='y',length=alongY?s.h:s.w
      box(g,length,.40,.47,'wood',0,H-.24)
      box(g,length,.065,.57,'bronze',0,H-.455)
      box(g,length,.038,.59,'gold',0,H-.491)
      box(g,length,.07,.62,'wood',0,H-.06)
      for(const z of [-.241,.241]){
        const geo=new THREE.PlaneGeometry(length,.30);const uv=geo.getAttribute('uv') as THREE.BufferAttribute
        const phase=(alongY?s.y+(m.inf?.oy??0):s.x+(m.inf?.ox??0))/2.4
        for(let i=0;i<uv.count;i++)uv.setXY(i,phase+uv.getX(i)*length/2.4,uv.getY(i))
        const panel=mesh(g,geo,l5Material('frieze'),0,H-.25,z);if(z<0)panel.rotation.y=Math.PI
      }
      const worldStart=alongY?s.y+(m.inf?.oy??0):s.x+(m.inf?.ox??0)
      for(let i=Math.ceil(worldStart/2)*2-worldStart;i<length;i+=2){const ornament=new THREE.Group();ornament.rotation.x=Math.PI/2;ornament.position.set(-length/2+i,H-.5,0);g.add(ornament);rosette(ornament,.13,0,0,0)}
      if(alongY)g.rotation.y=Math.PI/2
      break
    }
    case 'chandelier': {
      const base=H-2.02
      cyl(g,.10,.14,.10,'bronze',0,H-.05)
      for(let y=base+.62;y<H-.1;y+=.115){const link=mesh(g,new THREE.TorusGeometry(.045,.01,5,10),'bronze',0,y);link.rotation.y=Math.round(y*10)%2?Math.PI/2:0}
      cyl(g,.06,.08,.86,'bronze',0,base+.17)
      for(const [r,y]of [[.61,base],[.43,base+.46],[.22,base-.31]])ring(g,r,.025,y,'bronze')
      for(let i=0;i<10;i++){
        const a=i/10*Math.PI*2,cs=Math.cos(a),sn=Math.sin(a)
        tube(g,[[cs*.12,base+.56,sn*.12],[cs*.42,base+.17,sn*.42],[cs*.62,base,sn*.62],[cs*.36,base-.27,sn*.36],[0,base-.42,0]],.014,'bronze')
        tube(g,[[cs*.46,base+.05,sn*.46],[cs*.82,base+.06,sn*.82],[cs*.8,base+.28,sn*.8]],.018,'bronze')
        addBulb(g,cs*.8,base+.49,sn*.8)
        if(i%2===0)addBulb(g,cs*.39,base+1.0,sn*.39)
        for(let k=0;k<6;k++)sphere(g,.018,'gold',cs*(.40-k*.04),base+.72-k*.12,sn*(.40-k*.04))
      }
      lathe(g,[[0,0],[.05,.05],[.14,.12],[.08,.23],[0,.29]],'bronze',0,base-.65)
      break
    }
    case 'lightgrid': {
      const plain=!!s.data?.plain
      if(plain){cyl(g,.13,.13,.035,'ivory',0,H-.028);mesh(g,new THREE.CircleGeometry(.095,20),bulb,0,H-.051).rotation.x=-Math.PI/2}
      else{
        cyl(g,.12,.17,.09,'bronze',0,H-.045)
        lathe(g,[[.03,0],[.12,.018],[.21,.065],[.28,.14],[.30,.2],[.29,.23]],'ivory',0,H-.32)
        const bowl=mesh(g,new THREE.SphereGeometry(.28,24,12,0,Math.PI*2,Math.PI/2,Math.PI/2),bulb,0,H-.09);bowl.scale.y=.7
        ring(g,.295,.022,H-.09,'bronze');sphere(g,.043,'gold',0,H-.30)
      }
      break
    }
    case 'planter': {
      lathe(g,[[.22,0],[.28,.05],[.28,.12],[.34,.46],[.36,.48],[.36,.54],[.31,.54]],'pot')
      cyl(g,.315,.315,.012,'wood',0,.50);foliage(g)
      break
    }
    case 'table': {
      lathe(g,[[0,.79],[.90,.79],[.94,.83],[.95,.89],[.91,.93],[0,.93]],'wood')
      ring(g,.929,.011,.885,'gold')
      lathe(g,[[.20,.08],[.14,.17],[.11,.35],[.18,.53],[.16,.68],[.28,.79]],'wood')
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3,cs=Math.cos(a),sn=Math.sin(a);tube(g,[[cs*.08,.35,sn*.08],[cs*.30,.13,sn*.30],[cs*.67,.07,sn*.67]],.055,'wood');sphere(g,.055,'gold',cs*.67,.06,sn*.67)}
      const flowers=new THREE.Group();flowers.position.y=.93;g.add(flowers)
      lathe(flowers,[[.18,0],[.25,.035],[.34,.18],[.32,.31],[.30,.33]],'pot');foliage(flowers,true)
      break
    }
    case 'sofa': {
      for(const x of [-.82,.82])for(const z of [-.28,.28])cyl(g,.045,.028,.23,'wood',x,.115,z)
      box(g,1.90,.14,.77,'wood',0,.28)
      mesh(g,new RoundedBoxGeometry(1.87,.53,.23,3,.10),'upholstery',0,.74,-.30)
      for(const x of [-.59,0,.59])mesh(g,new RoundedBoxGeometry(.57,.19,.66,3,.065),'upholstery',x,.43,.05)
      for(const x of [-.89,.89]){
        mesh(g,new RoundedBoxGeometry(.24,.34,.86,3,.1),'upholstery',x,.57,.025)
        const arm=cyl(g,.135,.135,.73,'upholstery',x,.74,.02);arm.rotation.x=Math.PI/2
        sphere(g,.135,'upholstery',x,.74,.385)
      }
      for(let i=0;i<17;i++)box(g,.009,.45,.008,'wood',-.79+i*.099,.77,-.17)
      for(const x of [-.58,.58]){const pillow=mesh(g,new RoundedBoxGeometry(.42,.37,.15,3,.07),'upholstery',x,.69,.025);pillow.rotation.z=x*.15;rosette(g,.04,x,.69,.11)}
      if(s.data?.deg!==undefined)g.rotation.y=Number(s.data.deg)*Math.PI/180
      break
    }
    case 'libshelf': {
      box(g,1.48,2.72,.11,'wood',0,1.36,-.24)
      for(const x of [-.73,.73])box(g,.13,2.72,.56,'wood',x,1.36)
      for(const y of [.07,.57,1.1,1.64,2.18,2.7]){box(g,1.57,.08,.59,'wood',0,y);box(g,1.59,.016,.022,'gold',0,y+.035,.30)}
      for(let row=0;row<4;row++)for(let j=0;j<13;j++){
        const h=.30+((j*7+row*11)%9)*.014,x=-.62+j*.101,y=.61+row*.54
        mesh(g,new THREE.BoxGeometry(.075,h,.28),books[(row+j)%books.length],x,y+h/2,.02)
        for(const yy of [y+.055,y+h-.045])box(g,.075,.012,.009,'gold',x,yy,.165)
      }
      box(g,1.72,.11,.66,'wood',0,2.80);box(g,1.64,.05,.62,'gold',0,2.72)
      break
    }
    case 'sconce': {
      const plate=mesh(g,new THREE.SphereGeometry(.17,16,10),'bronze',0,2.10,0);plate.scale.set(.72,1.7,.22)
      for(const side of [-1,1]){
        tube(g,[[0,2.08,.02],[side*.16,1.98,.17],[side*.25,2.10,.23],[side*.25,2.21,.23]],.018,'bronze')
        addBulb(g,side*.25,2.43,.23)
      }
      rosette(g,.067,0,2.17,.06);break
    }
    case 'hotelwindow': {
      // Glass-backed decorative portal: still a solid wall, not an exterior exit.
      box(g,2.70,3.9,.16,'wood',0,1.95,-.05)
      const shape=new THREE.Shape();shape.moveTo(-1.05,.15);shape.lineTo(1.05,.15);shape.lineTo(1.05,2.6);shape.absarc(0,2.6,1.05,0,Math.PI,false);shape.closePath()
      mesh(g,new THREE.ShapeGeometry(shape,32),glass,0,0,.043)
      for(const x of [-1.08,-.57,0,.57,1.08])box(g,x===0?.115:.075,x===0?3.7:3.4,.11,'wood',x,x===0?1.85:1.70,.10)
      for(const y of [.13,1.2,2.45])box(g,2.20,.095,.11,'wood',0,y,.11)
      const pts:number[][]=[];for(let i=0;i<=24;i++){const a=i/24*Math.PI;pts.push([Math.cos(a)*1.10,2.6+Math.sin(a)*1.10,.11])}tube(g,pts,.047,'wood')
      for(const x of [-.16,.16])box(g,.027,.22,.04,'gold',x,1.31,.20)
      for(const side of [-1,1]){
        for(let i=0;i<7;i++){const drape=cyl(g,.10,.12,3.7,'damask',side*(1.46+i*.105),1.92,.05,10);drape.scale.z=.65}
        box(g,.79,.08,.19,'gold',side*1.76,1.4,.12)
      }
      box(g,4.4,.19,.30,'wood',0,3.91);box(g,4.5,.055,.34,'gold',0,4.02)
      break
    }
    case 'rug': {
      const X=s.x+s.w/2,Y=s.y+s.h/2,ox=m.inf?.ox??0,oy=m.inf?.oy??0
      const rx=Number(s.data?.rx??s.x+ox),ry=Number(s.data?.ry??s.y+oy),rw=Number(s.data?.rw??s.w),rh=Number(s.data?.rh??s.h)
      const slab=(x0:number,y0:number,x1:number,y1:number,surf:L5Surface)=>{
        const x=Math.max(s.x+ox,x0),y=Math.max(s.y+oy,y0),r=Math.min(s.x+ox+s.w,x1),b=Math.min(s.y+oy+s.h,y1)
        if(r<=x||b<=y)return
        const geo=new THREE.PlaneGeometry(r-x,b-y).rotateX(-Math.PI/2).translate((x+r)/2-ox-X,.016,(y+b)/2-oy-Y)
        const pos=geo.getAttribute('position'),uv=geo.getAttribute('uv') as THREE.BufferAttribute
        for(let i=0;i<pos.count;i++)uv.setXY(i,(pos.getX(i)+X+ox-rx)*.72,(pos.getZ(i)+Y+oy-ry)*.72)
        mesh(g,geo,l5Material(surf))
      }
      const patch=(x0:number,y0:number,x1:number,y1:number,surf:L5Surface)=>{
        const x=Math.max(s.x+ox,x0),y=Math.max(s.y+oy,y0),r=Math.min(s.x+ox+s.w,x1),b=Math.min(s.y+oy+s.h,y1)
        if(r<=x||b<=y)return
        const voidAt=(xx:number,yy:number)=>m.elev?.[(yy-oy)*m.w+xx-ox]===4
        let cut=false
        for(let yy=Math.floor(y);yy<b&&!cut;yy++)for(let xx=Math.floor(x);xx<r;xx++)if(voidAt(xx,yy)){cut=true;break}
        if(!cut){slab(x,y,r,b,surf);return}
        for(let yy=Math.floor(y);yy<b;yy++){
          let start=x
          for(let xx=Math.floor(x);xx<r;xx++)if(voidAt(xx,yy)){
            if(xx>start)slab(start,Math.max(y,yy),xx,Math.min(b,yy+1),surf)
            start=xx+1
          }
          if(start<r)slab(start,Math.max(y,yy),r,Math.min(b,yy+1),surf)
        }
      }
      const edge=.23
      patch(rx+edge,ry+edge,rx+rw-edge,ry+rh-edge,'lobbyCarpet')
      patch(rx,ry,rx+rw,ry+edge,'border');patch(rx,ry+rh-edge,rx+rw,ry+rh,'border')
      patch(rx,ry+edge,rx+edge,ry+rh-edge,'border');patch(rx+rw-edge,ry+edge,rx+rw,ry+rh-edge,'border')
      break
    }
    case 'hoteldoor': {
      g.rotation.y=doorNeedsRotate(m,s)
      const ti=Math.floor(s.y)*m.w+Math.floor(s.x),plain=[ti-1,ti+1,ti-m.w,ti+m.w].some(i=>m.tint[i]===60)
      const n=100+h32(m.inf?.seed??5,0x5d00,s.x+(m.inf?.ox??0),s.y+(m.inf?.oy??0))%900
      box(g,.12,2.27,.30,'ivory',-.46,1.135);box(g,.12,2.27,.30,'ivory',.46,1.135);box(g,1.07,.13,.30,'ivory',0,2.23)
      if(H>2.30)box(g,1.06,H-2.30,.26,plain?'plainCeiling':'plaster',0,2.30+(H-2.30)/2)
      const panel=new THREE.Group();panel.position.x=-.39;panel.userData.lid=1;g.add(panel);g.userData.swing=1
      box(panel,.78,2.13,.072,plain?'walnut':'wood',.39,1.065)
      for(const sign of [-1,1]){
        for(const [yy,hh]of (plain?[]:[[.52,.65],[1.55,.78]])){
          box(panel,.60,hh,.022,'walnut',.39,yy,sign*.048)
          for(const xx of [.08,.70])box(panel,.020,hh+.035,.018,'gold',xx,yy,sign*.063)
          for(const y of [yy-hh/2,yy+hh/2])box(panel,.64,.02,.018,'gold',.39,y,sign*.063)
        }
        box(panel,.055,.19,.024,'gold',.68,1.06,sign*.065);sphere(panel,.035,'gold',.68,1.08,sign*.107)
        const plaque=mesh(panel,new THREE.PlaneGeometry(.25,.125),numberMat(n),.39,1.99,sign*.072);if(sign<0)plaque.rotation.y=Math.PI
      }
      break
    }
    default:return null
  }
  return g
}

/** Registered static copies are usable outside Level 5 and inside the design preview. */
export function buildL5Registered(s:Structure):THREE.Group {
  const def=L5_DECOR_DEFS.find(d=>d.id===s.kind)
  if(!def)return new THREE.Group()
  const n=16,tiles=new Uint8Array(n*n).fill(1),zero=new Uint8Array(n*n)
  const m={w:n,h:n,tiles,tint:zero,ceiling:zero,up:zero,upWall:zero,structures:[],inf:undefined} as unknown as GameMap
  const copy={...s,kind:def.kind,x:7,y:7,data:{...def.data,...s.data,l5:1,deg:0}} as Structure
  const g=buildL5Structure(copy,Number(s.data?.height??def.height),m)??new THREE.Group()
  g.rotation.y=Number(s.data?.deg??0)*Math.PI/180
  g.position.y=Number(s.data?.z??0)
  return g
}
