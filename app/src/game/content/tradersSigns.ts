import {TRADERS_SIGN_ATLAS} from './tradersSignAtlas'
/**
 * 商人之家标牌：现代美式商业标识（英文为主、中文副标），每块都是独立的 AI 生成图（见 SIGNS-SOURCES.md）。
 * 旧代码里各处仍以中文文案调用 label(text)，这里把文案映射到图集里的标牌 key；没有映射的小字（ATM 按键、
 * 货柜编号、封签条等）继续走画布兜底。
 */
export const TRADERS_SIGN_FOR_TEXT:Readonly<Record<string,string>>={
 '西门 / WEST GATE':'gate_west','北门 / NORTH GATE':'gate_north','东门 / EAST GATE':'gate_east',
 '公共服务 / SERVICES':'ovh_services','商人之家 / TRADERS KEEP':'ovh_keep','保险库登记':'ovh_vaultreg',
 '北步行街 / NORTH MALL':'way_north_mall','南步行街 / SOUTH MALL':'way_south_mall','交易保险库 / TRADERS VAULT':'way_vault','货物交接 / DISPATCH':'way_dispatch',
 '库区 A / WAREHOUSE A':'vault_row_A','库区 B / WAREHOUSE B':'vault_row_B','库区 C / WAREHOUSE C':'vault_row_C','库区 D / WAREHOUSE D':'vault_row_D',
 'L2 铁路 · 未开通':'rail_closed','补给连接 · 未开通':'dock_closed',
 '咨询与导览 / INFORMATION':'svc_info','办公与登记 / ADMINISTRATION':'svc_admin','公共交易柜台':'svc_market','市场咨询':'svc_market',
 '雇佣与业务登记':'svc_employment','银行咨询与账户服务':'svc_bank','业务与调度':'svc_dispatch','货物核验':'svc_receiving','封签核验':'svc_seal','打包与交接':'svc_packing',
 '取号 · 等候叫号':'dir_tickets','饮水与回收 / WATER':'water_station','B.N.T.G. / ATM':'atm_topper',
 '空摊位':'stall_vacant','冷藏柜':'cold_case','固定藏品 · 浅蓝色 250 GT':'car_plaque',
}
/** Room fronts and shop fascias are keyed by room id, not by their (shared) display names. */
export function tradersRoomSign(id:string):string|undefined{
 const k=id.startsWith('anchor_')?id:/^[NS]\d{2}$/.test(id)?'shop_'+id:'room_'+id
 return TRADERS_SIGN_ATLAS[k]?k:undefined
}
export function tradersSignKey(textOrKey:string):string|undefined{
 if(TRADERS_SIGN_ATLAS[textOrKey])return textOrKey
 const k=TRADERS_SIGN_FOR_TEXT[textOrKey];return k&&TRADERS_SIGN_ATLAS[k]?k:undefined
}
export function tradersSignAspect(key:string){return TRADERS_SIGN_ATLAS[key]?.[4]??4}
