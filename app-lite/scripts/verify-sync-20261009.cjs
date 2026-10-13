const {chromium}=require(process.argv[2]||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4189/dist/';
const out=path.join(root,'reports/sync-20261009');fs.mkdirSync(out,{recursive:true});
const report={passed:false,seed:20261006,viewport:{width:1100,height:700},levels:[],errors:[],missing:[],musicRequests:[]};
(async()=>{
 const context=await chromium.launchPersistentContext(path.join(root,'.cache/sync-20261009/qa-profile'),{channel:'chromium',headless:true,viewport:report.viewport,args:['--use-angle=d3d11','--enable-automation','--remote-debugging-port=9259']});
 const page=context.pages()[0]||await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.stack||e.message));
 page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)report.missing.push({url:r.url(),status:r.status()});});
 page.on('request',r=>{if(/\/music\/.*\.(mid|mp3)/i.test(r.url()))report.musicRequests.push(r.url());});
 await page.route('**/toy-sdk.js',r=>r.abort());
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
 await page.addInitScript(()=>{if(location.origin!=='http://127.0.0.1:4189')return;if(!sessionStorage.getItem('qa-init')){localStorage.clear();localStorage.setItem('br_settings',JSON.stringify({bgmStyle:'midi',preloadAllLevels:true,newGameSeed:'20261006',devMode:true,renderResolution:'480p_retro',dynamicRes:false,shadows:false,grain:false,lightMode:'classic',eyeAdaptation:false}));sessionStorage.setItem('qa-init','1');}});
 const ready=()=>page.waitForFunction(()=>window.__renderer?.isNearWorldReady(window.__engine)&&!window.__engine.paused,null,{timeout:240000});
 const shot=n=>page.screenshot({path:path.join(out,n+'.png')});
 const timer=setInterval(async()=>console.log('state',await page.evaluate(()=>({level:window.__engine?.player?.level,paused:window.__engine?.paused,title:document.querySelector('canvas')?.dataset.titleReady,ready:window.__engine?.map&&window.__renderer?.isNearWorldReady(window.__engine),text:document.body.innerText.slice(-170)})).catch(()=>null)),20000);
 try{
  const cdp=await context.newCDPSession(page);report.browser=await cdp.send('Browser.getVersion');report.launch=await cdp.send('Browser.getBrowserCommandLine');
  assert.ok(report.launch.arguments.some(a=>a.startsWith('--headless')));assert.ok(report.launch.arguments.includes('--remote-debugging-port=9259'));assert.ok(report.launch.arguments.some(a=>a.includes('qa-profile')));
  await page.goto(base+'?room=4VD2',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:/开始游戏/}).waitFor({timeout:240000});
  assert.equal(await page.getByRole('button',{name:/联机模式|创建房间|加入房间/}).count(),0);
  report.multiplayerEntrypointsClosed=true;
  await shot('title');
  report.settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('br_settings')));
  assert.equal(report.settings.bgmStyle,'procedural');assert.notEqual(report.settings.preloadAllLevels,true);
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('tab',{name:/音频/}).click();
  assert.equal(await page.getByRole('button',{name:'程序化',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'MIDI',exact:true}).count(),0);await shot('settings-audio');
  await page.getByRole('button',{name:/关闭/}).first().click();
  await page.getByRole('button',{name:/开始游戏/}).click();await ready();
  report.gpu=await page.evaluate(()=>{const gl=window.__renderer.three.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'unknown'});
  assert.equal(await page.evaluate(()=>window.__engine.seed),20261006);
  for(const level of [0,1,7,10,101]){
   console.log('Verify level',level);
   if(level!==0)await page.evaluate(level=>{window.__engine.dev.god=true;window.__engine.loadLevel(level)},level);
   await ready();await page.waitForTimeout(1200);
   report.levels.push(await page.evaluate(()=>({level:window.__engine.player.level,structures:window.__engine.map.structures.length,entities:window.__engine.map.entities.length,chunks:window.__renderer.chunkGroups.size,drawCalls:window.__renderer.three.info.render.calls})));
   await shot('level-'+level);
   if(level===0){
    const before=await page.evaluate(()=>({x:window.__engine.player.x,y:window.__engine.player.y}));await page.keyboard.down('w');await page.waitForTimeout(600);await page.keyboard.up('w');
    report.movement={before,after:await page.evaluate(()=>({x:window.__engine.player.x,y:window.__engine.player.y}))};
    assert.ok(Math.hypot(report.movement.before.x-report.movement.after.x,report.movement.before.y-report.movement.after.y)>.05);
    await page.keyboard.press('m');await page.waitForTimeout(300);await shot('level-0-map');await page.getByRole('button',{name:'关闭',exact:true}).first().click();
   }
   if(level===1){
    await page.waitForTimeout(4000);
    report.l1=await page.evaluate(async()=>{const r=window.__renderer;let baked=0;r.scene.traverse(o=>{if(o.name.startsWith('l1-baked-'))baked++});const dbs=await indexedDB.databases();return{baked,databases:dbs.map(d=>d.name)}});
    assert.ok(report.l1.baked>0,'Level 1 worker bakes rendered');await shot('level-1-baked');
   }
   if(level===101){await page.keyboard.press('m');const select=page.getByLabel('查看 Alpha 地图区块');await select.waitFor();await select.selectOption('overview');await shot('alpha-map');await page.setViewportSize({width:740,height:390});await page.waitForTimeout(300);await shot('alpha-map-mobile');}
  }
  const changed=JSON.parse(fs.readFileSync(path.join(root,'.cache/sync-20261009/changes.json'),'utf8')).filter(x=>x.path.startsWith('public/')&&/\.(png|jpg|jpeg)$/i.test(x.path));
  report.textures=await page.evaluate(async paths=>{const result=[];for(const p of paths){const i=new Image();i.src='./'+p.slice(7);await i.decode();result.push({path:p,w:i.naturalWidth,h:i.naturalHeight});}return result},changed.map(x=>x.path));
  assert.equal(report.textures.length,76);assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);assert.deepEqual(report.musicRequests,[]);report.passed=true;
 }catch(e){report.failure=String(e);await shot('failure').catch(()=>{});throw e}
 finally{clearInterval(timer);fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify(report,null,2));await context.close();}
 console.log(JSON.stringify({passed:report.passed,levels:report.levels,l1:report.l1,textures:report.textures.length}));
})().catch(e=>{console.error(e);process.exitCode=1});



