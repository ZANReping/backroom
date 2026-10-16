import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { L0 } from '../src/game/levels/l0'
import { L1 } from '../src/game/levels/l1'
import { L11 } from '../src/game/levels/l11'
import { generateInfinite, h32, infiniteImplFor, updateInfinite } from '../src/game/world/infinite'
import type { GameMap } from '../src/game/world/mapgen'
import '../src/game/world/mapgen'
import { devTeleportPreparation } from '../src/game/world/devTeleportPreparation'
import { genL0Architecture } from '../src/game/world/l0Architecture'
import { genL11ChunkRaw } from '../src/game/world/l11Raw'
import type { GenChunk } from '../src/game/world/infiniteRegistry'

const seed=20261006,target={x:-1008,y:752},fields=['tiles','wet','elev','step','tint','crawl','outdoor','ceiling','liquid','dn','dnWall','up','upWall','up2','upWall2','stair','terrain','caveCeil','seaFloor'] as const
const reportFile='reports/dev-teleport-performance/preparation-check.jsonl';mkdirSync('reports/dev-teleport-performance',{recursive:true});writeFileSync(reportFile,'')
const defs=[L0,L1,L11]
const typed=(v:unknown)=>ArrayBuffer.isView(v)?Array.from(v as ArrayLike<number>):v
const plain=(v:unknown):unknown=>Array.isArray(v)?v.map(plain):v&&typeof v==='object'&&!ArrayBuffer.isView(v)?Object.fromEntries(Object.entries(v as Record<string,unknown>).map(([k,x])=>[k,plain(x)])):typed(v)
const structure=(s:unknown)=>JSON.stringify(plain(s))
const snap=(m:GameMap)=>{const inf=m.inf!;return {w:m.w,h:m.h,arrays:Object.fromEntries(['tiles','wet','elev','step','tint','crawl','outdoor','ceiling','liquid','dn','dnWall','up','upWall','up2','upWall2','stair','terrain','caveCeil','seaFloor'].map(k=>[k,typed((m as unknown as Record<string,unknown>)[k])])),structures:m.structures.map(structure),exits:m.exits.map(structure),ox:inf.ox,oy:inf.oy,keys:[...inf.chunks.keys()].sort(),chunks:[...inf.chunks.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,c])=>({key,arrays:Object.fromEntries(fields.map(f=>[f,typed((c as unknown as Record<string,unknown>)[f])])),structures:c.structures.map(structure),exits:c.exits.map(structure)}))}}
const same=(a:unknown,b:unknown)=>assert.deepEqual(a,b)
function prepare(def:typeof L0|typeof L1|typeof L11,base:GameMap){
  const inf=base.inf!,cx=Math.floor((target.x+.5)/32),cy=Math.floor((target.y+.5)/32),key=`${cx},${cy}`
  const exit={x:target.x,y:target.y,def:def.exits[0]!,discovered:false}
  const q=devTeleportPreparation(base,def,exit,400),raw=new Map<string,GenChunk>()
  for(const c of q.chunks){const k=`${c.cx},${c.cy}`,r=def.id===0?genL0Architecture(def,seed,c.cx,c.cy,undefined,c.revision,base.inf?.l0?.redProgress):def.id===11?genL11ChunkRaw(def,seed,c.cx,c.cy,undefined,c.revision):infiniteImplFor(def.id).genRaw(def,seed,c.cx,c.cy);raw.set(k,r)}
  return {q,raw}
}
for(const def of defs){
  const initial=generateInfinite(def,seed,false)
  if(def.id===11){const inf=initial.inf!,cx=Math.floor((target.x+.5)/32),cy=Math.floor((target.y+.5)/32),key=`${cx},${cy}`;inf.cityClock=400;inf.cityRevisions??={};inf.cityUnloaded??={};let last=0;while(h32(seed,cx,cy,inf.cityRevisions[key]??0,Math.floor(last))%100>=12)last++;inf.cityUnloaded[key]=last}
  const sync=structuredClone(initial),prepared=structuredClone(initial),before=snap(prepared)
  const p=prepare(def,prepared),localX=target.x-prepared.inf!.ox,localY=target.y-prepared.inf!.oy
  updateInfinite(sync,def,target.x-sync.inf!.ox,target.y-sync.inf!.oy)
  updateInfinite(prepared,def,localX,localY,undefined,p.raw)
  if(def.id===11){const key=`${Math.floor((target.x+.5)/32)},${Math.floor((target.y+.5)/32)}`;assert.equal(prepared.inf!.cityRevisions?.[key],1);assert.deepEqual(sync.inf!.cityRevisions,prepared.inf!.cityRevisions)}
  same(snap(sync),snap(prepared))
  const incomplete=structuredClone(initial),iq=prepare(def,incomplete),missing=iq.raw.keys().next().value!
  iq.raw.delete(missing);const old=snap(incomplete);assert.throws(()=>updateInfinite(incomplete,def,target.x-incomplete.inf!.ox,target.y-incomplete.inf!.oy,undefined,iq.raw));same(old,snap(incomplete))
  const result={level:def.id,name:def.name,ok:true,target,preparedChunks:p.raw.size,window:{ox:prepared.inf!.ox,oy:prepared.inf!.oy,chunks:prepared.inf!.chunks.size},incompleteRejected:true,initial:{ox:before.ox,oy:before.oy}};console.log(JSON.stringify(result));appendFileSync(reportFile,JSON.stringify(result)+'\n')
}
