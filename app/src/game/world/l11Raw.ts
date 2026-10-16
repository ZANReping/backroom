import { l11RoomFixtures } from './l11RoomFurnishing'
import type { GenChunk } from './infiniteRegistry'
import type { LevelDef, Structure, FloorBand } from '../core/types'
import { l11ChunkData,l11TerrainHeight,l11Hash,l11Rand,l11SurfaceAt,l11VariantOf,l11Local,l11World,l11MetroRamp,l11MetroAt,l11StairAt,l11Buildings,type L11Variant } from './l11Layout'
import { inPolygon, bounds, rectangle, transform, circlePolygon, segmentDistance } from './l11Geometry'
import { L11_DECOR_DEFS,l11DecorDef } from '../content/l11Decor'
import { L11_CANAL_BED } from './l11Hydrology'
import { L11_REFERENCE_SEED,L11_REFERENCE_PROPS,l11ReferenceStreet } from './l11ReferenceDistrict'
import { l11CurbFacing,l11TrafficFacing,l11FaceToward,l11FootprintsOverlap,L11_DRESSING_VERSION,L11_ROAD_SURFACE_LIFT } from './l11Dressing'
import { l11StreetPropAllowed } from './l11PropPlacement'
import { l11BridgeRailPlacements } from './l11BridgeRails'
import { l11QuayRailPlacements } from './l11QuayRails'
import { l11CanalAccess } from './l11CanalAccess'
import { l11Shopfront } from './l11Shopfront'
import { L11_ROAD_EXITS } from './l11ExitPlan'
import { addL11Facelings } from './l11FacelingSpawns'

export function genL11ChunkRaw(def:LevelDef,seed:number,cx:number,cy:number,forced?:string,revision=0):GenChunk {
  const wx=cx*32,wy=cy*32,fv=forced as L11Variant|undefined,plan=l11ChunkData(seed,cx,cy,fv),n=1024
  const raw:GenChunk={l11:plan,variant:fv??l11VariantOf(seed,cx,cy),tiles:new Uint8Array(n).fill(1),wet:new Uint8Array(n),elev:new Uint8Array(n),step:new Uint8Array(n),tint:new Uint8Array(n),crawl:new Uint8Array(n),outdoor:new Uint8Array(n).fill(1),ceiling:new Uint8Array(n),liquid:new Uint8Array(n),seaFloor:new Float32Array(n),terrain:new Float32Array(n),dn:new Uint8Array(n),dnWall:new Uint8Array(n),up:new Uint8Array(n),upWall:new Uint8Array(n),up2:new Uint8Array(n),upWall2:new Uint8Array(n),stair:new Uint32Array(n),structures:[],items:[],lights:[],exits:[],entities:[],npcs:[]}
  const owns=(x:number,y:number)=>x>=wx&&x<wx+32&&y>=wy&&y<wy+32
  const add=(s:Structure)=>{if(owns(s.x+s.w/2,s.y+s.h/2))raw.structures.push(s)}
  const prop=(key:string,x:number,y:number,angle:number,id:string,extra:Structure['data']={},floor:FloorBand=0)=>{
    if(!owns(x,y))return
    const d=l11DecorDef(`l11_${key}`);if(!d)return
    const polygon=transform(rectangle(-d.w/2,-d.d/2,d.w,d.d),x,y,angle),bb=bounds(polygon)
    add({kind:d.id as Structure['kind'],...bb,solid:d.solid,floor,data:{...extra,instanceId:id,sid:l11Hash(seed,...Array.from(id).map(c=>c.charCodeAt(0))),deg:-angle*180/Math.PI,width:d.w,depth:d.d,revision,dressingVersion:L11_DRESSING_VERSION,style:extra.style??(l11Hash(seed,Math.round(x*10),Math.round(y*10),revision)%3)}})
  }
  for(let y=0;y<32;y++)for(let x=0;x<32;x++){
    const px=wx+x+.5,py=wy+y+.5,i=y*32+x,s=l11SurfaceAt(seed,px,py,fv,plan),ramp=l11MetroRamp(px,py,seed)
    raw.tint[i]=s.kind==='road'||s.kind==='bridge'?51:s.kind==='grass'?54:s.kind==='canal'?55:s.kind==='plaza'?53:52
    raw.terrain![i]=s.height
    if(s.kind==='canal'){raw.liquid![i]=1;raw.seaFloor![i]=-L11_CANAL_BED;raw.tiles[i]=2;raw.terrain![i]=L11_CANAL_BED}
    if(l11MetroAt(px,py))raw.dn![i]=1
    if(ramp!==null){raw.tint[i]=58;raw.dn![i]=1;raw.tiles[i]=1}
    const b=plan.buildings.find(b=>inPolygon(px,py,b.footprint));if(!b)continue
    raw.outdoor![i]=0;raw.tint[i]=b.use===0?57:56;raw.terrain![i]=b.base
    raw.tiles[i]=b.sealed?2:1
    if(b.accessible>1)raw.up![i]=1;if(b.accessible>2)raw.up2![i]=1
    // Grid is a navigation broad phase. Player and sight use the exact rotated footprint.
    const uv=l11Local(b,px,py),nearWall=b.localFootprint.some(r=>r.some((a,k)=>{const p=r[(k+1)%r.length],dx=p[0]-a[0],dy=p[1]-a[1],t=Math.max(0,Math.min(1,((uv[0]-a[0])*dx+(uv[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(uv[0]-a[0]-t*dx,uv[1]-a[1]-t*dy)<.13}))
    if(nearWall&&Math.hypot(px-b.door[0],py-b.door[1])>1.2){const shop=l11Shopfront(b);if(!shop?.available||Math.hypot(uv[0]-shop.door[0],uv[1]-shop.door[1])>1.2)raw.tiles[i]=2}
    const stair=l11StairAt(b,px,py,0)??l11StairAt(b,px,py,1)
    if(stair){raw.stair![i]=3|((Math.max(0,Math.round((stair.height-b.base)*100)))<<3)|((Math.max(0,Math.round((stair.height-b.base+.375)*100)))<<17);raw.ceiling![i]=1}
  }
  // Every intersecting chunk holds a reference; the live window and renderer deduplicate the ID.
  for(const b of plan.buildings){
    raw.structures.push({kind:'l11building',x:b.x,y:b.y,w:b.w,h:b.h,l11:b,solid:true,data:{buildingId:b.id,instanceId:b.id,sid:b.seed,floors:b.floors,accessible:b.accessible,base:b.base}})
    if(b.exit){const q=b.exit,[x,y]=l11World(b,...q.center),ed=def.exits.find(e=>e.kind===q.kind);if(ed&&owns(x,y))raw.exits.push({def:ed,x:x-.5,y:y-.5,z:b.base+q.floor*3+.02,floor:q.floor,discovered:false,l11:{id:b.id+':exit',buildingId:b.id,blockId:b.blockId,angle:b.angle+q.angle,width:q.width}})}
    if(b.sealed)continue
    if(b.archetype==='unfinished-frame')continue // unfinished floors have no occupied rooms or domestic furniture
    for(let fl=0;fl<b.accessible;fl++){
      for(const fixture of l11RoomFixtures(b).filter(p=>p.floor===fl)){
        const [x,y]=l11World(b,fixture.x,fixture.y),target=l11World(b,...fixture.target),wall=fixture.wall?l11World(b,...fixture.wall):undefined
        prop(fixture.key,x,y,b.angle+fixture.angle,fixture.id,{buildingId:b.id,l11Interior:1,roomId:fixture.roomId,roomKind:fixture.roomKind,mount:fixture.mount??0,placementRole:wall?'wall':fixture.groupId?'seating':'room',facingX:target[0],facingY:target[1],...(fixture.roomKind==='shop'?{style:0}:{}),...(wall?{wallX:wall[0],wallY:wall[1]}:{}),...(fixture.groupId?{groupId:fixture.groupId}:{})},fl as FloorBand)
        if(fixture.key==='ceiling_light'&&owns(x,y))raw.lights.push({x,y,z:b.base+fl*3,r:3.4,color:fixture.roomKind==='shop'?'#fff0d2':fixture.roomKind==='living'||fixture.roomKind==='bedroom'?'#f2e2c9':'#eef0e8',intensityMul:fixture.roomKind==='shop'?.32:.42,occluded:1,noFix:1,l11Building:b.id,l11Room:fixture.roomId,gen:1,flickerSeed:0})
      }
      const [lx,ly]=l11World(b,b.width-2.5,3)
      if(inPolygon(lx,ly,b.footprint)&&Math.hypot(lx-b.door[0],ly-b.door[1])>3)add({kind:'locker',x:lx-.5,y:ly-.5,w:1,h:1,solid:true,floor:fl as FloorBand,data:{buildingId:b.id,l11Interior:1,sid:l11Hash(b.seed,fl,202),lootItems:fl?['battery']:['almond','pamphlet']}})
      const [lightX,lightY]=l11World(b,b.width/2,4)
      if(inPolygon(lightX,lightY,b.footprint))prop('ceiling_light',lightX,lightY,b.angle,`${b.id}:light:${fl}`,{buildingId:b.id,l11Interior:1,mount:2.65},fl as FloorBand)
      if(owns(lightX,lightY))raw.lights.push({x:lightX,y:lightY,z:b.base+fl*3,r:5,color:'#eee7d7',intensityMul:.3,occluded:1,noFix:1,l11Building:b.id,gen:1,flickerSeed:0})
    }
  }
  // 6. Street furniture follows curb lines; shops, parks and service courts use
  // explicit groups, keeping a continuous two metre pedestrian route.
  const neighbours=l11Buildings(seed,wx-14,wy-14,wx+46,wy+46,fv)
  const outside=(key:string,x:number,y:number,angle:number,id:string,extra:Structure['data']={})=>{
    if(!owns(x,y))return
    if(!l11StreetPropAllowed(seed,key,x,y,angle,neighbours,plan,fv))return
    prop(key,x,y,angle,id,extra)
  }
  const seenRoads=new Set<string>()
  for(const road of plan.roads){if(seenRoads.has(road.id))continue;seenRoads.add(road.id)
    for(let si=1;si<road.points.length;si++){
      const a=road.points[si-1],b=road.points[si],length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=(b[0]-a[0])/length,dy=(b[1]-a[1])/length,angle=Math.atan2(dy,dx),projection=[[wx-12,wy-12],[wx+44,wy-12],[wx+44,wy+44],[wx-12,wy+44]].map(p=>(p[0]-a[0])*dx+(p[1]-a[1])*dy),start=Math.max(12,Math.floor(Math.min(...projection)/12)*12),end=Math.min(length-8,Math.max(...projection))
      for(let t=start;t<end;t+=12)for(const side of [-1,1]){
        const x=a[0]+dx*t,y=a[1]+dy*t,hs=l11Hash(seed,Math.round(x),Math.round(y),side,94),offset=side*(road.width/2+.65),px=x-dy*offset,py=y+dx*offset,id=road.id+':street:'+si+':'+t+':'+side
        if(!forced&&l11ReferenceStreet(seed,px,py))continue
        if(!owns(px,py)||plan.roads.some(r=>r.id!==road.id&&r.points.slice(1).some((p,k)=>segmentDistance(px,py,r.points[k],p)<r.width/2+2.8)))continue
        if(l11SurfaceAt(seed,px,py,fv,plan).kind==='canal')continue
        const face=l11CurbFacing(angle,side),towardRoad={placementRole:'roadside',facingX:x,facingY:y,roadId:road.id}
        if(t%36===12)outside('streetlight',px,py,face,id+':lamp',towardRoad)
        else if(road.width<14&&t%36===24&&l11SurfaceAt(seed,px,py,fv,plan).kind!=='bridge')outside('plane_tree',x-dy*side*(road.width/2+2.5),y+dx*side*(road.width/2+2.5),angle,id+':tree')
        else {const list=road.pedestrian?['park_bench','shrub_planter','flower_planter','trash_bin','recycling_bin','bike_rack','drinking_fountain','bollard']:['bollard','hydrant','parking_meter','road_sign','street_name','utility_box','trash_bin','recycling_bin','post_box','bike_rack','phone_booth','motor_scooter','bus_stop','ticket_machine'];outside(list[hs%list.length],px,py,face,id+':fixture',towardRoad)}
        // Broad avenues use a continuous tree rhythm, offset along the kerb
        // from lamp/cabinet stations. Narrow streets retain their sparse row.
        if(road.width>=14&&t+8<length&&l11SurfaceAt(seed,px,py,fv,plan).kind!=='bridge')outside('plane_tree',x+dx*4-dy*side*(road.width/2+1.5),y+dy*4+dx*side*(road.width/2+1.5),angle+hs*.001,id+':tree')
        if(!road.pedestrian&&hs%7===0){const keys=['sedan','delivery_van','box_truck','taxi','bus'],lane=side*(road.width/2-1.5),vx=x-dy*lane,vy=y+dx*lane;outside(keys[l11Hash(hs,2)%keys.length],vx,vy,l11TrafficFacing(angle,side),id+':vehicle',{placementRole:'vehicle',facingX:vx-dx*side*10,facingY:vy-dy*side*10,roadId:road.id})}
        const inset={mount:L11_ROAD_SURFACE_LIFT-.022,roadInset:1,roadId:road.id}
        if(hs%11===0)outside('storm_drain',x-dy*side*(road.width/2-.3),y+dx*side*(road.width/2-.3),angle,id+':drain',inset)
        if(hs%19===0)outside('manhole',x-dy*side*road.width*.2,y+dx*side*road.width*.2,angle,id+':manhole',inset)
        if(road.class==='arterial'&&hs%31===0)outside('traffic_island',x,y,angle,id+':island')
        if(!road.pedestrian&&hs%23===0){outside('bus_shelter',x-dy*side*(road.width/2+4),y+dx*side*(road.width/2+4),face,id+':shelter',towardRoad);outside('bus_stop',px+dx*3,py+dy*3,face,id+':stop',{...towardRoad,facingX:x+dx*3,facingY:y+dy*3})}
      }
      for(const [j,t]of [8,length-8].entries())for(const side of [-1,1]){
        const x=a[0]+dx*t-dy*side*(road.width/2+.7),y=a[1]+dy*t+dx*side*(road.width/2+.7),id=road.id+':junction:'+si+':'+j+':'+side
        if(road.class==='arterial'||road.class==='collector'){outside('signal',x,y,l11TrafficFacing(angle,side)+Math.PI,id+':signal',{placementRole:'traffic-signal',facingX:x+dx*side*10,facingY:y+dy*side*10});outside('pedestrian_signal',x+dx*2,y+dy*2,l11CurbFacing(angle,side),id+':pedestrian')}
      }
      // The bridge deck includes two pedestrian strips. Railings sit at their
      // outer edges, retaining the same two metre clear route as the quays.
      for(const rail of l11BridgeRailPlacements(seed,road,si,Math.floor(Math.min(...projection)/4)*4+2,Math.max(...projection),plan,fv))if(owns(rail.x,rail.y))prop('canal_railing',rail.x,rail.y,rail.angle,rail.id,{grade:rail.grade})
    }
  }
  if(!forced&&seed===L11_REFERENCE_SEED)for(const p of L11_REFERENCE_PROPS)outside(p.key,p.x,p.y,p.angle,p.id,{...p.extra,referenceDistrict:1})
  for(let gy=Math.floor(wy/12)*12;gy<wy+32;gy+=12)for(let gx=Math.floor(wx/12)*12;gx<wx+32;gx+=12){
    const x=gx+4,y=gy+4,surface=l11SurfaceAt(seed,x,y,fv,plan),hs=l11Hash(seed,gx,gy,96)
    if(surface.kind==='grass'){const keys=L11_DECOR_DEFS.filter(d=>d.category==='waterfront'&&d.placement.includes('park')).map(d=>d.id.slice(4));outside(keys[hs%keys.length],x,y,0,'l11:park:'+gx+':'+gy)}
  }
  for(const b of neighbours){
    const tangent=b.doorAngle,nx=Math.sin(tangent),ny=-Math.cos(tangent),place=(key:string,t:number,n:number,id:string,turn=0,seatTarget?:[number,number])=>{
      const x=b.door[0]+nx*n+Math.cos(tangent)*t,y=b.door[1]+ny*n+Math.sin(tangent)*t,target=seatTarget?[b.door[0]+nx*seatTarget[1]+Math.cos(tangent)*seatTarget[0],b.door[1]+ny*seatTarget[1]+Math.sin(tangent)*seatTarget[0]]:[x+nx,y+ny]
      outside(key,x,y,tangent+turn,b.id+':'+id,{placementRole:seatTarget?'seating':'storefront',facingX:target[0],facingY:target[1],...(seatTarget?{groupId:b.id+':cafe-table'}:{})})
    }
    if(b.use===0||b.use===1||b.use===5||b.use===6){
      place('shrub_planter',-4.8,.8,'entry-planter-a');place('flower_planter',4.8,.8,'entry-planter-b')
      if(b.use===0){place('bike_rack',-7,1.5,'resident-bikes');place('post_box',3.8,.7,'resident-post')}
      else{place('park_bench',-6.8,1.2,'entry-seat');place('trash_bin',7,1,'entry-bin')}
    }
    if(b.use===3&&!b.sealed){
      if(!b.entrance&&b.architecture!=='blue-retail'&&b.architecture!=='pier-retail')prop('shop_awning',b.door[0]+nx*.8,b.door[1]+ny*.8,tangent,b.id+':awning')
      const group=l11Hash(b.seed,198)%5
      if(group===0){place('cafe_table',5,2,'cafe-table');place('cafe_chair',4,2,'cafe-chair-a',Math.PI/2,[5,2]);place('cafe_chair',6,2,'cafe-chair-b',-Math.PI/2,[5,2]);place('umbrella',5,3.5,'umbrella');place('menu_board',-4,1,'menu')}
      if(group===1){place('market_stall',5,2,'stall');place('produce_crates',-4,1,'produce');place('shopping_cart',-6,2,'cart')}
      if(group===2){place('vending_machine',4,.6,'vending');place('newspaper_box',-4,.6,'news');place('delivery_bike',6,1,'bike')}
      if(group===3){place('parcel_locker',5,.6,'parcels');place('display_rack',-4,.6,'display');place('menu_board',-6,1,'menu')}
      if(group===4){place('display_rack',4,.6,'display');place('shopping_cart',6,1.5,'cart');place('cafe_table',-5,2,'table')}
    }
    // Back-of-house groups use a side opposite the entrance and never fill the lane centre.
    const keys=L11_DECOR_DEFS.filter(d=>d.category==='service').map(d=>d.id.slice(4)),ring=b.footprint[0]
    let serviceGroup=false
    for(let k=0;k<ring.length-1;k++){
      const a=ring[k],end=ring[k+1],len=Math.hypot(end[0]-a[0],end[1]-a[1]);if(len<7)continue
      const key=keys[l11Hash(b.seed,k,97)%keys.length]
      const size=l11DecorDef('l11_'+key)!,anchor=key==='downpipe'?.32/len:.5,wallX=a[0]+(end[0]-a[0])*anchor,wallY=a[1]+(end[1]-a[1])*anchor
      let nx=(end[1]-a[1])/len,ny=-(end[0]-a[0])/len
      if(inPolygon(wallX+nx*.1,wallY+ny*.1,b.footprint)){nx=-nx;ny=-ny}
      const angle=l11FaceToward(nx,ny),gap=size.d/2+.10,x=wallX+nx*gap,y=wallY+ny*gap
      if(Math.hypot(x-b.door[0],y-b.door[1])<7)continue
      const footprint=transform(rectangle(-size.w/2-.05,-size.d/2-.05,size.w+.1,size.d+.1),x,y,angle)
      const passage=transform(rectangle(-size.w/2-.3,-size.d/2-2,size.w+.6,size.d+2),x,y,angle)
      if(footprint[0].some(([px,py])=>['road','canal','bridge'].includes(l11SurfaceAt(seed,px,py,fv,plan).kind)||l11MetroRamp(px,py)!==null))continue
      if(!neighbours.some(q=>circlePolygon(...q.door,4,footprint)||q.id!==b.id&&(l11FootprintsOverlap(passage,q.footprint)||q.id<b.id&&circlePolygon(x,y,6,q.footprint)))){
        if(!l11StreetPropAllowed(seed,key,x,y,angle,neighbours,plan,fv))continue
        prop(key,x,y,angle,b.id+':service:'+k,{placementRole:'service-wall',wallX,wallY,facingX:x+nx,facingY:y+ny})
        // One coherent service bay per building. Recessed bins, deliveries and
        // maintenance equipment sit against the wall, retaining a 2m lane.
        if(!serviceGroup&&len>14&&size.w<4.5&&nx*Math.sin(b.doorAngle)-ny*Math.cos(b.doorAngle)<.5){
          serviceGroup=true
          const group=b.use===0?['recycling_bin','trash_bin','motor_scooter']:b.use===1?['utility_box','recycling_bin','parcel_locker']:b.use===7?['pallet_stack','cable_reel','cone']:b.use===3?['produce_crates','shopping_cart','delivery_bike']:['shrub_planter','park_bench','drinking_fountain']
          for(const [j,kind]of group.entries()){
            const spec=l11DecorDef('l11_'+kind)!,along=j===0?-4:j===1?4:6.5,wx=(a[0]+end[0])/2+(end[0]-a[0])/len*along,wy=(a[1]+end[1])/2+(end[1]-a[1])/len*along,px=wx+nx*(spec.d/2+.15),py=wy+ny*(spec.d/2+.15)
            if(Math.abs(along)+spec.w/2>len/2-.5)continue
            const clear=transform(rectangle(-spec.w/2-.15,-spec.d/2-2,spec.w+.3,spec.d+2),px,py,angle)
            if(neighbours.some(q=>q.id!==b.id&&l11FootprintsOverlap(clear,q.footprint))||clear[0].some(([u,v])=>['road','canal','bridge'].includes(l11SurfaceAt(seed,u,v,fv,plan).kind)))continue
            outside(kind,px,py,angle,b.id+':service-group:'+j,{placementRole:'service-wall',wallX:wx,wallY:wy,facingX:px+nx,facingY:py+ny,groupId:b.id+':service-bay'})
          }
        }
      }
    }
    if(b.archetype==='substation'){const [x,y]=l11World(b,b.width*.45,b.depth*.72);outside('transformer',x,y,b.angle,b.id+':transformer')}
  }
  for(const canal of plan.canals)for(const p of l11CanalAccess(seed,canal,plan.roads,wy-2,wy+34))if(owns(p.x,p.y)){
    prop(p.key,p.x,p.y,p.angle,p.id,{mount:p.base-L11_CANAL_BED,canalAccess:1,climbDX:p.landX-p.x,climbDY:p.landY-p.y,climbTop:p.landZ,climbBase:p.base,style:0})
  }
  // World-anchored guardrails continue across chunks, with road/bridge mouths open.
  for(const canal of plan.canals)for(const rail of l11QuayRailPlacements(seed,canal,plan.roads,wy,wy+32)){
    const {x,y,angle,side}=rail;if(!owns(x,y))continue
    prop(rail.kind,x,y,angle,rail.id,{grade:rail.grade,style:0})
    if(y%48===0){outside(side>0?'life_ring':'mooring_bollard',x+side*1.5,y,l11FaceToward(side,0),'canal:'+seed+':safety:'+y+':'+side,{placementRole:'waterfront-safety',facingX:x+side*4,facingY:y});outside('park_bench',x+side*4,y+4,l11FaceToward(-side,0),'canal:'+seed+':bench:'+y+':'+side,{placementRole:'waterfront-seat',facingX:x-side*4,facingY:y+4})}
    if(y%256===0){outside('lock_winch',x+side*2,y,angle,'canal:'+seed+':winch:'+y+':'+side);prop('lock_gate',x-side*2.2,y,0,'canal:'+seed+':gate:'+y+':'+side,{mount:1.8})}
  }
  for(const [key,x,y]of [['archive',29,73],['metro',30,117]]as const)if(owns(x,y))raw.structures.push({kind:'l11landmark',x,y,w:.5,h:.5,solid:false,data:{citySite:key,sid:l11Hash(seed,x,y,988)}})
  addL11Facelings(raw)
  if(Math.hypot(wx,wy)>100&&l11Rand(seed,121,cx,cy)<.16){const i=raw.tint.findIndex((t,i)=>(t===51||t===52)&&raw.outdoor![i]===1&&raw.tiles[i]===1),r=l11Rand(seed,122,cx,cy);if(i>=0&&r>=.55)raw.entities.push({type:r<.9?'hound':r<.96?'deathmoth':'duller',x:wx+i%32+.5,y:wy+Math.floor(i/32)+.5,calm:r<.9})}
  for(const {kind,x,y}of L11_ROAD_EXITS){const ed=def.exits.find(e=>e.kind===kind);if(ed&&owns(x+.5,y+.5))raw.exits.push({def:ed,x,y,discovered:false})}
  for(let sy=Math.floor((wy-120)/512)*512+120;sy<wy+32;sy+=512)for(let sx=Math.floor((wx-26)/512)*512+26;sx<wx+32;sx+=512){if(owns(sx,sy))raw.structures.push({kind:'l11subway',x:sx,y:sy,w:3,h:10,solid:true,data:{ground:l11TerrainHeight(seed,sx+1.5,sy),sid:l11Hash(seed,sx,sy,801),instanceId:`metro:${sx}:${sy}`}})}
  return raw
}
