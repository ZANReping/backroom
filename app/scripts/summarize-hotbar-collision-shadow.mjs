import {readFileSync,writeFileSync} from 'node:fs'
import {createCanvas,loadImage} from '@napi-rs/canvas'
const root='reports/hotbar-collision-shadow',read=p=>JSON.parse(readFileSync(`${root}/${p}`,'utf8'))
const before=read('before-realistic/result.json'),oldInteractions=read('before-realistic-interactions/result.json'),after=read('after-realistic/result.json'),classic=read('after-classic/result.json')
const pairedBefore=read('before-realistic-benchmark/result.json'),pairedAfter=read('after-realistic-benchmark/result.json')
const median=a=>a.slice().sort((a,b)=>a-b)[Math.floor(a.length/2)]
const performance=r=>({median:median(r.bench.rounds.map(v=>v.median)),p95:median(r.bench.rounds.map(v=>v.p95)),worstP95:Math.max(...r.bench.rounds.map(v=>v.p95)),cpuMedian:median(r.bench.rounds.map(v=>v.cpuMedian)),draws:median(r.bench.rounds.map(v=>v.drawsMedian)),triangles:median(r.bench.rounds.map(v=>v.trianglesMedian))})
const result={seed:20261006,bakeRevision:17,gpu:after.gpu,performance:{before:performance(pairedBefore),after:performance(pairedAfter),classic:performance(classic),earlierFullRuns:{before:performance(before),after:performance(after)},method:'Five warmed rounds per run. Use adjacent isolated before/after benchmark runs; earlier full-sequence baseline had a different rAF cadence, which also changed when the old version was rerun.'},entryMs:{before:before.entryMs,after:after.entryMs,classic:classic.entryMs},crate:{before:{distance:oldInteractions.crate.distance,embedded:oldInteractions.crate.timeline.filter(v=>!v.clear).length},after:{distance:after.crate.distance,embedded:after.crate.timeline.filter(v=>!v.clear).length}},hotbar:{before:oldInteractions.hotbar.flatMap(v=>v.values).filter(v=>v.scroll||!v.topVisible).length,after:after.hotbar.flatMap(v=>v.values).filter(v=>v.scroll||!v.topVisible).length,touchSelected:after.touchSelected},errors:{before:before.errors,after:after.errors,classic:classic.errors},cleanup:{before:before.cleanup,oldInteractions:oldInteractions.cleanup,after:after.cleanup,classic:classic.cleanup,pairedBefore:pairedBefore.cleanup,pairedAfter:pairedAfter.cleanup}}
if(!after.ok||!classic.ok||result.crate.after.embedded||result.hotbar.after)throw Error('Actual App QA failed')
writeFileSync(`${root}/summary.json`,JSON.stringify(result,null,2)+'\n')
const compare=async(name,oldFile,newFile,clip)=>{
 const old=await loadImage(`${root}/${oldFile}`),next=await loadImage(`${root}/${newFile}`),w=clip?.width??Math.max(old.width,next.width),h=clip?.height??Math.max(old.height,next.height),title=30,c=createCanvas(w,(h+title)*2),g=c.getContext('2d')
 g.fillStyle='#151515';g.fillRect(0,0,c.width,c.height);g.font='18px sans-serif';g.fillStyle='#eee'
 for(const [i,img]of [old,next].entries()){const y=i*(h+title);g.fillText(i?'After (revision 17)':'Before (revision 16)',8,y+22);if(clip)g.drawImage(img,clip.x,clip.y,clip.width,clip.height,0,y+title,w,h);else g.drawImage(img,0,y+title)}
 writeFileSync(`${root}/${name}.png`,c.toBuffer('image/png'))
}
await compare('hotbar-comparison','before-realistic-interactions/hotbar-desktop-immersive.png','after-realistic/hotbar-desktop-immersive.png')
await compare('contact-comparison','before-realistic/parking-common-contact.png','after-realistic/parking-common-contact.png',{x:80,y:345,width:1320,height:650})
await compare('round-comparison','before-realistic/parking-round-contact.png','after-realistic/parking-round-contact.png',{x:100,y:345,width:1320,height:650})
console.log(JSON.stringify(result,null,2))
