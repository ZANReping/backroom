// [thing] 海床上被七层之物用焦油拖出来的字（结构 'tarwriting'，data.text / data.rot / data.fresh）。
// 一张贴地的平面：画布上用粗笔刷沿笔画拖出黑色焦油（边缘带拖痕与滴溅），alphaTest 抠出字形；
// 材质低粗糙度、深黑，手电扫过时有油亮的高光。新写的（fresh）更湿亮、边缘还在往外渗。
import * as THREE from 'three'
import { floorHeight, type GameMap } from '../world/mapgen'
import { litMaterial } from './shared'

const cache = new Map<string, THREE.CanvasTexture>()
function tarTexture(text: string, fresh: boolean): THREE.CanvasTexture {
  const key = `${text}|${fresh ? 1 : 0}`
  const hit = cache.get(key); if (hit) return hit
  const W = 1024, H = 512
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const c = cv.getContext('2d')!
  c.clearRect(0, 0, W, H)
  let seed = 0; for (const ch of key) seed = (seed * 131 + ch.charCodeAt(0)) >>> 0
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const size = Math.min(300, Math.floor((W * 0.86) / Math.max(1, [...text].length) * (/[\u4e00-\u9fff]/.test(text) ? 1 : 1.7)))
  c.font = `900 ${size}px "Noto Sans SC", "Noto Sans CJK SC", sans-serif`
  c.textAlign = 'center'; c.textBaseline = 'middle'
  // 拖痕：同一个字多次轻微错位叠印，像是用身体拖出来的
  c.fillStyle = '#fff'
  for (let k = 0; k < 7; k++) {
    c.save()
    c.translate(W / 2 + (R() - 0.5) * 18, H / 2 + (R() - 0.5) * 14)
    c.rotate((R() - 0.5) * 0.06)
    c.globalAlpha = k === 0 ? 1 : 0.35
    c.fillText(text, 0, 0)
    c.restore()
  }
  // 滴溅与流痕
  for (let i = 0; i < (fresh ? 120 : 60); i++) {
    const x = W * (0.08 + R() * 0.84), y = H * (0.2 + R() * 0.6), r = 2 + R() * (fresh ? 14 : 8)
    c.globalAlpha = 0.6 + R() * 0.4
    c.beginPath(); c.ellipse(x, y, r * (1 + R()), r, R() * 3, 0, Math.PI * 2); c.fill()
  }
  // 侵蚀：随机咬掉一些边缘，旧字更破碎
  c.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < (fresh ? 40 : 160); i++) {
    c.globalAlpha = 0.5 + R() * 0.5
    c.beginPath(); c.arc(R() * W, R() * H, 2 + R() * 9, 0, Math.PI * 2); c.fill()
  }
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1
  const tex = new THREE.CanvasTexture(cv)
  tex.anisotropy = 4
  tex.userData.entityShared = true
  cache.set(key, tex)
  return tex
}

export function buildTarWriting(s: { x?: number; y?: number; w: number; h: number; data?: Record<string, unknown> }, map?: GameMap): THREE.Group {
  const g = new THREE.Group()
  const text = String(s.data?.text ?? '别动')
  const fresh = !!s.data?.fresh
  const tex = tarTexture(text, fresh)
  const mat = litMaterial({
    color: '#050505', roughness: fresh ? 0.08 : 0.22, metalness: 0.0, alphaMap: tex, alphaTest: 0.45, transparent: false,
    emissive: '#000000', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  })
  const L = Math.max(s.w, s.h) * 1.6
  const geo = new THREE.PlaneGeometry(L, L * 0.5, 24, 12)
  geo.rotateX(-Math.PI / 2); geo.rotateY(Number(s.data?.rot ?? 0))
  const pos = geo.attributes.position, cx = (s.x ?? 0) + s.w / 2, cy = (s.y ?? 0) + s.h / 2
  const base = map ? floorHeight(map, cx, cy, 0) : 0
  for (let i = 0; i < pos.count; i++) pos.setY(i, (map ? floorHeight(map, cx + pos.getX(i), cy + pos.getZ(i), 0) - base : 0) + 0.04)
  geo.computeVertexNormals()
  const plane = new THREE.Mesh(geo, mat)
  g.add(plane)
  return g
}
