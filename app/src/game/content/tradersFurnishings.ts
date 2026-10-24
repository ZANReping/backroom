import {tradersDressingForChunk} from './tradersDressing'
import {tradersMarketForChunk} from './tradersMarket'
import {tradersShopsForChunk} from './tradersShops'
import {tradersFitoutForChunk,tradersFoodTable} from './tradersFitout'
import type {Structure} from '../core/types'
import {tradersCirculationReserved,TRADERS_PASSAGES,tradersPassageApron,TRADERS_ROOMS,TRADERS_ZONES,TRADERS_SERVICES,TRADERS_VAULT_CELLS,TRADERS_WALLS,tradersIntersects,tradersContains,type TradersRect,type TradersRoom} from './tradersLayout'

/** Pure chunk-local furnishings. Real dimensions, no stock or businesses in empty shops. */
export function tradersFurnishingsForChunk(cx:number,cy:number):Structure[]{
 const out:Structure[]=[],bounds={x:cx*32,y:cy*32,w:32,h:32},nearWalls=TRADERS_WALLS.filter(w=>w.bottom<1.8&&tradersIntersects(w,bounds))
 const inDoor=(p:TradersRect,r:TradersRoom)=>{
  const half=r.doorWidth/2+.35,depth=r.kind==='vault'?1.2:3
  const d=r.side==='n'?{x:r.x+r.w/2-half,y:r.y-.3,w:half*2,h:depth+.3}:r.side==='s'?{x:r.x+r.w/2-half,y:r.y+r.h-depth,w:half*2,h:depth+.3}:r.side==='w'?{x:r.x-.3,y:r.y+r.h/2-half,w:depth+.3,h:half*2}:{x:r.x+r.w-depth,y:r.y+r.h/2-half,w:depth+.3,h:half*2}
  return tradersIntersects(p,d)||TRADERS_PASSAGES.some(a=>a.rooms.includes(r.id)&&tradersIntersects(p,tradersPassageApron(a)))
 }
 function add(kind:Structure['kind'],id:string,x:number,y:number,w:number,h:number,data:NonNullable<Structure['data']>={},host?:TradersRoom){
  const center={x:x+w/2,y:y+h/2},p={x,y,w,h}
  if(!tradersContains(bounds,center.x,center.y))return
  if(host&&(x<host.x+.18||y<host.y+.18||x+w>host.x+host.w-.18||y+h>host.y+host.h-.18||inDoor(p,host)))return
  if(kind!=='trade_beam'&&kind!=='trade_wall'){
   if(tradersCirculationReserved(p))return
   if(TRADERS_SERVICES.some(s=>Math.hypot(center.x-s.x,center.y-s.y)<3+Math.max(w,h)/2))return
   if(nearWalls.some(wall=>tradersIntersects(p,wall)))return
  }
  out.push({kind,x,y,w,h,solid:kind!=='trade_beam',data:{tradersId:id,tradersProp:String(data.tradersProp??kind),...data}})
 }
 const room=(r:TradersRoom)=>{
  if(!tradersIntersects(r,bounds)||r.kind==='shop'||r.kind==='anchor')return
  const emit=(kind:Structure['kind'],id:string,x:number,y:number,w:number,h:number,data:NonNullable<Structure['data']>={})=>add(kind,r.id+'.'+id,r.x+x,r.y+y,w,h,{...(r.kind==='vault'?{tradersVaultContents:r.id}:{}),...data},r)
  if(r.id==='food_court'){
   for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    const point=tradersFoodTable(row,col),x=point.x-r.x-.55,y=point.y-r.y-.55
    emit('table','table.'+row+'.'+col,x,y,1.1,1.1,{height:.76,tradersProp:'cafe_table'})
    for(let side=0;side<4;side++){const a=side*Math.PI/2;emit('l11_cafe_chair','chair.'+row+'.'+col+'.'+side,x+.55+Math.cos(a)*1.05-.25,y+.55+Math.sin(a)*1.05-.25,.5,.5,{deg:90-side*90})}
   }
  }else if(r.id==='vacant_market'){
   for(let row=0;row<3;row++)for(let col=0;col<3;col++)emit('trade_counter','empty_stall.'+row+'.'+col,(col+.5)*r.w/3-1,(row+.5)*r.h/3-.4,2,.8,{height:1,label:'空摊位'})
  }else if(r.id==='boardroom'){
   const x=r.w/2-4,y=r.h/2-1
   emit('table','meeting_table',x,y,8,2.2,{height:.79,tradersModel:'dressing',dressing:'conference'})
   for(let i=0;i<8;i++){const side=i%2;emit('l11_dining_chair','chair.'+i,x+.7+Math.floor(i/2)*2,y+(side?2.6:-1.1),.5,.5,{deg:side?0:180})}
  }else if(r.kind==='office'||r.kind==='guard'){
   // Workstations and chairs are one authored fit-out, sharing resident anchors.
  }else if(r.kind==='dorm'){
   for(let row=0;row<3;row++)for(let col=0;col<2;col++)for(let i=0;i<4;i++){
    const x=3.5+col*13.5+(i%2)*5,y=7+row*17+Math.floor(i/2)*4
    emit('bed','bed.'+row+'.'+col+'.'+i,x,y,1.2,2.1,{height:1.02,tradersModel:'dressing',dressing:'bedkit'})
   }
  }else if(r.kind==='wash'){
   // Authored wall-backed basins and real cubicles are supplied by dressing data.
  }else if(r.kind==='vault'){
   const car=TRADERS_VAULT_CELLS.filter(c=>c.storage==='ordinary').at(-1)
   if(r.id===car?.id){emit('trade_car','fixed_car',(r.w-4.5)/2,r.side==='n'?r.h-2.1:.3,4.5,1.8,{label:'固定藏品 · 浅蓝色 250 GT'});return}
   const back=r.side==='n'?r.h-1.1:.3
   if(r.storage==='cold')emit('trade_counter','cold_fixture',.4,back,r.w-.8,.75,{height:1.18,color:'#adb7b9',label:'冷藏柜',tradersModel:'dressing',dressing:'coldcabinet',deg:r.side==='n'?180:0})
   else{emit('trade_rack','rack',.4,back,Math.min(3.7,r.w-.8),.75,{height:2.15,tradersModel:'dressing',dressing:'storageRack',deg:r.side==='n'?180:0});emit('trade_pallet','pallet',r.w-1.8,r.side==='n'?r.h-2.4:1.6,1.3,.8,{height:.8,tradersModel:'dressing',dressing:'palletLoad',deg:r.side==='n'?180:0})}
  }else if(r.kind==='logistics'){
   for(let i=0;i<Math.floor((r.w-6)/6);i++){
    emit('trade_pallet','pallet.'+i,3+i*6,3,2,1.3,{height:1,tradersModel:'dressing',dressing:'palletLoad'})
    emit('trade_rack','rack.'+i,3+i*6,r.h-2.2,3,.85,{height:2.6,tradersModel:'dressing',dressing:'storageRack',deg:180})
   }
   emit('trade_cart','cart',3,r.h/2,1.5,.8)
  }else if(r.kind==='rail'){
   for(let pair=0;pair<3;pair++){
    const y=8+pair*(r.h-16)/3
    for(const offset of [0,1.435])emit('trade_beam','rail.'+pair+'.'+offset,3,y+offset,r.w-6,.075,{z:.08,height:.09,color:'#606567'})
    for(let i=0;i<Math.floor((r.w-8)/.9);i++)emit('trade_beam','sleeper.'+pair+'.'+i,4+i*.9,y-.4,.18,2.24,{z:.025,height:.055,color:'#8b7259'})
   }
  }else if(r.kind==='dock'){
   emit('trade_beam','loading_platform',3,r.h-5,r.w-6,2.2,{height:.3,color:'#989f9b'})
   for(let i=0;i<Math.floor((r.w-6)/5);i++)emit('trade_pallet','empty_pallet.'+i,3+i*5,r.h-9,2,1.1,{height:.18})
  }
 }
 for(const r of TRADERS_ROOMS)room(r)
 for(const z of TRADERS_ZONES)if(z.id!=='public'&&(z.kind==='street'||z.kind==='hall')){
  if(!tradersIntersects(z,bounds))continue
  const horizontal=z.w>z.h,length=horizontal?z.w:z.h
  for(let i=8;i<length-5;i+=16){
   const x=horizontal?z.x+i:z.x+.8,y=horizontal?z.y+.85:z.y+i
   add('bench',z.id+'.bench.'+i,x,y,horizontal?2.4:.65,horizontal?.65:2.4,{deg:horizontal?0:90})
   add('trashbin',z.id+'.bin.'+i,horizontal?x+3.2:x+.1,horizontal?y+.1:y+3.2,.45,.45)
  }
 }
 return [...out,...tradersFitoutForChunk(cx,cy),...tradersDressingForChunk(cx,cy),...tradersMarketForChunk(cx,cy),...tradersShopsForChunk(cx,cy)]
}
