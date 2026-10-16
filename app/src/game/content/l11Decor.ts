/** Static Level 11 street, waterfront and interior prop archetypes. */
export type L11DecorKind =
  | 'l11_signal'
  | 'l11_pedestrian_signal'
  | 'l11_streetlight'
  | 'l11_bollard'
  | 'l11_hydrant'
  | 'l11_parking_meter'
  | 'l11_road_sign'
  | 'l11_street_name'
  | 'l11_utility_box'
  | 'l11_transformer'
  | 'l11_bus_shelter'
  | 'l11_bus_stop'
  | 'l11_bike_rack'
  | 'l11_trash_bin'
  | 'l11_recycling_bin'
  | 'l11_post_box'
  | 'l11_manhole'
  | 'l11_storm_drain'
  | 'l11_traffic_island'
  | 'l11_ticket_machine'
  | 'l11_shop_awning'
  | 'l11_cafe_table'
  | 'l11_cafe_chair'
  | 'l11_menu_board'
  | 'l11_display_rack'
  | 'l11_newspaper_box'
  | 'l11_vending_machine'
  | 'l11_phone_booth'
  | 'l11_parcel_locker'
  | 'l11_market_stall'
  | 'l11_umbrella'
  | 'l11_produce_crates'
  | 'l11_shopping_cart'
  | 'l11_delivery_bike'
  | 'l11_sedan'
  | 'l11_delivery_van'
  | 'l11_box_truck'
  | 'l11_taxi'
  | 'l11_bus'
  | 'l11_motor_scooter'
  | 'l11_plane_tree'
  | 'l11_park'
  | 'l11_cypress'
  | 'l11_shrub_planter'
  | 'l11_flower_planter'
  | 'l11_park_bench'
  | 'l11_picnic_table'
  | 'l11_canal_railing'
  | 'l11_quay_balustrade'
  | 'l11_canal_ladder'
  | 'l11_sewer_outlet'
  | 'l11_mooring_bollard'
  | 'l11_life_ring'
  | 'l11_lock_winch'
  | 'l11_lock_gate'
  | 'l11_drinking_fountain'
  | 'l11_park_lamp'
  | 'l11_fountain'
  | 'l11_pergola'
  | 'l11_hvac'
  | 'l11_duct'
  | 'l11_downpipe'
  | 'l11_alley'
  | 'l11_fire_escape'
  | 'l11_loading_dock'
  | 'l11_pallet'
  | 'l11_pallet_stack'
  | 'l11_dumpster'
  | 'l11_scaffold'
  | 'l11_safety_fence'
  | 'l11_cone'
  | 'l11_road_barrier'
  | 'l11_cable_reel'
  | 'l11_cement_mixer'
  | 'l11_ladder'
  | 'l11_office_desk'
  | 'l11_task_chair'
  | 'l11_meeting_table'
  | 'l11_file_cabinet'
  | 'l11_bookcase'
  | 'l11_reception_desk'
  | 'l11_sofa'
  | 'l11_armchair'
  | 'l11_coffee_table'
  | 'l11_bed'
  | 'l11_wardrobe'
  | 'l11_kitchen_counter'
  | 'l11_sink'
  | 'l11_refrigerator'
  | 'l11_stove'
  | 'l11_dining_table'
  | 'l11_dining_chair'
  | 'l11_toilet'
  | 'l11_wash_basin'
  | 'l11_radiator'
  | 'l11_ceiling_light'
  | 'l11_floor_lamp'
  | 'l11_classroom_desk'
  | 'l11_chalkboard'
  | 'l11_lab_bench'
  | 'l11_archive_shelf'
  | 'l11_microfilm_reader'
  | 'l11_exhibit_case'
  | 'l11_gym_bench'
  | 'l11_workbench'
  | 'l11_vertical_wall_sign'
  | 'l11_vertical_blade_sign'
  | 'l11_retail_gondola'
  | 'l11_retail_checkout'
  | 'l11_retail_cooler'

export type L11DecorCategory = 'municipal' | 'commerce' | 'waterfront' | 'service' | 'interior'

export interface L11DecorDef {
  readonly id: L11DecorKind
  readonly name: string
  readonly category: L11DecorCategory
  readonly w: number
  readonly d: number
  readonly height: number
  readonly solid: boolean
  readonly placement: string[]
  readonly interactive: false
  readonly container: false
  readonly front: '-z'
  readonly wallBack: boolean
  readonly mount: number
}

type Spec = [string, string, number, number, number, boolean, string[]]
const WALL_BACK=new Set(['file_cabinet','bookcase','wardrobe','kitchen_counter','sink','refrigerator','stove','toilet','wash_basin','radiator','chalkboard','bed'])
const D = (category: L11DecorCategory, [key, name, w, d, height, solid, placement]: Spec): L11DecorDef => ({
  id: `l11_${key}` as L11DecorKind, name, category, w, d, height, solid, placement,
  interactive: false, container: false,
  front:'-z',wallBack:WALL_BACK.has(key),mount:key==='chalkboard'?.85:key==='radiator'?.16:(key==='vertical_wall_sign'||key==='vertical_blade_sign'?4:0),
})

const MUNICIPAL: Spec[] = [
  ['signal','交通信号灯',.5,.4,4.8,true,['road']], ['pedestrian_signal','行人信号灯',.25,.25,2.7,true,['sidewalk']], ['streetlight','街灯',.5,.5,6,true,['sidewalk']], ['bollard','隔离柱',.22,.22,.85,true,['sidewalk']], ['hydrant','消防栓',.5,.4,.8,true,['sidewalk']], ['parking_meter','停车计时器',.3,.25,1.3,true,['sidewalk']], ['road_sign','道路标志牌',.45,.15,2.3,true,['sidewalk']], ['street_name','街道名牌',1.65,.15,2.6,true,['sidewalk']], ['utility_box','公用设施箱',.8,.4,1.2,true,['sidewalk']], ['transformer','变压器',1.4,.9,1.4,true,['alley']], ['bus_shelter','公交候车亭',4,1.6,2.6,true,['sidewalk']], ['bus_stop','公交站牌',.5,.2,2.5,true,['sidewalk']], ['bike_rack','自行车架',2,.7,.8,true,['sidewalk']], ['trash_bin','垃圾桶',.55,.55,1,true,['sidewalk']], ['recycling_bin','回收箱',1.2,.7,1.1,true,['sidewalk']], ['post_box','邮政箱',.6,.5,1.2,true,['sidewalk']], ['manhole','井盖',.7,.7,.025,false,['road']], ['storm_drain','雨水篦子',.8,.35,.025,false,['road']], ['traffic_island','交通岛',2,1,.16,false,['road']], ['ticket_machine','售票机',.6,.5,1.7,true,['sidewalk']],
]
const COMMERCE: Spec[] = [
  ['vertical_wall_sign','贴墙竖式广告牌',1.3,.15,6.5,true,['facade']], ['vertical_blade_sign','悬挑双面竖式广告牌',.16,1.6,6.5,true,['facade']],
  ['retail_gondola','双面商品陈列架',1.2,.92,1.48,true,['shop']], ['retail_checkout','店铺收银柜台',1.6,.85,1.25,true,['shop']], ['retail_cooler','玻璃门饮料冷柜',1.2,.72,2.05,true,['shop']],
  ['shop_awning','店铺雨棚',3,1.6,.35,false,['storefront']], ['cafe_table','咖啡桌',.75,.75,.75,true,['storefront']], ['cafe_chair','咖啡椅',.5,.55,.85,true,['storefront']], ['menu_board','菜单牌',.65,.6,1.1,true,['storefront']], ['display_rack','展示货架',1.2,.55,1.5,true,['storefront']], ['newspaper_box','报刊箱',.6,.5,1.1,true,['storefront']], ['vending_machine','自动售货机',.9,.8,1.9,true,['storefront']], ['phone_booth','电话亭',1,1,2.3,true,['sidewalk']], ['parcel_locker','快递柜',2,.65,2,true,['storefront']], ['market_stall','集市摊位',3,2,2.6,true,['storefront']], ['umbrella','遮阳伞',2.6,2.6,2.5,true,['storefront']], ['produce_crates','蔬果箱',1.5,.8,.8,true,['storefront']], ['shopping_cart','购物车',.65,1,.95,true,['storefront']], ['delivery_bike','配送自行车',.6,1.8,1.2,true,['storefront']], ['sedan','轿车',1.8,4.4,1.5,true,['road']], ['delivery_van','配送厢式车',2,5,2.4,true,['road']], ['box_truck','厢式货车',2.4,6.3,3.2,true,['road']], ['taxi','出租车',1.85,4.6,1.6,true,['road']], ['bus','公交车',2.5,9,3.1,true,['road']], ['motor_scooter','电动踏板车',.65,1.7,1.1,true,['sidewalk']],
]
const WATERFRONT: Spec[] = [
  ['quay_balustrade','石柱滨水栏杆',4,.5,1.1,true,['waterfront']],
  ['canal_ladder','运河登岸梯',.8,.45,3.5,true,['waterfront']], ['sewer_outlet','岸墙排水口',1.4,.28,1.3,false,['waterfront']],
  ['plane_tree','行道树',1,1,7,true,['park','waterfront']], ['cypress','柏树',.8,.8,6,true,['park','waterfront']], ['shrub_planter','灌木花箱',1.8,.8,1,true,['park']], ['flower_planter','花卉花箱',1,.65,.65,true,['park']], ['park_bench','公园长椅',1.9,.65,.85,true,['park','waterfront']], ['picnic_table','野餐桌',2,1.6,.8,true,['park']], ['canal_railing','运河护栏',4,.12,1.1,true,['waterfront']], ['mooring_bollard','系船柱',.5,.5,.6,true,['waterfront']], ['life_ring','救生圈',.7,.15,1.1,true,['waterfront']], ['lock_winch','水闸绞盘',.8,.6,1,true,['waterfront']], ['lock_gate','水闸门',4,.4,2.5,true,['waterfront']], ['drinking_fountain','饮水台',.4,.4,.9,true,['park','waterfront']], ['park_lamp','公园灯',.3,.3,3,true,['park']], ['fountain','喷泉',3,3,1.3,true,['park']], ['pergola','廊架',3.4,3.4,2.8,true,['park']],
]
const SERVICE: Spec[] = [
  ['hvac','空调机组',1.5,1.1,1,true,['alley']], ['duct','通风管道',2,.5,.5,true,['alley']], ['downpipe','落水管',.12,.12,3,true,['alley','storefront']], ['fire_escape','消防逃生梯',1.5,3,3.9,true,['alley']], ['loading_dock','装卸平台',3,2,1,true,['alley']], ['pallet','托盘',1.2,.8,.15,true,['alley']], ['pallet_stack','托盘堆',1.2,.8,.8,true,['alley']], ['dumpster','垃圾集装箱',1.7,1,.9,true,['alley']], ['scaffold','脚手架',2,1,3,true,['alley']], ['safety_fence','施工安全围栏',2,.1,1.8,true,['alley']], ['cone','交通锥',.35,.35,.7,true,['road']], ['road_barrier','路障',2,.4,1,true,['road']], ['cable_reel','电缆盘',1,1,1,true,['alley']], ['cement_mixer','水泥搅拌机',1.1,1.4,1.4,true,['alley']], ['ladder','梯子',.55,.45,2.6,true,['alley']],
]
const INTERIOR: Spec[] = [
  ['office_desk','办公桌',1.6,.8,.76,true,['interior']], ['task_chair','办公椅',.65,.65,1.1,true,['interior']], ['meeting_table','会议桌',3,1.2,.75,true,['interior']], ['file_cabinet','文件柜',.8,.5,1.4,true,['interior']], ['bookcase','书柜',1.8,.4,2,true,['interior']], ['reception_desk','前台接待桌',2.5,.8,1.1,true,['interior']], ['sofa','沙发',2.2,.9,.9,true,['interior']], ['armchair','扶手椅',.9,.9,.85,true,['interior']], ['coffee_table','茶几',1.2,.65,.45,true,['interior']], ['bed','床',1.4,2,.6,true,['interior']], ['wardrobe','衣柜',1.4,.6,2.1,true,['interior']], ['kitchen_counter','厨房操作台',2,.65,.9,true,['interior']], ['sink','水槽',.8,.6,1.1,true,['interior']], ['refrigerator','冰箱',.75,.7,1.9,true,['interior']], ['stove','炉灶',.7,.65,.9,true,['interior']], ['dining_table','餐桌',1.5,.9,.75,true,['interior']], ['dining_chair','餐椅',.5,.55,.9,true,['interior']], ['toilet','坐便器',.4,.7,.8,true,['interior']], ['wash_basin','洗手盆',.55,.45,.85,true,['interior']], ['radiator','暖气片',1.2,.15,.7,true,['interior']], ['ceiling_light','顶灯',1.2,.3,.12,false,['interior']], ['floor_lamp','落地灯',.4,.4,1.7,true,['interior']], ['classroom_desk','课桌',.8,.6,.75,true,['interior']], ['chalkboard','黑板',2,.12,1.2,true,['interior']], ['lab_bench','实验台',2,.8,.9,true,['interior']], ['archive_shelf','档案架',2,.7,2.4,true,['interior']], ['microfilm_reader','缩微胶片阅读器',.65,.7,.6,true,['interior']], ['exhibit_case','展柜',1.3,.65,1.5,true,['interior']], ['gym_bench','体育长凳',2,.5,.5,true,['interior']], ['workbench','工作台',1.8,.7,.9,true,['interior']],
]

export const L11_DECOR_DEFS = [
  ...MUNICIPAL.map(s => D('municipal', s)), ...COMMERCE.map(s => D('commerce', s)),
  ...WATERFRONT.map(s => D('waterfront', s)), ...SERVICE.map(s => D('service', s)),
  ...INTERIOR.map(s => D('interior', s)),
] as const

const BY_ID = new Map<string, L11DecorDef>(L11_DECOR_DEFS.map(d => [d.id, d]))
export const isL11DecorKind = (value: string): value is L11DecorKind => BY_ID.has(value)
export const l11DecorDef = (id: string): L11DecorDef | undefined => BY_ID.get(id)
