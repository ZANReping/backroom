// 原型预览页：L5「恐怖旅馆」1b 空间（?mode=portraits | eyes | bevwall | boiler）
//  portraits：6 张会看人的肖像一字排开 · eyes：同一幅画从左 / 右两个机位看，瞳孔跟着镜头
//  bevwall：贝弗莉室门墙一角（贴墙门 / 活板门 / 倒挂门 / 麻将桌）· boiler：锅炉房管段 + 喷射中的蒸汽
import '../game/renderer/renderer'
import * as THREE from 'three'
import { buildStructure } from '../game/renderer/structures'
import { aimPortrait } from '../game/renderer/l5Portrait'
import { portraitName } from '../game/renderer/l5Portrait'

const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'portraits'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#1a0f0c')
scene.add(new THREE.HemisphereLight('#ffe8c8', '#2a1810', 1.15))
const key = new THREE.PointLight('#ffd9a0', 30, 18); key.position.set(4, 3.2, 5); scene.add(key)
const lab = document.getElementById('lab')!
const N = 24, WALL_H = 3.3
const map: any = { w: N, h: N, tiles: new Uint8Array(N * N).fill(1), tint: new Uint8Array(N * N), ceiling: new Uint8Array(N * N), up: new Uint8Array(N * N), upWall: new Uint8Array(N * N), structures: [], floors: 1 }
const def: any = { id: 5, gen: 'hotel' }
const wallRow = (y: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) map.tiles[y * N + x] = 0 }
const wallCol = (x: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) map.tiles[y * N + x] = 0 }
const wallMat = new THREE.MeshLambertMaterial({ color: '#6a2c2e' }), trim = new THREE.MeshLambertMaterial({ color: '#b8924a' })
const floorMat = new THREE.MeshLambertMaterial({ color: mode === 'boiler' ? '#3a3632' : '#7a2a34' })
function buildWalls() {
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(N, N), floorMat); fl.rotation.x = -Math.PI / 2; fl.position.set(N / 2, 0, N / 2); scene.add(fl)
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (map.tiles[y * N + x] === 0) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1, WALL_H, 1), mode === 'boiler' ? new THREE.MeshLambertMaterial({ color: '#5a4a3c' }) : wallMat); b.position.set(x + 0.5, WALL_H / 2, y + 0.5); scene.add(b)
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.01, 0.08, 1.01), trim); t.position.set(x + 0.5, 0.9, y + 0.5); if (mode !== 'boiler') scene.add(t)
  }
}
function put(kind: string, x: number, y: number, data: any = {}, w = 1, h = 1) {
  const s: any = { kind, x, y, w, h, solid: false, data }
  map.structures.push(s)
  const g = buildStructure(s, def, map, WALL_H)
  if (g) scene.add(g)
  return g as THREE.Group
}
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 45), W / H, 0.05, 80)
const label = (x: number, y: number, z: number, html: string) => { const p = new THREE.Vector3(x, y, z).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${(-p.y * 0.5 + 0.5) * H}px">${html}</div>`) }
const portraits: THREE.Object3D[] = []
const findPor = (g: THREE.Object3D) => g.getObjectByName('l5portrait') as THREE.Group

async function main() {
  if (mode === 'portraits' || mode === 'eyes') {
    wallRow(3, 0, N - 1); buildWalls()
    const n = mode === 'eyes' ? 1 : 6
    for (let i = 0; i < n; i++) {
      const x = mode === 'eyes' ? 12 : 4 + i * 3
      const g = put('bigpainting', x, 4, { tex: 'l5_portrait1.png', pw: 1.12, ph: 1.4, gaze: 1, face: mode === 'eyes' ? Number(q.get('face') ?? 0) : i })
      portraits.push(findPor(g))
    }
    if (mode === 'portraits') { cam.position.set(11.5, 1.75, 12.5); cam.lookAt(11.5, 1.7, 4) }
    else { const side = Number(q.get('side') ?? 0); cam.position.set(12.5 + side * 2.6, 1.6 + Number(q.get('up') ?? 0), 7.2); cam.lookAt(12.5, 1.75, 4) }
    key.position.copy(cam.position).add(new THREE.Vector3(0, 1.2, 0))
  } else if (mode === 'bevwall') {
    wallRow(3, 2, 20); wallCol(2, 3, 20)
    buildWalls()
    for (let x = 4; x <= 18; x += 2) put('l5walldoor', x, 4, { l5: 1, bev: 1, go: 0, hue: x % 5 })
    for (let y = 6; y <= 18; y += 2) put('l5walldoor', 3, y, { l5: 1, bev: 1, go: 0, hue: (y + 2) % 5 })
    put('l5floordoor', 7, 9, { l5: 1, go: 1 }); put('l5floordoor', 12, 12, { l5: 1, go: 0 })
    put('l5ceildoor', 9, 7, { l5: 1, hue: 1, yaw: 0 }); put('l5ceildoor', 13, 8, { l5: 1, hue: 3, yaw: 1 })
    put('oddtable', 10, 11, { l5: 1 })
    const ch = new THREE.PointLight('#ffe3bd', 40, 22); ch.position.set(10.5, 3, 10.5); scene.add(ch)
    cam.position.set(15.5, 2.3, 16); cam.lookAt(7, 1.0, 6)
  } else if (mode === 'boiler') {
    wallCol(3, 0, N - 1); buildWalls()
    for (let y = 6; y <= 14; y += 2) put('pipes', 4, y, { l5: 1, axis: 'y', steam: y === 10 ? 1 : 0, dir: 1 })
    put('valve', 4, 12, {})
    // 喷射中的蒸汽（与 l5Hotel.steamTick 同参数：从管口沿 +x 喷 2.5 m 锥形）
    const tex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c) })()
    for (let i = 0; i < 70; i++) {
      const k = Math.random(), sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#e9e4da', transparent: true, opacity: 0.55 * (1 - k * 0.7), depthWrite: false }))
      const along = 0.3 + k * 2.4
      sp.position.set(4.9 + along, 1.15 + (Math.random() - 0.4) * along * 0.35, 10.5 + (Math.random() - 0.5) * along * 0.9)
      sp.scale.setScalar(0.25 + k * 0.9); scene.add(sp)
    }
    const amber = new THREE.PointLight('#dbcc9a', 14, 10); amber.position.set(7, 2.6, 10); scene.add(amber)
    cam.position.set(9.6, 1.9, 14.2); cam.lookAt(5.4, 1.1, 10.3)
  }
  scene.updateMatrixWorld(true)
  // 瞳孔对准镜头（多帧收敛）
  for (let k = 0; k < 40; k++) for (const p of portraits) aimPortrait(p as THREE.Group, cam.position, 14)
  renderer.render(scene, cam)
  if (mode === 'portraits') portraits.forEach((p, i) => { const v = new THREE.Vector3(); p.getWorldPosition(v); label(v.x, 0.55, v.z + 0.3, `${i + 1} · ${portraitName(i)}`) })
  ;(window as any).__ready = true
}
main()
