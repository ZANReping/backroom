// 环境反射探针（PMREM IBL）——realistic 光影模式的物理反射来源：
// 室外层：直接对该层程序化天空盒贴图做 PMREM（水面/地面反射的是真实天空）；
// 室内层：按层级 palette 生成 64×32 渐变 equirect（上=灯光色 / 中=墙色 / 下=地板色）再 PMREM。
import * as THREE from 'three'
import type { LevelDef } from '../core/types'
import { col } from './shared'

let pmrem: THREE.PMREMGenerator | null = null
const cache = new Map<string, THREE.WebGLRenderTarget>()

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

function cityEnvTexture(sky:THREE.Texture):THREE.Texture {
  // The bitmap spans zenith -> horizon, not zenith -> nadir. Pack it into
  // the upper hemisphere; the lower half represents diffuse city ground.
  // Stretching sky over the whole sphere made indoor metal reflect blue
  // clouds from below and removed the warm/cool balance of the references.
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256
  const context=canvas.getContext('2d')!
  context.drawImage(sky.image as HTMLCanvasElement,0,0,512,128)
  const ground=context.createLinearGradient(0,128,0,256)
  ground.addColorStop(0,'#8e948d');ground.addColorStop(.25,'#6d7065');ground.addColorStop(1,'#42433d')
  context.fillStyle=ground;context.fillRect(0,128,512,128)
  const texture=new THREE.CanvasTexture(canvas)
  texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace
  return texture
}

/** 本层环境贴图（按 层级id+有无天空贴图 缓存；realistic 模式专用） */
export function envProbe(def: LevelDef, skyTex: THREE.Texture | null | undefined, renderer:THREE.WebGLRenderer): THREE.Texture {
  const key = `${def.id}:${skyTex ? 'sky' : 'pal'}`
  const hit = cache.get(key)
  if (hit) return hit.texture
  if (!pmrem) {
    // Render-target textures belong to their WebGL context. Use the game's renderer.
    pmrem = new THREE.PMREMGenerator(renderer)
    pmrem.compileEquirectangularShader()
  }
  const citySky=def.id===11&&!!skyTex&&!skyTex.userData.fullEquirect
  const src = citySky?cityEnvTexture(skyTex!):skyTex ?? gradEnvTexture(def)
  const rt = pmrem.fromEquirectangular(src)
  if (!skyTex||citySky) src.dispose()
  cache.set(key, rt)
  return rt.texture
}

/** 退回 classic / 关闭渲染器时释放全部探针 */
export function disposeEnvProbes() {
  for (const [, t] of cache) t.dispose()
  cache.clear()
  pmrem?.dispose()
  pmrem = null
}
