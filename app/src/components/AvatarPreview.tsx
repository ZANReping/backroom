// 玩家模型 3D 预览（独立 three.js 小场景，慢速旋转；捏人编辑器与背包装备栏共用）
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { AvatarCfg } from '@/game/avatar'
import { buildPlayerModel } from '@/game/renderer/playerModel'

interface Props {
  avatar: AvatarCfg
  gloves?: boolean
  suit?: boolean
  divemask?: boolean // 头饰栏装备潜水面罩
  size?: number
}

export default function AvatarPreview({ avatar, gloves, suit, divemask, size = 150 }: Props) {
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
    const model = buildPlayerModel(JSON.parse(key) as AvatarCfg, { gloves, suit, divemask })
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
  }, [key, gloves, suit, divemask, size])
  return <canvas ref={ref} style={{ width: size, height: Math.round(size * 1.45), imageRendering: 'auto' }} />
}
