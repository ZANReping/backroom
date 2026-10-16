// 玩家模型 3D 预览（独立 three.js 小场景，慢速旋转；捏人编辑器与背包装备栏共用）
// v40：可选 npcId/npcDef——图鉴「人士」页按 NPC id 附加标志性配饰（与游戏内 renderer 同一 npcGear 通道）
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AvatarCfg } from '@/game/core/avatar'
import { buildCharacterModel } from '@/game/renderer/characterModel'
import { disposeCharacterModel } from '@/game/renderer/retroResources'
import { buildNpcEntityPreview } from '@/game/renderer/npcEntityPreview'
import type { NpcDef } from '@/game/content/npcs'

interface Props {
  avatar: AvatarCfg
  gloves?: boolean
  suit?: boolean
  cavingsuit?: boolean // 身体栏装备保温服（与绝缘服互斥）
  divemask?: boolean // 头饰栏装备潜水面罩
  headlamp?: boolean // 头饰栏装备头灯
  nightvision?: boolean // 头饰栏装备夜视眼镜
  npcId?: string // NPC 档案：按 id 附加标志性配饰（npcGear.ts）
  npcDef?: NpcDef // NPC 定义（BRC 级别徽章色/工作循环工具用）
  size?: number
}

export default function AvatarPreview({ avatar, gloves, suit, cavingsuit, divemask, headlamp, nightvision, npcId, npcDef, size = 150 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const state = useRef<{ scene: THREE.Scene; model: THREE.Group | null } | null>(null)
  const key = JSON.stringify(avatar)
  useEffect(() => {
    const canvas = ref.current!
    const w = size, h = Math.round(size * 1.45)
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    r.setSize(w, h, false)
    r.outputColorSpace = THREE.SRGBColorSpace
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
    const current = { scene, model: null as THREE.Group | null }
    state.current = current
    let raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      const model = current.model
      if (model) { model.rotation.y = t / 1800; model.userData.retroUpdate?.(t / 1000) }
      r.render(scene, cam)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      if (current.model) { scene.remove(current.model); disposeCharacterModel(current.model); current.model = null }
      state.current = null
      r.dispose()
      r.forceContextLoss()
    }
  }, [size])
  useEffect(() => {
    const current = state.current
    if (!current) return
    const model = buildNpcEntityPreview(npcId) ?? buildCharacterModel(JSON.parse(key) as AvatarCfg, { ev: { gloves, suit, cavingsuit, divemask, headlamp, nightvision }, npcId, npcDef })
    current.model = model; current.scene.add(model)
    return () => {
      if (current.model !== model) return
      current.scene.remove(model); disposeCharacterModel(model); current.model = null
    }
  }, [key, gloves, suit, cavingsuit, divemask, headlamp, nightvision, npcId, npcDef, size])
  return <canvas ref={ref} style={{ width: size, height: Math.round(size * 1.45), imageRendering: 'auto' }} />
}
