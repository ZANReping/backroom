import type { StructKind, Structure } from '../core/types'

export type L5DecorKind =
  | 'l5_marble_column' | 'l5_ornate_beam' | 'l5_candle_chandelier' | 'l5_palm'
  | 'l5_orchid_table' | 'l5_antique_sofa' | 'l5_bookcase' | 'l5_candle_sconce'
  | 'l5_arched_window' | 'l5_bordered_rug' | 'l5_bowl_light' | 'l5_downlight'
  | 'l5_ballroom_chandelier' | 'l5_mahjong_table' | 'l5_service_panel'
  | 'l5_horizontal_boiler' | 'l5_insulated_pipe' | 'l5_furnace' | 'l5_guest_bed'
  | 'l5_dining_set' | 'l5_service_lift' | 'l5_pool_ladder' | 'l5_pool_board'
  | 'l5_pool_bench' | 'l5_pool_safety'

export interface L5DecorDef {
  id: L5DecorKind
  name: string
  kind: StructKind
  w: number
  d: number
  height: number
  solid: boolean
  data?: Record<string, number | string | boolean | string[]>
}

const def = (id: L5DecorKind, name: string, kind: StructKind, w: number, d: number, height: number, solid: boolean, data?: L5DecorDef['data']): L5DecorDef => ({ id, name, kind, w, d, height, solid, data: { ...(data ?? {}), l5: 1 } })

export const L5_DECOR_DEFS: readonly L5DecorDef[] = [
  def('l5_marble_column', '红色白脉石柱', 'redpillar', 1, 1, 5.775, true),
  def('l5_ornate_beam', '彩绘木梁', 'ceilingbeam', 4, 1, 5.775, false),
  def('l5_candle_chandelier', '古铜烛台吊灯', 'chandelier', 1, 1, 5.775, false),
  def('l5_palm', '酒店棕榈盆栽', 'planter', 1, 1, 3.3, true),
  def('l5_orchid_table', '兰花三脚圆桌', 'table', 1, 1, 3.3, true, { vase: 1 }),
  def('l5_antique_sofa', '古董条纹沙发', 'sofa', 2, 1, 3.3, true),
  def('l5_bookcase', '深木书架', 'libshelf', 2, 1, 3.3, true),
  def('l5_candle_sconce', '双臂电烛台', 'sconce', 1, 1, 3.3, false),
  def('l5_arched_window', '拱形玻璃装饰门', 'hotelwindow', 1, 1, 5.775, true, { entry: 1 }),
  def('l5_bordered_rug', '红边花毯', 'rug', 4, 4, 3.3, false),
  def('l5_bowl_light', '走廊碗形顶灯', 'lightgrid', 1, 1, 3.3, false, { plain: 0 }),
  def('l5_downlight', '酒店筒灯', 'lightgrid', 1, 1, 3.3, false, { plain: 1 }),
  def('l5_ballroom_chandelier', '舞厅巨型吊灯', 'chandelier', 1, 1, 5.775, false, { profile: 'beverly' }),
  def('l5_mahjong_table', '饮料麻将桌', 'oddtable', 2, 2, 3.3, true),
  def('l5_service_panel', '维护配电柜', 'cabinet', 1, 1, 3.3, true, { profile: 'maintenance' }),
  def('l5_horizontal_boiler', '老式卧式锅炉', 'boiler', 2, 3, 3.3, true),
  def('l5_insulated_pipe', '包覆管道组', 'piperack', 2, 1, 3.3, true),
  def('l5_furnace', '老式熔炉', 'furnace', 1, 1, 3.3, true),
  def('l5_guest_bed', '酒店木床', 'bed', 1, 2, 3.3, true),
  def('l5_dining_set', '白布酒店餐桌', 'dtable', 2, 2, 3.3, true),
  def('l5_service_lift', '维护电梯门面', 'hotelwindow', 1, 1, 3.3, false, { profile: 'serviceLift' }),
  def('l5_pool_ladder', '泳池不锈钢扶梯', 'poolladder', 1, 1, 3.3, false),
  def('l5_pool_board', '防滑低跳板', 'divingboard', 1, 1, 3.3, true),
  def('l5_pool_bench', '泳池毛巾长凳', 'bench', 1, 1, 3.3, true),
  def('l5_pool_safety', '救生圈与水深牌', 'ceilingbeam', 1, 1, 3.3, false, { profile: 'poolSafety' }),
]

const L5_KIND_SET = new Set<string>(L5_DECOR_DEFS.map(d => d.id))
export const isL5DecorKind = (kind: string): kind is L5DecorKind => L5_KIND_SET.has(kind)

export function l5DecorStructure(kind: L5DecorKind, x = 0, y = 0): Structure {
  const d = L5_DECOR_DEFS.find(v => v.id === kind)!
  return { kind: d.kind, x, y, w: d.w, h: d.d, solid: d.solid, data: { ...(d.data ?? {}), l5: 1, height: d.height } }
}
