import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync,existsSync} from 'node:fs'
import {ITEMS} from '../src/game/content/items'
import {NPCS} from '../src/game/content/npcs'
import {TRADERS_ROOMS,TRADERS_FIXED_PEOPLE,tradersContains} from '../src/game/content/tradersLayout'
import {TRADERS_MARKET_PROPS,TRADERS_MARKET_PEOPLE,TRADERS_MARKET_HOMES,MARKET_DEPTS,MARKET_PRICES,MARKET,MARKET_RESERVED_DEPTS,MARKET_RESERVED_PEOPLE} from '../src/game/content/tradersMarket'
import {SQUIRT_LIQUID_SRC,squirtActsAsWater} from '../src/game/content/squirtLiquids'
import {TRADERS_SIGN_ATLAS} from '../src/game/content/tradersSignAtlas'
import {TRADERS_SIGN_FOR_TEXT,tradersRoomSign} from '../src/game/content/tradersSigns'
import {tradersDressingColliders} from '../src/game/content/tradersDressingShapes'
import {createTradersResident} from '../src/game/content/tradersPeople'
let checks=0;const ok=(v:unknown,m:string)=>{assert(v,m);checks++}
const A=TRADERS_ROOMS.find(r=>r.id==='anchor_A')!
ok(A.name.includes('批发市场'),'anchor A is the wholesale market')
// Signs: every mapped/used key is in the AI atlas, with a real UV rect, and the atlas file ships.
ok(existsSync('public/textures/traders/signs_atlas.jpg')&&existsSync('public/textures/traders/goods_atlas.jpg'),'sign + goods atlases ship')
const keys=Object.keys(TRADERS_SIGN_ATLAS);ok(keys.length>=100,'≥100 unique AI signs')
for(const [k,[u0,v0,u1,v1,a]] of Object.entries(TRADERS_SIGN_ATLAS))ok(u1>u0&&v1>v0&&u0>=0&&v1<=1&&a>0,'atlas rect '+k)
for(const k of Object.values(TRADERS_SIGN_FOR_TEXT))ok(TRADERS_SIGN_ATLAS[k],'mapped sign '+k)
for(const r of TRADERS_ROOMS)if(r.kind!=='vault')ok(tradersRoomSign(r.id),'room has its own sign '+r.id)
for(const id of ['west','north','east'])ok(TRADERS_SIGN_ATLAS['gate_'+id]&&TRADERS_SIGN_ATLAS['exit_'+id],'gate signs '+id)
for(const s of TRADERS_MARKET_PROPS)if(s.data?.sign)ok(TRADERS_SIGN_ATLAS[String(s.data.sign)],'market prop sign '+s.data.sign)
// Market props stay inside anchor A and do not block the doorway.
for(const s of TRADERS_MARKET_PROPS){
 ok(tradersContains(A,s.x+s.w/2,s.y+s.h/2),'inside anchor A '+s.data?.tradersId)
 if(s.solid)ok(!(s.x<MARKET.door+3.6&&s.x+s.w>MARKET.door-3.6&&s.y+s.h>A.y+A.h-1.2),'door clear '+s.data?.tradersId)
}
const solids=TRADERS_MARKET_PROPS.flatMap(s=>tradersDressingColliders(s)).filter(c=>c.bottom<1.8)
const inside=(x:number,y:number,r=.3)=>solids.some(c=>x+r>c.x0&&x-r<c.x1&&y+r>c.y0&&y-r<c.y1)
ok(!inside(MARKET.door,A.y+A.h-2)&&!inside(MARKET.door,A.y+A.h/2),'power aisle walkable')
// Vendors: one per department, standing free behind their counter, selling existing basic items at fixed prices.
ok(MARKET_DEPTS.length===8,'8 departments')
for(const d of MARKET_DEPTS){
 const v=TRADERS_MARKET_PEOPLE[d.vendor],h=TRADERS_MARKET_HOMES.find(h=>h.id===d.vendor)!
 ok(v&&v.trade&&v.trade.length>=2&&v.currency==='presses','vendor trades '+d.vendor)
 ok(v.lines[0].opts.some(o=>o.action==='trade'),'vendor dialogue opens shop '+d.vendor)
 for(const t of v.trade!)ok(ITEMS[t.item]&&t.price===MARKET_PRICES[t.item]&&t.price>0,'priced item '+t.item)
 ok(!inside(h.x,h.y,.28),'vendor not inside a collider '+d.vendor)
 ok(Math.cos(h.facing)*-d.side>.99,'vendor faces the power aisle (engine facing = atan2(dy,dx)) '+d.vendor)
 const aisle=d.side<0?MARKET.aisle0:MARKET.aisle1;ok(Math.abs(aisle-h.x)<2.4,'vendor within talk range of the aisle '+d.vendor)
}
// v2（2026-10-23）：右侧四个档口换成特种液体 / 口粮杂货 / 急救箱 / 燃料能源；五金/工装/日用/户外老板预留不刷出。
const sells=(id:string)=>MARKET_DEPTS.find(d=>d.id===id)&&TRADERS_MARKET_PEOPLE[MARKET_DEPTS.find(d=>d.id===id)!.vendor].trade!.map(t=>t.item).join(',')
ok(sells('liquids')==='cashew,liquidpain,memoryjuice,laughrepellent','liquids stall stock')
ok(sells('rations')==='royalration,babelbalm','rations stall stock')
ok(sells('medkits')==='outdoorkit,traumakit','medkit stall stock')
ok(sells('fuel')==='firesalt,gas,saltbox,capacitor','fuel stall stock')
for(const d of MARKET_RESERVED_DEPTS){ok(MARKET_RESERVED_PEOPLE[d.vendor]?.trade?.length,'reserved vendor kept '+d.vendor);ok(!TRADERS_MARKET_PEOPLE[d.vendor]&&!TRADERS_MARKET_HOMES.some(h=>h.id===d.vendor),'reserved vendor not in anchor A '+d.vendor);ok(!TRADERS_MARKET_PROPS.some(s=>s.data?.dept===d.id),'no reserved stall '+d.id)}
for(const t of ['memoryjuice','laughrepellent','babelbalm','outdoorkit','traumakit','saltbox'])ok(ITEMS[t]&&existsSync(`public/textures/icons/pixel/item_${t}.png`),'new item + pixel icon '+t)
ok(ITEMS.outdoorkit.charges===4&&ITEMS.traumakit.charges===8&&ITEMS.traumakit.value!>ITEMS.outdoorkit.value!&&ITEMS.outdoorkit.stack===1&&ITEMS.traumakit.stack===1,'medkits are multi-use (4 / 8 charges, single-slot)')
ok(ITEMS.babelbalm.use==='none'&&ITEMS.laughrepellent.use==='none'&&ITEMS.memoryjuice.use==='none','balm/repellent/juice have no direct use')
ok(SQUIRT_LIQUID_SRC.memoryjuice==='memoryjuice'&&SQUIRT_LIQUID_SRC.laughrepellent==='laughrepellent'&&squirtActsAsWater('memoryjuice')&&squirtActsAsWater('laughrepellent')&&!squirtActsAsWater('almond'),'memory juice / laugh repellent load into the squirt gun as water')
ok(existsSync('public/textures/items-refined/market/color.png')&&existsSync('public/textures/items-refined/market/normal.png'),'market item atlas ships')
for(const d of MARKET_DEPTS)ok(TRADERS_SIGN_ATLAS[d.sign],'dept sign in atlas '+d.sign)
for(const h of TRADERS_MARKET_HOMES){ok(TRADERS_MARKET_PEOPLE[h.id],'home has def '+h.id);ok(tradersContains(A,h.x,h.y),'home in market '+h.id);ok(!inside(h.x,h.y,.25),'home free '+h.id)}
ok(new Set(TRADERS_MARKET_HOMES.map(h=>h.id)).size===TRADERS_MARKET_HOMES.length&&!TRADERS_MARKET_HOMES.some(h=>TRADERS_FIXED_PEOPLE.some(f=>f.id===h.id)),'unique market ids')
for(const id of Object.keys(TRADERS_MARKET_PEOPLE))ok(!NPCS[id],'market people are local defs, not global NPCS '+id)
// Former outside traders no longer sell; candyman is untouched.
for(const id of ['tang','shen','laozhangfang']){ok(!NPCS[id].trade?.length&&!NPCS[id].barter?.length,'no shop '+id);ok(!NPCS[id].lines.some(l=>l.opts.some(o=>o.action==='trade')),'no trade option '+id)}
ok(NPCS.candyman.barter?.length,'candyman keeps his candy barter')
// BNTG text: no Chinese-traditional trade idioms, no Chinese surnames on Traders residents.
const bntgText=Object.values(NPCS).filter(d=>d.faction==='bntg').map(d=>JSON.stringify([d.personality,d.background,d.lines,d.idle,d.role])).join('')+JSON.stringify(Object.values(TRADERS_MARKET_PEOPLE))+JSON.stringify(Object.values(MARKET_RESERVED_PEOPLE))
for(const w of ['算盘','账房','掌柜','童叟无欺','走南闯北','玉器','号子','口诀'])ok(!bntgText.includes(w),'no idiom '+w)
const zh=new Set(['陈','周','林','赵','吴','何','沈','顾','陆','苏','叶','韩','白','方','许','唐','罗','梁','温','邱','秦','江','石','尹','钟','萧','梅','严','魏','冯','杜','程'])
for(let i=0;i<154;i++){const n=createTradersResident(i,1).def.name,last=n.split('·').at(-1)!;ok(!zh.has(last),'western surname '+n)}
mkdirSync('reports/traders-market',{recursive:true})
writeFileSync('reports/traders-market/check.json',JSON.stringify({checks,signs:keys.length,props:TRADERS_MARKET_PROPS.length,people:TRADERS_MARKET_HOMES.length,vendors:MARKET_DEPTS.length,items:Object.keys(MARKET_PRICES).length},null,2))
console.log(`Traders market: ${checks} checks passed (${keys.length} AI signs, ${TRADERS_MARKET_PROPS.length} props, ${TRADERS_MARKET_HOMES.length} people)`)
