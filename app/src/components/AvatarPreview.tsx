// 玩家模型 3D 预览（独立 three.js 小场景，慢速旋转；捏人编辑器与背包装备栏共用）
// v40：可选 npcId/npcDef——图鉴「人士」页按 NPC id 附加标志性配饰（与游戏内 renderer 同一 npcGear 通道）
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AvatarCfg } from '@/game/core/avatar'
import { buildPlayerModel } from '@/game/renderer/playerModel'
import { applyNpcGear } from '@/game/renderer/npcGear'
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
    const model = buildPlayerModel(JSON.parse(key) as AvatarCfg, { gloves, suit, cavingsuit, divemask, headlamp, nightvision })
    // NPC 档案：制服徽章（胸口小色块，同 renderer）+ 标志性配饰
    if (npcId) {
      if (npcDef?.faction === 'brc') {
        // BRC 黑影无脸——摘除全部面部件（与 renderer 同一 userData.face 摘除约定）
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
    let raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      model.rotation.y = t / 1800
      r.render(scene, cam)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      model.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose() })
      r.dispose()
    }
  }, [key, gloves, suit, cavingsuit, divemask, headlamp, nightvision, npcId, npcDef, size])
  return <canvas ref={ref} style={{ width: size, height: Math.round(size * 1.45), imageRendering: 'auto' }} />
}
