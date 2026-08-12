// 容器（Container）：可搜索的补给结构注册表——名称 / 搜索时长 / 掉落池 / 件数 / 前置条件。
// 物品生成容器化后，多数补给需要开箱才能拿到；掉落池按容器语义分化。
// 本文件是纯数据模块：搜刮状态机 / 战利品面板 / 掉落掷骰流程在 engine.ts，
// 容器建模在 renderer/structures.ts，地图预装在 mapgen.ts（generateLevel 的 containerBias）。
// v53：原 game/containers.ts，迁入 game/decorations/ 目录（装饰物数据统一归口：
// 本文件=可搜索容器；同目录 lore.ts=可查看装饰物文案）。
// 注意：新容器种类除本表外还必须登记进 engine doInteract 的容器 case 列表（v51 elecbox 事故）。
export interface ContainerDef {
  label: string // 游戏内名称
  dur: number // 搜索时长（秒）
  pool: string[] // 掉落池（物品 type）
  n: number // 掉落后件数
  gate?: 'carkey' | 'crowbar' // 前置条件：口袋栏车钥匙 / 背包撬棍
}

// v23：可搜索容器统一表
export const CONTAINERS: Record<string, ContainerDef> = {
  crate:    { label: '补给箱',        dur: 1.8, n: 2, pool: ['almond', 'canned', 'bandage', 'battery', 'tape', 'glowstick'] },
  corpse:   { label: '尸体',          dur: 1.2, n: 1, pool: ['bandage', 'almond', 'battery', 'tape', 'wallpaper'] },
  car:      { label: '后备箱',        dur: 1.8, n: 2, pool: ['gas', 'almond', 'canned', 'battery', 'tape'], gate: 'carkey' },
  cabinet:  { label: '配电柜',        dur: 1.8, n: 2, pool: ['battery', 'fuse', 'capacitor', 'tape'] },
  dresser:  { label: '柜子',          dur: 1.6, n: 2, pool: ['silverware', 'sedative', 'almond', 'bandage', 'tape'] },
  megcrate: { label: 'M.E.G. 补给箱', dur: 2.0, n: 3, pool: ['almond', 'almond', 'bandage', 'battery', 'megfolder', 'tape'] },
  // v23 新增容器
  locker:   { label: '储物柜',        dur: 1.6, n: 2, pool: ['battery', 'bandage', 'canned', 'flashlight', 'housekey', 'tape'] },
  toolbox:  { label: '工具箱',        dur: 1.4, n: 2, pool: ['crowbar', 'wrench', 'nails', 'battery', 'timber', 'tape'] },
  suitcase: { label: '行李箱',        dur: 1.6, n: 2, pool: ['bandage', 'almond', 'lighter', 'rabbit', 'pamphlet', 'tape'] },
  fridge:   { label: '冰箱',          dur: 1.5, n: 2, pool: ['canned', 'almond', 'citywater', 'driedfruit', 'thingmeat'] },
  safebox:  { label: '保险箱',        dur: 2.4, n: 3, pool: ['presses', 'sedative', 'keycard', 'skeleton', 'rabbit', 'tape'], gate: 'crowbar' },
  mailbox:  { label: '信箱',          dur: 1.1, n: 1, pool: ['housekey', 'pamphlet', 'wallpaper', 'endnote', 'tape'] },
  barrel:   { label: '木桶',          dur: 1.5, n: 2, pool: ['almond', 'almond', 'oddbook', 'rope', 'tape'] },
  bookcase: { label: '书柜',          dur: 1.6, n: 2, pool: ['oddbook', 'oddbook', 'pamphlet', 'megfolder', 'tape'] },
  bonepile: { label: '骨堆',          dur: 1.4, n: 1, pool: ['bandage', 'divemask', 'rope', 'wallpaper', 'tape'] },
  campstall:{ label: '营地摊位',      dur: 2.0, n: 3, pool: ['driedfruit', 'cavingsuit', 'uvlamp', 'almond', 'battery', 'xenonmarble'] },
  // v51：Level 3 发电站——壁挂配电箱（电气材料池）
  elecbox:  { label: '配电箱',        dur: 1.6, n: 2, pool: ['battery', 'fuse', 'capacitor'] },
}

// v23：可搜索容器 kind 列表（派生自 CONTAINERS，单一事实源；
// 地图预装 / 小地图标注 / dev 传送与统计统一用它判定容器）
export const CONTAINER_KINDS: readonly string[] = Object.keys(CONTAINERS)

// v32：小概率稀有掉落（onceOwned=玩家已拥有一个后不再生成）
export const CONTAINER_RARE: Record<string, { type: string; p: number; onceOwned?: boolean }[]> = {
  crate: [{ type: 'knife', p: 0.1 }, { type: 'axe', p: 0.08 }, { type: 'headlamp', p: 0.06 }],
  dresser: [{ type: 'notebook', p: 0.12, onceOwned: true }],
}
