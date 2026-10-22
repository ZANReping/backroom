import type {Engine} from '../engine'
import type {DevMapPreview} from '../engine/devMap'

export const L4_MAP_KEY=[
 {id:51,name:'办公间区',color:'#405462',ink:'#a9c3ca',path:'M3 2V10M9 2V10M15 2V10M3 6H15'},
 {id:52,name:'空旷区',color:'#58516d',ink:'#c3b8d2',path:'M4 3h2v2H4ZM11 2h2v2h-2ZM7 8h2v2H7ZM14 7h2v2h-2Z'},
 {id:54,name:'小房间区',color:'#6c6250',ink:'#d2c09d',path:'M3 2H15V10H3ZM9 2V10M3 6H15'},
 {id:55,name:'空旷大厅',color:'#486564',ink:'#b0d0c8',path:'M4 2V10M9 2V10M14 2V10M2 4H16M2 8H16'},
] as const
export const L4_MAP_MARKS=[
 {id:'wall',name:'墙/柱',color:'#bbb5a3',path:'M2 3H16V9H2Z'},
 {id:'door',name:'门/窗',color:'#7ab9c7',path:'M3 6H15M9 2V10'},
] as const
type View={x0:number;y0:number;x1:number;y1:number;scale:number;preview?:DevMapPreview|null}
const glyphs=new Map<number,Path2D>()
type L4Rect={x:number;y:number;w:number;h:number}
type L4Struct=L4Rect&{solid?:boolean;kind?:string;data?:{windowId?:unknown}}
type L4Area={cx:number;cy:number;tiles?:Uint8Array;tint?:Uint8Array;walls:L4Rect[];structures:L4Struct[];preview:boolean}

export function drawL4Map(g:CanvasRenderingContext2D,eng:Engine,v:View){
 const m=eng.map,inf=m?.inf;if(!m||!inf)return
 const reveal=!!(eng.devEnabled&&eng.dev.mapReveal),s=v.scale
 const areas=new Map<string,L4Area>()
 for(const c of v.preview?.cells??[])areas.set(`${c.cx},${c.cy}`,{...c,walls:c.walls??[],structures:[],preview:true})
 for(const c of inf.chunks.values())areas.set(c.key,{cx:c.cx,cy:c.cy,tiles:c.tiles,tint:c.tint,walls:[],structures:(c.structures??[]) as L4Struct[],preview:false})
 const known=(x:number,y:number)=>{
  if(reveal)return true
  const ix=Math.floor(x),iy=Math.floor(y)
  if(ix>=0&&iy>=0&&ix<m.w&&iy<m.h)return !!eng.explored[iy*m.w+ix]
  const wx=ix+(inf.ox??0),wy=iy+(inf.oy??0),cx=Math.floor(wx/32),cy=Math.floor(wy/32)
  return !!inf.explored.get(`${cx},${cy}`)?.[(wy-cy*32)*32+wx-cx*32]
 }
 const x0=Math.floor(v.x0),x1=Math.ceil(v.x1),y0=Math.floor(v.y0),y1=Math.ceil(v.y1)
 g.save();g.beginPath();g.rect(v.x0*s,v.y0*s,(v.x1-v.x0)*s,(v.y1-v.y0)*s);g.clip()
 const ox=inf.ox??0,oy=inf.oy??0
 for(let y=y0;y<y1;y++){
  let start=x0,last=-1
  const flush=(end:number)=>{if(last===-1)return;g.fillStyle=last===-2?'#bbb5a3':L4_MAP_KEY.find(k=>k.id===last)?.color??'#30363a';g.fillRect(start*s,y*s,(end-start)*s,s)}
  for(let x=x0;x<=x1;x++){
   let id=-1
   if(x<x1&&known(x,y)){
    const wx=x+ox,wy=y+oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32),a=areas.get(`${cx},${cy}`),i=(wy-cy*32)*32+wx-cx*32
    if(a?.tiles?.[i]===1){const t=a.tint?.[i];id=t===53?51:(t===51||t===52||t===54||t===55?t:-1)}else if(a?.tiles?.[i]===2)id=-2
   }
   if(id!==last){flush(x);start=x;last=id}
  }
 }
 const drawWall=(r:L4Rect,color:string,local:boolean)=>{const x=local?r.x:r.x-ox,y=local?r.y:r.y-oy;if(x>=v.x1||x+r.w<=v.x0||y>=v.y1||y+r.h<=v.y0)return;g.fillStyle=color;if(reveal){g.fillRect(x*s,y*s,Math.max(.8,r.w*s),Math.max(.8,r.h*s));return}g.save();g.beginPath();for(let yy=Math.floor(Math.max(y,v.y0));yy<Math.ceil(Math.min(y+r.h,v.y1));yy++)for(let xx=Math.floor(Math.max(x,v.x0));xx<Math.ceil(Math.min(x+r.w,v.x1));xx++)if(known(xx,yy))g.rect(xx*s,yy*s,s,s);g.clip();g.fillRect(x*s,y*s,Math.max(.8,r.w*s),Math.max(.8,r.h*s));g.restore()}
 for(const a of areas.values())for(const w of a.walls)drawWall(w,'#bbb5a3',false)
 for(const a of areas.values())for(const st of a.structures)if(st.solid)drawWall(st,st.data?.windowId||st.kind==='glassdoor'?'#7ab9c7':'#bbb5a3',true)
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(known(x,y)&&((x+ox)%12+12)%12===6&&((y+oy)%12+12)%12===6){const wx=x+ox,wy=y+oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32),a=areas.get(`${cx},${cy}`),i=(wy-cy*32)*32+wx-cx*32,t=a?.tint?.[i],k=L4_MAP_KEY.find(q=>q.id===(t===53?51:t));if(k&&a?.tiles?.[i]===1){let p=glyphs.get(k.id);if(!p){p=new Path2D(k.path);glyphs.set(k.id,p)}const r=Math.min(11,Math.max(7,s*2.8));g.save();g.beginPath();for(let gy=y-3;gy<=y+3;gy++)for(let gx=x-3;gx<=x+3;gx++){const wx=gx+ox,wy=gy+oy,aa=areas.get(`${Math.floor(wx/32)},${Math.floor(wy/32)}`),ii=((wy%32+32)%32)*32+((wx%32+32)%32);if(known(gx,gy)&&aa?.tiles?.[ii]===1)g.rect(gx*s,gy*s,s,s)}g.clip();g.translate((x+.5)*s-r/2,(y+.5)*s-r/3);g.scale(r/18,r/18);g.strokeStyle=k.ink;g.lineWidth=1.4;g.stroke(p);g.restore()}}
 g.restore()
}
