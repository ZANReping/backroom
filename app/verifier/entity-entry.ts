// Measure the actual renderer's first encounter path, without pausing/precompiling it.
export async function measure(qa:any, progress:(row:unknown)=>void = console.log) {
  const eng=qa.eng,r=qa.r,query=new URLSearchParams(location.search)
  const root=query.get('baseline')==='rat-v80'?'/.cache/rat-v80/baseline/src/game/entities/index.ts':'/src/game/entities/index.ts'
  const {ENTITIES}=await import(/* @vite-ignore */root)
  const raf=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve))
  const frames=async(n:number)=>{for(let i=0;i<n;i++)await raf()}
  const quant=(v:number[],p:number)=>{const a=[...v].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.floor(a.length*p))]??null}
  eng.devEnabled=true;eng.dev.frozenAI=true;eng.dev.god=true;eng.dev.statLock=true
  qa.setFrozen(true);eng.paused=false
  eng.player.x=40.25;eng.player.y=25.5;eng.player.z=0;eng.player.floor=0
  qa.look.yaw=-Math.PI/2;qa.look.pitch=-.12;r.setFov(60)
  const results=[]
  for(const type of Object.keys(ENTITIES).sort()) {
    eng.map.entities=[];await frames(3)
    const cpu:number[]=[],gaps:number[]=[],build:number[]=[];const original=r.render,originalEntities=r.updateEntities
    let last=performance.now(),start=last,firstVisible:number|null=null,postVisible=0,waitFrames=0
    r.render=function(...args:any[]) {const now=performance.now();gaps.push(now-last);last=now;const t=performance.now();try{return original.apply(this,args)}finally{cpu.push(performance.now()-t)}}
    r.updateEntities=function(...args:any[]){const t=performance.now();try{return originalEntities.apply(this,args)}finally{build.push(performance.now()-t)}}
    let failure:string|undefined
    try {
      const random=Math.random
      let seed=Array.from(type).reduce((v,c)=>Math.imul(v^c.charCodeAt(0),16777619),20261006)>>>0
      Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
      try {if(!eng.devSpawnEntity(type,3))throw Error('No safe spawn')} finally {Math.random=random}
      const id=eng.map.entities.at(-1).id
      eng.map.entities.at(-1).hidden=false // measure an ambusher's actual reveal, not its intentionally hidden waiting state
      while(performance.now()-start<15000){
        await raf()
        const g=r.entityMeshes.get(id),ready=g?.visible&&r.itemWarmup.ready(g)
        if(ready&&firstVisible===null)firstVisible=performance.now()-start
        if(firstVisible===null)waitFrames++;else postVisible++
        if(firstVisible!==null&&postVisible>=20&&performance.now()-start-firstVisible>=400)break
      }
      if(firstVisible===null)failure='Model did not become visible within 15 seconds'
    }catch(e){failure=String(e)}finally{r.render=original;r.updateEntities=originalEntities}
    const row={type,firstCpu:cpu[0],maxCpu:Math.max(0,...cpu),buildMax:Math.max(0,...build),medianCpu:quant(cpu,.5),p95Cpu:quant(cpu,.95),maxRaf:Math.max(0,...gaps.slice(1)),appearanceMs:firstVisible,waitFrames,frames:cpu.length,memory:{...r.three.info.memory},programs:r.three.info.programs.length,failure}
    results.push(row);progress(row)
  }
  const gl=r.three.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info')
  return {seed:20261006,level:104,viewport:[innerWidth,innerHeight],mode:query.get('mode'),gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),results}
}
