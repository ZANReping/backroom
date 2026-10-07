import { Engine } from '../src/game/engine'
import { getRenderer, look } from '../src/game/renderer'
import { ALPHA_BLUEPRINT, ALPHA_DISTRICTS } from '../src/game/content/alphaBlueprint'
import { canOccupy } from '../src/game/core/player'
import { drawAlphaMap } from '../src/game/content/alphaMap'
const canvas=document.querySelector('canvas')!,e=new Engine(),renderer=getRenderer(canvas),plan=document.querySelector<HTMLDivElement>('#plan')!
e.seed=424242;e.paused=true;e.dev.god=true;e.dev.frozenAI=true;e.dev.statLock=true
renderer.setTextureQuality(2);renderer.setBloomFx(false);renderer.setLightShadows(1)
let mode:'classic'|'realistic'='realistic',view='radio',last=performance.now(),times:number[]=[]
renderer.setLightMode(mode)
const views:Record<string,[number,number,number,number,number?]>={radio:[30.5,33,.2,-.01],meeting:[36.7,54.7,.18,-.04],storage:[28.1,19.8,.48,-.03],dorm:[17.2,35.2,-.07,-.06],corridor:[22.7,46.9,0,-.03],glazed_hall:[39.9,54.5,.05,-.02],store_hall:[29,26.5,Math.PI/2,-.03],planning:[44,44.3,Math.PI+.18,-.03],training:[43.7,37.1,0,-.02],north:[60,12,Math.PI,0],west:[29.5,84.5,-Math.PI/2,0],east:[131.5,64.5,Math.PI/2,0]}
Object.assign(views,{laboratory:[78,41.1,-.38,-.04],office:[77.15,47.55,Math.PI+.05,-.04],specimens:[105,51.5,.82,-.12],reagents:[95,51.5,.82,-.12],research_hall:[89,44.5,-Math.PI/2,0],north:[60.5,15,0,0],east:[132.4,65,-Math.PI/2,0],west:[28.9,85,Math.PI/2,0]})
Object.assign(views,{archivists:[57.9,37.7,0,-.18],archivists_b:[60.5,49.5,-.72,-.08],tech:[69.4,37.4,.5,-.12],paper_archive:[61.35,30.6,.06,-.02],archive_code:[56.65,29.78,-Math.PI/2,-.65],restricted:[69,53.5,.15,-.04]})
const archiveSelect=document.querySelector<HTMLSelectElement>('#view')!
Object.assign(views,{community_north:[60.5,12.8,1.05,-.06],community_post:[39.5,106.4,.55,-.08],community_mending:[50.8,106.6,.35,-.12],community_tea:[68,106.8,.30,-.08],community_west:[27.6,86,.4,-.03],community_work:[93,124.7,Math.PI/2,-.04],community_gallery:[64.2,56.35,.15,.04]})
for(const [value,label] of [['community_north','北入口 · 欢迎与留言'],['community_post','南廊 · 投递与换读'],['community_mending','南廊 · 邻里缝补'],['community_tea','南廊 · 茶水与聊天'],['community_west','西入口 · 归来歇脚'],['community_work','西风区 · 工班休息'],['community_gallery','档案署外 · 留言墙']])archiveSelect.add(new Option(label,value))
Object.assign(views,{door_e:[93,88,Math.PI/2,-.07],door_w:[93,88,-Math.PI/2,-.07],door_n:[62,71.4,Math.PI,-.07],door_s:[126.5,32.5,0,-.07]})
for(const [value,label] of [['door_e','住宅门框 · 东侧'],['door_w','住宅门框 · 西侧'],['door_n','住宅门框 · 北侧'],['door_s','住宅门框 · 南侧']])archiveSelect.add(new Option(label,value))
Object.assign(views,{mushrooms:[112.5,26.6,.34,-.16],anemoia:[134,18.5,.40,-.07],crimson:[70,68,.40,-.04],library:[45,97.5,.06,-.035],media:[48.2,86.3,-.85,-.12],river:[114.5,65.8,.6,-.04],home:[127,41,.60,-.08],zephyr:[93,122.5,0,-.025],construction:[96,121.5,-.2,-.05],aquila:[43,121,0,.04]})
for(const [value,label] of [['mushrooms','爱念陌异区 · 菌菇房'],['anemoia','爱念陌异区 · 公共起居'],['crimson','腥红区 · 社区厨房'],['library','先驱区 · 多媒体图书馆'],['media','先驱区 · 电脑席'],['river','利沃区 · 纪念起居'],['home','独立居民住宅'],['zephyr','西风区 · 扩建走廊'],['construction','西风区 · 未完工住宅'],['aquila','天鹰段 · 基地边界']])archiveSelect.add(new Option(label,value))
Object.assign(views,{admin_lobby:[74.6,29.9,.42,-.015],assembly:[90,27.8,0,-.05,.96],overseer:[72,14.5,0,-.055],trade:[111.9,7.5,-1.25,-.04],trade_public:[105.5,8,0,-.09]})
for(const [value,label] of [['admin_lobby','行政部门与接待'],['assembly','大会厅 A'],['overseer','监督者驻办'],['trade','贸易中转分拣间'],['trade_public','贸易中转公共柜台'],['admin_map','行政署地图']])archiveSelect.add(new Option(label,value))
for(const [value,label] of [['archivists','档案员办公室 1'],['archivists_b','档案员办公室 2'],['tech','技术支援与软件开发'],['paper_archive','纸质档案馆'],['archive_code','A124 编号'],['restricted','受控记录'],['archives_map','档案署地图']])archiveSelect.add(new Option(label,value))
function show(which:string){view=which;document.querySelector<HTMLSelectElement>('#view')!.value=which;times=[]
 if(which==='research_map'||which==='archives_map'||which==='admin_map'){
  const archive=which==='archives_map',admin=which==='admin_map';plan.innerHTML='<canvas aria-label="署内细分地图"></canvas>';const c=plan.querySelector('canvas')!,size=Math.min(innerWidth,innerHeight);c.width=size;c.height=size;c.style.cssText=`width:${size}px;height:${size}px;margin:auto`;drawAlphaMap(c.getContext('2d')!,size,admin?{x:72,y:25}:archive?{x:60.5,y:38.5}:{x:81.5,y:44.5},{region:admin?'administration':archive?'archives':'research'});plan.style.display='block';return
 }
 if(which==='plan'){
  const b=ALPHA_BLUEPRINT,rect=(r:{x:number;y:number;w:number;h:number},fill:string)=>`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}"/>`
  plan.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 152 130"><rect width="152" height="130" fill="#999"/>${b.corridors.map(r=>rect(r,'#ddd')).join('')}${ALPHA_DISTRICTS.map(r=>rect(r,r.color)).join('')}${ALPHA_DISTRICTS.filter(r=>r.name).map(r=>`<text x="${r.x+r.w/2}" y="${r.y+r.h/2}" text-anchor="middle" fill="#151515" font-size="${r.id==='exploration'?5:3}">${r.name.replace('居民片区','')}</text>`).join('')}${b.exits.map((p,i)=>`<circle cx="${p.x}" cy="${p.y}" r="3" fill="red"/><text x="${p.x+(i===1?6:i===2?-5:0)}" y="${p.y+(i===0?-5:1)}" text-anchor="${i===1?'start':i===2?'end':'middle'}" font-size="3.5">${['北部入口','东部入口','西部入口'][i]}</text>`).join('')}<text x="80" y="5" font-size="4" fill="white">走廊</text><text x="111" y="117" font-size="3">仍在走廊间扩建 ↓</text></svg>`
  plan.style.display='block';return
 }
 plan.style.display='none';const [x,y,yaw,pitch,z=0]=views[which];e.player.x=x;e.player.y=y;e.player.z=z;e.player.floor=0;look.yaw=yaw;look.pitch=pitch
}
function load(){e.loadLevel(101,{mapSeed:424242,firstVisit:false});e.introT=0;e.player.flashlight=false;show(view)}
function stats(){const sorted=[...times].sort((a,b)=>a-b);return {view,mode,frames:times.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],draws:renderer.three.info.render.calls,triangles:renderer.three.info.render.triangles,memory:{...renderer.three.info.memory},safe:canOccupy(e.map!,e.player.x,e.player.y,.3,{z:e.player.z,band:0,crouch:false})}}
document.querySelector<HTMLSelectElement>('#view')!.onchange=ev=>show((ev.target as HTMLSelectElement).value)
document.querySelector('#mode')!.addEventListener('click',()=>{mode=mode==='classic'?'realistic':'classic';renderer.setLightMode(mode);times=[]})
document.querySelector('#reload')!.addEventListener('click',load)
const initialView=new URLSearchParams(location.search).get('view');if(initialView&&views[initialView])view=initialView
function resize(){renderer.resize(innerWidth,innerHeight,1)}window.addEventListener('resize',resize);resize();load()
function frame(now:number){const ms=now-last;last=now;renderer.applyView(e);renderer.render(canvas,e,{grain:false,flicker:0,shake:false},Math.min(ms/1000,.05));times.push(ms);if(times.length>240)times.shift();if(times.length%30===0)document.querySelector('#stats')!.textContent=JSON.stringify(stats());requestAnimationFrame(frame)}
requestAnimationFrame(frame)
Object.assign(window,{alphaQA:{e,renderer,show,stats,load,mode:(v:'classic'|'realistic')=>{mode=v;renderer.setLightMode(v);times=[]},clean:(v=true)=>document.body.classList.toggle('clean',v)}})
