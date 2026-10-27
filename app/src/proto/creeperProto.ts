// 爬菌（Entity 17）重制·阶段 1 建模预览：proto-creeper.html?view=rats|spiders|zombie|human|arms|ball[&cpu=1]
//   rats    尸鼠 0–4 阶并排          spiders 洞穴狼蛛 0–4 阶并排（&v=变种）
//   zombie  僵尸蜘蛛装饰特写（墙角 + 乱网）  human 爬菌人正面 / 侧面 / 背面  humanclose 脸部特写  compare 与 4 阶玩家手臂并排
//   arms    第一人称手臂 0–4 阶（与游戏同参数的 72° 相机 + vm 节点；下排为特写）  ball 绒球单体特写（检查绒毛质感）
// 阶段 2 动画：?anim=1&host=rat|spider|human|hand&clip=…&stage=1[&stages=1,4][&strip=6][&t=秒][&move=1]
//   stages：并排比较几个阶段（每格一个）；strip：把一个循环均分成 N 帧排成一行（每个阶段一行）；t：固定时刻（截图用），
//   不给 t 就实时播放；move=1：按片段速度向前移动、镜头跟随。window.__frame(t) 同步渲染 t 秒那一帧（GIF 逐帧截图用）。
// 截图由 scripts/verify-creeper.mjs 驱动（无头 Chromium，端口 3495）。&cam=x,y,z&look=x,y,z 覆盖机位（单视口视图）。
import * as THREE from 'three'
import { buildRatMesh } from '../game/renderer/ratMesh'
import { buildArachnidMesh, type ArachnidVariant } from '../game/renderer/arachnidMesh'
import { buildInfectedRat, buildInfectedArachnid, buildZombieSpiderDecor, buildCreeperHuman, creepHandOverlay, creepHandLook, CREEP_CLAW_HAND_POSE, growCreep, CreepSurface, setCreepTime, type CreepStage } from '../game/renderer/creeperMesh'
import { animateCreeper, creeperClipInfo, creeperLungeRoot, CREEPER_CLIPS, type CreeperClip } from '../game/renderer/creeperAnim'
import { buildCreeperEntityMesh, applyCreepLod, creepMeshStats, CreepViewHands, CREEP_LOD, buildSporeClusterMesh } from '../game/renderer/creeperRender'
import { buildViewmodel } from '../game/renderer/viewmodel'
import { buildRetroHand, heldHandPose, sleeveKindOf } from '../game/renderer/viewmodel'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'
import { setMaterialMode } from '../game/renderer/shared'

const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'rats'
if (q.get('real') === '1') setMaterialMode('realistic')
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setSize(W, H); renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)
const lab = document.getElementById('lab')!
const info: Record<string, unknown> = {}
const STAGE_ZH = ['0 阶 · 原模型', '1 阶 · 几个小白点', '2 阶 · 绒毛痘', '3 阶 · 大片覆盖', '4 阶 · 基本被白绒包裹']
const count = (g: THREE.Object3D) => { let c = 0, t = 0, inst = 0; g.traverse((m: any) => { if ((m.isMesh || m.isLineSegments) && m.visible !== false) { c++; if (m.isMesh) { const k = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; t += m.isInstancedMesh ? k * m.count : k; if (m.isInstancedMesh) inst += m.count } } }); return { draws: c, tris: Math.round(t), inst } }
const label = (x: number, y: number, html: string) => lab.insertAdjacentHTML('beforeend', `<div class="l" style="left:${x}px;top:${y}px">${html}</div>`)
const proj = (p: THREE.Vector3, cam: THREE.Camera, vx = 0, vy = 0, vw = W, vh = H) => { const v = p.clone().project(cam); return [vx + (v.x * 0.5 + 0.5) * vw, vy + (-v.y * 0.5 + 0.5) * vh] }
const vec = (s: string | null) => s ? new THREE.Vector3(...s.split(',').map(Number) as [number, number, number]) : null

/** 地下室式布光：暗背景、偏暖的主光 + 冷补光（白绒在暗处要读得出来，但不能过曝成塑料） */
function basement(scene: THREE.Scene, floorCol = '#3b3833', bg = '#16151300') {
  scene.background = new THREE.Color(bg.slice(0, 7))
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: floorCol })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; scene.add(fl)
  scene.add(new THREE.HemisphereLight('#e8e2d4', '#2a2620', 0.9))
  const key = new THREE.DirectionalLight('#fff2dc', 1.6); key.position.set(2.2, 4, 3); key.castShadow = true; key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.1, far: 12 }); key.shadow.bias = -0.0005; scene.add(key)
  const fill = new THREE.DirectionalLight('#c8d2e6', 0.45); fill.position.set(-3, 1.5, 1); scene.add(fill)
  return fl
}
/** ?cpu=1：场景里若有 SkinnedMesh 就走 QA CPU 蒙皮替身（爬菌人已改为无蒙皮的关节层级，GPU / cpu=1 渲染结果相同） */
function cpuSkin(scene: THREE.Scene) { if (QA_CPU_SKIN) syncSceneCpuSkins(scene) }
/** 渲染到：时间够了、至少画了 4 帧、并且复古人物的共享贴图都已到位（软件渲染下首帧编译着色器很慢，图片可能晚于首帧到达） */
function texturesReady() {
  let ok = true
  for (const sc of scenes) sc.traverse((o) => { const m = (o as THREE.Mesh).material; for (const x of Array.isArray(m) ? m : m ? [m] : []) { const t = (x as THREE.MeshLambertMaterial).map; if (t?.userData.retroShared && !t.userData.ready) ok = false } })
  return ok
}
const scenes: THREE.Scene[] = []
const finish = (draw: () => void, ms = 2500) => { const t0 = performance.now(); let n = 0, after = 0; const loop = () => { draw(); n++; const ready = performance.now() - t0 > ms && n >= 4 && texturesReady(); if (ready) after++; if (after < 3 && performance.now() - t0 < 60000) requestAnimationFrame(loop); else { (window as any).__info = info; (window as any).__ready = true } }; loop() }

if (q.get('anim') === '1') {
  // ---------------- 阶段 2 动画预览 ----------------
  const host = (q.get('host') ?? 'rat') as 'rat' | 'spider' | 'human' | 'hand'
  const kind = host === 'human' ? 'human' : host === 'hand' ? 'hand' : 'host'
  const clip = (q.get('clip') ?? (host === 'human' ? 'crawl' : host === 'hand' ? 'handTwitch' : 'walk')) as CreeperClip
  const stages = (q.get('stages') ?? q.get('stage') ?? (host === 'human' ? '4' : host === 'hand' ? '4' : '1')).split(',').map(Number) as CreepStage[]
  const strip = Number(q.get('strip') ?? 0)
  const move = q.get('move') === '1'
  const cols = strip || stages.length, rows = strip ? stages.length : 1
  const cw = Math.floor(W / cols), ch = Math.floor(H / rows)
  const ZH = { rat: '尸鼠', spider: '洞穴狼蛛', human: '爬菌人', hand: '第一人称手臂' }[host]
  // 地面：水泥纹理（移动时看得出位移）
  const floorTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d')!
    x.fillStyle = '#3a3631'; x.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 2600; i++) { const v = 40 + Math.random() * 40; x.fillStyle = `rgba(${v + 20},${v + 14},${v + 6},0.35)`; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3) }
    x.strokeStyle = 'rgba(20,18,15,0.6)'; x.lineWidth = 2; x.strokeRect(0, 0, 256, 256)
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.colorSpace = THREE.SRGBColorSpace; return t
  })()
  interface Cell { sc: THREE.Scene; cm: THREE.PerspectiveCamera; ent: THREE.Object3D; stage: CreepStage; t0: number; x: number; y: number; cam0: THREE.Vector3; look0: THREE.Vector3; hand?: boolean }
  const cells: Cell[] = []
  const camFor = (): [THREE.Vector3, THREE.Vector3, number] => {
    const c = vec(q.get('cam')), l = vec(q.get('look'))
    const d: Record<string, [number[], number[], number]> = {
      rat: [[0.2, 0.36, 1.5], [0.04, 0.07, 0], 30], spider: [[0.3, 0.62, 1.75], [0.05, 0.1, 0], 30],
      human: clip === 'crawl' || clip === 'lunge' ? [[2.35, 0.7, 0.75], [0, 0.15, 0.22], 32] : [[1.25, 0.72, 1.75], [0, 0.17, 0.2], 32], hand: [[0, 0, 0], [0, 0, 0], 34],
    }
    const [cc, ll, f] = d[host]
    return [c ?? new THREE.Vector3(...cc as [number, number, number]), l ?? new THREE.Vector3(...ll as [number, number, number]), f]
  }
  const durOf = (st: CreepStage) => {
    if (host === 'spider' && clip === 'walk') return (4 * 0.8) / [1, 0.88, 0.74, 0.6, 0.48][st]
    return creeperClipInfo(kind, clip, st, { spider: host === 'spider' }).dur
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const st = stages[strip ? r : c]
    const sc = new THREE.Scene(); scenes.push(sc)
    let ent: THREE.Object3D, cm: THREE.PerspectiveCamera
    const [cam0, look0, fov] = camFor()
    if (host === 'hand') {
      sc.background = new THREE.Color('#5d5534')
      sc.add(new THREE.HemisphereLight('#fff3d0', '#4a4330', 1.1)); const dl = new THREE.DirectionalLight('#fff0d0', 1.3); dl.position.set(-1, 2, 1.5); sc.add(dl)
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshLambertMaterial({ color: '#a8975a' })); wall.position.set(0, 0, -2.5); sc.add(wall)
      const fp = new THREE.PerspectiveCamera(72, 1, 0.02, 20); sc.add(fp)
      const vm = new THREE.Group(); fp.add(vm); vm.position.set(0.27, -0.3, -0.55); vm.rotation.order = 'YXZ'
      const hand = buildRetroHand(); hand.setLook(creepHandLook({ skin: '#c9a58a', sleeve: '#3a3f46', sleeveKind: sleeveKindOf(0), topStyle: 0 }, st)); hand.setPose(st === 4 ? CREEP_CLAW_HAND_POSE : heldHandPose('')); vm.add(hand.group)
      ent = creepHandOverlay(hand, st, 3).group
      ent.userData.basePose = st === 4 ? CREEP_CLAW_HAND_POSE : heldHandPose('')
      sc.updateMatrixWorld(true)
      const tgt = new THREE.Vector3(0.27, -0.27, -0.56).applyMatrix4(fp.matrixWorld)
      cm = new THREE.PerspectiveCamera(fov, cw / ch, 0.01, 20); cm.position.set(tgt.x + Math.sin(0.95) * Math.cos(0.25) * 0.4, tgt.y + Math.sin(0.25) * 0.4, tgt.z + Math.cos(0.95) * Math.cos(0.25) * 0.4); cm.lookAt(tgt)
      cam0.copy(cm.position); look0.copy(tgt)
    } else {
      const fl = basement(sc, '#ffffff'); (fl.material as THREE.MeshLambertMaterial).map = floorTex
      ent = host === 'rat' ? buildInfectedRat('common', 3, st) : host === 'spider' ? buildInfectedArachnid('wolf', 2, st) : buildCreeperHuman(Number(q.get('seed') ?? 0))
      sc.add(ent)
      cm = new THREE.PerspectiveCamera(fov, cw / ch, 0.01, 30); cm.position.copy(cam0); cm.lookAt(look0)
    }
    cells.push({ sc, cm, ent, stage: st, t0: strip ? (c / strip) * durOf(st) : 0, x: c * cw, y: H - (r + 1) * ch, cam0, look0, hand: host === 'hand' })
    const lab = strip ? `${host === 'human' ? '' : st + ' 阶 · '}t=${(c / strip * durOf(st)).toFixed(2)}s` : (host === 'human' ? `${ZH} · ${(CREEPER_CLIPS.human as Record<string, { zh: string }>)[clip]?.zh ?? clip}` : `${ZH} · ${st} 阶 · ${clip}`)
    label(c * cw + cw / 2, r * ch + 6, lab)
  }
  info.anim = { host, clip, stages, dur: stages.map(durOf) }
  const speedOf = (st: CreepStage) => {
    if (host === 'human') return (CREEPER_CLIPS.human as Record<string, { speed?: number }>)[clip]?.speed ?? 0
    const sp = creeperClipInfo('host', clip, st, { spider: host === 'spider' }).speed ?? 0
    return sp * (host === 'rat' ? 0.35 : 0.3)
  }
  const draw = (t: number) => {
    renderer.setScissorTest(true)
    for (const c of cells) {
      const tt = t + c.t0
      setCreepTime(tt)
      animateCreeper(c.ent, clip, tt, c.stage, c.hand ? { base: c.ent.userData.basePose } : {})
      // 阶段 3：爬菌人 lunge 带根位移——游戏里由 AI 推着实体走，预览这里按同一条曲线挪根（片段里的身体相对根留在原处）
      if (host === 'human' && clip === 'lunge' && !move) c.ent.position.z = creeperLungeRoot(tt)
      if (move && !c.hand) {
        // 实体朝向：宿主正面 +X、爬菌人 +Z；按片段速度前移，镜头跟随
        const d = speedOf(c.stage) * tt, dir = host === 'human' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)
        c.ent.position.copy(dir).multiplyScalar(d)
        c.cm.position.copy(c.cam0).addScaledVector(dir, d); c.cm.lookAt(c.look0.clone().addScaledVector(dir, d))
      }
      renderer.setViewport(c.x + 1, c.y + 1, cw - 2, ch - 2); renderer.setScissor(c.x + 1, c.y + 1, cw - 2, ch - 2)
      c.cm.aspect = (cw - 2) / (ch - 2); c.cm.updateProjectionMatrix()
      renderer.render(c.sc, c.cm)
    }
  }
  ;(window as any).__frame = (t: number) => { draw(t); (window as any).__frameT = t; return true }
  const fixed = q.get('t')
  if (fixed !== null) finish(() => draw(Number(fixed)), 3000)
  else { const t0 = performance.now(); finish(() => draw((performance.now() - t0) / 1000), 3000); const live = () => { draw((performance.now() - t0) / 1000); requestAnimationFrame(live) }; setTimeout(live, 3200) }
} else if (view === 'lod') {
  // ---------------- 阶段 3：LOD 三档对比（每行一个模型，三列 = 近 / 中 / 远档，同一机位放大看差别）----------------
  const rows = [
    { name: '尸鼠感染体 4 阶', o: { host: 'rat' as const, stage: 4, morph: 'common' as const, seed: 3 }, cam: [0.62, 0.34, 0.78], look: [0.02, 0.07, 0] },
    { name: '蛛形纲感染体 4 阶', o: { host: 'arachnid' as const, stage: 4, variant: 'wolf', seed: 2 }, cam: [0.95, 0.62, 1.15], look: [0.0, 0.1, 0] },
    { name: '爬菌人', o: { host: 'human' as const, stage: 5, seed: 0 }, cam: [1.35, 0.8, 1.45], look: [0.15, 0.17, 0] },
  ]
  const cols = 3, cw = Math.floor(W / cols), ch = Math.floor(H / rows.length)
  const jobs: { sc: THREE.Scene; cm: THREE.PerspectiveCamera; x: number; y: number }[] = []
  const stats: Record<string, unknown> = {}
  rows.forEach((r, ri) => {
    for (let l = 0; l < 3; l++) {
      const sc = new THREE.Scene(); scenes.push(sc); basement(sc)
      const g = buildCreeperEntityMesh(r.o); g.rotation.y = -0.6; sc.add(g)
      if (r.o.host === 'human') animateCreeper(g.userData.creepTarget, 'idle', 1.2, 4)
      applyCreepLod(g, l as 0 | 1 | 2)
      const st = creepMeshStats(g); stats[r.name + ':' + l] = st
      const cm = new THREE.PerspectiveCamera(30, cw / ch, 0.01, 30); cm.position.set(...r.cam as [number, number, number]); cm.lookAt(...r.look as [number, number, number])
      jobs.push({ sc, cm, x: l * cw, y: H - (ri + 1) * ch })
      const L = CREEP_LOD.levels[l], dist = l === 0 ? `< ${CREEP_LOD.NEAR} m` : l === 1 ? `${CREEP_LOD.NEAR}–${CREEP_LOD.FAR} m` : `> ${CREEP_LOD.FAR} m`
      label(l * cw + cw / 2, ri * ch + 6, `${r.name} · ${L.name}档（${dist}）<br><span class="s">${st.tris.toLocaleString()} 三角形 · ${st.draws} 次绘制${l ? ` · 绒球 ${['1280', '320', '80'][L.ballGeo]} 面 ×${Math.round(L.inst * 100)}%` : ' · 全部绒球 + 绒毛晕 + 菌丝'}</span>`)
    }
  })
  info.lod = stats
  renderer.setScissorTest(true)
  finish(() => jobs.forEach(({ sc, cm, x, y }) => { renderer.setViewport(x + 2, y + 2, cw - 4, ch - 4); renderer.setScissor(x + 2, y + 2, cw - 4, ch - 4); cm.aspect = (cw - 4) / (ch - 4); cm.updateProjectionMatrix(); renderer.render(sc, cm) }), 3500)
} else if (view === 'spores') {
  const scene = new THREE.Scene(); scenes.push(scene); basement(scene)
  const g = buildSporeClusterMesh(1); scene.add(g)
  const cam = new THREE.PerspectiveCamera(32, W / H, 0.01, 10); cam.position.set(0.55, 0.42, 0.6); cam.lookAt(0, 0.03, 0)
  info.spores = creepMeshStats(g)
  label(W / 2, 10, `孢子团（感染体死后留下）<br><span class="s">${(info.spores as any).tris} 三角形 · ${(info.spores as any).draws} 次绘制</span>`)
  finish(() => renderer.render(scene, cam))
} else if (view === 'fp') {
  // ---------------- 阶段 3：第一人称手臂接入后（与 renderer 同一个 CreepViewHands：病程阶段 → 菌斑 / 发红 / 空手痉挛 / 4 阶爪形）----------------
  // 上排：游戏画面（72° 相机，整屏 16:9，右手空手 + 左手手电，同 buildViewmodel 的 vm 位置）；下排：右手特写。&t= 痉挛时刻
  const stages: (0 | 2 | 3 | 4)[] = [0, 2, 3, 4]
  const NAME = ['未感染 / 病程 1 阶（手上看不出）', '病程 2 阶 · 绒毛痘', '病程 3 阶 · 整条手臂覆盖 · 手指痉挛', '病程 4 阶 · 发红 · 长指甲爪形 · 痉挛']
  const cols = stages.length, cw = Math.floor(W / cols), chs = [Math.round(cw * 9 / 16), H - Math.round(cw * 9 / 16)]
  const tw = Number(q.get('t') ?? 0.62)
  const jobs: { sc: THREE.Scene; cm: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }[] = []
  const baseLook = { skin: '#c9a58a', sleeve: '#3a3f46', sleeveKind: sleeveKindOf(0), topStyle: 0 }
  for (let r = 0; r < 2; r++) stages.forEach((s, i) => {
    const sc = new THREE.Scene(); scenes.push(sc); sc.background = new THREE.Color('#5d5534')
    sc.add(new THREE.HemisphereLight('#fff3d0', '#4a4330', 1.1)); const dl = new THREE.DirectionalLight('#fff0d0', 1.3); dl.position.set(-1, 2, 1.5); sc.add(dl)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshLambertMaterial({ color: '#a8975a' })); wall.position.set(0, 0, -2.5); sc.add(wall)
    const ch = chs[r], cy0 = r === 0 ? 0 : chs[0]
    const cm = new THREE.PerspectiveCamera(72, cw / ch, 0.02, 20); sc.add(cm)
    // 与游戏同一个 buildViewmodel（右手 vm + 左手手电 vmFlash）
    const vm = new THREE.Group(), vmFlash = new THREE.Group()
    const parts = buildViewmodel(vm, vmFlash, cm)
    const right = parts.right, left = parts.left
    right.setLook(creepHandLook(baseLook, s)); left.setLook(creepHandLook(baseLook, s))
    const ch2 = new CreepViewHands(); ch2.setStage(s)
    const baseQ = right.group.quaternion.clone()
    ch2.update(right, tw, s >= 3 ? { baseQ, seed: 1 } : undefined)
    ch2.update(left, tw)
    if (r === 1) {
      sc.updateMatrixWorld(true)
      const tgt = new THREE.Vector3(0.27, -0.27, -0.56).applyMatrix4(cm.matrixWorld)
      const c2 = new THREE.PerspectiveCamera(34, cw / ch, 0.01, 20)
      c2.position.set(tgt.x + Math.sin(0.95) * Math.cos(0.25) * 0.4, tgt.y + Math.sin(0.25) * 0.4, tgt.z + Math.cos(0.95) * Math.cos(0.25) * 0.4); c2.lookAt(tgt); sc.add(c2)
      jobs.push({ sc, cm: c2, x: i * cw, y: H - cy0 - ch, w: cw, h: ch })
    } else jobs.push({ sc, cm, x: i * cw, y: H - cy0 - ch, w: cw, h: ch })
    label(i * cw + cw / 2, cy0 + 6, r === 0 ? `游戏画面 · ${NAME[i]}` : `右手特写 · ${NAME[i]}`)
  })
  renderer.setScissorTest(true)
  finish(() => jobs.forEach(({ sc, cm, x, y, w, h }) => { renderer.setViewport(x + 2, y + 2, w - 4, h - 4); renderer.setScissor(x + 2, y + 2, w - 4, h - 4); cm.aspect = (w - 4) / (h - 4); cm.updateProjectionMatrix(); renderer.render(sc, cm) }), 3000)
} else if (view === 'rats' || view === 'spiders') {
  const scene = new THREE.Scene(); scenes.push(scene); basement(scene)
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.02, 40)
  const items: THREE.Group[] = []
  const rats = view === 'rats'
  const v = (q.get('v') ?? 'wolf') as ArachnidVariant
  const gap = rats ? 0.6 : 1.22
  for (let s = 0 as CreepStage; s <= 4; s = (s + 1) as CreepStage) {
    const g = rats ? (s === 0 ? buildRatMesh('common', 3) : buildInfectedRat('common', 3, s)) : (s === 0 ? buildArachnidMesh(v, 2) : buildInfectedArachnid(v, 2, s))
    g.position.x = (s - 2) * gap
    g.rotation.y = rats ? -0.55 : -0.75 // 3/4 侧面（正面 +X 朝镜头右前方）
    scene.add(g); items.push(g)
    info['s' + s] = count(g)
  }
  const cz = rats ? 2.45 : 4.3, cy = rats ? 0.72 : 1.4
  const hfov = rats ? 66 : 66 // 按水平视角定机位：画面宽度刚好放下五只
  cam.fov = 2 * Math.atan(Math.tan(hfov / 2 * Math.PI / 180) / (W / H)) * 180 / Math.PI
  cam.position.set(0, cy, cz); cam.lookAt(0, rats ? 0.09 : 0.16, 0)
  const c = vec(q.get('cam')), lk = vec(q.get('look')); if (c) cam.position.copy(c); if (lk || c) cam.lookAt(lk ?? new THREE.Vector3(0, 0.1, 0))
  cam.updateProjectionMatrix(); scene.updateMatrixWorld(true)
  items.forEach((g, s) => { const [x] = proj(new THREE.Vector3(g.position.x, 0, 0), cam); label(x, H - 58, `${STAGE_ZH[s]}<br><span class="s">${(info['s' + s] as any).inst} 绒球</span>`) })
  label(W / 2, 10, rats ? '尸鼠（常见种）· 爬菌感染 0–4 阶' : `蛛形纲（${v === 'wolf' ? '洞穴狼蛛' : v}）· 爬菌感染 0–4 阶`)
  finish(() => renderer.render(scene, cam))
} else if (view === 'zombie') {
  // 墙角：两面暗木墙 + 上方横梁，尸体挂在乱网上（参照图的地窖角落）
  const scene = new THREE.Scene(); scenes.push(scene); scene.background = new THREE.Color('#0d0c0b')
  const wood = new THREE.MeshLambertMaterial({ color: '#3a2a1e' })
  const wA = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), wood); wA.position.set(0.6, -0.5, 0); scene.add(wA)
  const wB = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshLambertMaterial({ color: '#2c2219' })); wB.rotation.y = Math.PI / 2; wB.position.set(0, -0.5, 0.6); scene.add(wB)
  const beam = new THREE.Mesh(new THREE.BoxGeometry(2, 0.12, 2), new THREE.MeshLambertMaterial({ color: '#4a3424' })); beam.position.set(0.6, 0.06, 0.6); scene.add(beam)
  for (const w of [wA, wB, beam]) w.receiveShadow = true
  scene.add(new THREE.HemisphereLight('#d8d2c4', '#1a1612', 0.55))
  const flash = new THREE.SpotLight('#fff4e0', 2.6, 4, 0.6, 0.6, 1.2); flash.position.set(0.9, 0.05, 1.2); flash.target.position.set(0.14, -0.2, 0.13); flash.castShadow = true; flash.shadow.mapSize.set(2048, 2048); scene.add(flash, flash.target)
  const d = buildZombieSpiderDecor(Number(q.get('seed') ?? 1)); scene.add(d)
  info.zombie = count(d)
  const cam = new THREE.PerspectiveCamera(34, W / H, 0.01, 10)
  cam.position.set(0.62, -0.08, 0.66); cam.lookAt(0.13, -0.21, 0.12)
  const c = vec(q.get('cam')), lk = vec(q.get('look')); if (c) cam.position.copy(c); if (lk || c) cam.lookAt(lk ?? new THREE.Vector3(0.13, -0.2, 0.12))
  label(W / 2, 10, `僵尸蜘蛛（静态装饰）<br><span class="s">${(info.zombie as any).draws} 次绘制 · ${(info.zombie as any).inst} 绒球</span>`)
  finish(() => renderer.render(scene, cam))
} else if (view === 'human') {
  // 正面 / 侧面 / 背面三格（侧面与背面专门检查腰下没有任何残留）
  const scene = new THREE.Scene(); scenes.push(scene); basement(scene, '#34312c')
  const h = buildCreeperHuman(Number(q.get('seed') ?? 0)); scene.add(h)
  const n = 3, cw = W / n
  const mk = (p: [number, number, number], l: [number, number, number]) => { const c = new THREE.PerspectiveCamera(30, cw / H, 0.02, 30); c.position.set(...p); c.lookAt(...l); return c }
  const cams = [mk([0.4, 0.85, 2.95], [0, 0.14, 0.12]), mk([2.85, 0.32, 0.14], [0, 0.17, 0.14]), mk([-0.85, 0.75, -1.95], [0, 0.16, 0.05])]
  ;['爬菌人（5 阶）· 正面', '侧面', '背面（断口与脊骨）'].forEach((t, i) => label(cw * (i + 0.5), 10, t))
  { scene.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(h); info.human = { ...count(h), bbox: [bb.min.toArray().map((x) => +x.toFixed(3)), bb.max.toArray().map((x) => +x.toFixed(3))], skinned: (() => { let k = 0; h.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) k++ }); return k })() } }
  renderer.setScissorTest(true)
  finish(() => {
    cpuSkin(scene)
    cams.forEach((c, i) => { renderer.setViewport(cw * i, 0, cw, H); renderer.setScissor(cw * i, 0, cw, H); renderer.render(scene, c) })
  }, 3500)
} else if (view === 'humanclose') {
  const scene = new THREE.Scene(); scenes.push(scene); basement(scene, '#34312c')
  const h = buildCreeperHuman(Number(q.get('seed') ?? 0)); scene.add(h)
  // &hidearm=L|R：特写时隐藏挡镜头的一条手臂（只用于看头颈）
  const ha = q.get('hidearm'); if (ha) (h.userData.creeperHuman.rig as Record<string, THREE.Object3D>)['upperArm' + ha].visible = false
  const cam = new THREE.PerspectiveCamera(26, W / H, 0.01, 30)
  cam.position.set(0.16, 0.36, 0.95); cam.lookAt(0.01, 0.31, 0.46)
  const c = vec(q.get('cam')), lk = vec(q.get('look')); if (c) cam.position.copy(c); if (lk || c) cam.lookAt(lk ?? new THREE.Vector3(0.01, 0.31, 0.46))
  label(W / 2, 10, q.get('title') ?? '爬菌人 · 脸部特写')
  finish(() => { cpuSkin(scene); renderer.render(scene, cam) }, 3500)
} else if (view === 'compare') {
  // 左：4 阶玩家手臂特写（与 arms 视图下排同机位）；中：爬菌人手臂同尺度特写；右：爬菌人整体
  const cw = Math.floor(W / 3)
  const jobs: { sc: THREE.Scene; cm: THREE.PerspectiveCamera; x: number }[] = []
  {
    const sc = new THREE.Scene(); scenes.push(sc); sc.background = new THREE.Color('#5d5534')
    sc.add(new THREE.HemisphereLight('#fff3d0', '#4a4330', 1.1)); const dl = new THREE.DirectionalLight('#fff0d0', 1.3); dl.position.set(-1, 2, 1.5); sc.add(dl)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshLambertMaterial({ color: '#a8975a' })); wall.position.set(0, 0, -2.5); sc.add(wall)
    const cm = new THREE.PerspectiveCamera(72, 1, 0.02, 20); sc.add(cm)
    const vm = new THREE.Group(); cm.add(vm); vm.position.set(0.27, -0.3, -0.55); vm.rotation.order = 'YXZ'
    const hand = buildRetroHand(); hand.setLook(creepHandLook({ skin: '#c9a58a', sleeve: '#3a3f46', sleeveKind: sleeveKindOf(0), topStyle: 0 }, 4)); hand.setPose(CREEP_CLAW_HAND_POSE); vm.add(hand.group)
    creepHandOverlay(hand, 4, 3)
    sc.updateMatrixWorld(true)
    const tgt = new THREE.Vector3(0.27, -0.27, -0.56).applyMatrix4(cm.matrixWorld)
    const c2 = new THREE.PerspectiveCamera(34, cw / H, 0.01, 20); c2.position.set(tgt.x + Math.sin(0.95) * Math.cos(0.25) * 0.4, tgt.y + Math.sin(0.25) * 0.4, tgt.z + Math.cos(0.95) * Math.cos(0.25) * 0.4); c2.lookAt(tgt); sc.add(c2)
    jobs.push({ sc, cm: c2, x: 0 })
  }
  {
    const sc = new THREE.Scene(); scenes.push(sc); basement(sc, '#34312c')
    sc.add(buildCreeperHuman(Number(q.get('seed') ?? 0)))
    const a = new THREE.PerspectiveCamera(34, cw / H, 0.01, 20); a.position.set(0.72, 0.22, 0.86); a.lookAt(0.41, 0.05, 0.6)
    const b = new THREE.PerspectiveCamera(30, cw / H, 0.02, 30); b.position.set(1.15, 0.85, 1.65); b.lookAt(0, 0.17, 0.15)
    jobs.push({ sc, cm: a, x: cw }, { sc, cm: b, x: cw * 2 })
  }
  label(cw * 0.5, 10, '4 阶玩家手臂（特写）'); label(cw * 1.5, 10, '5 阶爬菌人 · 右臂（同尺度）'); label(cw * 2.5, 10, '5 阶爬菌人 · 整体')
  renderer.setScissorTest(true)
  finish(() => jobs.forEach(({ sc, cm, x }) => { cpuSkin(sc); renderer.setViewport(x + 2, 2, cw - 4, H - 4); renderer.setScissor(x + 2, 2, cw - 4, H - 4); renderer.render(sc, cm) }), 3500)
} else if (view === 'arms') {
  // 上排：游戏视角（72° 相机，vm 与 buildViewmodel 同参数）；下排：特写（从右侧看手背与前臂）
  const cols = 5, rows = 2, cw = Math.floor(W / cols), chs = [Math.round(cw * 9 / 16), H - Math.round(cw * 9 / 16)] // 上排 16:9（游戏画面比例）
  const jobs: { sc: THREE.Scene; cm: THREE.PerspectiveCamera; x: number; y: number; w: number; h: number }[] = []
  const baseLook = { skin: '#c9a58a', sleeve: '#3a3f46', sleeveKind: sleeveKindOf(0), topStyle: 0 } // T 恤：露出前臂
  for (let r = 0; r < rows; r++) for (let s = 0 as CreepStage; s <= 4; s = (s + 1) as CreepStage) {
    const sc = new THREE.Scene(); scenes.push(sc); sc.background = new THREE.Color('#5d5534')
    sc.add(new THREE.HemisphereLight('#fff3d0', '#4a4330', 1.1)); const dl = new THREE.DirectionalLight('#fff0d0', 1.3); dl.position.set(-1, 2, 1.5); sc.add(dl)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshLambertMaterial({ color: '#a8975a' })); wall.position.set(0, 0, -2.5); sc.add(wall)
    const ch = chs[r], cy0 = r === 0 ? 0 : chs[0]
    const cm = new THREE.PerspectiveCamera(72, cw / ch, 0.02, 20); sc.add(cm)
    // 第一人称格：按 16:9 游戏画面取右下 1/4（setViewOffset），手的大小与比例与游戏一致、只是裁切放大
    if (r === 0) cm.setViewOffset(1280, 720, 560, 330, 720, 405)
    const vm = new THREE.Group(); cm.add(vm); vm.position.set(0.27, -0.3, -0.55); vm.rotation.order = 'YXZ'
    const hand = buildRetroHand(); hand.setLook(creepHandLook(baseLook, s)); hand.setPose(s === 4 ? CREEP_CLAW_HAND_POSE : heldHandPose('')); vm.add(hand.group)
    const ov = creepHandOverlay(hand, s, 3)
    info['arm' + s] = { ...count(ov.group) }
    if (r === 1) {
      sc.updateMatrixWorld(true)
      const tgt = new THREE.Vector3(0.27, -0.27, -0.56).applyMatrix4(cm.matrixWorld)
      const yw = 0.95, pt = 0.25, dist = 0.4
      const c2 = new THREE.PerspectiveCamera(34, cw / ch, 0.01, 20)
      c2.position.set(tgt.x + Math.sin(yw) * Math.cos(pt) * dist, tgt.y + Math.sin(pt) * dist, tgt.z + Math.cos(yw) * Math.cos(pt) * dist); c2.lookAt(tgt); sc.add(c2)
      jobs.push({ sc, cm: c2, x: s * cw, y: H - cy0 - ch, w: cw, h: ch })
    } else jobs.push({ sc, cm, x: s * cw, y: H - cy0 - ch, w: cw, h: ch })
    label(s * cw + cw / 2, cy0 + 6, r === 0 ? `第一人称（画面右下局部）· ${s} 阶` : `特写 · ${s} 阶${s === 4 ? '（爪形空手）' : ''}`)
  }
  renderer.setScissorTest(true)
  finish(() => jobs.forEach(({ sc, cm, x, y, w, h }) => {
    renderer.setViewport(x + 2, y + 2, w - 4, h - 4); renderer.setScissor(x + 2, y + 2, w - 4, h - 4)
    if (!cm.view) { cm.aspect = (w - 4) / (h - 4); cm.updateProjectionMatrix() }
    renderer.render(sc, cm)
  }), 3000)
} else {
  // ball：绒球单体（一根细棍上的关节 4 颗 + 一颗大球），检查晕圈 / 亮边 / 噪声
  const scene = new THREE.Scene(); scenes.push(scene); scene.background = new THREE.Color('#141312')
  scene.add(new THREE.HemisphereLight('#e8e2d4', '#2a2620', 0.8)); const key = new THREE.DirectionalLight('#fff2dc', 1.5); key.position.set(1, 2, 2); scene.add(key)
  const stick = new THREE.Group(); scene.add(stick)
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 6).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#8a7a64' })); stick.add(rod)
  const s = new CreepSurface(); s.addGeometry(rod.geometry)
  growCreep([{ node: stick, joints: [-0.2, -0.1, 0.1, 0.2].map((x) => ({ p: new THREE.Vector3(x, 0, 0), r: 0.004 })), core: { p: new THREE.Vector3(0, 0, 0), r: 0.04 }, surface: s }], 4, { size: 0.5 })
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 10); cam.position.set(0, 0.12, 0.75); cam.lookAt(0, 0, 0)
  finish(() => renderer.render(scene, cam))
}
