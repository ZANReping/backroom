// NPC 静态肖像（共享单个 WebGLRenderer 渲染成 dataURL，以 <img> 展示）——
// 替代「每卡一个 AvatarPreview 实时上下文」：遇见的 NPC 一多就爆浏览器 WebGL 上下文上限，
// 主游戏画面上下文被挤掉（视角变纯色、无法行动）；配饰与游戏内走同一 npcGear 通道。
import * as THREE from 'three'
import type { AvatarCfg } from '@/game/avatar'
import { buildPlayerModel } from '@/game/renderer/playerModel'
import { applyNpcGear } from '@/game/renderer/npcGear'
import type { NpcDef } from '@/game/npcs'

let renderer: THREE.WebGLRenderer | null = null
const cache = new Map<string, string>()

export function npcPortrait(cfg: AvatarCfg, npcId?: string, npcDef?: NpcDef, size = 96): string {
  const key = `${JSON.stringify(cfg)}|${npcId ?? ''}|${npcDef?.uniform?.badge ?? ''}|${npcDef?.workLoop ?? ''}|${size}`
  const hit = cache.get(key)
  if (hit) return hit
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
    renderer.outputColorSpace = THREE.SRGBColorSpace
  }
  const w = size, h = Math.round(size * 1.45)
  renderer.setSize(w, h, false)
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(36, w / h, 0.1, 20)
  cam.position.set(0, 1.05, 2.7)
  cam.lookAt(0, 0.88, 0)
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const keyL = new THREE.DirectionalLight(0xfff2d0, 1.3)
  keyL.position.set(1.6, 2.6, 2.2)
  scene.add(keyL)
  const rim = new THREE.DirectionalLight(0x9ab0d0, 0.55)
  rim.position.set(-2, 1.4, -1.6)
  scene.add(rim)
  const model = buildPlayerModel(cfg, {})
  // NPC 档案：BRC 黑影摘脸 / 制服徽章 + 标志性配饰（与游戏内 renderer 同一约定）
  if (npcId) {
    if (npcDef?.faction === 'brc') {
      const hd = (model.userData.parts as Record<string, THREE.Object3D>).head
      const faceParts: THREE.Object3D[] = []
      hd?.traverse((o) => { if (o.userData.face) faceParts.push(o) })
      for (const f of faceParts) f.parent?.remove(f)
    } else if (npcDef?.uniform?.badge) {
      const badge = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.09, 0.015),
        new THREE.MeshLambertMaterial({ color: npcDef.uniform.badge }),
      )
      badge.position.set(-0.1, 1.2, 0.125)
      model.add(badge)
    }
    applyNpcGear(model.userData.parts as Record<string, THREE.Object3D>, npcId, npcDef)
  }
  scene.add(model)
  model.rotation.y = 0.45 // 微侧——帽子/手持物等配饰更可见
  renderer.render(scene, cam)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(model)
  model.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
  cache.set(key, url)
  return url
}
