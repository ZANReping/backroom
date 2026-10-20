// Top-down raster of the L1 v2 plan: node .cache/l1-plan-map.mjs <seed> <x0> <y0> <size> <out.ppm>
import {writeFileSync} from 'node:fs'
import {l1PlanTile,l1PlanDoors,l1PlanRegions} from '../src/game/world/l1Plan'
const [seed,x0,y0,size]=process.argv.slice(2,6).map(Number),out=process.argv[6]
const COL:Record<string,[number,number,number]>={parking:[128,132,136],storage:[200,174,108],gothic:[156,122,104],garden:[96,152,84],ouroboros:[184,118,64],fabled:[150,56,60],maintenance:[226,226,220]}
const buf=Buffer.alloc(size*size*3)
const stats:Record<string,number>={}
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
 const t=l1PlanTile(seed,x0+x,y0+y),i=(y*size+x)*3
 let c:[number,number,number]
 if(!t.floor)c=t.wallOf?[30,30,32]:[52,52,56]
 else if(t.door)c=[40,230,90]
 else {c=COL[t.style];if(t.room)c=[255,236,180]}
 stats[t.floor?t.style:'wall']=(stats[t.floor?t.style:'wall']??0)+1
 buf[i]=c[0];buf[i+1]=c[1];buf[i+2]=c[2]
}
writeFileSync(out,Buffer.concat([Buffer.from(`P6 ${size} ${size} 255\n`),buf]))
const regs=l1PlanRegions(seed,x0,y0,x0+size,y0+size)
const area:Record<string,number>={};for(const r of regs)area[r.section]=(area[r.section]??0)+(r.ix1-r.ix0)*(r.iy1-r.iy0)
console.log(JSON.stringify({stats,regions:regs.length,doors:l1PlanDoors(seed,x0,y0,x0+size,y0+size).length,area,labels:regs.map(r=>({s:r.section,x:(r.ix0+r.ix1)/2-x0,y:(r.iy0+r.iy1)/2-y0,w:r.ix1-r.ix0,h:r.iy1-r.iy0}))}))
