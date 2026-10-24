import type {Engine} from '../src/game/engine'
import type {DevMapPreview} from '../src/game/engine/devMap'
import {l7CabinTileAt,l7ZoneOfDepth} from '../src/game/world/infiniteL7'

export const L7_MAP_BANDS=[
 {id:'daylight',name:'有光带',range:'0–24 m',color:'#426e72',line:'M0 8Q5 1 10 6T20 4'},
 {id:'twilight',name:'微光带',range:'24–90 m',color:'#2f566b',line:'M0 8Q5 1 10 6T20 4'},
 {id:'midnight',name:'午夜带',range:'90–230 m',color:'#253d58',line:'M0 8Q5 1 10 6T20 4'},
 {id:'abyss',name:'深渊',range:'≥230 m',color:'#181e38',line:'M0 8Q5 1 10 6T20 4'},
] as const
export type L7MapView={x0:number;y0:number;x1:number;y1:number;scale:number;preview?:DevMapPreview|null;mini?:boolean}
export type L7MapStats={maxDepth:number|null;band:string|null;contours:number;known:number;missing:number;labels:string[]}

/** Normalized marching-squares segments; the saddle test keeps contours
 * connected across cells without a diagonal choice based on chunk identity. */
export function l7ContourSegments(a:number,b:number,c:number,d:number,depth:number):number[][]{
 const vals=[a,b,c,d],points:number[][]=[],edges:number[]=[]
 const corners=[[0,0],[1,0],[1,1],[0,1]]
 for(let i=0;i<4;i++){
  const j=(i+1)%4
  if((vals[i]>=depth)===(vals[j]>=depth))continue
  const t=(depth-vals[i])/(vals[j]-vals[i])
  points[i]=[corners[i][0]+(corners[j][0]-corners[i][0])*t,corners[i][1]+(corners[j][1]-corners[i][1])*t];edges.push(i)
 }
 if(edges.length===2)return[[...points[edges[0]],...points[edges[1]]]]
 if(edges.length!==4)return[]
 const q=(a-depth)*(c-depth)-(b-depth)*(d-depth)
 const pairs=q>=0?[[0,1],[2,3]]:[[0,3],[1,2]]
 return pairs.map(([i,j])=>[...points[i],...points[j]])
}

/** All depths are positive metres below sea level; a whole tile is classified
 * by its lowest rendered vertex, including its centre, not the swimmer's z. */
export function l7DeepestTile(center:number,n:number,e:number,s:number,w:number,ne:number,se:number,sw:number,nw:number){
 return Math.max(0,center,(center+n)/2,(center+e)/2,(center+s)/2,(center+w)/2,
  (center+n+e+ne)/4,(center+e+s+se)/4,(center+s+w+sw)/4,(center+w+n+nw)/4)
}

export function drawL7Map(g:CanvasRenderingContext2D,eng:Engine,v:L7MapView):L7MapStats{
 const stats:L7MapStats={maxDepth:null,band:null,contours:0,known:0,missing:0,labels:[]}
 const m=eng.map,inf=m?.inf;if(!m||!inf)return stats
 const scale=v.scale,ox=inf.ox,oy=inf.oy,reveal=!!(eng.devEnabled&&eng.dev.mapReveal)
 const areas=new Map((v.preview?.cells??[]).map(c=>[`${c.cx},${c.cy}`,c]))
 // World-indexed 1 m fields are shared by fills, contours and band labels.
 // Live records always win over cached previews. No procedural generation or
 // Three.js work is performed while painting either map.
 const x0=Math.floor(v.x0),y0=Math.floor(v.y0),x1=Math.ceil(v.x1),y1=Math.ceil(v.y1),w=x1-x0,h=y1-y0
 const bx=x0-2,by=y0-2,bw=w+4,bh=h+4,depth=new Float32Array(bw*bh).fill(NaN),land=new Uint8Array(bw*bh)
 const known=new Uint8Array(w*h),band=new Int8Array(w*h).fill(-1),maxima=new Float32Array(w*h)
 const isKnown=(x:number,y:number)=>{
  if(reveal)return true
  if(x>=0&&y>=0&&x<m.w&&y<m.h)return !!eng.explored[y*m.w+x]
  const wx=x+ox,wy=y+oy,cx=Math.floor(wx/32),cy=Math.floor(wy/32)
  return !!inf.explored.get(`${cx},${cy}`)?.[(wy-cy*32)*32+wx-cx*32]
 }
 for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
  const lx=bx+x,ly=by+y,wx=lx+ox,wy=ly+oy,i=y*bw+x
  if(lx>=0&&ly>=0&&lx<m.w&&ly<m.h){const j=ly*m.w+lx;depth[i]=m.liquid[j]===1?m.seaFloor[j]:-(m.elev[j]===2?1.2:0);land[i]=m.liquid[j]===0?1:0}
  else {const cx=Math.floor(wx/32),cy=Math.floor(wy/32),a=areas.get(`${cx},${cy}`),j=(wy-cy*32)*32+wx-cx*32;if(a?.seaFloor&&a.liquid){depth[i]=a.liquid[j]===1?a.seaFloor[j]:-(a.elev[j]===2?1.2:0);land[i]=a.liquid[j]===0?1:0}}
 }
 const at=(x:number,y:number)=>depth[(y-by)*bw+x-bx]
 const deepest=(x:number,y:number)=>l7DeepestTile(at(x,y),at(x,y-1),at(x+1,y),at(x,y+1),at(x-1,y),at(x+1,y-1),at(x+1,y+1),at(x-1,y+1),at(x-1,y-1))
 g.save();g.beginPath();g.rect(v.x0*scale,v.y0*scale,(v.x1-v.x0)*scale,(v.y1-v.y0)*scale);g.clip()
 // Build a single exploration clip from horizontal runs. Unknown cells stay
 // hidden even when contour interpolation or text extends across the border.
 g.beginPath()
 for(let y=y0;y<y1;y++){
  let start:number|null=null
  for(let x=x0;x<=x1;x++){
   const yes=x<x1&&isKnown(x,y)
   if(yes){known[(y-y0)*w+x-x0]=1;stats.known++;if(start===null)start=x}
   if(!yes&&start!==null){g.rect(start*scale,y*scale,(x-start)*scale,scale);start=null}
  }
 }
 g.clip();g.fillStyle='#14232e';g.fillRect(v.x0*scale,v.y0*scale,(v.x1-v.x0)*scale,(v.y1-v.y0)*scale)
 for(let y=y0;y<y1;y++){
  let start=x0,last=-1
  const flush=(x:number)=>{if(last<0)return;g.fillStyle=last===4?'#707c78':L7_MAP_BANDS[last].color;g.fillRect(start*scale,y*scale,(x-start)*scale,scale)}
  for(let x=x0;x<=x1;x++){
   let id=-1
   if(x<x1&&known[(y-y0)*w+x-x0]){
    const i=(y-y0)*w+x-x0,d=deepest(x,y)
    if(Number.isFinite(d)){
     maxima[i]=d;const zone=l7ZoneOfDepth(d);id=land[(y-by)*bw+x-bx]?4:L7_MAP_BANDS.findIndex(b=>b.id===zone);band[i]=id
     if(id!==4)stats.maxDepth=Math.max(stats.maxDepth??0,d)
    }else stats.missing++
   }
   if(id!==last){flush(x);start=x;last=id}
  }
 }
 if(stats.maxDepth!==null)stats.band=L7_MAP_BANDS.find(b=>b.id===l7ZoneOfDepth(stats.maxDepth!))!.name
 // Surface vertices on integer world coordinates average the four tile
 // centres around them, matching the seabed's half-metre mesh lattice.
 const node=(x:number,y:number)=>(at(x-1,y-1)+at(x,y-1)+at(x,y)+at(x-1,y))/4
 const step=v.mini||scale<3?2:1,interval=v.mini?20:10,major=v.mini?100:50
 const contourLabels=new Map<number,{x:number;y:number}>()
 for(const kind of ['minor','major','band'] as const){
  g.beginPath()
  for(let y=Math.floor(y0/step)*step;y<y1;y+=step)for(let x=Math.floor(x0/step)*step;x<x1;x+=step){
   const a=node(x,y),b=node(x+step,y),c=node(x+step,y+step),d=node(x,y+step),lo=Math.min(a,b,c,d),hi=Math.max(a,b,c,d)
   if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<=0)continue
   const levels=kind==='band'?[24,90,230]:Array.from({length:Math.max(0,Math.floor(hi/interval)-Math.floor(Math.max(0,lo)/interval))},(_,i)=>(Math.floor(Math.max(0,lo)/interval)+i+1)*interval)
   for(const level of levels){
    if(level<=lo||level>hi||kind!=='band'&&((level%major===0)!==(kind==='major')))continue
    for(const seg of l7ContourSegments(a,b,c,d,level)){
     const sx=(x+seg[0]*step)*scale,sy=(y+seg[1]*step)*scale,ex=(x+seg[2]*step)*scale,ey=(y+seg[3]*step)*scale
     g.moveTo(sx,sy);g.lineTo(ex,ey);stats.contours++
     if(!v.mini&&kind!=='minor'&&!contourLabels.has(level)&&x>x0+5&&x<x1-5&&y>y0+6&&y<y1-5&&isKnown(x,y))contourLabels.set(level,{x:(sx+ex)/2,y:(sy+ey)/2})
    }
   }
  }
  g.lineWidth=kind==='minor'?.55:kind==='major'?.95:1.25
  g.strokeStyle=kind==='minor'?'rgba(157,199,202,.35)':kind==='major'?'rgba(196,223,216,.65)':'rgba(223,224,177,.8)';g.stroke()
 }
 const occupied:{x:number;y:number;width:number;height:number}[]=[]
 const text=(value:string,x:number,y:number,color:string,fontSize:number)=>{
  g.font=`${fontSize}px sans-serif`;g.textAlign='center';g.textBaseline='middle'
  const width=g.measureText(value).width+8,height=fontSize+6
  if(x-width/2<v.x0*scale+3||x+width/2>v.x1*scale-3||y-height/2<v.y0*scale+3||y+height/2>v.y1*scale-3)return
  if(occupied.some(p=>Math.abs(x-p.x)<(width+p.width)/2&&Math.abs(y-p.y)<(height+p.height)/2))return
  g.lineWidth=3;g.strokeStyle='rgba(8,18,27,.9)';g.strokeText(value,x,y);g.fillStyle=color;g.fillText(value,x,y);occupied.push({x,y,width,height});stats.labels.push(value)
 }
 // Label connected depth-band patches by their actual deepest mesh vertex.
 // Small patches keep their color/contour; labels never imply a chunk-wide band.
 if(!v.mini){
  const visited=new Uint8Array(w*h),queue=new Int32Array(w*h),regions:{id:number;n:number;sx:number;sy:number;max:number;px:number;py:number}[]=[]
  for(let i=0;i<band.length;i++)if(band[i]>=0&&band[i]<4&&!visited[i]){
   let head=0,tail=1;queue[0]=i;visited[i]=1;const reg={id:band[i],n:0,sx:0,sy:0,max:0,px:0,py:0}
   while(head<tail){const j=queue[head++],x=j%w,y=Math.floor(j/w);reg.n++;reg.sx+=x;reg.sy+=y;if(maxima[j]>reg.max){reg.max=maxima[j];reg.px=x;reg.py=y}
    for(const k of [x>0?j-1:-1,x<w-1?j+1:-1,y>0?j-w:-1,y<h-1?j+w:-1])if(k>=0&&!visited[k]&&band[k]===reg.id){visited[k]=1;queue[tail++]=k}
   }
   if(reg.n*scale*scale>3000)regions.push(reg)
  }
  regions.sort((a,b)=>b.n-a.n)
  for(const reg of regions.slice(0,7)){
   let x=Math.round(reg.sx/reg.n),y=Math.round(reg.sy/reg.n);if(band[y*w+x]!==reg.id){x=reg.px;y=reg.py}
   text(`${L7_MAP_BANDS[reg.id].name} · 最深 ${Math.floor(reg.max)}m`,(x0+x+.5)*scale,(y0+y+.5)*scale,'#d6e6de',11)
  }
  for(const [level,p]of contourLabels)text(`${level}m`,p.x,p.y,'#c6ddd4',9)
 }
 // Cabin footprint is architectural, not a band/color rectangle for chunk 0,0.
 for(let y=Math.max(y0,11-oy);y<Math.min(y1,25-oy);y++)for(let x=Math.max(x0,10-ox);x<Math.min(x1,20-ox);x++){
  const cabin=l7CabinTileAt(x+ox,y+oy);if(!cabin)continue
  g.fillStyle=cabin===2?'#aab7b4':'#58696c';g.fillRect(x*scale,y*scale,scale,scale)
 }
 g.restore()
 // A compact summary reports only charted terrain, never undiscovered depths.
 if(stats.maxDepth!==null){
  g.save();g.font=`${v.mini?8:11}px sans-serif`;g.textAlign='left';g.textBaseline='top'
  const label=v.mini?`${stats.band} · ${Math.floor(stats.maxDepth)}m`:`海床最深 ${Math.floor(stats.maxDepth)} m · ${stats.band}`
  const x=v.x0*scale+4,y=v.y0*scale+4,width=g.measureText(label).width+8
  g.fillStyle='rgba(8,18,27,.82)';g.fillRect(x-2,y-2,width,v.mini?12:17);g.fillStyle='#d6e6de';g.fillText(label,x+2,y);g.restore()
 }
 return stats
}
