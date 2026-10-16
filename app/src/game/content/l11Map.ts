import type { Engine } from '../engine'
import type { Polygon, Point } from '../world/l11Geometry'
import { bounds, intersects, rectangle, transform } from '../world/l11Geometry'
import { l11World, l11StairRect, l11MetroAt, l11MetroRamp, L11_VARIANT_NAMES } from '../world/l11Layout'
import { l11InteriorPlan, L11_ROOM_NAMES } from '../world/l11Interiors'
import { l11WallSegments } from '../world/l11Collision'
import { l11RoomFixtures } from '../world/l11RoomFurnishing'
import { l11DecorDef } from './l11Decor'
import { l11Archetype } from './l11Buildings'
import { l11MapMarks } from '../engine/l11State'
import { CONTAINER_KINDS } from '../decorations/containers'
import { readL11MapPlans } from './l11MapPlans'
import { L11_MAP_COLORS as C, L11_MAP_DISTRICTS, l11BuildingMapStyle, l11RoomMapColor, l11MapKnown, l11KnownRuns, mapProject, mapViewBounds, type L11MapContext, type L11MapView } from './l11MapModel'

const paths=new WeakMap<Polygon,Path2D>(),boxes=new WeakMap<Polygon,ReturnType<typeof bounds>>()
function polygonPath(p:Polygon){
  let path=paths.get(p)
  if(!path){path=new Path2D();for(const ring of p){ring.forEach(([x,y],i)=>i?path!.lineTo(x,y):path!.moveTo(x,y));path.closePath()}paths.set(p,path)}
  return path
}
function polygonBounds(p:Polygon){let b=boxes.get(p);if(!b){b=bounds(p);boxes.set(p,b)}return b}
export interface L11MapDrawOptions {context:L11MapContext;view:L11MapView;yaw:number;reveal?:boolean;mini?:boolean;floor?:number}
export function drawL11Map(g:CanvasRenderingContext2D,eng:Engine,options:L11MapDrawOptions){
  const {view:v,context:context,yaw,mini=false}=options,m=eng.map!,inf=m.inf!
  const floor=options.floor??context.floor,area=mapViewBounds(v),reveal=eng.devEnabled&&(!!options.reveal||!!eng.dev.mapReveal)
  const known=(x:number,y:number)=>reveal||l11MapKnown(eng,x,y),indoor=context.kind==='interior'&&context.building
  const runs=indoor?[]:l11KnownRuns(eng,area)
  const data=indoor||context.kind==='metro'?{plans:[],loading:false,error:false}:readL11MapPlans(inf.seed,area,runs,reveal)
  const occupied:{x:number;y:number;w:number;h:number}[]=[]
  let buildingCount=0,roomCount=0
  g.save();g.clearRect(0,0,v.width,v.height);g.fillStyle=indoor?C.paper:C.unknown;g.fillRect(0,0,v.width,v.height)
  // All geometry uses world units. Only labels, symbols and strokes use CSS pixels.
  const world=()=>{g.translate(v.width/2-v.x*v.scale,v.height/2-v.y*v.scale);g.scale(v.scale,v.scale)}
  const poly=(p:Polygon,fill:string,stroke?:string,width=.8)=>{
    if(!intersects(polygonBounds(p),area))return
    g.fillStyle=fill;g.fill(polygonPath(p),'evenodd')
    if(stroke){g.strokeStyle=stroke;g.lineWidth=width/v.scale;g.stroke(polygonPath(p))}
  }
  const line=(points:Point[],color:string,width:number,dash?:number[])=>{
    g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.strokeStyle=color;g.lineWidth=width;g.setLineDash(dash??[]);g.stroke();g.setLineDash([])
  }
  const label=(text:string,x:number,y:number,size=11,color='#46596a',force=false)=>{
    const [px,py]=mapProject(v,x,y);g.save();g.font=`${force?600:500} ${size}px system-ui, sans-serif`
    const w=g.measureText(text).width+8,rect={x:px-w/2,y:py-size/2-3,w,h:size+6}
    if(rect.x<5||rect.y<5||rect.x+w>v.width-5||rect.y+rect.h>v.height-5||!force&&occupied.some(r=>intersects(r,rect))){g.restore();return}
    occupied.push(rect);g.textAlign='center';g.textBaseline='middle';g.lineWidth=2;g.strokeStyle='rgba(250,252,249,.92)';g.strokeText(text,px,py);g.fillStyle=color;g.fillText(text,px,py);g.restore()
  }
  g.save();world()
  if(!indoor&&!reveal){const path=new Path2D();for(const r of runs)path.rect(r.x,r.y,r.w,r.h);g.clip(path)}
  if(context.kind==='city'){
    g.fillStyle=C.land;g.fillRect(area.x,area.y,area.w,area.h)
    const seen=new Set<string>()
    const unique=<T extends {id:string}>(items:T[],draw:(item:T)=>void)=>{for(const item of items)if(!seen.has(item.id)){seen.add(item.id);draw(item)}}
    for(const plan of data.plans){
      for(const block of plan.blocks)poly(block.polygon,L11_MAP_DISTRICTS[block.district].color,'#c7d0c8',.5)
      unique(plan.canals,c=>{for(const p of c.banks)poly(p,C.bank);for(const p of c.water)poly(p,C.water,'#7fb7c8')})
      g.globalAlpha=.24;unique(plan.alleys,a=>poly(a.polygon,C.alley));g.globalAlpha=1
      unique(plan.bridges,b=>poly(b.polygon,C.road,C.roadEdge,1))
    }
    // Road casings first; a second pass makes intersection surfaces join cleanly.
    const roadIds=new Set<string>(),roads=data.plans.flatMap(p=>p.roads).filter(r=>{if(roadIds.has(r.id)||!intersects(r.bounds,area))return false;roadIds.add(r.id);return true})
    g.lineCap='round';g.lineJoin='round'
    for(const r of roads.filter(r=>r.pedestrian))line(r.points,C.pedestrian,r.width)
    for(const r of roads.filter(r=>!r.pedestrian))line(r.points,C.roadEdge,r.width+Math.max(1.3/v.scale,1))
    for(const r of roads.filter(r=>!r.pedestrian))line(r.points,r.class==='arterial'?C.arterial:C.road,r.width)
    for(const r of roads)if(r.class==='arterial'&&v.scale>.7)line(r.points,'#e2d8b5',.7/v.scale)
    for(const plan of data.plans)unique(plan.buildings,b=>{
      if(!intersects(b,area))return;buildingCount++
      const style=l11BuildingMapStyle(b);poly(b.footprint,style.color,b.sealed?'#9caaa9':'#7d9398',mini?.65:1)
      if(!b.sealed&&v.scale>2){g.fillStyle=C.door;g.beginPath();g.arc(...b.door,2.5/v.scale,0,Math.PI*2);g.fill()}
    })
  }else if(indoor){
    const b=indoor,plan=l11InteriorPlan(b).floors[floor]
    poly(b.footprint,C.corridor)
    g.save();g.clip(polygonPath(b.footprint),'evenodd')
    if(plan){
      roomCount=plan.rooms.length
      for(const room of plan.rooms)poly(transform(rectangle(room.x,room.y,room.w,room.h),b.ox,b.oy,b.angle),l11RoomMapColor(room.kind))
      // A subdued furniture layer reflects actual fixtures, without competing with rooms.
      if(v.scale>=5&&!mini)for(const f of l11RoomFixtures(b)){
        if(f.floor!==floor||(f.mount??0)>1.8)continue
        const def=l11DecorDef(`l11_${f.key}`);if(!def)continue
        const [x,y]=l11World(b,f.x,f.y),p=transform(rectangle(-def.w/2,-def.d/2,def.w,def.d),x,y,b.angle+f.angle)
        poly(p,'#ffffff55','#71818b66',.6)
      }
      for(const s of b.stairs)if(s.flight===floor||s.flight===floor-1){
        poly(transform(l11StairRect(s),b.ox,b.oy,b.angle),C.stairs,C.wall)
        for(let t=0;t<=s.length;t+=.55){const a:Point=s.axis==='y'?[s.x,s.y+t]:[s.x+t,s.y],q:Point=s.axis==='y'?[s.x+s.width,s.y+t]:[s.x+t,s.y+s.width];line([l11World(b,...a),l11World(b,...q)],'#f4f8fb',.6/v.scale)}
        const a:Point=s.axis==='y'?[s.x+s.width/2,s.y+.6]:[s.x+.6,s.y+s.width/2],z:Point=s.axis==='y'?[a[0],s.y+s.length-.6]:[s.x+s.length-.6,a[1]]
        line([l11World(b,...a),l11World(b,...z)],C.wall,1.2/v.scale)
        const arrow=s.axis==='y'?[[z[0]-.4,z[1]-.6],z,[z[0]+.4,z[1]-.6]]:[[z[0]-.6,z[1]-.4],z,[z[0]-.6,z[1]+.4]]
        line(arrow.map(p=>l11World(b,p[0],p[1])),C.wall,1.2/v.scale)
      }
      for(const w of plan.walls)line([l11World(b,...w.a),l11World(b,...w.b)],C.wall,Math.max(.16,1.3/v.scale))
      for(const d of plan.doors)line([l11World(b,...d.a),l11World(b,...d.b)],C.door,1.5/v.scale,[2/v.scale,2/v.scale])
    }
    g.restore()
    for(const w of l11WallSegments(b))line([l11World(b,...w.a),l11World(b,...w.b)],w.entrance&&floor===0?C.door:C.wall,w.entrance&&floor===0?1.8/v.scale:Math.max(.24,2/v.scale),w.entrance&&floor===0?[3/v.scale,2/v.scale]:undefined)
  }else{
    // Reuse the exact raster predicates used by l11Raw, including unloaded explored
    // corridors. Sample only known runs; drawing must not load gameplay chunks.
    const strips=reveal?Array.from({length:Math.ceil(area.h)},(_,i)=>({x:Math.floor(area.x),y:Math.floor(area.y)+i,w:Math.ceil(area.w)+1,h:1})):runs
    const floorPaths=new Map<string,Path2D>(),wallPath=new Path2D()
    const cell=(x:number,y:number)=>l11MetroRamp(x+.5,y+.5)!==null?C.stairs:l11MetroAt(x+.5,y+.5)?'#e6eff3':''
    for(const r of strips){let start:number|null=null,previous=''
      for(let x=r.x;x<=r.x+r.w;x++){
        const color=x<r.x+r.w?cell(x,r.y):''
        if(color!==previous){if(start!==null){let path=floorPaths.get(previous);if(!path){path=new Path2D();floorPaths.set(previous,path)}path.rect(start,r.y,x-start,1)}start=color?x:null;previous=color}
        if(color)for(const [dx,dy,ax,ay,bx,by] of [[-1,0,0,0,0,1],[1,0,1,0,1,1],[0,-1,0,0,1,0],[0,1,0,1,1,1]])if(!cell(x+dx,r.y+dy)){wallPath.moveTo(x+ax,r.y+ay);wallPath.lineTo(x+bx,r.y+by)}
      }
    }
    for(const [color,path] of floorPaths){g.fillStyle=color;g.fill(path)}
    g.strokeStyle=C.wall;g.lineWidth=1.2/v.scale;g.stroke(wallPath)
  }
  g.restore()
  if(indoor){
    const b=indoor,plan=l11InteriorPlan(b).floors[floor]
    if(plan&&!mini)for(const r of plan.rooms){const text=L11_ROOM_NAMES[r.kind].replace('起居室与开放厨房','起居 / 餐厨');if(Math.min(r.w,r.h)*v.scale>25)label(text,...l11World(b,r.x+r.w/2,r.y+r.h/2),Math.min(12,Math.max(10,v.scale*.65)))}
    if(floor===0&&!mini)label('出入口',...b.door,11,C.door)
    if(!mini)for(const s of b.stairs)if(s.flight===floor||s.flight===floor-1)label(`${s.flight+1}–${s.flight+2}F`,...l11World(b,s.x+(s.axis==='x'?s.length:s.width)/2,s.y+(s.axis==='y'?s.length:s.width)/2),10,C.wall)
  }else if(!mini&&context.kind==='city'){
    const labeled=new Set<string>()
    for(const p of data.plans){
      for(const b of p.buildings){if(labeled.has(b.id)||!intersects(b,area)||!known(b.x+b.w/2,b.y+b.h/2))continue;labeled.add(b.id)
        if(v.scale>1.7&&b.w*v.scale>68)label(v.scale>4?l11Archetype(b.archetype).name:l11BuildingMapStyle(b).label,b.x+b.w/2,b.y+b.h/2,11)
      }
      for(const block of p.blocks){const r=polygonBounds(block.polygon);if(v.scale<1.8&&known(r.x+r.w/2,r.y+r.h/2)&&r.w*v.scale>65)label(L11_VARIANT_NAMES[block.district],r.x+r.w/2,r.y+r.h/2,11,'#61786e')}
    }
  }
  const symbol=(text:string,x:number,y:number,color:string,small=false)=>{
    const [px,py]=mapProject(v,x,y);if(px<5||py<5||px>v.width-5||py>v.height-5)return
    g.save();const r=small?3:mini?5:8;g.fillStyle=color;g.strokeStyle='#fff';g.lineWidth=1.5;g.beginPath();g.roundRect(px-r,py-r,r*2,r*2,small?1:3);g.fill();g.stroke()
    if(!small){g.fillStyle='white';g.font=`bold ${mini?8:11}px system-ui`;g.textAlign='center';g.textBaseline='middle';g.fillText(text,px,py+.5)}g.restore()
  }
  if(!indoor&&floor===0)for(const mark of l11MapMarks(eng)){
    if(!known(mark.x,mark.y))continue
    const metro=mark.name.includes('地铁');symbol(metro?'M':mark.name.includes('档案')?'A':'↗',mark.x,mark.y,metro?'#376c98':C.exit)
    if(!mini)label(mark.name,mark.x,mark.y+15/v.scale,11)
  }
  for(const exit of m.exits){const x=exit.x+inf.ox,y=exit.y+inf.oy;if(!exit.discovered||((exit.floor??0)!==floor)||!known(x,y))continue;symbol('↗',x,y,C.exit);if(!mini)label(exit.def.name,x,y+16/v.scale)}
  for(const s of m.structures){
    if(!CONTAINER_KINDS.includes(s.kind)||(s.floor??0)!==floor)continue
    if(indoor&&s.data?.buildingId!==indoor.id)continue
    const x=s.x+inf.ox+s.w/2,y=s.y+inf.oy+s.h/2
    if(known(x,y))symbol('',x,y,s.looted?'#84958c':C.loot,true)
  }
  const [px,py]=mapProject(v,eng.player.x+inf.ox,eng.player.y+inf.oy),sameFloor=(eng.player.floor??0)===floor
  if(px>=-8&&py>=-8&&px<v.width+8&&py<v.height+8){
    g.save();g.translate(px,py);g.rotate(-yaw);g.globalAlpha=sameFloor?1:.35
    const r=mini?4:6
    if(sameFloor){g.beginPath();g.moveTo(0,0);g.arc(0,0,mini?19:32,-Math.PI*.8,-Math.PI*.2);g.closePath();g.fillStyle='#1374cf22';g.fill()}
    g.beginPath();g.moveTo(0,-r*1.7);g.lineTo(r,r);g.lineTo(0,r*.4);g.lineTo(-r,r);g.closePath();g.fillStyle=C.player;g.strokeStyle='white';g.lineWidth=2;g.fill();g.stroke();g.restore()
  }
  // Orientation and measured scale remain legible above every map layer.
  g.fillStyle='#ffffffdc';g.fillRect(v.width-29,7,22,35);g.fillStyle=C.wall;g.font='600 10px system-ui';g.textAlign='center';g.fillText('N',v.width-18,19)
  g.beginPath();g.moveTo(v.width-18,23);g.lineTo(v.width-22,35);g.lineTo(v.width-18,32);g.lineTo(v.width-14,35);g.closePath();g.fill()
  if(v.width>=100){const max=(mini?40:85)/v.scale,pow=10**Math.floor(Math.log10(max)),length=[5,2,1].map(n=>n*pow).find(n=>n<=max)??pow/2,w=length*v.scale
    g.fillStyle='#ffffffdb';g.fillRect(8,v.height-32,w+16,26);g.strokeStyle=C.wall;g.lineWidth=1.5;g.beginPath();g.moveTo(15,v.height-15);g.lineTo(15,v.height-11);g.lineTo(15+w,v.height-11);g.lineTo(15+w,v.height-15);g.stroke();g.fillStyle=C.wall;g.font='10px system-ui';g.textAlign='left';g.fillText(`${length} m`,15,v.height-19)
  }
  g.restore()
  return {loading:data.loading,error:data.error,buildings:buildingCount,rooms:roomCount,floor,mode:context.kind}
}
