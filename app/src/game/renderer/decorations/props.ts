// v53：层级装饰——无碰撞低模道具（合并桶/实例化网格，不进 m.structures、不可交互、不阻挡通行）。
// 每个函数对应一种道具特征，由 index.ts 的 buildDecorations 按层级生成器调用。
// 注意：rng 是唯一顺序流（见 context.ts），各函数内部不得增删 rng 调用。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { DecorCtx } from './context'
import { texStain } from '../textures'

// ---- L0 黄色迷宫 ----
// 歪斜荧光灯（天花吊挂，闪烁）
export function roomsTiltedLamps(c: DecorCtx) {
  const { ri, rf, pickFloor, glowBox, g, H } = c
  for (let i = 0; i < ri(1, 2); i++) {
    const s = pickFloor(); if (!s) break
    const x = s.x + 0.5, z = s.y + 0.5, tilt = rf(-0.12, 0.12)
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.16, 0.015), new THREE.MeshLambertMaterial({ color: '#5b574c' }))
    wire.position.set(x, H - 0.09, z)
    g.add(wire)
    glowBox('#eee9d2', 1.02, 0.045, 0.28, x, H - 0.18, z, rf(0, 3), tilt, true)
  }
}

// ---- L1 停车场 ----
// 废弃车变种（纯视觉，不同颜色/歪斜/破损）——仅天鹰段（parking）生成，其余区段不出汽车
export function garageWreckCars(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pBox, glowBox, variant } = c
  const carCols = ['#4a3f38', '#39454a', '#4a4440', '#3d2f2f', '#2f3a35', '#46402e']
  for (let i = 0, n = variant && variant !== 'parking' ? 0 : ri(4, 6); i < n; i++) {
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
}
// 散落交通锥（InstancedMesh 控制 drawcall）
export function garageTrafficCones(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, g } = c
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
}

// ---- L2 管道走廊 ----
// 滴水管 + 小水洼反光（水洼是 accompanying 地面贴花，同一循环内交错以保持 rng 顺序）
export function pipesDripPipes(c: DecorCtx) {
  const { ri, rf, rng, ns, pickFloor, pCyl, floorDecal, H } = c
  for (let i = 0; i < ri(3, 5); i++) {
    const s = pickFloor(); if (!s) break
    const x = s.x + rf(0.3, 0.7), z = s.y + rf(0.3, 0.7)
    pCyl('#5a5650', 0.05, 0.05, 0.7, x, H - 0.35, z)
    pCyl('#5a5650', 0.07, 0.07, 0.1, x, H - 0.68, z)
    floorDecal(x, z, texStain(ns(), true), rf(0.45, 0.75), rng() * 3)
  }
}
// 管道保温棉破损（墙边黄白碎块）
export function pipesInsulationScraps(c: DecorCtx) {
  const { ri, rf, rng, wallPropSpot, pCyl, pBox } = c
  for (let i = 0; i < ri(3, 4); i++) {
    const sp = wallPropSpot(); if (!sp) break
    pCyl('#6a4a2e', 0.09, 0.09, 1.0, sp.x, 2.1, sp.z, sp.ry, Math.PI / 2)
    for (let k = 0; k < 4; k++) {
      pBox(k % 2 ? '#b8a878' : '#8a8068', rf(0.1, 0.22), rf(0.06, 0.14), rf(0.1, 0.2), sp.x + rf(-0.4, 0.4), rf(0.03, 0.1), sp.z + rf(-0.4, 0.4), rng() * 3)
    }
    // 挂在管上的残片
    pBox('#b8a878', 0.16, 0.1, 0.14, sp.x + rf(-0.3, 0.3), 2.02, sp.z, sp.ry, rf(-0.5, 0.5))
  }
}

// ---- L3 发电大厅 ----
// 闪烁指示灯排（贴墙，加入灯具 flicker 池）
export function gridIndicatorRows(c: DecorCtx) {
  const { ri, rf, rng, pickWall, pBox, glowBox } = c
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
}
// 电缆束沿墙走线（墙脚/墙顶并行线缆）
export function gridCableRuns(c: DecorCtx) {
  const { ri, rf, rng, wallPropSpot, pBox, H } = c
  const cableCols = ['#16181a', '#3a2020', '#1e2a38']
  for (let i = 0; i < ri(4, 6); i++) {
    const sp = wallPropSpot(); if (!sp) break
    // v53b：电缆贴墙——wallPropSpot 是距墙 0.32m 的家具摆位，线缆悬空 0.18m 太出戏；
    // 沿墙法线再推 0.145m（距墙面 ~0.035m，贴墙不嵌墙），墙脚/墙顶线缆统一贴墙
    const hx = sp.x + Math.sin(sp.ry) * 0.145, hz = sp.z + Math.cos(sp.ry) * 0.145
    const horiz = Math.abs(Math.sin(sp.ry)) > 0.5 // 沿墙方向
    const high = rng() < 0.4
    const y = high ? H - rf(0.25, 0.5) : rf(0.08, 0.3)
    const nc = ri(2, 4)
    for (let k = 0; k < nc; k++) {
      const cc = cableCols[Math.floor(rng() * cableCols.length)]
      const off2 = (k - (nc - 1) / 2) * 0.05
      if (horiz) pBox(cc, 0.98, 0.035, 0.035, hx, y + off2, hz)
      else pBox(cc, 0.035, 0.035, 0.98, hx, y + off2, hz)
    }
    // 下垂环
    if (rng() < 0.5) {
      const cc = cableCols[0]
      if (horiz) pBox(cc, 0.035, 0.5, 0.035, hx + rf(-0.4, 0.4), y - 0.25, hz)
      else pBox(cc, 0.035, 0.5, 0.035, hx, y - 0.25, hz + rf(-0.4, 0.4))
    }
  }
}

// ---- L4 办公室 ----
// 翻倒的转椅
export function officeFallenChairs(c: DecorCtx) {
  const { ri, rng, pickFloor, pBox, pCyl } = c
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
}
// 饮水机
export function officeWaterCoolers(c: DecorCtx) {
  const { ri, wallPropSpot, pBox, pCyl, glowBox } = c
  for (let i = 0; i < ri(1, 2); i++) {
    const sp = wallPropSpot(); if (!sp) break
    pBox('#8f8a7c', 0.36, 1.0, 0.36, sp.x, 0.5, sp.z, sp.ry)
    pCyl('#7fb0c9', 0.14, 0.16, 0.42, sp.x, 1.22, sp.z)
    glowBox('#6f9a55', 0.05, 0.05, 0.03, sp.x, 0.9, sp.z, sp.ry)
  }
}

// ---- L5 酒店 ----
// 行李车（金框架 + 红底座）
export function hotelLuggageCarts(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pBox } = c
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
}
// 客房服务推车
export function hotelServiceCarts(c: DecorCtx) {
  const { ri, wallPropSpot, pBox } = c
  for (let i = 0; i < ri(1, 2); i++) {
    const sp = wallPropSpot(); if (!sp) break
    pBox('#4a4d52', 0.85, 0.7, 0.5, sp.x, 0.45, sp.z, sp.ry)
    pBox('#d8cfc0', 0.5, 0.12, 0.36, sp.x, 0.86, sp.z, sp.ry) // 叠放毛巾
    pBox('#b8b0a0', 0.4, 0.1, 0.3, sp.x + 0.1, 0.97, sp.z, sp.ry + 0.15)
    pBox('#16181a', 0.08, 0.08, 0.08, sp.x - 0.35, 0.05, sp.z + 0.18, sp.ry)
    pBox('#16181a', 0.08, 0.08, 0.08, sp.x + 0.35, 0.05, sp.z + 0.18, sp.ry)
  }
}
// 走廊尽头花瓶
export function hotelVases(c: DecorCtx) {
  const { ri, rf, pickFloor, pCyl, pBox } = c
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
}

// ---- L6「Lights Out」——黑到几乎看不见，只做可触摸的东西 ----
// 沿墙的管道支架
export function darkhallPipeBrackets(c: DecorCtx) {
  const { ri, wallPropSpot, pBox } = c
  for (let i = 0; i < ri(10, 16); i++) {
    const sp = wallPropSpot(); if (!sp) break
    pBox('#3a2e26', 0.12, 0.1, 0.34, sp.x, 1.9, sp.z, sp.ry)
  }
}
// 被丢弃的手电（亮着，却不发光——本层的核心恐怖点）
export function darkhallDeadFlashlights(c: DecorCtx) {
  const { ri, pickFloor, pCyl } = c
  for (let i = 0; i < ri(2, 4); i++) {
    const s = pickFloor(); if (!s) break
    pCyl('#2a2d30', 0.05, 0.06, 0.24, s.x + 0.5, 0.06, s.y + 0.5, 0, Math.PI / 2)
  }
}

// ---- L7「Thalassophobia」——海床与遗骸 ----
// 锈蚀金属碎片
export function oceanRustScraps(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pBox } = c
  for (let i = 0; i < ri(8, 14); i++) {
    const s = pickFloor(); if (!s) break
    pBox('#5a3a2a', rf(0.3, 0.8), 0.06, rf(0.2, 0.5), s.x + 0.5, 0.05, s.y + 0.5, rng() * 3, rf(-0.3, 0.3))
  }
}
// 散落骨头
export function oceanScatteredBones(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pCyl } = c
  for (let i = 0; i < ri(10, 16); i++) {
    const s = pickFloor(); if (!s) break
    pCyl('#cfc8b4', 0.04, 0.05, rf(0.3, 0.7), s.x + rf(0.2, 0.8), 0.06, s.y + rf(0.2, 0.8), rng() * 3, Math.PI / 2)
  }
}

// ---- L8「Cave Systems」——岩壁、苔藓、被风化的路标 ----
// 碎石堆
export function cavesRubble(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pBox } = c
  for (let i = 0; i < ri(14, 22); i++) {
    const s = pickFloor(); if (!s) break
    const bx = s.x + rf(0.2, 0.8), bz = s.y + rf(0.2, 0.8)
    pBox('#6a6250', rf(0.2, 0.5), rf(0.15, 0.4), rf(0.2, 0.5), bx, 0.12, bz, rng() * 3, rf(-0.4, 0.4))
  }
}
// 发光苔藓斑（微弱的蓝绿，来自以杏仁水沉积物为食的细菌与真菌）
export function cavesGlowMoss(c: DecorCtx) {
  const { ri, rf, pickFloor, glowBox } = c
  for (let i = 0; i < ri(6, 10); i++) {
    const s = pickFloor(); if (!s) break
    glowBox('#2e6a60', rf(0.3, 0.7), 0.02, rf(0.3, 0.7), s.x + 0.5, 0.02, s.y + 0.5)
  }
}

// ---- L9「The Suburbs」——湿沥青、落叶、水洼 ----
// 落叶
export function suburbLeaves(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pBox } = c
  for (let i = 0; i < ri(20, 32); i++) {
    const s = pickFloor(); if (!s) break
    pBox(['#5a3a1e', '#6a4a24', '#4a3a20'][Math.floor(rng() * 3)], rf(0.12, 0.24), 0.02, rf(0.1, 0.2), s.x + rf(0.1, 0.9), 0.02, s.y + rf(0.1, 0.9), rng() * 3)
  }
}
// 垃圾桶
export function suburbTrashcans(c: DecorCtx) {
  const { ri, wallPropSpot, pCyl } = c
  for (let i = 0; i < ri(3, 6); i++) {
    const sp = wallPropSpot(); if (!sp) break
    pCyl('#2e3a32', 0.26, 0.24, 0.8, sp.x, 0.4, sp.z)
  }
}

// ---- L10「Bumper Crop」——车辙、干草、木料 ----
// 干草堆
export function fieldHayBales(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pBox } = c
  for (let i = 0; i < ri(8, 14); i++) {
    const s = pickFloor(); if (!s) break
    pBox('#b8a04a', rf(0.5, 0.9), rf(0.3, 0.6), rf(0.5, 0.9), s.x + 0.5, 0.25, s.y + 0.5, rng() * 3)
  }
}
// 木料
export function fieldTimber(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pBox } = c
  for (let i = 0; i < ri(6, 10); i++) {
    const s = pickFloor(); if (!s) break
    pBox('#6a5232', rf(0.8, 1.6), 0.1, 0.16, s.x + 0.5, 0.06, s.y + 0.5, rng() * 3)
  }
}

// ---- L11「不夜城」——广告柱、脚手架、施工围挡、垃圾桶 ----
// 广告柱
export function cityAdPillars(c: DecorCtx) {
  const { ri, pickFloor, pCyl, glowBox } = c
  for (let i = 0; i < ri(4, 7); i++) {
    const s = pickFloor(); if (!s) break
    pCyl('#3a3d42', 0.42, 0.42, 2.6, s.x + 0.5, 1.3, s.y + 0.5)
    glowBox('#c9d2da', 0.7, 1.1, 0.02, s.x + 0.5, 1.6, s.y + 0.93)
  }
}
// 脚手架（自发出现的临时物件）
export function cityScaffolds(c: DecorCtx) {
  const { ri, wallPropSpot, pBox } = c
  for (let i = 0; i < ri(3, 5); i++) {
    const sp = wallPropSpot(); if (!sp) break
    for (let k = 0; k < 3; k++) pBox('#7a6a4a', 0.1, 3.4, 0.1, sp.x + (k - 1) * 0.5, 1.7, sp.z, sp.ry)
    pBox('#7a6a4a', 1.4, 0.08, 0.5, sp.x, 2.4, sp.z, sp.ry)
  }
}
// 垃圾桶
export function cityStreetTrashcans(c: DecorCtx) {
  const { ri, wallPropSpot, pCyl } = c
  for (let i = 0; i < ri(5, 9); i++) {
    const sp = wallPropSpot(); if (!sp) break
    pCyl('#4a4d52', 0.24, 0.22, 0.85, sp.x, 0.43, sp.z)
  }
}

// ---- L601「The End」——书、阅览灯、地板蜡的反光 ----
// 摊开在地上的书
export function libraryOpenBooks(c: DecorCtx) {
  const { ri, rf, rng, pickFloor, pBox } = c
  for (let i = 0; i < ri(10, 16); i++) {
    const s = pickFloor(); if (!s) break
    pBox(['#8a3a2e', '#2e4a6a', '#3a5a3a', '#6a5a2e'][Math.floor(rng() * 4)], 0.26, 0.05, 0.34, s.x + rf(0.2, 0.8), 0.03, s.y + rf(0.2, 0.8), rng() * 3)
  }
}
// 阅览灯
export function libraryReadingLamps(c: DecorCtx) {
  const { ri, pickFloor, pCyl, glowBox } = c
  for (let i = 0; i < ri(4, 7); i++) {
    const s = pickFloor(); if (!s) break
    pCyl('#2e2a24', 0.06, 0.09, 0.5, s.x + 0.5, 0.25, s.y + 0.5)
    glowBox('#fff0cc', 0.22, 0.1, 0.22, s.x + 0.5, 0.55, s.y + 0.5)
  }
}
