import type {Engine} from '../engine'
import type {DevMapPreview} from '../engine/devMap'
import {rememberL7ChartCell,recalledL7ChartCell,type L7ChartCell} from '../world/l7ChartCache'

const ids=new WeakMap<object,number>();let serial=0
const id=(v:object)=>{let n=ids.get(v);if(!n){n=++serial;ids.set(v,n)}return n}
type Source={key:string;depth:(x:number,y:number)=>number;land:(x:number,y:number)=>boolean}
type Lines={minor:Float32Array;major:Float32Array;band:Float32Array}
const contours=new Map<string,Lines>(),LIMIT=192
const metrics={builds:0,hits:0}
const retainedWindows=new WeakMap<object,number|undefined>()
export function l7ContourCacheStats(){return{...metrics,entries:contours.size,limit:LIMIT}}
export function clearL7ContourCache(){contours.clear();metrics.builds=metrics.hits=0}
/** Source lookup pays chunk/string work once per chunk, not once per pixel. */
export function l7ChartReader(eng:Engine,preview?:DevMapPreview|null){
 const m=eng.map!,inf=m.inf!,ox=inf.ox,oy=inf.oy,seed=inf.seed,source=new Map<string,Source>()
 if(!retainedWindows.has(inf)||retainedWindows.get(inf)!==inf.rev){
  for(const [key,c]of inf.chunks??[]){if(c.seaFloor&&c.liquid){const [cx,cy]=key.split(',').map(Number);rememberL7ChartCell(seed,{cx,cy,seaFloor:c.seaFloor,liquid:c.liquid,elev:c.elev})}}
  retainedWindows.set(inf,inf.rev)
 }
 const previewValid=preview&&((preview.seed===undefined||preview.seed===seed)&&(preview.level===undefined||preview.level===7))
 const areas=new Map((previewValid?preview.cells:[]).map(c=>[`${c.cx},${c.cy}`,c]))
 const chunk=(cx:number,cy:number):Source=>{
  const k=`${cx},${cy}`,hit=source.get(k);if(hit)return hit
  const live=inf.chunks?.get(k),p=areas.get(k)
  let c:L7ChartCell|undefined
  if(live?.seaFloor&&live.liquid)c=rememberL7ChartCell(seed,{cx,cy,seaFloor:live.seaFloor,liquid:live.liquid,elev:live.elev})
  else if(cx*32>=ox&&cy*32>=oy&&(cx+1)*32<=ox+m.w&&(cy+1)*32<=oy+m.h){
   const v:Source={key:`window:${id(m.seaFloor)}:${id(m.liquid)}:${id(m.elev)}:${ox}:${oy}`,depth:(x,y)=>{const i=(cy*32+y-oy)*m.w+cx*32+x-ox;return m.liquid[i]===1?m.seaFloor[i]:-(m.elev[i]===2?1.2:0)},land:(x,y)=>m.liquid[(cy*32+y-oy)*m.w+cx*32+x-ox]===0};source.set(k,v);return v
  }else if(p?.seaFloor&&p.liquid)c=rememberL7ChartCell(seed,{cx,cy,seaFloor:p.seaFloor,liquid:p.liquid,elev:p.elev})
  else c=recalledL7ChartCell(seed,cx,cy)
  const v:Source=c?{key:`${id(c.seaFloor)}:${id(c.liquid)}:${id(c.elev)}`,depth:(x,y)=>c!.liquid[y*32+x]===1?c!.seaFloor[y*32+x]:-(c!.elev[y*32+x]===2?1.2:0),land:(x,y)=>c!.liquid[y*32+x]===0}:{key:'missing',depth:()=>NaN,land:()=>false}
  source.set(k,v);return v
 }
 let lastX=NaN,lastY=NaN,last:Source
 const at=(wx:number,wy:number)=>{const cx=Math.floor(wx/32),cy=Math.floor(wy/32);if(cx!==lastX||cy!==lastY){lastX=cx;lastY=cy;last=chunk(cx,cy)}return{c:last,x:wx-cx*32,y:wy-cy*32}}
 const depth=(wx:number,wy:number)=>{const a=at(wx,wy);return a.c.depth(a.x,a.y)}
 const land=(wx:number,wy:number)=>{const a=at(wx,wy);return a.c.land(a.x,a.y)}
 const signature=(cx:number,cy:number)=>{const keys:string[]=[];for(let y=cy-1;y<=cy+1;y++)for(let x=cx-1;x<=cx+1;x++)keys.push(chunk(x,y).key);return `${seed}:${cx},${cy}:${keys.join('|')}`}
 const key=(x0:number,y0:number,x1:number,y1:number)=>{const keys:string[]=[];for(let cy=Math.floor((y0-2)/32);cy<=Math.floor((y1+2)/32);cy++)for(let cx=Math.floor((x0-2)/32);cx<=Math.floor((x1+2)/32);cx++)keys.push(`${cx},${cy}:${chunk(cx,cy).key}`);return keys.join(';')}
 const lines=(cx:number,cy:number,step:number,segment:(a:number,b:number,c:number,d:number,level:number)=>number[][]):Lines=>{
  const k=signature(cx,cy)+':'+step,hit=contours.get(k);if(hit){metrics.hits++;contours.delete(k);contours.set(k,hit);return hit}
  const out={minor:[] as number[],major:[] as number[],band:[] as number[]},interval=step===2?20:10,major=step===2?100:50
  // Sample the 1m halo once. Adjacent marching squares share almost all
  // vertices; source lookup inside every contour cell multiplies cold work.
  const field=new Float32Array(34*34),nodes=new Float64Array(33*33)
  for(let y=-1;y<=32;y++)for(let x=-1;x<=32;x++)field[(y+1)*34+x+1]=depth(cx*32+x,cy*32+y)
  for(let y=0;y<=32;y++)for(let x=0;x<=32;x++)nodes[y*33+x]=(field[y*34+x]+field[y*34+x+1]+field[(y+1)*34+x+1]+field[(y+1)*34+x])/4
  const node=(x:number,y:number)=>nodes[(y-cy*32)*33+x-cx*32]
  for(let y=0;y<32;y+=step)for(let x=0;x<32;x+=step){
   const wx=cx*32+x,wy=cy*32+y,a=node(wx,wy),b=node(wx+step,wy),c=node(wx+step,wy+step),d=node(wx,wy+step),lo=Math.min(a,b,c,d),hi=Math.max(a,b,c,d)
   if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<=0)continue
   for(const kind of ['minor','major','band']as const){
    const levels=kind==='band'?[24,90,230]:Array.from({length:Math.max(0,Math.floor(hi/interval)-Math.floor(Math.max(0,lo)/interval))},(_,i)=>(Math.floor(Math.max(0,lo)/interval)+i+1)*interval)
    for(const level of levels){if(level<=lo||level>hi||kind!=='band'&&((level%major===0)!==(kind==='major')))continue
     for(const s of segment(a,b,c,d,level))out[kind].push(x+s[0]*step,y+s[1]*step,x+s[2]*step,y+s[3]*step,level,x,y)
    }
   }
  }
  const value={minor:new Float32Array(out.minor),major:new Float32Array(out.major),band:new Float32Array(out.band)}
  metrics.builds++;contours.set(k,value);while(contours.size>LIMIT)contours.delete(contours.keys().next().value!);return value
 }
 return{depth,land,key,lines}
}
