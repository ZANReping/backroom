import type {Engine} from '../engine'
import type {NpcDef} from '../content/npcs'
import {ITEMS, itemName} from '../content/items'
import {FACTIONS, REP_TIER} from '../content/factions'
import {addItem} from './inventory'
import {audio} from '../core/audio'

export type BntgPaymentMode='auto'|'credits'|'cash'
export type BntgBankKind='deposit'|'withdraw'|'purchase'|'exchange'|'service'
export interface BntgBankEntry{id:number;at:number;kind:BntgBankKind;delta:number;balance:number;cashDelta:number;detail:string}
export interface BntgBankState{v:1;balance:number;sequence:number;history:BntgBankEntry[]}
export interface BankResult{ok:boolean;message:string;entry?:BntgBankEntry}
export const BNTG_BALANCE_MAX=999999999
export const freshBntgBank=():BntgBankState=>({v:1,balance:0,sequence:0,history:[]})
export function restoreBntgBank(raw?:Partial<BntgBankState>):BntgBankState{
 const bank=freshBntgBank()
 if(!raw||!Number.isSafeInteger(raw.balance)||raw.balance!<0||raw.balance!>BNTG_BALANCE_MAX)return bank
 bank.balance=raw.balance!;bank.sequence=Number.isSafeInteger(raw.sequence)&&raw.sequence!>=0?Math.min(raw.sequence!,Number.MAX_SAFE_INTEGER-100):0
 const kinds:BntgBankKind[]=['deposit','withdraw','purchase','exchange','service']
 bank.history=(Array.isArray(raw.history)?raw.history:[]).filter(e=>e&&Number.isSafeInteger(e.id)&&e.id>0&&e.id<=Number.MAX_SAFE_INTEGER-100&&Number.isFinite(e.at)&&kinds.includes(e.kind)&&Number.isSafeInteger(e.delta)&&Number.isSafeInteger(e.cashDelta)&&Number.isSafeInteger(e.balance)&&e.balance>=0&&e.balance<=BNTG_BALANCE_MAX&&typeof e.detail==='string').slice(-12).map(e=>({...e,detail:e.detail.slice(0,100)}))
 bank.sequence=Math.max(bank.sequence,...bank.history.map(e=>e.id));return bank
}
const fail=(message:string):BankResult=>({ok:false,message})
const validAmount=(n:number)=>Number.isSafeInteger(n)&&n>0&&n<=BNTG_BALANCE_MAX
export function bntgPaymentPlan(eng:Engine,cost:number,mode:BntgPaymentMode='auto'){
 if(!validAmount(cost)||!['auto','credits','cash'].includes(mode))return null
 const balance=eng.bntgBank.balance,cash=eng.countItem('presses')
 const credit=mode==='cash'?0:mode==='credits'?cost:Math.min(balance,cost),coins=cost-credit
 return credit<=balance&&coins<=cash?{credit,cash:coins}:null
}
export function bntgCashCapacity(eng:Engine){
 const stack=ITEMS.presses.stack
 return [...eng.player.hotbar,...eng.player.backpack].reduce((n,s)=>n+(!s?stack:s.type==='presses'&&s.tag===undefined?Math.max(0,stack-s.count):0),0)
}
/** Only the real, nearby bank terminal can deposit or withdraw cash. */
export function bntgAtmAccessible(eng:Engine,id:string){
 const p=eng.player,m=eng.map
 if(!m?.traders||p.level!==102||eng.over||p.hp<=0||eng.transition)return false
 const s=m.structures.find(s=>s.data?.bntgAtm&&s.data.tradersId===id)
 if(!s)return false
 const x=Math.max(s.x,Math.min(p.x,s.x+s.w)),y=Math.max(s.y,Math.min(p.y,s.y+s.h)),d=Math.hypot(x-p.x,y-p.y)
 const a=Number(s.data?.deg??0)*Math.PI/180,nx=Math.sin(a),ny=Math.cos(a)
 if(d>2.6||Math.abs(p.z)>1||nx*(p.x-s.x-s.w/2)+ny*(p.y-s.y-s.h/2)<0)return false
 return d<.02||eng.los(p.x,p.y,x+(p.x-x)/d*.06,y+(p.y-y)/d*.06)
}
function stageInventory(eng:Engine){
 const staged=Object.create(eng) as Engine
 staged.player={...eng.player,hotbar:eng.player.hotbar.map(s=>s?{...s}:null),backpack:eng.player.backpack.map(s=>s?{...s}:null)}
 staged.syncPassives=()=>{}
 return staged
}
function remove(staged:Engine,type:string,count:number){
 let left=count
 for(const slots of [staged.player.hotbar,staged.player.backpack])for(let i=0;i<slots.length&&left>0;i++){
  const s=slots[i];if(!s||s.type!==type)continue
  const n=Math.min(left,s.count);s.count-=n;left-=n;if(!s.count)slots[i]=null
 }
 return left===0
}
function commit(eng:Engine,staged:Engine,kind:BntgBankKind,delta:number,cashDelta:number,detail:string):BankResult{
 const balance=eng.bntgBank.balance+delta
 if(!Number.isSafeInteger(balance)||balance<0||balance>BNTG_BALANCE_MAX)return fail('账户金额超出可用范围。')
 eng.player.hotbar=staged.player.hotbar;eng.player.backpack=staged.player.backpack;eng.warpBerryLevel=staged.warpBerryLevel
 const entry:BntgBankEntry={id:++eng.bntgBank.sequence,at:Date.now(),kind,delta,balance,cashDelta,detail}
 eng.bntgBank.balance=balance;eng.bntgBank.history=[...eng.bntgBank.history,entry].slice(-12)
 eng.syncPassives();eng.persist();audio.uiTick()
 return{ok:true,message:detail,entry:{...entry}}
}
export function bntgBankTransaction(eng:Engine,atmId:string,kind:'deposit'|'withdraw',amount:number):BankResult{
 if(!bntgAtmAccessible(eng,atmId))return fail('请在银行 ATM 正面办理业务。')
 if(!validAmount(amount))return fail('请输入有效的正整数金额。')
 if(kind!=='deposit'&&kind!=='withdraw')return fail('无效的银行业务。')
 const staged=stageInventory(eng)
 if(kind==='deposit'){
  if(eng.bntgBank.balance+amount>BNTG_BALANCE_MAX)return fail('存入后将超过账户限额。')
  if(!remove(staged,'presses',amount))return fail('随身压印币不足。')
  return commit(eng,staged,kind,amount,-amount,'存入 '+amount+' 枚压印币，入账 '+amount+' 信用点。')
 }
 if(eng.bntgBank.balance<amount)return fail('账户可用信用点不足。')
 if(bntgCashCapacity(eng)<amount)return fail('随身空间不足，请减少取款金额或整理背包。')
 for(let i=0;i<amount;i++)if(!addItem(staged,'presses'))return fail('随身空间不足；本次取款未扣款。')
 return commit(eng,staged,kind,-amount,amount,'取出 '+amount+' 枚压印币，扣除 '+amount+' 信用点。')
}
function merchant(eng:Engine,id:string):NpcDef|null{
 const n=eng.npcs.find(n=>n.id===id&&!n.dead&&!n.hostile)
 if(!n||n.def.faction!=='bntg'||eng.over||eng.player.hp<=0||eng.transition||Math.hypot(n.x-eng.player.x,n.y-eng.player.y)>3.2||(n.floor??0)!==(eng.player.floor??0))return null
 if(FACTIONS.bntg.hasRep&&(eng.rep.bntg??0)<=REP_TIER.noTrade)return null
 return n.def
}
export function bntgPrice(eng:Engine,price:number){
 return Math.max(1,Math.floor(((eng.rep.bntg??0)>=REP_TIER.discount?price*.8:price)*(eng.silverTongueT>0?.95:1)))
}
export function bntgBuy(eng:Engine,npcId:string,item:string,mode:BntgPaymentMode='auto'):BankResult{
 const def=merchant(eng,npcId),stock=def?.currency==='presses'?def.trade?.find(s=>s.item===item):undefined
 if(!stock||!ITEMS[item])return fail('当前商人无法办理这笔购买。')
 const cost=bntgPrice(eng,stock.price),payment=bntgPaymentPlan(eng,cost,mode)
 if(!payment)return fail(mode==='credits'?'信用点不足。':mode==='cash'?'随身压印币不足。':'信用点与随身压印币合计不足。')
 const staged=stageInventory(eng)
 if(!remove(staged,'presses',payment.cash))return fail('背包没有可用空间；本次购买未扣款。')
 const qty=Math.max(1,stock.qty??1)
 for(let i=0;i<qty;i++)if(!addItem(staged,item))return fail('背包没有可用空间；本次购买未扣款。')
 return commit(eng,staged,'purchase',-payment.credit,-payment.cash,'购买 '+itemName(item)+(qty>1?' ×'+qty:'')+'：信用点 '+payment.credit+'，压印币 '+payment.cash+'。')
}
export function bntgBarter(eng:Engine,npcId:string,index:number,mode:BntgPaymentMode='auto'):BankResult{
 const def=merchant(eng,npcId),deal=Number.isSafeInteger(index)&&index>=0?def?.barter?.[index]:undefined
 if(!deal)return fail('当前商人无法办理这笔换物。')
 const staged=stageInventory(eng)
 const give=[[deal.give,deal.giveN],...(deal.give2?[[deal.give2,deal.give2N??1]]:[])] as [string,number][]
 const cost=give.reduce((n,[type,count])=>n+(type==='presses'?count:0),0)
 const payment=cost?bntgPaymentPlan(eng,cost,mode):{credit:0,cash:0}
 if(!payment||!remove(staged,'presses',payment.cash))return fail('所选支付方式余额不足。')
 const {credit,cash}=payment
 for(const [type,count] of give)if(type!=='presses'&&!remove(staged,type,count))return fail(itemName(type)+'不足。')
 for(let i=0;i<deal.getN;i++)if(!addItem(staged,deal.get))return fail('背包没有足够空间；本次换物未扣款。')
 return commit(eng,staged,'purchase',-credit,-cash,'换取 '+itemName(deal.get)+' ×'+deal.getN+'：信用点 '+credit+'，压印币 '+cash+'。')
}
export function bntgExchange(eng:Engine,npcId:string,direction:'buyAlmond'|'sellAlmond',mode:BntgPaymentMode='auto'):BankResult{
 const def=merchant(eng,npcId)
 if(!def?.trade?.length||def.currency!=='presses')return fail('当前柜台不办理货币兑换。')
 const staged=stageInventory(eng)
 if(direction==='sellAlmond'){
  if(!remove(staged,'almond',1))return fail('随身杏仁水不足。')
  if(!addItem(staged,'presses')||!addItem(staged,'presses'))return fail('背包空间不足；兑换未扣款。')
  return commit(eng,staged,'exchange',0,2,'兑换：杏仁水 ×1 → 压印币 ×2。')
 }
 if(direction!=='buyAlmond')return fail('无效的兑换方向。')
 const payment=bntgPaymentPlan(eng,2,mode)
 if(!payment||!remove(staged,'presses',payment.cash))return fail('所选支付方式余额不足。')
 if(!addItem(staged,'almond'))return fail('背包空间不足；兑换未扣款。')
 return commit(eng,staged,'exchange',-payment.credit,-payment.cash,'兑换杏仁水 ×1：信用点 '+payment.credit+'，压印币 '+payment.cash+'。')
}
/** Used only after the caller has validated the actual B.N.T.G. service. */
export function payBntgService(eng:Engine,cost:number,detail:string):BankResult{
 const payment=bntgPaymentPlan(eng,cost),staged=stageInventory(eng)
 if(!payment||!remove(staged,'presses',payment.cash))return fail('信用点与随身压印币合计不足。')
 return commit(eng,staged,'service',-payment.credit,-payment.cash,detail+'：信用点 '+payment.credit+'，压印币 '+payment.cash+'。')
}

