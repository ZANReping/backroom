import * as THREE from 'three'
import { pbrSet, pbrMaterial, rng } from './pbrCanvas' // [l5items v2]
/**
 * L5.1 赌场奖品的专属地面模型（此前走通用 fallback 方块）：
 * - silencejuice 寂静汁液（Object 17）：车削玻璃瓶 + 无色液体 + 金色「头奖」封条 + 软木塞
 * - mysteryegg 神秘蛋：车削蛋形 + 暖褐斑点（顶点色）
 * [l5items v2] 改为 PBR 程序贴图（见下）。
 */
export const CASINO_ITEM_TYPES = ['silencejuice', 'mysteryegg'] as const
export const isCasinoItemType = (t: string) => (CASINO_ITEM_TYPES as readonly string[]).includes(t)


// [l5items v2] 细化：瓶身 24 段车削（肩部 / 瓶颈 / 唇口）+ 玻璃厚度（内层液体独立车削，弯月面）+ 金色「头奖」纸封条（PBR 贴图：
// 烫金字 + 纸纹法线）+ 软木塞（木纹法线）外裹金箔；神秘蛋 28 段车削 + 斑点颜色 / 法线 / 粗糙度贴图（不再是顶点色噪声）。
function labelSet() {
  return pbrSet('casino-juice-label', { size: 256, normalStrength: 1.5,
    color: (x, s) => { const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#e6c25a'); g.addColorStop(.5, '#c9992e'); g.addColorStop(1, '#a87a1c'); x.fillStyle = g; x.fillRect(0, 0, s, s)
      x.fillStyle = '#7a1018'; x.fillRect(0, s * .38, s, s * .24); x.fillStyle = '#f4e2a8'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold ${s * .14}px "Noto Serif SC",serif`
      for (const u of [.125, .375, .625, .875]) { x.save(); x.translate(u * s, s * .5); x.scale(.42, 1); x.fillText('头 奖', 0, 0); x.restore() }
      x.strokeStyle = 'rgba(80,50,10,.7)'; x.lineWidth = 3; x.strokeRect(-4, s * .1, s + 8, s * .8) },
    height: (x, s) => { const R = rng(3); x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); for (let i = 0; i < 3000; i++) { x.fillStyle = R() < .5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.12)'; x.fillRect(R() * s, R() * s, 2, 1) } x.strokeStyle = '#000'; x.lineWidth = 3; x.strokeRect(-4, s * .1, s + 8, s * .8) },
    rough: (x, s) => { x.fillStyle = '#505050'; x.fillRect(0, 0, s, s); x.fillStyle = '#a0a0a0'; x.fillRect(0, s * .38, s, s * .24) } })
}
function corkSet() {
  return pbrSet('casino-cork', { size: 128, normalStrength: 2,
    color: (x, s) => { const R = rng(8); x.fillStyle = '#a07a4e'; x.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${R() < .5 ? '60,36,16' : '210,170,120'},${R() * .5})`; x.beginPath(); x.arc(R() * s, R() * s, R() * 2.5, 0, 7); x.fill() } x.fillStyle = '#d8b048'; x.fillRect(0, 0, s, s * .35) },
    height: (x, s) => { const R = rng(9); x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); for (let i = 0; i < 900; i++) { x.fillStyle = R() < .6 ? '#303030' : '#c0c0c0'; x.beginPath(); x.arc(R() * s, R() * s, R() * 2.5, 0, 7); x.fill() } } })
}
function eggSet() {
  return pbrSet('casino-egg', { size: 256, normalStrength: 1.2,
    color: (x, s) => { const R = rng(21); const g = x.createLinearGradient(0, 0, 0, s); g.addColorStop(0, '#efe4cc'); g.addColorStop(1, '#ddcaa6'); x.fillStyle = g; x.fillRect(0, 0, s, s)
      for (let i = 0; i < 160; i++) { const r = 1.5 + R() * R() * 9; x.fillStyle = `rgba(${110 + R() * 40},${70 + R() * 20},${40 + R() * 10},${.5 + R() * .4})`; x.beginPath(); x.ellipse(R() * s, R() * s, r * 1.6, r, R() * 3, 0, 7); x.fill() }
      for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(120,90,60,${R() * .06})`; x.fillRect(R() * s, R() * s, 1, 1) } },
    height: (x, s) => { const R = rng(22); x.fillStyle = '#808080'; x.fillRect(0, 0, s, s); for (let i = 0; i < 4000; i++) { x.fillStyle = R() < .5 ? 'rgba(0,0,0,.1)' : 'rgba(255,255,255,.1)'; x.beginPath(); x.arc(R() * s, R() * s, .5 + R(), 0, 7); x.fill() } },
    rough: (x, s) => { x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, s, s) } })
}
function buildSilenceJuice() {
  const g = new THREE.Group()
  const prof: [number, number][] = [[0, .002], [.03, 0], [.036, .003], [.038, .012], [.038, .1], [.036, .112], [.026, .128], [.016, .142], [.0135, .152], [.0135, .168], [.0155, .171], [.0155, .177], [.012, .178]]
  const glassGeo = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 28)
  const glass = new THREE.MeshStandardMaterial({ color: '#d6e6ea', transparent: true, opacity: .42, roughness: .06, metalness: .05, envMapIntensity: 1.2 })
  g.add(new THREE.Mesh(glassGeo, glass))
  // 液体：内层车削（玻璃厚 2 mm）+ 顶面弯月面
  const liq: [number, number][] = [[0, .004], [.034, .005], [.036, .014], [.036, .098], [.0345, .104], [0, .1035]]
  g.add(new THREE.Mesh(new THREE.LatheGeometry(liq.map(([r, y]) => new THREE.Vector2(r, y)), 24), new THREE.MeshStandardMaterial({ color: '#f2f8f8', transparent: true, opacity: .3, roughness: .02 })))
  // 封条（圆柱侧面略大于瓶身，开口两端）
  const label = new THREE.Mesh(new THREE.CylinderGeometry(.0388, .0388, .05, 28, 1, true), pbrMaterial(labelSet(), .55, .35))
  label.position.y = .06; g.add(label)
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(.0125, .0115, .024, 14), pbrMaterial(corkSet(), .85, 0)); cork.position.y = .184; g.add(cork)
  const foil = new THREE.Mesh(new THREE.CylinderGeometry(.0165, .016, .014, 18), pbrMaterial(labelSet(), .3, .9)); foil.position.y = .174; g.add(foil)
  g.rotation.z = Math.PI / 2; g.position.set(.088, .038, 0) // 侧躺
  const root = new THREE.Group(); root.add(g); return root
}

function buildMysteryEgg() {
  const prof: THREE.Vector2[] = []
  for (let i = 0; i <= 22; i++) { const t = i / 22, a = Math.PI * t, y = (1 - Math.cos(a)) * .05; prof.push(new THREE.Vector2(Math.max(1e-4, Math.sin(a) * .036 * (1 - .18 * t)), y)) }
  const geo = new THREE.LatheGeometry(prof, 28)
  const egg = new THREE.Mesh(geo, pbrMaterial(eggSet(), .55, 0))
  egg.rotation.z = 1.25; egg.position.set(.045, .034, 0) // 斜卧
  const root = new THREE.Group(); root.add(egg); return root
}

export function buildCasinoItemMesh(type: string): THREE.Group {
  return type === 'silencejuice' ? buildSilenceJuice() : buildMysteryEgg()
}
