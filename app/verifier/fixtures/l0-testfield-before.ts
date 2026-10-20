// Pre-fix snapshot for the isolated comparison page only (2026-10-18).
import type {Engine} from '../../src/game/engine'
import {CS} from '../../src/game/world/infinite'
export function beforeTestField(eng: Engine): boolean {
  const m = eng.map
  if (!m?.inf || eng.levelDef.id !== 0) { eng.msg('[DEV] 测试场地仅在教学关卡（Level 0）可用。', 'system'); return false }
  const p = eng.player
  const W = m.w
  // 场地中心：玩家前方 48 格（限制在当前 chunk 窗口内）
  const cx = Math.max(42, Math.min(W - 42, Math.round(p.x + 48)))
  const cy = Math.max(42, Math.min(W - 42, Math.round(p.y)))
  const R = 40
  const x0 = cx - R, y0 = cy - R, x1 = cx + R, y1 = cy + R
  const inR = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1
  // 关键：无限模式的窗口数组（m.tiles 等）只是已加载 chunk 的缝合副本，
  // 窗口平移时 stitch() 会用 chunk 数据覆盖它们——必须同步改写底层 LiveChunk，
  // 否则传送触发平移后场地立刻被原始迷宫还原；渲染层也只认 inf.redo，不认 mapRev
  const inf = m.inf!
  for (const c of inf.chunks.values()) {
    const wx0 = c.cx * CS - inf.ox, wy0 = c.cy * CS - inf.oy
    const lx0 = Math.max(x0, wx0) - wx0, ly0 = Math.max(y0, wy0) - wy0
    const lx1 = Math.min(x1, wx0 + CS - 1) - wx0, ly1 = Math.min(y1, wy0 + CS - 1) - wy0
    if (lx0 > lx1 || ly0 > ly1) continue
    for (let ly = ly0; ly <= ly1; ly++)
      for (let lx = lx0; lx <= lx1; lx++) {
        const i = ly * CS + lx
        c.tiles[i] = 1; c.elev[i] = 0; c.tint[i] = 0; c.wet[i] = 0
      }
    c.structures = c.structures.filter((s) => !inR(s.x + s.w / 2, s.y + s.h / 2))
    c.items = c.items.filter((it) => !inR(it.x, it.y))
    c.lights = c.lights.filter((l) => !inR(l.x, l.y))
    c.exits = c.exits.filter((e) => !inR(e.x, e.y))
    c.entities = c.entities.filter((e) => !inR(e.x, e.y))
  }
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x
      m.tiles[i] = 1; m.elev[i] = 0; m.step[i] = 0; m.crawl[i] = 0
      m.liquid[i] = 0; m.outdoor[i] = 0; m.tint[i] = 0; m.wet[i] = 0
      m.up[i] = 0; m.upWall[i] = 0; m.stair[i] = 0; m.ceiling[i] = 0
      m.up2[i] = 0; m.upWall2[i] = 0 // v54：三层数组同步重置
    }
  // 清空区域内结构/物品/实体/光源/出口（空旷无阻挡）
  m.structures = m.structures.filter((s) => !inR(s.x + s.w / 2, s.y + s.h / 2))
  m.items = m.items.filter((it) => !inR(it.x, it.y))
  m.entities = m.entities.filter((e) => !inR(e.x, e.y))
  m.lights = m.lights.filter((l) => !inR(l.x, l.y))
  m.exits = m.exits.filter((e) => !inR(e.x, e.y))
  // 场地照明：按 8 格网格补灯，同时写入窗口数组与底层 LiveChunk——
  // 窗口平移 stitch 从 chunk 重建 m.lights 后灯仍在（清空 gen 灯后场地不能是黑场）
  for (let y = y0 + 4; y <= y1; y += 8)
    for (let x = x0 + 4; x <= x1; x += 8) {
      const L = { x: x + 0.5, y: y + 0.5, r: 5, color: '#d9c39a', flickerSeed: Math.random() * 100, gen: 1 as const }
      m.lights.push(L)
      for (const c of inf.chunks.values()) {
        const wx0 = c.cx * CS - inf.ox, wy0 = c.cy * CS - inf.oy
        if (L.x >= wx0 && L.x < wx0 + CS && L.y >= wy0 && L.y < wy0 + CS) { c.lights.push(L); break }
      }
    }
  p.x = cx; p.y = cy; p.z = 0; p.vz = 0
  eng.mapRev++ // 有限层渲染重建用（无限层忽略，保留无害）
  inf.redo = (inf.redo ?? 0) + 1 // 无限层：通知渲染层重建全部已烘焙 chunk 几何
  eng.msg('[DEV] 已生成「测试场地」（80×80 空旷区域）并传送。', 'system')
  return true
}


