import type { Structure } from '../core/types'
import { ALPHA_DEFS, type AlphaKind } from './alphaDecor'

/** Corridor furnishings are separate from room contents and carry their activity-pocket name. */
export function alphaCommunityLayout():Structure[]{
 const out:Structure[]=[]
 const put=(kind:AlphaKind,x:number,y:number,area:string,data:Structure['data']={})=>{
  const d=ALPHA_DEFS.find(d=>d.id===kind)!
  out.push({kind,x,y,w:d.w,h:d.d,solid:d.solid,data:{height:d.height,community:area,...data}})
 }
 const face=(kind:AlphaKind,cx:number,cy:number,deg:number,area:string,data:Structure['data']={})=>{const d=ALPHA_DEFS.find(d=>d.id===kind)!;put(kind,cx-d.w/2,cy-d.d/2,area,{...data,deg})}
 const board=(cx:number,cy:number,deg:number,area:string,label:string,stand=false)=>face('alpha_community_board',cx,cy,deg,area,{z:stand?.85:1.12,label,stand:stand?1:0})
 const planter=(x:number,y:number,area:string)=>put('alpha_planter',x,y,area)

 // Arrival: familiar objects at wall edges, well clear of the three return gates and inner doors.
 face('alpha_postbox',54.46,7.1,90,'north_arrival')
 face('alpha_tea_cart',66.45,7.3,270,'north_arrival')
 board(54.24,10.7,90,'north_arrival','初来 Alpha|林桥：迷路了可以再问一次|热水在东侧 用完请洗杯|走散者请到接待登记|夜班居民正在休息')
 face('alpha_bench',66.43,13.6,270,'north_arrival');planter(55.1,15.1,'north_arrival')
 face('alpha_recycling',66.52,10.6,270,'north_arrival')
 face('alpha_tea_cart',22.8,80.52,0,'west_arrival')
 board(28.8,80.23,0,'west_arrival','欢迎回家|米洛：先核对同行人数|湿鞋请留在鞋架下层|回信交到南廊许禾处|担架通道请勿堆物')
 face('alpha_mudroom',20.49,82.1,90,'west_arrival');planter(29.4,88.3,'west_arrival')
 face('alpha_recycling',133,70.52,180,'east_arrival')
 board(137,70.78,180,'east_arrival','运输交接|阿米尔：卸货后先锁车轮|请勿把私信混进货单|包裹受潮请注明|进出时先让行人')
 face('alpha_bench',139.45,68,270,'east_arrival')

 // Four-metre expedition spine: modest tea and resting pockets against the west wall.
 face('alpha_tea_cart',20.42,37,90,'expedition_rest')
 face('alpha_recycling',20.35,47.1,90,'expedition_rest')
 board(20.04,57.6,90,'expedition_rest','换班以后|梁穗：晚班餐已经留好|夜莺的杯子请勿拿走|请写清借走的工具|今天也记得报平安')
 face('alpha_swap_shelf',52.9,24.4,0,'expedition_rest')

 // Narrow linking corridors receive shallow wall details, never freestanding furniture.
 board(63,55.06,0,'archive_link','记录之外|奥黛：口述记录可以撤回|陈述：报修请抄下错误原文|遇到矛盾先保留两份记录|私人信件不作公开资料')
 board(91.5,55.06,0,'research_link','研究署交接|洛文：不知道就写未知|样本切勿在走廊打开|培养记录请送交接台|手套留在工作区')
 for(const [x,y,deg] of [[55.92,26,270],[101.1,14,90],[118.08,50,90]] as const)face('alpha_home_frame',x,y,deg,'link_gallery',{z:1.25})

 // Resident hall pockets, fitted between doors rather than in front of them.
 face('alpha_tea_cart',121.45,30.8,90,'anemoia_corner')
 board(121.05,27,90,'anemoia_corner','老街近况|玛拉：采收篮洗净倒扣|新住户请认一下信格|晚饭后有人一起聊天|旧椅子修好 请放心坐')
 face('alpha_bench',124,33.65,180,'anemoia_corner')
 face('alpha_planter',136.9,33.4,0,'anemoia_corner')
 face('alpha_drying_rack',129.7,35.7,90,'anemoia_corner')
 face('alpha_bench',84.9,70.38,0,'dining_veranda')
 board(88.8,70.03,0,'dining_veranda','饭后闲坐|梁穗：最后一班也有热饭|杯子放茶水台 我来收|桌游棋子用后请点数|路过时请放轻脚步')
 face('alpha_tea_cart',94.5,70.40,0,'dining_veranda')
 face('alpha_recycling',99,70.32,0,'dining_veranda')
 board(110.1,72.03,0,'river_veranda','利沃邻里|乔安：工具用后请归位|洗衣前检查衣袋|失物交许禾登记|今天的口述由奥黛记录')
 face('alpha_drying_rack',126.9,73.4,0,'river_veranda')
 face('alpha_bench',123.4,73.8,180,'river_veranda')
 // Zephyr's three-metre spine stays empty at foot level; notices sit between existing pictures.
 for(const [y,label] of [[95.2,'西风邻里|崔岳：施工时段见联络台|报修请写门牌和时间|午休时段放低说话声|走廊不存放板材'],[105.2,'一起把这里住好|门前留空 方便担架|晾衣请去公共角落|借来的工具记得归还|有困难可以找邻里值班']] as const)board(91.53,y,90,'zephyr_hall',label)

 // South promenade has enough depth for real social alcoves with a continuous central walking lane.
 put('alpha_postbox',33.4,101.3,'south_post');board(37,101.34,0,'south_post','南廊投递点|许禾：写清姓名和片区|找不到门牌先问我们|回信到了会留纸条|不要拆看他人的信件',true)
 put('alpha_bench',33.5,103.3,'south_post');planter(38.3,101.3,'south_post')
 put('alpha_mending_table',47,101.5,'mending_corner');put('alpha_reading_chair',49,102.4,'mending_corner')
 board(50.8,101.36,0,'mending_corner','桑娅的缝补角|针线用完请收回盒里|蓝线用尽 留张纸条|碎布也能补好一只袖口|欢迎带来旧布料',true)
 put('alpha_swap_shelf',53.4,101.3,'reading_corner');put('alpha_reading_chair',55.4,102.3,'reading_corner')
 put('alpha_rest_table',57.3,103,'reading_corner');face('alpha_reading_chair',56.6,103.6,90,'reading_corner');face('alpha_reading_chair',59.25,103.6,270,'reading_corner')
 put('alpha_tea_cart',64,101.4,'south_tea');put('alpha_bench',67,102,'south_tea');put('alpha_recycling',70,101.4,'south_tea')
 board(72.6,101.35,0,'south_tea','歇一会儿|艾达：干净杯子在上层|不想说话也可以坐坐|旧报纸读完放交换架|椅子用完请推回原处',true);planter(75,101.4,'south_tea')
 for(const x of [34,42,62,74])face('alpha_bench',x,109.5,180,'south_seating')
 // The construction crew gets an off-axis rest spot instead of clutter in the narrow spine.
 put('alpha_tea_cart',84,124.6,'work_rest');face('alpha_bench',88,125.35,180,'work_rest')
 board(99,125.68,180,'work_rest','交班前请检查|崔岳：门洞净宽再量一次|工具齐了再离岗|茶杯不要放在图纸上|明天的活 明天再接着干',true)
 return out
}
