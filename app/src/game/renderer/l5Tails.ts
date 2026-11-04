// [l5tails] 渲染层：墙纸人脸（贴在墙面上的一张半透明浮雕脸，透明度跟引擎 hotelWallFace.a）+ 肖像是否在视野里
import * as THREE from 'three'
import { makeCanvasCtx, toTex } from './shared'
import type { WallFace } from '../engine/l5Tails'

const FW = 256, FH = 320
const faceTex: THREE.Texture[] = []
/** 墙纸纹样里「长」出来的脸：没有颜色，只有明暗——额 / 颧 / 鼻梁高光，眼窝 / 鼻底 / 口缝阴影，边缘羽化成墙纸 */
export function wallFaceTexture(v: number): THREE.Texture {
  if (faceTex[v]) return faceTex[v]
  const [c, g] = makeCanvasCtx(FW, FH), cx = FW / 2
  g.clearRect(0, 0, FW, FH)
  const sh = (x: number, y: number, rx: number, ry: number, a: number, light: boolean) => {
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry))
    gr.addColorStop(0, light ? `rgba(255,236,200,${a})` : `rgba(18,8,4,${a})`); gr.addColorStop(1, light ? 'rgba(255,236,200,0)' : 'rgba(18,8,4,0)')
    g.save(); g.translate(x, y); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y); g.fillStyle = gr; g.beginPath(); g.arc(x, y, Math.max(rx, ry), 0, Math.PI * 2); g.fill(); g.restore()
  }
  const sx = [1, 0.92, 1.08, 0.96][v % 4], mouth = [0.2, 0.5, 0.1, 0.8][v % 4]
  sh(cx, 150, 92 * sx, 128, 0.22, false) // 脸轮廓的凹陷
  sh(cx, 92, 62 * sx, 30, 0.35, true) // 额
  for (const s of [-1, 1]) { sh(cx + s * 34 * sx, 128, 22, 16, 0.85, false); sh(cx + s * 40 * sx, 168, 24, 18, 0.3, true) } // 眼窝 / 颧
  sh(cx, 150, 9, 34, 0.45, true); sh(cx, 186, 22, 8, 0.6, false) // 鼻梁 / 鼻底
  sh(cx, 222, 34, 5 + mouth * 12, 0.75, false) // 口缝（有的张着）
  sh(cx, 250, 30, 12, 0.25, true) // 下巴
  const t = toTex(c); t.colorSpace = THREE.SRGBColorSpace; faceTex[v] = t
  return t
}
let mesh: THREE.Mesh | null = null, key = ''
export function syncWallFace(scene: THREE.Scene, f: WallFace | null, ox: number, oy: number) {
  if (!f) { if (mesh) mesh.visible = false; return }
  if (!mesh) {
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshLambertMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0 }))
    mesh.name = 'l5WallFace'; mesh.renderOrder = 2; scene.add(mesh)
  }
  const mat = mesh.material as THREE.MeshLambertMaterial
  const k = `${f.wx},${f.wy},${f.wall},${f.face},${ox},${oy}`
  if (k !== key) {
    key = k
    mat.map = wallFaceTexture(f.face); mat.needsUpdate = true
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][f.wall & 3]
    mesh.position.set(f.wx - ox + 0.5 + D[0] * 0.495, 1.55, f.wy - oy + 0.5 + D[1] * 0.495)
    mesh.rotation.set(0, Math.atan2(-D[0], -D[1]), 0) // 正面（局部 +z）背离墙
  }
  mesh.visible = f.a > 0.01
  mat.opacity = 0.9 * f.a * f.a
}
const _v = new THREE.Vector3(), _f = new THREE.Vector3()
/** 肖像中心在镜头前方、偏离视线 < 0.6 rad（约水平视野一半）、16 m 内 = 「被看到」 */
export function isPortraitInView(cam: THREE.Camera, g: THREE.Object3D) {
  g.getWorldPosition(_v); _v.sub(cam.position)
  const d = _v.length(); if (d > 16 || d < 1e-3) return d < 1e-3
  cam.getWorldDirection(_f)
  return _v.dot(_f) / d > Math.cos(0.6)
}
