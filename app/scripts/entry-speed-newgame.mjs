export async function verifyNewGames({send,evaluate,capture,base,waitFor,mode}){
 const rows=[]
 for(const foyer of [true,false]){
  const init=await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();sessionStorage.clear();${foyer?'':"localStorage.setItem('br_foyer_done','1');"}localStorage.setItem('br_settings',JSON.stringify({enableFoyer:${foyer},newGameSeed:'424242',renderResolution:'native',renderScale:100,maxPixelRatio:1,dynamicRes:false,dynamicExposure:false,grain:false,lightMode:${JSON.stringify(mode)},sceneLightLimit:16,shadowQuality:1,lightShadows:2,textureQuality:1,loadingBudgetMs:6,devMode:false}))`})
  await send('Page.navigate',{url:base})
  await waitFor(()=>evaluate(`!!document.querySelector('.title-menu')&&!!document.querySelector('canvas[data-title-ready=true]')`),'new game title')
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier})
  await evaluate(`(()=>{const b=[...document.querySelectorAll('.menu-btn')].find(b=>b.textContent.includes('开始游戏'));if(!b)throw Error('Missing start button');window.newGameAt=performance.now();b.click()})()`)
  const id=foyer?900:0
  await waitFor(()=>evaluate(`__engine.player.level===${id}&&!__engine.paused&&__renderer.isNearWorldReady(__engine)&&!document.querySelector('.loading-screen')`),'new game '+id)
  const row=await evaluate(`({id:${id},playableMs:performance.now()-window.newGameAt,seated:__engine.seating?.phase??null,ready:__renderer.isNearWorldReady(__engine),memory:{...__renderer.three.info.memory}})`)
  if(foyer&&row.seated!=='seated')throw Error('Foyer new game did not preserve opening seated pose')
  rows.push(row);await evaluate(`window.newGameResult=${JSON.stringify(rows)}`);await capture('newgame-'+id);console.log(JSON.stringify({newgame:row}))
 }
 return rows
}
