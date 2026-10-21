// Level 4 v2 E2b: continuous office blocks, service cores and false rain windows.
// https://backrooms.fandom.com/zh/wiki/Level_4
// https://backrooms-wiki-cn.wikidot.com/level-4
import { RNG } from '../core/rng'
import { UNIVERSAL_ITEMS } from '../content/items'
import type { LevelDef, Structure, LightSource, ExitInstance, GroundItem } from '../core/types'
import { CS, RS, h32, GEN_ITEM_BASE, regionHost } from './infinite'
import { registerInfiniteLevel, type GenChunk } from './infiniteRegistry'
import { L4_TINT, type L4Variant } from './l4Layout'
import { l4Block, l4BlockIndex, l4BlockType, type L4BlockType } from './l4Plan'
export type { L4Variant } from './l4Layout'
export const L4_VARIANT_NAMES: Record<L4Variant,string> = {officehall:'办公间区',open:'空旷区',smallrooms:'小房间区',hall:'空旷大厅'}
export const L4_VARIANT_LORE: Record<string,string[]> = {
  officehall:['灰蓝色隔板排成两列，中央过道通向黑框玻璃后的会议室。'],
  open:['地毯上只剩几根白色立柱。几扇浅色的门通向更小的房间。'],
  smallrooms:['工作室、狭小的办公室与走廊相连。楼梯间总会把人送回原处。'],
  hall:['空荡荡的大厅，地毯上的凹痕说明这里曾经摆满家具。嵌在吊顶中的荧光灯照着空地。'],
}
export const L4_RARE_VARIANTS: readonly string[] = []
const TYPE_VARIANT:Record<L4BlockType,L4Variant>={hall:'hall',cubicle:'officehall',open:'open',rooms:'smallrooms'}
export function l4VariantOf(seed:number,cx:number,cy:number):L4Variant {const {i,j}=l4BlockIndex(seed,cx*CS+16,cy*CS+16);return TYPE_VARIANT[l4BlockType(seed,i,j)]}
export const l4SpawnElevSlot=(seed:number)=>l4Block(seed,0,0).elevSlot
export const L4_SPAWN={x:15,y:15}
export function l4ElevSlot(seed:number,rx:number,ry:number){
  const host=regionHost(seed,rx,ry),{i,j}=l4BlockIndex(seed,host.cx*CS+16,host.cy*CS+16)
  return l4Block(seed,i,j).elevSlot
}
export function genL4ChunkRaw(def:LevelDef,seed:number,cx:number,cy:number,forceVariant?:string):GenChunk {
  const rng=new RNG(h32(seed,cx,cy,0x4a4)),WX=cx*CS,WY=cy*CS
  const tiles=new Uint8Array(CS*CS).fill(2),wet=new Uint8Array(CS*CS),elev=new Uint8Array(CS*CS),step=new Uint8Array(CS*CS),tint=new Uint8Array(CS*CS),crawl=new Uint8Array(CS*CS),outdoor=new Uint8Array(CS*CS)
  const structures:Structure[]=[],lights:LightSource[]=[],exits:ExitInstance[]=[],items:GroundItem[]=[],entities:GenChunk['entities']=[]
  const inside=(x:number,y:number)=>x>=WX&&y>=WY&&x<WX+CS&&y<WY+CS
  const idx=(x:number,y:number)=>(y-WY)*CS+x-WX
  const slots=[l4SpawnElevSlot(seed)],rx=Math.floor(cx/RS),ry=Math.floor(cy/RS)
  for(let b=-1;b<=1;b++)for(let a=-1;a<=1;a++){const s=l4ElevSlot(seed,rx+a,ry+b);if(!slots.some(v=>v.x===s.x&&v.y===s.y))slots.push(s)}
  // every block whose rectangle overlaps this chunk
  const blocks=new Map<string,ReturnType<typeof l4Block>>()
  for(let y=WY;y<WY+CS;y+=8)for(let x=WX;x<WX+CS;x+=8)for(const [xx,yy] of [[x,y],[x+7,y],[x,y+7],[x+7,y+7]]){const {i,j}=l4BlockIndex(seed,xx,yy);blocks.set(`${i},${j}`,l4Block(seed,i,j))}
  for(const blk of blocks.values()){
    const style0=forceVariant&&forceVariant in L4_TINT?forceVariant as L4Variant:undefined
    for(const op of blk.ops){
      if(op.o==='rect'){
        for(let y=Math.max(WY,op.y0);y<=Math.min(WY+CS-1,op.y1);y++)for(let x=Math.max(WX,op.x0);x<=Math.min(WX+CS-1,op.x1);x++){tiles[idx(x,y)]=op.t;if(op.style)tint[idx(x,y)]=L4_TINT[style0??op.style]}
      }else if(op.o==='add'){
        if(!inside(op.x,op.y))continue
        structures.push({kind:op.kind,x:op.x,y:op.y,w:op.w,h:op.h,solid:op.solid,data:{l4:1,...op.data,sid:h32(seed,0x4ff,Math.round(op.x*10),Math.round(op.y*10),(op.kind+String(op.data?.detail??'')).split('').reduce((s,c)=>s*31+c.charCodeAt(0)|0,0))}})
      }else if(op.o==='light'){
        if(!inside(op.x,op.y))continue
        const st=style0??op.style
        lights.push({x:op.x+.5,y:op.y+.5,r:4.7,color:'#eee9dd',intensityMul:st==='open'||st==='hall'?.12:.14,flickerSeed:h32(seed,op.x,op.y)%100,gen:1,fixZ:2.84,on:op.on})
      }else if(op.o==='elev'){
        for(let y=op.y+1;y<=op.y+5;y++)for(let x=op.x+2;x<=op.x+3;x++)if(inside(x,y))elev[idx(x,y)]=4
      }else if(op.o==='exit'){
        const e=def.exits.find(e=>e.kind===op.kind);if(!e)continue
        if(inside(op.x,op.y))exits.push({def:e,x:op.x,y:op.y,discovered:false,l4:{yaw:0}})
        if(op.kind==='oldstairs')for(let n=1;n<=3;n++)if(inside(op.x,op.y-n)){tiles[idx(op.x,op.y-n)]=1;elev[idx(op.x,op.y-n)]=4;structures.push({kind:'stairrail',x:op.x,y:op.y-n,w:1,h:1,solid:true,data:{l4:1,deg:0,end:n===3?1:0,sid:h32(seed,0x4fe,op.x,op.y-n)}})}
      }
    }
    const sl=blk.elevSlot
    if(slots.some(s=>s.x===sl.x&&s.y===sl.y)){
      // A three-metre opening in the real west wall, with a closed shaft behind it.
      for(let y=sl.y-1;y<=sl.y+1;y++)for(const x of [sl.x,sl.bx])if(inside(x,y)){tiles[idx(x,y)]=x===sl.x?1:2;tint[idx(x,y)]=L4_TINT[blk.type==='hall'?'hall':blk.type==='open'?'open':blk.type==='rooms'?'smallrooms':'officehall']}
      if(inside(sl.x,sl.y)){
        const ed=def.exits.find(e=>e.kind==='elevatorshaft');if(ed)exits.push({def:ed,x:sl.x,y:sl.y,discovered:false,l4:{yaw:Math.PI/2}})
      }
      if(inside(sl.x,sl.y-1)){
        structures.push({kind:'elevdoor',x:sl.x,y:sl.y-1,w:1,h:3,solid:true,data:{l4:1,noSight:1,sid:h32(seed,0x4fd,sl.x,sl.y)}})
      }
    }
  }
  const floor=(x:number,y:number)=>inside(Math.floor(x),Math.floor(y))&&tiles[idx(Math.floor(x),Math.floor(y))]===1
  for(let i=lights.length-1;i>=0;i--)if(!floor(lights[i].x,lights[i].y)||structures.some(s=>(s.kind==='l4stairs'||s.solid&&s.kind!=='l4prop')&&lights[i].x>=s.x&&lights[i].x<s.x+s.w&&lights[i].y>=s.y&&lights[i].y<s.y+s.h))lights.splice(i,1)
  const occupied=(x:number,y:number)=>structures.some(s=>s.solid&&x>=s.x-1&&x<s.x+s.w+1&&y>=s.y-1&&y<s.y+s.h+1)
  const pool=[...def.items,...UNIVERSAL_ITEMS]
  for(let n=0;n<3;n++)for(let t=0;t<40;t++){
    const x=WX+rng.int(1,CS-2),y=WY+rng.int(1,CS-2)
    if(!floor(x,y)||occupied(x,y)||elev[idx(x,y)]===4)continue
    items.push({id:GEN_ITEM_BASE+((cx&255)<<12)+((cy&255)<<4)+n,type:rng.weighted(pool.map(p=>({v:p.type,w:p.w}))),x:x+.5,y:y+.5});break
  }
  // v2: hounds and dullers remain, very rare
  if((Math.abs(cx)>1||Math.abs(cy)>1)&&rng.chance(.008)&&def.entities.length)for(let t=0;t<40;t++){
    const x=WX+rng.int(2,CS-3),y=WY+rng.int(2,CS-3)
    if(!floor(x,y)||occupied(x,y))continue
    entities.push({type:rng.weighted(def.entities.map(e=>({v:e.type,w:e.w}))),x:x+.5,y:y+.5});break
  }
  return{variant:forceVariant&&forceVariant in L4_TINT?forceVariant:l4VariantOf(seed,cx,cy),tiles,wet,elev,step,tint,crawl,outdoor,structures,lights,exits,items,entities}
}
registerInfiniteLevel(4,{genRaw:genL4ChunkRaw,variantOf:l4VariantOf,rareVariants:L4_RARE_VARIANTS,variantNames:L4_VARIANT_NAMES,variantLore:L4_VARIANT_LORE,spawnWorld:L4_SPAWN})
