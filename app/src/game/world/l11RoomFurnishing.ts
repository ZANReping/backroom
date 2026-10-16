import { l11DecorDef } from '../content/l11Decor'
import { bounds, intersects, rectangle, transform, circlePolygon, strip, type Point } from './l11Geometry'
import { l11WallSlot,l11FootprintsOverlap } from './l11Dressing'
import { l11InteriorPlan, type L11Room } from './l11Interiors'
import type { L11Building } from './l11Types'
import { l11RetailLayout } from './l11RetailLayout'

export interface L11RoomFixture {key:string;x:number;y:number;angle:number;id:string;floor:number;roomId:string;roomKind:string;wall?:Point;target:Point;groupId?:string;mount?:number}
const cache=new WeakMap<L11Building,L11RoomFixture[]>()
/** Furnishing is a room program, not a random palette scattered over a floor. */
export function l11RoomFixtures(b:L11Building):L11RoomFixture[]{
  const hit=cache.get(b);if(hit)return hit
  const fixtures:L11RoomFixture[]=[];cache.set(b,fixtures)
  for(const floor of l11InteriorPlan(b).floors)for(const r of floor.rooms){
    const occupied:ReturnType<typeof bounds>[]=[],doors=floor.doors.filter(d=>d.from===r.id||d.to===r.id)
    const roomPoly=rectangle(r.x+.12,r.y+.12,r.w-.24,r.h-.24)
    // Join doors directly: routing through the centre wastes the usable half
    // of compact apartments when the entrance and bathroom share one side.
    const hub:Point=doors.length?[doors.reduce((n,d)=>n+d.center[0],0)/doors.length,doors.reduce((n,d)=>n+d.center[1],0)/doors.length]:[r.x+r.w/2,r.y+r.h/2]
    const routes=doors.length>1?doors.map(d=>strip(d.center,hub,1.25)):[]
    const add=(key:string,x:number,y:number,angle=0,group?:L11RoomFixture,free=false):L11RoomFixture|undefined=>{
      const d=l11DecorDef('l11_'+key)!;let wall:ReturnType<typeof l11WallSlot>
      if(d.wallBack&&!free){wall=l11WallSlot(rectangle(r.x,r.y,r.w,r.h),x,y,d.w,d.d);if(!wall)return;x=wall.u;y=wall.v;angle=wall.turn}
      const poly=transform(rectangle(-d.w/2-.07,-d.d/2-.07,d.w+.14,d.d+.14),x,y,angle),box=bounds(poly)
      if(box.x<r.x+.1||box.y<r.y+.1||box.x+box.w>r.x+r.w-.1||box.y+box.h>r.y+r.h-.1)return
      if(occupied.some(q=>intersects(q,box))||doors.some(q=>circlePolygon(...q.center,1,poly))||routes.some(q=>l11FootprintsOverlap(poly,q)))return
      // The camera/player must be able to approach every room door from inside.
      // Keep one continuous 1m spine through the centre of long work rooms.
      if(['workspace','classroom','records','parking'].includes(r.kind)&&r.w>5&&box.x<r.x+r.w/2+.5&&box.x+box.w>r.x+r.w/2-.5)return
      occupied.push(box)
      const p:L11RoomFixture={key,x,y,angle,id:`${r.id}:fixture:${fixtures.filter(p=>p.roomId===r.id).length}`,floor:floor.floor,roomId:r.id,roomKind:r.kind,wall:wall?.wall,target:group?[group.x,group.y]:[x+Math.sin(angle),y-Math.cos(angle)],groupId:group?.id,mount:d.mount};fixtures.push(p);return p
    }
    const at=(key:string,u:number,v:number,angle=0)=>add(key,r.x+u,r.y+v,angle)
    const wallPlace=(key:string)=>{
      const d=l11DecorDef('l11_'+key)!,gap=d.d/2+.22
      const positions:[number,number,number][]=[]
      for(const t of [.5,.25,.75,.15,.85,.35,.65])positions.push([r.w*t,r.h-gap,0],[r.w*t,gap,Math.PI],[gap,r.h*t,Math.PI/2],[r.w-gap,r.h*t,-Math.PI/2])
      positions.sort((a,c)=>Math.min(...doors.map(q=>Math.hypot(r.x+c[0]-q.center[0],r.y+c[1]-q.center[1])))-Math.min(...doors.map(q=>Math.hypot(r.x+a[0]-q.center[0],r.y+a[1]-q.center[1]))))
      for(const [x,y,angle]of positions){const p=at(key,x,y,angle);if(p)return p}
    }
    const chair=(p:L11RoomFixture|undefined,key='dining_chair',side=-1)=>{if(!p)return;const d=l11DecorDef('l11_'+p.key)!,gap=d.d/2+.6;add(key,p.x-Math.sin(p.angle)*gap*side,p.y+Math.cos(p.angle)*gap*side,p.angle+(side<0?Math.PI:0),p)}
    const desk=(u:number,v:number,key='office_desk',angle=0)=>{const p=at(key,u,v,angle);chair(p,key==='classroom_desk'?'dining_chair':'task_chair');return p}
    const kitchen=()=>{at('kitchen_counter',r.w-1.2,r.h-.5)??wallPlace('kitchen_counter');at('sink',r.w-2.8,r.h-.5)??wallPlace('sink');at('refrigerator',r.w-.55,r.h-1.8);if(r.w>7)at('stove',r.w-4.1,r.h-.5)}
    const sitting=()=>{const sofa=at('sofa',1.5,r.h/2,Math.PI/2);if(sofa){add('coffee_table',sofa.x+Math.sin(sofa.angle)*1.5,sofa.y-Math.cos(sofa.angle)*1.5,sofa.angle);at('floor_lamp',.55,r.h-.7)}at('armchair',r.w/2,r.h-1,Math.PI)}
    switch(r.kind){
      case 'living':kitchen();sitting();if(!fixtures.some(p=>p.roomId===r.id&&p.key==='sofa'))wallPlace('sofa');if(!fixtures.some(p=>p.roomId===r.id&&['sofa','armchair'].includes(p.key)))wallPlace('armchair');if(r.w>7){const p=at('dining_table',r.w*.57,r.h*.4);chair(p);chair(p,'dining_chair',1)}break
      case 'studio':at('bed',1.2,r.h-1.5)??wallPlace('bed');at('wardrobe',r.w-.55,r.h/2);at('kitchen_counter',r.w/2,.45)??wallPlace('kitchen_counter');at('sink',r.w-.8,.45);break
      case 'bedroom':at('bed',r.w*.36,r.h-1.4)??wallPlace('bed');at('wardrobe',r.w-.6,r.h*.48);at('floor_lamp',.5,r.h-.6);if(r.w>4.5)desk(r.w-1.1,1,'office_desk',Math.PI);break
      case 'bathroom':at('toilet',.5,r.h-.5)??wallPlace('toilet');at('wash_basin',r.w-.5,r.h-.5)??wallPlace('wash_basin');at('radiator',r.w-.2,r.h*.45);break
      case 'kitchen':kitchen();{const p=at('dining_table',r.w*.4,r.h*.45);chair(p);chair(p,'dining_chair',1)}break
      case 'workspace':
        for(let y=1.3;y<r.h-1;y+=2.8)for(const x of [1.25,r.w-1.25])desk(x,y,'office_desk',x<r.w/2?Math.PI/2:-Math.PI/2)
        if(!fixtures.some(p=>p.roomId===r.id&&p.key==='office_desk'))chair(wallPlace('office_desk'),'task_chair')
        at('file_cabinet',.6,r.h-.4);at('bookcase',r.w-.8,r.h-.25);break
      case 'meeting':{
        const p=at('meeting_table',r.w/2,r.h/2)
        if(p){for(const x of [-1,0,1])for(const side of [-1,1]){const seat=add('dining_chair',p.x+x,p.y+side*1.22,side>0?0:Math.PI,p);if(seat)seat.target=[p.x+x,p.y]}for(const side of [-1,1])add('dining_chair',p.x+side*2.08,p.y,side>0?-Math.PI/2:Math.PI/2,p)}
        at('chalkboard',r.w/2,.1);at('file_cabinet',r.w-.6,r.h-.5);break
      }
      // The raised counter projects 15cm beyond its nominal footprint. Keep
      // the full counter and visitor approach clear of the door behind it.
      case 'reception':desk(r.w/2,r.h-2,'reception_desk',Math.PI);at('sofa',1.1,r.h*.45,Math.PI/2);at('armchair',r.w-1,r.h*.45,-Math.PI/2);at('bookcase',.8,r.h-.2);break
      case 'breakroom':kitchen();{const p=at('dining_table',r.w*.38,r.h*.4);chair(p);chair(p,'dining_chair',1)}at('vending_machine',.55,r.h-1);break
      case 'records':for(let y=1;y<r.h-.8;y+=2.5)for(const x of [1.1,r.w-1.1])at('archive_shelf',x,y,Math.PI/2);break
      case 'reading':desk(r.w*.35,r.h*.45,'microfilm_reader');at('bookcase',.7,r.h-.25);at('archive_shelf',r.w-.7,r.h-1);break
      case 'classroom':
        at('chalkboard',r.w/2,.15);for(let y=2;y<r.h-1.1;y+=1.9)for(let x=1.05;x<r.w-.65;x+=1.6)desk(x,y,'classroom_desk',Math.PI)
        if(!fixtures.some(p=>p.roomId===r.id&&p.key==='classroom_desk'))desk(1.15,1.7,'classroom_desk',Math.PI)
        at('bookcase',r.w-.7,r.h-.3);break
      case 'staffroom':desk(r.w*.35,r.h*.5);at('file_cabinet',r.w-.55,r.h-.5);at('bookcase',.7,r.h-.25);break
      case 'shop':
        for(const p of l11RetailLayout(b,r,floor).fixtures)add(p.key,p.x,p.y,p.angle)
        break
      case 'stockroom':at('pallet_stack',1.1,r.h-1.1);at('archive_shelf',r.w-.8,r.h-1);at('produce_crates',1,1);at('shopping_cart',r.w-.8,1);break
      case 'gallery':at('exhibit_case',r.w/2,r.h/2);at('gym_bench',r.w/2,r.h-.7);break
      case 'fitness':at('gym_bench',1.2,r.h/2,Math.PI/2);at('gym_bench',r.w-1.2,r.h/2,-Math.PI/2);at('wardrobe',r.w/2,r.h-.4);break
      case 'workshop':at('workbench',r.w/2,r.h-.6);at('lab_bench',r.w-.7,r.h*.4,-Math.PI/2);at('file_cabinet',.6,r.h*.4);at('pallet_stack',1.1,1.1);if(b.architecture==='service-loft'){wallPlace('ladder');at('cable_reel',r.w*.2,r.h*.65)??wallPlace('cable_reel');at('duct',r.w*.5,1.25)??wallPlace('duct')}break
      case 'plant':at('utility_box',.4,r.h/2);at('utility_box',r.w/2,r.h-.5);at('lab_bench',r.w-.7,r.h*.4,-Math.PI/2);break
      case 'waiting':at('gym_bench',r.w/2,r.h-.7);at('vending_machine',.65,r.h/2);at('ticket_machine',r.w-.6,r.h/2);break
      case 'parking':at('sedan',r.w/2,r.h/2,Math.PI/2);break
    }
    // Every fitted room has a ceiling fixture; these are emissive meshes and do
    // not each create a costly real-time point light.
    const lights=r.kind==='shop'?l11RetailLayout(b,r,floor).lights:[{x:r.x+r.w/2,y:r.y+r.h/2,angle:0}]
    if(roomPoly.length)for(const [i,p] of lights.entries())fixtures.push({key:'ceiling_light',...p,id:r.id+':light'+(i?':'+i:''),floor:floor.floor,roomId:r.id,roomKind:r.kind,target:[p.x+Math.sin(p.angle),p.y-Math.cos(p.angle)],mount:2.65})
  }
  return fixtures
}

export function l11RoomFloor(kind:L11Room['kind']):'wood'|'tile'|'ceramic'|'concrete'|'limestone'|'fabric'{
  return ['living','bedroom','studio'].includes(kind)?'wood':['workspace','meeting','reading','staffroom'].includes(kind)?'fabric':['bathroom','kitchen','breakroom','shop'].includes(kind)?'ceramic':['plant','workshop','stockroom','parking'].includes(kind)?'concrete':['reception','gallery','waiting'].includes(kind)?'limestone':'tile'
}
