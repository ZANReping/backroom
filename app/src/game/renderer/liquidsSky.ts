// 室外天空盒/远景剪影 + 液体水面（深水泳池/浅水洼）
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameMap } from '../mapgen'
import type { LevelDef } from '../types'
import { col, SKY } from './shared'
import { makeSkyMesh, SKY_PROFILES } from './skybox'

export function buildSkyAndLiquids(m: GameMap, def: LevelDef, g: THREE.Group) {
// ---- v7 室外：天空盒 + 远景低模楼群剪影 + 泳池水面 ----
  // 洪泛分区找出各室外区域
  const seen = new Uint8Array(m.w * m.h)
  const regions: { cx: number; cz: number; r: number }[] = []
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const ii = y * m.w + x
      if (m.outdoor[ii] !== 1 || seen[ii]) continue
      let minX = x, maxX = x, minY = y, maxY = y, cnt = 0
      const q: [number, number][] = [[x, y]]
      seen[ii] = 1
      while (q.length) {
        const [qx, qy] = q.pop()!
        cnt++
        minX = Math.min(minX, qx); maxX = Math.max(maxX, qx)
        minY = Math.min(minY, qy); maxY = Math.max(maxY, qy)
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = qx + dx, ny = qy + dy, ni = ny * m.w + nx
          if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h || seen[ni] || m.outdoor[ni] !== 1) continue
          seen[ni] = 1; q.push([nx, ny])
        }
      }
      if (cnt >= 4) regions.push({ cx: (minX + maxX + 1) / 2, cz: (minY + maxY + 1) / 2, r: Math.max(maxX - minX, maxY - minY) / 2 })
    }
  }
  const skyHex = SKY[def.id] ?? '#0a0a0c'
  // v11 修复：天空盒改为贴合整图外包（所有室外区共用一只）。
  // 旧版以各室外区为中心的 90×30×90 盒，盒面会切穿大堂/客房等室内空间
  // （如 L5 庭院盒西面 x=5 正好落在大堂内），盒面之外的室内墙面被整片涂成
  // 天空色——「藏青虚空立方体/大片区域虚空化」的根源；现盒面恒在地图边界之外，
  // 室内墙面不会再被天空覆盖，天空只经真正的室外开口（无天花板区/护墙上方）可见。
  if (regions.length) {
    // v35：有配置的层级用精致程序化天空盒（日月/星野/银河/分形云）；其余保持纯色盒回退
    const prof = SKY_PROFILES[def.id]
    const sky = makeSkyMesh(m, def) ?? new THREE.Mesh(
      new THREE.BoxGeometry(m.w + 20, 30, m.h + 20),
      new THREE.MeshBasicMaterial({ color: skyHex, side: THREE.BackSide, fog: false }),
    )
    if (!prof) sky.position.set(m.w / 2, 9, m.h / 2)
    g.add(sky)
  }
  for (const R of regions) {
    // 远景低模楼群剪影（确定性伪随机）
    // v11 修复：剪影楼群是无光纯色盒子，旧版环绕室外区全向摆放会落进客房/走廊等
    // 可通行区域，正面看是「藏青色实心立方体」、走入后因背面剔除才看到内部。
    // 现在逐个做瓦片 AABB 检测：包围盒（含 0.6m 余量）覆盖任何地板瓦片则丢弃。
    let sd = (Math.floor(R.cx * 131 + R.cz * 719) >>> 0) || 1
    const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296)
    const silMat = new THREE.MeshBasicMaterial({ color: col(SKY_PROFILES[def.id]?.horizon ?? skyHex).multiplyScalar(0.45), fog: true })
    const silGeos: THREE.BufferGeometry[] = []
    const overlapsFloor = (cx: number, cz: number, hw: number, hd: number) => {
      const x0 = Math.max(0, Math.floor(cx - hw - 0.6)), x1 = Math.min(m.w - 1, Math.floor(cx + hw + 0.6))
      const y0 = Math.max(0, Math.floor(cz - hd - 0.6)), y1 = Math.min(m.h - 1, Math.floor(cz + hd + 0.6))
      for (let ty = y0; ty <= y1; ty++)
        for (let tx = x0; tx <= x1; tx++)
          if (m.tiles[ty * m.w + tx] === 1) return true
      return false
    }
    for (let n = 0; n < 16; n++) {
      const ang = rnd() * Math.PI * 2
      const dist = R.r + 9 + rnd() * 22
      const bw = 2.5 + rnd() * 5, bh = 4 + rnd() * 14, bd = 2.5 + rnd() * 5
      const cx = R.cx + Math.cos(ang) * dist, cz = R.cz + Math.sin(ang) * dist
      if (overlapsFloor(cx, cz, bw / 2, bd / 2)) continue
      const geo = new THREE.BoxGeometry(bw, bh, bd)
      geo.translate(cx, bh / 2 - 0.5, cz)
      silGeos.push(geo)
    }
    if (silGeos.length) g.add(new THREE.Mesh(mergeGeometries(silGeos)!, silMat))
  }
  // v13 液体水面：深水（泳池，可沉没游泳）+ 浅水洼（室内减速涟漪）
  const waterGeos: THREE.BufferGeometry[] = []
  const shallowGeos: THREE.BufferGeometry[] = []
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const ii = y * m.w + x
      if (m.tiles[ii] !== 1 || m.liquid[ii] === 0) continue
      const geo = new THREE.PlaneGeometry(1, 1)
      geo.rotateX(-Math.PI / 2)
      if (m.liquid[ii] === 1) {
        geo.translate(x + 0.5, 0.03, y + 0.5) // 深水水面≈岸边地面
        waterGeos.push(geo)
      } else {
        geo.translate(x + 0.5, -0.17, y + 0.5) // 浅水水面（洼底 -0.25）
        shallowGeos.push(geo)
      }
    }
  if (waterGeos.length) {
    g.add(new THREE.Mesh(
      mergeGeometries(waterGeos)!,
      new THREE.MeshLambertMaterial({ color: '#2a6fd8', transparent: true, opacity: 0.66, emissive: '#10355e', side: THREE.DoubleSide }),
    ))
  }
  if (shallowGeos.length) {
    g.add(new THREE.Mesh(
      mergeGeometries(shallowGeos)!,
      new THREE.MeshLambertMaterial({ color: '#28424e', transparent: true, opacity: 0.55, emissive: '#0c1c24', side: THREE.DoubleSide }),
    ))
  }
}
