import type {Engine} from '../engine'
import type {DevMapPreview} from '../engine/devMap'
import {structColliders} from '../world/mapgen'
import {L23_MAP_KEY,L23_MAP_MARKS} from './l23MapKey'
type View={x0:number;y0:number;x1:number;y1:number;scale:number;preview?:DevMapPreview|null}
const glyphs=new Map<string,Path2D>()
type L23Rect={x:number;y:number;w:number;h:number}
type L23Struct=import('../core/types').Structure
type L23Area={cx:number;cy:number;tiles?:Uint8Array;tint?:Uint8Array;walls:(L23Rect&{kind?:string})[];structures:L23Struct[];preview:boolean;variant?:string;crawl?:Uint8Array}

export function drawL23Map(g:CanvasRenderingContext2D,eng:Engine,v:View){
 const m=eng.map,inf=m?.inf,level=eng.levelDef.id;if(!m||!inf||(level!==2&&level!==3))return
 const keys=L23_MAP_KEY[level],keyFor=(id:string)=>keys.find(k=>k.id===id)
 const reveal=!!(eng.devEnabled&&eng.dev.mapReveal),s=v.scale
 const areas=new Map<string,L23Area>()
 for(const c of v.preview?.cells??[])areas.set(`${c.cx},${c.cy}`,{...c,walls:c.walls??[],structures:[],preview:true})
 for(const c of inf.chunks.values())areas.set(c.key,{cx:c.cx,cy:c.cy,tiles:c.tiles,tint:c.tint,variant:c.variant,crawl:c.crawl,walls:[],structures:(c.structures??[]) as L23Struct[],preview:false})
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
  let start=x0,last=''
  const flush=(end:number)=>{if(last==='')return;g.fillStyle=last==='wall'?'#bbb5a3':keyFor(last)?.color??'#30363a';g.fillRect(start*s,y*s,(end-start)*s,s)}
  for(let x=x0;x<=x1;x++){
   let id=''
   if(x<x1&&known(x,y)){
    const wx=x+ox,wy=y+oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32),a=areas.get(`${cx},${cy}`),i=(wy-cy*32)*32+wx-cx*32
    if(a?.tiles?.[i]===1){id=l23MapRegion(level,a.variant,a.tint?.[i]??0,wx-cx*32,wy-cy*32)}else if(a?.tiles?.[i]===2)id='wall'
   }
   if(id!==last){flush(x);start=x;last=id}
  }
 }
 // Low overhead pipes remain walkable while crouching.
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(known(x,y)){
  const wx=x+ox,wy=y+oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32),a=areas.get(cx+','+cy),i=(wy-cy*32)*32+wx-cx*32
  if(a?.crawl?.[i]===1&&a.tiles?.[i]===1){g.fillStyle='#b29a62';g.fillRect(x*s,(y+.38)*s,s,Math.max(.7,s*.24))}
 }
 const drawWall=(r:L23Rect,color:string,local:boolean)=>{const x=local?r.x:r.x-ox,y=local?r.y:r.y-oy;if(x>=v.x1||x+r.w<=v.x0||y>=v.y1||y+r.h<=v.y0)return;g.fillStyle=color;if(reveal){g.fillRect(x*s,y*s,Math.max(.8,r.w*s),Math.max(.8,r.h*s));return}g.save();g.beginPath();for(let yy=Math.floor(Math.max(y,v.y0));yy<Math.ceil(Math.min(y+r.h,v.y1));yy++)for(let xx=Math.floor(Math.max(x,v.x0));xx<Math.ceil(Math.min(x+r.w,v.x1));xx++)if(known(xx,yy))g.rect(xx*s,yy*s,s,s);g.clip();g.fillRect(x*s,y*s,Math.max(.8,r.w*s),Math.max(.8,r.h*s));g.restore()}
 for(const a of areas.values())for(const w of a.walls)drawWall(w,markColor(w.kind),false)
 for(const a of areas.values())for(const st of a.structures)if(st.solid&&(st.floor??0)===0&&st.x<v.x1&&st.x+st.w>v.x0&&st.y<v.y1&&st.y+st.h>v.y0)for(const b of structColliders(st,m))if((b.bottom??0)<1.6&&b.top>.05)drawWall({x:b.x0,y:b.y0,w:b.x1-b.x0,h:b.y1-b.y0},markColor(st.kind),true)
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(known(x,y)&&((x+ox)*3+(y+oy)*5)%19===0){const wx=x+ox,wy=y+oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32),a=areas.get(`${cx},${cy}`),i=(wy-cy*32)*32+wx-cx*32,t=a?.tint?.[i],k=keyFor(l23MapRegion(level,a?.variant,t??0,wx-cx*32,wy-cy*32));if(k&&a?.tiles?.[i]===1){let p=glyphs.get(k.id);if(!p){p=new Path2D(k.path);glyphs.set(k.id,p)}const r=Math.min(9,Math.max(4,s*1.8));g.save();g.beginPath();for(let gy=y-3;gy<=y+3;gy++)for(let gx=x-3;gx<=x+3;gx++){const wx=gx+ox,wy=gy+oy,aa=areas.get(`${Math.floor(wx/32)},${Math.floor(wy/32)}`),ii=((wy%32+32)%32)*32+((wx%32+32)%32);if(known(gx,gy)&&aa?.tiles?.[ii]===1)g.rect(gx*s,gy*s,s,s)}g.clip();g.translate((x+.5)*s-r/2,(y+.5)*s-r/3);g.scale(r/18,r/18);g.strokeStyle=k.ink;g.lineWidth=1.4;g.stroke(p);g.restore()}}
 g.restore()
}

/** L3 feature-room interiors share the generator's actual room inset. */
export function l23MapRegion(level:2|3,variant:string|undefined,tint:number,x:number,y:number):string{
 if(level===2)return tint===16?'office':variant==='narrow'?'narrow':tint===12?'dirty':tint===13?'dim':tint===15?'warped':'tidy'
 if(tint===20)return 'sanct'
 if(variant==='narrow')return 'narrow'
 const margin=variant==='boiler'?11:variant==='genhall'?3:2
 if(['assembly','genhall','boiler'].includes(variant??'')&&x>=margin&&x<32-margin&&y>=margin&&y<32-margin)return variant!
 return tint===19?'dark':'lit'
}
function markColor(kind?:string){const id=kind==='barfence'||kind==='bargate'?'grille':kind?.includes('door')||kind==='fireexit'?'door':'wall';return L23_MAP_MARKS.find(k=>k.id===id)!.color}
