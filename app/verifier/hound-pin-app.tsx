// 猎犬（Entity 8）扑倒压制第一人称实机验收：生产 App + 生产引擎 / 渲染器，存档换成内存（不碰玩家存档）。
// 用法：/verifier/hound-pin-app.html?cpu=1&level=0&debugHoundPin=1（无头 SwiftShader 必须 cpu=1）。
// window.hdPin：spawn() 在准星正前方生成一只敌对猎犬并让它冲锋扑倒玩家；step(n) 锁步推进 n 帧（引擎每帧 1/fps s，默认 30，
// 渲染层同 dt），free() 恢复实时；press(n) 连按交互键 n 下；bite() 让下一帧咬一口；state() 读压制状态。
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {storage} from '../src/game/core/storage'
import {engine} from '../src/game/engine'
import {look} from '../src/game/renderer'
import {makeEntity} from '../src/game/entities'
import {initHound,houndPinner,houndPinOverlay} from '../src/game/engine/houndAI'
import {floorHeight,walkableAt} from '../src/game/world/mapgen'
import '../src/index.css'
const q=new URLSearchParams(location.search),level=Number(q.get('level')??0),seed=Number(q.get('seed')??7391),mode=q.get('mode')==='classic'?'classic':'realistic'
const memory=new Map<string,string>()
storage.get=k=>memory.get(k)??null;storage.set=(k,v)=>{memory.set(k,v)};storage.remove=k=>{memory.delete(k)}
memory.set('br_settings',JSON.stringify({devMode:false,lightMode:mode,textureQuality:2,muted:true,dynamicExposure:false,dynamicRes:false,renderResolution:'native',renderScale:100,maxPixelRatio:1,grain:false,shake:true,tutorial:false}))
engine.seed=seed;engine.loadLevel(level,{mapSeed:seed,firstVisit:false});engine.introT=0
const held=q.get('held');if(held){engine.player.hotbar[0]={type:held,count:1};engine.player.selected=0}
engine.persist();engine.paused=true
const {default:App}=await import('../src/App')
createRoot(document.getElementById('root')!).render(<MemoryRouter><App/></MemoryRouter>)

// 锁步：lockstep 时引擎每帧只在有预算时推进 STEP，渲染层拿同样的 dt；没预算时引擎不动、渲染 dt=0（画面定格，便于截图）
const STEP=1/Number(q.get('fps')??30)
const S={lock:false,budget:0,stepped:false,frames:0,onStep:null as null|(()=>void)}
const upd=engine.update.bind(engine)
engine.update=(dt:number)=>{if(!S.lock)return upd(dt);if(S.budget>0){S.budget--;S.onStep?.();upd(STEP);S.stepped=true}}
let wrapped=false
const wrapRenderer=()=>{const r=(window as any).__renderer;if(!r||wrapped)return!!r;const orig=r.render.bind(r);r.render=(c:any,e:any,o:any,dt:number)=>{const d=S.lock?(S.stepped?STEP:0):dt;S.stepped=false;S.frames++;return orig(c,e,o,d)};wrapped=true;return true}
const raf=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()))
const frames=async(n:number)=>{const f0=S.frames;while(S.frames<f0+n)await raf()}
let hound:any=null
const api={
  engine,look,
  get ready(){return wrapRenderer()&&engine.player.level===level&&!engine.paused&&!document.querySelector('.loading-screen')},
  /** 选一个正前方最空的朝向（4 m 内都能走），俯仰归零 */
  aim(){const m=engine.map!,p=engine.player;let best=0,bd=-1
    for(let k=0;k<72;k++){const yaw=k/72*Math.PI*2,fx=-Math.sin(yaw),fy=-Math.cos(yaw);let d=0
      for(let s=0.25;s<=5;s+=0.25){let ok=true;for(const o of[-0.45,0,0.45]){const x=p.x+fx*s-fy*o,y=p.y+fy*s+fx*o;if(!walkableAt(m,Math.floor(x),Math.floor(y),p.floor)){ok=false;break}}if(!ok)break;d=s}
      if(d>bd){bd=d;best=yaw}}
    look.yaw=best;look.pitch=0;return{yaw:best,free:bd}},
  /** 在准星正前方 dist 米生成一只敌对猎犬，直接进入冲锋（已嚎叫），面朝玩家 */
  spawn(dist=2.6,kind:'hostile'|'ambusher'='hostile'){
    const m=engine.map!,p=engine.player,fx=-Math.sin(look.yaw),fy=-Math.cos(look.yaw)
    const x=p.x+fx*dist,y=p.y+fy*dist
    const e=makeEntity('hound',x,y,floorHeight(m,x,y,p.floor),kind==='ambusher'?'ambusher' as any:undefined)
    initHound(engine,e,false);e.facing=Math.atan2(p.y-y,p.x-x);e.hd!.howled=true;e.hd!.phase='charge';e.attackCd=0
    m.entities.push(e);hound=e;return{x,y,id:e.id,kind:e.def.houndKind??null}
  },
  /** 锁步推进 n 个引擎步（每步一帧渲染），pred 为真时提前停 */
  async step(n:number,pred?:()=>boolean){S.lock=true;for(let i=0;i<n;i++){if(pred?.())return i;S.budget=1;await frames(1)}return n},
  /** 定格后再渲染 n 帧（dt=0，让 HUD / 相机平滑 / CPU 蒙皮都落到当前状态） */
  async settle(n=3){S.lock=true;S.budget=0;await frames(n)},
  free(){S.lock=false;S.budget=0},
  /** 连按交互键 n 下（每下按 2 步、松 2 步） */
  async press(n:number){for(let i=0;i<n&&houndPinner(engine);i++){engine.input.interact=true;await api.step(2);engine.input.interact=false;await api.step(2)}},
  /** 让下一步立刻咬一口（只改撕咬计时，结算走游戏本身） */
  bite(){const s=hound?.hd;if(s)s.biteT=0.001},
  state(){const e=hound,o=houndPinOverlay(engine),p=engine.player,cam=(window as any).__renderer?.camera
    return{phase:e?.hd?.phase,pinned:houndPinner(engine)===e,overlay:o,hp:p.hp,dist:e?Math.hypot(e.x-p.x,e.y-p.y):null,
      cam:cam?{x:cam.position.x,y:cam.position.y,z:cam.position.z,rx:cam.rotation.x,rz:cam.rotation.z,near:cam.near}:null,selected:p.hotbar[p.selected]?.type??null,frames:S.frames}},
  get hound(){return hound},
}
Object.assign(window,{hdPin:api})
