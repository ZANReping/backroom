import type {L11Building} from './l11Types'
import {inPolygon,rectangle} from './l11Geometry'

/** One tenant wraps a real corner. All four front directions use the same
 * clockwise return, including shops on rotated ordinary-city lots. */
export function l11Shopfront(b:L11Building){
  if(b.architecture!=='pier-retail')return undefined
  const side=b.front,back=({e:'s',s:'w',w:'n',n:'e'} as const)[side]
  const east=side==='e'||back==='e',south=side==='s'||back==='s'
  const w=Math.min(12,b.width*.32),h=Math.min(12,b.depth*.32)
  if(w<4||h<4)return undefined
  const x=east?b.width-w:.15,y=south?b.depth-h:.15
  const ww=east?w-.15:w,hh=south?h-.15:h
  const overlap=(q:{x:number;y:number;w:number;h:number})=>x<q.x+q.w+.3&&x+ww>q.x-.3&&y<q.y+q.h+.3&&y+hh>q.y-.3
  const available=!b.sealed&&!b.stairs.some(s=>overlap({x:s.x-.8,y:s.y-.8,w:(s.axis==='x'?s.length:s.width)+1.6,h:(s.axis==='y'?s.length:s.width)+1.6}))&&!overlap({x:b.width-3.65,y:1.8,w:2.3,h:2.4})&&rectangle(x,y,ww,hh)[0].every(p=>inPolygon(...p,b.localFootprint))
  const door: [number,number]=side==='e'?[b.width,y+hh/2]:side==='w'?[0,y+hh/2]:side==='s'?[x+ww/2,b.depth]:[x+ww/2,0]
  return {side,back,east,south,x,y,w:ww,h:hh,available,door,
    corner:[east?b.width:0,south?b.depth:0] as const}
}
