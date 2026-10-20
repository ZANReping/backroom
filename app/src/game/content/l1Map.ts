import type {Engine} from '../engine'
import type {DevMapPreview} from '../engine/devMap'
import {l1MapGeometry,type L1MapGeometry,type L1MapRect} from '../world/l1MapData'

// IDs match L1_STYLE_NAMES: use actual building styles, never legacy tint IDs.
export const L1_MAP_KEY=[
 {id:0,name:'天鹰段',color:'#46525a',ink:'#b5ccd6',path:'M3 2V10M15 2V10M6 4H12M6 8H12'},
 {id:1,name:'跃金段',color:'#6b5839',ink:'#dfc08c',path:'M4 2H14V10H4ZM4 2L14 10M14 2L4 10'},
 {id:2,name:'哥特段',color:'#524956',ink:'#c9b6d7',path:'M3 10V7Q3 3 9 1Q15 3 15 7V10M9 1V10'},
 {id:3,name:'衔尾段',color:'#665d4f',ink:'#d0c3a4',path:'M13 3A4 4 0 1 0 14 7M10 2L14 3L13 6'},
 {id:4,name:'花园段',color:'#3d573f',ink:'#aaca94',path:'M4 10Q3 1 14 2Q15 10 4 10ZM4 10L11 4'},
 {id:5,name:'小径',color:'#303e43',ink:'#94afb9',path:'M3 2H8V5H13V10M6 2V3H16V10'},
 {id:6,name:'传说段',color:'#735340',ink:'#e0b888',path:'M3 2H15V10H3ZM3 6H15M8 2V6M11 6V10'},
] as const
export const L1_MAP_MARKS=[
 {id:'player',name:'玩家／朝向',color:'#fff4b5',path:'M9 1L13 10L9 8L5 10Z'},
 {id:'sight',name:'视线（墙遮挡）',color:'#acbca2',path:'M9 10L3 2Q9 -1 15 2Z'},
 {id:'wall',name:'墙柱',color:'#bbb5a3',path:'M2 3H16V9H2Z'},
 {id:'door',name:'金属门',color:'#7ab9c7',path:'M8 1V11M8 6H15M15 6L13 4'},
 {id:'wet',name:'积水',color:'#669dad',path:'M2 4Q5 1 9 4T16 4M2 9Q5 6 9 9T16 9'},
 {id:'container',name:'容器／已搜',color:'#c9a03a',path:'M2 3H8V9H2ZM11 3H17V9H11Z'},
 {id:'item',name:'掉落物',color:'#6ad9c9',path:'M7 4H11V8H7Z'},
 {id:'npc',name:'人士',color:'#7ac97a',path:'M12 6A3 3 0 1 0 6 6A3 3 0 1 0 12 6'},
 {id:'exit',name:'已发现出口',color:'#f5e37a',path:'M12 6A3 3 0 1 0 6 6A3 3 0 1 0 12 6'},
 {id:'landmark',name:'据点地标',color:'#ffd94d',path:'M9 1L15 10H3Z'},
] as const
type View={x0:number;y0:number;x1:number;y1:number;scale:number;preview?:DevMapPreview|null}
const glyphs=new Map<number,Path2D>()

/** Both UI maps share true architecture, world-anchored motifs and per-cell
 * exploration clipping. Preview data is read only and creates no game world. */
export function drawL1Map(g:CanvasRenderingContext2D,eng:Engine,v:View){
 const m=eng.map,inf=m?.inf;if(!m||!inf||!m.l1Architecture)return
 const s=v.scale,reveal=eng.devEnabled&&eng.dev.mapReveal,areas=new Map<string,L1MapGeometry>()
 for(const c of v.preview?.cells??[])if(c.regions)areas.set(`${c.cx},${c.cy}`,{tiles:c.tiles,regions:c.regions,walls:c.walls,doors:c.doors??[],wet:c.wet??new Uint8Array(1024)})
 for(const c of inf.chunks.values())if(c.l1)areas.set(c.key,l1MapGeometry(c.l1))
 const known=(x:number,y:number)=>{
  if(reveal)return true
  const ix=Math.floor(x),iy=Math.floor(y)
  if(ix>=0&&iy>=0&&ix<m.w&&iy<m.h)return !!eng.explored[iy*m.w+ix]
  const wx=ix+inf.ox,wy=iy+inf.oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32)
  return !!inf.explored.get(`${cx},${cy}`)?.[(wy-cy*32)*32+wx-cx*32]
 }
 const x0=Math.floor(v.x0),x1=Math.ceil(v.x1),y0=Math.floor(v.y0),y1=Math.ceil(v.y1)
 g.save();g.beginPath();g.rect(v.x0*s,v.y0*s,(v.x1-v.x0)*s,(v.y1-v.y0)*s);g.clip()
 const transform=g.getTransform(),snapX=(x:number)=>Math.round(x*s+transform.e)-transform.e,snapY=(y:number)=>Math.round(y*s+transform.f)-transform.f
 const symbols:{x:number;y:number;id:number}[]=[]
 for(let y=y0;y<y1;y++){
  let start=x0,last=-1
  const flush=(end:number)=>{if(last<0)return;g.fillStyle=last>=7?'#477180':L1_MAP_KEY[last].color;const px=snapX(start),py=snapY(y);g.fillRect(px,py,snapX(end)-px,snapY(y+1)-py)}
  for(let x=x0;x<=x1;x++){
   let id=-1
   if(x<x1&&known(x,y)){
    const wx=x+inf.ox,wy=y+inf.oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32),a=areas.get(`${cx},${cy}`),i=(wy-cy*32)*32+wx-cx*32
    if(a?.tiles[i]===1){
     id=a.wet[i]?7:a.regions[i]
     if(id<7&&((wx%12+12)%12===6)&&((wy%12+12)%12===6))symbols.push({x,y,id})
    }
   }
   if(id!==last){flush(x);start=x;last=id}
  }
 }
 for(const {x,y,id}of symbols){
  let path=glyphs.get(id);if(!path){path=new Path2D(L1_MAP_KEY[id].path);glyphs.set(id,path)}
  const r=Math.min(11,Math.max(7,s*2.8));g.save();g.translate((x+.5)*s-r/2,(y+.5)*s-r/3);g.scale(r/18,r/18);g.strokeStyle=L1_MAP_KEY[id].ink;g.lineWidth=1.4;g.stroke(path);g.restore()
 }
 const rect=(world:L1MapRect,color:string,round=false)=>{
  const r={x:world.x-inf.ox,y:world.y-inf.oy,w:world.w,h:world.h}
  if(r.x>=v.x1||r.x+r.w<=v.x0||r.y>=v.y1||r.y+r.h<=v.y0)return
  g.fillStyle=color
  const draw=(x:number,y:number,w:number,h:number)=>{const pw=Math.max(.8,w*s),ph=Math.max(.8,h*s),px=(x+w/2)*s-pw/2,py=(y+h/2)*s-ph/2;if(round){g.beginPath();g.ellipse(px+pw/2,py+ph/2,pw/2,ph/2,0,0,Math.PI*2);g.fill()}else g.fillRect(px,py,pw,ph)}
  if(reveal){draw(r.x,r.y,r.w,r.h);return}
  // Clip the complete shape, then paint once. Round columns must stay round
  // even when their footprint spans several known metre cells.
  g.save();g.beginPath()
  for(let y=Math.floor(Math.max(r.y,v.y0));y<Math.ceil(Math.min(r.y+r.h,v.y1));y++)for(let x=Math.floor(Math.max(r.x,v.x0));x<Math.ceil(Math.min(r.x+r.w,v.x1));x++)if(known(x,y))g.rect(x*s,y*s,s,s)
  g.clip();draw(r.x,r.y,r.w,r.h);g.restore()
 }
 const open=new Map<string,boolean>()
 for(const rec of Object.values(inf.l1Dynamics?.containers??{}))if(rec.data?.l1PortalId)open.set(String(rec.data.l1PortalId),!!rec.data.open)
 for(const st of m.structures)if(st.data?.l1PortalId)open.set(String(st.data.l1PortalId),!!st.data.open)
 for(const a of areas.values()){
  for(const w of a.walls)rect(w,'#bbb5a3',w.round)
  for(const d of a.doors){
   // A short centre strip shows the actual portal span without painting the
   // whole two-metre corridor as a wall. An open leaf uses a muted dashed line.
   const alongX=d.w>d.h,door={x:alongX?d.x:d.x+d.w/2-.04,y:alongX?d.y+d.h/2-.04:d.y,w:alongX?d.w:.08,h:alongX?.08:d.h}
   if(open.get(d.id)){
    for(let k=0;k<3;k++)rect({x:door.x+(alongX?k*d.w/3:0),y:door.y+(!alongX?k*d.h/3:0),w:alongX?d.w/6:door.w,h:!alongX?d.h/6:door.h},'#527d87')
   }else rect(door,'#7ab9c7')
  }
 }
 g.restore()
}
