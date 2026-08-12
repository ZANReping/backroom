// ================= v54：设计模式数据提取——图鉴文案条目（DESIGN-GUIDE.md §3）=================
// 按 §3 的表覆盖 9 类条目；fields 键=源文件字段点号路径（嵌套用点号，数组用数字下标），
// 值=当前完整文本（设计模式的编辑是整体替换，不是 diff）。
// 两处键名以 DESIGN-GUIDE 为准、与源文件字段名不同（导入落地时映射回源字段）：
//   faction.fullName ↔ factions.ts 的 en；npc.backstory ↔ npcs.ts 的 background。
// npc 对话树按 lines.N.npc（NPC 台词）/ lines.N.opts.M.text（玩家回复选项）展开。
// cecs 类为 codexScores.ts 的评分数据（层级三维/实体形态/性质/IETS 智能威胁/物品 IOTS），
// v54 起开放编辑——落地映射见 DESIGN-GUIDE §3 附表。
import { ENTITIES } from '../entities'
import { ITEMS } from '../content/items'
import { LEVELS, levelDefOf, levelNo } from '../levels'
import { PHENOMENA } from '../content/phenomena'
import { FACTIONS } from '../content/factions'
import { OUTPOSTS } from '../content/outposts'
import { NPCS } from '../content/npcs'
import { DOCS } from '../content/docs'
import { ENTITY_CECS, ENTITY_CECS_CLASS, ENTITY_INTEL, LEVEL_SCORES, itemIOTS } from '../content/codexScores'
import { entityThreat } from '../entities/spawns'
import type { LevelDef } from '../core/types'
import type { CodexEntry } from './types'

/** level 条目（§3：name / label / flavor / lore / sd / entrance / exitDesc + scores.* 层级三维评分；缺省字段不导出=保持现状） */
function levelEntry(def: LevelDef): CodexEntry {
  const fields: Record<string, string | number> = { name: def.name, flavor: def.flavor, entrance: def.entrance }
  if (def.label !== undefined) fields.label = def.label
  if (def.lore !== undefined) fields.lore = def.lore
  if (def.sd !== undefined) fields.sd = def.sd
  if (def.exitDesc !== undefined) fields.exitDesc = def.exitDesc
  // id=玩家可见编号（levelNo：601 结局层用 displayId；据点用独立 id 空间 101–106/274）
  const no = levelNo(def.id)
  // v54 任务1：层级三维评分并入 level 条目（scores.* ↔ codexScores.LEVEL_SCORES[可见编号]）
  const sc = LEVEL_SCORES[no]
  if (sc) {
    fields['scores.ext'] = sc.ext; fields['scores.env'] = sc.env; fields['scores.ent'] = sc.ent
    if (sc.cls !== undefined) fields['scores.cls'] = sc.cls
  }
  return { kind: 'level', id: String(no), fields }
}

/** 提取全部图鉴文案条目 */
export function extractCodex(): CodexEntry[] {
  const out: CodexEntry[] = []

  // ---- entity：entities/ 全部注册实体（codex 各栏 + lore 逐段 + cecs.* 评分）----
  for (const def of Object.values(ENTITIES)) {
    const fields: Record<string, string | number> = {
      name: def.name, desc: def.desc,
      'codex.no': def.codex.no, 'codex.danger': def.codex.danger, 'codex.habitat': def.codex.habitat,
      'codex.behavior': def.codex.behavior, 'codex.counter': def.codex.counter,
      'codex.sighting': def.codex.sighting,
    }
    def.codex.lore.forEach((s, i) => { fields[`codex.lore.${i}`] = s })
    // v54 任务1：CECS 形态/性质/IETS 并入 entity 条目（cecs.* ↔ codexScores 各表；threat=codex.danger 首位）
    if (ENTITY_CECS_CLASS[def.type] !== undefined) fields['cecs.class'] = ENTITY_CECS_CLASS[def.type]
    ;(ENTITY_CECS[def.type] ?? []).forEach((c, i) => { fields[`cecs.props.${i}`] = c })
    if (ENTITY_INTEL[def.type] !== undefined) fields['cecs.intel'] = ENTITY_INTEL[def.type]
    fields['cecs.threat'] = entityThreat(def)
    out.push({ kind: 'entity', id: def.type, fields })
  }

  // ---- item：content/items.ts（name / desc）----
  for (const def of Object.values(ITEMS)) {
    // v54 任务1：IOTS 三栏并入 item 条目（iots.* ↔ IOTS_*_OVERRIDE 覆盖表；无覆盖=规则推导值）
    const c = itemIOTS(def)
    out.push({
      kind: 'item', id: def.type,
      fields: { name: def.name, desc: def.desc, 'iots.frequency': c.frequency, 'iots.utility': c.utility, 'iots.origin': c.origin },
    })
  }

  // ---- level：levels/ 全部（13 常规含 601 结局层 + 7 据点层级含 274）----
  const OUTPOST_LEVEL_IDS = [101, 102, 103, 104, 105, 106, 274] // levels/index.ts 的 OUTPOST_LEVEL_DEFS
  for (const def of LEVELS) out.push(levelEntry(def))
  for (const id of OUTPOST_LEVEL_IDS) {
    const def = levelDefOf(id)
    if (def) out.push(levelEntry(def))
  }

  // ---- phenomenon：content/phenomena.ts（name / desc）----
  for (const def of Object.values(PHENOMENA))
    out.push({ kind: 'phenomenon', id: def.id, fields: { name: def.name, desc: def.desc } })

  // ---- faction：content/factions.ts（name / fullName / desc；fullName ↔ 源字段 en）----
  for (const def of Object.values(FACTIONS))
    out.push({ kind: 'faction', id: def.id, fields: { name: def.name, fullName: def.en, desc: def.desc } })

  // ---- outpost：content/outposts.ts（name / intro.N / landmarkText.N）----
  for (const def of Object.values(OUTPOSTS)) {
    const fields: Record<string, string> = { name: def.name }
    def.intro.forEach((s, i) => { fields[`intro.${i}`] = s })
    def.landmarkText.forEach((s, i) => { fields[`landmarkText.${i}`] = s })
    out.push({ kind: 'outpost', id: def.id, fields })
  }

  // ---- npc：content/npcs.ts 注册表（name / role / personality / backstory / lines.N / idle.N；
  //      backstory ↔ 源字段 background；lines.N 展开为 lines.N.npc 与 lines.N.opts.M.text）----
  for (const def of Object.values(NPCS)) {
    const fields: Record<string, string> = {
      name: def.name, role: def.role, personality: def.personality, backstory: def.background,
    }
    def.lines.forEach((node, i) => {
      fields[`lines.${i}.npc`] = node.npc
      node.opts.forEach((opt, j) => { fields[`lines.${i}.opts.${j}.text`] = opt.text })
    })
    def.idle.forEach((s, i) => { fields[`idle.${i}`] = s })
    out.push({ kind: 'npc', id: def.id, fields })
  }

  // ---- doc：content/docs.ts（title / no / body.N.head / body.N.paras.M）----
  for (const def of Object.values(DOCS)) {
    const fields: Record<string, string> = { title: def.title, no: def.no }
    def.body.forEach((sec, i) => {
      fields[`body.${i}.head`] = sec.head
      sec.paras.forEach((p, j) => { fields[`body.${i}.paras.${j}`] = p })
    })
    out.push({ kind: 'doc', id: def.id, fields })
  }

  return out
}
