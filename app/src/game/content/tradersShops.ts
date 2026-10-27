import type {Structure,LightSource} from '../core/types'
import type {NpcDef} from './npcs'
import {TRADERS_ROOMS,tradersContains,type TradersRect,type TradersRoom} from './tradersLayout'
import {placedTradersStructure} from './tradersDressingShapes'
import {MARKET_RESERVED_PEOPLE} from './tradersMarket'

/**
 * 北步行街 · 主题小店（2026-10-23）：N02 五金 / N04 工装 / N07 糖佬 / N10 文具日用 / N12 户外。
 * 每家店 18 × 24 m，南向临北步行街。五家店各用一套独立的 AI 地 / 墙 / 顶纹理（public/textures/traders/shops）、
 * 专属陈设模型、灯具与色温、门头标牌（signs_atlas 的 shop_Nxx），以及各自的老板 + 一名店员 / 顾客。
 * 店内坐标：原点在店中心，+z 指向门口（世界 +y，南），x 向东；陈设全部由 shopPiece 道具组成。
 */
export type TradersShopId='hardware'|'workwear'|'candy'|'office'|'outdoor'|'guns'
export interface TradersShop{
 id:TradersShopId;room:string;name:string;tex:string;vendor:string;staff:string
 /** Texture repeat in metres for floor / wall / ceiling. */
 tile:{floor:number;wall:number;ceiling:number}
 light:string;lightMul:number;lights:readonly (readonly [number,number])[];lightZ:number
}
const grid6=(x:number,zs:number[])=>zs.flatMap(z=>[[-x,z],[x,z]] as const)
export const TRADERS_SHOPS:readonly TradersShop[]=[
 {id:'hardware',room:'N02',name:'布兰肯希普五金',tex:'hw',vendor:'mkt_blankenship',staff:'shop_lyle',tile:{floor:1.6,wall:1.0,ceiling:1.2},light:'#ffc983',lightMul:.72,lights:grid6(4.2,[-8,-1.5,5]),lightZ:3.95},
 {id:'workwear',room:'N04',name:'格兰特工装与防护',tex:'ww',vendor:'mkt_grant',staff:'shop_dex',tile:{floor:1.0,wall:1.5,ceiling:2.0},light:'#e4efff',lightMul:.85,lights:grid6(3.2,[-7,0,7]),lightZ:4.25},
 {id:'candy',room:'N07',name:'糖佬糖果铺',tex:'cd',vendor:'candyman',staff:'shop_benny',tile:{floor:1.5,wall:2.4,ceiling:2.0},light:'#ffe2ec',lightMul:.82,lights:grid6(4.4,[-7.5,-1,5.5]),lightZ:3.85},
 {id:'office',room:'N10',name:'平克尼文具日用',tex:'of',vendor:'mkt_pinkney',staff:'shop_mavis',tile:{floor:2.4,wall:1.5,ceiling:1.2},light:'#fff1d6',lightMul:.78,lights:grid6(4.5,[-8,-1.5,5]),lightZ:3.75},
 {id:'guns',room:'N14',name:'鎏金兵械库',tex:'gn',vendor:'shop_kat',staff:'shop_hobbs',tile:{floor:1.8,wall:1.7,ceiling:2.6},light:'#ffd29a',lightMul:.72,lights:[[1.5,-8],[6.5,-8],[1.5,-1.5],[6.5,-1.5],[1.5,5],[6.5,5],[-6,6.2],[-6,-1.5],[-6,-8.5]],lightZ:3.9},
 {id:'outdoor',room:'N12',name:'约根森户外',tex:'od',vendor:'mkt_jorgensen',staff:'shop_ingrid',tile:{floor:2.5,wall:1.8,ceiling:1.8},light:'#ffbe6e',lightMul:.70,lights:grid6(4.6,[-7.5,-.5,6]),lightZ:3.7},
]
export const tradersShopRoom=(s:TradersShop):TradersRoom=>TRADERS_ROOMS.find(r=>r.id===s.room)!
/** Shop frame: centre in world metres. */
export function tradersShopFrame(s:TradersShop){const r=tradersShopRoom(s);return{r,cx:r.x+r.w/2,cy:r.y+r.h/2,hw:r.w/2,hd:r.h/2}}
export function tradersShopAt(x:number,y:number):TradersShop|undefined{
 for(const s of TRADERS_SHOPS){const r=tradersShopRoom(s);if(tradersContains(r,x,y))return s}
}
/** Material surface names, e.g. shop:hw_floor; the UV repeat lives in TRADERS_SHOP_UV. */
export const shopSurface=(s:TradersShop,part:'floor'|'wall'|'ceiling')=>'shop:'+s.tex+'_'+part
export const TRADERS_SHOP_UV:Readonly<Record<string,number>>=Object.fromEntries(TRADERS_SHOPS.flatMap(s=>(['floor','wall','ceiling'] as const).map(p=>[shopSurface(s,p),1/s.tile[p]])))

// ---------------- Props ----------------
const props:Structure[]=[]
interface Piece{part:string;x:number;z:number;w:number;d:number;deg?:number;h?:number;solid?:boolean;extra?:Record<string,unknown>}
function place(s:TradersShop,p:Piece){
 const f=tradersShopFrame(s)
 props.push(placedTradersStructure('trade_counter',f.cx+p.x,f.cy+p.z,p.w,p.d,p.solid??true,{tradersId:'shop.'+s.id+'.'+p.part+'.'+props.length,tradersModel:'dressing',dressing:'shopPiece',tradersProp:'shop',shop:s.id,part:p.part,deg:p.deg??0,roomId:s.room,height:p.h??2.4,seed:props.length,...p.extra}))
}
const PIECES:Record<TradersShopId,Piece[]>={
 hardware:[
  {part:'shell',x:0,z:0,w:18,d:24,solid:false,h:4.8},
  {part:'hwBins',x:-8.38,z:-3,w:8,d:.95,deg:90,h:2.3},
  {part:'hwPegTools',x:0,z:-11.72,w:13,d:.3,solid:false,h:2.9},
  {part:'hwCounter',x:4.6,z:-7.4,w:6,d:1.05,h:1.2},
  {part:'hwGondola',x:-5.6,z:-2,w:8,d:1.1,deg:90,h:1.85},
  {part:'hwGondola',x:-2.7,z:-2,w:8,d:1.1,deg:90,h:1.85},
  {part:'hwLumber',x:8.25,z:0,w:7,d:1.25,deg:-90,h:2.4},
  {part:'hwPaint',x:5.6,z:7.6,w:2.2,d:1.5,h:1.5},
  {part:'hwBuckets',x:-5.8,z:8.2,w:2.0,d:1.3,h:1.1},
  {part:'hwSign',x:4.6,z:-9.6,w:1.8,d:.06,solid:false,h:4.8,extra:{sign:'shop_hw_keys'}},
 ],
 workwear:[
  {part:'shell',x:0,z:0,w:18,d:24,solid:false,h:4.8},
  {part:'wwHelmets',x:-8.66,z:-3,w:9,d:.5,deg:90,h:2.6},
  {part:'wwLockers',x:8.5,z:-5,w:6,d:.62,deg:-90,h:2.0},
  {part:'wwBoots',x:8.45,z:3.2,w:4.4,d:.72,deg:-90,h:1.9},
  {part:'wwRack',x:-4.8,z:-1,w:6.5,d:.75,deg:90,h:1.75},
  {part:'wwRack',x:4.4,z:-.5,w:5.5,d:.75,deg:90,h:1.75},
  {part:'wwTable',x:0,z:-2.8,w:2.4,d:1.2,h:.95},
  {part:'wwMannequin',x:-3.4,z:8.6,w:.9,d:.9,h:1.95,extra:{suit:'#d8641e'}},
  {part:'wwMannequin',x:3.4,z:8.6,w:.9,d:.9,h:1.95,extra:{suit:'#e3c21b'}},
  {part:'wwCase',x:-5.2,z:-9.7,w:2.4,d:.75,h:1.9},
  {part:'wwCounter',x:1.6,z:-8,w:5.6,d:1.1,h:1.1},
  {part:'wwCage',x:1.6,z:-11.35,w:9,d:1.0,h:2.6},
  {part:'wwSign',x:-4.8,z:-5.2,w:1.8,d:.06,deg:0,solid:false,h:4.8,extra:{sign:'shop_ww_safety'}},
 ],
 candy:[
  {part:'shell',x:0,z:0,w:18,d:24,solid:false,h:4.8},
  {part:'cdJarWall',x:0,z:-11.52,w:14,d:.6,h:2.5},
  {part:'cdBins',x:-8.3,z:-2,w:8,d:1.15,deg:90,h:1.6},
  {part:'cdBags',x:8.5,z:-2,w:8,d:.62,deg:-90,h:2.1},
  {part:'cdCounter',x:0,z:-7.6,w:7,d:1.2,h:1.15},
  {part:'cdLolly',x:-3.3,z:9.6,w:.9,d:.9,h:2.6,extra:{color:'#e94e8a'}},
  {part:'cdLolly',x:3.3,z:9.6,w:.9,d:.9,h:2.6,extra:{color:'#3fbfa4'}},
  {part:'cdGumball',x:-3.8,z:2.6,w:1.7,d:1.7,h:1.35},
  {part:'cdCake',x:3.8,z:2.2,w:1.6,d:1.6,h:1.6},
  {part:'cdCrates',x:6.6,z:7.6,w:2.2,d:1.4,h:1.3},
  {part:'cdSign',x:-7.2,z:-2,w:1.8,d:.06,deg:90,solid:false,h:4.8,extra:{sign:'shop_cd_pick'}},
 ],
 office:[
  {part:'shell',x:0,z:0,w:18,d:24,solid:false,h:4.8},
  {part:'ofCases',x:-8.05,z:-2.5,w:8,d:.9,deg:90,h:1.0},
  {part:'ofFiles',x:8.5,z:-2,w:8,d:.62,deg:-90,h:2.2},
  {part:'ofCounter',x:2.6,z:-8,w:6,d:1.0,h:1.1},
  {part:'ofPaper',x:2.6,z:-11.62,w:10,d:.5,h:2.4},
  {part:'ofSpinner',x:-2.6,z:2.4,w:.8,d:.8,h:1.85},
  {part:'ofSpinner',x:2.8,z:4.2,w:.8,d:.8,h:1.85},
  {part:'ofTable',x:-3.2,z:-3.6,w:2.4,d:1.2,h:.9},
  {part:'ofDesk',x:-5.4,z:-9.8,w:2.2,d:1.0,h:1.0},
  {part:'ofSign',x:0,z:3.3,w:1.8,d:.06,solid:false,h:4.8,extra:{sign:'shop_of_cards'}},
 ],
 // 鎏金兵械库（N14，2026-10-23 枪械阶段 2）：东侧营业厅 + 西侧试射道（GUN_LANE）
 guns:[
  {part:'shell',x:0,z:0,w:18,d:24,solid:false,h:4.8},
  {part:'gnRackWall',x:3,z:-11.5,w:11,d:.7,h:2.9},
  {part:'gnRackSide',x:8.45,z:2,w:9,d:.75,deg:-90,h:2.7},
  {part:'gnCounter',x:3,z:-5.6,w:7,d:1.1,h:1.1},
  {part:'gnCase',x:1.2,z:1.6,w:3.2,d:1.0,h:1.05},
  {part:'gnCase',x:5.2,z:1.6,w:3.2,d:1.0,h:1.05},
  {part:'gnAmmo',x:-2.35,z:-5,w:6,d:.6,deg:90,h:2.2},
  {part:'gnBench',x:-6,z:3.6,w:5.6,d:.7,h:1.0},
  {part:'gnDivider',x:-6,z:4.95,w:.06,d:2.0,h:2.2,solid:false},
  {part:'gnPartition',x:-3.05,z:-4.22,w:.22,d:15.24,h:4.8},
  {part:'gnHalfWall',x:-5.4,z:11.2,w:6.8,d:.2,h:1.25},
  {part:'gnSandbags',x:-6,z:-11.2,w:5.8,d:1.1,h:2.3},
  {part:'gnBaffle',x:-6,z:-1,w:5.8,d:.3,solid:false,h:4.8},
  {part:'gnBaffle',x:-6,z:-6.5,w:5.8,d:.3,solid:false,h:4.8},
  {part:'gnTarget',x:-7.4,z:-4.2,w:.7,d:.08,solid:false,h:4.8,extra:{ring:1}},
  {part:'gnTarget',x:-4.6,z:-4.2,w:.7,d:.08,solid:false,h:4.8,extra:{ring:2}},
  {part:'gnTarget',x:-7.4,z:-9.6,w:.7,d:.08,solid:false,h:4.8,extra:{ring:3}},
  {part:'gnTarget',x:-4.6,z:-9.6,w:.7,d:.08,solid:false,h:4.8,extra:{ring:4}},
  {part:'gnSign',x:-5.1,z:9.7,w:2.2,d:.06,solid:false,h:4.8,extra:{sign:'shop_gn_lane'}},
  {part:'gnSafe',x:7.7,z:-9,w:1.2,d:.9,h:1.9},
  {part:'gnRug',x:3,z:5.5,w:5,d:3,solid:false,h:.02},
 ],
 outdoor:[
  {part:'shell',x:0,z:0,w:18,d:24,solid:false,h:4.8},
  {part:'odTent',x:-2.6,z:-1.6,w:3.2,d:3.2,h:1.9},
  {part:'odRock',x:3.6,z:5.4,w:3.4,d:2.4,h:1.5},
  {part:'odRope',x:-8.66,z:-3,w:8,d:.5,deg:90,h:2.5},
  {part:'odPacks',x:8.42,z:-3,w:8,d:.8,deg:-90,h:2.2},
  {part:'odCounter',x:3,z:-8.6,w:5.6,d:1.1,h:1.15},
  {part:'odFirewood',x:-4.6,z:-11.2,w:4.6,d:1.1,h:1.3},
  {part:'odMap',x:3,z:-11.86,w:2.6,d:.08,solid:false,h:3.0,extra:{sign:'shop_od_map'}},
  {part:'odCanoe',x:-.5,z:3.2,w:1.0,d:5.2,deg:72,solid:false,h:4.8},
  {part:'odStove',x:-6.2,z:6.6,w:1.2,d:1.2,h:1.6},
 ],
}
for(const s of TRADERS_SHOPS)for(const p of PIECES[s.id])place(s,p)
export const TRADERS_SHOP_PROPS:readonly Structure[]=props

/** 鎏金兵械库试射道（店内坐标）：booth = 射击位（只有站在这里才能开枪），lane = 靶道（子弹落点必须在这里面），
 *  targets = 纸靶（中心 x,z，离地高 y，半宽 r） */
export const GUN_LANE_LOCAL={
 /** 扩展后退及侧向站位；后矮墙与新边界一致，朝向与人员安全仍由引擎检查。 */
 booth:{x0:-8.85,x1:-1.55,z0:3.95,z1:11.0},
 // Include the first hit on the real side/back walls, not only the floor inside them.
 lane:{x0:-9.05,x1:-3.1,z0:-12.05,z1:3.95},
 targets:[{x:-7.4,z:-4.2,y:1.45,r:.3},{x:-4.6,z:-4.2,y:1.45,r:.3},{x:-7.4,z:-9.6,y:1.45,r:.3},{x:-4.6,z:-9.6,y:1.45,r:.3}],
} as const
/** 试射道（世界坐标） */
export function tradersGunLane(){
 const s=TRADERS_SHOPS.find(x=>x.id==='guns')!,f=tradersShopFrame(s),L=GUN_LANE_LOCAL
 const R=(r:{x0:number;x1:number;z0:number;z1:number})=>({x:f.cx+r.x0,y:f.cy+r.z0,w:r.x1-r.x0,h:r.z1-r.z0})
 return{booth:R(L.booth),lane:R(L.lane),targets:L.targets.map(t=>({x:f.cx+t.x,y:f.cy+t.z,z:t.y,r:t.r}))}
}
export function tradersShopsForChunk(cx:number,cy:number):Structure[]{
 const b:TradersRect={x:cx*32,y:cy*32,w:32,h:32}
 return props.filter(s=>tradersContains(b,s.x+s.w/2,s.y+s.h/2)).map(s=>({...s,data:{...s.data}}))
}
/** Shop light sources (replace the corridor troffer grid inside themed shops). */
export function tradersShopLights(bounds:TradersRect):LightSource[]{
 const a:LightSource[]=[]
 for(const s of TRADERS_SHOPS){const f=tradersShopFrame(s);s.lights.forEach(([x,z],i)=>{const X=f.cx+x,Y=f.cy+z;if(tradersContains(bounds,X,Y))a.push({x:X,y:Y,r:6.5,color:s.light,fixZ:s.lightZ,keep:1,gen:1,flickerSeed:(i*977+X*31)|0,intensityMul:s.lightMul})})}
 return a
}

// ---------------- People ----------------
type Avatar=NpcDef['avatar']
const chat=(npc:string,opts:NpcDef['lines'][number]['opts'])=>({npc,opts})
/** Owner: the reserved wholesale vendor, re-dressed for their own shop (same goods and prices). */
function owner(id:string,role:string,uniform:NonNullable<NpcDef['uniform']>,avatar:Avatar,gear:NpcDef['communityGear'],hello:string,tip:string,idle:string[]):NpcDef{
 const base=MARKET_RESERVED_PEOPLE[id]
 return{...base,role,uniform,avatar:{...base.avatar,...avatar},communityGear:gear,wanderRadius:0,idle,
  lines:[chat(hello,[{text:'看看货。',action:'trade'},{text:'有什么建议？',next:1},{text:'回头再来。',action:'leave'}]),chat(tip,[{text:'那就看看货。',action:'trade'},{text:'谢了。',action:'leave'}])]}
}
function staff(id:string,name:string,role:string,personality:string,background:string,uniform:NonNullable<NpcDef['uniform']>,avatar:Avatar,line:string,idle:string[],gear:NpcDef['communityGear'],wander:number):NpcDef{
 return{id,name,role,faction:'bntg',personality,background,uniform,avatar,currency:'presses',communityGear:gear,wanderRadius:wander,lines:[chat(line,[{text:'好的。',action:'leave'}])],idle}
}
const P:Record<string,NpcDef>={}
const add=(d:NpcDef)=>{P[d.id]=d}
add(owner('mkt_blankenship','店主 · 布兰肯希普五金',{top:'#a8322c',topStyle:1,badge:'#d8b45a'},{hair:3,hairColor:'#b7b7ba',beard:4,glasses:0,face:1,pants:'#4a3b28',pantsStyle:3,shoes:2},'apron',
 '欢迎光临布兰肯希普五金。撬棍、扳手、钉子、木料、保险丝、斧头——都在架子上，按牌价算。要配钥匙就说一声。',
 '好工具不怕旧，怕的是用错。撬棍别拿来当锤子，斧头记得上油。门口那桶钉子是新到的。',['这把扳手比我年纪还大。','莱尔，把三号架的保险丝补上！','钥匙机又该上油了。']))
add(owner('mkt_grant','店主 · 格兰特工装与防护',{top:'#1d2c55',topStyle:4,badge:'#e8c31c'},{hair:10,face:2,pants:'#1f2433',pantsStyle:2,shoes:2,glasses:0},'tools',
 '格兰特工装与防护。隔热手套、绝缘服、保温服、潜水面罩，每一件都过了我的手。先说你要去哪一层。',
 '去高温区戴隔热手套，去水下层带面罩。防护服尺码宁大勿小——里面还要穿层衣服。试穿区在左边。',['头盔墙又该补货了。','这批手套的缝线不错。','别碰模特，那是展示品！']))
add(owner('mkt_pinkney','店主 · 平克尼文具日用',{top:'#2f6f6a',topStyle:6,badge:'#c9a54a'},{hair:9,hairColor:'#3b2a20',glasses:2,beard:8,face:0,pants:'#2f3236',pantsStyle:0,shoes:0},'book',
 '平克尼文具日用，欢迎。笔记本、订书机、打火机，按型号排好了，请随意挑选。',
 '记录是活下来的一半。笔记本买厚的，打火机备两只。贺卡在中间的转架上——虽然这里很少有人寄信。',['这一格的笔记本又歪了。','打字机的色带该换了。','请轻拿轻放。']))
add(owner('mkt_jorgensen','店主 · 约根森户外',{top:'#2d5a36',topStyle:6,badge:'#c48a3a'},{hair:7,hairColor:'#b07a3a',beard:2,face:1,pants:'#4a4632',pantsStyle:2,shoes:2},'satchel',
 '约根森户外！尼龙绳、打火机、刀、干果，出远门的东西我这儿全有。帐篷是样品，别钻进去睡觉哈。',
 '绳子买长不买短，打火机买两个，干果按天数备。还有，记住怎么打布林结——我可以教你。',['这卷绳子能吊起一辆车。','炉子里的火别让它灭了。','英格丽德，墙上的路线图更新了吗？']))
add(staff('shop_lyle','莱尔·布兰肯希普','学徒 · 布兰肯希普五金','腼腆、手快，说话前总先挠头。','厄尔的远房侄孙，跟着爷爷在店里学了两年手艺，梦想是开一家自己的修理铺。',{top:'#6e6a2e',topStyle:0,badge:'#d8b45a'},{gender:0,hair:1,hairColor:'#7a5a30',skin:'#f0c8a8',pants:'#2e3a4a',pantsStyle:3,face:1,shoes:1},
 '找东西吗？钉子在左边柜子，按尺寸分格。别的问我爷爷——他在柜台那儿。',['三号架……补好了。','爷爷说这把锯还能用二十年。'],'tools',2.2))
add(staff('shop_dex','德克斯·莫拉莱斯','顾客 · 前哨工程队','大嗓门，试什么都要先敲两下。','在 Level 4 的前哨修了三年管道，这次来换一整套新防护。',{top:'#d8641e',topStyle:3,badge:'#e8e6dc'},{gender:0,hair:2,hairColor:'#1d1b1a',skin:'#b98563',pants:'#3a3f33',pantsStyle:2,face:1,beard:3,shoes:2},
 '这顶头盔够硬！你也来换装备？塔妮莎挑东西眼光毒得很。',['再试一件大一号的。','这手套隔热真不错。'],'hardhat',2))
add(staff('shop_benny','本尼·奥卡福','送货员 · B.N.T.G. 糖果矿','乐天派，口袋里永远塞着两颗糖。','从糖果矿往商人之家送货的固定司机，最清楚哪一批糖「效果」最强。',{top:'#c6538a',topStyle:4,badge:'#e8b93c'},{gender:0,hair:12,hairColor:'#151515',skin:'#6e4a33',pants:'#3a352e',pantsStyle:2,face:1,shoes:1},
 '新一批货刚卸下来！别问矿上的事，问就是「矿上见」——希德教我的。',['这箱是银舌头。','今天的糖闻起来有点……发光？'],'clipboard',1.6))
add(staff('shop_mavis','梅维丝·奥斯本','顾客 · 退休档案员','慢条斯理，挑一张贺卡能挑半小时。','在 M.E.G. 档案室干了一辈子，退休后每周都来平克尼的店里买信纸。',{top:'#7a4e6a',topStyle:7,badge:'#e8e6dc'},{gender:1,hair:8,hairColor:'#c9c9cc',skin:'#f3cfb3',pants:'#3a3540',pantsStyle:5,face:1,glasses:1,shoes:0},
 '年轻人，你也写信吗？这里的信纸是全商人之家最好的。',['这张贺卡的花边真好看。','霍华德又把价签贴得一丝不苟。'],'book',1.4))
add(staff('shop_ingrid','英格丽德·赫尔曼','远征队员 · 约根森户外','精干、少言，背包永远收拾得整整齐齐。','跟着商队跑过十几趟远征，如今在卡尔的店里帮忙，顺便更新墙上的路线图。',{top:'#b8312b',topStyle:7,badge:'#c48a3a'},{gender:1,hair:15,hairColor:'#d8b46a',skin:'#f0c8a8',pants:'#3a3a2c',pantsStyle:2,face:2,shoes:2},
 '要出远门？先看看墙上的路线图，再来挑背包。帐篷样品可以进去看看。',['这条线上周塌了一段。','背包肩带得调一调。'],'satchel',2.2))
add({id:'shop_kat',name:'凯特·瓦伦',role:'店主 · 鎏金兵械库',faction:'bntg',personality:'爽快、嗓门不大但句句落地，说起枪来像在讲自家孩子。',
 background:'B.N.T.G. 特许的枪械商。年轻时跟着商队押货，靠一把双管猎枪守过三次营地；后来在 N14 开了这家兵械库，自己给爆团弹写广告词。',
 uniform:{top:'#5a2a22',topStyle:4,badge:'#d8b45a'},avatar:{gender:1,hair:6,hairColor:'#2a1a12',skin:'#e7bc98',pants:'#2e2a26',pantsStyle:2,face:2,shoes:2,glasses:0},
 currency:'presses',communityGear:'apron',wanderRadius:0,
 trade:[{item:'dbshotgun',price:120},{item:'leverrifle',price:160},{item:'revolver',price:110},{item:'musket',price:60},{item:'trapdoor',price:180},
  {item:'shell_buck',price:8,qty:6},{item:'shell_bird',price:5,qty:10},{item:'shell_clump',price:30,qty:6},{item:'cart_4440',price:18,qty:20},{item:'cart_paper',price:6,qty:10},{item:'cart_4570',price:16,qty:10}],
 lines:[chat('鎏金兵械库，欢迎。枪在墙上，弹在架子上，都按盒卖。想试枪就去西边的试射道——商人之家里只有那一条线能开火。',[{text:'看看货。',action:'trade'},{text:'有什么讲究？',next:1},{text:'回头再来。',action:'leave'}]),
  chat('规矩三条：出了射击位，枪自动收；枪口对着人，枪自动收；出了这扇门，在别家据点里也一样。爆团弹要打进肉里才炸——打墙是浪费钱。',[{text:'那就看看货。',action:'trade'},{text:'明白。',action:'leave'}])],
 idle:['这批 .45-70 是新压的。','霍布斯，三号靶该换了。','双管的抽壳器我刚调过。']})
add(staff('shop_hobbs','霍布斯','靶场管理员 · 鎏金兵械库','话少，耳罩从不摘，眼睛一直盯着射击位。','前 M.E.G. 训练教官，退下来以后在凯特的靶场管安全。他认定的规矩只有一条：枪口永远朝靶。',{top:'#3a4a2e',topStyle:3,badge:'#e8c31c'},{gender:0,hair:3,hairColor:'#8a8a8c',beard:2,skin:'#d9a882',pants:'#2e3226',pantsStyle:2,face:1,shoes:2,glasses:0},
 '射击位在长凳后面，进去再拿枪。枪口朝靶，打完把枪放平。纸靶看得见环数。',['枪口朝靶。','三号位，停火。','耳朵护好。'],'hardhat',0))
export const TRADERS_SHOP_PEOPLE:Readonly<Record<string,NpcDef>>=P
export interface ShopHome{id:string;x:number;y:number;facing:number}
const SPOTS:Record<TradersShopId,{vendor:[number,number];staff:[number,number,number]}>={
 hardware:{vendor:[4.6,-8.55],staff:[-4.15,-2,0]},
 workwear:{vendor:[1.6,-9.15],staff:[-3.3,-1.2,Math.PI]},
 candy:{vendor:[0,-8.85],staff:[5.2,6.4,0]},
 office:{vendor:[2.6,-9.1],staff:[-2.6,3.4,-Math.PI/2]},
 outdoor:{vendor:[3,-9.75],staff:[-2.6,1.6,-Math.PI/2]},
 guns:{vendor:[3,-6.75],staff:[-.6,4.4,Math.PI]},
}
export const TRADERS_SHOP_HOMES:readonly ShopHome[]=TRADERS_SHOPS.flatMap(s=>{
 const f=tradersShopFrame(s),p=SPOTS[s.id]
 // 糖佬是全局 NPC（TRADERS_FIXED_PEOPLE 里登记），其余老板与店员在这里登记。
 return[...(s.vendor==='candyman'?[]:[{id:s.vendor,x:f.cx+p.vendor[0],y:f.cy+p.vendor[1],facing:Math.PI/2}]),{id:s.staff,x:f.cx+p.staff[0],y:f.cy+p.staff[1],facing:p.staff[2]}]
})
