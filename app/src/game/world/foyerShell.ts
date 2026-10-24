/** Boundary faces of the union of thin apartment walls. No internal/coplanar caps. */
export interface WallBlock { id: string; x0: number; y0: number; x1: number; y1: number; bottom: number; top: number }
export interface WallFace { axis: 'x' | 'y'; at: number; a: number; b: number; bottom: number; top: number; sign: -1 | 1 }
export interface WallSoffit { x0: number; y0: number; x1: number; y1: number; z: number }
interface Partition { id: string; axis: 'x' | 'y'; at: number; from: number; to: number; gaps: { a: number; b: number; lintel?: boolean }[] }
const EPS = 1e-7
const unique = (a: number[]) => [...new Set(a.map(v => +v.toFixed(6)))].sort((a, b) => a - b)

export function partitionBlocks(partitions: readonly Partition[], height: number, thickness: number, doorHeight: number): WallBlock[] {
  const blocks: WallBlock[] = [], t = thickness / 2
  for (const p of partitions) {
    const add = (a: number, b: number, bottom = 0) => {
      // Only structural endpoints extend into junctions. Door jambs retain their exact clear width.
      if (a === p.from) a -= t
      if (b === p.to) b += t
      if (b - a <= EPS) return
      blocks.push({ id: p.id, ...(p.axis === 'x'
        ? { x0: a, y0: p.at - t, x1: b, y1: p.at + t }
        : { x0: p.at - t, y0: a, x1: p.at + t, y1: b }), bottom, top: height })
    }
    let a = p.from
    for (const g of [...p.gaps].sort((a, b) => a.a - b.a)) {
      if (g.a > a) add(a, g.a)
      if (g.lintel) add(g.a, g.b, doorHeight + .04)
      a = g.b
    }
    if (a < p.to) add(a, p.to)
  }
  return blocks
}

export function wallUnion(blocks: readonly WallBlock[]): { faces: WallFace[]; soffits: WallSoffit[] } {
  const xs = unique(blocks.flatMap(b => [b.x0, b.x1])), ys = unique(blocks.flatMap(b => [b.y0, b.y1]))
  const zs = unique(blocks.flatMap(b => [b.bottom, b.top])), W = xs.length - 1, D = ys.length - 1
  const bands: Uint8Array[] = []
  for (let k = 0; k < zs.length - 1; k++) {
    const cells = new Uint8Array(W * D), z = (zs[k] + zs[k + 1]) / 2
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      const x = (xs[i] + xs[i + 1]) / 2, y = (ys[j] + ys[j + 1]) / 2
      cells[j * W + i] = +blocks.some(b => x > b.x0 - EPS && x < b.x1 + EPS && y > b.y0 - EPS && y < b.y1 + EPS && z > b.bottom && z < b.top)
    }
    bands.push(cells)
  }
  const faces: WallFace[] = [], soffits: WallSoffit[] = []
  for (let k = 0; k < bands.length; k++) {
    const cells = bands[k], bottom = zs[k], top = zs[k + 1]
    const solid = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < D && !!cells[j * W + i]
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) {
      if (!solid(i, j)) continue
      for (const sign of [-1, 1] as const) {
        if (!solid(i + sign, j)) faces.push({ axis: 'y', at: xs[i + (sign === 1 ? 1 : 0)], a: ys[j], b: ys[j + 1], bottom, top, sign })
        if (!solid(i, j + sign)) faces.push({ axis: 'x', at: ys[j + (sign === 1 ? 1 : 0)], a: xs[i], b: xs[i + 1], bottom, top, sign })
      }
      if (k > 0 && !bands[k - 1][j * W + i]) soffits.push({ x0: xs[i], y0: ys[j], x1: xs[i + 1], y1: ys[j + 1], z: bottom })
    }
  }
  return { faces, soffits }
}
