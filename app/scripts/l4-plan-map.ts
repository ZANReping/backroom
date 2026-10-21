// Dump a Level 4 v2 area as JSON for the top-view sheet (python ui/l4v2/map.py).
import {writeFileSync} from 'node:fs'
import {genL4ChunkRaw} from '../src/game/world/infiniteL4'
import {L4} from '../src/game/levels/l4'
import {CS} from '../src/game/world/infinite'
const seed=Number(process.argv[2]??424242),R=Number(process.argv[3]??4),out=process.argv[4]??'.cache/l4map.json'
const N=(2*R+1)*CS,tiles:number[]=new Array(N*N).fill(0),tint:number[]=new Array(N*N).fill(0),structs:any[]=[],exits:any[]=[]
for(let cy=-R;cy<=R;cy++)for(let cx=-R;cx<=R;cx++){
  const c=genL4ChunkRaw(L4,seed,cx,cy)
  for(let y=0;y<CS;y++)for(let x=0;x<CS;x++){const gx=(cx+R)*CS+x,gy=(cy+R)*CS+y;tiles[gy*N+gx]=c.tiles[y*CS+x];tint[gy*N+gx]=c.tint[y*CS+x]}
  for(const s of c.structures)structs.push({k:s.kind,x:s.x+R*CS,y:s.y+R*CS,w:s.w,h:s.h,f:s.data?.l4Facade?1:0})
  for(const e of c.exits)exits.push({k:e.def.kind,x:e.x+R*CS,y:e.y+R*CS})
}
writeFileSync(out,JSON.stringify({N,tiles,tint,structs,exits,spawn:[15+R*CS,15+R*CS]}))
console.log(out,N)
