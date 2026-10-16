// CDP checks on the actual React game, using the caller's owned QA browser.
export async function verifyOutpostApp({send,evaluate,capture,base,waitFor,mode}) {
  const checks=[],entries=[],assert=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)}
  const until=(expression,label)=>waitFor(()=>evaluate(`Boolean(${expression})`),label)
  const click=async(selector,text)=>evaluate(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b)throw Error('Missing '+${JSON.stringify(text)});b.click()})()`)
  const init=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();sessionStorage.clear();localStorage.setItem('br_settings',JSON.stringify({renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,lightMode:${JSON.stringify(mode)},sceneLightLimit:16,shadowQuality:1,lightShadows:1,loadingBudgetMs:6,devMode:true}))`})
  await send('Page.navigate',{url:base})
  await until('window.__engine && document.querySelector(".title-menu")','app title')
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier})
  await evaluate(`(async()=>{const {snapshot}=await import('/src/game/engine/save.ts');const raw=snapshot(__engine);localStorage.setItem('br_save_slot1',JSON.stringify({...raw,seed:424242,level:104,mapSeed:424242,savedAt:Date.now(),player:{...raw.player,level:104}}))})()`)
  async function resume(id){
    await send('Page.reload')
    await until(`document.querySelector('.title-menu') && document.querySelector('canvas[data-title-level="${id}"][data-title-ready=true]')`,'saved outpost title')
    await click('.menu-btn','继续游戏');await click('.hud-panel button','继续')
    await until(`__engine.player.level===${id} && document.querySelector('.hud-location-cluster') && !__engine.paused && __renderer.isNearWorldReady(__engine)`,'continue ready')
  }
  await resume(104);assert(true,'Continue loads a saved outpost through the title and loading UI')
  await evaluate(`(()=>{const e=__engine;e.dev.god=true;e.dev.statLock=true;e.dev.frozenAI=true;window.outpostUi=[];const render=__renderer.render;__renderer.render=function(...args){const v=render.apply(this,args);const ready=this.isNearWorldReady(e);if(window.outpostEntry && e.player.level===outpostEntry.id && ready && !outpostEntry.readyAt)outpostEntry.readyAt=performance.now();return v}})()`)
  for(const [key,id] of [['alpha',101],['bntg',102],['gamma',106]]){
    const started=await evaluate(`(()=>{outpostEntry={id:${id},started:performance.now()};if(!__engine.enterOutpost(${JSON.stringify(key)},true))throw Error('enterOutpost rejected');return outpostEntry.started})()`)
    await until(`__engine.player.level===${id} && !__engine.paused && __renderer.isNearWorldReady(__engine) && !document.querySelector('[data-cutscene]')`,'outpost transition '+key)
    const info=await evaluate(`({id:${id},sceneReadyMs:outpostEntry.readyAt-${started},playableMs:performance.now()-${started},returnTo:__engine.outpostReturn,geometry:__renderer.three.info.memory.geometries,textures:__renderer.three.info.memory.textures,npcMeshes:__renderer.npcMeshes.size})`)
    entries.push(info);assert(info.returnTo===104,key+' preserves return destination');await capture('app-'+key)
    const before=await evaluate(`(async()=>{const {canOccupy,PLAYER_RADIUS}=await import('/src/game/core/player.ts');const e=__engine,p=e.player;for(const [x,y]of [[0,-1],[1,0],[0,1],[-1,0]])if([.25,.5,.75,1].every(t=>canOccupy(e.map,p.x+x*t,p.y+y*t,PLAYER_RADIUS,{z:p.z}))){__look.yaw=Math.atan2(-x,-y);return {x:p.x,y:p.y}}throw Error('No safe walk direction')})()`)
    await send('Input.dispatchKeyEvent',{type:'keyDown',code:'ArrowUp',key:'ArrowUp',windowsVirtualKeyCode:38})
    try {await evaluate('new Promise(resolve=>setTimeout(resolve,600))')}
    finally {await send('Input.dispatchKeyEvent',{type:'keyUp',code:'ArrowUp',key:'ArrowUp',windowsVirtualKeyCode:38})}
    const after=await evaluate('({x:__engine.player.x,y:__engine.player.y})')
    assert(Math.hypot(after.x-before.x,after.y-before.y)>.1,key+' accepts movement after entry')
    await evaluate(`(()=>{const e=__engine,exit=e.map.exits.find(x=>x.def.dest==='back');if(!exit)throw Error('No return exit');e.takeExit(exit.def)})()`)
    await until(`__engine.player.level===104 && !__engine.paused && __renderer.isNearWorldReady(__engine) && !document.querySelector('[data-cutscene]')`,'return from '+key)
    assert(true,key+' return exit completes')
  }
  await evaluate(`__engine.enterOutpost('alpha',true)`)
  await until(`__engine.player.level===101 && !__engine.paused && __renderer.isNearWorldReady(__engine) && !document.querySelector('[data-cutscene]')`,'revisited Alpha')
  await evaluate('__engine.persist()')
  await resume(101);assert(true,'Save/reload/Continue restores Alpha without an unfinished scene')
  await capture('app-alpha-restored')
  return {checks,entries}
}
