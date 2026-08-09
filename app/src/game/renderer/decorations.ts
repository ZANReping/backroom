// 层级装饰：贴墙/地面贴花 + 低模道具，避开实体/物品/出口/通路
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameMap } from '../mapgen'
import type { LevelDef } from '../types'
import { col, mulberry } from './shared'
import {
  texPeel, texStain, texSign, texCautionTape, texGaugeDial,
  texWhiteboard, texPainting, texFakeDoor, texPaper,
} from './textures'

// ---------- 层级装饰：贴墙/地面贴花 + 低模道具，避开实体/物品/出口/通路 ----------
export function buildDecorations(
m: GameMap,
def: LevelDef,
wallH: number,
g: THREE.Group,
fixtures: { mat: THREE.MeshBasicMaterial; seed: number }[],
range?: { x0: number; y0: number; x1: number; y1: number; variant?: string }, // v17：无限模式按 chunk 范围构建（含 chunk 变体）
) {
  const rng = mulberry(def.id * 7919 + m.w * 131 + m.h * 17 + (range ? range.x0 * 911 + range.y0 * 557 : 0))
  const H = wallH
  const ri = (a: number, b: number) => a + Math.floor(rng() * (b - a + 1))
  const rf = (a: number, b: number) => a + rng() * (b - a)
  const RX0 = range?.x0 ?? 1, RY0 = range?.y0 ?? 1
  const RX1 = range?.x1 ?? m.w - 1, RY1 = range?.y1 ?? m.h - 1

  // 占用：实体/物品/出口/出生点附近不摆
  const solidAt = (x: number, y: number) => m.structures.some((s) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)
  const nearImportant = (x: number, y: number) => {
    if (Math.hypot(x - m.spawn.x, y - m.spawn.y) < 2) return true
    for (const it of m.items) if (Math.abs(it.x - x - 0.5) < 0.8 && Math.abs(it.y - y - 0.5) < 0.8) return true
    for (const e of m.exits) if (Math.abs(e.x - x) <= 1 && Math.abs(e.y - y) <= 1) return true
    for (const e of m.entities) if (Math.hypot(e.x - x - 0.5, e.y - y - 0.5) < 1.6) return true
    return false
  }
  // 墙面收集：d 0=北墙 1=东墙 2=南墙 3=西墙（墙在对应方向的邻居）
  interface WSpot { x: number; y: number; d: number }
  const wallSpots: WSpot[] = []
  const floorTiles: { x: number; y: number }[] = []
  for (let y = RY0; y < RY1; y++) for (let x = RX0; x < RX1; x++) {
    if (m.tiles[y * m.w + x] !== 1 || solidAt(x, y)) continue
    floorTiles.push({ x, y })
    if (m.tiles[(y - 1) * m.w + x] !== 1) wallSpots.push({ x, y, d: 0 })
    if (m.tiles[y * m.w + x + 1] !== 1) wallSpots.push({ x, y, d: 1 })
    if (m.tiles[(y + 1) * m.w + x] !== 1) wallSpots.push({ x, y, d: 2 })
    if (m.tiles[y * m.w + x - 1] !== 1) wallSpots.push({ x, y, d: 3 })
  }
  const usedWall = new Set<string>()
  const usedFloor = new Set<string>()
  const pickWall = (): WSpot | null => {
    for (let t = 0; t < 60; t++) {
      const s = wallSpots[Math.floor(rng() * wallSpots.length)]
      if (!s) return null
      const k = `${s.x},${s.y},${s.d}`
      if (usedWall.has(k) || nearImportant(s.x, s.y)) continue
      usedWall.add(k)
      return s
    }
    return null
  }
  const pickFloor = (): { x: number; y: number } | null => {
    for (let t = 0; t < 60; t++) {
      const s = floorTiles[Math.floor(rng() * floorTiles.length)]
      if (!s) return null
      const k = `${s.x},${s.y}`
      if (usedFloor.has(k) || nearImportant(s.x, s.y)) continue
      usedFloor.add(k)
      return s
    }
    return null
  }

  // 贴墙贴花（离墙 2cm 防 z-fighting）
  const wallDecal = (spot: WSpot, tex: THREE.Texture, w: number, h: number, cy: number, opacity = 1) => {
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, opacity })
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    const off = 0.02, cx = spot.x + 0.5, cz = spot.y + 0.5
    if (spot.d === 0) p.position.set(cx, cy, spot.y + off)
    else if (spot.d === 2) { p.position.set(cx, cy, spot.y + 1 - off); p.rotation.y = Math.PI }
    else if (spot.d === 3) { p.position.set(spot.x + off, cy, cz); p.rotation.y = Math.PI / 2 }
    else { p.position.set(spot.x + 1 - off, cy, cz); p.rotation.y = -Math.PI / 2 }
    g.add(p)
    return p
  }
  // 地面贴花（同贴图合并，控制 drawcall）
  const floorBuckets = new Map<THREE.Texture, THREE.BufferGeometry[]>()
  const floorDecal = (fx: number, fz: number, tex: THREE.Texture, size: number, rot = 0) => {
    const geo = new THREE.PlaneGeometry(size, size)
    geo.rotateX(-Math.PI / 2)
    if (rot) geo.rotateY(rot)
    geo.translate(fx, 0.012 + rng() * 0.004, fz)
    if (!floorBuckets.has(tex)) floorBuckets.set(tex, [])
    floorBuckets.get(tex)!.push(geo)
  }
  // 低模道具：按颜色合并为少量 mesh（Lambert）
  const propBuckets = new Map<string, THREE.BufferGeometry[]>()
  const pBox = (color: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0, rx = 0) => {
    const geo = new THREE.BoxGeometry(w, h, d)
    if (rz) geo.rotateZ(rz)
    if (rx) geo.rotateX(rx)
    if (ry) geo.rotateY(ry)
    geo.translate(x, y, z)
    if (!propBuckets.has(color)) propBuckets.set(color, [])
    propBuckets.get(color)!.push(geo)
  }
  const pCyl = (color: string, rt: number, rb: number, h: number, x: number, y: number, z: number, ry = 0, rz = 0, seg = 8) => {
    const geo = new THREE.CylinderGeometry(rt, rb, h, seg)
    if (rz) geo.rotateZ(rz)
    if (ry) geo.rotateY(ry)
    geo.translate(x, y, z)
    if (!propBuckets.has(color)) propBuckets.set(color, [])
    propBuckets.get(color)!.push(geo)
  }
  // 自发光道具（可加入 fixtures 闪烁）
  const glowBox = (color: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0, flicker = false) => {
    const mat = new THREE.MeshBasicMaterial({ color })
    mat.userData.base = col(color)
    const mm = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mm.position.set(x, y, z)
    if (ry) mm.rotation.y = ry
    if (rz) mm.rotation.z = rz
    g.add(mm)
    if (flicker) fixtures.push({ mat, seed: rng() * 100 })
    return mm
  }
  // 墙边道具摆放点（地板瓦片靠墙 0.32m 处，朝向房内）
  const wallPropSpot = (): { x: number; z: number; ry: number } | null => {
    const s = pickWall()
    if (!s) return null
    const inward: [number, number, number][] = [[0, 1, Math.PI], [-1, 0, Math.PI / 2], [0, -1, 0], [1, 0, -Math.PI / 2]]
    const [ix, iz, ry] = inward[s.d]
    return { x: s.x + 0.5 - ix * 0.32, z: s.y + 0.5 - iz * 0.32, ry }
  }

  let seed = def.id * 1000
  const ns = () => (seed += 37)

  switch (def.gen) {
    case 'rooms': { // L0 黄色迷宫
      // 墙纸剥落补丁（贴墙贴花）
      for (let i = 0; i < ri(4, 6); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texPeel(ns()), rf(0.4, 0.8), rf(0.35, 0.7), rf(0.9, 2.2), 0.92)
      }
      // 地毯水渍反光（地面贴花，使用湿区贴图变种）
      for (let i = 0; i < ri(4, 6); i++) {
        const s = pickFloor(); if (!s) break
        floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), true), rf(0.6, 1.1), rng() * 3)
      }
      // 歪斜荧光灯（天花吊挂，闪烁）
      for (let i = 0; i < ri(3, 5); i++) {
        const s = pickFloor(); if (!s) break
        const x = s.x + 0.5, z = s.y + 0.5, tilt = rf(-0.3, 0.3)
        const wire = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.02), new THREE.MeshLambertMaterial({ color: '#3a3630' }))
        wire.position.set(x, H - 0.28, z)
        g.add(wire)
        glowBox('#e8e2c8', 0.9, 0.06, 0.18, x, H - 0.52, z, rf(0, 3), tilt, true)
      }
      // 远处假门（贴墙平面；约四成区块出现 1–2 扇，降低存在感）
      if (rng() < 0.45) for (let i = 0; i < ri(1, 2); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texFakeDoor(ns()), 0.85, 1.9, 0.97, 0.68)
      }
      break
    }
    case 'garage': { // L1 停车场
      // 废弃车变种（纯视觉，不同颜色/歪斜/破损）——仅天鹰段（parking）生成，其余区段不出汽车
      const carCols = ['#4a3f38', '#39454a', '#4a4440', '#3d2f2f', '#2f3a35', '#46402e']
      for (let i = 0, n = range?.variant && range.variant !== 'parking' ? 0 : ri(4, 6); i < n; i++) {
        const s = pickFloor(); if (!s) break
        const x = s.x + 0.5, z = s.y + 0.5, ry = rng() < 0.5 ? 0 : Math.PI / 2, skew = rf(-0.08, 0.08)
        const cc = carCols[Math.floor(rng() * carCols.length)]
        const crushed = rng() < 0.25
        pBox(cc, 1.7, crushed ? 0.34 : 0.5, 0.82, x, crushed ? 0.2 : 0.4, z, ry, skew)
        if (!crushed) pBox('#22262a', 0.85, 0.36, 0.68, x, 0.78, z, ry, skew)
        // 车轮（破损：缺轮倾斜）
        pBox('#16181a', 0.3, 0.3, 0.14, x - 0.55, 0.15, z + 0.38, ry)
        pBox('#16181a', 0.3, 0.3, 0.14, x + 0.55, 0.15, z + 0.38, ry)
        pBox('#16181a', 0.3, 0.3, 0.14, x - 0.55, 0.15, z - 0.38, ry)
        if (rng() < 0.8) pBox('#16181a', 0.3, 0.3, 0.14, x + 0.55, 0.15, z - 0.38, ry)
        // 车灯残片
        if (rng() < 0.5) glowBox('#6a5a30', 0.12, 0.08, 0.04, x + 0.86, 0.42, z + 0.2, ry)
      }
      // 油渍地面贴花
      for (let i = 0; i < ri(4, 6); i++) {
        const s = pickFloor(); if (!s) break
        floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), false), rf(0.5, 1.0), rng() * 3)
      }
      // 停车编号牌
      const signTexts = [['P-07'], ['B1'], ['ZONE C'], ['P-23'], ['EXIT →'], ['LEVEL B1']]
      for (let i = 0; i < ri(3, 4); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texSign(ns(), signTexts[Math.floor(rng() * signTexts.length)]), 0.8, 0.5, rf(1.6, 2.2), 0.95)
      }
      // 散落交通锥（InstancedMesh 控制 drawcall）
      const nCones = ri(5, 8)
      const coneGeo = mergeGeometries([
        new THREE.ConeGeometry(0.14, 0.42, 8).translate(0, 0.27, 0),
        new THREE.BoxGeometry(0.3, 0.04, 0.3).translate(0, 0.02, 0),
        new THREE.CylinderGeometry(0.1, 0.115, 0.07, 8).translate(0, 0.26, 0),
      ])!
      const cones = new THREE.InstancedMesh(coneGeo, new THREE.MeshLambertMaterial({ color: '#b85a20' }), nCones)
      const dummy = new THREE.Object3D()
      for (let i = 0; i < nCones; i++) {
        const s = pickFloor()
        dummy.position.set(s ? s.x + rf(0.2, 0.8) : -50, 0, s ? s.y + rf(0.2, 0.8) : -50)
        dummy.rotation.set(rng() < 0.2 ? 1.4 : 0, rng() * 3, 0) // 偶尔翻倒
        dummy.updateMatrix()
        cones.setMatrixAt(i, dummy.matrix)
      }
      g.add(cones)
      break
    }
    case 'pipes': { // L2 管道走廊
      // 压力表盘（贴墙：短管 + 表盘贴花）
      for (let i = 0; i < ri(3, 4); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texGaugeDial(ns()), 0.3, 0.3, rf(1.3, 1.7), 0.97)
      }
      // 警示带（v42 修复浮空：贴到最近墙面张贴——黄黑条纹警告条，不再横跨通道悬空）
      for (let i = 0; i < ri(3, 4); i++) {
        const s = pickWall(); if (!s) break
        const p = wallDecal(s, texCautionTape(ns()), rf(1.4, 2.2), 0.12, rf(1.0, 1.35), 0.96)
        p.userData.cautionTape = { x: s.x, y: s.y, d: s.d } // 冒烟断言用：贴墙锚点（瓦片 + 墙方向）
      }
      // 滴水管 + 小水洼反光
      for (let i = 0; i < ri(3, 5); i++) {
        const s = pickFloor(); if (!s) break
        const x = s.x + rf(0.3, 0.7), z = s.y + rf(0.3, 0.7)
        pCyl('#5a5650', 0.05, 0.05, 0.7, x, H - 0.35, z)
        pCyl('#5a5650', 0.07, 0.07, 0.1, x, H - 0.68, z)
        floorDecal(x, z, texStain(ns(), true), rf(0.45, 0.75), rng() * 3)
      }
      // 管道保温棉破损（墙边黄白碎块）
      for (let i = 0; i < ri(3, 4); i++) {
        const sp = wallPropSpot(); if (!sp) break
        pCyl('#6a4a2e', 0.09, 0.09, 1.0, sp.x, 2.1, sp.z, sp.ry, Math.PI / 2)
        for (let k = 0; k < 4; k++) {
          pBox(k % 2 ? '#b8a878' : '#8a8068', rf(0.1, 0.22), rf(0.06, 0.14), rf(0.1, 0.2), sp.x + rf(-0.4, 0.4), rf(0.03, 0.1), sp.z + rf(-0.4, 0.4), rng() * 3)
        }
        // 挂在管上的残片
        pBox('#b8a878', 0.16, 0.1, 0.14, sp.x + rf(-0.3, 0.3), 2.02, sp.z, sp.ry, rf(-0.5, 0.5))
      }
      break
    }
    case 'grid': { // L3 发电大厅
      // 闪烁指示灯排（贴墙，加入灯具 flicker 池）
      const indCols = ['#ff4a3a', '#6f9a55', '#9adfff', '#d9b13b']
      for (let i = 0; i < ri(3, 5); i++) {
        const s = pickWall(); if (!s) break
        const cx = s.x + 0.5, cz = s.y + 0.5, cy = rf(1.6, 2.2)
        const n = ri(4, 6)
        // 背板
        const off = 0.05
        let bx = cx, bz = cz, ry = 0
        if (s.d === 0) bz = s.y + off
        else if (s.d === 2) { bz = s.y + 1 - off; ry = Math.PI }
        else if (s.d === 3) { bx = s.x + off; ry = Math.PI / 2 }
        else { bx = s.x + 1 - off; ry = -Math.PI / 2 }
        const horiz = s.d === 0 || s.d === 2
        pBox('#22262a', horiz ? n * 0.16 + 0.1 : 0.06, 0.2, horiz ? 0.06 : n * 0.16 + 0.1, bx, cy, bz)
        for (let k = 0; k < n; k++) {
          const dx = horiz ? (k - (n - 1) / 2) * 0.16 : 0
          const dz = horiz ? 0 : (k - (n - 1) / 2) * 0.16
          glowBox(indCols[Math.floor(rng() * indCols.length)], 0.07, 0.07, 0.07, bx + dx, cy, bz + dz, ry, 0, rng() < 0.7)
        }
      }
      // 警告标识牌
      const warns = [['HIGH', 'VOLTAGE'], ['DANGER', '10 kV'], ['KEEP OUT'], ['ARC', 'FLASH']]
      for (let i = 0; i < ri(3, 4); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texSign(ns(), warns[Math.floor(rng() * warns.length)], '#8a7a1a', '#1a1815', '#1a1815'), 0.6, 0.4, rf(1.5, 2.0), 0.95)
      }
      // 电缆束沿墙走线（墙脚/墙顶并行线缆）
      const cableCols = ['#16181a', '#3a2020', '#1e2a38']
      for (let i = 0; i < ri(4, 6); i++) {
        const sp = wallPropSpot(); if (!sp) break
        const horiz = Math.abs(Math.sin(sp.ry)) > 0.5 // 沿墙方向
        const high = rng() < 0.4
        const y = high ? H - rf(0.25, 0.5) : rf(0.08, 0.3)
        const nc = ri(2, 4)
        for (let k = 0; k < nc; k++) {
          const cc = cableCols[Math.floor(rng() * cableCols.length)]
          const off2 = (k - (nc - 1) / 2) * 0.05
          if (horiz) pBox(cc, 0.98, 0.035, 0.035, sp.x, y + off2, sp.z)
          else pBox(cc, 0.035, 0.035, 0.98, sp.x, y + off2, sp.z)
        }
        // 下垂环
        if (rng() < 0.5) {
          const cc = cableCols[0]
          if (horiz) pBox(cc, 0.035, 0.5, 0.035, sp.x + rf(-0.4, 0.4), y - 0.25, sp.z)
          else pBox(cc, 0.035, 0.5, 0.035, sp.x, y - 0.25, sp.z + rf(-0.4, 0.4))
        }
      }
      break
    }
    case 'office': { // L4 办公室
      // 散落文件纸张（InstancedMesh）
      const nPapers = ri(7, 10)
      const paperGeo = new THREE.PlaneGeometry(0.22, 0.3)
      paperGeo.rotateX(-Math.PI / 2)
      const papers = new THREE.InstancedMesh(paperGeo, new THREE.MeshLambertMaterial({ map: texPaper(ns()), transparent: true }), nPapers)
      const dummy = new THREE.Object3D()
      for (let i = 0; i < nPapers; i++) {
        const s = pickFloor()
        dummy.position.set(s ? s.x + rf(0.15, 0.85) : -50, 0.012 + rng() * 0.006, s ? s.y + rf(0.15, 0.85) : -50)
        dummy.rotation.set(0, rng() * 6.3, 0)
        dummy.updateMatrix()
        papers.setMatrixAt(i, dummy.matrix)
      }
      g.add(papers)
      // 翻倒的转椅
      for (let i = 0; i < ri(2, 3); i++) {
        const s = pickFloor(); if (!s) break
        const x = s.x + 0.5, z = s.y + 0.5, ry = rng() * 3
        pBox('#2e3238', 0.48, 0.09, 0.48, x, 0.24, z, ry, Math.PI / 2) // 座（侧翻）
        pBox('#2e3238', 0.46, 0.55, 0.08, x - 0.26, 0.28, z, ry, Math.PI / 2) // 背
        pCyl('#4a4d52', 0.03, 0.03, 0.35, x, 0.18, z, 0, Math.PI / 2)
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2
          pBox('#22262a', 0.3, 0.03, 0.05, x + Math.cos(a) * 0.2, 0.05, z + Math.sin(a) * 0.2, -a)
        }
      }
      // 白板残留字迹
      for (let i = 0; i < ri(2, 3); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texWhiteboard(ns()), 1.2, 0.9, 1.55, 0.96)
      }
      // 饮水机
      for (let i = 0; i < ri(1, 2); i++) {
        const sp = wallPropSpot(); if (!sp) break
        pBox('#8f8a7c', 0.36, 1.0, 0.36, sp.x, 0.5, sp.z, sp.ry)
        pCyl('#7fb0c9', 0.14, 0.16, 0.42, sp.x, 1.22, sp.z)
        glowBox('#6f9a55', 0.05, 0.05, 0.03, sp.x, 0.9, sp.z, sp.ry)
      }
      break
    }
    case 'hotel': { // L5 酒店
      // 行李车（金框架 + 红底座）
      for (let i = 0; i < ri(1, 2); i++) {
        const s = pickFloor(); if (!s) break
        const x = s.x + 0.5, z = s.y + 0.5, ry = rng() * 3
        pBox('#5a1e20', 0.7, 0.06, 0.45, x, 0.12, z, ry)
        pBox('#b08d46', 0.05, 1.5, 0.05, x - 0.32, 0.85, z - 0.2, ry)
        pBox('#b08d46', 0.05, 1.5, 0.05, x + 0.32, 0.85, z - 0.2, ry)
        pBox('#b08d46', 0.05, 1.5, 0.05, x - 0.32, 0.85, z + 0.2, ry)
        pBox('#b08d46', 0.05, 1.5, 0.05, x + 0.32, 0.85, z + 0.2, ry)
        pBox('#b08d46', 0.72, 0.05, 0.48, x, 1.62, z, ry)
        pBox('#16181a', 0.09, 0.09, 0.09, x - 0.28, 0.05, z + 0.18, ry)
        pBox('#16181a', 0.09, 0.09, 0.09, x + 0.28, 0.05, z + 0.18, ry)
        // 行李
        if (rng() < 0.7) pBox('#3a2e26', 0.4, 0.3, 0.28, x, 0.32, z, ry + rf(-0.2, 0.2))
      }
      // 客房服务推车
      for (let i = 0; i < ri(1, 2); i++) {
        const sp = wallPropSpot(); if (!sp) break
        pBox('#4a4d52', 0.85, 0.7, 0.5, sp.x, 0.45, sp.z, sp.ry)
        pBox('#d8cfc0', 0.5, 0.12, 0.36, sp.x, 0.86, sp.z, sp.ry) // 叠放毛巾
        pBox('#b8b0a0', 0.4, 0.1, 0.3, sp.x + 0.1, 0.97, sp.z, sp.ry + 0.15)
        pBox('#16181a', 0.08, 0.08, 0.08, sp.x - 0.35, 0.05, sp.z + 0.18, sp.ry)
        pBox('#16181a', 0.08, 0.08, 0.08, sp.x + 0.35, 0.05, sp.z + 0.18, sp.ry)
      }
      // 油画框（贴墙：金框 + 画布贴花）
      for (let i = 0; i < ri(3, 5); i++) {
        const s = pickWall(); if (!s) break
        const w = rf(0.6, 1.0), h = w * rf(0.6, 0.8), cy = rf(1.4, 1.9)
        // 框（低模四条边，挂在墙前）
        const off = 0.035, cx = s.x + 0.5, cz = s.y + 0.5
        let fx = cx, fz = cz
        if (s.d === 0) fz = s.y + off
        else if (s.d === 2) fz = s.y + 1 - off
        else if (s.d === 3) fx = s.x + off
        else fx = s.x + 1 - off
        const horiz = s.d === 0 || s.d === 2
        pBox('#8a6d2e', horiz ? w + 0.08 : 0.05, 0.05, horiz ? 0.05 : w + 0.08, fx, cy + h / 2, fz)
        pBox('#8a6d2e', horiz ? w + 0.08 : 0.05, 0.05, horiz ? 0.05 : w + 0.08, fx, cy - h / 2, fz)
        pBox('#8a6d2e', horiz ? 0.05 : 0.05, h + 0.08, horiz ? 0.05 : 0.05, horiz ? fx - w / 2 : fx, cy, horiz ? fz : fz - w / 2)
        pBox('#8a6d2e', horiz ? 0.05 : 0.05, h + 0.08, horiz ? 0.05 : 0.05, horiz ? fx + w / 2 : fx, cy, horiz ? fz : fz + w / 2)
        wallDecal(s, texPainting(ns()), w, h, cy, 0.98)
      }
      // 走廊尽头花瓶
      for (let i = 0; i < ri(1, 2); i++) {
        const s = pickFloor(); if (!s) break
        const x = s.x + 0.5, z = s.y + 0.5
        pCyl('#3a1e20', 0.09, 0.14, 0.55, x, 0.28, z, 0, 0, 10)
        pCyl('#2a1516', 0.05, 0.08, 0.14, x, 0.6, z, 0, 0, 8)
        // 干枝
        for (let k = 0; k < 3; k++) {
          pBox('#4a3a28', 0.015, rf(0.4, 0.7), 0.015, x + rf(-0.04, 0.04), 0.85, z + rf(-0.04, 0.04), 0, rf(-0.35, 0.35))
        }
      }
      break
    }

    // ================= v23：Level 6–11 与 Level 601 =================
    case 'darkhall': { // L6「Lights Out」——黑到几乎看不见，只做可触摸的东西
      // 前人的记号：墙上的划痕与手印（极低对比度，只有贴近才勉强分辨）
      for (let i = 0; i < ri(8, 12); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texPeel(ns()), rf(0.3, 0.6), rf(0.25, 0.5), rf(0.9, 1.5), 0.35)
      }
      // 沿墙的管道支架
      for (let i = 0; i < ri(10, 16); i++) {
        const sp = wallPropSpot(); if (!sp) break
        pBox('#3a2e26', 0.12, 0.1, 0.34, sp.x, 1.9, sp.z, sp.ry)
      }
      // 被丢弃的手电（亮着，却不发光——本层的核心恐怖点）
      for (let i = 0; i < ri(2, 4); i++) {
        const s = pickFloor(); if (!s) break
        pCyl('#2a2d30', 0.05, 0.06, 0.24, s.x + 0.5, 0.06, s.y + 0.5, 0, Math.PI / 2)
      }
      break
    }
    case 'ocean': { // L7「Thalassophobia」——海床与遗骸
      // 铺在海床下的合成纤维地毯碎片（Wikidot：海床下面铺着地毯）
      for (let i = 0; i < ri(6, 9); i++) {
        const s = pickFloor(); if (!s) break
        floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), false), rf(0.8, 1.6), rng() * 3)
      }
      // 锈蚀金属碎片
      for (let i = 0; i < ri(8, 14); i++) {
        const s = pickFloor(); if (!s) break
        pBox('#5a3a2a', rf(0.3, 0.8), 0.06, rf(0.2, 0.5), s.x + 0.5, 0.05, s.y + 0.5, rng() * 3, rf(-0.3, 0.3))
      }
      // 散落骨头
      for (let i = 0; i < ri(10, 16); i++) {
        const s = pickFloor(); if (!s) break
        pCyl('#cfc8b4', 0.04, 0.05, rf(0.3, 0.7), s.x + rf(0.2, 0.8), 0.06, s.y + rf(0.2, 0.8), rng() * 3, Math.PI / 2)
      }
      break
    }
    case 'caves': { // L8「Cave Systems」——岩壁、苔藓、被风化的路标
      for (let i = 0; i < ri(10, 16); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texPeel(ns()), rf(0.5, 1.1), rf(0.5, 1.0), rf(0.8, 2.4), 0.7)
      }
      // 碎石堆
      for (let i = 0; i < ri(14, 22); i++) {
        const s = pickFloor(); if (!s) break
        const bx = s.x + rf(0.2, 0.8), bz = s.y + rf(0.2, 0.8)
        pBox('#6a6250', rf(0.2, 0.5), rf(0.15, 0.4), rf(0.2, 0.5), bx, 0.12, bz, rng() * 3, rf(-0.4, 0.4))
      }
      // 发光苔藓斑（微弱的蓝绿，来自以杏仁水沉积物为食的细菌与真菌）
      for (let i = 0; i < ri(6, 10); i++) {
        const s = pickFloor(); if (!s) break
        glowBox('#2e6a60', rf(0.3, 0.7), 0.02, rf(0.3, 0.7), s.x + 0.5, 0.02, s.y + 0.5)
      }
      // 已经风化开裂的旧路标（熵效应：路标以极快的速度降解）
      for (let i = 0; i < ri(2, 4); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texSign(ns(), ['9TH RD', 'M.E.G.']), 0.55, 0.4, rf(1.4, 1.9), 0.6)
      }
      break
    }
    case 'suburb': { // L9「The Suburbs」——湿沥青、落叶、水洼
      for (let i = 0; i < ri(12, 20); i++) {
        const s = pickFloor(); if (!s) break
        floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), true), rf(0.6, 1.4), rng() * 3)
      }
      // 落叶
      for (let i = 0; i < ri(20, 32); i++) {
        const s = pickFloor(); if (!s) break
        pBox(['#5a3a1e', '#6a4a24', '#4a3a20'][Math.floor(rng() * 3)], rf(0.12, 0.24), 0.02, rf(0.1, 0.2), s.x + rf(0.1, 0.9), 0.02, s.y + rf(0.1, 0.9), rng() * 3)
      }
      // 垃圾桶
      for (let i = 0; i < ri(3, 6); i++) {
        const sp = wallPropSpot(); if (!sp) break
        pCyl('#2e3a32', 0.26, 0.24, 0.8, sp.x, 0.4, sp.z)
      }
      break
    }
    case 'field': { // L10「Bumper Crop」——车辙、干草、木料
      for (let i = 0; i < ri(10, 16); i++) {
        const s = pickFloor(); if (!s) break
        floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), false), rf(0.7, 1.5), rng() * 3)
      }
      // 干草堆与木料
      for (let i = 0; i < ri(8, 14); i++) {
        const s = pickFloor(); if (!s) break
        pBox('#b8a04a', rf(0.5, 0.9), rf(0.3, 0.6), rf(0.5, 0.9), s.x + 0.5, 0.25, s.y + 0.5, rng() * 3)
      }
      for (let i = 0; i < ri(6, 10); i++) {
        const s = pickFloor(); if (!s) break
        pBox('#6a5232', rf(0.8, 1.6), 0.1, 0.16, s.x + 0.5, 0.06, s.y + 0.5, rng() * 3)
      }
      break
    }
    case 'city': { // L11「不夜城」——广告柱、脚手架、施工围挡、垃圾桶
      for (let i = 0; i < ri(4, 7); i++) {
        const s = pickFloor(); if (!s) break
        pCyl('#3a3d42', 0.42, 0.42, 2.6, s.x + 0.5, 1.3, s.y + 0.5)
        glowBox('#c9d2da', 0.7, 1.1, 0.02, s.x + 0.5, 1.6, s.y + 0.93)
      }
      // 脚手架（自发出现的临时物件）
      for (let i = 0; i < ri(3, 5); i++) {
        const sp = wallPropSpot(); if (!sp) break
        for (let k = 0; k < 3; k++) pBox('#7a6a4a', 0.1, 3.4, 0.1, sp.x + (k - 1) * 0.5, 1.7, sp.z, sp.ry)
        pBox('#7a6a4a', 1.4, 0.08, 0.5, sp.x, 2.4, sp.z, sp.ry)
      }
      // 垃圾桶与街道标识
      for (let i = 0; i < ri(5, 9); i++) {
        const sp = wallPropSpot(); if (!sp) break
        pCyl('#4a4d52', 0.24, 0.22, 0.85, sp.x, 0.43, sp.z)
      }
      for (let i = 0; i < ri(3, 5); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texSign(ns(), [['MAIN ST'], ['5TH AVE'], ['NO PARKING'], ['SUBWAY ↓']][Math.floor(rng() * 4)]), 0.9, 0.4, rf(2.0, 2.6), 0.95)
      }
      break
    }
    case 'library': { // L601「The End」——书、阅览灯、地板蜡的反光
      for (let i = 0; i < ri(8, 12); i++) {
        const s = pickWall(); if (!s) break
        wallDecal(s, texPainting(ns()), rf(0.6, 1.0), rf(0.5, 0.9), rf(1.5, 2.3), 0.95)
      }
      // 摊开在地上的书
      for (let i = 0; i < ri(10, 16); i++) {
        const s = pickFloor(); if (!s) break
        pBox(['#8a3a2e', '#2e4a6a', '#3a5a3a', '#6a5a2e'][Math.floor(rng() * 4)], 0.26, 0.05, 0.34, s.x + rf(0.2, 0.8), 0.03, s.y + rf(0.2, 0.8), rng() * 3)
      }
      // 阅览灯
      for (let i = 0; i < ri(4, 7); i++) {
        const s = pickFloor(); if (!s) break
        pCyl('#2e2a24', 0.06, 0.09, 0.5, s.x + 0.5, 0.25, s.y + 0.5)
        glowBox('#fff0cc', 0.22, 0.1, 0.22, s.x + 0.5, 0.55, s.y + 0.5)
      }
      break
    }
  }

  // flush：合并地面贴花 / 道具桶
  for (const [tex, geos] of floorBuckets) {
    const mat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false })
    g.add(new THREE.Mesh(mergeGeometries(geos)!, mat))
  }
  for (const [color, geos] of propBuckets) {
    g.add(new THREE.Mesh(mergeGeometries(geos)!, new THREE.MeshLambertMaterial({ color })))
  }
}
