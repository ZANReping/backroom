// 设计模式数据提取冒烟（v54）：跑 extractLayouts/extractCodex/buildDesignFile 并断言——
//   据点×变体×预制件数量对得上注册表；每个 LayoutEntry 的 tiles 行列数与 size 一致；
//   据点含 NPC 与出口；多层据点的 up/up2/stair 存在；L3 sanct 变体含 angelstatue；
//   codex 条目数 ≥ 实体 35 + 物品 79 + 层级 + 文档等下限；导出 JSON 可序列化。
// 用法：npx tsx --tsconfig .check/tsconfig.run.json .check/design-smoke.mts
import { extractLayouts, resampleVariant } from '../src/game/design/extractLayouts.ts'
import { extractCodex } from '../src/game/design/extractCodex.ts'
import { buildDesignFile } from '../src/game/design/buildDesignFile.ts'
import { OUTPOSTS } from '../src/game/content/outposts.ts'
import { VARIANT_NAMES } from '../src/game/world/infinite.ts'
import { L1_VARIANT_NAMES } from '../src/game/world/infiniteL1.ts'
import { L2_VARIANT_NAMES } from '../src/game/world/infiniteL2.ts'
import { L3_VARIANT_NAMES } from '../src/game/world/infiniteL3.ts'
import { L4_VARIANT_NAMES } from '../src/game/world/infiniteL4.ts'
import { L5_VARIANT_NAMES } from '../src/game/world/infiniteL5.ts'
import { PREFABS } from '../src/game/prefabs/index.ts'
import { ENTITIES } from '../src/game/entities/index.ts'
import { ITEMS } from '../src/game/content/items.ts'
import { LEVELS } from '../src/game/levels/index.ts'
import { DOCS } from '../src/game/content/docs.ts'
import { NPCS } from '../src/game/content/npcs.ts'
import { FACTIONS } from '../src/game/content/factions.ts'
import { PHENOMENA } from '../src/game/content/phenomena.ts'

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

// ---------- 1) layouts：数量对得上注册表 ----------
const layouts = extractLayouts()
const outposts = layouts.filter((e) => e.kind === 'outpost')
const variants = layouts.filter((e) => e.kind === 'variant')
const prefabs = layouts.filter((e) => e.kind === 'prefab')
const nVariants = Object.keys(VARIANT_NAMES).length + Object.keys(L1_VARIANT_NAMES).length
  + Object.keys(L2_VARIANT_NAMES).length + Object.keys(L3_VARIANT_NAMES).length + Object.keys(L4_VARIANT_NAMES).length
  + Object.keys(L5_VARIANT_NAMES).length
if (outposts.length !== Object.keys(OUTPOSTS).length) bad(`据点条目 ${outposts.length} ≠ OUTPOSTS 注册表 ${Object.keys(OUTPOSTS).length}`)
else ok(`据点 ×${outposts.length}（${outposts.map((e) => e.id).join('/')}）`)
if (variants.length !== nVariants) bad(`变体条目 ${variants.length} ≠ 注册表 ${nVariants}`)
else ok(`变体 ×${variants.length}（L0×${Object.keys(VARIANT_NAMES).length} L1×${Object.keys(L1_VARIANT_NAMES).length} L2×${Object.keys(L2_VARIANT_NAMES).length} L3×${Object.keys(L3_VARIANT_NAMES).length} L4×${Object.keys(L4_VARIANT_NAMES).length} L5×${Object.keys(L5_VARIANT_NAMES).length}）`)
if (prefabs.length !== PREFABS.length) bad(`预制件条目 ${prefabs.length} ≠ PREFABS 注册表 ${PREFABS.length}`)
else ok(`预制件 ×${prefabs.length}（${prefabs.map((e) => e.id).join('/')}）`)

// ---------- 2) 每个 LayoutEntry：tiles 行列数与 size 一致、字符合法、多层数组同形 ----------
for (const e of layouts) {
  const [w, h] = e.size
  if (e.tiles.length !== h) bad(`${e.id} tiles 行数 ${e.tiles.length} ≠ size[1] ${h}`)
  for (const row of e.tiles) {
    if (row.length !== w) { bad(`${e.id} tiles 行宽 ${row.length} ≠ size[0] ${w}`); break }
    if (!/^[#.]+$/.test(row)) { bad(`${e.id} tiles 含非法字符`); break }
  }
  for (const key of ['up', 'up2', 'upWall', 'upWall2'] as const) {
    const arr = e[key]
    if (!arr) continue
    if (arr.length !== h || arr.some((r) => r.length !== w)) bad(`${e.id} ${key} 行列数与 size 不一致`)
  }
  for (const s of e.structures ?? [])
    if (s.x < 0 || s.y < 0 || s.x + s.w > w || s.y + s.h > h) bad(`${e.id} 结构 ${s.kind} 越界 (${s.x},${s.y},${s.w}×${s.h})`)
}
ok(`全部 ${layouts.length} 条布局 tiles/多层数组尺寸自洽`)

// ---------- 3) 据点：含 NPC 与出口；多层据点有 up/up2/stair ----------
for (const e of outposts) {
  if (!e.npcs?.length) bad(`据点 ${e.id} 没有 NPC`)
  if (!e.exits?.length) bad(`据点 ${e.id} 没有出口`)
  for (const x of e.exits ?? []) if (x.dest === undefined) bad(`据点 ${e.id} 出口 ${x.kind} 缺 dest`)
}
const el3a = outposts.find((e) => e.id === 'el3a')
if (!el3a?.up?.length || !el3a?.stair?.length) bad('据点 el3a 缺 2F 楼板（up）或楼梯（stair）')
const gamma = outposts.find((e) => e.id === 'gamma')
if (!gamma?.up2?.length || !gamma?.upWall2?.length) bad('据点 gamma 缺 3F 楼板/墙体（up2/upWall2）')
if (gamma && gamma.floors !== 3) bad(`据点 gamma floors=${gamma.floors} ≠ 3`)
ok('据点 NPC/出口齐备，el3a 双层与 gamma 三层数据存在')

// ---------- 4) 变体抽查：l3:sanct 含 angelstatue；全部 variant 为 32×32 ----------
for (const e of variants) if (e.size[0] !== 32 || e.size[1] !== 32) bad(`变体 ${e.id} size=${e.size} ≠ 32×32`)
const sanct = variants.find((e) => e.id === 'l3:sanct')
if (!sanct) bad('缺 l3:sanct 变体条目')
else if (!sanct.structures?.some((s) => s.kind === 'angelstatue')) bad('l3:sanct 不含 angelstatue')
else ok('l3:sanct 含 angelstatue（圣所大型天使像）')
const manila = variants.find((e) => e.id === 'l0:manila')
if (!manila?.structures?.some((s) => s.kind === 'megdoc')) bad('l0:manila 不含 megdoc（马尼拉室桌上文档）')
const ouro = variants.find((e) => e.id === 'l1:ouroboros')
if (!ouro?.npcs?.length) bad('l1:ouroboros 不含 BRC 员工 NPC')
for (const e of variants) if (!e.spawnRules?.length) bad(`变体 ${e.id} 缺 spawnRules`)
ok('变体抽查通过（sanct/manila/ouroboros 特征内容 + spawnRules）')

// ---------- 5) codex：分类数量对得上注册表 + 下限 ----------
const codex = extractCodex()
const by = (k: string) => codex.filter((e) => e.kind === k)
const expect = (k: string, n: number, floor: number) => {
  const c = by(k).length
  if (c !== n) bad(`codex ${k} 条目 ${c} ≠ 注册表 ${n}`)
  else if (c < floor) bad(`codex ${k} 条目 ${c} < 下限 ${floor}`)
  else ok(`codex ${k} ×${c}`)
}
expect('entity', Object.keys(ENTITIES).length, 35)
expect('item', Object.keys(ITEMS).length, 79)
expect('level', LEVELS.length + 7, 20) // 13 常规（含 601）+ 7 据点层级（含 274）
expect('phenomenon', Object.keys(PHENOMENA).length, 3)
expect('faction', Object.keys(FACTIONS).length, 6)
expect('outpost', Object.keys(OUTPOSTS).length, 7)
expect('npc', Object.keys(NPCS).length, 10)
expect('doc', Object.keys(DOCS).length, 10)
// v54 任务1：cecs 评分并入所属条目（entity=cecs.* / level=scores.* / item=iots.*）
{
  const hound2 = codex.find((e) => e.kind === 'entity' && e.id === 'hound')
  for (const k of ['cecs.class', 'cecs.intel', 'cecs.threat', 'cecs.props.0'])
    if (!hound2 || !(k in hound2.fields)) bad(`entity hound 缺评分字段 ${k}`)
  const l0 = codex.find((e) => e.kind === 'level' && e.id === '0')
  for (const k of ['scores.ext', 'scores.env', 'scores.ent']) if (!l0 || !(k in l0.fields)) bad(`level 0 缺评分字段 ${k}`)
  const alm = codex.find((e) => e.kind === 'item' && e.id === 'almond')
  for (const k of ['iots.frequency', 'iots.utility', 'iots.origin']) if (!alm || !(k in alm.fields)) bad(`item almond 缺 IOTS 字段 ${k}`)
  if (by('cecs').length) bad('不应再有独立 cecs 条目（已并入所属条目）')
  ok('评分字段并入 entity/level/item 条目（cecs.*/scores.*/iots.*）')
}
// v54：楼梯条目（多层据点）dir 1..4 且 lo<hi
for (const oid of ['el3a', 'gamma']) {
  const sts = outposts.find((e) => e.id === oid)?.stair ?? []
  if (!sts.length) bad(`据点 ${oid} 缺 stair 条目`)
  for (const st of sts) if (st.dir < 1 || st.dir > 4 || st.lo >= st.hi) bad(`据点 ${oid} 楼梯 (${st.x},${st.y}) dir=${st.dir} lo=${st.lo} hi=${st.hi} 非法`)
}
// 字段键抽查：实体 codex 各栏 / NPC 对话树 / 文档段落
const hound = codex.find((e) => e.kind === 'entity' && e.id === 'hound')
for (const k of ['name', 'desc', 'codex.no', 'codex.danger', 'codex.habitat', 'codex.behavior', 'codex.counter', 'codex.lore.0', 'codex.sighting'])
  if (!hound || !(k in hound.fields)) bad(`entity hound 缺字段 ${k}`)
const anyNpc = by('npc')[0]
if (anyNpc && !Object.keys(anyNpc.fields).some((k) => /^lines\.\d+\.npc$/.test(k))) bad(`npc ${anyNpc.id} 缺 lines.N.npc 字段`)
const megDoc = codex.find((e) => e.kind === 'doc' && e.id === 'meg_levels')
if (!megDoc || !('body.0.head' in megDoc.fields) || !('body.0.paras.0' in megDoc.fields)) bad('doc meg_levels 缺 body.N.head/paras.M 字段')

// ---------- 5b) v54 第二批：randomized/random/chance/随机 NPC 槽/zones 矩形 ----------
for (const e of variants) {
  if (e.randomized !== true) bad(`变体 ${e.id} 缺 randomized: true`)
  if (e.seed !== 424242) bad(`变体 ${e.id} seed=${e.seed} ≠ 424242`)
}
ok(`${variants.length} 条变体均带 randomized + 采样种子`)
// sanct 天使像=决定性摆放（不标 random）；同种子重采样结果确定
const angel = sanct?.structures?.find((s) => s.kind === 'angelstatue')
if (angel?.random) bad('l3:sanct 的 angelstatue 被误标随机（应为决定性摆放）')
const re1 = resampleVariant('l3:sanct', 999)
const re2 = resampleVariant('l3:sanct', 999)
if (!re1 || !re2) bad('resampleVariant(l3:sanct) 返回 null')
else {
  if (re1.tiles.join('') !== re2.tiles.join('')) bad('resampleVariant 同种子结果不一致')
  if (!re1.structures?.some((s) => s.kind === 'angelstatue')) bad('resampleVariant(999) 的 sanct 缺 angelstatue')
  if (re1.seed !== 999) bad('重采样条目 seed 字段未更新')
  ok('resampleVariant 确定性 + sanct 特征保持')
}
// 随机标记审计抽查（带 chance 的对象）
let randWithChance = 0
for (const e of variants) {
  for (const s of e.structures ?? []) {
    if (s.random) {
      if (s.chance !== undefined) {
        randWithChance++
        if (s.kind === 'bigpainting' && s.chance !== 0.25) bad(`${e.id} bigpainting chance=${s.chance} ≠ 0.25`)
        if (s.kind === 'crate' && e.id.startsWith('l0:') && s.chance !== 0.4 && e.id !== 'l0:manila') bad(`${e.id} crate chance=${s.chance} ≠ 0.4`)
      }
    }
  }
  for (const it of e.items ?? []) if (it.random && it.chance !== undefined) randWithChance++
  for (const en of e.entities ?? []) if (!en.random) bad(`${e.id} 实体 ${en.type} 未标随机（变体实体均应按概率生成）`)
}
if (!randWithChance) bad('变体条目没有任何带 chance 的随机标记')
else ok(`随机生成物标记（含 chance）×${randWithChance}`)
// 随机 NPC 槽：据点随机居民 → id 'random' + flavor；衔尾段 BRC 员工 → flavor brc
const alpha = outposts.find((e) => e.id === 'alpha')
if (!alpha?.npcs?.some((n) => n.id === 'random' && n.flavor === 'meg')) bad('alpha 据点缺随机居民槽（flavor meg）')
const jerry = outposts.find((e) => e.id === 'jerry')
if (!jerry?.npcs?.some((n) => n.id === 'random' && n.flavor === 'jerry')) bad('jerry 据点缺随机信众槽（flavor jerry）')
if (!ouro?.npcs?.some((n) => n.id === 'random' && n.flavor === 'brc' && n.random)) bad('l1:ouroboros 缺 BRC 员工随机 NPC 槽')
else ok('随机 NPC 槽（alpha meg / jerry / ouroboros brc）')
// zones 矩形范围（Gamma/EL3A 已写入）
const gz = outposts.find((e) => e.id === 'gamma')?.zones ?? []
const hall = gz.find((z) => z.name === '大厅')
if (!hall || hall.x0 !== 10 || hall.x1 !== 69) bad('gamma 大厅区域缺矩形范围 (10..69)')
const g3f = gz.find((z) => z.name === '主管办公室')
if (!g3f || g3f.z !== 2 || g3f.x0 === undefined) bad('gamma 主管办公室缺 3F 矩形范围')
const ez = outposts.find((e) => e.id === 'el3a')?.zones ?? []
if (!ez.find((z) => z.name === '夹楼走廊（2F）')?.x0) bad('el3a 夹楼走廊缺矩形范围')
if (gz.every((z) => z.x0 !== undefined) && ez.every((z) => z.x0 !== undefined)) ok('gamma/el3a zones 全部带矩形范围')
// 预制件随机物：客房银餐具 60%（样本内出现才校验标记）
const guest = prefabs.find((e) => e.id === 'guestroom')
const silver = guest?.items?.find((i) => i.type === 'silverware')
if (silver && !(silver.random && silver.chance === 0.6)) bad('guestroom silverware 随机标记错误')

// ---------- 6) 组装导出：JSON 可序列化、format 正确 ----------
const design = buildDesignFile(layouts, codex)
if (design.format !== 'backroom-design/v1') bad(`format=${design.format}`)
let json = ''
try { json = JSON.stringify(design) } catch (e) { bad(`JSON.stringify 失败：${(e as Error).message}`) }
if (json) {
  const back = JSON.parse(json) as typeof design
  if (back.layouts?.length !== layouts.length || back.codex?.length !== codex.length) bad('JSON 往返后条目数不一致')
  else ok(`buildDesignFile 可序列化（${(json.length / 1024).toFixed(0)} KB，layouts×${layouts.length} codex×${codex.length}）`)
}

if (fail) { console.log(`\n✗ ${fail} 项失败`); process.exit(1) }
console.log('\n✓ 设计模式数据提取冒烟全部通过')
