// [jazz] 爵士脑（Entity 197）物品的专用低模：
//   habanero 哈瓦那辣椒酱：jazzProps.buildHotSauce（细颈玻璃瓶 + 橙红酱 + HABANERO 标签 + 白色滴嘴盖）+ 瓶颈上缠的一圈乐谱纸（铅笔字「减肥用」）
// 规范同 chefItemModels：正面朝 +Z、单位 m；地面展示放大（k）。
import * as THREE from 'three'
import { litMaterial } from './shared'
import { buildHotSauce } from './jazzProps'

export const JAZZ_ITEM_TYPES = ['habanero'] as const
export type JazzItemType = typeof JAZZ_ITEM_TYPES[number]
export const isJazzItemType = (t: string): t is JazzItemType => (JAZZ_ITEM_TYPES as readonly string[]).includes(t)

let _band: THREE.Texture | null = null
/** 缠在瓶颈上的乐谱纸条：五线谱 + 几个音符 + 铅笔「减肥用」 */
function bandTex(): THREE.Texture {
  if (_band) return _band
  const c = document.createElement('canvas') as HTMLCanvasElement; c.width = 256; c.height = 48
  const x = c.getContext('2d') as CanvasRenderingContext2D
  x.fillStyle = '#efe6cc'; x.fillRect(0, 0, 256, 48)
  x.strokeStyle = 'rgba(40,30,20,.7)'; x.lineWidth = 1
  for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(0, 8 + i * 5); x.lineTo(256, 8 + i * 5); x.stroke() }
  x.fillStyle = '#1e1a16'
  for (const [nx, ny] of [[20, 18], [44, 13], [70, 23], [96, 15], [150, 20], [176, 10]]) { x.beginPath(); x.ellipse(nx, ny, 3.4, 2.4, -0.4, 0, Math.PI * 2); x.fill(); x.fillRect(nx + 2.6, ny - 14, 1.2, 14) }
  x.fillStyle = 'rgba(60,60,70,.85)'; x.font = '15px "KaiTi","STKaiti","Noto Serif SC",sans-serif'; x.fillText('减肥用', 196, 44)
  _band = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement); _band.colorSpace = THREE.SRGBColorSpace
  return _band
}
export function buildJazzItemMesh(type: JazzItemType, pose: 'ground' | 'upright' = 'ground'): THREE.Group {
  const g = new THREE.Group(); g.name = `jazzItem_${type}`
  const b = buildHotSauce(); g.add(b)
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0118, 0.0118, 0.012, 20, 1, true), litMaterial({ color: '#ffffff', map: bandTex(), roughness: 0.9, side: THREE.DoubleSide }))
  ring.name = 'scoreBand'; ring.position.y = 0.137; g.add(ring)
  if (pose === 'ground') { g.scale.setScalar(2.2); g.rotation.z = 0 }
  return g
}
