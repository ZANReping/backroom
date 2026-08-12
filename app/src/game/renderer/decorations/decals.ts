// v53：层级装饰——仅贴图贴花（贴墙/地面平面，无几何体积、不进 m.structures、不可交互）。
// 每个函数对应一种贴花特征，由 index.ts 的 buildDecorations 按层级生成器调用。
// 注意：rng 是唯一顺序流（见 context.ts），各函数内部不得增删 rng 调用。
import * as THREE from 'three'
import type { DecorCtx } from './context'
import {
  texPeel, texStain, texSign, texCautionTape, texGaugeDial,
  texWhiteboard, texPainting, texFakeDoor, texPaper,
} from '../textures'

// ---- L0 黄色迷宫 ----
// 墙纸剥落补丁（贴墙贴花）
export function roomsPeelPatches(c: DecorCtx) {
  const { ri, rf, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(4, 6); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texPeel(ns()), rf(0.4, 0.8), rf(0.35, 0.7), rf(0.9, 2.2), 0.92)
  }
}
// 地毯水渍反光（地面贴花，使用湿区贴图变种）
export function roomsCarpetStains(c: DecorCtx) {
  const { ri, rf, rng, ns, pickFloor, floorDecal } = c
  for (let i = 0; i < ri(4, 6); i++) {
    const s = pickFloor(); if (!s) break
    floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), true), rf(0.6, 1.1), rng() * 3)
  }
}
// 远处假门（贴墙平面；约四成区块出现 1–2 扇，降低存在感）
export function roomsFakeDoors(c: DecorCtx) {
  const { ri, rng, ns, pickWall, wallDecal } = c
  if (rng() < 0.45) for (let i = 0; i < ri(1, 2); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texFakeDoor(ns()), 0.85, 1.9, 0.97, 0.68)
  }
}

// ---- L1 停车场 ----
// 油渍地面贴花
export function garageOilStains(c: DecorCtx) {
  const { ri, rf, rng, ns, pickFloor, floorDecal } = c
  for (let i = 0; i < ri(4, 6); i++) {
    const s = pickFloor(); if (!s) break
    floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), false), rf(0.5, 1.0), rng() * 3)
  }
}
// 停车编号牌
export function garageParkSigns(c: DecorCtx) {
  const { ri, rf, rng, ns, pickWall, wallDecal } = c
  const signTexts = [['P-07'], ['B1'], ['ZONE C'], ['P-23'], ['EXIT →'], ['LEVEL B1']]
  for (let i = 0; i < ri(3, 4); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texSign(ns(), signTexts[Math.floor(rng() * signTexts.length)]), 0.8, 0.5, rf(1.6, 2.2), 0.95)
  }
}

// ---- L2 管道走廊 ----
// 压力表盘（贴墙：短管 + 表盘贴花）
export function pipesGaugeDials(c: DecorCtx) {
  const { ri, rf, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(3, 4); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texGaugeDial(ns()), 0.3, 0.3, rf(1.3, 1.7), 0.97)
  }
}
// 警示带（v42 修复浮空：贴到最近墙面张贴——黄黑条纹警告条，不再横跨通道悬空）
export function pipesCautionTapes(c: DecorCtx) {
  const { ri, rf, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(3, 4); i++) {
    const s = pickWall(); if (!s) break
    const p = wallDecal(s, texCautionTape(ns()), rf(1.4, 2.2), 0.12, rf(1.0, 1.35), 0.96)
    p.userData.cautionTape = { x: s.x, y: s.y, d: s.d } // 冒烟断言用：贴墙锚点（瓦片 + 墙方向）
  }
}

// ---- L3 发电大厅 ----
// 警告标识牌
export function gridWarnSigns(c: DecorCtx) {
  const { ri, rf, rng, ns, pickWall, wallDecal } = c
  const warns = [['HIGH', 'VOLTAGE'], ['DANGER', '10 kV'], ['KEEP OUT'], ['ARC', 'FLASH']]
  for (let i = 0; i < ri(3, 4); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texSign(ns(), warns[Math.floor(rng() * warns.length)], '#8a7a1a', '#1a1815', '#1a1815'), 0.6, 0.4, rf(1.5, 2.0), 0.95)
  }
}

// ---- L4 办公室 ----
// 散落文件纸张（InstancedMesh 贴图平面，视为地面贴花）
export function officeScatteredPapers(c: DecorCtx) {
  const { ri, rf, rng, ns, pickFloor, g } = c
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
}
// 白板残留字迹
export function officeWhiteboards(c: DecorCtx) {
  const { ri, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(2, 3); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texWhiteboard(ns()), 1.2, 0.9, 1.55, 0.96)
  }
}

// ---- L5 酒店 ----
// 油画框（贴墙：金框 + 画布贴花）——画布是本类贴花；金框四边借用道具桶 pBox（同一循环内交错，保持 rng 顺序）
export function hotelPaintings(c: DecorCtx) {
  const { ri, rf, ns, pickWall, wallDecal, pBox } = c
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
}

// ---- L6「Lights Out」 ----
// 前人的记号：墙上的划痕与手印（极低对比度，只有贴近才勉强分辨）
export function darkhallScratchMarks(c: DecorCtx) {
  const { ri, rf, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(8, 12); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texPeel(ns()), rf(0.3, 0.6), rf(0.25, 0.5), rf(0.9, 1.5), 0.35)
  }
}

// ---- L7「Thalassophobia」 ----
// 铺在海床下的合成纤维地毯碎片（Wikidot：海床下面铺着地毯）
export function oceanCarpetShreds(c: DecorCtx) {
  const { ri, rf, rng, ns, pickFloor, floorDecal } = c
  for (let i = 0; i < ri(6, 9); i++) {
    const s = pickFloor(); if (!s) break
    floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), false), rf(0.8, 1.6), rng() * 3)
  }
}

// ---- L8「Cave Systems」 ----
// 岩壁风化痕（贴墙贴花）
export function cavesRockWear(c: DecorCtx) {
  const { ri, rf, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(10, 16); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texPeel(ns()), rf(0.5, 1.1), rf(0.5, 1.0), rf(0.8, 2.4), 0.7)
  }
}
// 已经风化开裂的旧路标（熵效应：路标以极快的速度降解）
export function cavesOldRoadsigns(c: DecorCtx) {
  const { ri, rf, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(2, 4); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texSign(ns(), ['9TH RD', 'M.E.G.']), 0.55, 0.4, rf(1.4, 1.9), 0.6)
  }
}

// ---- L9「The Suburbs」 ----
// 湿沥青水洼（地面贴花）
export function suburbPuddles(c: DecorCtx) {
  const { ri, rf, rng, ns, pickFloor, floorDecal } = c
  for (let i = 0; i < ri(12, 20); i++) {
    const s = pickFloor(); if (!s) break
    floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), true), rf(0.6, 1.4), rng() * 3)
  }
}

// ---- L10「Bumper Crop」 ----
// 车辙（地面贴花）
export function fieldRuts(c: DecorCtx) {
  const { ri, rf, rng, ns, pickFloor, floorDecal } = c
  for (let i = 0; i < ri(10, 16); i++) {
    const s = pickFloor(); if (!s) break
    floorDecal(s.x + 0.5, s.y + 0.5, texStain(ns(), false), rf(0.7, 1.5), rng() * 3)
  }
}

// ---- L11「不夜城」 ----
// 街道标识（贴墙贴花）
export function cityStreetSigns(c: DecorCtx) {
  const { ri, rf, rng, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(3, 5); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texSign(ns(), [['MAIN ST'], ['5TH AVE'], ['NO PARKING'], ['SUBWAY ↓']][Math.floor(rng() * 4)]), 0.9, 0.4, rf(2.0, 2.6), 0.95)
  }
}

// ---- L601「The End」 ----
// 图书馆挂画（贴墙贴花）
export function libraryPaintings(c: DecorCtx) {
  const { ri, rf, ns, pickWall, wallDecal } = c
  for (let i = 0; i < ri(8, 12); i++) {
    const s = pickWall(); if (!s) break
    wallDecal(s, texPainting(ns()), rf(0.6, 1.0), rf(0.5, 0.9), rf(1.5, 2.3), 0.95)
  }
}
