import { OUTPOSTS } from '/src/game/content/outposts.ts'

// Production Engine/Renderer, no alternate map or simplified model factories.
export function attachOutpostLoading(qa, mode = 'realistic') {
  const {engine:e, renderer:r, look} = qa
  r.setLightMode(mode); r.setTextureQuality(1); r.setDetailDistance(1)
  r.setSceneLightLimit(16); r.setLoadingBudget(6); r.setChunkBudget(3)
  r.setShadows(true); r.setLightShadows(1); r.setBloomFx(true)
  r.setPhotography(1,0,0,'neutral'); r.setParticleDensity(.7)
  document.querySelector('aside')?.remove()
  e.newRun(424242, 'normal'); e.dev.god=true; e.dev.statLock=true; e.dev.frozenAI=true
  const frame=()=>new Promise(requestAnimationFrame)
  const quantile=(a,q)=>[...a].sort((a,b)=>a-b)[Math.floor((a.length-1)*q)]??0
  const totals=()=>({cpuMs:0,calls:0,maxMs:0})
  let metrics, compileJobs=[]
  for(const name of ['buildLevel','warmSceneTextures']) {
    const original=r[name]
    r[name]=function*(...args) {
      const job=original.apply(this,args)
      try { for(;;) {
        const start=performance.now(), step=job.next(), ms=performance.now()-start
        if(metrics){const m=metrics[name]??=totals(); m.cpuMs+=ms;m.calls++;m.maxMs=Math.max(m.maxMs,ms)}
        if(step.done)return step.value
        yield step.value
      }}finally{job.return()}
    }
  }
  const compile=r.three.compileAsync
  r.three.compileAsync=function(...args){
    const start=performance.now(), row={at:start,objects:0,target:!!this.getRenderTarget()}
    args[0].traverseVisible(o=>{if(o.material)row.objects++})
    const result=compile.apply(this,args);row.submitMs=performance.now()-start
    compileJobs.push(row)
    return result.finally(()=>{row.elapsedMs=performance.now()-start})
  }
  const draw=()=>{
    r.three.info.reset();r.applyView(e)
    r.render(r.three.domElement,e,{grain:false,flicker:.7,shake:false},1/60)
  }
  const snapshot=()=>{
    const g=r.levelGroup;let meshes=0,instances=0;const materials=new Set()
    g?.traverseVisible(o=>{if(o.isMesh){meshes++;if(o.isInstancedMesh)instances+=o.count;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}})
    return {structures:e.map.structures.length,lights:e.map.lights.length,npcs:e.npcs.length,nearNpcs:e.npcs.filter(n=>Math.hypot(n.x-e.player.x,n.y-e.player.y)<=24).length,npcMeshes:r.npcMeshes.size,meshes,instances,materials:materials.size,memory:{...r.three.info.memory},programs:r.three.info.programs.length,drawCalls:r.three.info.render.calls,triangles:r.three.info.render.triangles,spawn:{x:e.player.x,y:e.player.y,z:e.player.z},mapSeed:e.mapSeed,ready:r.isNearWorldReady(e)}
  }
  async function measure(id, transition=false) {
    metrics={};compileJobs=[];const frames=[]
    e.paused=false;e.introT=0;look.yaw=0;look.pitch=0
    let loadAt=0,generationMs=0
    const load=e.loadLevel
    e.loadLevel=function(...args){const start=performance.now();const v=load.apply(this,args);if(args[0]===id){loadAt=start;generationMs=performance.now()-start}return v}
    const start=performance.now()
    if(transition){
      const outpost=Object.values(OUTPOSTS).find(o=>o.levelId===id)
      if(!outpost||!e.enterOutpost(outpost.id,true))throw Error('Outpost transition failed: '+id)
    }else e.loadLevel(id,{mapSeed:424242,firstVisit:false})
    try {
      let previous=performance.now()
      for(;;){
        await frame();const now=performance.now(),dt=Math.min((now-previous)/1000,.05),cpu=performance.now()
        e.paused=e.player.level===id;e.update(dt);draw()
        frames.push({ms:now-previous,cpuMs:performance.now()-cpu,calls:r.three.info.render.calls});previous=now
        if(e.player.level===id&&r.isNearWorldReady(e))break
        if(now-start>180000)throw Error('Outpost readiness timeout: '+id)
      }
    }finally{e.loadLevel=load}
    const readyAt=performance.now(), firstReady=snapshot()
    // The app reveals the fully rendered scene after two animation frames.
    const revealed=[]
    for(let i=0;i<2;i++){const t=performance.now();await frame();draw();revealed.push(performance.now()-t)}
    const result={id,transition,loadMs:readyAt-start,sceneMs:readyAt-loadAt-generationMs,generationMs,frames:frames.length,cpuTotalMs:frames.reduce((n,f)=>n+f.cpuMs,0),cpuMaxMs:Math.max(...frames.map(f=>f.cpuMs)),frameP95Ms:quantile(frames.map(f=>f.ms),.95),firstRevealMs:revealed,metrics,compile:{calls:compileJobs.length,submitMs:compileJobs.reduce((n,j)=>n+j.submitMs,0),maxSubmitMs:Math.max(0,...compileJobs.map(j=>j.submitMs)),targets:compileJobs.filter(j=>j.target).length},firstReady}
    qa.outpost.last=result
    return result
  }
  async function survey(){
    const rows=[]
    for(let i=0;i<120;i++){const start=performance.now();await frame();look.yaw+=Math.PI*2/120;const cpu=performance.now();draw();rows.push({frame:performance.now()-start,cpu:performance.now()-cpu})}
    return {frameP95Ms:quantile(rows.map(x=>x.frame),.95),cpuP95Ms:quantile(rows.map(x=>x.cpu),.95),snapshot:snapshot()}
  }
  qa.outpost={measure,survey,snapshot,draw,mode,get compileJobs(){return compileJobs}}
  const gl=r.three.getContext(), ext=gl.getExtension('WEBGL_debug_renderer_info')
  return {mode,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,seed:424242,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),settings:{texture:1,lights:16,shadows:true,lightShadows:1,loadingBudget:6,chunkBudget:3,detail:1,bloom:true,ao:1}}
}
