// 微光向导（Entity 35）重制模型：依据中文维基 entity-35 与 ZAN 提供的附图（夜空里两颗带柔光晕的小光点）。
// 它是直径 5–15cm 的纯光球 / 奇点，没有实体结构：一个近乎白色的极亮内核 + 两层加色光晕（内晕偏白、外晕带颜色）
// + 外圈一道很淡的色散环（附图右侧那颗边缘泛青的效果）。颜色可变，用来和流浪者「交流」：
//   guide 青白——跟我走；warn 粉白——停下，附近有危险；idle 暖白——闲逛；nest 淡金——在氙弹珠巢旁。
// 可穿墙（不写深度、不参与遮挡），渲染顺序靠后。原点在光球中心。
import * as THREE from 'three'
import { canvasTex } from './houndMesh'

export type LightguideMood = 'idle' | 'guide' | 'warn' | 'nest'
export const LIGHTGUIDE_COLORS: Record<LightguideMood, { core: string; halo: string; ring: string; label: string }> = {
  idle: { core: '#fffaf0', halo: '#ffe9c8', ring: '#c8d8ff', label: '暖白：闲逛' },
  guide: { core: '#f4ffff', halo: '#9ff2ff', ring: '#7fd8ff', label: '青白：跟我走' },
  warn: { core: '#fff4fa', halo: '#ffb0d8', ring: '#ff8ac0', label: '粉白：停下，有危险' },
  nest: { core: '#fffbe8', halo: '#ffe08a', ring: '#ffd060', label: '淡金：守着氙弹珠巢' },
}
let TEX: { soft: THREE.Texture | null; ring: THREE.Texture | null } | null = null
function textures() {
  if (TEX) return TEX
  const soft = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.32)'); g.addColorStop(0.7, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g; c.fillRect(0, 0, 128, 128)
  }, false)
  // 色散环：半径 0.7 处一道柔边亮环
  const ring = canvasTex(128, 128, (c) => {
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64)
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.55)'); g.addColorStop(0.82, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(255,255,255,0)')
    c.fillStyle = g; c.fillRect(0, 0, 128, 128)
  }, false)
  for(const t of [soft,ring])if(t)t.userData.entityShared=true
  TEX = { soft, ring }
  return TEX
}
const sprite = (map: THREE.Texture | null, color: string, size: number, opacity: number) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }))
  s.geometry=s.geometry.clone() // Each instance owns its disposable sprite buffer.
  s.scale.setScalar(size); s.renderOrder = 10; return s
}
export interface LightguideRig { core: THREE.Mesh; inner: THREE.Sprite; outer: THREE.Sprite; ring: THREE.Sprite; light: THREE.PointLight | null; size: number; mood: LightguideMood }
/** size：光球直径（米，0.05–0.15）；lights：挂实时点光源照亮周围 */
export function buildLightguideMesh(size = 0.1, mood: LightguideMood = 'idle', o: { lights?: boolean } = {}): THREE.Group {
  const grp = new THREE.Group(); grp.userData.entityType = 'lightguide'
  const t = textures(), c = LIGHTGUIDE_COLORS[mood]
  const core = new THREE.Mesh(new THREE.SphereGeometry(size * 0.18, 12, 10), new THREE.MeshBasicMaterial({ color: c.core, depthTest: false, transparent: true })); core.renderOrder = 11
  const inner = sprite(t.soft, c.core, size * 1.1, 1)
  const outer = sprite(t.soft, c.halo, size * 3.4, 0.55)
  const ring = sprite(t.ring, c.ring, size * 1.6, 0.5)
  grp.add(outer, ring, inner, core)
  let light: THREE.PointLight | null = null
  if (o.lights) { light = new THREE.PointLight(c.halo, 0.9 + size * 6, 3 + size * 20, 1.8); grp.add(light) }
  grp.userData.lightguideRig = { core, inner, outer, ring, light, size, mood } as LightguideRig
  return grp
}
/** 切换颜色（阶段 2 做渐变过渡）；pulse 0–1 亮度起伏 */
export function setLightguideMood(grp: THREE.Group, mood: LightguideMood, pulse = 0) {
  const r = grp.userData.lightguideRig as LightguideRig | undefined
  if (!r) return
  const c = LIGHTGUIDE_COLORS[mood]; r.mood = mood
  ;(r.core.material as THREE.MeshBasicMaterial).color.set(c.core)
  r.inner.material.color.set(c.core); r.outer.material.color.set(c.halo); r.ring.material.color.set(c.ring)
  const k = 1 + pulse * 0.35
  r.outer.scale.setScalar(r.size * 3.4 * k); r.inner.scale.setScalar(r.size * 1.1 * (1 + pulse * 0.15))
  if (r.light) { r.light.color.set(c.halo); r.light.intensity = (0.9 + r.size * 6) * k }
}
