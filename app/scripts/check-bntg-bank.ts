import assert from 'node:assert/strict'
import * as THREE from 'three'
import {freshBntgBank,restoreBntgBank,bntgBankTransaction,bntgBuy,bntgBarter,bntgExchange,bntgPaymentPlan,bntgAtmAccessible,BNTG_BALANCE_MAX} from '../src/game/engine/bntgBank'
import {NPCS} from '../src/game/content/npcs'
import {TRADERS_MARKET_PEOPLE,TRADERS_MARKET_HOMES} from '../src/game/content/tradersMarket'
import {TRADERS_SHOP_PEOPLE,TRADERS_SHOP_HOMES} from '../src/game/content/tradersShops'
import {ITEMS} from '../src/game/content/items'
import {countItem,addItem} from '../src/game/engine/inventory'
import {audio} from '../src/game/core/audio'
import {payWarehouseAccess} from '../src/game/engine/warehouse'
import type {Engine} from '../src/game/engine'
import {TRADERS_FIXED_PEOPLE} from '../src/game/content/tradersLayout'
import {TRADERS_FITOUT} from '../src/game/content/tradersFitout'
import {createTradersMap,restoreTradersWorld,captureTradersWorld} from '../src/game/world/tradersWorld'
import {levelDefOf} from '../src/game/levels'
import {buildTradersAtm} from '../src/game/renderer/tradersAtm'
import type {TradersAssets} from '../src/game/renderer/tradersMeshes'
audio.uiTick=()=>{};audio.pickup=()=>{}
const checks:string[]=[]
function fixture(cash=0,credits=0,id='mkt_moore'){
 const e={player:{x:0,y:-1,z:0,floor:0,hp:100,level:102,hotbar:new Array(7).fill(null),backpack:new Array(24).fill(null)},bntgBank:freshBntgBank(),rep:{bntg:0},silverTongueT:0,warpBerryLevel:null,warehouseTempUnlock:new Set(),msg(){},npcs:[{id,def:TRADERS_MARKET_PEOPLE[id]??TRADERS_SHOP_PEOPLE[id]??NPCS[id],x:0,y:-1,floor:0}],map:{traders:{},structures:[{x:-.54,y:0,w:1.08,h:1.04,data:{bntgAtm:1,tradersId:'atm',deg:180}}]},los:()=>true,syncPassives(){},persist(){this.saved=JSON.stringify({bank:this.bntgBank,player:this.player})},countItem(type:string){return countItem(this as unknown as Engine,type)}} as unknown as Engine
 for(let i=0;i<cash;i++)assert(addItem(e,'presses'))
 e.bntgBank.balance=credits;return e
}
const state=(e:Engine)=>JSON.stringify({bank:e.bntgBank,hotbar:e.player.hotbar,backpack:e.player.backpack,berry:e.warpBerryLevel})
function unchanged(e:Engine,fn:()=>{ok:boolean},label:string){const before=state(e);assert.equal(fn().ok,false,label);assert.equal(state(e),before,label+' atomic');checks.push(label)}
{
 const e=fixture(125);assert(bntgAtmAccessible(e,'atm'));assert(bntgBankTransaction(e,'atm','deposit',100).ok)
 assert.equal(e.countItem('presses'),25);assert.equal(e.bntgBank.balance,100)
 assert(bntgBankTransaction(e,'atm','withdraw',70).ok);assert.equal(e.countItem('presses'),95);assert.equal(e.bntgBank.balance,30)
 assert.equal(e.bntgBank.history.length,2);assert.equal(e.bntgBank.history[1].id,2);assert.equal(e.bntgBank.history[1].cashDelta,70)
 assert((e as any).saved.includes('取出 70'));checks.push('multi-stack 1:1 deposit/withdraw, receipt and immediate save')
 for(const n of [0,-1,.5,NaN,Infinity,1e15])unchanged(e,()=>bntgBankTransaction(e,'atm','deposit',n),'invalid amount '+n)
 unchanged(e,()=>bntgBankTransaction(e,'atm','deposit',96),'insufficient physical cash')
 unchanged(e,()=>bntgBankTransaction(e,'atm','withdraw',31),'insufficient credits')
 unchanged(e,()=>bntgBankTransaction(e,'missing','deposit',1),'unknown terminal')
 e.player.y=2;unchanged(e,()=>bntgBankTransaction(e,'atm','deposit',1),'terminal rear is not usable')
 e.player.y=-10;unchanged(e,()=>bntgBankTransaction(e,'atm','deposit',1),'remote terminal cannot deposit')
 e.player.y=-1;e.player.level=105;unchanged(e,()=>bntgBankTransaction(e,'atm','deposit',1),'ATM restricted to real bank')
 e.player.level=102;e.los=()=>false;unchanged(e,()=>bntgBankTransaction(e,'atm','deposit',1),'blocked sight prevents terminal use')
}
{
 const e=fixture(1,BNTG_BALANCE_MAX);unchanged(e,()=>bntgBankTransaction(e,'atm','deposit',1),'account maximum')
 const full=fixture(0,80);full.player.hotbar.fill({type:'flashlight',count:1});full.player.backpack.fill({type:'flashlight',count:1})
 unchanged(full,()=>bntgBankTransaction(full,'atm','withdraw',1),'full inventory rejects withdrawal')
 full.player.hotbar[0]={type:'presses',count:ITEMS.presses.stack-3}
 unchanged(full,()=>bntgBankTransaction(full,'atm','withdraw',4),'partial cash stack capacity is enforced')
 assert(bntgBankTransaction(full,'atm','withdraw',3).ok);assert.equal(full.countItem('presses'),ITEMS.presses.stack);checks.push('withdrawal uses existing partial stacks')
}
{
 for(const mode of ['auto','credits','cash'] as const){
  const e=fixture(30,10);if(mode==='credits'){unchanged(e,()=>bntgBuy(e,'mkt_moore','headlamp',mode),'credits-only does not spend cash');continue}
  assert(bntgBuy(e,'mkt_moore','headlamp',mode).ok);assert.equal(e.countItem('headlamp'),1)
  assert.equal(e.bntgBank.balance,mode==='auto'?0:10);assert.equal(e.countItem('presses'),mode==='auto'?14:4)
  checks.push(mode+' payment charges the expected credit/cash split')
 }
 const e=fixture(0,100);e.rep.bntg=80;e.silverTongueT=10
 assert(bntgBuy(e,'mkt_moore','headlamp','credits').ok);assert.equal(e.bntgBank.balance,81);checks.push('existing reputation and silver tongue discounts preserved')
 e.player.hotbar.fill({type:'flashlight',count:1});e.player.backpack.fill({type:'flashlight',count:1})
 unchanged(e,()=>bntgBuy(e,'mkt_moore','headlamp','credits'),'full inventory never loses credits')
 e.player.hotbar[0]={type:'presses',count:19};assert(bntgBuy(e,'mkt_moore','headlamp','cash').ok);assert.equal(e.countItem('headlamp'),1);assert.equal(e.countItem('presses'),0);checks.push('payment can release the slot used by purchased goods')
 e.rep.bntg=-30;unchanged(e,()=>bntgBuy(e,'mkt_moore','headlamp','credits'),'reputation refusal remains active')
 const f=fixture(10,100,'kat');unchanged(f,()=>bntgBuy(f,'kat','almond'),'other faction cannot spend BNTG credits')
 const g=fixture(10,100);g.npcs[0].x=8;unchanged(g,()=>bntgBuy(g,'mkt_moore','headlamp'),'merchant must be nearby')
 g.npcs[0].x=0;g.npcs[0].hostile=true;unchanged(g,()=>bntgBuy(g,'mkt_moore','headlamp'),'hostile merchant cannot trade')
 g.npcs[0].hostile=false;g.npcs[0].floor=1;unchanged(g,()=>bntgBuy(g,'mkt_moore','headlamp'),'merchant floor check')
}
{
 for(const mode of ['auto','cash','credits'] as const){
  const a=fixture(30,30,'shop_kat');assert(bntgBuy(a,'shop_kat','cart_4440',mode).ok);assert.equal(a.countItem('cart_4440'),20)
  assert.equal(a.bntgBank.balance,mode==='cash'?30:12);assert.equal(a.countItem('presses'),mode==='cash'?12:30)
  checks.push(mode+' payment buys a complete 20-round box')
 }
 const full=fixture(0,100,'shop_kat');full.player.hotbar.fill({type:'flashlight',count:1});full.player.backpack.fill({type:'flashlight',count:1});full.player.hotbar[0]={type:'cart_4440',count:ITEMS.cart_4440.stack-19}
 unchanged(full,()=>bntgBuy(full,'shop_kat','cart_4440','credits'),'partial ammo box must not consume credit or deliver partial stock')
 const e=fixture(0,10,'candyman'),deal=NPCS.candyman.barter![0]
 assert(bntgBarter(e,'candyman',0,'credits').ok);assert.equal(e.countItem(deal.get),deal.getN);assert.equal(e.bntgBank.balance,10-deal.giveN);checks.push('Candyman accepts credits for original bulk candy deal')
 const f=fixture(0,100,'candyman');f.player.hotbar.fill({type:'flashlight',count:1});f.player.backpack.fill({type:'flashlight',count:1});f.player.hotbar[0]={type:deal.get,count:ITEMS[deal.get].stack-1}
 unchanged(f,()=>bntgBarter(f,'candyman',0,'credits'),'bulk barter output must fit in full')
 const g=fixture(0,100);assert(bntgBuy(g,'mkt_moore','headlamp','credits').ok)
 for(const id of ['vesper','dorian']){const e=fixture(0,20,id);e.player.level=id==='vesper'?105:107;assert(bntgBuy(e,id,'almond','credits').ok);assert.equal(e.bntgBank.balance,18)}checks.push('credits also work at original EL3A and L3 storage merchants')
}
{
 const e=fixture(0,10);assert(bntgExchange(e,'mkt_moore','buyAlmond','credits').ok);assert.equal(e.bntgBank.balance,8);assert.equal(e.countItem('almond'),1)
 assert(bntgExchange(e,'mkt_moore','sellAlmond','credits').ok);assert.equal(e.countItem('presses'),2);assert.equal(e.countItem('almond'),0);assert.equal(e.bntgBank.balance,8);checks.push('coin exchange keeps original 1 almond : 2 presses rate')
 for(let i=0;i<20;i++){e.player.hotbar[0]={type:'presses',count:1};assert(bntgBankTransaction(e,'atm','deposit',1).ok)}
 assert.equal(e.bntgBank.history.length,12);assert.equal(e.bntgBank.history.at(-1)!.id,22)
 const restored=restoreBntgBank(JSON.parse(JSON.stringify(e.bntgBank)));assert.deepEqual(restored,e.bntgBank);restored.history[0].detail='edited';assert.notEqual(restored.history[0].detail,e.bntgBank.history[0].detail)
 assert.deepEqual(restoreBntgBank(),freshBntgBank());assert.deepEqual(restoreBntgBank({balance:-1}),freshBntgBank());assert.equal(restoreBntgBank({balance:1,history:[{...e.bntgBank.history[0],id:Number.MAX_SAFE_INTEGER}]}).history.length,0)
 assert.equal(bntgPaymentPlan(e,-1),null);checks.push('bounded independent ledger, old saves default to zero, invalid save entries rejected')
}
{
 const ids=TRADERS_FIXED_PEOPLE.map(n=>n.id).sort();assert.deepEqual(ids,['candyman','kui','lan','laozhangfang','shen','tang'])
 const map=createTradersMap(levelDefOf(102)!,424242),save=captureTradersWorld(map)!;save.residents.vesper={x:100,y:99} as any;save.residents.dorian={x:100,y:98} as any
 restoreTradersWorld(map,save);assert(!('vesper' in map.traders!.savedResidents));assert(!('dorian' in map.traders!.savedResidents));assert.equal(map.traders!.homes.length,160+TRADERS_MARKET_HOMES.length+TRADERS_SHOP_HOMES.length)
 checks.push('original six plus market/shop residents; stale outside NPC records removed; 154 local residents retained')
}
{
 const e=fixture(4,3,'vesper');assert(payWarehouseAccess(e,'bntg'));assert.equal(e.bntgBank.balance,0);assert.equal(e.countItem('presses'),2)
 const before=state(e);assert(payWarehouseAccess(e,'bntg'));assert.equal(state(e),before,'already unlocked warehouse is not charged twice')
 e.warehouseTempUnlock.clear();assert.equal(payWarehouseAccess(e,'bntg'),false);assert.equal(state(e),before,'insufficient service payment remains atomic')
 checks.push('existing temporary warehouse fee accepts mixed payment once per dialogue')
}
const mats=new Map<string,THREE.Material>(),assets={material:(surface:string,color:string)=>{const k=surface+color;let m=mats.get(k);if(!m){m=new THREE.MeshStandardMaterial({color});mats.set(k,m)}return m},labelGeometry:(_t:string,w:number,h:number)=>new THREE.PlaneGeometry(w,h),signGeometry:(_t:string,w:number,h:number)=>new THREE.PlaneGeometry(w,h)} as unknown as TradersAssets
const models=[]
for(const s of TRADERS_FITOUT.filter(s=>s.data?.bntgAtm)){
 const root=buildTradersAtm(s,assets);root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root)
 assert(box.min.x>=s.x-.01&&box.max.x<=s.x+s.w+.01&&box.min.z>=s.y-.01&&box.max.z<=s.y+s.h+.01,'ATM mesh/collider footprint alignment')
 assert(box.min.y>=-.01&&box.max.y<=2.01);let triangles=0,meshes=0
 root.traverse(o=>{if((o as THREE.Mesh).isMesh){meshes++;const g=(o as THREE.Mesh).geometry;triangles+=(g.index?.count??g.getAttribute('position').count)/3;for(const k of ['position','normal','uv'])assert([...g.getAttribute(k).array].every(Number.isFinite));g.dispose()}})
 assert(triangles<=3000&&meshes<=11,'ATM model budget')
 models.push({id:s.data!.tradersId,triangles,meshes,bounds:[box.min.toArray(),box.max.toArray()]})
}
assert.equal(models.length,2);checks.push('two finite low-poly ATM models with matching collision footprint')
const sample=TRADERS_FITOUT.find(s=>s.data?.bntgAtm)!,first=buildTradersAtm(sample,assets),second=buildTradersAtm(sample,assets),secondGeometry=new Set<THREE.BufferGeometry>()
let disposedSecond=0,disposedMaterials=0
second.traverse(o=>{if((o as THREE.Mesh).isMesh){const g=(o as THREE.Mesh).geometry;secondGeometry.add(g);g.addEventListener('dispose',()=>disposedSecond++)}})
for(const m of mats.values())m.addEventListener('dispose',()=>disposedMaterials++)
first.traverse(o=>{if((o as THREE.Mesh).isMesh){const g=(o as THREE.Mesh).geometry;assert(!secondGeometry.has(g));g.dispose()}})
assert.equal(disposedSecond,0);assert.equal(disposedMaterials,0)
second.traverse(o=>{if((o as THREE.Mesh).isMesh)(o as THREE.Mesh).geometry.dispose()})
checks.push('recycling one ATM preserves second-instance geometry and shared materials')
for(const mat of mats.values())mat.dispose()
console.log(JSON.stringify({ok:true,checks,models},null,2))
