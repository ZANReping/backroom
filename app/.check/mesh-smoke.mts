// 建模冒烟：用 three 桩跑通全部实体/物品/结构低模构建，捕获空引用与 API 误用
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh.ts'
import { buildItemMesh } from '../src/game/renderer/itemsMesh.ts'
import { buildStructure } from '../src/game/renderer/structures.ts'
import { ENTITIES } from '../src/game/entities/index.ts'
import { ITEMS } from '../src/game/items.ts'
import type { Structure, StructKind } from '../src/game/types.ts'
import { generateLevel } from '../src/game/mapgen.ts'
import { LEVELS } from '../src/game/levels/index.ts'

// 画布桩：结构/纹理里会用 document.createElement('canvas') 生成程序化贴图
const ctx2d = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return { width: 128, height: 128 }
  if (k === 'fillStyle' || k === 'strokeStyle' || k === 'font' || k === 'lineWidth' || k === 'globalAlpha' || k === 'textAlign' || k === 'textBaseline' || k === 'lineCap' || k === 'lineJoin' || k === 'globalCompositeOperation' || k === 'filter' || k === 'shadowBlur' || k === 'shadowColor') return ''
  return (...a: unknown[]) => { void a; return k === 'measureText' ? { width: 10 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? { addColorStop: () => {} } : k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray(4 * 128 * 128) } : undefined }
} }) as unknown as CanvasRenderingContext2D
;(globalThis as unknown as { document: unknown }).document = {
  createElement: (t: string) => t === 'canvas'
    ? { width: 128, height: 128, getContext: () => ctx2d, toDataURL: () => 'data:,' }
    : { style: {}, appendChild: () => {}, setAttribute: () => {} },
  getElementById: () => null,
  body: { appendChild: () => {} },
}

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const count = (o: { children?: unknown[] }): number => {
  let n = 1
  for (const c of (o.children ?? []) as { children?: unknown[] }[]) n += count(c)
  return n
}

// 1) 实体
let en = 0, emin = 1e9, ebad: string[] = []
for (const t of Object.keys(ENTITIES)) {
  try {
    const g = buildEntityMesh(t)
    const n = count(g)
    en++; emin = Math.min(emin, n)
    if (n < 3) ebad.push(`${t}(${n})`)
    const parts = g.userData.parts as Record<string, unknown>
    if (!parts || Object.keys(parts).length === 0) ebad.push(`${t}:无 parts`)
  } catch (e) { bad(`实体 ${t} 建模抛异常：${(e as Error).message}`) }
}
console.log(`实体模型：${en}/${Object.keys(ENTITIES).length} 构建成功，最小节点数 ${emin}${ebad.length ? '，可疑：' + ebad.join(' ') : ''}`)

// 2) 物品
let inn = 0, ibad: string[] = []
const ifb: string[] = []
for (const t of Object.keys(ITEMS)) {
  try {
    const g = buildItemMesh(t)
    const n = count(g)
    inn++
    if (n < 3) ibad.push(`${t}(${n})`)
    if (g.userData.fallback) ifb.push(t) // v40：通用 fallback = 缺专属低模（零容忍）
  } catch (e) { bad(`物品 ${t} 建模抛异常：${(e as Error).message}`) }
}
console.log(`物品模型：${inn}/${Object.keys(ITEMS).length} 构建成功${ibad.length ? '，可疑：' + ibad.join(' ') : ''}`)
if (ifb.length) bad(`物品走通用 fallback（缺专属低模）：${ifb.join(' ')}`)
else console.log('  ✓ 全部物品均有专属低模（无 fallback）')

// 2b) 玩家模型（性别/发型/上衣/裤子/表情 × 装备组合；无面灵复用本模型故同验面部件可摘除）
{
  const { buildPlayerModel } = await import('../src/game/renderer/playerModel.ts')
  const { DEFAULT_AVATAR } = await import('../src/game/avatar.ts')
  let pmOk = 0
  for (const gender of [0, 1]) for (const hair of [0, 1, 4, 5, 6, 7]) for (const topStyle of [0, 1, 2, 3]) for (const pantsStyle of [0, 1, 2]) for (const face of [0, 1, 2, 3]) {
    try {
      const g = buildPlayerModel({ ...DEFAULT_AVATAR, gender, hair, topStyle, pantsStyle, face },
        { gloves: true, cavingsuit: topStyle === 2, suit: topStyle === 3, divemask: face === 1, headlamp: face === 2 })
      const p = g.userData.parts as Record<string, unknown>
      if (count(g) < 10) { bad(`玩家模型节点过少（gender=${gender} hair=${hair}）`); continue }
      if (!p || !p.torso || !p.head || !p.armL || !p.armR || !p.legL || !p.legR) { bad('玩家模型 parts 缺失'); continue }
      pmOk++
    } catch (e) { bad(`玩家模型构建抛异常：${(e as Error).message}`) }
  }
  const pm2 = buildPlayerModel(DEFAULT_AVATAR, {})
  let faces = 0
  pm2.traverse((o) => { if (o.userData.face === 1) faces++ })
  if (faces < 4) bad(`玩家模型面部件标记过少（${faces} < 4，无面灵无法摘除）`)
  if (pmOk > 0 && faces >= 4) console.log(`  ✓ 玩家模型：${pmOk} 组配置构建成功（parts 齐全），面部件标记 ${faces} 个可摘除`)
  // v40：女性体型胸部特征——同配置女性模型节点应多于男性（两块隆起盒体）
  const nM = count(buildPlayerModel({ ...DEFAULT_AVATAR, gender: 0 }, {}))
  const nF = count(buildPlayerModel({ ...DEFAULT_AVATAR, gender: 1 }, {}))
  if (nF <= nM) bad(`女性体型特征缺失（节点 女${nF} ≤ 男${nM}）`)
  else console.log(`  ✓ 女性体型：节点 女${nF} > 男${nM}（胸部隆起几何在位）`)
}

// 2c) NPC 标志性配饰（v40 共享模块 npcGear：游戏内与图鉴同一通道；全部静态 NPC + 一个合成 BRC 员工）
{
  const { NPCS, npcAvatar } = await import('../src/game/npcs.ts')
  const { buildPlayerModel } = await import('../src/game/renderer/playerModel.ts')
  const { applyNpcGear } = await import('../src/game/renderer/npcGear.ts')
  // BRC 员工 id 动态生成（brc_cx_cy_i，不进 NPCS）——合成一个带徽章/工作循环的定义覆盖 brc_ 分支
  const brcSample = { id: 'brc_0_0_0', name: '测试', role: 'BRC', personality: '', background: '', faction: 'brc',
    uniform: { top: '#9ab0d0', badge: '#c0c0c8' }, avatar: {}, workLoop: 'hammer', lines: [], idle: [] } as unknown as (typeof NPCS)[string]
  let gn = 0
  for (const def of [...Object.values(NPCS), brcSample]) {
    try {
      const g = buildPlayerModel(npcAvatar(def), {})
      const before = count(g)
      applyNpcGear(g.userData.parts as Record<string, never>, def.id, def)
      if (count(g) <= before) bad(`NPC ${def.id} 配饰未附加任何节点`)
      else gn++
    } catch (e) { bad(`NPC ${def.id} 配饰构建抛异常：${(e as Error).message}`) }
  }
  if (gn > 0) console.log(`  ✓ NPC 配饰：${gn} 名 NPC 配饰附加成功（kat/justin/夜莺/River/Faust/算盘 + v40 职业配饰 + BRC）`)
}

// 3) 结构物（覆盖 types.ts 里全部 StructKind）
const KINDS: StructKind[] = [
  'pillar','car','booth','pipes','valve','gauge','boiler','generator','cabinet','trench','cubicle','copier','server','vending',
  'desk','door','ballroom','lightgrid','wet','graffiti','crate','corpse','ladder','vent','mirror','elevator','frontdesk','bed','sconce','socket',
  'hoteldoor','windowblack','windowtrap','hotelwindow','table','chandelier','hanglight','dresser','arch','maingen','megcrate','prefabmark',
  'glasswin','rollerdoor','glassdoor','lift',
  'hotpipe','lightswitch','tripwire','braille',
  'bookcase','barrel','rockisle','bonepile','fishbones','seatarpit',
  'stalagspike','handspike','glowshroom','tarhands','roadsign','campstall',
  'house','streetlamp','mailbox','picketfence','clipfuse','playpipe',
  'wheatpatch','hedgerow','barn','canolaplot',
  'towerblock','blackwindow','shopfront','subwayent','arcadecab','megsign',
  'libshelf','endletters','homedoor',
  'locker','toolbox','suitcase','fridge','safebox',
  'column','roundarch','vaultcol','scaffold','roadblock','debrispile','inkdoor','megdoc','landmark',
  'serverrack','officechair','binshelf','bunkbed','screenboard','noticeboard','megposter','photo','ventgrate','shopsign',
  'bench','planter','trashbin',
  'hospitalbed','ivstand','medcabinet','labbench','specimentank',
  'stove','kcounter','sink','freezer','dtable',
  'bigcomputer','scrap',
  'machinewall','pallet','handrail',
  'domering','perch',
  'pulpit','candlestand','holyfont', // v47：L274 教堂细化（讲坛/烛台/圣水盆）
  'walllamp', // v46：EL3A 壁挂斜照大灯
]
const DEF = LEVELS[11]
const MAP = generateLevel(LEVELS[11], 4242)
let sn = 0, snull: string[] = []
for (const k of KINDS) {
  for (const looted of [false, true]) {
    const s: Structure = {
      kind: k, x: 5, y: 5, w: k === 'house' || k === 'barn' || k === 'towerblock' ? 7 : k === 'endletters' ? 7 : 2,
      h: k === 'house' || k === 'barn' || k === 'towerblock' ? 6 : 1,
      solid: true, looted,
      data: { loot: 1, open: 0, locked: 0, mode: 2, floors: 6, sign: 3, hue: 2, tall: 1, knot: 2, moss: 1, warm: 1, glow: 1, meg: 1, barley: 1, bubbles: 1, anomaly: 1, text: 1, line: 1, l25: 1, mark: 1 },
    }
    try {
      const g = buildStructure(s, DEF, MAP, 3.0)
      if (!g && !looted) snull.push(k)
      else if (g) { count(g as { children?: unknown[] }); sn++ }
    } catch (e) { bad(`结构 ${k}${looted ? '(已搜刮)' : ''} 建模抛异常：${(e as Error).message}`) }
  }
}
console.log(`结构模型：${KINDS.length} 种 × 2 态 → ${sn} 个 mesh 组${snull.length ? '，返回 null：' + snull.join(' ') : ''}`)

// 3b) v48 朝向约定：柜类/转椅缺省「背贴最近墙、正面朝室内」（data.deg 可覆盖）；玻璃贴墙窗
// 缺省「贴最近墙、玻璃面朝室内」。构造 5×5 贴墙场景，断言朝向与贴墙位移。
{
  type FakeMap = { w: number; h: number; tiles: Uint8Array; structures: Structure[] }
  // 全地板 5×5，中心 (2,2) 放被测结构，在 (2+dx, 2+dy) 放一块墙
  const mkMap = (dx: number, dy: number): FakeMap => {
    const tiles = new Uint8Array(25).fill(1)
    tiles[(2 + dy) * 5 + (2 + dx)] = 2
    return { w: 5, h: 5, tiles, structures: [] }
  }
  const mk = (kind: StructKind, fm: FakeMap, data?: Structure['data']): Structure => {
    const s: Structure = { kind, x: 2, y: 2, w: 1, h: 1, solid: true, data }
    fm.structures.push(s)
    return s
  }
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  let orientBad = 0
  // 柜类：墙在北 → 正面朝南（rotation.y=0，局部 +Z 朝室内）；墙在东 → 正面朝西（-π/2）
  for (const k of ['cabinet', 'dresser', 'libshelf', 'binshelf', 'locker', 'officechair'] as StructKind[]) {
    const mN = mkMap(0, -1)
    const gN = buildStructure(mk(k, mN), DEF, mN as never, 3.0)
    if (!gN || !near(gN.rotation.y, 0)) { bad(`朝向 ${k}：北墙时正面未朝南（rotation.y=${gN?.rotation.y.toFixed(3)}，应 0）`); orientBad++; continue }
    const mE = mkMap(1, 0)
    const gE = buildStructure(mk(k, mE), DEF, mE as never, 3.0)
    if (!gE || !near(gE.rotation.y, -Math.PI / 2)) { bad(`朝向 ${k}：东墙时正面未朝西（rotation.y=${gE?.rotation.y.toFixed(3)}，应 -π/2）`); orientBad++; continue }
  }
  // officechair「邻桌朝桌」优先于背墙：无墙、东侧 1 格有桌 → 面向桌（atan2(+1,0)=π/2）
  {
    const mT = mkMap(0, 0)
    mT.tiles.fill(1)
    mT.structures.push({ kind: 'table', x: 3, y: 2, w: 1, h: 1, solid: true })
    const g = buildStructure(mk('officechair', mT), DEF, mT as never, 3.0)
    if (!g || !near(g.rotation.y, Math.PI / 2)) { bad(`朝向 officechair：邻桌朝桌未生效（rotation.y=${g?.rotation.y.toFixed(3)}，应 π/2 朝东桌）`); orientBad++ }
  }
  // data.deg 显式覆盖缺省朝向
  {
    const mD = mkMap(0, -1)
    const g = buildStructure(mk('cabinet', mD, { deg: 90 }), DEF, mD as never, 3.0)
    if (!g || !near(g.rotation.y, Math.PI / 2)) { bad('朝向 cabinet：data.deg=90 未覆盖缺省朝向'); orientBad++ }
  }
  // glasswin（含蓝彩玻）：北墙 → 贴北面墙（局部背移 inner z≈-0.42）且玻璃面朝室内（rotation.y=0）；
  // 东墙 → 同幅局部背移 + rotation.y=-π/2（旋转后恰好贴东面墙）
  for (const stain of [undefined, 'blue'] as const) {
    const mN = mkMap(0, -1)
    const gN = buildStructure(mk('glasswin', mN, stain ? { stain } : undefined), DEF, mN as never, 3.0)
    const inN = gN?.children[0]
    if (!gN || !near(gN.rotation.y, 0) || !inN || !near(inN.position.z, -0.42)) {
      bad(`朝向 glasswin${stain ? '(蓝彩玻)' : ''}：未贴北面墙或玻璃面未朝室内（rot=${gN?.rotation.y.toFixed(3)} innerZ=${inN?.position.z.toFixed(3)}）`); orientBad++; continue
    }
    const mE = mkMap(1, 0)
    const gE = buildStructure(mk('glasswin', mE, stain ? { stain } : undefined), DEF, mE as never, 3.0)
    const inE = gE?.children[0]
    if (!gE || !near(gE.rotation.y, -Math.PI / 2) || !inE || !near(inE.position.z, -0.42)) {
      bad(`朝向 glasswin${stain ? '(蓝彩玻)' : ''}：未贴东面墙（rot=${gE?.rotation.y.toFixed(3)} innerZ=${inE?.position.z.toFixed(3)}，局部背移应 -0.42）`); orientBad++; continue
    }
  }
  if (!orientBad) console.log('  ✓ 朝向约定：柜类/转椅背贴最近墙正面朝室内（邻桌朝桌/deg 覆盖 ✓），玻璃贴墙窗贴墙面朝室内')
}

console.log(fail === 0 ? '\n✓ 建模全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
