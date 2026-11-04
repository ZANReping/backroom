// [jazz] 爵士脑（Entity 197）阶段 3：渲染接入。
//   · buildJazzEntityMesh：实体根组（外层朝 +X 约定同厨师）。四个乐手共用实体类型 'jazz'，谁是谁看 e.jz.who——第一次 animate 时才按 who 建：
//     LOD2（约 5.5k，立即）/ LOD1（约 1.6 万，22 m 内建）/ LOD0（约 4.4 万，11 m 内建）；< 8 m LOD0、< 17.5 m LOD1、更远 LOD2（±1 m 迟滞）。
//     图鉴：archivePose = 个体序号 → 头儿独奏 / 萨克斯演奏 / 低音提琴托头 / 鼓手弹钢琴（四个定格姿态，JAZZ_ARCHIVE_POSES）。
//   · animateJazzEntity：按 jazzAI 的 e.jz.clip / seq 切片段（混合 = AI 给的 blend）；非循环片段时间 = AI 的 modeT（独奏 / 假吸魂 / 鞠躬与逻辑同步），
//     走路按实际速度 / 0.8 缩放步频；模型抬到地台高度 e.jz.h（舞台 0.45、台阶过渡）。啤酒杯 / 倒酒 / 魂雾道具由 jazzAnim 自建（attachJazzMug）。
//   · buildJazzProp / syncJazzProp：餐厅舞台道具（structures.buildStructure 的 jazzprop 分支；动态件 cctv 每帧由 renderer.updateStructs 调 sync）：
//     stage 舞台（台面 0.45、金色台口线、台口脚灯、背后东墙红丝绒幕布）、steps 台阶、piano 立式钢琴 + 琴凳（对齐 JAZZ_PIANO / JAZZ_BENCH）、
//     rug 观众区地毯、bar 吧台（台面 1.05 = JAZZ_BAR、黄铜扶手、酒瓶、两瓶哈瓦那辣椒酱、扎啤杯）、stool 高脚凳、
//     cctv 监控探头（墙角支架；你在观众区时转头盯你，终曲时红灯快闪）、poster 演出海报（迎宾女郎画的：四个乐器头剪影 + 「今晚 · 爵士脑」）。
import * as THREE from 'three'
import type { Entity } from '../entities'
import type { Structure } from '../core/types'
import type { Engine } from '../engine'
import { buildJazz, jazzGeometryReady, type JazzRig } from './jazzMesh'
import { JAZZ_CLIPS, JAZZ_BENCH, JAZZ_BAR, jazzPose, mixJazzPose, cloneJazzPose, applyJazzPose, resetJazzDynamics, attachJazzMug, type JazzClip, type JazzAnimPose, type JazzAnimOpts } from './jazzAnim'
import { buildUprightPiano, buildBeerMug, buildHotSauce, buildCctvCamera, buildMusicStand } from './jazzProps'
import { litMaterial } from './shared'
import { type JazzWho } from './jazzRig'
import { jazzDebug, jazzInAudience } from '../engine/jazzAI'
import { JAZZ_STAND_LOCAL, JAZZ_COLUMN } from '../content/jazzLayout'

export const JAZZ_RLOD = { b0: 8, b1: 17.5, hyst: 1, build0: 11, build1: 22 }
/** 图鉴档案四个定格姿态（archiveViews 按个体序号轮换） */
export const JAZZ_ARCHIVE_POSES = [
  { who: 'leader', clip: 'trumpetSolo', t: 3.2, label: '头儿 · 小号独奏' },
  { who: 'sax', clip: 'saxPlay', t: 1.4, label: '萨克斯 · 「你点我吹」' },
  { who: 'bass', clip: 'holdHead', t: 2.2, label: '低音提琴 · 扶着沉甸甸的头' },
  { who: 'drum', clip: 'pianoPlay', t: 1.8, label: '鼓手 · 更爱弹钢琴' },
] as const satisfies readonly { who: JazzWho; clip: JazzClip; t: number; label: string }[]

interface View { who: JazzWho; clip: JazzClip; seq: number; t: number; gt: number; fadeT: number; blend: number; prev: JazzAnimPose | null; last: JazzAnimPose | null; lod: 0 | 1 | 2 }
const shadowsOn = (o: THREE.Object3D, on: boolean) => o.traverse((x) => { const m = x as THREE.Mesh; if (m.isMesh) { m.castShadow = on; m.receiveShadow = true } })
function mkHolder(root: THREE.Group, who: JazzWho, lod: number) {
  const h = new THREE.Group(); h.name = 'jazzLOD' + lod; h.visible = false
  const m = buildJazz(who, { lod }); h.add(m)
  const rig = m.userData.jazz as JazzRig
  attachJazzMug(rig, buildBeerMug)
  shadowsOn(m, true)
  root.add(h)
  return { h, rig }
}
export function buildJazzEntityMesh(archivePose?: number): THREE.Group {
  const root = new THREE.Group(); root.name = 'jazzEntity'
  root.userData.entityType = 'jazz'
  if (archivePose !== undefined) {
    const P = JAZZ_ARCHIVE_POSES[((archivePose % JAZZ_ARCHIVE_POSES.length) + JAZZ_ARCHIVE_POSES.length) % JAZZ_ARCHIVE_POSES.length]
    const { h, rig } = mkHolder(root, P.who, 0); h.visible = true
    resetJazzDynamics(rig)
    const opts: JazzAnimOpts = { seed: 3 }
    for (let t = Math.max(0, P.t - 1.0); t <= P.t + 1e-6; t += 1 / 60) applyJazzPose(rig, jazzPose(P.who, P.clip, t, opts), { ...opts, time: t, dt: 1 / 60 })
    if (P.clip === 'pianoPlay') { const pi = buildUprightPiano(); pi.position.set(0.695, 0, 0); pi.rotation.y = -Math.PI / 2; root.add(pi); root.add(bench(JAZZ_BENCH.z)) }
    root.userData.archive = true
    return root
  }
  return root
}
function ensureLod(grp: THREE.Group, who: JazzWho, lod: 0 | 1 | 2): void {
  if (grp.userData['lod' + lod]) return
  const L = mkHolder(grp, who, lod)
  grp.userData['lod' + lod] = L.h; grp.userData['rig' + lod] = L.rig
}
/** 渲染层每帧：e.jz → 片段 / LOD / 地台高度 */
export function animateJazzEntity(grp: THREE.Group, e: Entity, dt: number, distance: number, preparedOnly = false) {
  if (grp.userData.archive) return
  const s = e.jz
  const who = (s?.who ?? 'leader') as JazzWho
  ensureLod(grp, who, 2)
  if (distance < JAZZ_RLOD.build1 && (!preparedOnly || jazzGeometryReady(who, 1))) ensureLod(grp, who, 1)
  if (distance < JAZZ_RLOD.build0 && (!preparedOnly || jazzGeometryReady(who, 0))) ensureLod(grp, who, 0)
  let v = grp.userData.jzView as View | undefined
  if (!v) { v = { who, clip: (s?.clip ?? 'idleSway') as JazzClip, seq: -1, t: 0, gt: 0, fadeT: 1, blend: 0.35, prev: null, last: null, lod: 2 }; grp.userData.jzView = v }
  // —— LOD ——
  const want: 0 | 1 | 2 = distance < JAZZ_RLOD.b0 ? 0 : distance < JAZZ_RLOD.b1 ? 1 : 2
  const near = (b: number) => Math.abs(distance - b) < JAZZ_RLOD.hyst
  let lod = v.lod
  if (!(near(JAZZ_RLOD.b0) && (v.lod === 0 || v.lod === 1)) && !(near(JAZZ_RLOD.b1) && (v.lod === 1 || v.lod === 2))) lod = want
  while (lod < 2 && !grp.userData['lod' + lod]) lod++
  const prevLod = v.lod; v.lod = lod as 0 | 1 | 2
  for (const k of [0, 1, 2]) { const h = grp.userData['lod' + k] as THREE.Group | undefined; if (h) { h.visible = k === v.lod; h.position.y = s?.h ?? 0 } }
  const rig = grp.userData['rig' + v.lod] as JazzRig
  if (prevLod !== v.lod && v.last) resetJazzDynamics(rig)
  // —— 片段 ——
  const clip = (s?.clip ?? 'idleSway') as JazzClip, C = JAZZ_CLIPS[clip]
  if (s && (s.seq !== v.seq || clip !== v.clip)) { v.prev = v.last ? cloneJazzPose(v.last) : null; v.fadeT = 0; v.blend = s.blend || C.blend; v.clip = clip; v.seq = s.seq; v.t = 0 }
  v.fadeT += dt; v.gt += dt
  if (C.loop) v.t += dt * (C.speed && s && s.mode === 'walk' ? Math.min(2, Math.max(0.3, s.speed / C.speed)) : 1)
  else v.t = s ? Math.min(s.modeT, C.dur) : Math.min(v.t + dt, C.dur)
  const opts: JazzAnimOpts = { seed: (e.id % 7) + 1 }
  let P = jazzPose(who, clip, v.t, { ...opts, time: v.gt })
  if (v.prev && v.fadeT < v.blend) P = mixJazzPose(v.prev, P, smooth(v.fadeT / v.blend))
  // 走路：根运动由 AI 推进（世界位置），动画里的前进量去掉
  if (clip === 'walk') { P.root = [P.root[0], P.root[1], 0] as typeof P.root }
  v.last = P
  // [修] 注视层 / 真吸魂雾源：地图点 → 这个 LOD 的 rig.root 空间（上一帧的世界矩阵，够用）
  const toRoot = (q: { x: number; y: number; z?: number } | null | undefined, zDef: number): [number, number, number] | null => {
    if (!q) return null
    rig.root.updateWorldMatrix(true, false)
    const w = rig.root.worldToLocal(_tv.set(q.x, q.z ?? zDef, q.y))
    return [w.x, w.y, w.z]
  }
  const lp = NO_LOOK.has(clip) ? null : toRoot(s?.lookAt, 1.55)
  const look = { p: lp, play: PLAY_LOOK.has(clip), w: 1 }
  const mistFrom = clip === 'trueSoulSuck' ? toRoot(s?.mistFrom, 1.15) : null
  applyJazzPose(rig, P, { ...opts, time: v.gt, dt, look, mistFrom })
}
const _tv = new THREE.Vector3()
/** 这些片段自己管头（看监控 / 指方向 / 鞠躬 / 凑近 / 吵架 / 调音 / 倒酒 / 扶头）：注视层回正 */
const NO_LOOK = new Set<JazzClip>(['glanceCamera', 'pointDirection', 'bow', 'leanFamiliar', 'argueReconcile', 'tuneUp', 'drinkBeer', 'holdHead'])
/** 演奏片段：注视幅度收小（JAZZ_LOOK.playYaw / playPitch），手跟着乐器头走 */
const PLAY_LOOK = new Set<JazzClip>(['trumpetPlay', 'trumpetSolo', 'saxPlay', 'saxSolo', 'bassPlay', 'drumPlay', 'pianoPlay'])
const smooth = (x: number) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t) }

// =====================================================================
// 场景件（局部原点 = 结构格子西北角；三维 X = 地图 x、Z = 地图 y）
// =====================================================================
const MAT: Record<string, THREE.Material> = {}
const mat = (k: string, p: Parameters<typeof litMaterial>[0]) => (MAT[k] ??= litMaterial(p))
const M = {
  stage: () => mat('stage', { color: '#ffffff', map: plankTex(), roughness: 0.55 }),
  skirt: () => mat('skirt', { color: '#1b2550', roughness: 0.9 }),
  gold: () => mat('gold', { color: '#d4a64a', roughness: 0.3, metalness: 0.9, emissive: '#2a1c04' }),
  velvet: () => mat('velvet', { color: '#6a1020', roughness: 0.95 }),
  wood: () => mat('wood', { color: '#3a2214', roughness: 0.5 }),
  woodDk: () => mat('woodDk', { color: '#20130b', roughness: 0.55 }),
  marble: () => mat('marble', { color: '#2a2a2e', roughness: 0.25, metalness: 0.1 }),
  leather: () => mat('leather', { color: '#5a1418', roughness: 0.6 }),
  chrome: () => mat('chrome', { color: '#c9ced3', roughness: 0.2, metalness: 0.9 }),
  rug: () => mat('rug', { color: '#ffffff', map: rugTex(), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 } as THREE.MeshLambertMaterialParameters),
  bulb: () => mat('bulb', { color: '#fff1c8', emissive: '#ffd27a', roughness: 0.4 } as THREE.MeshLambertMaterialParameters),
  bottle: (c: string) => mat('bottle' + c, { color: c, roughness: 0.1, transparent: true, opacity: 0.8 } as THREE.MeshLambertMaterialParameters),
  poster: () => mat('poster', { color: '#ffffff', map: posterTex(), roughness: 0.85 }),
}
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, rep = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!)
  const t = new THREE.CanvasTexture(c as unknown as HTMLCanvasElement); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}
let _plank: THREE.Texture | null = null, _rug: THREE.Texture | null = null, _poster: THREE.Texture | null = null
function plankTex() {
  if (_plank) return _plank
  _plank = (canvasTex(256, 256, (x) => {
    x.fillStyle = '#4a2a16'; x.fillRect(0, 0, 256, 256)
    let sd = 9; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 8; i++) { x.fillStyle = `rgba(${R() < 0.5 ? '30,14,6' : '110,64,34'},${0.15 + R() * 0.2})`; x.fillRect(0, i * 32, 256, 32); x.fillStyle = 'rgba(10,4,2,.6)'; x.fillRect(0, i * 32, 256, 1.5); x.fillRect(((i * 97) % 200) + 20, i * 32, 1.5, 32) }
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(20,10,4,${R() * 0.12})`; x.fillRect(R() * 256, R() * 256, 12 + R() * 30, 1) }
  }, true))
  _plank.repeat.set(2, 2)
  return _plank
}
function rugTex() {
  return (_rug ??= canvasTex(256, 256, (x) => {
    x.fillStyle = '#16204a'; x.fillRect(0, 0, 256, 256)
    x.strokeStyle = '#c9a24a'; x.lineWidth = 6; x.strokeRect(10, 10, 236, 236); x.lineWidth = 2; x.strokeRect(24, 24, 208, 208)
    x.fillStyle = 'rgba(201,162,74,.35)'
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { const cx = 48 + i * 53, cy = 48 + j * 53; x.beginPath(); x.moveTo(cx, cy - 14); x.lineTo(cx + 14, cy); x.lineTo(cx, cy + 14); x.lineTo(cx - 14, cy); x.closePath(); x.fill() }
    let sd = 3; const R = () => ((sd = (sd * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.12})`; x.fillRect(R() * 256, R() * 256, 1.5, 1.5) }
  }))
}
/** 迎宾女郎画的演出海报：深蓝底、金框、四个乐器头剪影、「今晚 · 爵士脑」、每晚两场、绝无危险 */
function posterTex() {
  return (_poster ??= canvasTex(256, 384, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 384); g.addColorStop(0, '#1b2a6a'); g.addColorStop(1, '#0b1030'); x.fillStyle = g; x.fillRect(0, 0, 256, 384)
    x.strokeStyle = '#d4a64a'; x.lineWidth = 5; x.strokeRect(8, 8, 240, 368); x.lineWidth = 1.5; x.strokeRect(16, 16, 224, 352)
    for (let i = 0; i < 9; i++) { x.strokeStyle = `rgba(255,220,140,${0.05 + i * 0.01})`; x.beginPath(); x.moveTo(128, 40); x.lineTo(30 + i * 25, 250); x.stroke() }
    x.fillStyle = '#e8c66a'; x.textAlign = 'center'; x.font = '700 22px "Noto Serif SC","Source Han Serif SC",serif'; x.fillText('今 晚 · 餐 厅', 128, 52)
    x.font = '700 40px "Noto Serif SC","Source Han Serif SC",serif'; x.fillText('爵士脑', 128, 100)
    x.font = 'italic 15px Georgia,serif'; x.fillText('JAZZ BRAIN · LIVE', 128, 122)
    // 四个乐器头剪影（小号 / 萨克斯 / 低音提琴 / 鼓）
    x.fillStyle = '#d4a64a'
    const body = (cx: number, top: number, w: number) => { x.fillRect(cx - w / 2, top, w, 250 - top + 50); x.beginPath(); x.moveTo(cx - w / 2, top + 10); x.lineTo(cx - w / 2 - 10, top + 70); x.lineTo(cx - w / 2, top + 70); x.fill(); x.beginPath(); x.moveTo(cx + w / 2, top + 10); x.lineTo(cx + w / 2 + 10, top + 70); x.lineTo(cx + w / 2, top + 70); x.fill() }
    body(46, 220, 34); body(100, 205, 34); body(158, 200, 40); body(212, 215, 36)
    x.beginPath(); x.moveTo(46, 220); x.lineTo(40, 190); x.lineTo(62, 176); x.lineTo(66, 196); x.closePath(); x.fill(); x.beginPath(); x.arc(64, 186, 12, 0, Math.PI * 2); x.fill() // 小号喇叭口
    x.fillRect(96, 160, 8, 46); x.beginPath(); x.arc(108, 160, 12, Math.PI, 0); x.fill() // 萨克斯
    x.beginPath(); x.ellipse(158, 176, 24, 30, 0, 0, Math.PI * 2); x.fill(); x.fillRect(154, 120, 8, 40); x.beginPath(); x.arc(158, 118, 7, 0, Math.PI * 2); x.fill() // 低音提琴
    x.fillRect(196, 192, 32, 22); x.beginPath(); x.ellipse(196, 186, 14, 3, -0.2, 0, Math.PI * 2); x.fill(); x.beginPath(); x.ellipse(228, 186, 14, 3, 0.2, 0, Math.PI * 2); x.fill() // 鼓 + 镲
    x.fillStyle = '#e8c66a'; x.font = '15px "Noto Sans SC",sans-serif'; x.fillText('每晚两场 · 随换班开演', 128, 330)
    x.font = '700 16px "Noto Sans SC",sans-serif'; x.fillText('四位乐手 · 绝无危险！', 128, 352)
    x.fillStyle = 'rgba(80,80,90,.8)'; x.font = '12px "KaiTi","STKaiti",serif'; x.textAlign = 'right'; x.fillText('（站着，低头）', 236, 372)
  }))
}
function box(g: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material, name = '') {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.name = name; o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o
}
function cyl(g: THREE.Object3D, r0: number, r1: number, h: number, x: number, y: number, z: number, m: THREE.Material, seg = 16) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o
}
/** 琴凳（JAZZ_BENCH：凳面 0.48、宽 0.9 × 深 0.36）；局部：琴凳中心在 x = −(0.695 + z) 处（钢琴原点朝 +X 摆时） */
function bench(z: number): THREE.Group {
  const g = new THREE.Group(); g.name = 'jazzBench'
  const B = JAZZ_BENCH
  box(g, B.d, 0.06, B.w, 0, B.y - 0.03, 0, M.leather())
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.04, B.y - 0.06, 0.04, sx * (B.d / 2 - 0.04), (B.y - 0.06) / 2, sz * (B.w / 2 - 0.05), M.woodDk())
  g.position.set(z, 0, 0)
  return g
}
export function buildJazzProp(s: Structure): THREE.Group {
  const g = new THREE.Group(); g.name = 'jazz_' + String(s.data?.prop)
  const w = s.w ?? 1, h = s.h ?? 1, ox = Number(s.data?.ox ?? 0), oy = Number(s.data?.oy ?? 0)
  switch (s.data?.prop) {
    case 'stage': {
      const H = 0.45
      const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, h), M.stage()); top.position.set(w / 2, H - 0.025, h / 2); top.receiveShadow = true; g.add(top)
      box(g, w - 0.04, H - 0.05, h - 0.04, w / 2, (H - 0.05) / 2, h / 2, M.skirt())
      // 台口（西沿）金线 + 脚灯
      box(g, 0.04, 0.04, h, 0.02, H - 0.02, h / 2, M.gold())
      for (const sz of [0, 1]) box(g, w, 0.04, 0.04, w / 2, H - 0.02, sz * h + (sz ? -0.02 : 0.02), M.gold())
      for (let i = 0; i < h * 2; i++) { const b = cyl(g, 0.035, 0.05, 0.05, 0.12, H + 0.025, 0.25 + i * 0.5, M.bulb(), 10); b.castShadow = false }
      // 东墙幕布（褶皱：一排竖圆柱）
      for (let i = 0; i < h * 6; i++) cyl(g, 0.09, 0.09, 3.2, w - 0.12 - (i % 2) * 0.06, H + 1.6, 0.08 + i / 6, M.velvet(), 8)
      box(g, 0.08, 0.3, h, w - 0.08, H + 3.25, h / 2, M.velvet())
      box(g, 0.05, 0.05, h, w - 0.12, H + 3.08, h / 2, M.gold())
      // 谱架（头儿 / 萨克斯 / 低音提琴前面各一，按 JAZZ_STAND 摆在他们左前方；纯装饰）
      for (const [z0, x0] of JAZZ_STAND_LOCAL) { const st = buildMusicStand(); st.position.set(x0 - 0.5, H, z0 + 0.78); st.rotation.y = -Math.PI / 2 - 0.9; g.add(st) }
      // [修] 台口两侧装饰柱（餐厅墙上的木壁柱在舞台背后不做，柱子挪到台口两角、立在台面上）+ 顶上一道金边帷幔横楣
      const Cc = JAZZ_COLUMN, ch = Cc.h
      for (const zc of [Cc.inset, h - Cc.inset]) {
        box(g, Cc.r * 2.6, 0.1, Cc.r * 2.6, Cc.inset, H + 0.05, zc, M.woodDk()); box(g, Cc.r * 2.2, 0.05, Cc.r * 2.2, Cc.inset, H + 0.125, zc, M.gold())
        cyl(g, Cc.r, Cc.r * 1.08, ch - 0.4, Cc.inset, H + 0.15 + (ch - 0.4) / 2, zc, M.woodDk(), 16)
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const fl = box(g, 0.012, ch - 0.6, 0.012, Cc.inset + Math.cos(a) * Cc.r * 1.02, H + 0.25 + (ch - 0.6) / 2, zc + Math.sin(a) * Cc.r * 1.02, M.gold()); fl.castShadow = false }
        for (const y of [H + 0.3, H + ch - 0.32]) { const rg = new THREE.Mesh(new THREE.TorusGeometry(Cc.r * 1.06, 0.018, 8, 20), M.gold()); rg.rotation.x = Math.PI / 2; rg.position.set(Cc.inset, y, zc); g.add(rg) }
        cyl(g, Cc.r * 1.5, Cc.r * 1.1, 0.18, Cc.inset, H + ch - 0.16, zc, M.gold(), 16); box(g, Cc.r * 2.8, 0.08, Cc.r * 2.8, Cc.inset, H + ch + 0.02, zc, M.woodDk())
      }
      box(g, 0.22, 0.34, h - Cc.inset * 2 + 0.2, Cc.inset, H + ch + 0.23, h / 2, M.velvet()) // 横楣（红丝绒）
      for (const y of [H + ch + 0.07, H + ch + 0.39]) box(g, 0.24, 0.035, h - Cc.inset * 2 + 0.22, Cc.inset, y, h / 2, M.gold())
      for (let i = 0; i < 9; i++) { const z = Cc.inset + 0.3 + i * ((h - Cc.inset * 2 - 0.6) / 8); cyl(g, 0.012, 0.03, 0.16, Cc.inset - 0.06, H + ch - 0.03, z, M.gold(), 8) } // 流苏
      break
    }
    case 'steps': {
      for (let i = 0; i < 3; i++) box(g, w, 0.15 * (i + 1), 0.3, w / 2, 0.075 * (i + 1), 0.15 + i * 0.3 + 0.1, M.stage())
      box(g, w, 0.03, 0.03, w / 2, 0.45, 1, M.gold())
      break
    }
    case 'piano': {
      const p = buildUprightPiano(); p.position.set(ox, 0.45, oy); p.rotation.y = -Math.PI / 2; g.add(p) // 琴键朝西（鼓手坐在西边，面朝东）
      const b = bench(-(0.695 - JAZZ_BENCH.z)); b.position.x += ox; b.position.y = 0.45; b.position.z = oy; g.add(b)
      break
    }
    case 'rug': {
      // 地毯可能被 chunk 边界切成几块（pushClipped）：每块按它在整块地毯（rx, ry, rw, rh）里的位置取贴图，四周留 0.1 m
      // rx / ry = 这一块在整块地毯里的偏移（格）；换成本块局部坐标：整块地毯原点在 (−rx, −ry)
      const rx = s.x - Number(s.data?.rx ?? 0), ry = s.y - Number(s.data?.ry ?? 0), rw = Number(s.data?.rw ?? w), rh = Number(s.data?.rh ?? h)
      const ax = Math.max(s.x, rx + 0.1), ay = Math.max(s.y, ry + 0.1), bx2 = Math.min(s.x + w, rx + rw - 0.1), by2 = Math.min(s.y + h, ry + rh - 0.1)
      const geo = new THREE.PlaneGeometry(bx2 - ax, by2 - ay)
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute, pos = geo.getAttribute('position') as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) { const wx = (ax + bx2) / 2 + pos.getX(i), wz = (ay + by2) / 2 - pos.getY(i); uv.setXY(i, (wx - rx) / rw, 1 - (wz - ry) / rh) }
      const r = new THREE.Mesh(geo, M.rug()); r.rotation.x = -Math.PI / 2; r.position.set((ax + bx2) / 2 - s.x, 0.012, (ay + by2) / 2 - s.y); r.receiveShadow = true; g.add(r)
      break
    }
    case 'bar': {
      const T = JAZZ_BAR.y
      box(g, w, T - 0.06, 0.62, w / 2, (T - 0.06) / 2, 0.4, M.wood()) // 柜身（近边 = 南沿 z 1.0 往里 0.34 是站位前沿：JAZZ_BAR.z）
      box(g, w + 0.06, 0.06, 0.74, w / 2, T - 0.03, 0.66 - 0.37 + 0.37 - 0.03, M.marble())
      const rail = cyl(g, 0.025, 0.025, w, w / 2, 0.18, 0.78, M.gold(), 12); rail.rotation.z = Math.PI / 2 // 黄铜脚踏
      // 台面上：扎啤龙头、两瓶辣椒酱、杯子、几瓶酒；背后墙上酒架
      for (let i = 0; i < 3; i++) { cyl(g, 0.012, 0.012, 0.3, 0.6 + i * 0.12, T + 0.15, 0.3, M.chrome(), 8) }
      for (const [x0, z0] of [[1.7, 0.55], [3.9, 0.5]] as const) { const hs = buildHotSauce(); hs.position.set(x0, T, z0); g.add(hs) }
      for (const [x0, z0] of [[2.4, 0.58], [3.1, 0.6]] as const) { const mg = buildBeerMug(); mg.position.set(x0, T, z0); g.add(mg) }
      box(g, w - 0.4, 0.04, 0.22, w / 2, 1.6, 0.13, M.woodDk())
      for (let i = 0; i < 12; i++) { const c = ['#3a5a2a', '#6a3a1a', '#d9c8a0', '#2a2a40'][i % 4]; cyl(g, 0.035, 0.035, 0.26, 0.4 + i * (w - 0.8) / 11, 1.75, 0.13, M.bottle(c), 10) }
      break
    }
    case 'stool': {
      cyl(g, 0.2, 0.2, 0.07, ox, 0.78, oy, M.leather(), 18)
      cyl(g, 0.03, 0.03, 0.75, ox, 0.38, oy, M.chrome(), 10)
      cyl(g, 0.22, 0.24, 0.03, ox, 0.015, oy, M.chrome(), 18)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 20), M.chrome()); ring.rotation.x = Math.PI / 2; ring.position.set(ox, 0.3, oy); g.add(ring)
      break
    }
    case 'cctv': {
      const z = Number(s.data?.z ?? 2.95), ax = Number(s.data?.ax ?? -1), ay = Number(s.data?.ay ?? 1)
      const piv = new THREE.Group(); piv.name = 'cctvPivot'; piv.position.set(ox, z, oy)
      const cam = buildCctvCamera(); cam.scale.setScalar(JAZZ_CCTV_SCALE); piv.add(cam)
      const f = Math.atan2(ay, ax); piv.rotation.y = Math.PI / 2 - f
      piv.userData.base = piv.rotation.y; piv.userData.led = cam.userData.led
      g.add(piv); g.userData.pivot = piv
      box(g, 0.12, 0.12, 0.02, ox + 0.12, z, oy - 0.12, M.chrome()) // 墙角底座
      break
    }
    case 'poster': {
      const fr = box(g, 0.66, 0.96, 0.02, 0.5, 1.75, 1 - 0.05, M.gold()); void fr // 墙面装饰层在格边内 0.036 m：海报再往里一点
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), M.poster()); pl.position.set(0.5, 1.75, 1 - 0.062); pl.rotation.y = Math.PI; g.add(pl)
      break
    }
  }
  g.position.set(s.x, 0, s.y)
  return g
}
/** 监控探头放大倍数（原模型机身 0.2 m；墙角 2.95 m 高、离观众区中心约 6 m，×3 才看得清） */
export const JAZZ_CCTV_SCALE = 3.0
export const JAZZ_DYN_PROPS = new Set(['cctv'])
/** 动态件：监控探头——你在观众区时转过来盯着你；平时缓慢扫视；终曲时红灯快闪 */
export function syncJazzProp(g: THREE.Group, s: Structure, eng: Engine | null, dt: number) {
  const piv = g.userData.pivot as THREE.Group | undefined
  if (!piv || !eng) return
  const base = piv.userData.base as number
  const t = (piv.userData.t = ((piv.userData.t as number) ?? 0) + dt)
  let want = base + Math.sin(t * 0.25) * 0.35
  if (jazzInAudience(eng)) { const p = eng.player, wx = p.x - (g.position.x + piv.position.x), wy = p.y - (g.position.z + piv.position.z); want = Math.PI / 2 - Math.atan2(wy, wx) }
  let d = want - piv.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d))
  piv.rotation.y += d * Math.min(1, dt * 1.5)
  const r = jazzDebug(eng), led = piv.userData.led as THREE.Mesh | undefined
  if (led) led.visible = r.phase === 'finale' ? Math.floor(t * 6) % 2 === 0 : Math.floor(t * 1.2) % 2 === 0
  void s
}
