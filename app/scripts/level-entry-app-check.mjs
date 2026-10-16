// Exercise the production React cutscene, readiness gate, save and input flow.
// The caller owns an isolated origin/profile; no everyday browser/save is used.
export async function verifyLevelEntryApp({send,evaluate,capture,base,waitFor,mode,levels,onEntry=()=>{},profileEntry}) {
  const checks=[],entries=[]
  const assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)}
  const until=(expression,label)=>waitFor(()=>evaluate(`Boolean(${expression})`),label)
  const click=async(selector,text)=>evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Missing button');b.click()})()`)
  const init=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:${JSON.stringify(mode)},sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:6,devMode:true}))`})
  await send('Page.navigate',{url:base})
  await until('window.__engine && document.querySelector(".title-menu")','app title')
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier})
  await evaluate(`(()=>{const raw=__engine.snapshot();localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:424242,level:104,mapSeed:424242,savedAt:Date.now(),player:{...raw.player,level:104}}))})()`)
  await send('Page.reload')
  await until(`document.querySelector('canvas[data-title-level="104"][data-title-ready=true]')`,'saved game title')
  await click('.menu-btn','继续游戏');await click('.hud-panel button','继续')
  await until('__engine.player.level===104 && !__engine.paused && __renderer.isNearWorldReady(__engine)','Continue ready')
  await evaluate(`(()=>{const e=__engine;e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true;
    const load=e.loadLevel;e.loadLevel=function(...args){const start=performance.now(),v=load.apply(this,args);if(window.levelEntry&&args[0]===levelEntry.id){levelEntry.loadedAt=performance.now();levelEntry.generationMs=performance.now()-start}return v};
    const render=__renderer.render;__renderer.render=function(...args){const start=performance.now(),v=render.apply(this,args);if(window.levelEntry){levelEntry.renderCpuMs=(levelEntry.renderCpuMs||0)+performance.now()-start;levelEntry.frames=(levelEntry.frames||0)+1;if(e.player.level===levelEntry.id&&this.isNearWorldReady(e)&&!levelEntry.readyAt)levelEntry.readyAt=performance.now()}return v}})()`)
  for(const id of levels){
    // Same transition path as an ordinary exit, without level-specific keys or
    // route prerequisites. Authored entry animations remain in force.
    await profileEntry?.('start',id)
    await evaluate(`(()=>{__engine.time=0;window.levelEntry={id:${id},started:performance.now()};__engine.takeExit({kind:'door',dest:${id},anim:'bloom',label:'QA transition'})})()`)
    await until(`__engine.player.level===${id} && !__engine.transition && !__engine.paused && !document.querySelector('[data-cutscene]') && __renderer.isNearWorldReady(__engine)`,'playable '+id)
    const row=await evaluate(`({id:${id},sceneReadyMs:levelEntry.readyAt-levelEntry.started,playableMs:performance.now()-levelEntry.started,mapLoadedMs:levelEntry.loadedAt-levelEntry.started,generationMs:levelEntry.generationMs,renderCpuMs:levelEntry.renderCpuMs,frames:levelEntry.frames,mapSeed:__engine.mapSeed,memory:{...__renderer.three.info.memory},programs:__renderer.three.info.programs.length})`)
    await profileEntry?.('stop',id)
    entries.push(row);await capture('app-'+id)
    onEntry({checks,entries})
    // Use real input and collision; try another direction if facing a wall.
    // No source imports, position teleport or simplified collision fixture.
    row.moved=0
    for(let direction=0;direction<8&&row.moved<=.05;direction++){
      const before=await evaluate(`(()=>{__look.yaw=${direction*Math.PI/4};return{x:__engine.player.x,y:__engine.player.y}})()`)
      await send('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowUp',key:'ArrowUp',windowsVirtualKeyCode:38})
      try{await evaluate('new Promise(r=>setTimeout(r,400))')}
      finally{await send('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowUp',key:'ArrowUp',windowsVirtualKeyCode:38})}
      const after=await evaluate('({x:__engine.player.x,y:__engine.player.y})')
      row.moved=Math.hypot(after.x-before.x,after.y-before.y)
    }
    row.movementPassed=row.moved>.05
    if(row.movementPassed)assert(true,`Level ${id} accepts movement after entry`)
    else row.movementIssue='Input did not move player in eight tested directions'
    onEntry({checks,entries})
    console.log(JSON.stringify({app:row}))
  }
  return{checks,entries}
}
