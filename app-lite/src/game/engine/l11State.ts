import type { Engine } from '../engine'
import type { ChunkDynState, InfiniteState } from '../world/infinite'
import { l11Anchors } from '../world/l11Layout'
import { genL11ChunkRaw } from '../world/l11Raw'
import { L11 } from '../levels/l11'
export function l11MapMarks(eng:Engine) {
  if(eng.player.level!==11||!eng.map?.inf)return []
  const anchors=l11Anchors(eng.map.inf.seed),labels={capital:'首都',timesquare:'新时代广场',beta:'M.E.G. Beta'}
  return (['capital','timesquare','beta'] as const).filter(k=>eng.l11World?.marks.includes(k)).map(k=>({...anchors[k],name:labels[k]}))
}
export interface L11WorldSave {
  version:1; seed:number
  chunks:[string,ChunkDynState][]
  explored:[string,number[]][]
  taken:number[]
  revisions:Record<string,number>
  unloaded:Record<string,number>
  marks:string[]
  containers?: InfiniteState['cityContainers']
}
export function captureL11(eng:Engine):L11WorldSave|undefined {
  const inf=eng.map?.inf
  if(eng.player.level!==11||!inf)return eng.l11World
  const state=new Map(inf.state)
  for(const c of inf.chunks.values()){
    const belongs=(p:{x:number;y:number})=>Math.floor((p.x+inf.ox)/32)===c.cx&&Math.floor((p.y+inf.oy)/32)===c.cy
    for(const s of c.structures)if(typeof s.data?.sid==='number'&&Array.isArray(s.data.lootItems)&&(s.looted||s.data.searched||s.data.opened)){
      (inf.cityContainers??={})[`${c.key}:${s.data.sid}`]={items:[...s.data.lootItems],looted:s.looted,searched:!!s.data.searched}
    }
    state.set(c.key,{
    structs:c.structures.filter(s=>typeof s.data?.sid==='number').map(s=>({sid:Number(s.data!.sid),looted:s.looted,data:s.data?{...s.data}:undefined})),
    // Live map lists include drops placed since the last window shift; chunk lists can be stale.
    extraItems:eng.map!.items.filter(i=>i.id<0x200000&&belongs(i)&&!inf.taken.has(i.id)).map(i=>({...i,x:i.x+inf.ox,y:i.y+inf.oy})),
    extraLights:eng.map!.lights.filter(l=>!l.gen&&belongs(l)).map(l=>({...l,x:l.x+inf.ox,y:l.y+inf.oy})),exitDisc:c.exits.some(e=>e.discovered),
  })}
  const explored=new Map(inf.explored)
  for(const c of inf.chunks.values()){
    const bits=new Uint8Array(1024),x0=c.cx*32-inf.ox,y0=c.cy*32-inf.oy
    for(let y=0;y<32;y++)for(let x=0;x<32;x++)bits[y*32+x]=eng.explored[(y+y0)*eng.map!.w+x+x0]??0
    explored.set(c.key,bits)
  }
  return {version:1,seed:inf.seed,chunks:[...state].slice(-600),explored:[...explored].slice(-600).map(([k,v])=>[k,Array.from(v)]),taken:[...inf.taken],revisions:{...inf.cityRevisions},unloaded:{...inf.cityUnloaded},containers:structuredClone(inf.cityContainers??{}),marks:eng.l11World?.marks??[]}
}
export function restoreL11(eng:Engine) {
  const inf=eng.map?.inf,saved=eng.l11World
  if(!inf||!saved||saved.seed!==inf.seed)return
  inf.state=new Map(saved.chunks??[]);inf.taken=new Set(saved.taken??[])
  inf.explored=new Map((saved.explored??[]).map(([k,v])=>[k,new Uint8Array(v)]))
  inf.cityRevisions={...saved.revisions};inf.cityUnloaded={...saved.unloaded}
  inf.cityContainers=structuredClone(saved.containers??{})
  for(const c of inf.chunks.values()){
    const st=inf.state.get(c.key)
    const revision=inf.cityRevisions[c.key]??0
    const visual=revision?genL11ChunkRaw(L11,inf.seed,c.cx,c.cy,undefined,revision).structures:[]
    for(const s of c.structures){
      const q=st?.structs.find(q=>q.sid===s.data?.sid)
      if(q){const dynamic={...q.data};delete dynamic.color;delete dynamic.style;delete dynamic.revision;s.looted=q.looted;s.data={...s.data,...dynamic};if(s.kind==='hoteldoor')s.solid=!s.data.open}
      const inventory=inf.cityContainers[`${c.key}:${s.data?.sid}`]
      if(inventory){s.looted=inventory.looted;s.data={...s.data,lootItems:[...inventory.items],searched:inventory.searched?1:0}}
      const v=visual.find(v=>v.kind===s.kind&&v.x===s.x+inf.ox&&v.y===s.y+inf.oy)
      if(v)for(const k of ['style','color','revision'])if(v.data?.[k]!==undefined)(s.data??={})[k]=v.data[k]
    }
    for(const item of st?.extraItems??[])if(!c.items.some(i=>i.id===item.id)&&!inf.taken.has(item.id)){const live={...item,x:item.x-inf.ox,y:item.y-inf.oy};c.items.push(live);eng.map!.items.push(live)}
    for(const light of st?.extraLights??[]){
      const x=light.x-inf.ox,y=light.y-inf.oy
      if(!c.lights.some(l=>!l.gen&&l.x===x&&l.y===y&&l.z===light.z&&l.color===light.color)){
        const live={...light,x,y};c.lights.push(live);eng.map!.lights.push(live)
      }
    }
    for(const e of c.exits)e.discovered=st?.exitDisc??false
    const bits=inf.explored.get(c.key),x0=c.cx*32-inf.ox,y0=c.cy*32-inf.oy
    if(bits)for(let y=0;y<32;y++)for(let x=0;x<32;x++)eng.explored[(y+y0)*eng.map!.w+x+x0]=bits[y*32+x]
  }
  eng.map!.items=eng.map!.items.filter(i=>!inf.taken.has(i.id))
}
