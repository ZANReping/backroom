// 原型预览页：旱虾（Entity 20）重制（?mode=lineup | ref | poses | items | old）
//  lineup：三只不同体型的旱虾（3/4 俯视）+ 侧视 / 正视
//  ref：参照图同角度（斜上方俯视，暖灰背景）
//  poses：爬行 · 游泳（积水里）· 发呆 · 受惊弹窜 · 被钝人按住挣扎 · 分裂 30% / 65% / 95% · 被打死翻肚
//  items：旱虾 / 活旱虾 / 酥炸旱虾（物品模型特写）
//  old：旧版模型与旧物品（对比用；在旧代码树里运行）
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
import { buildItemMesh } from '../game/renderer/itemsMesh'
const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'lineup'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#3c3a34'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 6, 20)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#4a463c' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
scene.add(new THREE.HemisphereLight('#fff2dc', '#2a2620', 1.25)); const sun = new THREE.DirectionalLight('#fff4e0', 1.4); sun.position.set(2, 5, 4); scene.add(sun)
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 30), W / H, 0.02, 40)
const lab = document.getElementById('lab')!
const label = (x: number, html: string, y = H - 70, z = 0) => { const p = new THREE.Vector3(x, 0, z).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${y}px">${html}</div>`) }
const stats = (g: THREE.Object3D) => { let calls = 0, tris = 0; g.traverse((m: any) => { if (m.isMesh && m.visible !== false) { calls++; const gi = m.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3 } }); return { calls, tris: Math.round(tris) } }
async function main() {
  const diag: any = {}
  if (mode === 'old') {
    cam.position.set(0, 0.75, 2.2); cam.lookAt(0, 0.12, 0)
    const g = buildEntityMesh('dryshrimp', { seed: 3 } as any); g.position.set(-0.45, 0, 0); g.rotation.y = 0.6; scene.add(g)
    label(-0.45, `旧版 · 旱虾实体<br><span class="s">${stats(g).tris} 三角面 · ${stats(g).calls} 网格</span>`)
    const it = [['dryshrimp', '旧版 · 旱虾'], ['friedshrimp', '旧版 · 酥炸旱虾']] as const
    it.forEach(([t, n], i) => { const m = buildItemMesh(t, { halo: false }); m.position.set(0.35 + i * 0.4, 0.12, 0.2); m.scale.setScalar(1.3); scene.add(m); label(0.35 + i * 0.4, n, H - 70, 0.2) })
  } else {
    const M = await import('../game/renderer/shrimpMesh')
    const shrimp = (seed: number, x: number, z: number, ry: number, sh: any = {}, o: { t?: number; state?: string; dead?: number; scale?: number } = {}) => {
      const g = buildEntityMesh('dryshrimp', { seed } as any)
      g.position.set(x, 0, z); g.rotation.y = ry
      if (o.scale) g.scale.setScalar(o.scale)
      scene.add(g)
      const e: any = { id: seed, state: o.state ?? 'wander', animT: 0, x, y: z, sh: { phase: 'crawl', speed: 0.36, swim: 0, size: 1, grow: 1, split: 0, ...sh } }
      const t0 = o.t ?? 1.3
      for (let i = 0; i < 30; i++) M.animateShrimp(g, e, t0 + i / 30, 0)
      if (o.dead !== undefined) M.animateShrimpDeath(g, e, o.dead, 0)
      return { g, ...stats(g) }
    }
    if (mode === 'ref') {
      scene.background = new THREE.Color('#bdb19a'); (scene.fog as THREE.Fog).color.set('#bdb19a'); fl.visible = false
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshLambertMaterial({ color: '#a89c84' })); wall.position.set(0, 0, -1.2); scene.add(wall)
      cam.position.set(-0.2, 0.95, 0.85); cam.lookAt(0.0, 0.05, 0); cam.fov = 34; cam.updateProjectionMatrix()
      shrimp(5, 0, 0, 0.55, { phase: 'rest', speed: 0 }, { t: 2.1, state: 'idle' })
    } else if (mode === 'poses') {
      cam.position.set(0, 3.2, 4.6); cam.lookAt(0, 0, 0.1)
      const water = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshStandardMaterial({ color: '#3b4a4a', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.75 })); water.rotation.x = -Math.PI / 2; water.position.set(-0.75, 0.006, -0.55); scene.add(water)
      const P: [string, number, number, any, any][] = [
        ['陆地爬行<br><span class="s">鳍片划地 · 前附肢探地</span>', -1.65, -0.55, { phase: 'crawl', speed: 0.36 }, {}],
        ['积水里游动<br><span class="s">离地上浮 · 大幅划水</span>', -0.75, -0.55, { phase: 'crawl', speed: 0.58, swim: 1 }, {}],
        ['发呆<br><span class="s">鳍片慢慢张合</span>', 0.15, -0.55, { phase: 'rest', speed: 0 }, { state: 'idle' }],
        ['受惊弹窜', 1.05, -0.55, { phase: 'startle', speed: 2 }, {}],
        ['被钝人按住挣扎', 1.85, -0.55, { phase: 'held', speed: 0 }, { state: 'idle' }],
        ['分裂 · 30%', -1.4, 0.55, { phase: 'split', speed: 0, split: 0.3 }, { state: 'idle' }],
        ['分裂 · 65%<br><span class="s">中段缢缩、拉长</span>', -0.45, 0.55, { phase: 'split', speed: 0, split: 0.65 }, { state: 'idle' }],
        ['分裂 · 95%', 0.55, 0.55, { phase: 'split', speed: 0, split: 0.95 }, { state: 'idle' }],
        ['被打死 · 翻肚', 1.6, 0.55, { phase: 'rest', speed: 0 }, { state: 'idle', dead: 1 }],
      ]
      P.forEach(([n, x, z, sh, o], i) => { shrimp(11 + i, x, z, -0.55, sh, o); label(x, n, z < 0 ? H * 0.43 : H - 60, z) })
    } else if (mode === 'items') {
      cam.position.set(0, 0.62, 1.6); cam.lookAt(0, 0.08, 0); cam.fov = 26; cam.updateProjectionMatrix()
      const it = [['dryshrimp', '旱虾<br><span class="s">鳍片耷拉 · 前附肢卷紧 · 眼睛无光</span>'], ['liveshrimp', '活旱虾（新）<br><span class="s">活抓所得 · 放在地上即诱饵</span>'], ['friedshrimp', '酥炸旱虾<br><span class="s">Tom 裹粉炸 · 鳍片炸脆 · 眼睛炸白</span>']] as const
      diag.items = it.map(([t, n], i) => { const m = buildItemMesh(t, { halo: false }); m.position.set(-0.4 + i * 0.4, 0.07, 0); m.scale.setScalar(1.0); scene.add(m); label(-0.4 + i * 0.4, n); return { t, ...stats(m) } })
    } else {
      cam.position.set(0, 1.0, 2.25); cam.lookAt(0, 0.05, 0)
      const r = [shrimp(21, -0.7, 0, 0.5, {}, { t: 1.1 }), shrimp(22, 0, 0.05, -0.2, { phase: 'rest', speed: 0 }, { t: 1.7, state: 'idle' }), shrimp(23, 0.7, 0, -2.4, {}, { t: 2.3 })]
      r.forEach((s, i) => label(-0.7 + i * 0.7, `${['爬行', '发呆（侧视）', '爬行（背面）'][i]}<br><span class="s">${s.tris} 三角面 · ${s.calls} 网格</span>`))
      diag.lineup = r.map((s) => ({ tris: s.tris, meshes: s.calls }))
    }
  }
  ;(window as any).__diag = diag
  cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__ready = true
}
main().catch((e) => { (window as any).__err = String(e?.stack ?? e) })
