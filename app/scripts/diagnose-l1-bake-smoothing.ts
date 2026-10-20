import {writeFileSync,mkdirSync} from 'node:fs'
import {performance} from 'node:perf_hooks'
import {bakeL1,layoutL1BakeCharts} from '../src/game/world/l1Bake'
import {buildL1Data,l1ModuleAt} from '../src/game/world/l1Building'
import {l1FindReference} from '../src/game/world/l1Spatial'
import {L1_BAKE_REVISION} from '../src/game/world/l1BakeTypes'

const seed=20261006,output=process.argv.includes('--before')?'before':'after',cases:any[]=[]
for(const name of ['parking-common','parking-round','parking-dim','storage','gothic','ouroboros','garden']){
 const ref=l1FindReference(seed,name,2400)!,cx=Math.floor(ref.centerX/32),cy=Math.floor(ref.centerY/32),a=buildL1Data(seed,cx,cy),start=performance.now(),layout=layoutL1BakeCharts(a,'high')
 const b=bakeL1(seed,cx,cy,'high')
 const columns=a.boxes.filter(b=>b.solid&&b.id.startsWith('column:'))
 const column=columns.sort((a,b)=>Math.hypot((a.min[0]+a.max[0])/2-ref.x,(a.min[2]+a.max[2])/2-ref.y)-Math.hypot((b.min[0]+b.max[0])/2-ref.x,(b.min[2]+b.max[2])/2-ref.y))[0]
 const rects=layout.faces.filter(f=>f.surface==='floor'||f.surface==='ground')
 const row={name,ref,cx,cy,column,profile:l1ModuleAt(seed,ref.x,ref.y),layout:{size:layout.size,density:layout.density,faces:layout.faces.length,minFloorWidth:Math.min(...rects.map(f=>f.w)),maxFloorWidth:Math.max(...rects.map(f=>f.w))},elapsedMs:performance.now()-start,metrics:b.metrics}
 cases.push(row);console.log(JSON.stringify(row))
}
mkdirSync('reports/l1-bake-smoothing',{recursive:true});writeFileSync(`reports/l1-bake-smoothing/${output}-diagnostic.json`,JSON.stringify({seed,bakeRevision:L1_BAKE_REVISION,cases},null,2))
