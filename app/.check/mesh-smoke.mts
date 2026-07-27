// 建模冒烟：用 three 桩跑通全部实体/物品/结构低模构建，捕获空引用与 API 误用
import { buildEntityMesh, buildItemMesh } from '../src/game/renderer/entitiesMesh.ts'
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
  return (...a: unknown[]) => { void a; return k === 'measureText' ? { width: 10 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? { addColorStop: () => {} } : k === 'getImageData' ? { data: new Uint8ClampedArray(4 * 128 * 128) } : undefined }
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
for (const t of Object.keys(ITEMS)) {
  try {
    const g = buildItemMesh(t)
    const n = count(g)
    inn++
    if (n < 3) ibad.push(`${t}(${n})`)
  } catch (e) { bad(`物品 ${t} 建模抛异常：${(e as Error).message}`) }
}
console.log(`物品模型：${inn}/${Object.keys(ITEMS).length} 构建成功${ibad.length ? '，可疑：' + ibad.join(' ') : ''}`)

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
console.log(fail === 0 ? '\n✓ 建模全部通过' : `\n✗ ${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
