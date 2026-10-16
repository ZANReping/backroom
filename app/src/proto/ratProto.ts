// 原型预览页：尸鼠重制（?mode=lineup | face | poses | capy | old）
//  lineup：五个种群并排（常见 / 无毛 L2 / 穴顶 L8 / 酒店正装 L5 / 水豚 L3）
//  face：头部特写（常见种怪角 / 无毛种 / 水豚种磨尖的牙与音箱）
//  poses：闲逛 · 站立嗅闻 · 盯着你 · 低头啃食 · 叼飞蛾 · 扑咬 · 逃窜
//  capy：水豚种磨牙 · 布雷 · 指挥（气泡）+ 电击陷阱 / 触发后 / 土制炸弹 + L2 尸体
//  old：旧版方块模型（对比用；在旧代码树里运行）
import * as THREE from 'three'
import { buildEntityMesh } from '../game/renderer/entitiesMesh'
const q = new URLSearchParams(location.search)
const mode = q.get('mode') ?? 'lineup'
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#3c3a34'); scene.fog = new THREE.Fog(scene.background as THREE.Color, 6, 20)
const fl = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#4a463c' })); fl.rotation.x = -Math.PI / 2; scene.add(fl)
const wl = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), new THREE.MeshLambertMaterial({ color: '#5c5a50' })); wl.position.set(0, 3, -1.2); scene.add(wl)
scene.add(new THREE.HemisphereLight('#fff2dc', '#2a2620', 1.25)); const sun = new THREE.DirectionalLight('#fff4e0', 1.3); sun.position.set(2, 5, 4); scene.add(sun)
const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 30), W / H, 0.02, 40)
const lab = document.getElementById('lab')!
const label = (x: number, html: string, y = H - 70) => { const p = new THREE.Vector3(x, 0, 0).project(cam); lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${(p.x * 0.5 + 0.5) * W}px;top:${y}px">${html}</div>`) }
const stats = (g: THREE.Object3D) => { let calls = 0, tris = 0; g.traverse((m: any) => { if (m.isMesh && m.visible !== false) { calls++; const gi = m.geometry; tris += (gi.index ? gi.index.count : gi.attributes.position.count) / 3 } }); return { calls, tris: Math.round(tris) } }
const old = mode === 'old'
async function main() {
  const diag: any = {}
  if (old) {
    cam.position.set(0, 0.9, 4.2); cam.lookAt(0, 0.2, 0)
    const xs = [-1.5, -0.5, 0.5, 1.5]
    const opts: any[] = [{ ratMorph: 'brown' }, { ratMorph: 'gray' }, { ratMorph: 'hotel' }, { capybara: true }]
    const names = ['深褐（L8/L9）', '灰白（L2）', '酒店正装（L5）', '水豚（L3）']
    opts.forEach((o, i) => { const g = buildEntityMesh('corpserat', { ...o, seed: 3 + i }); g.position.set(xs[i], 0, 0); g.rotation.y = -Math.PI / 2 + 0.7; if (o.capybara) g.scale.setScalar(1.45); scene.add(g); label(xs[i], `旧版 · ${names[i]}`) })
  } else {
    const M = await import('../game/renderer/ratMesh')
    const A = await import('../game/engine/ratAI')
    const rat = (morph: any, seed: number, x: number, z: number, ry: number, o: { phase?: string; animT?: number; lunge?: number; carry?: number; t?: number; bubble?: string; state?: string } = {}) => {
      const g = buildEntityMesh('corpserat', { ratMorph: morph, seed })
      g.position.set(x, 0, z); g.rotation.y = ry
      if (morph === 'capybara') g.scale.setScalar(1.45)
      scene.add(g)
      const e: any = { id: seed, state: o.state ?? 'wander', animT: o.animT ?? 0.3, lungeT: o.lunge ?? 0, rt: { phase: o.phase ?? 'roam', carry: o.carry ?? 0, bubbleT: o.bubble ? 1 : 0, bubbleText: o.bubble ?? '' } }
      if (o.state !== 'idle') { e.animT -= 0.02; M.animateRat(g, e, (o.t ?? 1.3) - 0.03, 0); e.animT += 0.02 }
      M.animateRat(g, e, o.t ?? 1.3, 0)
      return { g, ...stats(g) }
    }
    if (mode === 'ref') {
      // 参照图对照：水豚种坐姿（3/4）+ 行走侧面；常见种毛发近景
      scene.background = new THREE.Color('#2e2a22'); (scene.fog as THREE.Fog).color.set('#2e2a22')
      const bar = new THREE.MeshLambertMaterial({ color: '#26272a' })
      for (let i = 0; i < 16; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.2, 6), bar); b.position.set(-1.6 + i * 0.2, 1.1, -0.9); scene.add(b) }
      cam.position.set(0, 0.75, 3.6); cam.lookAt(0, 0.3, 0); cam.fov = 28; cam.updateProjectionMatrix()
      rat('capybara', 25, -0.62, 0, -Math.PI / 2 + 0.55, { phase: 'command', state: 'idle', t: 0.4 })
      rat('capybara', 26, 0.55, -0.15, -Math.PI / 2 + 1.5, { phase: 'roam', animT: 0.5, t: 1.1 })
      rat('common', 27, 0.25, 0.75, -Math.PI / 2 + 0.6, { phase: 'watch', state: 'idle', t: 0.9 })
      label(-0.62, '水豚种 · 坐姿<br><span class="s">参照图：后腿坐地、胸口挺起、钝方吻</span>', H - 90)
      label(0.62, '水豚种 · 行走<br><span class="s">长而蓬乱的粗毛 · 红褐色裸皮蹼足</span>', H - 90)
      label(0.18, '常见种 · 毛发近景', H - 40)
    } else if (mode === 'face') {
      cam.position.set(0, 0.5, 2.1); cam.lookAt(0, 0.2, 0); cam.fov = 24; cam.updateProjectionMatrix()
      rat('common', 7, -0.38, 0, -Math.PI / 2 + 0.95, { phase: 'watch', t: 0.2 })
      rat('hairless', 11, 0.02, 0.05, -Math.PI / 2 + 1.25, { phase: 'sniff', t: 0.4 })
      rat('capybara', 21, 0.62, -0.6, -Math.PI / 2 + 1.05, { phase: 'command', state: 'idle', t: 0.6 })
      label(-0.38, '常见种<br><span class="s">长身黑毛 · 棕色怪角 · 角尖红光</span>', H - 90)
      label(0.02, '无毛种（L2）<br><span class="s">裸皮起皱 · 烫伤斑 · 浑浊黄眼</span>', H - 90)
      label(0.62, '水豚种（L3）<br><span class="s">磨尖的锯齿牙 · 胸前自制音箱</span>', H - 90)
    } else if (mode === 'poses') {
      cam.position.set(0, 0.95, 4.3); cam.lookAt(0, 0.12, 0)
      const xs = [-1.65, -1.1, -0.55, 0, 0.55, 1.1, 1.65]
      const P = [['roam', '闲逛小跑', {}], ['sniff', '站立嗅闻', {}], ['watch', '站起来盯着你', {}], ['gnaw', '低头啃食霉斑', {}], ['drag', '叼着飞蛾拖走', { carry: 2 }], ['chase', '扑咬', { lunge: 0.14 }], ['flee', '四散逃窜', { animT: 0.55 }]] as const
      P.forEach(([ph, n, o], i) => { rat('common', 31 + i, xs[i], 0, -Math.PI / 2 + 0.95, { phase: ph, ...(o as any) }); label(xs[i], n) })
    } else if (mode === 'capy') {
      cam.position.set(0, 1.35, 5.0); cam.lookAt(0, 0.2, 0)
      // 一段铁栅栏
      const bar = new THREE.MeshLambertMaterial({ color: '#3a3c40' })
      for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.6, 6), bar); b.position.set(-2.2 + i * 0.1, 0.8, -0.35); scene.add(b) }
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.04), bar); rail.position.set(-1.8, 1.5, -0.35); scene.add(rail)
      rat('capybara', 21, -1.75, -0.05, Math.PI / 2 + 0.25, { phase: 'grind', state: 'idle', t: 0.35 })
      rat('capybara', 22, -0.55, 0.15, -Math.PI / 2 + 0.6, { phase: 'plant', state: 'idle', t: 0.8 })
      const c = rat('capybara', 23, 0.6, 0, -Math.PI / 2 + 1.1, { phase: 'command', state: 'idle', bubble: A.CAPY_LINES.command[1] })
      // 气泡
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const gx = cv.getContext('2d')!
      gx.fillStyle = 'rgba(248,246,232,0.94)'; gx.fillRect(4, 4, 504, 120); gx.strokeStyle = 'rgba(60,52,40,0.9)'; gx.lineWidth = 3; gx.strokeRect(4, 4, 504, 120)
      gx.font = "36px 'Noto Serif CJK SC','SimSun',serif"; gx.textAlign = 'center'; gx.textBaseline = 'middle'; gx.fillStyle = '#2a2620'; gx.fillText(A.CAPY_LINES.command[1], 256, 66)
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace
      const bub = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.21), new THREE.MeshBasicMaterial({ map: tex, transparent: true })); bub.position.set(0.6, 0.75 * 1.45, 0); scene.add(bub)
      const gT = M.buildRatGearMesh('trap', 5); gT.position.set(1.35, 0, 0.55); scene.add(gT); M.animateRatGear(gT, { kind: 'trap', sprung: false, fuse: -1, t: 0 }, 0.2)
      const gS = M.buildRatGearMesh('trap', 6); gS.position.set(1.85, 0, 0.55); scene.add(gS); M.animateRatGear(gS, { kind: 'trap', sprung: true, fuse: -1, t: 1 }, 0.2)
      const gB = M.buildRatGearMesh('bomb', 7); gB.position.set(2.35, 0, 0.5); scene.add(gB); M.animateRatGear(gB, { kind: 'bomb', sprung: false, fuse: 0.6, t: 0 }, 0.03)
      const corpse = M.buildRatMesh('hairless', 77, false, true); corpse.position.set(-2.3, 0, 0.7); corpse.rotation.y = 0.6; scene.add(corpse)
      label(-1.75, '抱着栅栏磨牙'); label(-0.55, '伏地布雷'); label(0.6, '指挥<br><span class="s">音箱合成音 · 头顶气泡</span>')
      label(1.85, '电击陷阱 / 触发后 / 土制炸弹', H - 40); label(-2.3, 'L2 尸鼠尸体', H - 40)
      diag.capy = { calls: c.calls, tris: c.tris }
    } else {
      cam.position.set(0, 1.0, 4.6); cam.lookAt(0, 0.2, 0)
      const xs = [-1.75, -1.05, -0.35, 0.35, 1.3]
      const ms = ['common', 'hairless', 'cave', 'hotel', 'capybara'] as const
      const rs = ms.map((m, i) => rat(m, 41 + i, xs[i], 0, -Math.PI / 2 + 0.9, { phase: 'roam', t: 1 + i * 0.3 }))
      ms.forEach((m, i) => label(xs[i], `${A.RAT_MORPH_NAME[m]}<br><span class="s">${rs[i].tris} 三角面 · ${rs[i].calls} 网格</span>`))
      diag.lineup = rs.map((r, i) => ({ morph: ms[i], tris: r.tris, meshes: r.calls }))
    }
  }
  ;(window as any).__diag = diag
  cam.updateMatrixWorld(); renderer.render(scene, cam); (window as any).__ready = true
}
main().catch((e) => { (window as any).__err = String(e?.stack ?? e) })
