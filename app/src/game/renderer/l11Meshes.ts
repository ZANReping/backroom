import * as THREE from 'three'
import type { Structure } from '../core/types'
import type { GameMap } from '../world/mapgen'
import { l11MetroParts,L11_METRO_CEILING } from '../world/l11Metro'
import { l11CityPlan,l11Buildings,l11ChunkData,l11TerrainHeight,l11VolumePolygon,l11MetroRamp,l11StairRect,l11InteriorWalls,l11BuildingColumns,type L11Building } from '../world/l11Layout'
import { clipping,rectangle,strip,transform,bounds,intersects,type Polygon,type Point } from '../world/l11Geometry'
import { l11WallSegments,setL11BuildingSolids } from '../world/l11Collision'
import { l11Archetype } from '../content/l11Buildings'
import { l11BuildingSign } from '../content/l11Signs'
import { isL11DecorKind,l11DecorDef } from '../content/l11Decor'
import { l11PropParts } from '../content/l11PropParts'
import { l11PropGeometry } from './l11PropGeometry'
import { l11Material,l11LeafMaterial,l11CarPaint,l11LampMaterial,l11TrafficLampMaterial,l11PrivacyGlass,type L11MaterialKind } from './l11Materials'
import { addL11Sign,addL11PropSigns,addL11ReferenceBanner,addL11ShopSigns } from './l11Signs'
import { CityBatch } from './l11Batch'
import { L11_ROAD_SURFACE_LIFT } from '../world/l11Dressing'
import { l11InteriorPlan } from '../world/l11Interiors'
import { l11RoomFloor } from '../world/l11RoomFurnishing'
import { l11RoofDetails } from './l11RoofDetails'
import { l11CanalWater } from './l11Water'
import { L11_CANAL_BED,l11StreetHeight,l11BridgeSurfaceParts } from '../world/l11Hydrology'
import { addL11BridgeDeck } from './l11Bridges'
import { referenceFacade } from './l11ReferenceFacades'
import { L11BuildingLOD } from './l11BuildingLOD'
import { addL11DistantTerrain } from './l11DistantTerrain'
import { l11ReferenceDetails } from '../world/l11ReferenceDetails'
import { l11FoliageGeometry } from './l11FoliageGeometry'
import { L11_REFERENCE_SEED,L11_REFERENCE_PROPS } from '../world/l11ReferenceDistrict'
import { l11StreetPropAllowed } from '../world/l11PropPlacement'
import { l11CrossingPositions,l11YellowCrossing } from '../world/l11RoadMarkings'
import { l11SpecialBuildingParts,l11ShaftParts,l11ExitDoorSolid,l11ArchiveBackingParts } from '../world/l11ExitGeometry'
import { addL11ExitParts } from './l11Exits'
import { l11GroundPolygons } from './l11Ground'
export { CityBatch } from './l11Batch'
const unit={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(.5,.5,1,12),sphere:new THREE.SphereGeometry(.5,10,7),ring:new THREE.TorusGeometry(.42,.08,6,16)}
const segmentRoomDistance=(p:Point,r:{x:number;y:number;w:number;h:number})=>Math.min(Math.abs(p[0]-r.x),Math.abs(p[0]-r.x-r.w),Math.abs(p[1]-r.y),Math.abs(p[1]-r.y-r.h))+(p[0]<r.x-.01||p[0]>r.x+r.w+.01||p[1]<r.y-.01||p[1]>r.y+r.h+.01?100:0)
function rail(batch:CityBatch,mat:THREE.Material,from:number[],to:number[],width=.06){
  const a=new THREE.Vector3(...from as [number,number,number]),b=new THREE.Vector3(...to as [number,number,number]),delta=b.clone().sub(a),length=delta.length()
  batch.geometry(mat,unit.box,new THREE.Matrix4().compose(a.add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()),new THREE.Vector3(width,length,width)))
}
function partGeometry(batch:CityBatch,id:string,style=0,interior=false,root?:THREE.Matrix4,far=false){
  for(const p of l11PropParts(id)){
    if(p.surface==='grass'&&p.shape==='sphere'){
      const matrix=new THREE.Matrix4().makeTranslation(p.x,p.y,p.z);if(root)matrix.premultiply(root)
      batch.geometry(l11LeafMaterial(p.color),l11FoliageGeometry(p.w,p.h,p.d,far?.18:1,p.foliage),matrix)
      continue
    }
    const {geometry,uv,matrix}=l11PropGeometry(p)
    const textile=p.surface==='fabric'||p.surface==='wood'||p.surface==='rawwood'
    const carPaint=id==='l11_sedan'&&p.color==='#576c73'||id==='l11_taxi'&&p.color==='#bba15e'
    const tint=id==='l11_sedan'&&carPaint?['#394c4e','#a6332b','#b2b7b7'][style%3]:style&&['paint','metal','wood','rawwood','fabric','plastic'].includes(p.surface)?'#'+new THREE.Color(p.color??'#ffffff').multiply(new THREE.Color('#ffffff').lerp(new THREE.Color(style===1?'#c6d2ce':'#d1c4ad'),textile?.25:1)).getHexString():p.color
    const diffuser=(id==='l11_ceiling_light'&&p.color==='#eeeada'||id==='l11_floor_lamp'&&p.color==='#e8dfc5')&&!p.solid
    batch.geometry(diffuser?l11LampMaterial():id==='l11_signal'&&p.color==='#ed382c'?l11TrafficLampMaterial():carPaint?l11CarPaint(tint!):l11Material(p.surface==='wood'?'propwood':p.surface,tint,interior),geometry,root?matrix.clone().premultiply(root):matrix,uv)
  }
}
export function buildL11Structure(s:Structure):THREE.Group|null {
  if(s.l11){const job=buildL11Building(s);for(;;){const r=job.next();if(r.done)return r.value}}
  if(s.kind==='l11window'||s.kind==='l11stair')return null
  const g=new THREE.Group(),a=new CityBatch(),metal=l11Material('metal','#647375'),stone=l11Material('concrete')
  if(isL11DecorKind(s.kind)){const grade=Number(s.data?.grade??0),shear=grade?new THREE.Matrix4().set(1,0,0,0,grade,1,0,0,0,0,1,0,0,0,0,1):undefined;partGeometry(a,s.kind,Number(s.data?.style??0),s.data?.l11Interior===1,shear);addL11PropSigns(a,s);a.finish(g);g.position.set(s.x+s.w/2,0,s.y+s.h/2);g.rotation.y=Number(s.data?.deg??0)*Math.PI/180;g.userData.noModelColliders=true;return g}
  if(s.kind==='l11subway'){
    for(const side of [-1,1]){const x=side*1.55;for(let k=0;k<=6;k++)a.box(metal,x,.5-k*5/6,k*10/6,.065,1,.065);rail(a,metal,[x,1,0],[x,-4,10]);rail(a,metal,[x,.5,0],[x,-4.5,10],.045)}
    for(const p of l11MetroParts(s))a.box(stone,p.x,p.y,p.z,p.w,p.h,p.d)
    addL11Sign(a,'metro',0,Number(s.data?.ground??0)+2.3,-.62,Math.PI,3.1,.62,true);a.finish(g);g.position.set(s.x+1.5,0,s.y);g.userData.noModelColliders=true;return g
  }
  if(s.kind==='l11partition')a.box(l11Material('plaster'),0,1.5,0,s.w,3,s.h)
  if(s.kind==='l11landmark'){a.box(metal,0,1.1,0,.08,2.2,.08);addL11Sign(a,s.data?.citySite==='L9'?'level9':s.data?.citySite==='L10'?'level10':s.data?.citySite==='metro'?'metro':'archive-entry',0,2.2,.05,0,3,3/4.2,true)}
  a.finish(g);g.position.set(s.x+s.w/2,0,s.y+s.h/2);return g
}
function buildingMaterials(b:L11Building){
  const spec=l11Archetype(b.archetype),f=spec.facade,stone=f==='stone'||f==='colonnade',brick=f==='brick'||f==='cornice'||f==='gable'
  const palette=stone?['#f0e5d2','#ded8c9','#e9dfc9']:brick?['#f0e5da','#d2c6b9','#dfd8c9']:spec.group==='office'?['#d8d7cb','#c9ced0','#d9d2c3']:spec.group==='industrial'?['#bbbfba','#c9c2ad','#aebaba']:['#ede5d3','#d3d8d4','#e5dcc6']
  const wall=l11Material(stone?'limestone':brick?'brick':f==='fins'||f==='curtain'||f==='open-deck'?'concrete':'plaster',palette[b.seed%3])
  return {wall,trim:l11Material('plaster','#e4e0d2'),base:l11Material('concrete','#858982'),metal:l11Material('metal','#465257'),glass:l11Material('glass','#becfd0'),dark:l11Material('sealedglass','#29424c'),alternate:l11Material('sealedglass','#3c5055')}
}

/** One floor finish per use, rather than a universal outdoor concrete slab. */
export function l11FloorKind(b:L11Building,floor=0):L11MaterialKind{
  const group=l11Archetype(b.archetype).group
  if(group==='industrial'||b.archetype==='parking')return 'concrete'
  if(group==='residential'||b.archetype==='sports-hall'||floor>0&&['corner-shops','court-shops'].includes(b.archetype))return 'wood'
  if(['archive','museum','municipal'].includes(b.archetype))return 'limestone'
  if(['hotel','strip-shops','court-shops'].includes(b.archetype))return 'tile'
  return 'ceramic'
}
/** Low distance tiers retain each facade's vertical/horizontal rhythm with flat panes. */
function farFacadeEdge(batch:CityBatch,b:L11Building,a:Point,end:Point,lo:number,hi:number){
  const m=buildingMaterials(b),spec=l11Archetype(b.archetype),f=spec.facade,len=Math.hypot(end[0]-a[0],end[1]-a[1]),ux=(end[0]-a[0])/len,uy=(end[1]-a[1])/len,nx=uy,ny=-ux
  const pane=(l:number,r:number,bottom:number,top:number,mat=m.dark,offset=.11)=>{if(top<=bottom||r<=l)return;const p=[a[0]+ux*l+nx*offset,a[1]+uy*l+ny*offset],q=[a[0]+ux*r+nx*offset,a[1]+uy*r+ny*offset];batch.quad(mat,[[p[0],bottom,p[1]],[q[0],bottom,q[1]],[q[0],top,q[1]],[p[0],top,p[1]]],[nx,0,ny])}
  if(f==='curtain'||f==='fins'){
    const count=Math.max(1,Math.ceil(len/(f==='fins'?3:2.4)))
    const pitch=len/count,cap=f==='fins'?.18:.055
    for(let h=lo;h<hi;h+=3){const top=Math.min(hi,h+3);pane(0,len,h,Math.min(top,h+.1),m.trim,0)
      for(let i=0;i<count;i++){pane(i*pitch,i*pitch+cap,h+.1,top,m.trim,0);pane(i*pitch+cap,(i+1)*pitch,h+.1,top,m.dark,0)}
    }
  }else{
    const ribbon=f==='ribbon'||f==='open-deck',n=ribbon?1:Math.max(1,Math.floor(len/(spec.group==='industrial'?4.8:3.6))),pitch=len/n
    for(let h=lo;h<hi;h+=3)for(let i=0;i<n;i++){
      const l=i*pitch,r=(i+1)*pitch,left=l+(ribbon?.2:.55),right=r-(ribbon?.2:.55),sill=h+(spec.group==='industrial'?1.6:.86),head=Math.min(hi-.15,h+2.43)
      pane(l,r,h,sill,m.wall,0);pane(l,r,head,Math.min(hi,h+3),m.wall,0)
      pane(l,left,sill,head,m.wall,0);pane(right,r,sill,head,m.wall,0);pane(left,right,sill,head,m.dark,0)
    }
  }
}
function facade(batch:CityBatch,b:L11Building,p:Polygon,lo:number,hi:number,detail:number,faces?:L11Building['volumes'][number]['faceProfiles']){
  if(referenceFacade(batch,b,p,lo,hi,detail,faces))return
  const m=buildingMaterials(b),spec=l11Archetype(b.archetype),f=spec.facade,open=hi<=b.accessible*3&&!b.sealed
  const lining=l11Material(spec.group==='industrial'?'concrete':'paint',spec.group==='industrial'?'#c0bdb2':spec.group==='residential'?'#e5dfd0':'#deded4',true)
  const segments=open?l11WallSegments(b):p.flatMap(r=>r.slice(1).map((q,i)=>({a:r[i],b:q,entrance:false})))
  for(const segment of segments){const {a,b:end}=segment,len=Math.hypot(end[0]-a[0],end[1]-a[1]),ux=(end[0]-a[0])/len,uy=(end[1]-a[1])/len,nx=uy,ny=-ux
    const pos=(t:number,offset=0):Point=>[a[0]+ux*t+nx*offset,a[1]+uy*t+ny*offset]
    // Interior plaster faces share the exact facade openings. They sit 6mm
    // inside the wall slab, so stone/brick outside cannot become room wallpaper.
    const fill=(left:number,right:number,bottom:number,top:number)=>{
      if(top<=bottom||right<=left)return
      batch.wall(m.wall,pos(left),pos(right),bottom,top,.28)
      if(open&&detail<2){const l=pos(left,-.146),r=pos(right,-.146);batch.quad(lining,[[l[0],bottom,l[1]],[r[0],bottom,r[1]],[r[0],top,r[1]],[l[0],top,l[1]]],[-nx,0,-ny])}
    }
    if(segment.entrance&&lo<.1){fill(0,len,2.45,3);batch.wall(m.metal,pos(0),pos(.07),0,2.5,.3);batch.wall(m.metal,pos(len-.07),pos(len),0,2.5,.3);batch.wall(m.base,a,end,.01,.035,.45);continue}
    if(detail===2){farFacadeEdge(batch,b,a,end,lo,hi);continue}
    const curtain=f==='curtain',ribbon=f==='ribbon',residential=spec.group==='residential',industrial=spec.group==='industrial',parking=f==='open-deck'
    const bay=curtain?1.5:parking?5:industrial?4.8:residential?3.6:f==='stone'?2.6:3.2,count=Math.max(1,Math.floor(len/bay)),pitch=len/count
    const shop=lo<.1&&['awning','shopfront','arcade','canopy'].includes(f)
    for(let i=0;i<count;i++){
      const l=i*pitch,r=(i+1)*pitch,margin=curtain?.07:ribbon?.16:shop?.16:parking?.2:industrial?.55:residential?.68:f==='fins'?.38:.48
      const left=l+Math.min(margin,pitch*.28),right=r-Math.min(margin,pitch*.28),sill=curtain?.12:shop?.16:parking?.78:industrial?1.65:.86,head=curtain?2.85:shop?2.62:industrial?2.6:2.43
      fill(l,r,lo,Math.min(hi,lo+sill))
      fill(l,r,Math.min(hi,lo+head),hi)
      fill(l,left,lo,hi);fill(right,r,lo,hi)
      if(!parking){
        const gl=pos(left,-.15),gr=pos(right,-.15),inside=pos((left+right)/2,-.4)
        const sanitary=open&&l11InteriorPlan(b).floors[Math.floor(lo/3)]?.rooms.some(r=>r.kind==='bathroom'&&inside[0]>=r.x&&inside[0]<=r.x+r.w&&inside[1]>=r.y&&inside[1]<=r.y+r.h)
        const pane=open?(sanitary?l11PrivacyGlass():m.glass):(i+Math.floor(lo/3)+b.seed)%5===0?m.alternate:m.dark
        // A single sheet avoids four transparent wall faces stacking into a
        // milky, opaque shop window. Deep reveals provide real light/shadow.
        batch.quad(pane,[[gl[0],lo+sill,gl[1]],[gr[0],lo+sill,gr[1]],[gr[0],Math.min(hi,lo+head),gr[1]],[gl[0],Math.min(hi,lo+head),gl[1]]],[nx,0,ny])
      }
      if(parking){batch.wall(m.metal,pos(left,.05),pos(right,.05),lo+1,lo+1.08,.05);if(!detail)for(let q=left;q<right;q+=.3)batch.wall(m.metal,pos(q),pos(q+.028),lo+.25,lo+1,.04)}
      else {
        const frame=curtain||industrial||shop?m.metal:m.trim
        batch.wall(frame,pos(left,.035),pos(left+.055,.035),lo+sill,Math.min(hi,lo+head),.13)
        batch.wall(frame,pos(right-.055,.035),pos(right,.035),lo+sill,Math.min(hi,lo+head),.13)
        batch.wall(frame,pos(left,.035),pos(right,.035),lo+sill-.025,lo+sill+.035,.13)
        batch.wall(frame,pos(left,.035),pos(right,.035),Math.min(hi,lo+head)-.045,Math.min(hi,lo+head)+.025,.13)
        batch.wall(frame,pos((left+right)/2),pos((left+right)/2+.04),lo+sill,Math.min(hi,lo+head),.07)
        if(!detail&&!curtain)batch.wall(frame,pos(left,.035),pos(right,.035),lo+(shop?2.05:industrial?2.22:1.88),lo+(shop?2.09:industrial?2.26:1.92),.08)
      }
      if(!detail){
        if(residential||f==='stone')batch.wall(m.trim,pos(left-.08,.2),pos(right+.08,.2),lo+sill-.12,lo+sill,.4)
        if(f==='balcony'&&lo>=3){
          batch.wall(m.trim,pos(l+.12,.6),pos(r-.12,.6),lo-.14,lo+.03,1.2)
          batch.wall(m.metal,pos(l+.12,1.15),pos(r-.12,1.15),lo+.95,lo+1.01,.055)
          for(let q=l+.15;q<r-.12;q+=.28)batch.wall(m.metal,pos(q,1.15),pos(q+.025,1.15),lo+.1,lo+1,.035)
          for(const t of [l+.15,r-.15]){batch.wall(m.metal,pos(t,.12),pos(t,1.15),lo+.95,lo+1.01,.05);for(let q=.2;q<1.15;q+=.28){const c=pos(t,q);batch.box(m.metal,c[0],lo+.55,c[1],.035,.9,.035)}}
        }
        if(f==='fins')batch.wall(m.trim,pos(l-.035,lo>=3?.3:0),pos(l+.22,lo>=3?.3:0),lo,hi,lo>=3?.7:.28)
        if(f==='cornice'&&hi>=b.floors*3)for(let k=0;k<3;k++)batch.wall(m.trim,pos(l,.15+k*.06),pos(r,.15+k*.06),hi-.32+k*.1,hi-.26+k*.1,.3+k*.08)
        if(f==='arcade'&&lo===0){
          const center=(l+r)/2,rx=(pitch-.32)/2
          for(let k=0;k<12;k++){
            const a0=Math.PI*k/12,a1=Math.PI*(k+1)/12,outer0=pos(center+Math.cos(a0)*rx,.21),outer1=pos(center+Math.cos(a1)*rx,.21),inner0=pos(center+Math.cos(a0)*(rx-.15),.21),inner1=pos(center+Math.cos(a1)*(rx-.15),.21)
            batch.quad(m.trim,[[outer0[0],2.02+Math.sin(a0)*.66,outer0[1]],[outer1[0],2.02+Math.sin(a1)*.66,outer1[1]],[inner1[0],2.02+Math.sin(a1)*.49,inner1[1]],[inner0[0],2.02+Math.sin(a0)*.49,inner0[1]]],[nx,0,ny])
          }
        }
        if(['loading','roller','louvers'].includes(f)&&lo<.1&&i%2===0){batch.wall(m.metal,pos(left,.15),pos(right,.15),.08,2.45,.08);for(let h=.2;h<2.4;h+=.16)batch.wall(m.trim,pos(left,.205),pos(right,.205),h,h+.025,.025)}
        if(f==='piping'&&i%2===0){batch.wall(m.metal,pos(l+.3,.34),pos(l+.44,.34),.1,hi+.25,.18);batch.wall(m.metal,pos(l+.3,.34),pos(r-.25,.34),hi-.45,hi-.3,.18)}
        if(f==='awning'&&lo===0){
          const color=['#244f75','#74463a','#3e6357'][b.seed%3],fabric=l11Material('paint',color),p0=pos(l+.08,.14),p1=pos(r-.08,.14),p2=pos(r-.08,1.5),p3=pos(l+.08,1.5)
          batch.quad(fabric,[[p0[0],2.92,p0[1]],[p1[0],2.92,p1[1]],[p2[0],2.63,p2[1]],[p3[0],2.63,p3[1]]],[0,1,0]);batch.wall(fabric,p3,p2,2.49,2.64,.035)
        }
        if(lo>=3&&residential&&(i+b.seed)%4===0){
          const c=pos(r-.38,.38);batch.box(m.trim,c[0],lo+.42,c[1],.62,.38,.38)
          batch.wall(m.metal,pos(r-.68,.59),pos(r-.08,.59),lo+.28,lo+.58,.018)
        }
      }
    }
    batch.wall(m.trim,a,end,hi-.12,hi,.36)
    if(lo<.1)batch.wall(m.base,a,end,0,shop?.12:.32,.29)
  }
}
function roof(batch:CityBatch,b:L11Building,v:L11Building['volumes'][number],detail:number){
  const p=l11VolumePolygon(v),m=buildingMaterials(b),H=v.hi
  batch.surface(m.trim,p,H)
  if(!v.shape||v.shape==='round')for(const ring of p)for(let i=1;i<ring.length;i++){
    batch.wall(m.wall,ring[i-1],ring[i],H,H+.45,.22)
    if(detail<2)batch.wall(m.trim,ring[i-1],ring[i],H+.43,H+.51,.34)
  }
  if(v.shape==='gable'||v.shape==='sawtooth'||v.shape==='barrel'){
    const teeth=v.shape==='sawtooth'?Math.max(2,Math.floor(v.d/5)):v.shape==='barrel'?8:2
    for(let i=0;i<teeth;i++){
      const z0=v.y+v.d*i/teeth,z1=v.y+v.d*(i+1)/teeth
      const height=(t:number)=>v.shape==='sawtooth'?(t%1)*1.6:v.shape==='barrel'?Math.sin(t*Math.PI)*2:(1-Math.abs(t-.5)*2)*2
      const h0=H+(v.shape==='sawtooth'?0:height(i/teeth)),h1=H+(v.shape==='sawtooth'?1.6:height((i+1)/teeth))
      batch.quad(m.metal,[[v.x,h0,z0],[v.x+v.w,h0,z0],[v.x+v.w,h1,z1],[v.x,h1,z1]],[0,1,0])
      // Close the roof's end profiles so gables and sawtooth bays cannot reveal
      // the sky through the attic when viewed obliquely from street level.
      batch.quad(m.wall,[[v.x,H,z1],[v.x,H,z0],[v.x,h0,z0],[v.x,h1,z1]],[-1,0,0])
      batch.quad(m.wall,[[v.x+v.w,H,z0],[v.x+v.w,H,z1],[v.x+v.w,h1,z1],[v.x+v.w,h0,z0]],[1,0,0])
      if(v.shape==='sawtooth')batch.wall(m.dark,[v.x,z1],[v.x+v.w,z1],H,H+1.6,.05)
    }
  }
  l11RoofDetails(batch,b,v,detail,m)
}
export function* buildL11Building(s:Structure):Generator<void,THREE.Group,unknown>{
  const b=s.l11!,root=new THREE.Group(),lod=new L11BuildingLOD(b),groups:THREE.Group[]=[];let complete=false
  const spec=l11Archetype(b.archetype),industrial=spec.group==='industrial',ceiling=l11Material(industrial?'concrete':'paint',industrial?'#bcb9ad':'#e4e0d4',true)
  try{
    for(let detail=0;detail<3;detail++){
      const g=new THREE.Group(),a=new CityBatch(detail===0,detail===0),plants=new CityBatch(),m=buildingMaterials(b);groups.push(g)
      if(b.archetype==='unfinished-frame'||b.archetype==='barred-brick'){
        addL11ExitParts(a,[...l11SpecialBuildingParts(b),...l11ShaftParts(b)],undefined,b.archetype==='unfinished-frame')
        if(!detail)a.solids.push(...l11ExitDoorSolid(b))
        a.finish(g);if(!detail)root.userData.l11Solids=a.solids;lod.addLevel(g,detail===0?0:detail===1?65:150,.12);yield;continue
      }
      if(!b.sealed){
        for(let f=0;f<b.accessible;f++){
          facade(a,b,b.localFootprint,f*3,(f+1)*3,detail)
          if(detail<2)for(const wall of l11InteriorWalls(b))if(wall.floor===f){
            a.wall(l11Material(industrial?'concrete':'paint','#e4ded1',true),wall.a,wall.b,f*3,f*3+2.88,.16)
            if(!detail)a.wall(l11Material('paint','#827d70',true),wall.a,wall.b,f*3+.02,f*3+.13,.175)
          }
          const holes:Polygon[]=[]
          if(f)holes.push(l11StairRect(b.stairs[f-1]))
          const floorKind=l11FloorKind(b,f),floorMat=l11Material(floorKind,floorKind==='concrete'?'#a7aaa2':floorKind==='ceramic'?'#e1e0d5':undefined,true)
          for(const p of holes.length?clipping.difference(b.localFootprint,...holes):[b.localFootprint]){a.surface(floorMat,p,f*3+.015);if(f)a.surface(ceiling,p,f*3-.12)}
          if(detail<2){
            const plan=l11InteriorPlan(b).floors[f]
            for(const room of plan.rooms){
              const kind=l11RoomFloor(room.kind),finish=l11Material(kind,kind==='fabric'?'#828d8d':kind==='ceramic'?(room.kind==='shop'?'#c4c0af':'#e0e2da'):kind==='concrete'?'#acafa7':undefined,true)
              a.surface(finish,rectangle(room.x+.085,room.y+.085,room.w-.17,room.h-.17),f*3+.019)
              // Tiled sanitary rooms have a washable dado; other rooms retain
              // plaster and skirting so the floor program reads at eye level.
              if(!detail&&room.kind==='bathroom')for(const wall of plan.walls)if(Math.max(segmentRoomDistance(wall.a,room),segmentRoomDistance(wall.b,room))<.02){
                const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],len=Math.hypot(dx,dy),sign=(-dy*(room.x+room.w/2-(wall.a[0]+wall.b[0])/2)+dx*(room.y+room.h/2-(wall.a[1]+wall.b[1])/2))>0?1:-1,nx=-dy/len*sign,ny=dx/len*sign,p=[wall.a[0]+nx*.086,wall.a[1]+ny*.086],q=[wall.b[0]+nx*.086,wall.b[1]+ny*.086]
                a.quad(l11Material('ceramic','#e3e8df',true),[[p[0],f*3+.15,p[1]],[q[0],f*3+.15,q[1]],[q[0],f*3+1.45,q[1]],[p[0],f*3+1.45,p[1]]],[nx,0,ny])
              }
            }
            for(const door of plan.doors){
              const w=Math.hypot(door.b[0]-door.a[0],door.b[1]-door.a[1]),dx=(door.b[0]-door.a[0])/w,dy=(door.b[1]-door.a[1])/w,streetShop=door.to==='street'&&(b.architecture==='pier-retail'||b.architecture==='blue-retail'),frame=streetShop?l11Material('metal','#303c3e',true):l11Material('propwood','#d4c7ad',true)
              a.wall(ceiling,door.a,door.b,f*3+2.3,f*3+2.88,.16)
              if(!detail){for(const p of [door.a,door.b])a.box(frame,p[0],f*3+1.16,p[1],streetShop?.045:.1,2.32,streetShop?.17:.1);a.wall(frame,door.a,door.b,f*3+2.25,f*3+2.34,.21);a.wall(m.base,[door.center[0]-dx*w/2,door.center[1]-dy*w/2],[door.center[0]+dx*w/2,door.center[1]+dy*w/2],f*3+.019,f*3+.023,.2)}
            }
          }
          if(!detail)for(const wall of l11WallSegments(b))if(!wall.entrance){a.wall(l11Material('paint','#8a8579',true),wall.a,wall.b,f*3+.02,f*3+.13,.3)}
          // Exposed concrete beams and a suspended service tray follow the
          // unfinished industrial reference, with all parts above 2.6m clear.
          if(!detail&&industrial){
            const box=bounds(b.localFootprint),stairHole=f<b.accessible-1?[l11StairRect(b.stairs[f])]:[]
            for(let x=box.x+2.5;x<box.x+box.w-.5;x+=5){
              const beam=clipping.intersection(b.localFootprint,rectangle(x-.14,box.y,.28,box.h))
              for(const p of stairHole.length?clipping.difference(beam,...stairHole):beam){a.prism(ceiling,p,f*3+2.7,f*3+2.87);a.surface(ceiling,p,f*3+2.7)}
            }
            const tray=clipping.intersection(b.localFootprint,rectangle(box.x,box.y+box.h/2-.13,box.w,.26))
            for(const p of stairHole.length?clipping.difference(tray,...stairHole):tray){a.prism(m.metal,p,f*3+2.61,f*3+2.69);a.surface(m.metal,p,f*3+2.61)}
          }
          if(f<b.accessible-1){const s=b.stairs[f],alongX=s.axis==='x';for(let k=0;k<18;k++)a.box(m.trim,s.x+(alongX?(k+.5)*s.length/18:s.width/2),f*3+(k+1)/6-.065,s.y+(alongX?s.width/2:(k+.5)*s.length/18),alongX?s.length/18:s.width,.13,alongX?s.width:s.length/18)
            for(const side of [0,s.width]){for(let k=0;k<=6;k++)a.box(m.metal,s.x+(alongX?k*s.length/6:side),f*3+k*.5+.5,s.y+(alongX?side:k*s.length/6),.045,1,.045);rail(a,m.metal,[s.x+(alongX?0:side),f*3+1,s.y+(alongX?side:0)],[s.x+(alongX?s.length:side),f*3+4,s.y+(alongX?side:s.length)])}
          }
          yield
        }
        a.surface(ceiling,b.localFootprint,b.accessible*3-.12)
      }
      // Level terrain is gently sloped while each building has one floor datum.
      // A continuous foundation closes the resulting few centimetres below it.
      if(detail<2)for(const wall of l11WallSegments(b))a.wall(m.base,wall.a,wall.b,-.65,0,.28)
      for(const v of b.volumes){const p=l11VolumePolygon(v),start=Math.max(v.lo,b.sealed?0:b.accessible*3),design=v.facadeProfile?{...b,facadeProfile:v.facadeProfile}:b;if(v.hi>start)for(let f=start;f<v.hi;f+=detail===2?9:3){facade(a,design,p,f,Math.min(f+(detail===2?9:3),v.hi),detail,v.faceProfiles);yield}roof(a,b,v,detail);if(v.soffit)a.box(l11Material('paint','#c7d0cd'),v.x+v.w/2,v.lo+.08,v.y+v.d/2,v.w,.16,v.d)}
      if(!detail){
        const dl=b.doorLocal,ang=b.doorAngle-b.angle,nx=Math.sin(ang),ny=-Math.cos(ang)
        if(!b.facadeProfile&&['awning','shopfront','arcade'].includes(spec.facade)){const p=strip([dl[0]-Math.cos(ang)*3+nx*.7,dl[1]-Math.sin(ang)*3+ny*.7],[dl[0]+Math.cos(ang)*3+nx*.7,dl[1]+Math.sin(ang)*3+ny*.7],1.8);a.surface(l11Material('paint','#607c88'),p,2.7)}
        for(const [x,y]of l11BuildingColumns(b)){a.box(m.trim,x,1.4,y,.3,2.8,.3);a.box(m.trim,x,2.7,y,.52,.16,.52);a.box(m.trim,x,2.82,y,.64,.08,.64)}
        if(b.floors>b.accessible&&!b.sealed)addL11Sign(a,'closed',dl[0]+Math.cos(ang)*1.9-nx*.17,1.65,dl[1]+Math.sin(ang)*1.9-ny*.17,-ang,1,1/4.2,true)
        const fullCanopy=b.architecture==='pier-retail'||b.architecture==='blue-retail',canopySign=fullCanopy||!!b.facadeProfile&&!b.sealed||['awning','shopfront','arcade'].includes(spec.facade)
        // Shop signs sit on the canopy fascia, clear of its overhang and above
        // a 2.15m pedestrian headroom, instead of intersecting the awning.
        const signOffset=fullCanopy?(b.width>50?1.8:1.1)*.9+.12:canopySign?1.75:.18
        if(b.architecture!=='pier-retail'&&b.architecture!=='ribbon-twins'&&b.architecture!=='glazed-terrace'&&b.architecture!=='quay-service-wing'&&b.architecture!=='canal-portico')addL11Sign(a,l11BuildingSign(spec.id,b.seed),dl[0]+nx*signOffset,fullCanopy?3.1:canopySign?2.76:spec.facade==='colonnade'?3.45:2.85,dl[1]+ny*signOffset,Math.PI-ang,Math.min(canopySign?3.2:4.5,b.width*.3))
      }
      for(const p of l11ReferenceDetails(b))if(detail<=p.tier){
        if(p.surface==='grass')plants.geometry(l11LeafMaterial(p.color),l11FoliageGeometry(p.w,p.h,p.d,detail===2?.12:detail===1?.3:.65,'trimmed'),new THREE.Matrix4().makeTranslation(p.x,p.y,p.z))
        else if(p.solid===false)plants.box(l11Material(p.surface,p.color),p.x,p.y,p.z,p.w,p.h,p.d,p.slope)
        else a.box(l11Material(p.surface,p.color),p.x,p.y,p.z,p.w,p.h,p.d,p.slope)
      }
      addL11ReferenceBanner(a,b)
      if(detail<2)addL11ShopSigns(a,b)
      addL11ExitParts(a,l11ArchiveBackingParts(b))
      if(!detail)a.solids.push(...l11ExitDoorSolid(b))
      plants.finish(g);a.finish(g);if(detail===0)root.userData.l11Solids=a.solids;lod.addLevel(g,detail===0?0:detail===1?65:150,.12);yield
    }
    root.add(lod);root.position.set(s.x+b.ox-b.x,0,s.y+b.oy-b.y);root.rotation.y=-b.angle;root.userData.noModelColliders=true;root.userData.l11Instance=b.id;setL11BuildingSolids(s,root.userData.l11Solids);delete root.userData.l11Solids;complete=true;return root
  }finally{if(!complete)for(const g of groups)g.traverse(o=>(o as THREE.Mesh).geometry?.dispose())}
}
export function buildL11Terrain(m:GameMap,g:THREE.Group,r?:{x0:number;y0:number;x1:number;y1:number},closedWalls=false){const job=buildL11TerrainJob(m,g,r,closedWalls);while(!job.next().done){/* synchronous tooling */}}
export function* buildL11TerrainJob(m:GameMap,g:THREE.Group,r?:{x0:number;y0:number;x1:number;y1:number},_closedWalls=false,realWater=false):Generator<void,void,unknown>{
  const ox=m.inf?.ox??0,oy=m.inf?.oy??0,seed=m.inf?.seed??0,x0=(r?.x0??0)+ox,y0=(r?.y0??0)+oy,x1=(r?.x1??m.w)+ox,y1=(r?.y1??m.h)+oy
  const a=new CityBatch(),waterPolygons:Polygon[]=[],concrete=l11Material('concrete','#a8aba5'),yard=l11Material('concrete','#8d918b'),paving=l11Material('paving','#e1ddcf'),stone=l11Material('limestone','#cfccbe'),asphalt=l11Material('asphalt','#cad0d0'),paint=l11Material('paint','#eee9d6'),yellow=l11Material('paint','#d6b868')
  for(let cy=Math.floor(y0/32);cy<Math.ceil(y1/32);cy++)for(let cx=Math.floor(x0/32);cx<Math.ceil(x1/32);cx++){
    const data=m.inf?.chunks.get(`${cx},${cy}`)?.l11??l11ChunkData(seed,cx,cy),domain=rectangle(Math.max(x0,cx*32),Math.max(y0,cy*32),Math.min(x1,cx*32+32)-Math.max(x0,cx*32),Math.min(y1,cy*32+32)-Math.max(y0,cy*32)),waters=data.canals.flatMap(c=>c.water),holes:Polygon[]=[]
    const markingRoads=[]
    for(let my=Math.floor((cy*32-16)/1024);my<=Math.floor((cy*32+16)/1024);my++)for(let mx=Math.floor((cx*32-16)/1024);mx<=Math.floor((cx*32+16)/1024);mx++)markingRoads.push(...l11CityPlan(seed,mx,my).roads)
    for(let sy=Math.floor((cy*32-120)/512)*512+120;sy<cy*32+32;sy+=512)for(let sx=Math.floor((cx*32-26)/512)*512+26;sx<cx*32+32;sx+=512)holes.push(rectangle(sx,sy,3,10))
    const domainBounds=bounds(domain)
    // Outdoor material must never cover an interior floor, especially on slopes.
    // Cutting the shared footprint also removes terrain/floor z-fighting.
    const exclusions=[...holes,...data.buildings.map(b=>b.footprint)]
    const clip=(p:Polygon|import('../world/l11Geometry').MultiPolygon)=>intersects(bounds(p),domainBounds)?clipping.difference(clipping.intersection(p,domain),...exclusions).flatMap(p=>l11BridgeSurfaceParts(p,data.bridges)):[]
    const h=(x:number,y:number)=>l11StreetHeight(data,x,y)
    const ground=l11GroundPolygons(m,data,domain,exclusions)
    for(const p of ground.yard)a.surface(yard,p,h,ox,oy)
    for(const p of ground.grass)a.surface(l11Material('grass'),p,h,ox,oy)
    // Service courts use smaller dark pavers; their pale concrete aprons and
    // narrow drainage channels distinguish the rear lanes from public sidewalks.
    for(const alley of data.alleys)for(const p of clip(alley.polygon))a.surface(l11Material('paving','#92988e'),p,(x,y)=>h(x,y)+.016,ox,oy)
    for(const b of data.buildings)for(const ring of b.footprint)for(let i=1;i<ring.length;i++){
      const p=ring[i-1],q=ring[i],len=Math.hypot(q[0]-p[0],q[1]-p[1]);if(len<5)continue
      const nx=(q[1]-p[1])/len,ny=-(q[0]-p[0])/len,mx=(p[0]+q[0])/2,my=(p[1]+q[1])/2
      if(Math.hypot(mx-b.door[0],my-b.door[1])<7)continue
      const apron=strip([p[0]+nx*.65,p[1]+ny*.65],[q[0]+nx*.65,q[1]+ny*.65],1.1),channel=strip([p[0]+nx*1.05,p[1]+ny*1.05],[q[0]+nx*1.05,q[1]+ny*1.05],.07)
      const cuts=[...waters,...data.roads.flatMap(r=>r.polygon)]
      for(const surface of clip(apron))for(const poly of cuts.length?clipping.difference(surface,...cuts):[surface])a.surface(concrete,poly,(x,y)=>h(x,y)+.023,ox,oy)
      for(const surface of clip(channel))for(const poly of cuts.length?clipping.difference(surface,...cuts):[surface])a.surface(l11Material('metal','#606964'),poly,(x,y)=>h(x,y)+.024,ox,oy)
    }
    for(const p of clip(rectangle(28,54,52,48)))a.surface(stone,p,(x,y)=>h(x,y)+.012,ox,oy)
    for(const canal of data.canals){
      for(const p of clip(canal.banks))for(const bank of clipping.difference(p,...canal.water))a.surface(paving,bank,(x,y)=>h(x,y)+.022,ox,oy)
      for(const p of clipping.intersection(canal.water,domain)){a.surface(concrete,p,L11_CANAL_BED,ox,oy);waterPolygons.push(p)}
      for(const ring of canal.water.flat())for(let i=1;i<ring.length;i++){const p=ring[i-1],q=ring[i];if(Math.abs(q[1]-p[1])<.001)continue;for(const poly of clipping.intersection(strip(p,q,.3),domain)){a.prism(concrete,transform(poly,-ox,-oy,0),L11_CANAL_BED,.1);a.surface(stone,poly,.12,ox,oy)}}
    }
    addL11BridgeDeck(a,data,ox,oy)
    for(const road of data.roads){
      // Waterfront pedestrian promenades share the same planning graph as
      // carriageways.  Keep their paving independent so it cannot paint a
      // second surface over a crossing motor road at a chunk seam.
      const motorRoads=data.roads.filter(r=>r.id!==road.id&&!r.pedestrian).map(r=>r.polygon)
      const roadParts=(poly:Polygon|import('../world/l11Geometry').MultiPolygon)=>road.pedestrian&&motorRoads.length?clipping.difference(poly,...motorRoads):[poly]
      for(let i=1;i<road.points.length;i++)for(const raw of roadParts(strip(road.points[i-1],road.points[i],road.width+6)))for(const p of clip(raw))a.surface(paving,p,(x,y)=>h(x,y)+.03,ox,oy)
      for(const raw of roadParts(road.polygon))for(const p of clip(raw))a.surface(road.pedestrian?paving:asphalt,p,(x,y)=>h(x,y)+L11_ROAD_SURFACE_LIFT,ox,oy)
      for(let i=1;i<road.points.length;i++){const p=road.points[i-1],q=road.points[i],len=Math.hypot(q[0]-p[0],q[1]-p[1]),dx=(q[0]-p[0])/len,dy=(q[1]-p[1])/len,projection=domain[0].map(v=>(v[0]-p[0])*dx+(v[1]-p[1])*dy),lo=Math.max(0,Math.floor((Math.min(...projection)-4)/8)*8),hi=Math.min(len,Math.max(...projection)+4)
        const at=(t:number):Point=>[p[0]+dx*t,p[1]+dy*t]
        const crossingPositions=l11CrossingPositions(road,i,markingRoads),yellowCrossing=l11YellowCrossing(seed,road)
        const crossingClearance=crossingPositions.map(t=>strip(at(t-2),at(t+2),road.width))
        // Keep longitudinal markings out of intersecting carriageways. Parallel
        // macro/district road descriptions share their existing continuous line.
        const junctions=data.roads.filter(r=>r.id!==road.id&&r.points.slice(1).some((b,j)=>{
          const a=r.points[j],length=Math.hypot(b[0]-a[0],b[1]-a[1])
          return length>0&&Math.abs(dx*(b[1]-a[1])-dy*(b[0]-a[0]))/length>.12
        })).flatMap(r=>r.polygon)
        const markingCuts=[...junctions,...crossingClearance]
        const lineClip=(poly:Polygon)=>clip(poly).flatMap(part=>markingCuts.length?clipping.difference(part,...markingCuts):[part])
        if(!road.pedestrian&&road.class!=='waterfront'){
          // Zebra crossings are anchored to the road graph, including oblique
          // junctions. Markings sit just above the road, never over its kerbs.
          for(const t of crossingPositions)if(t>=lo-4&&t<=hi+4)for(let off=-road.width/2+.7;off<road.width/2-.5;off+=1){
            const a0:Point=[p[0]+dx*(t-1.4)-dy*off,p[1]+dy*(t-1.4)+dx*off],a1:Point=[p[0]+dx*(t+1.4)-dy*off,p[1]+dy*(t+1.4)+dx*off]
            for(const poly of clip(strip(a0,a1,yellowCrossing?.18:.48)))a.surface(yellowCrossing?yellow:paint,poly,(x,y)=>h(x,y)+.063,ox,oy)
          }
          if(yellowCrossing)for(const t of crossingPositions)if(t>=lo-4&&t<=hi+4)for(const edge of [-1.4,1.4]){
            const centre=at(t+edge),left:Point=[centre[0]+dy*(road.width/2-.4),centre[1]-dx*(road.width/2-.4)],right:Point=[centre[0]-dy*(road.width/2-.4),centre[1]+dx*(road.width/2-.4)]
            for(const poly of clip(strip(left,right,.12)))a.surface(yellow,poly,(x,y)=>h(x,y)+.064,ox,oy)
          }
          if(road.width>=10)for(let t=Math.max(24,Math.floor(lo/12)*12);t<Math.min(len-16,hi+8);t+=12)for(const side of [-1,1]){
            const off=side*(road.width/2-2.25),point=(v:number,s=off):Point=>[p[0]+dx*v-dy*s,p[1]+dy*v+dx*s]
            for(const [start,end]of [[point(t-3.3),point(t+3.3)],[point(t-3.3),point(t-3.3,side*(road.width/2-.2))]])for(const poly of lineClip(strip(start,end,.075)))a.surface(paint,poly,(x,y)=>h(x,y)+.059,ox,oy)
          }
        }
        if(!road.pedestrian&&road.class==='arterial')for(const offset of [-.13,.13]){
          const start:Point=[p[0]+dx*lo-dy*offset,p[1]+dy*lo+dx*offset],end:Point=[p[0]+dx*hi-dy*offset,p[1]+dy*hi+dx*offset]
          for(const poly of lineClip(strip(start,end,.1)))a.surface(yellow,poly,(x,y)=>h(x,y)+.06,ox,oy)
        }else if(!road.pedestrian)for(let t=lo;t<hi;t+=8){const start:Point=[p[0]+dx*t,p[1]+dy*t],end:Point=[p[0]+dx*Math.min(len,t+4),p[1]+dy*Math.min(len,t+4)];for(const poly of lineClip(strip(start,end,.12)))a.surface(paint,poly,(x,y)=>h(x,y)+.06,ox,oy)}
        // Kerbs follow the road edge; junctions are cut out using the other roads.
        if(!road.pedestrian)for(const side of [-1,1]){const offset=side*(road.width/2+.15),edge=strip([p[0]-dy*offset,p[1]+dx*offset],[q[0]-dy*offset,q[1]+dx*offset],.25),others=data.roads.filter(r=>r.id!==road.id&&intersects(r.bounds,bounds(edge))).flatMap(r=>r.polygon)
          for(const poly of clip(edge))for(const curb of others.length?clipping.difference(poly,...others):[poly])a.prism(concrete,transform(curb,-ox,-oy,0),h(cx*32,cy*32)+.035,h(cx*32,cy*32)+.15)
        }
      }
      yield
    }
    // Underground sidewalks and the stair shaft share the same continuous query as movement.
    for(let y=cy*32;y<cy*32+32;y++)for(let x=cx*32;x<cx*32+32;x++){
      const lx=x-ox,ly=y-oy,i=ly*m.w+lx;if(i<0||i>=m.tiles.length)continue
      const ramp=l11MetroRamp(x+.5,y+.5,seed)
      if(ramp!==null)for(let k=0;k<3;k++){const top=l11MetroRamp(x+.5,y+(k+1)/3,seed)??-5;a.box(concrete,lx+.5,(top-5.2)/2,ly+(k+.5)/3,1,top+5.2,1/3)}
      if(m.dn[i]===1){a.surface(l11Material('ceramic','#caccc1',true),rectangle(x,y,1,1),-5,ox,oy);if(ramp===null){const top=h(x+.5,y+.5)+.008;a.box(concrete,lx+.5,(L11_METRO_CEILING+top)/2,ly+.5,1,top-L11_METRO_CEILING,1)}for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const j=(ly+dy)*m.w+lx+dx;if(j>=0&&j<m.dn.length&&!m.dn[j])a.box(concrete,lx+.5+dx*.49,-3.5,ly+.5+dy*.49,dx?.04:1,3,dy?.04:1)}}
    }
    for(let sy=Math.floor((cy*32-120)/512)*512+120;sy<cy*32+33;sy+=512)for(let sx=Math.floor((cx*32-26)/512)*512+26;sx<cx*32+33;sx+=512){
      for(const p of clip(rectangle(sx,sy-.8,3,.6)))a.surface(l11Material('tactile','#e3c585'),p,(x,y)=>h(x,y)+.04,ox,oy)
      for(const p of clipping.intersection(rectangle(sx,sy+10.15,3,.6),domain))a.surface(l11Material('tactile','#e3c585',true),p,-4.985,ox,oy)
    }
    yield
  }
  a.finish(g)
  const water=l11CanalWater(waterPolygons,ox,oy,realWater);if(water)g.add(water)
}
export function* buildL11DistantCity(seed:number,ox:number,oy:number,realWater=false):Generator<void,THREE.Group,unknown>{
  const g=new THREE.Group(),a=new CityBatch();let complete=false
  try{
    const buildings=l11Buildings(seed,ox-360,oy-360,ox+520,oy+520)
    {const ids=new Set(buildings.map(b=>b.id));for(const b of l11CityPlan(seed,Math.floor((ox+64)/1024),Math.floor((oy+64)/1024)).buildings)if(b.floors>=7&&!ids.has(b.id)&&Math.hypot(b.ox+b.width/2-ox-80,b.oy+b.depth/2-oy-80)<740)buildings.push(b)}
    for(const b of buildings){
    if(b.x+b.w>ox&&b.x<ox+160&&b.y+b.h>oy&&b.y<oy+160)continue
    if(b.archetype==='unfinished-frame'||b.archetype==='barred-brick'){addL11ExitParts(a,[...l11SpecialBuildingParts(b),...l11ShaftParts(b)],new THREE.Matrix4().makeTranslation(b.ox-ox,b.base,b.oy-oy).multiply(new THREE.Matrix4().makeRotationY(-b.angle)),b.archetype==='unfinished-frame');yield;continue}
    const material=buildingMaterials(b)
    for(const v of b.volumes){const p=transform(l11VolumePolygon(v),b.ox-ox,b.oy-oy,b.angle);if(b.facadeProfile){for(let f=v.lo;f<v.hi;f+=3)referenceFacade(a,v.facadeProfile?{...b,facadeProfile:v.facadeProfile}:b,p,b.base+f,b.base+Math.min(f+3,v.hi),2,v.faceProfiles,b.angle,b.base)}else{for(const ring of p)for(let i=1;i<ring.length;i++)farFacadeEdge(a,b,ring[i-1],ring[i],b.base+v.lo,b.base+v.hi)}a.surface(material.wall,p,b.base+v.hi);if(v.soffit){const r=p[0];a.quad(material.trim,r.slice(0,4).map(q=>[q[0],b.base+v.lo,q[1]]),[0,-1,0])}}
    for(const p of l11ReferenceDetails(b))if(p.tier===2){
      const matrix=new THREE.Matrix4().makeTranslation(b.ox-ox,b.base,b.oy-oy).multiply(new THREE.Matrix4().makeRotationY(-b.angle)).multiply(new THREE.Matrix4().makeTranslation(p.x,p.y,p.z))
      if(p.surface==='grass'){a.geometry(l11LeafMaterial(p.color),l11FoliageGeometry(p.w,p.h,p.d,.12,'trimmed'),matrix);continue}
      if(p.slope)matrix.multiply(new THREE.Matrix4().set(1,0,0,0,p.slope[0],1,p.slope[1],0,0,0,1,0,0,0,0,1))
      matrix.scale(new THREE.Vector3(p.w,p.h,p.d))
      a.geometry(l11Material(p.surface,p.color),unit.box,matrix)
    }
    addL11ReferenceBanner(a,b,new THREE.Matrix4().makeTranslation(b.ox-ox,b.base,b.oy-oy).multiply(new THREE.Matrix4().makeRotationY(-b.angle)))
    yield
  }
  // Preserve the planned avenue and quay tree rows outside the streamed
  // window. Low-density foliage is still volumetric and uses the same recipe.
  if(seed===L11_REFERENCE_SEED)for(const p of L11_REFERENCE_PROPS){
    if(p.key!=='plane_tree'&&p.key!=='streetlight')continue
    const spec=l11DecorDef('l11_'+p.key)!,cx=Math.floor(p.x/32)*32,cy=Math.floor(p.y/32)*32
    if(cx>=ox&&cx<ox+160&&cy>=oy&&cy<oy+160||Math.hypot(p.x-ox-80,p.y-oy-80)>290)continue
    const plan=l11ChunkData(seed,Math.floor(p.x/32),Math.floor(p.y/32)),neighbours=l11Buildings(seed,p.x-14,p.y-14,p.x+14,p.y+14)
    if(!l11StreetPropAllowed(seed,p.key,p.x,p.y,p.angle,neighbours,plan))continue
    const matrix=new THREE.Matrix4().makeTranslation(p.x-ox,l11TerrainHeight(seed,p.x,p.y),p.y-oy).multiply(new THREE.Matrix4().makeRotationY(-p.angle))
    partGeometry(a,spec.id,0,false,matrix,true)
  }
  a.finish(g);yield* addL11DistantTerrain(g,seed,ox,oy,realWater);g.traverse(o=>{if((o as THREE.Mesh).isMesh)o.castShadow=false});g.name='l11-distant-world-geometry';g.userData.ox=ox;g.userData.oy=oy;complete=true;return g}finally{if(!complete)g.traverse(o=>(o as THREE.Mesh).geometry?.dispose())}
}
