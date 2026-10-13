import assert from 'node:assert/strict'
import {writeFileSync,mkdirSync} from 'node:fs'
import {buildL1Data} from '../src/game/world/l1Building'
import {bakeL1,layoutL1BakeCharts} from '../src/game/world/l1Bake'
import {L1_PHOTO_ANCHORS} from '../src/game/world/l1Spatial'
const records=[]
const half=(v:number)=>{const e=(v>>10)&31,m=v&1023;return e===0?m*2**-24:(1+m/1024)*2**(e-15)}
for(const id of ['gothic','parking-round'])for(const quality of ['low','high'] as const){
 const a=L1_PHOTO_ANCHORS.find(a=>a.id===id)!,data=buildL1Data(20261006,Math.floor(a.centerX/32),0)
 const layout=layoutL1BakeCharts(data,quality),smooth=layout.faces.filter(f=>f.smooth)
 assert(smooth.length>0);assert(smooth.every(f=>f.w>=2),'round charts must retain both angular boundary samples')
 const bake=bakeL1(data.seed,data.cx,data.cy,quality),values=new Map<string,number[]>()
 let shared=0,maxDifference=0
 for(const f of smooth)for(const side of [0,1]){
  const p=f.p[side===0?0:1],key=p.map(v=>v.toFixed(5)).join(','),index=(f.y*bake.size+f.x+side*(f.w-1))*4
  const rgb=Array.from(bake.irradiance.slice(index,index+3),half),prior=values.get(key)
  if(prior){shared++;for(let j=0;j<3;j++)maxDifference=Math.max(maxDifference,Math.abs(prior[j]-rgb[j]))}else values.set(key,rgb)
 }
 assert(shared>0);assert(maxDifference<.005,`adjacent round charts disagree: ${id} ${quality} ${maxDifference}`)
 records.push({id,quality,charts:smooth.length,shared,maxDifference})
}
mkdirSync('reports/l1-remake/iteration-9',{recursive:true});writeFileSync('reports/l1-remake/iteration-9/round-lighting.json',JSON.stringify({passed:true,records},null,2)+'\n')
console.log(JSON.stringify({passed:true,records}))
