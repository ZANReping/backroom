;(globalThis as any).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
const { levelDefOf } = await import('../src/game/levels/index.ts')
const { generateLevel, FLOOR_H } = await import('../src/game/world/mapgen.ts')
const gm = generateLevel(levelDefOf(106)!, 424242, true)
const W = gm.w
const sHi = (i: number) => ((gm.stair[i] >> 17) & 0x3fff) / 100
const isSt = (i: number) => (gm.stair[i] & 7) !== 0
// 复算 geometry.ts：返回该格头顶最高覆盖描述，null=无覆盖（黑洞）
function cover(x: number, y: number): string | null {
  const i = y * W + x
  if (gm.tiles[i] !== 1 || gm.outdoor[i] === 1) return 'n/a'
  // f=2 循环（up2）：板/墙底 5.65 或 stair 顶板 8.6
  if (gm.up2[i] === 1) {
    if (isSt(i)) { if (sHi(i) <= 2 * FLOOR_H + 0.01) return 'f2-plane@8.6' }
    else if (gm.upWall2[i] === 1) return 'upWall2盒底@5.65'
    else return 'up2板底@5.65'
  }
  // f=1 循环（up）
  if (gm.up[i] === 1) {
    if (isSt(i)) { if (sHi(i) <= FLOOR_H + 0.01) return 'f1-plane@5.6' }
    else if (gm.upWall[i] === 1) return 'upWall盒底@2.65'
    else return 'up板底@2.65'
  }
  // 主层天花
  return gm.ceiling[i] === 1 ? '挑高顶' : '主层天花@3.0'
}
const holes: string[] = []
for (let y = 0; y < gm.h; y++)
  for (let x = 0; x < gm.w; x++) {
    const c = cover(x, y)
    if (c === null) holes.push(`(${x},${y})`)
    else if (c !== 'n/a' && c === null) holes.push(`(${x},${y})`)
  }
// 打印各覆盖类型计数 + 洞
const cnt: Record<string, number> = {}
for (let y = 0; y < gm.h; y++) for (let x = 0; x < gm.w; x++) { const c = cover(x, y); if (c && c !== 'n/a') cnt[c] = (cnt[c] ?? 0) + 1 }
console.log(cnt)
console.log('HOLES:', holes.join(' ') || 'none')
// 2F/3F 带：站在上层时头顶覆盖
function coverUp(x: number, y: number, f: 1 | 2): string | null {
  const i = y * W + x
  const upA = f === 1 ? gm.up : gm.up2, upWA = f === 1 ? gm.upWall : gm.upWall2
  if (upA[i] !== 1 || upWA[i] === 1 || gm.outdoor[i] === 1) return 'n/a'
  if (f === 1) { // 2F 站立：头顶=f2 或 f1 循环的本层天花
    if (gm.up2[i] === 1) {
      if (isSt(i)) return sHi(i) <= 2 * FLOOR_H + 0.01 ? 'f2-plane@8.6' : null
      return gm.upWall2[i] === 1 ? 'upWall2盒底@5.65' : 'up2板底@5.65'
    }
    if (isSt(i)) return null // f1 stair 支路只有 sHi<=3.01 才画（而站 2F 的坡道格 sHi 必 >1.5）
    return 'f1-本层天花@5.6'
  }
  // 3F 站立：f2 循环本层天花
  if (isSt(i)) return sHi(i) <= 2 * FLOOR_H + 0.01 ? 'f2-plane@8.6' : null
  return 'f2-本层天花@8.6'
}
const holes1: string[] = [], holes2: string[] = []
for (let y = 0; y < gm.h; y++) for (let x = 0; x < gm.w; x++) {
  if (coverUp(x, y, 1) === null) holes1.push(`(${x},${y})`)
  if (coverUp(x, y, 2) === null) holes2.push(`(${x},${y})`)
}
console.log('2F HOLES:', holes1.join(' ') || 'none')
console.log('3F HOLES:', holes2.join(' ') || 'none')
