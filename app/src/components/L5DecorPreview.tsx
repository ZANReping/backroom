import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildL5Registered } from '@/game/renderer/l5Meshes'
import { isL5DecorKind } from '@/game/content/l5Decor'
import type { StructEntry } from '@/game/design/types'
import type { Structure } from '@/game/core/types'

export default function L5DecorPreview({ structure }: { structure: StructEntry }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const active = isL5DecorKind(structure.kind)
  useEffect(() => {
    if (!ref.current || !active) return
    const renderer = new THREE.WebGLRenderer({ canvas: ref.current, antialias: true, alpha: true })
    renderer.setSize(300, 190, false)
    const scene = new THREE.Scene()
    const model = buildL5Registered({ ...structure, x: 0, y: 0, data: { ...structure.data, z: 0, deg: structure.deg ?? 0, l5: 1 } } as Structure)
    scene.add(model, new THREE.HemisphereLight(0xfff4dd, 0x44352c, 2))
    const sun = new THREE.DirectionalLight(0xffe3bd, 2)
    sun.position.set(4, 9, 5)
    scene.add(sun)
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    const size = Math.max(.5, box.getSize(new THREE.Vector3()).length())
    const camera = new THREE.PerspectiveCamera(45, 300 / 190, .01, Math.max(100, size * 20))
    camera.position.copy(center).add(new THREE.Vector3(size * .85, size * .65, size))
    camera.lookAt(center)
    const controls = new OrbitControls(camera, ref.current)
    controls.target.copy(center)
    controls.update()
    let raf = 0
    // TextureLoader completes asynchronously; keep the visible preview refreshed.
    let last=0
    const draw = (now:number) => { if(now-last>33){renderer.render(scene,camera);last=now}raf=requestAnimationFrame(draw) }
    raf=requestAnimationFrame(draw)
    return () => {
      controls.dispose()
      if (raf) cancelAnimationFrame(raf)
      const geometries = new Set<THREE.BufferGeometry>()
      model.traverse((o: THREE.Object3D) => { if (o instanceof THREE.Mesh) geometries.add(o.geometry) })
      // L5 materials and textures are shared by world batches; only preview geometry is owned here.
      geometries.forEach(g => g.dispose())
      renderer.dispose()
    }
  }, [structure, active])
  return active ? <figure className="my-2"><canvas ref={ref} aria-label="L5 注册装饰三维预览" style={{ width: '100%', height: 190, touchAction: 'none' }} /><figcaption className="text-xs">拖动旋转视角 · 滚轮缩放</figcaption></figure> : null
}
