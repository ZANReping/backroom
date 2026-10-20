# usage: P=port LM=realistic python3 game.py outdir steps.json
import json,os,sys,time,subprocess,socket
from playwright.sync_api import sync_playwright
APP=os.environ.get('APP','/workspace/work/up/repo/app');PORT=int(os.environ.get('P','3350'));out=sys.argv[1];os.makedirs(out,exist_ok=True)
steps=json.load(open(sys.argv[2]))
LM=os.environ.get('LM','realistic')
srv=subprocess.Popen(['./node_modules/.bin/vite','--host','127.0.0.1','--port',str(PORT),'--strictPort'],cwd=APP,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
for _ in range(120):
  try: socket.create_connection(('127.0.0.1',PORT),1).close();break
  except OSError: time.sleep(.5)
try:
 with sync_playwright() as pw:
  br=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--disable-gpu-watchdog','--disable-gpu-process-crash-limit'])
  ctx=br.new_context(viewport={'width':int(os.environ.get('W','1280')),'height':int(os.environ.get('H','720'))})
  ctx.add_init_script("try{const o=JSON.parse(localStorage.getItem('br_settings')||'{}');Object.assign(o,{lightMode:'%s'});localStorage.setItem('br_settings',JSON.stringify(o))}catch(e){}"%LM)
  pg=ctx.new_page()
  pg.on('pageerror',lambda e: print('pageerror',str(e)[:300],flush=True))
  pg.on('console',lambda m: m.type in ('error','warning') and print('console',m.text[:3000],flush=True))
  for att in range(5):
    pg.goto(f'http://127.0.0.1:{PORT}/',wait_until='domcontentloaded',timeout=180000)
    r=pg.evaluate("(async()=>{for(let i=0;i<300;i++){const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('开始游戏'));if(b){b.click();return 'clicked'}await new Promise(r=>setTimeout(r,500))}return 'none'})()")
    print('attempt',att,r,flush=True)
    if r=='clicked':break
  pg.wait_for_timeout(15000)
  t0=time.time()
  for st in steps:
    if st[0]=='wait':pg.wait_for_timeout(st[1])
    elif st[0]=='eval':
      try: print('eval',str(pg.evaluate(st[1]))[:600],flush=True)
      except Exception as e: print('evalfail',str(e)[:300],flush=True)
    elif st[0]=='shot':
      pg.evaluate("document.querySelectorAll('div.fixed.inset-0').forEach(e=>{if(e.className.includes('z-[70]'))e.style.display='none'})")
      pg.screenshot(path=f'{out}/{st[1]}.png',timeout=180000);print('shot',st[1],round(time.time()-t0),flush=True)
  br.close()
finally: srv.terminate()
