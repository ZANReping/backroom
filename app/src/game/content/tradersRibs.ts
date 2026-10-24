import {TRADERS_ZONES,TRADERS_ROOMS,tradersCirculationReserved,tradersContains,type TradersRect} from './tradersLayout'
import type {Structure} from '../core/types'
export interface TradersRib{x:number;y:number;horizontal:boolean;span:number;id:string;post:boolean}
export function tradersRibs(bounds?:TradersRect):TradersRib[]{
 const out:TradersRib[]=[]
 for(const z of TRADERS_ZONES)if(z.kind==='street'){
  const horizontal=z.w>z.h,length=horizontal?z.w:z.h,span=horizontal?z.h:z.w
  for(let d=3;d<length-1;d+=6){
   const x=horizontal?z.x+d:z.x+z.w/2,y=horizontal?z.y+z.h/2:z.y+d
   const obstructsDoor=[-1,1].some(side=>{
    const px=x+(horizontal?0:side*(span/2-.18)),py=y+(horizontal?side*(span/2-.18):0)
    return tradersCirculationReserved({x:px-.3,y:py-.3,w:.6,h:.6})||TRADERS_ROOMS.some(r=>{
     const fx=r.side==='w'?r.x:r.side==='e'?r.x+r.w:r.x+r.w/2,fy=r.side==='n'?r.y:r.side==='s'?r.y+r.h:r.y+r.h/2
     return r.side==='n'||r.side==='s'?Math.abs(py-fy)<.75&&Math.abs(px-fx)<r.doorWidth/2+.55:Math.abs(px-fx)<.75&&Math.abs(py-fy)<r.doorWidth/2+.55
    })
   })
   if(!bounds||tradersContains(bounds,x,y))out.push({x,y,horizontal,span,post:!obstructsDoor,id:z.id+'.rib.'+d})
  }
 }
 return out
}
export function tradersArchPosts():Structure[]{
 return tradersRibs().filter(r=>r.post).flatMap(r=>[-1,1].map(side=>{
  const x=r.x+(r.horizontal?0:side*(r.span/2-.18)),y=r.y+(r.horizontal?side*(r.span/2-.18):0)
  return{kind:'trade_column' as const,x:x-.21,y:y-.21,w:.42,h:.42,solid:true,data:{tradersId:r.id+'.post.'+side,tradersArchitectural:1,height:4.8,color:'#bcb49d'}}
 }))
}

/** Sparse load-bearing columns in large flat-roof halls; doors stay on the centreline. */
export function tradersHallPosts():Structure[]{
 const out:Structure[]=[]
 for(const z of TRADERS_ZONES)if(z.id!=='public'&&['hall','bank','food','anchor'].includes(z.kind)){
  const gap=z.kind==='hall'?19:16
  for(let y=z.y+5;y<z.y+z.h-4;y+=gap)for(let x=z.x+6;x<z.x+z.w-4;x+=gap){
   if(z.kind==='hall'&&Math.abs(y-z.y-z.h/2)<3)continue
   if(tradersCirculationReserved({x:x-.36,y:y-.36,w:.72,h:.72}))continue
   out.push({kind:'trade_column',x:x-.36,y:y-.36,w:.72,h:.72,solid:true,data:{tradersId:z.id+'.support.'+out.length,tradersArchitectural:1,tradersHallPost:1,height:z.height,color:'#bfc5bd'}})
  }
 }
 return out
}
