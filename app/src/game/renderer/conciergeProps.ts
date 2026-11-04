// [concierge] 看门人场景件：前台柜台（桃花心木 + 黄铜）+ 钥匙墙（附图背景：一排排小格，每格挂一把钥匙）+ 台式电话；
// 送菜升降梯（墙里的小木厢，双开拉门 + 拉绳滑轮）。都按 +Z 为正面（玩家一侧），地面 y=0。
import * as THREE from 'three'
import { litMaterial } from './shared'

const P = {
  wood: litMaterial({ color: '#4a2416', roughness: 0.55 }),
  woodDark: litMaterial({ color: '#2a130c', roughness: 0.6 }),
  woodHi: litMaterial({ color: '#6a3520', roughness: 0.45 }),
  brass: litMaterial({ color: '#b39350', roughness: 0.3, metalness: 0.75 }),
  marble: litMaterial({ color: '#d8cfc0', roughness: 0.25 }),
  green: litMaterial({ color: '#1f3a2c', roughness: 0.8 }),
  cream: litMaterial({ color: '#d9d3c2', roughness: 0.5 }),
  black: litMaterial({ color: '#121112', roughness: 0.4 }),
  keyTag: litMaterial({ color: '#c3c5ca', roughness: 0.3, metalness: 0.6 }),
  rope: litMaterial({ color: '#a88a5a', roughness: 1 }),
  shaft: litMaterial({ color: '#0b0908', roughness: 1 }),
}
function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o
}

/** 前台 + 钥匙墙 + 台式电话。柜台宽 2.4 m，钥匙墙在柜台后 1.0 m。userData.desk: { phone, standZ } */
export function buildConciergeDeskMesh(): THREE.Group {
  const g = new THREE.Group(); g.name = 'conciergeDesk'
  // 柜台：护板 + 黄铜踢脚 + 大理石台面 + 竖向镶板
  const W = 2.4, H = 1.1, D = 0.6
  box(W, H - 0.05, D, P.wood, 0, (H - 0.05) / 2, 0, g)
  box(W + 0.1, 0.05, D + 0.12, P.marble, 0, H - 0.025, 0.02, g)
  box(W + 0.02, 0.06, D + 0.02, P.brass, 0, 0.03, 0, g)
  for (let i = 0; i < 6; i++) { const x = -W / 2 + 0.2 + i * (W - 0.4) / 5; box(0.3, 0.7, 0.02, P.woodHi, x, 0.55, D / 2 + 0.006, g); box(0.24, 0.62, 0.012, P.woodDark, x, 0.55, D / 2 + 0.018, g) }
  // 服务铃
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), P.brass); bell.position.set(0.7, H, 0.15); g.add(bell)
  // 台式电话（话筒摘下时只剩机座）
  const phone = new THREE.Group(); phone.position.set(-0.6, H, 0.05); g.add(phone)
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.07, 20), P.cream); base.position.y = 0.035; phone.add(base)
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20), P.black); dial.position.set(0, 0.06, 0.06); dial.rotation.x = 0.6; phone.add(dial)
  for (const s of [-1, 1]) box(0.02, 0.03, 0.03, P.cream, s * 0.07, 0.085, 0, phone)
  // 钥匙墙：深色木格架，6 行 × 14 列，每格一把钥匙 + 椭圆金属牌（少数格空着——客人没还）
  const wall = new THREE.Group(); wall.position.set(0, 0, -1.0); g.add(wall)
  const cols = 14, rows = 6, cw = 0.19, rh = 0.22, x0 = -((cols - 1) * cw) / 2, y0 = 1.15
  box(cols * cw + 0.12, rows * rh + 0.2, 0.05, P.woodDark, 0, y0 + ((rows - 1) * rh) / 2, -0.04, wall)
  const tagG = new THREE.CylinderGeometry(1, 1, 0.003, 14).scale(0.022, 1, 0.013).rotateX(Math.PI / 2)
  const keyG = new THREE.BoxGeometry(0.008, 0.05, 0.003)
  const tags: THREE.Matrix4[] = [], keys: THREE.Matrix4[] = []
  for (let r = 0; r < rows; r++) {
    box(cols * cw + 0.06, 0.018, 0.12, P.wood, 0, y0 + r * rh - 0.1, 0.02, wall)
    box(cols * cw + 0.06, 0.008, 0.01, P.brass, 0, y0 + r * rh - 0.09, 0.083, wall)
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * cw, y = y0 + r * rh
      if (((r * 31 + c * 17) % 11) === 3) continue // 空格
      tags.push(new THREE.Matrix4().makeRotationZ(((r * 7 + c * 3) % 5 - 2) * 0.06).setPosition(x, y + 0.02, 0.06))
      keys.push(new THREE.Matrix4().setPosition(x - 0.012, y - 0.02, 0.058))
    }
  }
  for (let c = 0; c <= cols; c++) box(0.014, rows * rh, 0.11, P.wood, x0 - cw / 2 + c * cw, y0 + ((rows - 1) * rh) / 2 - 0.0, 0.015, wall)
  const it = new THREE.InstancedMesh(tagG, P.keyTag, tags.length); tags.forEach((m, i) => it.setMatrixAt(i, m)); wall.add(it)
  const ik = new THREE.InstancedMesh(keyG, P.brass, keys.length); keys.forEach((m, i) => ik.setMatrixAt(i, m)); wall.add(ik)
  // 墙上挂一块小铜牌
  box(0.5, 0.09, 0.012, P.brass, 0, y0 + rows * rh + 0.02, 0.0, wall)
  g.userData.desk = { phone, standZ: -0.5, width: W }
  return g
}

/** 送菜升降梯：嵌墙木框 + 双开上下拉门 + 内部小厢（比成年人略大）+ 侧边拉绳。userData.dumbwaiter: { doorU, doorL, car, rope } */
export function buildDumbwaiterMesh(): THREE.Group {
  const g = new THREE.Group(); g.name = 'dumbwaiter'
  const W = 0.95, H = 0.95, y0 = 0.45
  // 墙面一块（示意）
  box(1.8, 2.6, 0.08, P.green, 0, 1.3, -0.04, g)
  // 井道黑洞
  box(W, H, 0.02, P.shaft, 0, y0 + H / 2, -0.03, g)
  // 小厢：后背、底板、侧板
  const car = new THREE.Group(); car.position.set(0, y0, -0.55); g.add(car)
  box(W - 0.06, 0.03, 1.0, P.wood, 0, 0.015, 0, car)
  box(W - 0.06, H - 0.06, 0.03, P.woodDark, 0, H / 2, -0.5, car)
  for (const s of [-1, 1]) box(0.03, H - 0.06, 1.0, P.wood, s * (W / 2 - 0.045), H / 2, 0, car)
  box(W - 0.06, 0.03, 1.0, P.woodDark, 0, H - 0.05, 0, car)
  // 框
  for (const s of [-1, 1]) box(0.09, H + 0.18, 0.06, P.woodHi, s * (W / 2 + 0.045), y0 + H / 2, 0.0, g)
  box(W + 0.18, 0.09, 0.06, P.woodHi, 0, y0 + H + 0.045, 0.0, g); box(W + 0.24, 0.05, 0.12, P.woodHi, 0, y0 - 0.025, 0.02, g)
  // 上下拉门（开：上门上移、下门下移）
  const doorU = new THREE.Group(); doorU.position.set(0, y0 + H / 2, 0.0); g.add(doorU)
  const doorL = new THREE.Group(); doorL.position.set(0, y0 + H / 2, 0.0); g.add(doorL)
  box(W, H / 2, 0.03, P.wood, 0, H / 4, 0, doorU); box(W - 0.12, H / 2 - 0.12, 0.012, P.woodDark, 0, H / 4, 0.018, doorU)
  box(W, H / 2, 0.03, P.wood, 0, -H / 4, 0, doorL); box(W - 0.12, H / 2 - 0.12, 0.012, P.woodDark, 0, -H / 4, 0.018, doorL)
  box(0.16, 0.025, 0.03, P.brass, 0, -0.04, 0.03, doorL)
  // 楼层小铜牌「13」——不写字，只做牌
  box(0.14, 0.06, 0.01, P.brass, 0, y0 + H + 0.15, 0.0, g)
  // 拉绳：从框顶滑轮垂到地，右侧
  const pul = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 8, 18), P.brass); pul.position.set(W / 2 + 0.2, y0 + H + 0.25, 0.06); g.add(pul)
  const rope = new THREE.Group(); rope.position.copy(pul.position); g.add(rope)
  for (const dx of [-0.05, 0.05]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, y0 + H + 0.2, 6), P.rope); r.position.set(dx, -(y0 + H + 0.2) / 2, 0); rope.add(r) }
  g.userData.dumbwaiter = { doorU, doorL, car, rope, open: (k: number) => { doorU.position.y = y0 + H / 2 + k * H * 0.5; doorL.position.y = y0 + H / 2 - k * H * 0.5 } }
  return g
}
