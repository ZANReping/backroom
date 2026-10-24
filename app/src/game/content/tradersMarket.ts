import type {Structure} from '../core/types'
import type {NpcDef} from './npcs'
import {TRADERS_ROOMS,tradersContains,type TradersRect} from './tradersLayout'
import {placedTradersStructure} from './tradersDressingShapes'

/**
 * 主力店 A · B.N.T.G. 批发市场（TRADERS WHOLESALE）
 * 参考美式仓储批发卖场（Restaurant Depot / 会员制仓储店）+ 批发市场的「档口」经营：
 *   南侧入口：结算台 ×3、会员服务台、购物车区、营业告示；
 *   中央主通道（power aisle）两侧各 4 个部门档口：档口老板站在柜台后，按原价出售基础物资；
 *   东西两翼：整托货架（AISLE 1–6），三层横梁、整托收缩膜货物；
 *   北侧：收货区（卸货门、叉车、托盘堆、缠膜机）。
 * 所有 NPC 都是本地客户端居民（不进联机协议）。
 */
export const MARKET_ROOM=TRADERS_ROOMS.find(r=>r.id==='anchor_A')!
const R=MARKET_ROOM
/** Local market frame helpers (metres, world space). */
export const MARKET={x0:R.x,y0:R.y,x1:R.x+R.w,y1:R.y+R.h,door:R.x+R.w/2,aisle0:R.x+R.w/2-4,aisle1:R.x+R.w/2+4}

export interface MarketDept{id:string;sign:string;name:string;color:string;goods:'water'|'grocery'|'pharmacy'|'power'|'hardware'|'workwear'|'office'|'outdoor'|'liquids'|'rations'|'medkits'|'fuel';side:-1|1;row:number;vendor:string}
export const MARKET_DEPTS:readonly MarketDept[]=[
 {id:'water',sign:'mk_water',name:'饮用水与饮料',color:'#1f4fa8',goods:'water',side:-1,row:0,vendor:'mkt_webb'},
 {id:'grocery',sign:'mk_grocery',name:'食品与干货',color:'#b3262d',goods:'grocery',side:-1,row:1,vendor:'mkt_ortiz'},
 {id:'pharmacy',sign:'mk_pharmacy',name:'药房与急救',color:'#2c8a4a',goods:'pharmacy',side:-1,row:2,vendor:'mkt_hartfield'},
 {id:'power',sign:'mk_power',name:'照明与电池',color:'#d9b21c',goods:'power',side:-1,row:3,vendor:'mkt_moore'},
 // 批发市场 v2（2026-10-23）：右侧四个档口换成特种液体 / 口粮与杂货 / 急救箱 / 燃料与能源。
 {id:'liquids',sign:'mk_liquids',name:'特种液体',color:'#c4740f',goods:'liquids',side:1,row:0,vendor:'mkt_crane'},
 {id:'rations',sign:'mk_rations',name:'口粮与杂货',color:'#4a2380',goods:'rations',side:1,row:1,vendor:'mkt_beaumont'},
 {id:'medkits',sign:'mk_medkits',name:'急救箱',color:'#d0202a',goods:'medkits',side:1,row:2,vendor:'mkt_ramos'},
 {id:'fuel',sign:'mk_fuel',name:'燃料与能源',color:'#2a2b2e',goods:'fuel',side:1,row:3,vendor:'mkt_haskell'},
]
/**
 * 预留档口（v2 起不在主力店 A 出现）：五金工具 / 工装与防护 / 日用与办公 / 户外露营。
 * 定义与老板（MARKET_RESERVED_PEOPLE）原样保留，side/row 只是原位置记录；以后放到别处时直接取用。
 * 它们的 AI 标牌（mk_hardware 等）源图保留在工具目录，当前不打进标牌图集。
 */
export const MARKET_RESERVED_DEPTS:readonly MarketDept[]=[
 {id:'hardware',sign:'mk_hardware',name:'五金工具',color:'#e06a22',goods:'hardware',side:1,row:0,vendor:'mkt_blankenship'},
 {id:'workwear',sign:'mk_workwear',name:'工装与防护',color:'#1d2c55',goods:'workwear',side:1,row:1,vendor:'mkt_grant'},
 {id:'office',sign:'mk_office',name:'日用与办公',color:'#178a95',goods:'office',side:1,row:2,vendor:'mkt_pinkney'},
 {id:'outdoor',sign:'mk_outdoor',name:'户外露营',color:'#2d6a3a',goods:'outdoor',side:1,row:3,vendor:'mkt_jorgensen'},
]
const STALL=12,STALL_GAP=1,STALL_Y0=MARKET.y0+15.6
export function marketStall(d:MarketDept){
 const cy=STALL_Y0+d.row*(STALL+STALL_GAP)+STALL/2,cx=d.side<0?MARKET.aisle0-STALL/2-.5:MARKET.aisle1+STALL/2+.5
 // Local +z (the stall front) faces the power aisle.
 return{cx,cy,deg:d.side<0?90:-90}
}
/** Vendor stands 1.65 m behind the counter front, facing the aisle. */
export function marketVendorSpot(d:MarketDept){const s=marketStall(d);return{x:s.cx+(d.side<0?4.3:-4.3),y:s.cy,facing:d.side<0?0:Math.PI}}

const props:Structure[]=[]
function put(kind:string,id:string,cx:number,cy:number,w:number,d:number,deg:number,solid:boolean,extra:Record<string,unknown>={}){
 props.push(placedTradersStructure('trade_counter',cx,cy,w,d,solid,{tradersId:'market.'+id,tradersModel:'dressing',dressing:kind,tradersProp:'market',deg,roomId:R.id,variant:props.length%3,...extra}))
}
// Department stalls (counter, back/side shelving, pallet displays, hanging department sign).
for(const d of MARKET_DEPTS){const s=marketStall(d);put('mkStall','stall.'+d.id,s.cx,s.cy,STALL,STALL,s.deg,true,{dept:d.id,goods:d.goods,sign:d.sign,height:4.85})}
// Bulk pallet racking wings (AISLE 1-3 west, 4-6 east), split into 8.1 m runs for chunk streaming.
const RACK_Y0=STALL_Y0,RACK_Y1=STALL_Y0+4*STALL+3*STALL_GAP,RUN=8.1
const rackLines:{x:number;face:1|-1;aisle:number}[]=[
 {x:MARKET.x0+.75,face:1,aisle:1},{x:MARKET.x0+6.3,face:-1,aisle:1},{x:MARKET.x0+7.45,face:1,aisle:2},{x:MARKET.x0+13.0,face:-1,aisle:2},
 {x:MARKET.x1-.75,face:-1,aisle:6},{x:MARKET.x1-6.3,face:1,aisle:6},{x:MARKET.x1-7.45,face:-1,aisle:5},{x:MARKET.x1-13.0,face:1,aisle:5},
]
const GOODS_ORDER=MARKET_DEPTS.map(d=>d.goods)
rackLines.forEach((l,li)=>{
 for(let i=0,y=RACK_Y0;y+RUN<=RACK_Y1+.01;i++,y+=RUN+.3)put('mkRack','rack.'+li+'.'+i,l.x,y+RUN/2,RUN,1.1,l.face>0?90:-90,true,{height:4.25,goods:GOODS_ORDER[(li*3+i)%8],seed:li*31+i})
})
// Aisle markers above each bulk aisle, both ends; plus wholesale banner across the power aisle.
const aisleX=[MARKET.x0+3.5,MARKET.x0+10.2,MARKET.x0+15,MARKET.x1-15,MARKET.x1-10.2,MARKET.x1-3.5]
aisleX.forEach((x,i)=>{for(const [end,y] of [[0,RACK_Y1+1.2],[1,RACK_Y0-1.2]] as const)put('mkHangSign','aisle.'+(i+1)+'.'+end,x,y,1.05,.06,0,false,{sign:'mk_aisle'+(i+1),bottom:2.75,height:4.8,signH:1.25})})
put('mkHangSign','banner.prices',MARKET.door,RACK_Y1+2.6,6.4,.05,0,false,{sign:'mk_prices',bottom:3.25,height:4.8,signH:1.25})
// Front end: three checkout lanes, member services, cart corral, store info board.
const FRONT=MARKET.y1-7.2
for(let i=0;i<3;i++){
 const x=MARKET.x0+6.5+i*6.6
 put('mkCheckout','checkout.'+(i+1),x,FRONT+.4,4.6,1.15,90,true,{lane:i+1,sign:'mk_lane'+(i+1),height:3.2})
}
put('mkService','members',MARKET.aisle1+10.5,MARKET.y1-4.1,9,1.15,180,true,{sign:'mk_members',height:4.85})
put('mkCarts','carts',MARKET.aisle0-4.4,MARKET.y1-2.3,4.6,2.4,0,true,{sign:'mk_carts',height:2.1})
put('mkBoard','hours',MARKET.aisle1+1.9,MARKET.y1-.55,1.1,.25,180,true,{sign:'mk_hours',height:2.3})
// Receiving (north): two painted dock doors, forklift, pallet stacks, stretch-wrapper, pallet jacks.
for(const [i,x] of [MARKET.x0+19,MARKET.x1-19].entries()){
 put('mkDockDoor','dock.'+i,x,MARKET.y0+.2,4.85,3.0,0,false,{sign:i?'mk_forklift':'mk_receiving',height:4.6})
}
put('mkForklift','forklift',MARKET.door-7.5,MARKET.y0+7.2,1.25,3.75,25,true,{height:2.3})
put('mkWrap','wrapper',MARKET.door+8.2,MARKET.y0+4.2,1.7,1.7,0,true,{height:2.4})
put('mkJack','jack.0',MARKET.door+2.2,MARKET.y0+9.4,.68,1.6,-12,true,{height:1.2})
put('mkJack','jack.1',MARKET.x0+29,MARKET.y0+3.2,.68,1.6,90,true,{height:1.2})
for(let i=0;i<10;i++){
 const col=i%5,row=Math.floor(i/5),x=MARKET.x0+16+col*2.2+(row?24.5:0),y=MARKET.y0+3.4+(col%2)*.2+(row?4.4:0)
 put('mkPalletStack','staged.'+i,x,y,1.22,1.02,(i*17)%5-2,true,{height:.9+((i*7)%4)*.35,goods:GOODS_ORDER[(i*5)%8],seed:i})
}
for(let i=0;i<4;i++)put('mkPalletStack','empty.'+i,MARKET.x1-5.5-i*.08,MARKET.y0+3+i*.03,1.22,1.02,i*3,true,{height:.14*(i+1)+.05,empty:1,seed:i})
// Floor: power-aisle safety lines and front-end mats (non-solid, drawn on the slab).
put('mkFloor','floor',MARKET.door,(MARKET.y0+MARKET.y1)/2,R.w-.6,R.h-.3,0,false,{height:.02})

export const TRADERS_MARKET_PROPS:readonly Structure[]=props
export function tradersMarketForChunk(cx:number,cy:number):Structure[]{
 const b:TradersRect={x:cx*32,y:cy*32,w:32,h:32}
 return props.filter(s=>tradersContains(b,s.x+s.w/2,s.y+s.h/2)).map(s=>({...s,data:{...s.data}}))
}

// ---------------- People ----------------
type Avatar=NpcDef['avatar']
const chat=(npc:string,opts:NpcDef['lines'][number]['opts'])=>({npc,opts})
function vendor(id:string,name:string,role:string,personality:string,background:string,top:string,avatar:Avatar,trade:NpcDef['trade'],hello:string,tip:string,idle:string[]):NpcDef{
 return{id,name,role,faction:'bntg',personality,background,uniform:{top,topStyle:2,badge:'#e8e6dc'},avatar,currency:'presses',trade,communityGear:'apron',wanderRadius:0,
  lines:[chat(hello,[{text:'看看货。',action:'trade'},{text:'有什么建议？',next:1},{text:'回头再来。',action:'leave'}]),chat(tip,[{text:'那就看看货。',action:'trade'},{text:'谢了。',action:'leave'}])],idle}
}
function staff(id:string,name:string,role:string,personality:string,background:string,top:string,avatar:Avatar,lines:NpcDef['lines'],idle:string[],gear:NonNullable<NpcDef['communityGear']>,wander=0):NpcDef{
 return{id,name,role,faction:'bntg',personality,background,uniform:{top,topStyle:3,badge:'#e8e6dc'},avatar,currency:'presses',communityGear:gear,wanderRadius:wander,lines,idle}
}
/** 原价：沿用游戏里已有的压印币价格（杏仁水 2、电池 2、罐头 2、绷带 1、头灯 26…），未定价的基础物资按同一档次补齐。 */
export const MARKET_PRICES:Readonly<Record<string,number>>={almond:2,citywater:1,coffee:2,luckymilk:3,canned:2,driedfruit:2,dryshrimp:3,bandage:1,disinfectant:4,sedative:2,battery:2,flashlight:14,headlamp:26,glowstick:1,uvlamp:34,crowbar:5,wrench:6,nails:1,timber:2,fuse:3,axe:52,knife:12,gloves:10,suit:18,cavingsuit:30,divemask:24,notebook:16,stapler:2,lighter:4,stonekazoo:20,rope:8,
 // v2 新档口：杏仁水 1 瓶 = 2 压印币为基准（记忆汁一罐≈20 瓶杏仁水 → 40；皇家口粮沿用「算盘」30 杏仁水 → 60）
 cashew:3,liquidpain:40,memoryjuice:40,laughrepellent:60,royalration:60,babelbalm:15,outdoorkit:18,traumakit:45,firesalt:6,gas:22,saltbox:28,capacitor:30}
const T=(...ids:string[])=>ids.map(item=>({item,price:MARKET_PRICES[item]}))
const P:Record<string,NpcDef>={}
const add=(d:NpcDef)=>{P[d.id]=d}
const RES:Record<string,NpcDef>={}
const reserve=(d:NpcDef)=>{RES[d.id]=d}
add(vendor('mkt_webb','德洛丽丝·韦伯','档口老板 · 饮用水与饮料','爽快利落，说话像报价单，从不让客人等第二句。','在跃金段跑了十几年饮料批发，进了商人之家后把整个水区的托盘都编了号。','#2a5aa8',{gender:1,hair:4,hairColor:'#6b4a2e',skin:'#e6bfa0',pants:'#2e3440',pantsStyle:0,face:2},T('almond','citywater','coffee','luckymilk'),'水区，德洛丽丝。杏仁水、自来水、咖啡、豆奶——整箱单瓶都按牌价，不讲价。','长途就带杏仁水，压精神；自来水解渴不顶饱，别指望它。',['这排托盘又被谁挪了？','杏仁水补货到 12 号位。','冷柜温度正常。']))
add(vendor('mkt_ortiz','曼尼·奥尔蒂斯','档口老板 · 食品与干货','嗓门大、心肠软，称重时总多给半两。','以前在 Gemma 的伙房掌勺，后来干脆把伙房的进货渠道带到了批发市场。','#b3262d',{gender:0,hair:12,hairColor:'#1d1b1a',skin:'#b98563',pants:'#2b2b2b',pantsStyle:0,face:1},T('canned','driedfruit','dryshrimp'),'嘿，朋友！罐头、干果、旱虾，都是今早刚点过数的。','罐头最耐放，干果补维生素——长期在暗处走的人别省这点钱。',['罐头箱子别摞太高！','旱虾这批个头不错。','今天的出货单比昨天长。']))
add(vendor('mkt_hartfield','朱恩·哈特菲尔德','档口老板 · 药房与急救','说话轻、手很稳，看一眼伤口就知道你缺什么。','前希波克拉底外勤护士，如今在批发市场开了药房档口，只卖靠得住的东西。','#2c8a4a',{gender:1,hair:9,hairColor:'#c8a46a',skin:'#f0c8a8',pants:'#3a4048',pantsStyle:0,face:0},T('bandage','disinfectant','sedative'),'药房，朱恩。绷带、消毒液、镇定剂。有伤先处理，再来买东西。','早期感染一瓶消毒液就够，拖久了谁也救不回来。',['绷带补到三层了。','消毒液别跟火油放一起。','镇定剂要登记批号。']))
add(vendor('mkt_moore','雷吉·摩尔','档口老板 · 照明与电池','话少、爱试灯，每个手电都要亲手打开看一遍。','曾在 Level 1 的仓库区修了五年照明线路，比谁都清楚黑暗里缺什么。','#2b2b2b',{gender:0,hair:2,hairColor:'#1a1a1a',skin:'#7b5238',pants:'#32353a',pantsStyle:0,face:0},T('battery','flashlight','headlamp','glowstick','uvlamp'),'照明区。电池、手电、头灯、荧光棒、紫外灯。先试灯，再付钱。','头灯解放双手；荧光棒扔出去能照路，记得捡回来。',['这只头灯接触不良，退回去。','电池按批次轮换。','UV 灯别对着眼睛。']))
reserve(vendor('mkt_blankenship','厄尔·布兰肯希普','档口老板 · 五金工具','慢条斯理，掂一掂就知道扳手是不是好钢。','在 Level 3 的电站干过管道维修，退下来后把一整套工具铺子搬进了批发市场。','#e06a22',{gender:0,hair:3,hairColor:'#8f8f92',skin:'#d9a882',pants:'#3b3426',pantsStyle:0,face:1},T('crowbar','wrench','nails','timber','fuse','axe','knife'),'五金区，厄尔。撬棍、扳手、钉子、木板、保险丝，还有斧头和刀。','钉子配木板能把门钉死一阵子；电梯井要两枚保险丝，别买少了。',['这批钉子有点锈。','斧头要上油了。','保险丝按规格摆好。']))
reserve(vendor('mkt_grant','塔妮莎·格兰特','档口老板 · 工装与防护','雷厉风行，一眼量出你的尺码。','前 TGPF 装备管理员，熟悉每一种防护服的极限。','#1d2c55',{gender:1,hair:10,hairColor:'#1a1412',skin:'#6e4a33',pants:'#24293a',pantsStyle:0,face:2},T('gloves','suit','cavingsuit','divemask'),'防护区，塔妮莎。隔热手套、绝缘服、保温服、潜水面罩——按你要去的层级挑。','去蒸汽管道多的地方带手套，电弧多的地方穿绝缘服，别混着来。',['绝缘服按尺码挂好。','面罩的密封圈检查过了。','保温服又到一批。']))
reserve(vendor('mkt_pinkney','霍华德·平克尼','档口老板 · 日用与办公','一丝不苟，连订书机都按型号排队。','原 M.E.G. 档案室文员，转行做文具和日用品批发后再也没回去。','#178a95',{gender:0,hair:9,hairColor:'#3b2a20',skin:'#f0c8a8',pants:'#2f3a3e',pantsStyle:0,face:0},T('notebook','stapler','lighter','stonekazoo'),'日用区。笔记本、订书机、打火机……还有那支石头卡祖笛，别问我为什么卖得好。','笔记本记路线最靠谱；订书机扔出去能引开注意力，懂的都懂。',['笔记本又卖断一箱。','打火机换了新批次。','卡祖笛又有人来问。']))
reserve(vendor('mkt_jorgensen','卡尔·约根森','档口老板 · 户外露营','乐呵呵的大个子，讲起绳结来停不下来。','跑了多年远征补给，结过的绳结比走过的楼层还多。','#2d6a3a',{gender:0,hair:7,hairColor:'#b07a3a',skin:'#e8b894',pants:'#3a3a2c',pantsStyle:0,face:1},T('rope','lighter','knife','driedfruit'),'户外区，卡尔！尼龙绳、打火机、刀、干粮——出远门的基本盘。','去 Level 7 前一定带绳子，掉水里爬不回入口房间可不是闹着玩的。',['这卷绳子还能再盘紧点。','露营区的样品又被人摸乱了。','今天来问 Level 7 的人不少。']))
// 批发市场 v2：右侧四个新档口
add(vendor('mkt_crane','维奥莱特·克兰','档口老板 · 特种液体','说话轻、手套从不摘，每只瓶子都要对着灯看一眼才肯放下。','前 M.E.G. 化学组技术员，专门处理「长得像杏仁水但不是」的液体，后来干脆在批发市场开了这间档口。','#c4740f',{gender:1,hair:5,hairColor:'#8a5a32',skin:'#f0c8a8',pants:'#2e3138',pantsStyle:0,face:2},T('cashew','liquidpain','memoryjuice','laughrepellent'),'特种液体，维奥莱特。腰果水、液态痛苦、记忆汁液，还有驱笑剂——全部按罐、按瓶卖，柜台上不许开封。','都能装进滋水枪：液态痛苦和腰果水是武器；记忆汁液和失效的驱笑剂装进去就跟清水一样。记忆汁千万别喝，会上瘾。',['这瓶标签又花了。','液态痛苦放最底层。','驱笑剂？早就没用了，收藏的人倒不少。']))
add(vendor('mkt_beaumont','西奥多·博蒙特','档口老板 · 口粮与杂货','慢条斯理，总穿着熨平的马甲，报价前先清清嗓子。','在多语言前哨做过十年翻译，后来改行倒卖紧俏小货：皇家口粮和巴别润唇膏都是他从前哨渠道收来的。','#4a2380',{gender:0,hair:9,hairColor:'#b9b4aa',skin:'#e6bfa0',pants:'#2b2733',pantsStyle:0,face:0},T('royalration','babelbalm'),'口粮与杂货，西奥多·博蒙特。皇家口粮、巴别润唇膏——货少，但件件是硬通货。','皇家口粮别急着吃，拿去以物易物，能换到真正的好东西。润唇膏嘛……前哨的翻译们一天能用掉半盒。',['这盒口粮的缎带歪了。','润唇膏补到第二层。','又有人问我口粮能不能拆开卖。']))
add(vendor('mkt_ramos','卡门·拉莫斯','档口老板 · 急救箱','干脆利落，说话像在念急救流程。','前希波克拉底外勤急救员，跑过几十趟伤员转运，如今专做整箱急救包批发。','#d0202a',{gender:1,hair:10,hairColor:'#1f1814',skin:'#c99673',pants:'#2b2f38',pantsStyle:0,face:1},T('outdoorkit','traumakit'),'急救箱，卡门。户外医疗箱、高级医疗箱——一箱能用好几次，比一卷卷买绷带划算。','户外箱四次，高级箱八次，每次都能止血。远征就带高级的，里面还有夹板。',['这箱的搭扣松了，换一个。','高级箱只剩两托。','止血带按批号登记。']))
add(vendor('mkt_haskell','韦德·哈斯克尔','档口老板 · 燃料与能源','嗓门粗、烟瘾大，却从不在档口里点火。','在 Level 3 的电站管过十年燃料库，熟悉每一种会烧、会炸、会放电的东西。','#2a2b2e',{gender:0,hair:3,hairColor:'#4a3a2a',skin:'#d9a882',pants:'#33302a',pantsStyle:0,face:1},T('firesalt','gas','saltbox','capacitor'),'燃料区，韦德。火盐、火油桶、盒装火盐、瓶装闪电——离火源远点，想好了再买。','盒装火盐一盒五份，放背包里占一格，要用时在物品栏里拆开；瓶装闪电扔出去能电晕一片。',['火油桶别堆在过道上！','这批火盐成色不错。','瓶装闪电要竖着放。']))
const manager=staff('mkt_marsh','伊芙琳·马什','批发市场经理','干练、说话直接，对每个档口的流水了如指掌。','B.N.T.G. 派来整顿批发市场的经理。她把散落在各处的摊位统一收进主力店 A，定下「明码标价、现金与信用点结算」的规矩。','#20324f',{gender:1,hair:11,hairColor:'#2a1f1a',skin:'#e9c3a3',pants:'#232832',pantsStyle:0,face:2},[
 chat('欢迎来到 Traders Wholesale，我是经理伊芙琳·马什。所有档口明码标价，接受压印币和银行信用点，也可以混合支付。',[{text:'都有什么档口？',next:1},{text:'以前的摊主呢？',next:2},{text:'知道了。',action:'leave'}]),
 chat('左手边：饮用水、食品、药房、照明；右手边：特种液体、口粮杂货、急救箱、燃料能源。整托货在两侧 1 到 6 号货道，后面是收货区，客人别进。',[{text:'明白了。',action:'leave'}]),
 chat('以前在大厅里摆摊的都搬进来了，或者转了岗。坦恩现在在大厅的市场咨询台给人指路，你在门口就能找到她。',[{text:'好。',action:'leave'}]),
],['三号结算台今天先关着。','叉车通道保持畅通！','今天的流水表别忘了交。'],'clipboard')
add(manager)
add(staff('mkt_kowal','布伦达·科瓦尔','结算员 · 1 号结算台','笑容标准，扫码很快。','原 EL3A 仓管文员，调来批发市场负责结算。','#b23a35',{gender:1,hair:15,hairColor:'#c79a5c',skin:'#f0c8a8',pants:'#2b2f38',pantsStyle:0,face:1},[chat('1 号结算台。货在档口付过钱就能直接拿走，我这边只做核对和打包。',[{text:'好的。',action:'leave'}])],['下一位。','袋子在左手边。'],'clipboard'))
add(staff('mkt_ferreira','路易斯·费雷拉','结算员 · 2 号结算台','安静专注，手指在键盘上飞。','从行商队伍里退下来，喜欢有固定座位的工作。','#b23a35',{gender:0,hair:1,hairColor:'#2a201a',skin:'#c99673',pants:'#2b2f38',pantsStyle:0,face:0},[chat('2 号结算台。档口那边付过钱的货，在这里核单出门就行。',[{text:'谢谢。',action:'leave'}])],['单据收好。','麻烦让一让通道。'],'clipboard'))
add(staff('mkt_cole','德韦恩·科尔','叉车司机','嗓门洪亮，倒车时永远先按喇叭。','在商人之家的卸货区开了八年叉车，从没撞过一个托盘。','#e3a21a',{gender:0,hair:2,hairColor:'#151515',skin:'#5e3e2a',pants:'#303540',pantsStyle:0,face:1},[chat('收货区，客人请止步！叉车不长眼。要买东西去前面的档口。',[{text:'抱歉。',action:'leave'}])],['倒车请注意——','这托放 3 号货道。','缠膜机又卡了。'],'hardhat',2.2))
add(staff('mkt_ruiz','埃克托·鲁伊斯','理货员','手脚勤快，一边干活一边哼歌。','从 Level 2 的仓储带过来的理货好手。','#e3a21a',{gender:0,hair:7,hairColor:'#2a1c14',skin:'#b07a55',pants:'#303540',pantsStyle:0,face:1},[chat('理货中，借过！你要找的东西，前面档口问一声最快。',[{text:'好。',action:'leave'}])],['这箱标签贴歪了。','补货补货——','货道 5 快空了。'],'tools',3))
add(staff('mkt_sandoval','皮特·桑多瓦尔','搬运工','话不多，干活稳。','给批发市场搬了三年货，背比托盘还结实。','#e3a21a',{gender:0,hair:13,hairColor:'#3a2a1a',skin:'#d8a47e',pants:'#303540',pantsStyle:0,face:0},[chat('……搬货呢。你挡着路了。',[{text:'抱歉。',action:'leave'}])],['嘿咻。','这箱有点沉。'],'tools',3))
for(const [i,[name,role,top,av]] of ([
 ['米奇·拉森','采购客 · 前哨补给员','#5f6b52',{gender:0,hair:4,hairColor:'#6a4a2e',skin:'#e8b894',pants:'#3a3f33',pantsStyle:0,face:1}],
 ['罗莎·德尔加多','采购客 · 商队会计','#7a4e6a',{gender:1,hair:8,hairColor:'#1f1a17',skin:'#c99673',pants:'#2f2f3a',pantsStyle:0,face:2}],
 ['格斯·汉农','采购客 · 流浪者','#6b5a43',{gender:0,hair:12,hairColor:'#8f6a3a',skin:'#f0c8a8',pants:'#3a352e',pantsStyle:0,face:0}],
 ['黛西·科林斯','采购客 · M.E.G. 后勤','#3f5a6e',{gender:1,hair:5,hairColor:'#c79a5c',skin:'#f3cfb3',pants:'#2b3240',pantsStyle:0,face:1}],
] as const).entries()){
 add(staff('mkt_shopper_'+i,name,role,'边逛边算账，推车里永远比清单多两样。','来批发市场整箱进货的客人。','#'+top.slice(1),av,[chat('批发价就是划算，就是推车太难推了。',[{text:'哈哈。',action:'leave'}])],['这个牌价比上周低。','再拿一箱电池。','清单上还差两样。'],'satchel',4.5))
}
export const TRADERS_MARKET_PEOPLE:Readonly<Record<string,NpcDef>>=P
/** 预留老板（五金 / 工装 / 日用 / 户外）：不在主力店 A 刷出，定义原样保留。 */
export const MARKET_RESERVED_PEOPLE:Readonly<Record<string,NpcDef>>=RES

export interface MarketHome{id:string;x:number;y:number;facing:number}
const homes:MarketHome[]=[]
for(const d of MARKET_DEPTS){const v=marketVendorSpot(d);homes.push({id:d.vendor,...v})}
homes.push({id:'mkt_marsh',x:MARKET.aisle1+10.5,y:MARKET.y1-2.3,facing:-Math.PI/2})
homes.push({id:'mkt_kowal',x:MARKET.x0+6.5-.95,y:FRONT+.4,facing:0},{id:'mkt_ferreira',x:MARKET.x0+13.1-.95,y:FRONT+.4,facing:0})
homes.push({id:'mkt_cole',x:MARKET.door-3.5,y:MARKET.y0+10.5,facing:Math.PI/2},{id:'mkt_ruiz',x:MARKET.x0+10.2,y:RACK_Y0+14,facing:Math.PI/2},{id:'mkt_sandoval',x:MARKET.x1-10.2,y:RACK_Y0+30,facing:-Math.PI/2})
homes.push({id:'mkt_shopper_0',x:MARKET.door-1.8,y:STALL_Y0+8,facing:Math.PI/2},{id:'mkt_shopper_1',x:MARKET.door+1.6,y:STALL_Y0+22,facing:-Math.PI/2},{id:'mkt_shopper_2',x:MARKET.door-1.2,y:STALL_Y0+36,facing:Math.PI/2},{id:'mkt_shopper_3',x:MARKET.door+1.9,y:STALL_Y0+46,facing:-Math.PI/2})
export const TRADERS_MARKET_HOMES:readonly MarketHome[]=homes
