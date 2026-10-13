import { ALPHA_BLUEPRINT as blueprint, ALPHA_DISTRICTS, ALPHA_ENTRIES, ALPHA_DOORWAYS } from './alphaBlueprint'
import { drawMapPlayer } from './mapPlayer'
import type { MapSight } from '../world/mapSight'
import type { Rect, RoomSpec } from './settlementTypes'

const contains=(r:Rect,x:number,y:number)=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h
const canonical=(id:string)=>id.replace(/_annex$/,'')
export const ALPHA_MAP_REGIONS=[...ALPHA_DISTRICTS.filter(r=>r.name).map(r=>({id:r.id,name:r.name,color:r.color})),...ALPHA_ENTRIES.map(r=>({id:r.id,name:r.name,color:'#a2b5b1'}))]
export function alphaRegionAt(x:number,y:number):string|null {
 const entry=ALPHA_ENTRIES.find(r=>contains(r,x,y));if(entry)return entry.id
 const district=ALPHA_DISTRICTS.find(r=>contains(r,x,y));return district?canonical(district.id):null
}
const pieces=(id:string)=>[...ALPHA_DISTRICTS,...ALPHA_ENTRIES].filter(r=>canonical(r.id)===id)
export function alphaRegionRooms(id:string):RoomSpec[]{
 const areas=pieces(id)
 return blueprint.rooms.filter(r=>!r.id.endsWith('_hall')&&areas.some(a=>contains(a,r.x+r.w/2,r.y+r.h/2)))
}
export function alphaRegionBounds(id?:string|null):Rect {
 const a=id?pieces(id):[...ALPHA_DISTRICTS,...ALPHA_ENTRIES,...blueprint.corridors]
 if(!a.length)return alphaRegionBounds()
 const x=Math.min(...a.map(r=>r.x))-2,y=Math.min(...a.map(r=>r.y))-2
 return {x,y,w:Math.max(...a.map(r=>r.x+r.w))-x+2,h:Math.max(...a.map(r=>r.y+r.h))-y+2}
}
export const alphaRoomColor=(r:RoomSpec)=>r.style==='lab'?'#e9b887':r.style==='office'?'#8fb5c8':r.style==='store'?'#c6c395':r.style==='vault'||r.access?'#bd9cb2':r.style==='bedroom'?'#c4adbf':r.style==='classroom'?'#a7c3bb':r.style==='radio'?'#b6caca':'#d8cab0'
export const alphaRoomName=(r:RoomSpec)=>r.name.replace(/^.*? · /,'').replace('研究员办公室 ','办公室 ').replace('值班宿舍 ','宿舍 ')

/** Both HUD and expanded maps use this published base plan, independent of exploration fog. */
export function drawAlphaMap(g:CanvasRenderingContext2D,size:number,player:{x:number;y:number},options:{mini?:boolean;region?:string|null;yaw?:number;height?:number;sight:MapSight}){
 const mini=options.mini??false,region=options.region??null,bounds=alphaRegionBounds(region),pad=mini?5:22
 const height=options.height??size,scale=Math.min((size-pad*2)/bounds.w,(height-pad*2)/bounds.h),ox=(size-bounds.w*scale)/2-bounds.x*scale,oy=(height-bounds.h*scale)/2-bounds.y*scale
 const current=alphaRegionAt(player.x,player.y)
 const rect=(r:Rect,fill:string,stroke?:string)=>{g.fillStyle=fill;g.fillRect(ox+r.x*scale,oy+r.y*scale,r.w*scale,r.h*scale);if(stroke){g.strokeStyle=stroke;g.lineWidth=mini?.6:1;g.strokeRect(ox+r.x*scale,oy+r.y*scale,r.w*scale,r.h*scale)}}
 const label=(text:string,x:number,y:number,width:number,font=mini?7:14)=>{
  g.font=`${mini?'':'600 '}${font}px system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillStyle='#1f302f'
  const max=Math.max(2,Math.floor(width*scale/font)),lines:string[]=[]
  for(let i=0;i<text.length;i+=max)lines.push(text.slice(i,i+max))
  lines.forEach((line,i)=>g.fillText(line,ox+x*scale,oy+y*scale+(i-(lines.length-1)/2)*(font+3)))
 }
 g.save();g.beginPath();g.rect(0,0,size,height);g.clip();g.fillStyle='#394442';g.fillRect(0,0,size,height)
 g.save()
 if(region){g.beginPath();g.rect(ox+bounds.x*scale,oy+bounds.y*scale,bounds.w*scale,bounds.h*scale);g.clip()}
 for(const r of blueprint.corridors)rect(r,'#d2d4c9')
 for(const r of ALPHA_DISTRICTS)if(!region||canonical(r.id)===region)rect(r,r.color,'#d7dfd6')
 for(const r of ALPHA_ENTRIES)if(!region||r.id===region)rect(r,'#a2b5b1','#e5ece1')
 if(region){
  const rooms=alphaRegionRooms(region)
  for(const r of rooms)rect(r,alphaRoomColor(r),'#5c706a')
  const inRegion=(s:Rect)=>s.x<bounds.x+bounds.w&&s.x+s.w>bounds.x&&s.y<bounds.y+bounds.h&&s.y+s.h>bounds.y
  // Actual authored wall pieces reveal door openings; room rectangles never invent closed thresholds.
  for(const s of blueprint.decorations??[])if(s.kind==='alpha_wall'&&Number(s.data?.z??0)<.2&&inRegion(s))rect(s,'#586963')
  for(const door of ALPHA_DOORWAYS)if(rooms.some(r=>r.id===door.room)){
   g.strokeStyle='#f9fbeb';g.lineWidth=2;g.beginPath()
   const horizontal=door.side==='s'||door.side==='n',dx=horizontal?.86:0,dy=horizontal?0:.86
   g.moveTo(ox+(door.cx-dx)*scale,oy+(door.cy-dy)*scale);g.lineTo(ox+(door.cx+dx)*scale,oy+(door.cy+dy)*scale);g.stroke()
  }
  for(const r of rooms){
   label(alphaRoomName(r),r.x+r.w/2,r.y+r.h/2,r.w-.6,mini?8:Math.min(14,Math.max(11,scale*1.2)))
   if(r.access){g.fillStyle='#594555';g.font='10px system-ui';g.fillText('许可区',ox+(r.x+r.w/2)*scale,oy+(r.y+r.h-.7)*scale)}
  }
 }else{
  for(const r of ALPHA_DISTRICTS.filter(r=>r.name)){
   if(current===r.id){g.strokeStyle='#fff9d8';g.lineWidth=mini?1.4:3;for(const p of pieces(r.id))g.strokeRect(ox+p.x*scale+1,oy+p.y*scale+1,p.w*scale-2,p.h*scale-2)}
   label(r.name.replace('居民片区','').replace(/[「」]/g,''),r.x+r.w/2,r.y+r.h/2,r.w-2,mini?Math.max(6,size/24):Math.min(16,size/30))
  }
  if(!mini){g.fillStyle='#e8e9db';g.font='12px system-ui';g.textAlign='center';g.fillText('南侧扩建通廊 ↓',ox+90*scale,oy+121*scale)}
 }
 for(const entry of ALPHA_ENTRIES){
  const x=ox+(entry.exit.x+.5)*scale,y=oy+(entry.exit.y+.5)*scale
  g.fillStyle='#c9403d';g.strokeStyle='#fff0d2';g.lineWidth=mini?1:2;g.beginPath();g.arc(x,y,mini?2.3:5,0,Math.PI*2);g.fill();g.stroke()
  if(!mini&&!region){g.font='bold 12px system-ui';g.fillStyle='#f4efe1';g.textAlign=entry.id==='entry_w'?'left':entry.id==='entry_e'?'right':'center';g.fillText(entry.name.split(' · ')[0],x+(entry.id==='entry_w'?8:entry.id==='entry_e'?-8:0),y+(entry.id==='entry_n'?-12:0))}
 }
 const px=ox+player.x*scale,py=oy+player.y*scale
 if(px>=2&&py>=2&&px<=size-2&&py<=height-2){
  drawMapPlayer(g,px,py,options.yaw??0,{scale, radius:mini?3.5:5,color:'#fff4b5',sight:options.sight})
 }
 g.restore();g.fillStyle='#ecede1';g.font=`bold ${mini?8:12}px system-ui`;g.textAlign='left';g.textBaseline='top';g.fillText('N ↑',mini?5:10,mini?4:9)
 g.restore()
}
