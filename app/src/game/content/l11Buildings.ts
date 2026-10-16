/** Structural archetypes, independent of height/colour variations. Units are metres. */
export const L11_BUILDINGS = [
  {id:'slab',name:'板式公寓',group:'residential',shape:'slab',facade:'ribbon'},
  {id:'balcony',name:'阳台公寓',group:'residential',shape:'bar',facade:'balcony'},
  {id:'courtyard',name:'围合庭院住宅',group:'residential',shape:'court',facade:'brick'},
  {id:'corner-home',name:'转角住宅',group:'residential',shape:'corner',facade:'cornice'},
  {id:'townhouse',name:'多层联排公寓',group:'residential',shape:'row',facade:'gable'},
  {id:'detached',name:'城市花园公寓',group:'residential',shape:'house',facade:'veranda'},
  {id:'curtain-tower',name:'幕墙塔楼',group:'office',shape:'tower',facade:'curtain'},
  {id:'ribbon-office',name:'横窗办公板楼',group:'office',shape:'slab',facade:'ribbon'},
  {id:'fin-office',name:'竖肋混凝土楼',group:'office',shape:'bar',facade:'fins'},
  {id:'setback-office',name:'石材退台楼',group:'office',shape:'steps',facade:'stone'},
  {id:'rounded-office',name:'圆角办公楼',group:'office',shape:'round',facade:'curtain'},
  {id:'twin-office',name:'双塔裙房',group:'office',shape:'twins',facade:'fins'},
  {id:'strip-shops',name:'沿街商住排楼',group:'commercial',shape:'strip',facade:'awning'},
  {id:'corner-shops',name:'街角商住楼',group:'commercial',shape:'corner',facade:'arcade'},
  {id:'court-shops',name:'庭院商业',group:'commercial',shape:'court',facade:'arcade'},
  {id:'supermarket',name:'社区商业中心',group:'commercial',shape:'shed',facade:'shopfront'},
  {id:'parking',name:'停车楼',group:'commercial',shape:'parking',facade:'open-deck'},
  {id:'hotel',name:'城市旅馆',group:'commercial',shape:'hotel',facade:'cornice'},
  {id:'sawtooth',name:'锯齿顶厂房',group:'industrial',shape:'sawtooth',facade:'clerestory'},
  {id:'brick-factory',name:'砖砌厂房',group:'industrial',shape:'factory',facade:'brick'},
  {id:'warehouse',name:'装卸仓库',group:'industrial',shape:'warehouse',facade:'loading'},
  {id:'workshop',name:'多层创意工坊',group:'industrial',shape:'workshop',facade:'roller'},
  {id:'substation',name:'城市能源站',group:'industrial',shape:'utility',facade:'louvers'},
  {id:'pump-house',name:'运河水务楼',group:'industrial',shape:'pump',facade:'piping'},
  {id:'archive',name:'公共档案馆',group:'civic',shape:'archive',facade:'colonnade'},
  {id:'school',name:'学校',group:'civic',shape:'school',facade:'ribbon'},
  {id:'museum',name:'博物馆',group:'civic',shape:'museum',facade:'colonnade'},
  {id:'sports-hall',name:'体育馆',group:'civic',shape:'hall',facade:'truss'},
  {id:'transit-station',name:'交通站',group:'civic',shape:'station',facade:'canopy'},
  {id:'municipal',name:'市政服务楼',group:'civic',shape:'municipal',facade:'stone'},
  {id:'unfinished-frame',name:'未完工混凝土楼',group:'industrial',shape:'frame',facade:'unfinished'},
  {id:'barred-brick',name:'铁栅窗砖楼',group:'industrial',shape:'brick-shell',facade:'barred-brick'},
] as const
export type L11Archetype = typeof L11_BUILDINGS[number]['id']
export type L11BuildingGroup = typeof L11_BUILDINGS[number]['group']
/** Complete building height ranges in floors, assuming a 3 m floor height; these are not enterable-floor counts. */
export const L11_FLOOR_RANGES: Record<L11Archetype, readonly [number,number]> = {
  slab:[6,14], balcony:[5,16], courtyard:[5,10], 'corner-home':[5,12], townhouse:[3,5], detached:[4,7],
  'curtain-tower':[12,34], 'ribbon-office':[8,20], 'fin-office':[8,24], 'setback-office':[8,24],
  'rounded-office':[10,28], 'twin-office':[12,30], 'strip-shops':[4,7], 'corner-shops':[5,12],
  'court-shops':[4,8], supermarket:[3,5], parking:[5,8], hotel:[6,14], sawtooth:[3,5],
  'brick-factory':[4,7], warehouse:[3,5], workshop:[3,6], substation:[3,4], 'pump-house':[3,5],
  archive:[4,7], school:[4,6], museum:[3,5], 'sports-hall':[3,4], 'transit-station':[3,5], municipal:[5,9],
  'unfinished-frame':[9,15], 'barred-brick':[3,5],
}
export const l11Archetype=(id:string)=>L11_BUILDINGS.find(b=>b.id===id)??L11_BUILDINGS[0]
