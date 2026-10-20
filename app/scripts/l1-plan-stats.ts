import {l1PlanRegions} from '../src/game/world/l1Plan'
for(const seed of [20261006,1,777,424242]){
 const regs=l1PlanRegions(seed,-4800,-4800,4800,4800),area:Record<string,number>={};let tot=0
 const sizes=regs.map(r=>Math.sqrt((r.ix1-r.ix0)*(r.iy1-r.iy0)))
 for(const r of regs){const a=(r.ix1-r.ix0)*(r.iy1-r.iy0);area[r.section]=(area[r.section]??0)+a;tot+=a}
 const pct=Object.fromEntries(Object.entries(area).map(([k,v])=>[k,+(100*v/tot).toFixed(1)]))
 const cnt:Record<string,number>={};for(const r of regs)cnt[r.section]=(cnt[r.section]??0)+1
 sizes.sort((a,b)=>a-b)
 console.log(seed,regs.length,JSON.stringify(pct),JSON.stringify(cnt),'size p5/50/95',sizes[Math.floor(sizes.length*.05)].toFixed(0),sizes[Math.floor(sizes.length*.5)].toFixed(0),sizes[Math.floor(sizes.length*.95)].toFixed(0))
}
