import type {Engine} from '../engine'
import type {DevMapPreview} from '../engine/devMap'
import type {L0Rect} from '../world/l0Architecture'

export const L0_MAP_KEY=[
 {id:0,name:'黄室',color:'#49412b',ink:'#baa878',symbol:'plain'},
 {id:1,name:'柱厅',color:'#4c4940',ink:'#cbc3a0',symbol:'columns'},
 {id:2,name:'红室',color:'#723735',ink:'#e29485',symbol:'slash'},
 {id:3,name:'熄灯区',color:'#242e39',ink:'#8494a9',symbol:'dots'},
 {id:4,name:'深坑',color:'#07090b',ink:'#afb2b7',symbol:'pit'},
 {id:5,name:'拱门',color:'#64624b',ink:'#e5ddb7',symbol:'arch'},
 {id:6,name:'马尼拉',color:'#765335',ink:'#dec08a',symbol:'wood'},
] as const
type View={x0:number;y0:number;x1:number;y1:number;scale:number;preview?:DevMapPreview|null}
const hit=(r:L0Rect,x:number,y:number)=>x>=r.x&&x<r.x+r.w&&y>=r.y&&y<r.y+r.h

/** Draw in local map coordinates × scale. Both maps use the same live
 * architecture and region raster, without rebuilding geometry on the UI thread. */
export function drawL0Map(g:CanvasRenderingContext2D,eng:Engine,v:View){
 const m=eng.map,inf=m?.inf;if(!m||!inf?.l0)return
 const s=v.scale,reveal=eng.devEnabled&&eng.dev.mapReveal
 const cells=new Map((reveal?v.preview?.cells??[]:[]).map(c=>[`${c.cx},${c.cy}`,c]))
 const areas=new Map<string,{regions?:Uint8Array;walls:L0Rect[];pits:L0Rect[];tiles:Uint8Array}>()
 for(const c of cells.values())areas.set(`${c.cx},${c.cy}`,{regions:c.regions,walls:c.walls,pits:c.pits??[],tiles:c.tiles})
 for(const c of inf.chunks.values())if(c.l0)areas.set(`${c.cx},${c.cy}`,{regions:c.l0.mapRegions,walls:c.l0.walls.filter(w=>w.bottom<1.8&&w.top>.05),pits:c.l0.pits,tiles:c.tiles})
 const known=(x:number,y:number)=>{
  if(reveal)return true
  const ix=Math.floor(x),iy=Math.floor(y)
  if(ix>=0&&iy>=0&&ix<m.w&&iy<m.h)return !!eng.explored[iy*m.w+ix]
  const wx=ix+inf.ox,wy=iy+inf.oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32)
  return !!inf.explored.get(`${cx},${cy}`)?.[(wy-cy*32)*32+wx-cx*32]
 }
 const x0=Math.max(Math.floor(v.x0),-1e6),x1=Math.min(Math.ceil(v.x1),1e6),y0=Math.max(Math.floor(v.y0),-1e6),y1=Math.min(Math.ceil(v.y1),1e6)
 g.save();g.beginPath();g.rect(v.x0*s,v.y0*s,(v.x1-v.x0)*s,(v.y1-v.y0)*s);g.clip()
 const transform=g.getTransform(),snapX=(x:number)=>Math.round(x*s+transform.e)-transform.e,snapY=(y:number)=>Math.round(y*s+transform.f)-transform.f
 // Merge neighbouring colours before drawing symbols. This keeps a 120 m
 // viewport from submitting one Canvas rectangle for every metre of floor.
 const symbols:{x:number;y:number;id:number}[]=[]
 for(let y=y0;y<y1;y++){
  let runStart=x0,runId:number|undefined
  const flush=(end:number)=>{if(runId===undefined||end<=runStart)return;const key=L0_MAP_KEY[runId]??L0_MAP_KEY[0],sx=snapX(runStart),sy=snapY(y);g.fillStyle=key.color;g.fillRect(sx,sy,snapX(end)-sx,snapY(y+1)-sy)}
  for(let x=x0;x<=x1;x++){
   let id:number|undefined
   if(x<x1&&known(x,y)){
    const wx=x+inf.ox,wy=y+inf.oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32),a=areas.get(`${cx},${cy}`),idx=(wy-cy*32)*32+wx-cx*32
    if(a&&a.tiles[idx]===1)id=a.regions?.[idx]??0
    if(id!==undefined){
     const motifStep=id===6?4:8,motifPhase=id===6?2:4
     if(id>1&&id!==4&&((wx%motifStep+motifStep)%motifStep===motifPhase)&&((wy%motifStep+motifStep)%motifStep===motifPhase))symbols.push({x,y,id})
    }
   }
   if(id!==runId){flush(x);runStart=x;runId=id}
  }
 }
 // Motifs stay anchored in world space while the map pans or zooms.
 for(const {x,y,id} of symbols){
  const key=L0_MAP_KEY[id]??L0_MAP_KEY[0],px=(x+.5)*s,py=(y+.5)*s,r=Math.min(5,s*1.2)
  g.strokeStyle=key.ink;g.fillStyle=key.ink;g.lineWidth=Math.max(.7,s*.18);g.beginPath()
  if(id===2){g.moveTo(px-r,py+r);g.lineTo(px+r,py-r);g.moveTo(px-r*.2,py+r);g.lineTo(px+r,py-r*.2);g.stroke()}
  if(id===3){g.arc(px-r*.55,py,.7,0,Math.PI*2);g.arc(px+r*.55,py,.7,0,Math.PI*2);g.fill()}
  if(id===5){g.moveTo(px-r,py+r*.5);g.lineTo(px-r,py);g.arc(px,py,r,Math.PI,0);g.lineTo(px+r,py+r*.5);g.stroke()}
  if(id===6){for(const dy of [-.7,0,.7]){g.moveTo(px-r,py+dy*r);g.lineTo(px+r,py+dy*r)}g.stroke()}
 }
 // Clip each precise wall/hole against discovered metre cells. A single known
 // midpoint must not reveal a long partition in otherwise unexplored space.
 const drawRect=(world:L0Rect,color:string,outline=false)=>{
  const r={x:world.x-inf.ox,y:world.y-inf.oy,w:world.w,h:world.h}
  if(r.x>=v.x1||r.x+r.w<=v.x0||r.y>=v.y1||r.y+r.h<=v.y0)return
  g.fillStyle=color;g.strokeStyle=outline?'#92959c':color;g.lineWidth=.65
  const draw=(x:number,y:number,w:number,h:number)=>{
   const pw=Math.max(.8,w*s),ph=Math.max(.8,h*s),px=(x+w/2)*s-pw/2,py=(y+h/2)*s-ph/2
   g.fillRect(px,py,pw,ph);if(outline)g.strokeRect(px,py,pw,ph)
  }
  if(reveal){draw(r.x,r.y,r.w,r.h);return}
  for(let y=Math.floor(Math.max(r.y,v.y0));y<Math.ceil(Math.min(r.y+r.h,v.y1));y++)for(let x=Math.floor(Math.max(r.x,v.x0));x<Math.ceil(Math.min(r.x+r.w,v.x1));x++)if(known(x,y)){
   const X=Math.max(x,r.x),Y=Math.max(y,r.y);draw(X,Y,Math.min(x+1,r.x+r.w)-X,Math.min(y+1,r.y+r.h)-Y)
  }
 }
 for(const a of areas.values()){
  for(const p of a.pits)drawRect(p,L0_MAP_KEY[4].color,true)
  for(const w of a.walls)if(!a.pits.some(p=>hit(p,w.x+w.w/2,w.y+w.h/2)))drawRect(w,'#bfb28e')
 }
 g.restore()
}
