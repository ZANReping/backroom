// v53：L3 大幅画作（bigpainting）放置校验——逐 chunk 断言每幅画作：
// ① 所在格是地板；② 相邻某侧是墙（mountOnWall 能挂）；③ 画作跨度内每格背后都是墙、前方都是地板；
// ④ 画前 ≥2 格净空；⑤ 跨度内无其他结构；⑥ 尺寸在约定范围内（不压门洞/不卡墙）；⑦ 画布比例=贴图宽高比（v53b）
// 用法：npx tsx --tsconfig .check/tsconfig.run.json .check/l3art-smoke.mts
;(globalThis as unknown as Record<string, unknown>).AudioContext = undefined
;(globalThis as unknown as Record<string, unknown>).localStorage = undefined
const { LEVELS } = await import('../src/game/levels/index.ts')
await import('../src/game/world/mapgen.ts') // 先加载 mapgen——按既有顺序初始化 infinite 环形依赖（同 l2inf-smoke）
const { genL3ChunkRaw } = await import('../src/game/world/infiniteL3.ts')
const { CS } = await import('../src/game/world/infinite.ts')

const def = LEVELS[3]
let fail = 0, total = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const usedTex = new Set<string>()

for (const seed of [424242, 1337, 2026, 7, 987654]) {
  for (let cx = -3; cx <= 3; cx++) {
    for (let cy = -3; cy <= 3; cy++) {
      const c = genL3ChunkRaw(def, seed, cx, cy)
      for (const s of c.structures) {
        if (s.kind !== 'bigpainting') continue
        total++
        usedTex.add(String(s.data?.tex))
        const lx = s.x - cx * CS, ly = s.y - cy * CS // chunk 局部坐标
        const tiles = c.tiles as Uint8Array
        const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 0 : tiles[y * CS + x])
        const isF = (x: number, y: number) => at(x, y) === 1
        if (!isF(lx, ly)) { bad(`seed${seed} (${cx},${cy}) 画作不在地板上 (${lx},${ly})`); continue }
        const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const
        const d = dirs.find(([dx, dy]) => !isF(lx + dx, ly + dy))
        if (!d) { bad(`seed${seed} (${cx},${cy}) 画作 (${lx},${ly}) 四邻无墙可挂`) ; continue }
        const [dx, dy] = d
        const pw = Number(s.data?.pw ?? 1.8), ph = Number(s.data?.ph ?? 1.3)
        if (pw < 1.1 || pw > 2.0 || ph < 1.5 || ph > 2.3) bad(`seed${seed} (${cx},${cy}) 画作尺寸异常 pw=${pw.toFixed(2)} ph=${ph.toFixed(2)}`)
        if (Math.abs(pw / ph - 0.8) > 0.01) bad(`seed${seed} (${cx},${cy}) 画作比例与贴图不适配 pw/ph=${(pw / ph).toFixed(3)}（应=0.8）`)
        if (!isF(lx - dx, ly - dy)) bad(`seed${seed} (${cx},${cy}) 画作 (${lx},${ly}) 前方净空不足 2 格`)
        const k = Math.ceil((pw - 0.6) / 2)
        const ax = dy !== 0 ? 1 : 0, ay = dy !== 0 ? 0 : 1
        for (let i = -k; i <= k; i++) {
          const tx = lx + ax * i, ty = ly + ay * i
          if (isF(tx + dx, ty + dy)) bad(`seed${seed} (${cx},${cy}) 画作 (${lx},${ly}) 跨度内第${i}格背后不是墙`)
          if (!isF(tx, ty)) bad(`seed${seed} (${cx},${cy}) 画作 (${lx},${ly}) 跨度内第${i}格前方不是地板`)
          const hit = c.structures.some((s2) => s2 !== s && tx + cx * CS < s2.x + s2.w && tx + cx * CS + 1 > s2.x && ty + cy * CS < s2.y + s2.h && ty + cy * CS + 1 > s2.y)
          if (hit) bad(`seed${seed} (${cx},${cy}) 画作 (${lx},${ly}) 跨度内第${i}格存在其他结构`)
        }
      }
    }
  }
}
console.log(`共校验 ${total} 幅大幅画作（5 种子 × 49 chunk），贴图：${[...usedTex].join(' / ')}`)
if (total === 0) bad('未发现任何 bigpainting——生成概率或放置逻辑异常')

// v53b：圣所彩色玻璃花窗（stainedglass）——强制圣所变体 chunk 逐扇校验（规则同大幅画作）
let gtotal = 0
const gTex = new Set<string>()
for (const seed of [424242, 1337, 2026, 7, 987654]) {
  for (const [cx, cy] of [[2, 2], [-3, 1], [4, -2]] as const) {
    const c = genL3ChunkRaw(def, seed, cx, cy, 'sanct')
    for (const s of c.structures) {
      if (s.kind !== 'stainedglass') continue
      gtotal++
      gTex.add(String(s.data?.tex))
      const lx = s.x - cx * CS, ly = s.y - cy * CS
      const tiles = c.tiles as Uint8Array
      const at = (x: number, y: number) => (x < 0 || y < 0 || x >= CS || y >= CS ? 0 : tiles[y * CS + x])
      const isF = (x: number, y: number) => at(x, y) === 1
      if (!isF(lx, ly)) { bad(`圣所 seed${seed} (${cx},${cy}) 花窗不在地板上 (${lx},${ly})`); continue }
      const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const
      const d = dirs.find(([dx, dy]) => !isF(lx + dx, ly + dy))
      if (!d) { bad(`圣所 seed${seed} (${cx},${cy}) 花窗 (${lx},${ly}) 四邻无墙可挂`); continue }
      const [dx, dy] = d
      const pw = Number(s.data?.pw ?? 1.2), ph = Number(s.data?.ph ?? 2.0)
      if (Math.abs(pw / ph - 512 / 768) > 0.01) bad(`圣所 seed${seed} (${cx},${cy}) 花窗比例与贴图不适配 pw/ph=${(pw / ph).toFixed(3)}`)
      const k = Math.ceil((pw - 0.6) / 2)
      const ax = dy !== 0 ? 1 : 0, ay = dy !== 0 ? 0 : 1
      for (let i = -k; i <= k; i++) {
        const tx = lx + ax * i, ty = ly + ay * i
        if (isF(tx + dx, ty + dy)) bad(`圣所 seed${seed} (${cx},${cy}) 花窗 (${lx},${ly}) 跨度内第${i}格背后不是墙`)
        if (!isF(tx, ty)) bad(`圣所 seed${seed} (${cx},${cy}) 花窗 (${lx},${ly}) 跨度内第${i}格前方不是地板`)
        const hit = c.structures.some((s2) => s2 !== s && tx + cx * CS < s2.x + s2.w && tx + cx * CS + 1 > s2.x && ty + cy * CS < s2.y + s2.h && ty + cy * CS + 1 > s2.y)
        if (hit) bad(`圣所 seed${seed} (${cx},${cy}) 花窗 (${lx},${ly}) 跨度内第${i}格存在其他结构`)
      }
    }
  }
}
console.log(`共校验 ${gtotal} 扇彩色玻璃花窗（5 种子 × 3 强制圣所 chunk），贴图：${[...gTex].join(' / ')}`)
if (gtotal === 0) bad('未发现任何 stainedglass——圣所花窗放置逻辑异常')

if (fail) { console.log(`\n✗ ${fail} 项失败`); process.exit(1) }
console.log('\n✓ L3 大幅画作与圣所花窗放置校验全部通过')
