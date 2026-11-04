// 物品模型审计：遍历 ITEMS，构建地面模型与第一人称手持模型，统计 fallback / 面数 / 贴图 / 尺寸。
// 输出 JSON 到 stdout（或 ITEM_AUDIT_OUT 文件）。无 WebGL。
import { writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'
import * as THREE from 'three'
import { ITEMS } from '../src/game/content/items'
import { buildItemMesh } from '../src/game/renderer/itemsMesh'
import { buildHeldItem } from '../src/game/renderer/viewmodel'

Object.defineProperty(globalThis, 'document', {
  value: { createElement: () => createCanvas(128, 128), createElementNS: () => { throw new Error('headless') } },
})
const rows: any[] = []
for (const type of Object.keys(ITEMS)) {
  const row: any = { type, name: ITEMS[type].name, glyph: ITEMS[type].glyph }
  try {
    const g = buildItemMesh(type, { halo: false })
    row.fallback = !!g.userData.fallback
    let tris = 0, meshes = 0, mapped = 0, vcol = 0, plain = 0
    const mats = new Set<string>()
    g.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh && !(o as any).isSprite) return
      if (!(m as any).geometry) return
      meshes++
      const geo = m.geometry
      tris += (geo.index?.count ?? geo.getAttribute('position').count) / 3
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as any[]) {
        if (mat.map) mapped++; else if (mat.vertexColors) vcol++; else plain++
        mats.add(mat.type + (mat.map ? '+map' : '') + (mat.vertexColors ? '+vc' : ''))
      }
    })
    g.updateMatrixWorld(true)
    const bb = new THREE.Box3().setFromObject(g); const s = bb.getSize(new THREE.Vector3())
    Object.assign(row, { meshes, tris, mapped, vcol, plain, mats: [...mats], size: [s.x, s.y, s.z].map(v => +v.toFixed(3)) })
    const h = buildHeldItem(type); h.updateMatrixWorld(true)
    const hb = new THREE.Box3().setFromObject(h); const hs = hb.getSize(new THREE.Vector3())
    row.held = [hs.x, hs.y, hs.z].map(v => +v.toFixed(3))
  } catch (e: any) { row.error = String(e?.message ?? e) }
  rows.push(row)
}
const out = JSON.stringify(rows, null, 1)
if (process.env.ITEM_AUDIT_OUT) writeFileSync(process.env.ITEM_AUDIT_OUT, out); else console.log(out)
