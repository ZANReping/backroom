// 建模冒烟：用 three 桩跑通全部实体/物品/结构低模构建，捕获空引用与 API 误用
import { buildEntityMesh } from '../src/game/renderer/entitiesMesh.ts'
import { buildItemMesh } from '../src/game/renderer/itemsMesh.ts'
import { buildStructure } from '../src/game/renderer/structures.ts'
import { ENTITIES } from '../src/game/entities/index.ts'
import { ITEMS } from '../src/game/content/items.ts'
import type { Structure, StructKind } from '../src/game/core/types.ts'
import { generateLevel } from '../src/game/world/mapgen.ts'
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

// 1b) v53：L3 高智能实体建模变体（无面灵错位器官+石器 / 水豚尸鼠）
for (const [label, tt, o] of [
  ['无面灵·L3面部器官', 'faceling', { l3face: true, seed: 7 }],
  ['无面灵·L3面部器官+石器', 'faceling', { l3face: true, tool: true, seed: 19 }],
  ['尸鼠·水豚形态', 'corpserat', { capybara: true }],
] as const) {
  try {
    const g = buildEntityMesh(tt, o)
    const n2 = count(g)
    if (n2 < 3) bad(`变体 ${label} 节点数异常（${n2}）`)
    else console.log(`  ✓ 变体 ${label} 构建正常（${n2} 节点）`)
  } catch (e) { bad(`变体 ${label} 建模抛异常：${(e as Error).message}`) }
}

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
  const { DEFAULT_AVATAR } = await import('../src/game/core/avatar.ts')
  let pmOk = 0
  // v54b：发型 0..15 / 上衣 0..7 / 裤子 0..5 全覆盖（2×16×8×6×4 = 6144 组）
  for (const gender of [0, 1]) for (const hair of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) for (const topStyle of [0, 1, 2, 3, 4, 5, 6, 7]) for (const pantsStyle of [0, 1, 2, 3, 4, 5]) for (const face of [0, 1, 2, 3]) {
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
  // v54b：默认配置（全 0）应无眼镜/胡须件——面部件恒为 7（眼2+眉2+嘴1+耳2；鼻已删）
  if (faces !== 7) bad(`默认配置面部件数异常（${faces} ≠ 7：眼2眉2嘴1耳2，不应含眼镜/胡须）`)
  if (pmOk > 0 && faces === 7) console.log(`  ✓ 玩家模型：${pmOk} 组配置构建成功（parts 齐全），默认面部件标记 ${faces} 个可摘除（无眼镜/胡须）`)
  // v54b：眼镜/胡须/鞋款——配饰件 face 标记在位（墨镜 4 件 + 络腮胡 4 件），parts 齐全
  {
    const acc = buildPlayerModel({ ...DEFAULT_AVATAR, glasses: 3, beard: 2, shoes: 1 }, {})
    const ap = acc.userData.parts as Record<string, unknown>
    let af = 0
    acc.traverse((o) => { if (o.userData.face === 1) af++ })
    if (!ap.torso || !ap.head || !ap.armL || !ap.armR || !ap.legL || !ap.legR) bad('眼镜/胡须配置 parts 缺失')
    else if (af !== faces + 8) bad(`眼镜/胡须件 face 标记数异常（${af} ≠ 基线${faces}+8）`)
    else console.log(`  ✓ 眼镜/胡须/运动鞋：面部件标记 ${af} 个（基线 ${faces} + 墨镜4 + 络腮胡4）`)
    const boots = buildPlayerModel({ ...DEFAULT_AVATAR, shoes: 2 }, {})
    if (!boots.userData.parts) bad('皮靴配置 parts 缺失')
  }
  // v54b：无面灵复用回归——摘除 face 件后应无五官残留（含眼镜/胡须）
  {
    const g3 = buildPlayerModel({ ...DEFAULT_AVATAR, glasses: 2, beard: 1 }, {})
    const rm: { parent?: { remove: (c: unknown) => void } }[] = []
    g3.traverse((o) => { if (o.userData.face === 1) rm.push(o) })
    for (const o of rm) o.parent?.remove(o)
    let left = 0
    g3.traverse((o) => { if (o.userData.face === 1) left++ })
    if (left !== 0) bad(`无面灵摘除后仍残留面部件 ${left} 个`)
    else console.log('  ✓ 无面灵复用：摘除后无五官残留（含眼镜/胡须）')
  }
  // v54c：发型防回归——16 款 × 男女：发件（userData.hair=1 + userData.dim 记录尺寸，建模侧 hb() 统一打标）逐件 AABB 断言：
  // (b) 与头盒或另一发件相接（间隙 ≤5mm）——无悬空件；(c) 不穿面部区域（眼/眉/嘴平面带）/耳/躯干
  {
    type V = { x: number; y: number; z: number }
    const mk = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) =>
      ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } })
    type B3 = ReturnType<typeof mk>
    // headG 局部系基准盒（常量与 playerModel.ts 建模一致：头盒 0.26×0.26×0.24@y0.13 / 耳 x±0.135 / torso 顶 y=1.35）
    const headBox = mk(-0.13, 0, -0.12, 0.13, 0.26, 0.12)
    const faceZone = mk(-0.14, 0.03, 0.095, 0.14, 0.2, 0.14) // 面部区域带（眼 y0.13-0.17/眉~0.19/嘴~0.07，前脸 z≥0.095）
    const earL = mk(-0.15, 0.1, -0.025, -0.12, 0.16, 0.025)
    const earR = mk(0.12, 0.1, -0.025, 0.15, 0.16, 0.025)
    // 旋转盒 AABB（欧拉 XYZ：R = Rx·Ry·Rz，半尺寸左乘 |R|）
    const aabbOf = (dim: number[], pos: V, rot: V): B3 => {
      const hx = dim[0] / 2, hy = dim[1] / 2, hz = dim[2] / 2
      const cx = Math.cos(rot.x), sx = Math.sin(rot.x)
      const cy = Math.cos(rot.y), sy = Math.sin(rot.y)
      const cz = Math.cos(rot.z), sz = Math.sin(rot.z)
      const r = [
        [cy * cz, -cy * sz, sy],
        [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
        [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
      ]
      const ex = Math.abs(r[0][0]) * hx + Math.abs(r[0][1]) * hy + Math.abs(r[0][2]) * hz
      const ey = Math.abs(r[1][0]) * hx + Math.abs(r[1][1]) * hy + Math.abs(r[1][2]) * hz
      const ez = Math.abs(r[2][0]) * hx + Math.abs(r[2][1]) * hy + Math.abs(r[2][2]) * hz
      return mk(pos.x - ex, pos.y - ey, pos.z - ez, pos.x + ex, pos.y + ey, pos.z + ez)
    }
    const ax = (a: B3, b: B3, k: 'x' | 'y' | 'z') => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k])
    const minOv = (a: B3, b: B3) => Math.min(ax(a, b, 'x'), ax(a, b, 'y'), ax(a, b, 'z'))
    const intersects = (a: B3, b: B3) => minOv(a, b) > 0.001 // 三轴均重叠 >1mm 才算穿模（贴面零体积接触放行）
    const touches = (a: B3, b: B3) => minOv(a, b) >= -0.005 // 间隙 ≤5mm 算相接
    let hairBad = 0, hairN = 0
    for (const gender of [0, 1]) {
      const sh = gender === 1 ? 0.38 : 0.46, td = gender === 1 ? 0.21 : 0.24
      const torsoBox = mk(-sh / 2, -0.6, -td / 2, sh / 2, -0.02, td / 2) // torso（headG 局部：0.77..1.35 → -0.60..-0.02）
      for (let hair = 0; hair < 16; hair++) {
        const gm = buildPlayerModel({ ...DEFAULT_AVATAR, gender, hair }, {})
        const hd = (gm.userData.parts as Record<string, unknown>).head as {
          children: { userData: Record<string, unknown>; position: V; rotation: V }[]
        }
        const boxes: B3[] = []
        for (const c of hd.children) {
          if (c.userData.hair === 1) boxes.push(aabbOf(c.userData.dim as number[], c.position, c.rotation))
        }
        hairN += boxes.length
        for (const b of boxes) {
          if (!touches(b, headBox) && !boxes.some((o) => o !== b && touches(b, o))) { bad(`发型${hair}(${gender ? '女' : '男'})：存在悬空发件`); hairBad++; break }
          if (intersects(b, faceZone)) { bad(`发型${hair}(${gender ? '女' : '男'})：发件穿面部区域`); hairBad++; break }
          if (intersects(b, earL) || intersects(b, earR)) { bad(`发型${hair}(${gender ? '女' : '男'})：发件穿耳`); hairBad++; break }
          if (intersects(b, torsoBox)) { bad(`发型${hair}(${gender ? '女' : '男'})：发件穿躯干`); hairBad++; break }
        }
      }
    }
    if (!hairBad) console.log(`  ✓ 发型防回归：16 款 × 男女共 ${hairN} 个发件，连接性（≤5mm 相接）/面部/耳/躯干穿模全过`)
  }
  // v40：女性体型胸部特征——同配置女性模型节点应多于男性（两块隆起盒体）
  const nM = count(buildPlayerModel({ ...DEFAULT_AVATAR, gender: 0 }, {}))
  const nF = count(buildPlayerModel({ ...DEFAULT_AVATAR, gender: 1 }, {}))
  if (nF <= nM) bad(`女性体型特征缺失（节点 女${nF} ≤ 男${nM}）`)
  else console.log(`  ✓ 女性体型：节点 女${nF} > 男${nM}（胸部隆起几何在位）`)
}

// 2c) NPC 标志性配饰（v40 共享模块 npcGear：游戏内与图鉴同一通道；全部静态 NPC + 一个合成 BRC 员工）
{
  const { NPCS, npcAvatar } = await import('../src/game/content/npcs.ts')
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
  'elecbox','cables','barfence','bargate', // v51：L3 发电站无限化重制
  'statue', // v51：L3 栅栏后的风化希腊女像
  'conveyor','angelstatue','fallencolumn', // v51：L3 大房间（装配线传送带/圣所天使像/倒塌石柱）
  'busbar','warningsign','worktable','factlamp','sphboiler','floordrain', // v51：L3 大房间细化结构
  'turbinegen','switchboard','transformer','pressmachine','feedpump','manifold','piperack','cabletray', // v51：L3 房间专用大型机器
  'rattrap','bigpainting', // v53：L3 高智能实体（尸鼠陷阱）/ L3 艺术品大幅画作（data.tex+pw/ph 自定义尺寸）
  'stainedglass', // v53b：L3 圣所彩色玻璃花窗（data.tex+pw/ph 自定义）
  'sofa','servercase','walltv','wallwindow', // v54：双人沙发(data.color)/塔式服务器机箱/挂式平板电视/墙体窗
  'tvset','loungechair', // v54c：立式大电视/弧形塑料休闲椅（Gemma 2F 电视娱乐室；loungechair data.color）
  'phonograph','poolladder','divingboard','gymbench', // v54：L5 无限化新结构（留声机/泳池扶梯/跳台/健身卧推凳）
  'darkdoorblock', // v55：L5 深色木门碰撞块（仅碰撞无模型——返回 null 属预期）
  'rug','redpillar','ceilingbeam', // v55：L5 走廊/主厅精致化（华丽地毯贴花/红木纹方柱金柱头/装饰横梁）
  'oddtable','furnace','treadmill','dumbbellrack','spinbike','wallsign', // v55：L5 房间充实（异形桌/熔炉/健身三器械/墙面字牌）
  'foldladder', // v55c：L5 人字折叠梯（装饰，替代装饰 ladder 点位）
  'invitation', // v55b：L5 烫金邀请函（可交互装饰——贝弗莉室散落，地标链路前往原住民）
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
  // v54：vending 自动售货机纳入同一约定（背贴最近墙、正面灯板朝室内 + flushToWall 贴墙位移）
  for (const k of ['cabinet', 'dresser', 'libshelf', 'binshelf', 'locker', 'officechair', 'vending'] as StructKind[]) {
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
  // v54：cubicle 自动朝向只看 3×3——相邻格有椅 → 开口朝椅；隔一格的椅子不吸（防隔板吸邻间）
  {
    const mF = mkMap(0, 0)
    mF.tiles.fill(1)
    mF.structures.push({ kind: 'officechair', x: 4, y: 2, w: 1, h: 1, solid: true }) // 东 2 格（3×3 外）
    const gF = buildStructure(mk('cubicle', mF), DEF, mF as never, 3.0)
    if (!gF || !near(gF.rotation.y, 0)) { bad(`朝向 cubicle：3×3 外的转椅不应吸朝向（rotation.y=${gF?.rotation.y.toFixed(3)}，应 0）`); orientBad++ }
    const mA = mkMap(0, 0)
    mA.tiles.fill(1)
    mA.structures.push({ kind: 'officechair', x: 3, y: 2, w: 1, h: 1, solid: true }) // 东 1 格（3×3 内）
    const gA = buildStructure(mk('cubicle', mA), DEF, mA as never, 3.0)
    if (!gA || !near(gA.rotation.y, Math.PI / 2)) { bad(`朝向 cubicle：3×3 内邻椅未生效（rotation.y=${gA?.rotation.y.toFixed(3)}，应 π/2 朝东椅）`); orientBad++ }
  }
  // data.deg 显式覆盖缺省朝向
  {
    const mD = mkMap(0, -1)
    const g = buildStructure(mk('cabinet', mD, { deg: 90 }), DEF, mD as never, 3.0)
    if (!g || !near(g.rotation.y, Math.PI / 2)) { bad('朝向 cabinet：data.deg=90 未覆盖缺省朝向'); orientBad++ }
  }
  // v54：vending 贴墙位移与 deg 例外（北墙 → 整体背移 -(0.5-0.7/2-0.02)=-0.13；deg 显式指定时只旋转不位移）
  {
    const mN = mkMap(0, -1)
    const gN = buildStructure(mk('vending', mN), DEF, mN as never, 3.0)
    // 离线 three 桩的 add 不脱离旧父级——flushToWall 的内层组是最后一个子节点（真实 three 为第一个）
    const inner = gN?.children[gN.children.length - 1]
    if (!gN || !inner || !near(inner.position.z, -0.13)) { bad(`朝向 vending：贴墙位移缺失（innerZ=${inner?.position.z.toFixed(3)}，应 -0.13）`); orientBad++ }
    const mD = mkMap(0, -1)
    const gD = buildStructure(mk('vending', mD, { deg: 180 }), DEF, mD as never, 3.0)
    if (!gD || !near(gD.rotation.y, Math.PI) || gD.children.some((c) => near(c.position.z, -0.13))) { bad('朝向 vending：data.deg 显式指定时应只旋转不贴墙位移'); orientBad++ }
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

// 3c) v54：每种容器含可动件标记（lid/part）；looted 构建即开态终局（grp.userData.open=1，由 updateStructs 动画终态表达，不再静态摆位）
{
  const CONT: StructKind[] = ['crate', 'corpse', 'car', 'cabinet', 'dresser', 'megcrate', 'locker', 'toolbox', 'suitcase',
    'fridge', 'safebox', 'mailbox', 'barrel', 'bookcase', 'bonepile', 'campstall', 'elecbox', 'binshelf']
  let cb = 0
  for (const k of CONT) {
    const mk = (looted: boolean): Structure => ({
      kind: k, x: 5, y: 5, w: 2, h: 1, solid: true, looted,
      data: { loot: 1, open: 0, locked: 0, mode: 2, floors: 6, sign: 3, hue: 2, tall: 1, knot: 2, moss: 1, warm: 1, glow: 1, meg: 1, barley: 1, bubbles: 1, anomaly: 1, text: 1, line: 1, l25: 1, mark: 1 },
    })
    const g0 = buildStructure(mk(false), DEF, MAP, 3.0)
    let mv = 0
    g0?.traverse((o) => { if ((o as { userData?: Record<string, unknown> }).userData?.lid) mv++ })
    if (!g0 || mv === 0) { bad(`容器 ${k}：构建缺可动件标记（lid/part）`); cb++; continue }
    const g1 = buildStructure(mk(true), DEF, MAP, 3.0)
    if (!g1 || (g1.userData.open as number) !== 1) { bad(`容器 ${k}：looted 构建 open 终态≠1`); cb++ }
  }
  if (!cb) console.log(`  ✓ 容器开启动画：${CONT.length} 种容器均含可动件标记，looted 构建即开态终局`)
}

// 3d) v54：trench 电缆沟四邻连接（端头封闭板只在非连接端）+ cubicle 桌面变体（≥3 种节点数）
{
  type FakeMap2 = { w: number; h: number; tiles: Uint8Array; structures: Structure[] }
  const mkTrenchMap = (xs: number[]): FakeMap2 => {
    const fm: FakeMap2 = { w: 7, h: 3, tiles: new Uint8Array(21).fill(1), structures: [] }
    for (const x of xs) fm.structures.push({ kind: 'trench', x, y: 1, w: 1, h: 1, solid: true })
    return fm
  }
  const capsOf = (s: Structure, fm: FakeMap2): number => {
    const g = buildStructure(s, DEF, fm as never, 3.0)
    let n = 0
    g?.traverse((o) => { if ((o as { userData?: Record<string, unknown> }).userData?.trenchCap) n++ })
    return n
  }
  const m3 = mkTrenchMap([1, 2, 3]) // 三连横沟
  const iso = mkTrenchMap([])
  const isoS: Structure = { kind: 'trench', x: 3, y: 1, w: 1, h: 1, solid: true }
  iso.structures.push(isoS)
  const cMid = capsOf(m3.structures[1], m3), cEnd = capsOf(m3.structures[0], m3), cIso = capsOf(isoS, iso)
  if (cMid === 0 && cEnd === 1 && cIso === 2) console.log('  ✓ trench 连接：三连沟中端 0 封闭板 / 端部 1 / 孤立 2（端板只在非连接端）')
  else bad(`trench 连接异常：中端 ${cMid}（应 0）/ 端部 ${cEnd}（应 1）/ 孤立 ${cIso}（应 2）`)
  // cubicle 桌面变体：不同瓦片坐标哈希出不同小件组合（节点数至少 3 种）
  const counts = new Set<number>()
  for (let i = 0; i < 8; i++) {
    const g = buildStructure({ kind: 'cubicle', x: 3 + i * 2, y: 7 + i, w: 1, h: 1, solid: true }, DEF, MAP, 3.0)
    if (g) counts.add(count(g as { children?: unknown[] }))
  }
  if (counts.size >= 3) console.log(`  ✓ cubicle 桌面变体：8 个坐标哈希出 ${counts.size} 种节点数（小件组合差异化）`)
  else bad(`cubicle 桌面变体不足：8 个坐标仅 ${counts.size} 种节点数`)
}

// 3e) v54：photo 变种贴图池 + 相框/玻璃细化（无 data.tex 走瓦片哈希池；显式 data.tex 既有摆放不受影响）
{
  const p1 = buildStructure({ kind: 'photo', x: 5, y: 5, w: 1, h: 1, solid: true }, DEF, MAP, 3.0)
  const p2 = buildStructure({ kind: 'photo', x: 8, y: 3, w: 1, h: 1, solid: true }, DEF, MAP, 3.0)
  const p3 = buildStructure({ kind: 'photo', x: 5, y: 5, w: 1, h: 1, solid: true, data: { tex: 'photo.png' } }, DEF, MAP, 3.0)
  const n1 = p1 ? count(p1 as { children?: unknown[] }) : 0
  if (!p1 || !p2 || !p3) { bad('photo 变种/显式 data.tex 构建失败') }
  else if (n1 < 9) bad(`photo 相框细化缺失（节点 ${n1} < 9：背板 + 4 框条 + 画面 + 玻璃）`)
  else console.log('  ✓ photo 变种：哈希池选图 + 木/金属相框 + 玻璃微反光面构建正常，显式 data.tex 不受影响')
}

// 3f) v54：bunkbed/hospitalbed 关键件在位（贯通四柱/双侧护栏+爬梯口/床单垂边；脚轮/床单分层/半段护栏）
{
  const bb = buildStructure({ kind: 'bunkbed', x: 5, y: 5, w: 1, h: 2, solid: true }, DEF, MAP, 3.0)
  const hb = buildStructure({ kind: 'hospitalbed', x: 5, y: 5, w: 1, h: 2, solid: true }, DEF, MAP, 3.0)
  const nb = bb ? count(bb as { children?: unknown[] }) : 0, nh = hb ? count(hb as { children?: unknown[] }) : 0
  if (!bb || nb < 24) bad(`bunkbed 细化缺失（节点 ${nb} < 24：四柱/双层六件/梯/护栏端栏）`)
  else if (!hb || nh < 22) bad(`hospitalbed 细化缺失（节点 ${nh} < 22：床腿脚轮/床框床垫床单毯子/摇起段/护栏）`)
  else console.log(`  ✓ 床类细化：bunkbed ${nb} 节点（贯通四柱/双护栏+爬梯口/床单垂边）· hospitalbed ${nh} 节点（脚轮/床单分层）`)
}

console.log(fail === 0 ? '\n✓ 建模全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
