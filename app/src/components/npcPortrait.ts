// NPC 静态肖像（共享单个 WebGLRenderer 渲染成 dataURL，以 <img> 展示）——
// 替代「每卡一个 AvatarPreview 实时上下文」：遇见的 NPC 一多就爆浏览器 WebGL 上下文上限，
// 主游戏画面上下文被挤掉（视角变纯色、无法行动）；配饰与游戏内走同一 npcGear 通道。
import * as THREE from 'three'
import type { AvatarCfg } from '@/game/core/avatar'
import { buildCharacterModel } from '@/game/renderer/characterModel'
import { retroModelReady } from '@/game/renderer/retroAvatar'
import { disposeCharacterModel } from '@/game/renderer/retroResources'
import { buildNpcEntityPreview } from '@/game/renderer/npcEntityPreview'
import type { NpcDef } from '@/game/content/npcs'

let renderer: THREE.WebGLRenderer | null = null
const cache = new Map<string, string>()

export function npcPortrait(cfg: AvatarCfg, npcId?: string, npcDef?: NpcDef, size = 96, framing: 'full' | 'identity' = 'full'): string {
  const key = `${JSON.stringify(cfg)}|${npcId ?? ''}|${npcDef?.uniform?.badge ?? ''}|${npcDef?.workLoop ?? ''}|${size}|${framing}`
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
  if (framing === 'identity') {
    // 玩家头顶约 1.75m；收紧画幅至头肩和胸口，保持正面证件照构图。
    cam.position.set(0, 1.48, 1.72)
    cam.lookAt(0, 1.26, 0)
  } else {
    cam.position.set(0, 1.05, 2.7)
    cam.lookAt(0, 0.88, 0)
  }
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const keyL = new THREE.DirectionalLight(0xfff2d0, 1.3)
  keyL.position.set(1.6, 2.6, 2.2)
  scene.add(keyL)
  const rim = new THREE.DirectionalLight(0x9ab0d0, 0.55)
  rim.position.set(-2, 1.4, -1.6)
  scene.add(rim)
  const entityPreview = buildNpcEntityPreview(npcId)
  // v68：复古人物模型（与游戏内同一工厂：专属/通用形象、BRC 无脸、徽章、配饰换算）
  const model = entityPreview ?? buildCharacterModel(cfg, { npcId, npcDef })
  ;(model.userData.retroUpdate as ((t: number) => void) | undefined)?.(0)
  scene.add(model)
  model.rotation.y = framing === 'identity' ? 0 : 0.45 // 证件照正面；常规档案微侧以展示配饰
  renderer.render(scene, cam)
  const url = renderer.domElement.toDataURL('image/png')
  scene.remove(model)
  disposeCharacterModel(model)
  // 贴图池还没到位（启动后贴图仍在下载）：这一帧不缓存，下次调用重新渲染
  if (retroModelReady(model)) {
    if (cache.size >= 96) cache.delete(cache.keys().next().value!)
    cache.set(key, url)
  }
  return url
}
