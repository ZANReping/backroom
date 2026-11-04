// 地面弹药盒（buildAmmoGroundMesh）的印刷纸盒与纸包弹的牛皮纸贴图（此前为纯色盒子 / 纯色纸卷）。
// 每种弹药一张 512×192 Canvas：上 160 px 为正/背面标签，下 32 px 为其余面的纯色纸板条；纹理按类型缓存共享。
import * as THREE from 'three'
import type { AmmoType } from '../content/firearms'

const LABEL: Record<AmmoType, { bg: string; ink: string; band: string; big: string; sub: string; cn: string }> = {
  shell_buck: { bg: '#8e2f22', ink: '#f6e7c8', band: '#5e1d14', big: '12 GA', sub: '00 BUCK · 9 PELLETS', cn: '鹿弹' },
  shell_bird: { bg: '#3f6236', ink: '#f2ecd2', band: '#28401f', big: '12 GA', sub: '#7½ BIRD SHOT', cn: '鸟弹' },
  shell_clump: { bg: '#c9a23a', ink: '#2a1e08', band: '#8a6a1c', big: '12 GA', sub: 'OBJECT 23 · SLUG', cn: '爆团弹' },
  cart_4440: { bg: '#4f6070', ink: '#eef0f0', band: '#2f3c48', big: '.44-40', sub: 'W.C.F. · CENTER FIRE', cn: '中央底火' },
  cart_4570: { bg: '#6a5440', ink: '#f3e6cc', band: '#45362a', big: '.45-70', sub: "GOV'T · 405 GR", cn: '步枪弹' },
  cart_paper: { bg: '#b49a6c', ink: '#2c2010', band: '#7d6644', big: '.69', sub: 'PAPER CARTRIDGES', cn: '纸包弹' },
}
const boxTex = new Map<AmmoType, THREE.CanvasTexture>()
export function ammoBoxTexture(type: AmmoType): THREE.CanvasTexture {
  const hit = boxTex.get(type); if (hit) return hit
  const L = LABEL[type], c = document.createElement('canvas'); c.width = 512; c.height = 192
  const x = c.getContext('2d')!
  x.fillStyle = L.bg; x.fillRect(0, 0, 512, 192)
  let s = type.length * 7919
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(0,0,0,${.03 + rnd() * .05})`; x.fillRect(rnd() * 512, rnd() * 192, 1 + rnd() * 3, 1) }
  x.fillStyle = L.band; x.fillRect(0, 0, 512, 22); x.fillRect(0, 138, 512, 22); x.fillRect(0, 160, 512, 32)
  x.fillStyle = L.ink; x.textBaseline = 'middle'
  x.font = 'bold 15px "Noto Sans SC","Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.fillText('鎏金兵械库特许 · GILDED ARMORY', 256, 12)
  x.textAlign = 'left'; x.font = 'bold 66px Georgia,"Times New Roman",serif'; x.fillText(L.big, 22, 74)
  x.font = 'bold 52px "Noto Sans SC","Microsoft YaHei",sans-serif'; x.textAlign = 'right'; x.fillText(L.cn, 492, 72)
  x.textAlign = 'center'; x.font = 'bold 22px Georgia,serif'; x.fillText(L.sub, 256, 120)
  x.fillText('· 20 ·', 256, 149)
  x.strokeStyle = L.ink; x.globalAlpha = .6; x.lineWidth = 3; x.strokeRect(8, 26, 496, 108); x.globalAlpha = 1
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  boxTex.set(type, t)
  return t
}
/** 盒体几何：正/背面（±Z）用标签区，其余面用底部纸板条。 */
export function ammoBoxGeometry(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.getAttribute('uv') as THREE.BufferAttribute
  // BoxGeometry 组顺序：+X -X +Y -Y +Z -Z，每组 4 个顶点
  for (let face = 0; face < 6; face++) for (let k = 0; k < 4; k++) {
    const i = face * 4 + k, u = uv.getX(i), v = uv.getY(i)
    if (face >= 4) uv.setXY(i, .01 + u * .98, 1 - (1 - v) * (158 / 192) - 1 / 192)
    else uv.setXY(i, .05 + u * .9, (4 + v * 24) / 192)
  }
  return g
}
let kraft: THREE.CanvasTexture | null = null
/** 纸包弹牛皮纸：纤维 + 斜向卷纸接缝（lathe UV：u 绕轴、v 沿弹长）。 */
export function kraftPaperTexture(): THREE.CanvasTexture {
  if (kraft) return kraft
  const c = document.createElement('canvas'); c.width = 128; c.height = 128
  const x = c.getContext('2d')!
  x.fillStyle = '#d2bf98'; x.fillRect(0, 0, 128, 128)
  let s = 4570
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296)
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '110,80,40' : '245,230,200'},${.08 + rnd() * .12})`; x.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 4, 1) }
  x.strokeStyle = 'rgba(90,64,30,.55)'; x.lineWidth = 2
  for (const o of [0, 64]) { x.beginPath(); x.moveTo(o, 128); x.lineTo(o + 64, 0); x.stroke() } // 卷纸接缝
  x.fillStyle = 'rgba(60,40,15,.25)'; x.fillRect(0, 0, 128, 10) // 扭结端的折痕阴影
  kraft = new THREE.CanvasTexture(c); kraft.colorSpace = THREE.SRGBColorSpace; kraft.wrapS = kraft.wrapT = THREE.RepeatWrapping
  return kraft
}
