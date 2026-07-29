// 玩家完整低模（预览/捏人用；第一人称仍只显示手部，见 viewmodel.ts）
// 身高固定 ~1.75m（与碰撞体积一致，不可编辑）；手套/绝缘服装备后改变外观
import * as THREE from 'three'
import type { AvatarCfg } from '../avatar'

export interface EquipVisual {
  gloves?: boolean // 隔热手套：手部变黄
  suit?: boolean // 绝缘服：躯干/四肢变橡胶绿
  divemask?: boolean // 潜水面罩（头饰栏）：镜框 + 视窗玻璃 + 头带
}

export function buildPlayerModel(cfg: AvatarCfg, ev: EquipVisual = {}): THREE.Group {
  const g = new THREE.Group()
  const mat = (color: string) => new THREE.MeshLambertMaterial({ color })
  const bx = (w: number, h: number, d: number, color: string, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color))
    m.position.set(x, y, z)
    g.add(m)
    return m
  }
  const skin = cfg.skin
  const topC = ev.suit ? '#3a5a3a' : cfg.top
  const pantsC = ev.suit ? '#2e4a2e' : cfg.pants
  const handC = ev.gloves ? '#b89a2e' : skin
  const shoeC = '#26262a'

  // 腿（裤 + 鞋）
  bx(0.15, 0.72, 0.17, pantsC, -0.11, 0.42)
  bx(0.15, 0.72, 0.17, pantsC, 0.11, 0.42)
  bx(0.16, 0.08, 0.22, shoeC, -0.11, 0.04, 0.02)
  bx(0.16, 0.08, 0.22, shoeC, 0.11, 0.04, 0.02)
  // 躯干（上衣）
  bx(0.42, 0.58, 0.22, topC, 0, 1.06)
  // 手臂（袖 + 手）
  bx(0.11, 0.5, 0.13, topC, -0.28, 1.12)
  bx(0.11, 0.5, 0.13, topC, 0.28, 1.12)
  bx(0.09, 0.12, 0.11, handC, -0.28, 0.8)
  bx(0.09, 0.12, 0.11, handC, 0.28, 0.8)
  // 头
  bx(0.26, 0.26, 0.24, skin, 0, 1.5)
  // 眼睛（正面 +Z；潜水面罩会盖住）
  bx(0.035, 0.04, 0.012, '#1c1a18', -0.06, 1.52, 0.125)
  bx(0.035, 0.04, 0.012, '#1c1a18', 0.06, 1.52, 0.125)
  // 潜水面罩（头饰栏装备）：镜框 + 青色视窗玻璃 + 环绕头带
  if (ev.divemask) {
    bx(0.24, 0.11, 0.03, '#2a2d30', 0, 1.52, 0.13) // 镜框
    bx(0.19, 0.07, 0.012, '#7ac9d9', 0, 1.52, 0.148) // 视窗玻璃
    bx(0.02, 0.05, 0.26, '#2a2d30', -0.135, 1.53, 0) // 头带（左）
    bx(0.02, 0.05, 0.26, '#2a2d30', 0.135, 1.53, 0) // 头带（右）
    bx(0.27, 0.05, 0.02, '#2a2d30', 0, 1.53, -0.125) // 头带（后）
  }
  // 发型
  const hc = cfg.hairColor
  if (cfg.hair === 1) { // 短发：头顶 + 后脑
    bx(0.28, 0.09, 0.26, hc, 0, 1.665)
    bx(0.28, 0.16, 0.06, hc, 0, 1.56, -0.12)
  } else if (cfg.hair === 2) { // 寸头：薄顶
    bx(0.27, 0.04, 0.25, hc, 0, 1.645)
  } else if (cfg.hair === 3) { // 背头：加厚顶 + 侧背
    bx(0.29, 0.11, 0.27, hc, 0, 1.675, -0.02)
    bx(0.29, 0.22, 0.07, hc, 0, 1.55, -0.13)
    bx(0.05, 0.14, 0.2, hc, -0.14, 1.58, -0.04)
    bx(0.05, 0.14, 0.2, hc, 0.14, 1.58, -0.04)
  }
  return g
}
