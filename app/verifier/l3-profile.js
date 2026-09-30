export async function sample(qa,variant,n=100){
 qa.setMode('classic');qa.setVariant(variant)
 await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)
 const started=performance.now()
 while(qa.renderer.builtMap!==qa.engine.map||qa.renderer.chunkGroups.size<qa.engine.map.inf.chunks.size||qa.renderer.cityChunkTask){if(performance.now()-started>90000)throw new Error('chunk construction did not settle');await new Promise(r=>setTimeout(r,100))}
 await new Promise(r=>setTimeout(r,700))
 const times=[],calls=[],tris=[],r=qa.renderer,old=r.render.bind(r),info=r.three.info,reset=info.autoReset
 info.autoReset=false
 r.render=(...args)=>{info.reset();const t=performance.now();old(...args);times.push(performance.now()-t);calls.push(info.render.calls);tris.push(info.render.triangles)}
 const deltas=[];let last=performance.now()
 try{for(let i=0;i<n;i++)await new Promise(resolve=>requestAnimationFrame(now=>{deltas.push(now-last);last=now;resolve()}))}
 finally{r.render=old;info.autoReset=reset}
 const percentile=(a,p)=>a.sort((x,y)=>x-y)[Math.floor((a.length-1)*p)]
 return{variant,samples:times.length,cpuMedian:percentile(times,.5),cpuP95:percentile(times,.95),frameMedian:percentile(deltas,.5),frameP95:percentile(deltas,.95),drawCalls:percentile(calls,.5),triangles:percentile(tris,.5),geometries:info.memory.geometries}
}
