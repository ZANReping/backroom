import assert from 'node:assert/strict'
import {readFileSync,writeFileSync} from 'node:fs'
import {createCanvas,loadImage} from '@napi-rs/canvas'
const sameScene=process.argv.includes('--same-scene')
const root='reports/l1-remake/iteration-9',ids=['parking-round','gothic','crate']
const pixels=img=>{const c=createCanvas(img.width,img.height),g=c.getContext('2d');g.drawImage(img,0,0);return g.getImageData(0,0,img.width,img.height).data}
const compare=async(id,aPath,bPath)=>{
 const a=await loadImage(aPath),b=await loadImage(bPath)
 assert.equal(a.width,b.width);assert.equal(a.height,b.height)
 const x=pixels(a),y=pixels(b);let sum=0,max=0,changed=0
 const bounds=[a.width,a.height,-1,-1]
 for(let i=0;i<x.length;i+=4){let delta=0;for(let j=0;j<3;j++){const d=Math.abs(x[i+j]-y[i+j]);sum+=d;max=Math.max(max,d);delta=Math.max(delta,d)}if(delta>3){changed++;const px=i/4%a.width,py=Math.floor(i/4/a.width);bounds[0]=Math.min(bounds[0],px);bounds[1]=Math.min(bounds[1],py);bounds[2]=Math.max(bounds[2],px);bounds[3]=Math.max(bounds[3],py)}}
 const mean=sum/(x.length/4*3),changedPercent=changed/(x.length/4)*100
 return {id,width:a.width,height:a.height,meanChannelDifference:mean,maxChannelDifference:max,pixelsAbove3Percent:changedPercent,changedBounds:changed?bounds:null,passed:mean<.1&&changedPercent<.05}
}
if(sameScene){
 const entries=JSON.parse(readFileSync(root+'/shader-ab/shader-ab.json','utf8')),rows=[]
 for(const entry of entries){
  assert.deepEqual(entry.before,entry.after,'scene state must be identical')
  rows.push(await compare(entry.id,`${root}/shader-ab/shader-baseline/${entry.id}.png`,`${root}/shader-ab/shader-optimized/${entry.id}.png`))
 }
 writeFileSync(root+'/shader-ab-output-compare.json',JSON.stringify({passed:rows.every(r=>r.passed),method:'Two shader variants in the same browser and same scene; items were not regenerated; no image registration.',rows},null,2)+'\n')
 assert(rows.every(r=>r.passed),'shader image changed beyond the rounding tolerance; inspect saved results')
 console.log(JSON.stringify(rows))
 process.exit(0)
}
const before=JSON.parse(readFileSync(root+'/final/actual-cameras.json','utf8')),after=JSON.parse(readFileSync(root+'/shader-compare/actual-cameras.json','utf8')),rows=[]
for(const id of ids){
 assert.deepEqual(after.find(p=>p.id===id),before.find(p=>p.id===id),'camera/frame must be identical')
 rows.push(await compare(id,`${root}/final/reference/${id}.png`,`${root}/shader-compare/reference/${id}.png`))
}
writeFileSync(root+'/shader-output-compare.json',JSON.stringify({passed:rows.every(r=>r.passed),method:'Same recorded camera/viewport and frozen render time; raw sRGB pixels, no registration or post correction.',rows},null,2)+'\n')
assert(rows.every(r=>r.passed),'shader image changed beyond the rounding tolerance; inspect saved results')
console.log(JSON.stringify(rows))
