// 环境反射探针（PMREM IBL）——realistic 光影模式的物理反射来源：
// 室外层：直接对该层程序化天空盒贴图做 PMREM（水面/地面反射的是真实天空）；
// 室内层：按层级 palette 生成 64×32 渐变 equirect（上=灯光色 / 中=墙色 / 下=地板色）再 PMREM。
import * as THREE from 'three'
import type { LevelDef } from '../types'
import { col } from './shared'

let pmrem: THREE.PMREMGenerator | null = null
const cache = new Map<string, THREE.Texture>()

function gradEnvTexture(def: LevelDef): THREE.Texture {
  const pal = def.palette
  const c = document.createElement('canvas')
  c.width = 64; c.height = 32
  const g = c.getContext('2d')!
  const top = col(pal.light).lerp(col(pal.wallTop), 0.4).getStyle()
  const mid = col(pal.wall).getStyle()
  const bot = col(pal.floor).multiplyScalar(0.6).getStyle()
  const grad = g.createLinearGradient(0, 0, 0, 32)
  grad.addColorStop(0, top); grad.addColorStop(0.5, mid); grad.addColorStop(1, bot)
  g.fillStyle = grad; g.fillRect(0, 0, 64, 32)
  const tex = new THREE.CanvasTexture(c)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 本层环境贴图（按 层级id+有无天空贴图 缓存；realistic 模式专用） */
export function envProbe(def: LevelDef, skyTex?: THREE.Texture | null): THREE.Texture {
  const key = `${def.id}:${skyTex ? 'sky' : 'pal'}`
  const hit = cache.get(key)
  if (hit) return hit
  if (!pmrem) {
    pmrem = new THREE.PMREMGenerator(new THREE.WebGLRenderer({ antialias: false }))
    pmrem.compileEquirectangularShader()
  }
  const src = skyTex ?? gradEnvTexture(def)
  const rt = pmrem.fromEquirectangular(src)
  if (!skyTex) src.dispose()
  cache.set(key, rt.texture)
  return rt.texture
}

/** 退回 classic / 关闭渲染器时释放全部探针 */
export function disposeEnvProbes() {
  for (const [, t] of cache) t.dispose()
  cache.clear()
  pmrem?.dispose()
  pmrem = null
}
