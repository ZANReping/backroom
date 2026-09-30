// Level 4: rectangular office continents and void seas. Source lore:
// https://backrooms.fandom.com/zh/wiki/Level_4
// https://backrooms-wiki-cn.wikidot.com/level-4
import { RNG } from '../core/rng'
import { UNIVERSAL_ITEMS } from '../content/items'
import type { LevelDef, Structure, LightSource, ExitInstance, GroundItem } from '../core/types'
import { CS, RS, h32, GEN_ITEM_BASE, regionHost } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'
import { l4Cell, l4Origin, l4VoidCell, l4Coast, l4Biome, L4_TINT, type L4Variant } from './l4Layout'
export type { L4Variant } from './l4Layout'
export const L4_VARIANT_NAMES: Record<L4Variant,string> = {officehall:'办公间区',open:'空旷区',windowview:'窗景区',smallrooms:'小房间区'}
export const L4_VARIANT_LORE: Record<string,string[]> = {
  officehall:['灰蓝色隔板排成两列，中央过道通向黑框玻璃后的会议室。冷白荧光灯依然亮着。'],
  open:['地毯上只剩几根白色立柱。多扇浅色办公门通向另一片沉寂。'],
  windowview:['灯带在暗处勾出吊顶的边缘。完整的玻璃外，办公楼向上向下消失在雨雾中。'],
  smallrooms:['工作室、狭小办公室与走廊相连。偶尔出现的楼梯间，总会把人送回原处。'],
}
export const L4_RARE_VARIANTS: readonly string[] = ['windowview']
export const l4CorrX = (_seed:number,k:number) => l4Origin(k)
export const l4RowY = (_seed:number,r:number) => l4Origin(r)
export const l4BlockBiome = l4Biome
export function l4VariantOf(seed:number,cx:number,cy:number):L4Variant {return l4Biome(seed,l4Cell(cx*CS+16),l4Cell(cy*CS+16))}
function slot(k:number,r:number){return{x:l4Origin(k)+3,y:l4Origin(r)+10,bx:l4Origin(k)+4,by:l4Origin(r)+10}}
export const l4SpawnElevSlot=(_seed:number)=>slot(0,0)
export function l4ElevSlot(seed:number,rx:number,ry:number){
  const host=regionHost(seed,rx,ry),k0=l4Cell(host.cx*CS+16),r0=l4Cell(host.cy*CS+16)
  for(let d=0;d<=4;d++)for(let y=-d;y<=d;y++)for(let x=-d;x<=d;x++){
    const k=k0+x,r=r0+y
    if(!l4VoidCell(seed,k,r)&&!l4Coast(seed,k,r)[3])return slot(k,r)
  }
  return null
}
export function genL4ChunkRaw(def:LevelDef,seed:number,cx:number,cy:number,forceVariant?:string):GenChunk {
  const rng=new RNG(h32(seed,cx,cy,0x4a4)),WX=cx*CS,WY=cy*CS
  const tiles=new Uint8Array(CS*CS).fill(2),wet=new Uint8Array(CS*CS),elev=new Uint8Array(CS*CS),step=new Uint8Array(CS*CS),tint=new Uint8Array(CS*CS),crawl=new Uint8Array(CS*CS),outdoor=new Uint8Array(CS*CS)
  const structures:Structure[]=[],lights:LightSource[]=[],exits:ExitInstance[]=[],items:GroundItem[]=[],entities:GenChunk['entities']=[]
  const inside=(x:number,y:number)=>x>=WX&&y>=WY&&x<WX+CS&&y<WY+CS
  const idx=(x:number,y:number)=>(y-WY)*CS+x-WX
  const rect=(x0:number,y0:number,x1:number,y1:number,t=1,style?:L4Variant)=>{
    for(let y=Math.max(WY,y0);y<=Math.min(WY+CS-1,y1);y++)for(let x=Math.max(WX,x0);x<=Math.min(WX+CS-1,x1);x++){
      tiles[idx(x,y)]=t;if(style)tint[idx(x,y)]=L4_TINT[style]
    }
  }
  const add=(kind:Structure['kind'],x:number,y:number,w=1,h=1,solid=true,data:Structure['data']={})=>{
    if(!inside(x,y))return
    structures.push({kind,x,y,w,h,solid,data:{l4:1,...data,sid:h32(seed,0x4ff,Math.round(x*10),Math.round(y*10),kind.split('').reduce((s,c)=>s+c.charCodeAt(0),0))}})
  }
  const light=(x:number,y:number,style:L4Variant)=>{
    if(!inside(x,y))return
    lights.push({x:x+.5,y:y+.5,r:style==='windowview'?2:4.7,color:style==='windowview'?'#b7cfdb':'#eee9dd',intensityMul:style==='windowview'?.025:style==='open'?.12:.14,flickerSeed:h32(seed,x,y)%100,gen:1,fixZ:2.84})
  }
  const door=(x:number,y:number,axis:'x'|'y',glass=false)=>{rect(x,y,x,y);add(glass?'glassdoor':'hoteldoor',x,y,1,1,true,{open:0,axis,officeDoor:1})}
  const slots=[l4SpawnElevSlot(seed)],rx=Math.floor(cx/RS),ry=Math.floor(cy/RS)
  for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){const s=l4ElevSlot(seed,rx+a,ry+b);if(s&&!slots.some(v=>v.x===s.x&&v.y===s.y))slots.push(s)}
  for(let r=l4Cell(WY)-1;r<=l4Cell(WY+CS)+1;r++)for(let k=l4Cell(WX)-1;k<=l4Cell(WX+CS)+1;k++){
    const X=l4Origin(k),Y=l4Origin(r)
    if(X+19<WX||Y+19<WY||X>=WX+CS||Y>=WY+CS)continue
    if(l4VoidCell(seed,k,r)){
      rect(X,Y,X+19,Y+19,0)
      for(let y=Math.max(WY,Y);y<=Math.min(WY+CS-1,Y+19);y++)for(let x=Math.max(WX,X);x<=Math.min(WX+CS-1,X+19);x++)outdoor[idx(x,y)]=1
      continue
    }
    const coast=l4Coast(seed,k,r),style=(forceVariant??l4Biome(seed,k,r)) as L4Variant
    rect(X,Y,X+19,Y+19,2,style)
    rect(X,Y,X+2,Y+19,1,style);rect(X,Y,X+19,Y+1,1,style)
    let x0=X+4,y0=Y+3
    const x1=X+18,y1=Y+18
    if(style==='windowview'){if(coast[3])x0=X+1;if(coast[0])y0=Y+1}
    rect(x0,y0,x1,y1,1,style)
    if(!coast[0])door(X+10,Y+2,'x')
    if(!coast[3])door(X+3,Y+7,'y')
    if(!coast[1])door(X+19,Y+7,'y')
    if(!coast[2])door(X+10,Y+19,'x')
    const niche=slots.find(s=>s.x===X+3&&s.y===Y+10)
    if(niche){rect(X+3,Y+9,X+4,Y+11,2,style);rect(niche.x,niche.y,niche.x,niche.y);if(inside(niche.x,niche.y)){const ed=def.exits.find(e=>e.kind==='elevatorshaft');if(ed)exits.push({def:ed,x:niche.x,y:niche.y,discovered:false});add('elevdoor',niche.x,niche.y,1,1,true,{noSight:1})}}
    if(style==='officehall'){
      // Photo 1: fabric banks, central aisle and glazed conference room.
      const gy=Y+6,dx=X+11
      for(let x=x0;x<=x1;x++){rect(x,gy,x,gy);if(x!==dx)add('glasswin',x,gy,1,1,true,{partition:1,deg:0})}
      door(dx,gy,'x',true)
      add('table',X+9,Y+4,4,1,true,{meeting:1})
      for(const x of [X+8,X+10,X+12,X+14])add('officechair',x,Y+3,1,1,false,{deg:180})
      if(h32(seed,k,r,0x43)%3===0){rect(X+15,Y+3,X+15,Y+5,2,style);door(X+15,Y+4,'y',true);add('desk',X+17,Y+4,1,1,true,{deg:0})}
      for(let y=Y+8;y<=Y+16;y+=2)for(const [x,deg]of [[X+5,270],[X+13,90]]){
        add('cubicle',x,y,4,2,true,{deg});add('officechair',deg===270?x+2.4:x+.6,y+.45,1,1,false,{deg:deg===270?90:270})
      }
    }else if(style==='open'){
      for(const [x,y]of [[X+7,Y+8],[X+15,Y+13]])add('pillar',x,y,1,1,true)
      if(!coast[3])door(X+3,Y+15,'y');if(!coast[1])door(X+19,Y+15,'y')
    }else if(style==='smallrooms'){
      rect(X+10,Y+3,X+10,Y+18,2,style);rect(X+13,Y+3,X+13,Y+18,2,style)
      rect(X+4,Y+11,X+9,Y+11,2,style);rect(X+14,Y+11,X+18,Y+11,2,style)
      for(const y of [Y+7,Y+15]){door(X+10,y,'y');door(X+13,y,'y')}
      if(!coast[0]){rect(X+10,Y+2,X+10,Y+2,2,style);door(X+11,Y+2,'x')}
      if(!coast[2]){rect(X+10,Y+19,X+10,Y+19,2,style);door(X+11,Y+19,'x')}
      const loop=h32(seed,0x4ee,k,r)%100<7&&!niche
      for(const [x,y]of [[X+5,Y+4],[X+15,Y+4],[X+5,Y+13],[X+15,Y+13]]){
        if(loop&&x===X+5&&y===Y+13)continue
        const service=h32(seed,0x4c01,x,y)%10
        const detail=service<2?'pantry':service===2?'toilet':service===3?'server':service===4?'archive':service===5?'printer':null
        if(detail){
          add('l4prop',x,y-1,detail==='pantry'?3:detail==='toilet'||detail==='archive'?2:1,detail==='toilet'?2:1,true,{detail,room:detail})
          if(detail==='printer')add('l4prop',x+2,y-1,2,1,true,{detail:'archive'})
          if(detail==='server')add('l4prop',x+2,y-1,1,1,true,{detail:'server'})
          const dd=structures.find(s=>s.kind==='hoteldoor'&&s.x===(x===X+5?X+10:X+13)&&s.y===(y===Y+4?Y+7:Y+15))
          if(dd)dd.data!.room=detail
        }else{add('desk',x,y,2,1,true);add('officechair',x+.5,y+1.2,1,1,false,{deg:0});add('cabinet',x+2,y,1,1,true,{loot:1})}
      }
      if(loop){const sx=X+5,sy=Y+12;add('l4stairs',sx,sy,4,6,true,{loop:1});for(let y=sy+1;y<=sy+5;y++)for(let x=sx+2;x<=sx+3;x++)if(inside(x,y))elev[idx(x,y)]=4}
      if(h32(seed,0x46,k,r)%1000<15){const e=def.exits.find(e=>e.kind==='trapdoor');if(e&&inside(X+17,Y+17))exits.push({def:e,x:X+17,y:Y+17,discovered:false})}
    }
    // Building services are attached to walls/ceiling, leaving circulation clear.
    for(const x of [X+7,X+15])for(const y of [Y+6,Y+15]){
      if(style==='smallrooms'&&x===X+7&&y===Y+15)continue // rare stair shaft
      add('l4prop',x,y,1,1,false,{detail:'services'})
    }
    if(!coast[0])add('l4prop',X+9,Y+3,1,1,false,{detail:'wallkit',deg:0,wallOffset:1})
    // Blank charts and diagram boards sit flush against real wall faces.
    if(!coast[0])add('l4prop',X+15,Y+1,1,1,false,{detail:'wallDecor',deg:180,wallOffset:1})
    if(!coast[3])add('l4prop',X+2,Y+13,1,1,false,{detail:'wallDecor',deg:270,wallOffset:1})
    if(style==='smallrooms')add('l4prop',X+11,Y+10,1,1,false,{detail:'wallDecor',deg:90,wallOffset:1})
    if(style==='officehall')add('l4prop',X+17,Y+16,1,1,true,{detail:'printer'})
    // Complete enclosing facade, with windows in both ordinary and view wings.
    for(let d=0;d<4;d++)if(coast[d])for(let t=0;t<20;t++){
      const x=d===1?X+19:d===3?X:X+t,y=d===0?Y:d===2?Y+19:Y+t
      rect(x,y,x,y,2,style)
      if(!(t>=4&&t<=17&&(style==='windowview'||t%5<2)))continue
      rect(x,y,x,y,1,style)
      if(d===0)rect(x,Y+1,x,Y+3,1,style)
      if(d===3)rect(X+1,y,X+4,y,1,style)
      const kind=style==='windowview'?'glasswin':h32(seed,0x4bad,k,r,d,Math.floor(t/5))%100<12?'windowtrap':'windowblack'
      const start=style==='windowview'?t===4:t%5===0,end=style==='windowview'?t===17:t%5===1
      add(kind,x,y,1,1,true,{deg:[180,90,0,270][d],rain:1,coast:1,mullion:t%2===0?1:0,revealLeft:(d<2?end:start)?1:0,revealRight:(d<2?start:end)?1:0,windowId:`${k}:${r}:${d}:${Math.floor(t/5)}`})
    }
    for(let y=Y+4;y<=Y+18;y+=3)for(let x=X+5;x<=X+18;x+=4)light(x,y,style)
    if(!coast[3])for(let y=Y+4;y<Y+20;y+=6)light(X+1,y,'smallrooms')
    if(!coast[0])for(let x=X+5;x<X+20;x+=6)light(x,Y,'smallrooms')
    if(style!=='windowview'&&h32(seed,0x4abc,k,r)%100<22)add('vending',X+1,Y+5,1,1,true,{trade:1})
    if(h32(seed,0x4bcd,k,r)%1000<12)add('landmark',X+2,Y+12,1,1,false,{outpost:'omega',poster:1,tex:'omega_poster.png'})
    // Rare old stair exits coexist with the looping modern stairwells.
    if(style==='open'&&h32(seed,0x405,k,r)%160===0){
      const e=def.exits.find(e=>e.kind==='oldstairs'),sx=X+6,sy=Y+17
      if(e&&inside(sx,sy))exits.push({def:e,x:sx,y:sy,discovered:false})
      // Fixed north-facing flight: keep the entry landing clear, no orientation-dummy wall.
      for(let n=1;n<=3;n++){if(inside(sx,sy-n))elev[idx(sx,sy-n)]=4;add('stairrail',sx,sy-n,1,1,true,{deg:0,end:n===3?1:0})}
    }
  }
  const floor=(x:number,y:number)=>inside(Math.floor(x),Math.floor(y))&&tiles[idx(Math.floor(x),Math.floor(y))]===1&&!outdoor[idx(Math.floor(x),Math.floor(y))]
  for(let i=lights.length-1;i>=0;i--)if(!floor(lights[i].x,lights[i].y)||structures.some(s=>s.kind==='l4stairs'&&lights[i].x>=s.x&&lights[i].x<s.x+s.w&&lights[i].y>=s.y&&lights[i].y<s.y+s.h))lights.splice(i,1)
  const occupied=(x:number,y:number)=>structures.some(s=>s.solid&&x>=s.x-1&&x<s.x+s.w+1&&y>=s.y-1&&y<s.y+s.h+1)
  const pool=[...def.items,...UNIVERSAL_ITEMS]
  for(let n=0;n<3;n++)for(let t=0;t<40;t++){
    const x=WX+rng.int(1,CS-2),y=WY+rng.int(1,CS-2)
    if(!floor(x,y)||occupied(x,y)||elev[idx(x,y)]===4)continue
    items.push({id:GEN_ITEM_BASE+((cx&255)<<12)+((cy&255)<<4)+n,type:rng.weighted(pool.map(p=>({v:p.type,w:p.w}))),x:x+.5,y:y+.5});break
  }
  if((Math.abs(cx)>1||Math.abs(cy)>1)&&rng.chance(.012)&&def.entities.length)for(let t=0;t<40;t++){
    const x=WX+rng.int(2,CS-3),y=WY+rng.int(2,CS-3)
    if(!floor(x,y)||occupied(x,y))continue
    entities.push({type:rng.weighted(def.entities.map(e=>({v:e.type,w:e.w}))),x:x+.5,y:y+.5});break
  }
  return{variant:forceVariant??l4VariantOf(seed,cx,cy),tiles,wet,elev,step,tint,crawl,outdoor,structures,lights,exits,items,entities}
}
registerInfiniteLevel(4,{genRaw:genL4ChunkRaw,variantOf:l4VariantOf,rareVariants:L4_RARE_VARIANTS,variantNames:L4_VARIANT_NAMES,variantLore:L4_VARIANT_LORE})
