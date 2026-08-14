// ================= v54：设计模式数据提取——布局条目（DESIGN-GUIDE.md §2）=================
// 覆盖三大类布局，全部以固定种子确定性生成代表性实例后逐字段提取：
//   据点（outposts.ts 注册表 ×7，含多层 EL3A/Gamma）——generateLevel(levelDefOf(levelId), seed, true)
//   无限层变体（L0 9 变体 / L1 7 区段 / L2 4 廊道变体 / L3 2 灯光变体 + 4 特征房间）——各层 genL*ChunkRaw
//   预制件（prefabs/ 注册表 ×11）——合成 w×h 全墙 GameMap 上直接调用 fill 回调
// 概率类数值（变体概率/地标/陷阱/画作等）从生成器源码读出实际值，写入 spawnRules
// （key=「文件.语义」风格，note=中文说明）；UI 与导入落地是后续阶段，本模块只负责提取。
import { generateLevel, type GameMap } from '../world/mapgen'
import { levelDefOf } from '../levels'
import { OUTPOSTS, type OutpostDef } from '../content/outposts'
import { CS, VARIANT_NAMES, genL0ChunkRaw, type L0Variant } from '../world/infinite'
import { L1_VARIANT_NAMES, genL1ChunkRaw } from '../world/infiniteL1'
import { L2_VARIANT_NAMES, genL2ChunkRaw } from '../world/infiniteL2'
import { L3_VARIANT_NAMES, genL3ChunkRaw } from '../world/infiniteL3'
import { L4_VARIANT_NAMES, genL4ChunkRaw } from '../world/infiniteL4'
import { L5_VARIANT_NAMES, genL5ChunkRaw } from '../world/infiniteL5'
import type { GenChunk } from '../world/infiniteRegistry'
import { PREFABS, levelOf } from '../prefabs'
import type { PrefabDef } from '../prefabs/shared'
import { RNG } from '../core/rng'
import type { LevelDef, Structure } from '../core/types'
import type {
  EntityEntry, ItemEntry, LayoutEntry, LightEntry, SpawnRule, StairEntry, StructEntry,
} from './types'

const SEED = 424242 // 固定种子（与各地形冒烟一致）：同种子重跑提取结果一致
const VCX = 5, VCY = 7 // 变体代表性 chunk 坐标（出生安全区之外；forceVariant 决定内容）

// v54：据点随机居民池风味（mapgenOutpost 各 gen 函数实际调用的 genRandomNpcs flavor / jerryFollowerDef 池）
const OUTPOST_NPC_FLAVOR: Record<string, string> = {
  alpha: 'meg', bntg: 'bntg', ariane: 'ariane', tom: 'mixed', el3a: 'el3a', gamma: 'meg', jerry: 'jerry',
}

/** 坐标保留两位小数（NPC/灯/物品落位为浮点；结构/瓦片本身即整数） */
const r2 = (v: number) => Math.round(v * 100) / 100

/** 瓦片/楼层数组 → 行字符串（行=y 递增，字符=x 递增；isOn 判定 '#'，其余 '.'） */
function rowsOf(arr: Uint8Array, w: number, h: number, isOn: (v: number) => boolean): string[] {
  const rows: string[] = []
  for (let y = 0; y < h; y++) {
    let row = ''
    for (let x = 0; x < w; x++) row += isOn(arr[y * w + x]) ? '#' : '.'
    rows.push(row)
  }
  return rows
}

/** 多层数组（up/upWall/up2/upWall2）：有任一非零格才导出（'#'=有楼板/有墙体） */
function optRows(arr: Uint8Array, w: number, h: number): string[] | undefined {
  return arr.some((v) => v !== 0) ? rowsOf(arr, w, h, (v) => v !== 0) : undefined
}

/** 结构 → StructEntry：data.deg 提升为顶层 deg，其余 data 原样透传（§2 执行规则 3） */
function toStructEntry(s: Structure, ox = 0, oy = 0): StructEntry {
  const { deg, ...rest } = s.data ?? {}
  const e: StructEntry = { kind: s.kind, x: r2(s.x - ox), y: r2(s.y - oy), w: s.w, h: s.h, solid: s.solid }
  if (s.floor !== undefined) e.floor = s.floor
  if (typeof deg === 'number') e.deg = deg
  if (Object.keys(rest).length) e.data = rest
  return e
}

function toLightEntry(l: { x: number; y: number; r: number; color: string; z?: number; fixZ?: number }, ox = 0, oy = 0): LightEntry {
  const e: LightEntry = { x: r2(l.x - ox), y: r2(l.y - oy), r: l.r, color: l.color }
  if (l.z !== undefined) e.z = l.z
  if (l.fixZ !== undefined) e.fixZ = l.fixZ
  return e
}

// ================= 据点 =================
function extractOutpost(key: string, o: OutpostDef): LayoutEntry {
  const def = levelDefOf(o.levelId)
  if (!def) throw new Error(`据点 ${key} 的 LevelDef（id ${o.levelId}）不存在`)
  const m = generateLevel(def, SEED, true) // 据点为手工布局，种子仅影响民居家具抖动
  // 楼梯坡道：dir(低3位) | loCm<<3 | hiCm<<17（mapgen.encStair 编码；lo/hi 导出为米）
  const stair: StairEntry[] = []
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const v = m.stair[y * m.w + x]
      if (v & 7) stair.push({ x, y, dir: v & 7, lo: ((v >> 3) & 0x3fff) / 100, hi: ((v >> 17) & 0x3fff) / 100 })
    }
  const e: LayoutEntry = {
    kind: 'outpost', id: key, name: o.name, level: o.parent,
    size: [m.w, m.h],
    tiles: rowsOf(m.tiles, m.w, m.h, (v) => v === 1), // 注意编码：地板(1)→'#'，墙/虚空→'.'（v54 起设计 JSON 与画布均用此编码，DESIGN-GUIDE §2 已按此修正）
    structures: m.structures.map((s) => toStructEntry(s)),
    // v54：m.npcDefs 内的 id=随机生成居民（genRandomNpcs/jerryFollowerDef）→ 导出为随机 NPC 槽
    //（id 'random' + flavor 池标记）；其余为注册表固定 NPC，按 id 原样导出。据点手写布局一律非随机
    npcs: (m.npcs ?? []).map((n) => {
      const isRand = m.npcDefs?.some((d) => d.id === n.id)
      return {
        id: isRand ? 'random' : n.id, x: r2(n.x), y: r2(n.y), floor: n.floor ?? 0,
        ...(isRand ? { flavor: OUTPOST_NPC_FLAVOR[key] ?? 'meg' } : {}),
      }
    }),
    lights: m.lights.map((l) => toLightEntry(l)),
    exits: m.exits.map((x) => ({ kind: x.def.kind, name: x.def.name, dest: x.def.dest, x: x.x, y: x.y })),
    zones: (m.zones ?? []).map((z) => ({
      name: z.name, x: z.x, y: z.y, z: z.z ?? 0,
      // v54：可选矩形范围（据点生成器已为 Gamma/EL3A 写入；缺省=点标注）
      ...(z.x0 !== undefined ? { x0: z.x0, y0: z.y0!, x1: z.x1!, y1: z.y1! } : {}),
    })),
    floors: m.floors,
  }
  const up = optRows(m.up, m.w, m.h); if (up) e.up = up
  const upWall = optRows(m.upWall, m.w, m.h); if (upWall) e.upWall = upWall
  const up2 = optRows(m.up2, m.w, m.h); if (up2) e.up2 = up2
  const upWall2 = optRows(m.upWall2, m.w, m.h); if (upWall2) e.upWall2 = upWall2
  if (stair.length) e.stair = stair
  return e
}

// ================= 无限层变体 =================
// ---- v54：随机摆放审计表（任务4）----
// 逐生成器源码审计：key='<变体>:<kind/type>'（'*'=全变体通配），value=生成概率（true=次数随机、无固定概率）。
// 未列出的对象=决定性摆放（不标 random）；L2 房间家具多为 frng 掷点 → 默认随机；L3 布局决定性强 → 默认非随机。
type RandMark = number | true // number=固定概率；true=次数/落点随机（无单一概率值）
const L0_RAND_STRUCT: Record<string, RandMark> = { // infinite.ts
  'pillars:pillar': 0.85, // 柱群网格每点 85% 立柱
  'manila:crate': 0.55, 'manila:megfolder': 0.75, // 马尼拉室补给箱 / 第二份文件夹
  '*:crate': 0.4, '*:vent': 0.3, '*:socket': 0.55, '*:lightgrid': 0.5, '*:hanglight': 0.35,
}
const L0_RAND_ITEM: Record<string, RandMark> = {
  '*:firesalt': 0.06, '*:tape': 0.1, 'arch:squirtgun': 0.05, 'manila:almond': 0.7,
}
const L1_RAND_STRUCT: Record<string, RandMark> = { // infiniteL1.ts
  'parking:pillar': 0.8, 'aisle:pillar': true, 'aisle:car': 0.2, 'aisle:rebar': 0.4,
  'parking:car': true, 'parking:suitcase': 0.5, 'parking:pipes': true,
  'parking:landmark': 0.06, 'storage:landmark': 0.06, 'gothic:landmark': 0.06, // 地标（alpha 0.06 / tom 0.025 / bntg 0.06 / ariane 0.06）
  'storage:crate': true, 'storage:toolbox': 0.7, 'storage:locker': 0.6, 'storage:suitcase': 0.4,
  'gothic:graffiti': 0.5,
  'ouroboros:scaffold': true, 'ouroboros:roadblock': true, 'ouroboros:pipes': true,
  'ouroboros:debrispile': true, 'ouroboros:rebar': 0.4, 'ouroboros:crate': 0.5, 'ouroboros:toolbox': 0.5,
  'garden:wheatpatch': true, 'garden:hedgerow': true, 'garden:glowshroom': true,
  'maintenance:toolbox': true, 'maintenance:locker': 0.5, 'maintenance:suitcase': 0.4, 'maintenance:vent': 0.6,
  'maintenance:desk': 0.45, 'maintenance:copier': 0.45, 'maintenance:officechair': 0.45,
  'maintenance:bed': 0.45, 'maintenance:table': 0.45, 'maintenance:photo': 0.45, // 侧室（整间 45%）
  '*:ceilvent': 0.06, '*:vent': 0.3, '*:socket': 0.55, '*:graffiti': 0.45, '*:corpse': 0.15,
  '*:lightgrid': 0.45, '*:hanglight': 0.3,
}
const L1_RAND_ITEM: Record<string, RandMark> = { '*:tape': 0.1, '*:firesalt': 0.18, 'gothic:squirtgun': 0.05 }
const L1_RAND_ENTITY: Record<string, RandMark> = { '*:dryshrimp': 0.25, '*:nguithr': 0.04, '*:arms': 0.06 }
const L2_RAND_STRUCT: Record<string, RandMark> = { // infiniteL2.ts（房间家具/机器壁龛均掷点 → 默认随机）
  '*:machinewall': 0, // 0=决定性（墙面段按世界哈希）；下行同
  '*:inkdoor': 0, '*:hoteldoor': 0, // 门位世界哈希决定
  '*:windowtrap': 0.1, 'tidy:landmark': 0.03,
  '*:vent': 0.3, '*:socket': 0.4, '*:graffiti': 0.45, '*:corpse': 0.1,
}
const L2_RAND_ITEM: Record<string, RandMark> = { '*:tape': 0.08, '*:firesalt': 0.18 }
const L2_RAND_ENTITY: Record<string, RandMark> = {
  '*:dryshrimp': 0.25, '*:nguithr': 0.04, '*:pipeworm': 0.05, '*:vendingmachine': 0.1, '*:faceling': 0.4, // 卧室无面灵
}
const L3_RAND_STRUCT: Record<string, RandMark> = { // infiniteL3.ts（布局决定性强 → 默认非随机，仅列出概率摆放物）
  '*:bigpainting': 0.25, '*:rattrap': 0.09, '*:landmark': 0.03, '*:statue': 0.22, // 栏后女像
  'sanct:statue': true, 'sanct:stainedglass': true, 'sanct:fallencolumn': true, 'sanct:megposter': true, 'sanct:graffiti': 0.3,
  'dark:graffiti': 0.25, 'dark:debrispile': true, 'dark:scrap': true,
  'lit:graffiti': 0.12, 'assembly:graffiti': 0.12, 'genhall:graffiti': 0.12, 'boiler:graffiti': 0.12,
  '*:cabinet': true, '*:toolbox': true, '*:locker': true, '*:megcrate': true, '*:safebox': true, // 每 chunk 1~2 容器
}
const L3_RAND_ITEM: Record<string, RandMark> = { '*:firesalt': 0.15, '*:tape': 0.1, 'assembly:almond': 0.3 }
const L3_RAND_ENTITY: Record<string, RandMark> = { '*:dryshrimp': 0.22 }
const L4_RAND_STRUCT: Record<string, RandMark> = { // infiniteL4.ts（v54；门/家具/窗均掷点）
  '*:hoteldoor': 0.5, '*:cubicle': 0.75, '*:officechair': 0.6, '*:bigcomputer': 0.5,
  '*:cabinet': 0.2, '*:locker': 0.2, '*:pillar': 0.5, '*:glasswin': true,
}
const L4_RAND_ITEM: Record<string, RandMark> = { '*:almond': true, '*:coffee': true, '*:stapler': true, '*:keycard': true }
const L4_RAND_ENTITY: Record<string, RandMark> = { '*:hound': 0.015, '*:duller': 0.015 }
const L5_RAND_STRUCT: Record<string, RandMark> = { // infiniteL5.ts（v54；门/家具均掷点）
  '*:hoteldoor': 0.75, '*:table': 0.5, '*:loungechair': 0.4, '*:lightgrid': 0.5,
  '*:bed': 0, '*:dresser': 0, '*:dtable': 0, // 布局决定性（阵列/固定位）
  'lounge:phonograph': 0, 'pool:poolladder': 0, 'pool:divingboard': 0, 'gym:gymbench': 0,
}
const L5_RAND_ITEM: Record<string, RandMark> = { '*:skeleton': true, '*:silverware': true, '*:sedative': true }
const L5_RAND_ENTITY: Record<string, RandMark> = { '*:deathmoth': 0.017, '*:hound': 0.012, '*:skinstealer': 0.012, '*:smiler': 0.012 }
// 预制件内随机物（prefabs/*.ts；均决胜性摆放，仅客房银餐具 60% 掉落）
const PREFAB_RAND_ITEM: Record<string, RandMark> = { 'guestroom:silverware': 0.6 }

/** 查审计表：'<变体>:<k>' → '*:<k>' → 默认值；返回 { random, chance? }（0=决定性=不标） */
function randMark(table: Record<string, RandMark>, variant: string, k: string, def: RandMark | 0): { random?: boolean; chance?: number } {
  const v = table[`${variant}:${k}`] ?? table[`*:${k}`] ?? def
  if (v === 0) return {}
  return v === true ? { random: true } : { random: true, chance: v }
}

/** chunk raw（世界坐标内容）→ 布局条目（坐标归一化为 chunk 局部 0..31） */
function extractVariant(level: number, vid: string, name: string, raw: GenChunk, spawnRules: SpawnRule[], seed: number): LayoutEntry {
  const ox = VCX * CS, oy = VCY * CS
  // 各级默认策略：结构 L0/L1 默认决胜、L2 默认随机（房间家具掷点）、L3 默认决胜；物品/实体默认随机（数量掷区间）
  const structDef: RandMark | 0 = level === 2 ? true : 0
  const ST = level === 0 ? L0_RAND_STRUCT : level === 1 ? L1_RAND_STRUCT : level === 2 ? L2_RAND_STRUCT : level === 3 ? L3_RAND_STRUCT : level === 4 ? L4_RAND_STRUCT : L5_RAND_STRUCT
  const IT = level === 0 ? L0_RAND_ITEM : level === 1 ? L1_RAND_ITEM : level === 2 ? L2_RAND_ITEM : level === 3 ? L3_RAND_ITEM : level === 4 ? L4_RAND_ITEM : L5_RAND_ITEM
  const ET = level === 1 ? L1_RAND_ENTITY : level === 2 ? L2_RAND_ENTITY : level === 3 ? L3_RAND_ENTITY : level === 4 ? L4_RAND_ENTITY : level === 5 ? L5_RAND_ENTITY : {}
  return {
    kind: 'variant', id: `l${level}:${vid}`, name, level,
    randomized: true, seed, // v54（任务5）：纯随机布局——本条目只是该种子下的一个样例
    size: [CS, CS],
    tiles: rowsOf(raw.tiles, CS, CS, (v) => v === 1),
    structures: raw.structures.map((s) => ({ ...toStructEntry(s, ox, oy), ...randMark(ST, vid, s.kind, structDef) })),
    entities: raw.entities.map((en): EntityEntry => {
      const marks: Record<string, number | boolean> = {}
      if (en.calm) marks.calm = true // 实例级被动（L2 温顺死亡飞蛾）
      if (en.scale !== undefined) marks.scale = en.scale // 实例级体型缩放
      if (en.hostile) marks.hostile = true // L3 无面灵：剥除被动
      if (en.tool) marks.tool = true // L3 无面灵：石器工具
      if (en.l3face) marks.l3face = true // L3 无面灵：错位面部器官
      if (en.human) marks.human = true // L3 窃皮者：伪装流浪者
      if (en.capybara) marks.capybara = true // L3 尸鼠：水豚形态
      const e: EntityEntry = { type: en.type, x: r2(en.x - ox), y: r2(en.y - oy), ...randMark(ET, vid, en.type, true) }
      if (Object.keys(marks).length) e.marks = marks
      return e
    }),
    // v54：chunk 生成 NPC（BRC 员工/信众）=随机居民槽（flavor=其 faction 池）
    npcs: (raw.npcs ?? []).map((n) => ({ id: 'random', flavor: n.def.faction ?? 'meg', random: true, x: r2(n.x - ox), y: r2(n.y - oy), floor: 0 })),
    items: raw.items.map((i): ItemEntry => ({ type: i.type, x: r2(i.x - ox), y: r2(i.y - oy), ...randMark(IT, vid, i.type, true) })),
    lights: raw.lights.map((l) => toLightEntry(l, ox, oy)),
    exits: raw.exits.map((x) => ({ kind: x.def.kind, name: x.def.name, dest: x.def.dest, x: x.x - ox, y: x.y - oy })),
    spawnRules,
  }
}

// ---- 生成概率规则（数值逐一读自生成器源码；key=「文件.语义」，note=中文说明）----
const L0_RULES: SpawnRule[] = [ // infinite.ts（variantOf / genL0ChunkRaw）
  { key: 'infinite.variant.red.chance', value: 0.014, note: '红室（极稀有）每 chunk 概率' },
  { key: 'infinite.variant.manila.chance', value: 0.032, note: '马尼拉室每 chunk 概率' },
  { key: 'infinite.variant.blackout.chance', value: 0.036, note: '熄灯区每 chunk 概率' },
  { key: 'infinite.variant.pit.chance', value: 0.09, note: '深坑每 chunk 概率' },
  { key: 'infinite.variant.arch.chance', value: 0.09, note: '拱厅每 chunk 概率' },
  { key: 'infinite.variant.pillarhall.chance', value: 0.09, note: '柱厅每 chunk 概率' },
  { key: 'infinite.variant.maze.weight', value: 0.55, note: '常规 chunk 内迷宫权重（柱群 0.25 / 开阔区 0.2）' },
  { key: 'infinite.exit.flickerdoor.perRegion', value: '1/8×8', note: '闪烁的墙壁：每 8×8 chunk 超区域保底 1 个' },
  { key: 'infinite.exit.graystairs.perRegion', value: '1/16×16', note: '向下的灰色阶梯：每 16×16 chunk 超区域 1 个' },
  { key: 'infinite.crate.chance', value: 0.4, note: '板条箱每 chunk 概率（红室不产任何物资）' },
  { key: 'infinite.vent.chance', value: 0.3, note: '通风口每 chunk 概率' },
  { key: 'infinite.socket.chance', value: 0.55, note: '墙上插板每 chunk 概率' },
  { key: 'infinite.graffiti.chance', value: 0.45, note: '涂鸦每 chunk 概率' },
  { key: 'infinite.firesalt.chance', value: 0.06, note: '火盐晶体（角落 ≥2 面墙）每 chunk 概率' },
  { key: 'infinite.tape.chance', value: 0.1, note: '磁带低频保底每 chunk 概率' },
  { key: 'infinite.cashew.replace', value: 0.1, note: '腰果水替代杏仁水的概率' },
  { key: 'infinite.lightgrid.chance', value: 0.5, note: '灯阵每 chunk 概率' },
  { key: 'infinite.hanglight.chance', value: 0.35, note: '吊线荧光灯每 chunk 概率' },
  { key: 'infinite.arch.squirtgun.chance', value: 0.05, note: '拱厅滋水枪每 chunk 概率' },
  { key: 'infinite.manila.megfolder.chance', value: 0.75, note: '马尼拉室第二份 M.E.G. 文件夹概率' },
]
const L1_RULES: SpawnRule[] = [ // infiniteL1.ts（l1VariantOf / genL1ChunkRaw）
  { key: 'infiniteL1.variant.parking.chance', value: 0.32, note: '天鹰段每 chunk 概率（最常见）' },
  { key: 'infiniteL1.variant.aisle.chance', value: 0.38, note: '过道每 chunk 概率' },
  { key: 'infiniteL1.variant.storage.chance', value: 0.14, note: '跃金段每 chunk 概率' },
  { key: 'infiniteL1.variant.gothic.chance', value: 0.07, note: '哥特段每 chunk 概率' },
  { key: 'infiniteL1.variant.maintenance.chance', value: 0.055, note: '维护通廊每 chunk 概率' },
  { key: 'infiniteL1.variant.ouroboros.chance', value: 0.025, note: '衔尾段每 chunk 概率（十分稀有）' },
  { key: 'infiniteL1.variant.garden.chance', value: 0.01, note: '花园段每 chunk 概率（极其稀有）' },
  { key: 'infiniteL1.hetero.chance', value: 0.06, note: '异质 chunk 概率（打破群系聚集；异质不出维护通廊）' },
  { key: 'infiniteL1.landmark.alpha.chance', value: 0.06, note: 'Alpha 基地地标（天鹰段）每 chunk 概率' },
  { key: 'infiniteL1.landmark.tom.chance', value: 0.025, note: 'Tom 的餐馆地标（天鹰段）每 chunk 概率' },
  { key: 'infiniteL1.landmark.bntg.chance', value: 0.06, note: '商人之家地标（跃金段）每 chunk 概率' },
  { key: 'infiniteL1.landmark.ariane.chance', value: 0.06, note: '希波克拉底 - 1 地标（哥特段）每 chunk 概率' },
  { key: 'infiniteL1.sideroom.chance', value: 0.45, note: '维护通廊侧室（办公室/狭室/医务室/橡胶房间/画作宽房）每 chunk 概率' },
  { key: 'infiniteL1.ceilvent.chance', value: 0.06, note: '天花通风管 + 手臂巢每 chunk 概率（维护通廊/花园段不出现）' },
  { key: 'infiniteL1.entity.chance', value: 0.15, note: '常规区段实体每 chunk 概率' },
  { key: 'infiniteL1.entitySafe.chance', value: 0.05, note: '维护通廊/花园段实体每 chunk 概率（几无可遇）' },
  { key: 'infiniteL1.dryshrimp.chance', value: 0.25, note: '旱虾（湿地 1~2 只）每 chunk 概率' },
  { key: 'infiniteL1.nguithr.chance', value: 0.04, note: 'Nguithr\'xurh 网囊每 chunk 概率' },
  { key: 'infiniteL1.firesalt.chance', value: 0.18, note: '火盐晶体每 chunk 概率' },
  { key: 'infiniteL1.tape.chance', value: 0.1, note: '磁带低频保底每 chunk 概率' },
  { key: 'infiniteL1.cashew.replace', value: 0.1, note: '腰果水替代杏仁水的概率' },
  { key: 'infiniteL1.corpse.chance', value: 0.15, note: '尸体每 chunk 概率' },
  { key: 'infiniteL1.lightgrid.chance', value: 0.45, note: '灯阵每 chunk 概率' },
  { key: 'infiniteL1.hanglight.chance', value: 0.3, note: '吊线荧光灯每 chunk 概率' },
]
const L2_RULES: SpawnRule[] = [ // infiniteL2.ts（l2VariantOf / genL2ChunkRaw）
  { key: 'infiniteL2.variant.tidy.chance', value: 0.3, note: '整洁的廊道每 chunk 概率' },
  { key: 'infiniteL2.variant.dim.chance', value: 0.3, note: '晦暗的廊道每 chunk 概率' },
  { key: 'infiniteL2.variant.dirty.chance', value: 0.26, note: '肮脏的廊道每 chunk 概率' },
  { key: 'infiniteL2.variant.warped.chance', value: 0.14, note: '扭曲的廊道每 chunk 概率（最低）' },
  { key: 'infiniteL2.hetero.chance', value: 0.06, note: '异质 chunk 概率（打破群系聚集）' },
  { key: 'infiniteL2.corridor.serve', value: 0.78, note: '竖直廊道贯穿区块概率（否则两端各留 stub）' },
  { key: 'infiniteL2.door.sealed.chance', value: 0.47, note: '廊道侧墙门位：锁死（任何方式打不开）比例' },
  { key: 'infiniteL2.door.open.chance', value: 0.39, note: '门位：未上锁（连廊/设备房/补给间/电脑房/卧室/空房间）比例' },
  { key: 'infiniteL2.door.fire.chance', value: 0.1, note: '门位：消防出口（dest back/3）比例' },
  { key: 'infiniteL2.door.office.chance', value: 0.04, note: '门位：办公走廊（尽头 dest 4）比例' },
  { key: 'infiniteL2.door.corridor.chance', value: 0.28, note: '未上锁门后为横向连廊（双开门）的概率' },
  { key: 'infiniteL2.wallseg.fpipes.chance', value: 0.17, note: '墙面段：贴墙平行粗管比例' },
  { key: 'infiniteL2.wallseg.wpipes.chance', value: 0.14, note: '墙面段：代墙平行管道比例（其余 0.69 为代墙大型机器）' },
  { key: 'infiniteL2.landmark.el3a.chance', value: 0.03, note: '办公区EL3A 海报地标（仅整洁段）每 chunk 概率' },
  { key: 'infiniteL2.windowtrap.chance', value: 0.1, note: '廊道尽头陷阱窗概率' },
  { key: 'infiniteL2.entity.tidy.chance', value: 0.12, note: '实体每 chunk 概率（整洁段；晦暗 0.2 / 肮脏 0.28 / 扭曲 0.26）' },
  { key: 'infiniteL2.smiler.replace', value: 0.3, note: '非整洁段笑魇替代池中一次抽取的概率（落点必须无灯）' },
  { key: 'infiniteL2.pipeworm.chance', value: 0.05, note: '管道蠕虫拟态（肮脏/扭曲段）每 chunk 概率' },
  { key: 'infiniteL2.faceling.bedroom.chance', value: 0.4, note: '卧室无面灵概率（无面灵仅卧室生成）' },
  { key: 'infiniteL2.vendingmachine.chance', value: 0.1, note: '人制品售货机（三面墙死胡同）每 chunk 概率' },
  { key: 'infiniteL2.dryshrimp.chance', value: 0.25, note: '旱虾（湿地 1~2 只）每 chunk 概率' },
  { key: 'infiniteL2.nguithr.chance', value: 0.04, note: 'Nguithr\'xurh 网囊每 chunk 概率' },
  { key: 'infiniteL2.firesalt.chance', value: 0.18, note: '火盐晶体每 chunk 概率' },
  { key: 'infiniteL2.tape.chance', value: 0.08, note: '磁带低频保底每 chunk 概率' },
]
const L3_RULES: SpawnRule[] = [ // infiniteL3.ts（l3VariantOf / genL3ChunkRaw）
  { key: 'infiniteL3.variant.assembly.chance', value: 0.03, note: '装配线（特征房间）每 chunk 概率（最常见）' },
  { key: 'infiniteL3.variant.genhall.chance', value: 0.016, note: '发电室（特征房间）每 chunk 概率' },
  { key: 'infiniteL3.variant.boiler.chance', value: 0.016, note: '锅炉房（特征房间）每 chunk 概率' },
  { key: 'infiniteL3.variant.sanct.chance', value: 0.005, note: '圣所（特征房间）每 chunk 概率（极小；唯一避实体庇护所）' },
  { key: 'infiniteL3.variant.dark.chance', value: 0.35, note: '晦暗廊道占比（照明廊道 0.65）' },
  { key: 'infiniteL3.hetero.chance', value: 0.06, note: '异质 chunk 概率（打破群系聚集）' },
  { key: 'infiniteL3.corrW.dist', value: '0.18/0.42/0.28/0.12', note: '廊道段宽 1/2/3/4 瓦片分布（1 宽=一人宽砖砌隧道）' },
  { key: 'infiniteL3.rowH3.chance', value: 0.25, note: '横向连廊高 3 概率（其余高 2）' },
  { key: 'infiniteL3.corridor.serve', value: 0.78, note: '竖直廊道贯穿区块概率（否则该段缺席）' },
  { key: 'infiniteL3.fence.chance', value: 0.27, note: '竖直段铁栅栏概率（整段封死 0.18 + 带栅栏门 0.09）' },
  { key: 'infiniteL3.hall.chance', value: 0.07, note: '服役廊道段带出开阔厅（6~10 深 × 5~9 长）概率' },
  { key: 'infiniteL3.statue.chance', value: 0.22, note: '无门铁栅栏后立风化希腊女像概率' },
  { key: 'infiniteL3.room.gate.chance', value: 0.5, note: '特征房间 2 宽门洞设铁栅栏门概率（1 宽门洞恒敞开）' },
  { key: 'infiniteL3.bigpainting.chance', value: 0.25, note: '大幅画作每 chunk 概率（圣所/出生 chunk 除外）' },
  { key: 'infiniteL3.rattrap.chance', value: 0.09, note: '尸鼠陷阱每 chunk 概率（圣所/出生 chunk 除外）' },
  { key: 'infiniteL3.landmark.gamma.chance', value: 0.03, note: 'Gamma 基地地标（仅廊道 chunk）概率' },
  { key: 'infiniteL3.faceling.tool.chance', value: 0.4, note: 'L3 无面灵持石器概率（敌意 + 错位面部器官为恒定标记）' },
  { key: 'infiniteL3.entity.chance', value: 0.38, note: '实体每 chunk 概率（0.12 概率第二只；圣所/出生 chunk 不生成）' },
  { key: 'infiniteL3.firesalt.chance', value: 0.15, note: '火盐晶体（角落 1~2 枚）每 chunk 概率' },
  { key: 'infiniteL3.wet.chance', value: 0.22, note: '湿地 + 旱虾每 chunk 概率（圣所不生成）' },
  { key: 'infiniteL3.graffiti.dark.chance', value: 0.25, note: '涂鸦每 chunk 概率（晦暗廊道；其余变体 0.12）' },
  { key: 'infiniteL3.exit.perRegion', value: '1/8×8', note: '电梯出口：每 8×8 chunk 超区域 1 个，→L4/→L5 各半' },
]

const L4_RULES: SpawnRule[] = [ // infiniteL4.ts（l4BlockBiome / genL4ChunkRaw）
  { key: 'infiniteL4.variant.officehall.chance', value: 0.3, note: '办公间区街区占比（群系聚集；出生街区恒定）' },
  { key: 'infiniteL4.variant.open.chance', value: 0.25, note: '空旷区街区占比' },
  { key: 'infiniteL4.variant.windowview.chance', value: 0.15, note: '窗景区街区占比（最少）' },
  { key: 'infiniteL4.variant.smallrooms.chance', value: 0.3, note: '小房间区街区占比' },
  { key: 'infiniteL4.hetero.chance', value: 0.06, note: '异质街区概率（打破群系聚集）' },
  { key: 'infiniteL4.exit.elevator.perRegion', value: '1/8×8', note: '电梯（→L3 免费回程）：每 8×8 chunk 超区域 1 个 + 出生 chunk 保底，西/东墙门洞位雕壁龛嵌墙（房内背面格回砌成墙）' },
  { key: 'infiniteL4.exit.oldstairs.perRegion', value: '55%/8×8', note: '年久失修的古典楼梯：8×8 chunk 超区域 55% 宿主 1 部（→L5 唯一楼梯出口；v54b 假楼梯已删，v54c 上调）' },
  { key: 'infiniteL4.exit.trapdoor.chance', value: 0.015, note: '年久失修的活板门：每个小房间概率（→L6；落地式不嵌墙）' },
  { key: 'infiniteL4.entity.chance', value: 0.015, note: '实体每 chunk 概率（仅猎犬/钝人；出生安全区不生成）' },
  { key: 'infiniteL4.item.almond.weight', value: 40, note: '杏仁水物品权重（v54b 再上调，全后室最高；UNIVERSAL 杏仁水 18 次之）' },
  { key: 'infiniteL4.vending.officehall.chance', value: 0.3, note: '自动售货机：办公间区每街区概率（北/西墙边；免费取用+出货后 25% 卡死）' },
  { key: 'infiniteL4.vending.smallrooms.chance', value: 0.15, note: '自动售货机：小房间区每街区概率（首子房间角落）' },
]

const L5_RULES: SpawnRule[] = [ // infiniteL5.ts（l5BlockBiome / genL5ChunkRaw）
  { key: 'infiniteL5.variant.mainhall.chance', value: 0.2, note: '主厅街区占比（挑高 ceiling=1；出生街区恒定；电梯槽位只在主厅墙）' },
  { key: 'infiniteL5.variant.beverly.chance', value: 0.08, note: '贝弗莉室街区占比（极空旷 + 四面墙全开门洞）' },
  { key: 'infiniteL5.variant.maintenance.chance', value: 0.12, note: '维修大厅街区占比' },
  { key: 'infiniteL5.variant.dining.chance', value: 0.12, note: '餐厅街区占比' },
  { key: 'infiniteL5.variant.guestroom.chance', value: 0.24, note: '客房街区占比（2×2 小房间；五类房间中最常见）' },
  { key: 'infiniteL5.variant.lounge.chance', value: 0.09, note: '休息室街区占比' },
  { key: 'infiniteL5.variant.gym.chance', value: 0.06, note: '健身房街区占比' },
  { key: 'infiniteL5.variant.pool.chance', value: 0.045, note: '游泳池街区占比（liquid 浅水/深水）' },
  { key: 'infiniteL5.variant.boilerroom.chance', value: 0.045, note: '锅炉房街区占比（含 →L6 黑门）' },
  { key: 'infiniteL5.hetero.chance', value: 0.06, note: '异质街区概率（打破群系聚集）' },
  { key: 'infiniteL5.exit.elevator.perRegion', value: '1/8×8', note: '电梯（→L3 免费回程）：主厅壁龛槽位，每 8×8 超区域 1 个 + 出生 chunk 保底（西/东门洞雕壁龛、房内背面格回砌成墙）' },
  { key: 'infiniteL5.exit.oldstairs.perRegion', value: '55%/8×8', note: '年久失修的古典楼梯（→L4 回程）：8×8 超区域 55% 宿主 + 出生 chunk 保底 1 部（L4→L5 抵达落点=楼梯 2 格外空旷地板）' },
  { key: 'infiniteL5.exit.boilerdeep.perBlock', value: '1/锅炉房街区', note: '锅炉房深处完全黑暗的门（→L6）：每锅炉房街区 1 扇，距门洞最远内角、5 格内无灯' },
  { key: 'infiniteL5.exit.darkwooddoor.chance', value: 0.02, note: '深色木门（→L9）：客房房门掷点 2% 替代正常房门' },
  { key: 'infiniteL5.guestdoor.locked.chance', value: 0.25, note: '客房门上锁概率（撬棍/万能钥匙/斧头可撬——有限 L5 房门锁机制保留）' },
  { key: 'infiniteL5.entity.chance', value: 0.017, note: '实体每 chunk 概率（1.2% 权重池 + 0.5% 死亡飞蛾单列[主巢]；出生安全区不生成）' },
]

// ================= 预制件 =================
/** 合成 w×h 全墙 GameMap（fill 只摆放内容、不改地形；地形由放置器在真实地图中开凿） */
function blankMap(w: number, h: number): GameMap {
  return {
    w, h,
    tiles: new Uint8Array(w * h).fill(2),
    structures: [], items: [], lights: [], exits: [], entities: [],
    spawn: { x: 0, y: 0 },
    wet: new Uint8Array(w * h), elev: new Uint8Array(w * h), outdoor: new Uint8Array(w * h),
    step: new Uint8Array(w * h), crawl: new Uint8Array(w * h), ceiling: new Uint8Array(w * h),
    up: new Uint8Array(w * h), upWall: new Uint8Array(w * h),
    up2: new Uint8Array(w * h), upWall2: new Uint8Array(w * h),
    stair: new Int32Array(w * h), liquid: new Uint8Array(w * h),
    floors: 1, tint: new Uint8Array(w * h),
    dn: new Uint8Array(w * h), dnWall: new Uint8Array(w * h), // v56：地下平面数组（L6 -1F；其余层级全 0）
  }
}

function extractPrefab(p: PrefabDef): LayoutEntry {
  const m = blankMap(p.w, p.h)
  const rng = new RNG(SEED) // 固定种子：fill 内的随机分支（锁状态/物品抖动）结果确定
  // 门洞瓦片：carve 模式取底边中点（与放置器语义一致），overlay 模式无门（placement 传 -1）
  const door = p.mode === 'overlay' ? { doorX: -1, doorY: -1 } : { doorX: p.w >> 1, doorY: p.h - 1 }
  p.fill({ m, rng, x: 0, y: 0, w: p.w, h: p.h, ...door })
  return {
    kind: 'prefab', id: p.id, name: p.name, level: levelOf(p),
    size: [p.w, p.h],
    tiles: rowsOf(m.tiles, p.w, p.h, (v) => v === 1),
    structures: m.structures.map((s) => toStructEntry(s)),
    // v54：预制件内随机物审计（PREFAB_RAND_ITEM，如客房银餐具 60%）；其余为决胜性摆放
    items: m.items.map((i) => ({ type: i.type, x: r2(i.x), y: r2(i.y), ...randMark(PREFAB_RAND_ITEM, p.id, i.type, 0) })),
    lights: m.lights.map((l) => toLightEntry(l)),
    spawnRules: [
      { key: `prefabs.${p.id}.prob`, value: p.prob, note: `${p.name}每张地图生成概率（1=100%）` },
      { key: `prefabs.${p.id}.count`, value: `${p.min}~${p.max}`, note: '每次生成的数量区间' },
      { key: `prefabs.${p.id}.mode`, value: p.mode ?? 'carve', note: 'carve=向墙区开洞造房 / overlay=植入既有开阔区' },
    ],
  }
}

// ================= 对外入口 =================
// 变体生成器分派（重采样与全量提取共用；v54 任务5：设计模式换种子在浏览器内重新采样）
const VARIANT_GEN: Record<number, {
  names: Record<string, string>
  rules: SpawnRule[]
  gen: (def: LevelDef, seed: number, cx: number, cy: number, v: string) => GenChunk
}> = {
  0: { names: VARIANT_NAMES, rules: L0_RULES, gen: (d, s, cx, cy, v) => genL0ChunkRaw(d, s, cx, cy, v as L0Variant) },
  1: { names: L1_VARIANT_NAMES, rules: L1_RULES, gen: genL1ChunkRaw },
  2: { names: L2_VARIANT_NAMES, rules: L2_RULES, gen: genL2ChunkRaw },
  3: { names: L3_VARIANT_NAMES, rules: L3_RULES, gen: genL3ChunkRaw },
  4: { names: L4_VARIANT_NAMES, rules: L4_RULES, gen: genL4ChunkRaw },
  5: { names: L5_VARIANT_NAMES, rules: L5_RULES, gen: genL5ChunkRaw },
}

/** 按新种子重采样一个变体布局（id='l3:sanct' 形式；非变体/未知 id 返回 null）。设计模式「随机样例」用 */
export function resampleVariant(id: string, seed: number): LayoutEntry | null {
  const m = /^l(\d):(.+)$/.exec(id)
  if (!m) return null
  const level = Number(m[1]), vid = m[2]
  const g = VARIANT_GEN[level]
  const def = levelDefOf(level)
  if (!g || !def || !(vid in g.names)) return null
  return extractVariant(level, vid, g.names[vid], g.gen(def, seed, VCX, VCY, vid), g.rules, seed)
}

/** 提取全部布局条目：据点 ×7 + 变体 ×39（L0×9 / L1×7 / L2×4 / L3×6 / L4×4 / L5×9）+ 预制件 ×11 */
export function extractLayouts(): LayoutEntry[] {
  const out: LayoutEntry[] = []
  // 据点（alpha/bntg/ariane/tom/el3a/gamma + jerry 274）
  for (const [key, o] of Object.entries(OUTPOSTS)) out.push(extractOutpost(key, o))
  // 无限层变体 ×39（L0×9 / L1×7 / L2×4 / L3×6 / L4×4 / L5×9，统一固定种子采样）
  for (const [lv, g] of Object.entries(VARIANT_GEN)) {
    const def = levelDefOf(Number(lv))!
    for (const vid of Object.keys(g.names))
      out.push(extractVariant(Number(lv), vid, g.names[vid], g.gen(def, SEED, VCX, VCY, vid), g.rules, SEED))
  }
  // 预制件 ×11
  for (const p of PREFABS) out.push(extractPrefab(p))
  return out
}
