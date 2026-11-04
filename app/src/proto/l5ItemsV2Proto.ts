// [l5items v2] 物品细化预览：?mode=sheet 多角度 + 特写；?mode=dice 骰子投掷逐帧（window.__frame(i) 渲染第 i 帧，__frames 总帧数）。?cpu=1
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { setMaterialMode } from '../game/renderer/shared'
setMaterialMode('realistic')
const W = window as unknown as Record<string, unknown>
const q = new URLSearchParams(location.search), MODE = q.get('mode') ?? 'sheet'
async function main() {
  const { buildPhonograph, applyPhonographState } = await import('../game/renderer/phonographModel')
  const { buildL5ItemMesh, syncRoomCardLabel } = await import('../game/renderer/l5ItemModels')
  const { buildCasinoItemMesh } = await import('../game/renderer/casinoItemModels')
  const { buildThrownDie, dieVisual, DIE_HALF, drawDieIcon } = await import('../game/renderer/fateDieFx')
  const { simulateDieThrow, RESULT_FACE, FACE_AXES } = await import('../game/engine/fateDieSim')
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(1)
  r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05
  const env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), .04).texture
  const mkScene = (bg = '#2a1a16') => { const s = new THREE.Scene(); s.background = new THREE.Color(bg); s.environment = env; s.add(new THREE.HemisphereLight('#fff0dc', '#3a2418', 1.1)); const d = new THREE.DirectionalLight('#fff4e0', 2.4); d.position.set(2, 4, 3); s.add(d); const d2 = new THREE.DirectionalLight('#a0b8ff', .6); d2.position.set(-3, 2, -2); s.add(d2); return s }
  const lab = document.getElementById('labels')!
  if (MODE === 'sheet') {
    const cell = 400, LAB = 0, TOP = 34, COLS = 4
    type V = { scene: THREE.Scene; cam: THREE.PerspectiveCamera; x: number; y: number; t: string }
    const views: V[] = []
    const view = (title: string, obj: THREE.Object3D, look: [number, number, number], dist: number, el = .25, az = -.5, fov = 35) => {
      const i = views.length, s = mkScene(); s.add(obj)
      const cam = new THREE.PerspectiveCamera(fov, 1, .005, 40)
      cam.position.set(look[0] + Math.sin(az) * dist * Math.cos(el), look[1] + Math.sin(el) * dist, look[2] + Math.cos(az) * dist * Math.cos(el)); cam.lookAt(...look)
      views.push({ scene: s, cam, x: (i % COLS) * cell, y: TOP + Math.floor(i / COLS) * (cell + LAB), t: title })
    }
    const lod0 = (g: THREE.Group) => { (g.userData.lod as THREE.LOD).autoUpdate = false; const l = g.userData.lod as THREE.LOD; l.levels.forEach((lv, i) => (lv.object.visible = i === 0)); return g }
    const lod1 = (g: THREE.Group) => { (g.userData.lod as THREE.LOD).autoUpdate = false; const l = g.userData.lod as THREE.LOD; l.levels.forEach((lv, i) => (lv.object.visible = i === 1)); return g }
    view('O18 崭新留声机（客房陷阱版）', lod0(buildPhonograph('new')), [0, .82, 0], 2.7, .22, -.55)
    view('休息室做旧留声机（磨损 / 氧化 / 铜绿）', lod0(buildPhonograph('old')), [0, .82, 0], 2.7, .22, -.55)
    { const g = new THREE.Group(); const a = lod0(buildPhonograph('new')); a.position.x = -.45; const b = lod0(buildPhonograph('old')); b.position.x = .45; g.add(a, b); view('两台并排：左 O18 新 · 右 休息室旧', g, [0, .8, 0], 3.6, .15, 0) }
    view('特写：八瓣花瓣喇叭（分瓣缝 + 铆钉，内壁暗）', lod0(buildPhonograph('new')), [.1, 1.25, .2], .8, .1, .15)
    { const g = lod0(buildPhonograph('new')); applyPhonographState(g, { arm: 1 }); view('特写：抬唱针 = 唱臂实际升起；标签「陌生又熟悉」', g, [.04, .8, .02], .62, .62, -.2) }
    { const g = lod0(buildPhonograph('new')); applyPhonographState(g, { broke: 1 }); view('砸烂状态：喇叭瘪垂、转盘歪、唱片碎', g, [0, .85, 0], 2.5, .3, -.7) }
    view('LOD1（9 m 外远景模型，近看对照）', lod1(buildPhonograph('new')), [0, .82, 0], 2.7, .22, -.55)
    view('特写：做旧木纹（沿纹理方向）+ 榫接线 + 铭牌', lod0(buildPhonograph('old')), [.05, .55, .2], .9, .12, .35)
    syncRoomCardLabel({ floor: 4, no: 412, dx: 1 })
    { const c = buildL5ItemMesh('roomcard'); c.scale.setScalar(2.4); view('房卡正面：HL 花押 + 楼层 4 / 房号 412（随绑定动态贴字）', c, [0, 0, 0], .5, .05, .25, 30) }
    { const c = buildL5ItemMesh('roomcard'); c.scale.setScalar(2.4); c.rotation.y = Math.PI; view('房卡背面：磁条 + 签名条 + 小字，圆角倒边', c, [0, 0, 0], .5, .05, .25, 30) }
    { const g = new THREE.Group(); const faces = ['squid', 'sanity', 'hotel'] as const
      faces.forEach((f, i) => { const d = buildThrownDie(); const dec = d.userData.decal as THREE.Mesh; const c = document.createElement('canvas'); c.width = c.height = 256; drawDieIcon(c.getContext('2d')!, f, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = dec.material as THREE.MeshBasicMaterial; m.map = t; m.opacity = 1; dec.visible = true; dec.position.set(0, DIE_HALF + .0004, 0); dec.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)); d.position.set((i - 1) * .085, DIE_HALF, 0); d.rotation.y = (i - 1) * .4; g.add(d) })
      const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: '#5a2a24', roughness: .9 })); fl.rotation.x = -Math.PI / 2; g.add(fl)
      view('命运之骰：白色微瓷，停下后浮现结果（乌贼 / 心 / 旅馆）', g, [0, .02, 0], .34, .75, .2) }
    { const g = new THREE.Group(); const a = buildL5ItemMesh('fatedie'); a.position.x = -.03; const b = buildL5ItemMesh('brokendie'); b.position.x = .03; b.rotation.y = .6; g.add(a, b); view('物品：命运之骰 / 裂开的骰子（裂纹法线）', g, [0, 0, 0], .2, .35, -.3) }
    { const g = buildL5ItemMesh('brokenrecord'); g.rotation.x = -1.1; view('破唱片：三块锯齿断口 + 沟纹 + 标签残片', g, [0, 0, 0], .55, .3, 0) }
    { const g = new THREE.Group(); const a = buildL5ItemMesh('diereceipt'); a.position.x = -.04; a.rotation.y = .2; const b = buildL5ItemMesh('diereceipt'); b.position.x = .04; b.rotation.y = Math.PI - .2; g.add(a, b); view('购买凭证 正 / 背：烫金边、花押、编号、齿孔撕边', g, [0, 0, 0], .26, .05, 0) }
    { const g = buildCasinoItemMesh('silencejuice'); view('寂静汁液（玻璃厚度 + 头奖封条 + 软木塞）', g, [.088, .04, 0], .4, .3, -.4) }
    { const g = buildCasinoItemMesh('mysteryegg'); view('神秘蛋（斑点颜色 / 法线贴图）', g, [.045, .034, 0], .22, .35, -.4) }
    const rows = Math.ceil(views.length / COLS), Wd = COLS * cell, Ht = TOP + rows * cell
    r.setSize(Wd, Ht); r.autoClear = false; document.body.append(r.domElement)
    document.getElementById('title')!.textContent = 'L5 第三期物品 v2 · 细化建模 / UV / PBR 程序贴图（留声机 LOD0 9,740 面、LOD1 960 面）'
    for (const v of views) lab.insertAdjacentHTML('beforeend', `<div class="lb" style="left:${v.x + 8}px;top:${v.y + 6}px">${v.t}</div>`)
    const draw = () => { r.setScissorTest(false); r.setClearColor('#120c0a'); r.clear(); r.setScissorTest(true); for (const v of views) { const y = Ht - v.y - cell; r.setViewport(v.x + 2, y + 2, cell - 4, cell - 4); r.setScissor(v.x + 2, y + 2, cell - 4, cell - 4); r.render(v.scene, v.cam) } }
    let n = 0; const tick = () => { draw(); if (++n === 12) W.__ready = true; if (n < 30) requestAnimationFrame(tick) }; tick()
  } else if (MODE === 'throw') {
    // [l5items 收尾] 第一人称投骰：按 X → 抬手 → 前挥松手（骰子从手中出手）→ 滚动 → 停下 → 图案浮现 → 结果文字（右下特写小窗）
    const S = await import('../game/engine/fateDieSim')
    const { vmAnimPose, buildHeldItem, buildRetroHand, heldHandPose, heldBox } = await import('../game/renderer/viewmodel')
    const Wd = 360, Ht = 270, s = mkScene('#1c1210'), FPS = 20, FACE = 'rare' as const, SEED = Number(q.get('seed') ?? 4)
    const fc = document.createElement('canvas'); fc.width = fc.height = 256; const fx = fc.getContext('2d')!; fx.fillStyle = '#5e2620'; fx.fillRect(0, 0, 256, 256); fx.strokeStyle = '#c9a24a'; fx.lineWidth = 3; for (let i = 0; i < 4; i++) { fx.beginPath(); fx.arc(i % 2 * 256, Math.floor(i / 2) * 256, 90, 0, 7); fx.stroke() }
    const ft = new THREE.CanvasTexture(fc); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(8, 8); ft.colorSpace = THREE.SRGBColorSpace
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.MeshStandardMaterial({ map: ft, roughness: .95 })); floor.rotation.x = -Math.PI / 2; s.add(floor)
    const wallM = new THREE.MeshStandardMaterial({ color: '#b89a6a', roughness: .9 })
    const back = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), wallM); back.position.set(0, 1.5, -3.6); s.add(back)
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(8, .14, .03), new THREE.MeshStandardMaterial({ color: '#3a2016' })); skirt.position.set(0, .07, -3.58); s.add(skirt)
    const walls = [{ n: [0, 0, 1] as [number, number, number], d: -3.6 }]
    const pitch = -.42, yaw = 0, facing = Math.atan2(-Math.cos(yaw), -Math.sin(yaw))
    const cam = new THREE.PerspectiveCamera(62, Wd / Ht, .01, 30); cam.rotation.order = 'YXZ'; cam.rotation.set(pitch, yaw, 0); cam.position.set(0, S.EYE_H, 0); s.add(cam)
    const lamp = new THREE.PointLight('#ffe2b0', 6, 6); lamp.position.set(.4, 2.4, -1.4); s.add(lamp)
    const vm = new THREE.Group(); vm.rotation.order = 'YXZ'; cam.add(vm)
    const item = buildHeldItem('fatedie'); const hand = buildRetroHand(); hand.setPose(heldHandPose('fatedie', heldBox(item)), item); vm.add(hand.group); vm.add(item)
    const from = S.dieHandPoint(yaw, pitch)
    const sim = S.simulateDieThrow({ seed: SEED, topFace: S.RESULT_FACE[FACE], mode: 'flat', yaw: facing, from, walls, half: DIE_HALF })
    const doneT = S.THROW_REL + sim.settleT + S.REVEAL_FLAT, total = Math.round((doneT + 2.2) * FPS)
    const die = buildThrownDie(); s.add(die)
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; drawDieIcon(cv.getContext('2d')!, FACE, 256); const itx = new THREE.CanvasTexture(cv); itx.colorSpace = THREE.SRGBColorSpace
    const dec = die.userData.decal as THREE.Mesh, dm = dec.material as THREE.MeshBasicMaterial; dm.map = itx; dm.needsUpdate = true
    const ax = new THREE.Vector3(...S.FACE_AXES[S.RESULT_FACE[FACE]]); dec.position.copy(ax).multiplyScalar(DIE_HALF + .0004); dec.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax)
    const inset = new THREE.PerspectiveCamera(30, 4 / 3, .005, 10)
    r.setSize(Wd, Ht); document.body.append(r.domElement)
    document.body.style.overflow = 'hidden'
    lab.innerHTML = '<div id="inb" style="position:absolute;left:234px;top:26px;width:120px;height:90px;outline:1px solid rgba(232,185,60,.7);display:none"></div><div class="lb" id="dl" style="left:8px;top:5px;font-size:12px"></div><div class="lb" id="msg" style="left:6px;top:212px;width:330px;box-sizing:border-box;white-space:normal;font-size:12.5px;line-height:1.35;background:rgba(10,6,4,.62);padding:4px 7px;border-left:3px solid #e8b93c;display:none"></div>'
    let off: THREE.Vector3 | null = null
    const handAt = (t: number) => { const pv = vmAnimPose({ mx: 0, my: 0, bobPhase: 0, time: t, attackAnimT: t < S.THROW_DUR ? S.THROW_DUR - t : 0, attackAnimDur: S.THROW_DUR, attackAnimKind: 'dieThrow' as never }); vm.position.set(pv.px, pv.py, pv.pz); vm.rotation.set(pv.rx, pv.ry, pv.rz); cam.updateMatrixWorld(true) }
    W.__frames = total
    W.__frame = (i: number) => {
      const t = i / FPS - .2 // 前 0.2 s 静止持骰
      handAt(Math.max(0, t))
      if (!off && t >= S.THROW_REL) { handAt(S.THROW_REL); const hw = new THREE.Box3().setFromObject(item).getCenter(new THREE.Vector3()); off = hw.sub(new THREE.Vector3(...from)); handAt(Math.max(0, t)) }
      const ts = t - S.THROW_REL, thrown = ts >= 0
      item.visible = !thrown; die.visible = thrown
      let v = { p: from, q: [0, 0, 0, 1] as [number, number, number, number], reveal: 0, settled: false }
      if (thrown) { const vv = dieVisual(sim, FACE, ts, { dieAlive: true }); v = vv; const k = Math.max(0, 1 - ts / .2); die.position.set(vv.p[0] + (off?.x ?? 0) * k, vv.p[1] + (off?.y ?? 0) * k, vv.p[2] + (off?.z ?? 0) * k); die.quaternion.set(vv.q[0], vv.q[1], vv.q[2], vv.q[3]) }
      dec.visible = v.reveal > 0; dm.opacity = v.reveal * v.reveal * (3 - 2 * v.reveal); dec.scale.setScalar(.55 + .45 * Math.min(1, v.reveal * 1.4))
      r.setScissorTest(false); r.setViewport(0, 0, Wd, Ht); r.render(s, cam)
      if (thrown) { // 右下特写小窗（同一场景、同一骰子）
        const iw = 120, ih = 90, x0 = Wd - iw - 6, y0 = 26
        inset.position.set(die.position.x - .1, .2, die.position.z + .2); inset.lookAt(die.position.x, .02, die.position.z)
        r.setScissorTest(true); r.setViewport(x0, Ht - y0 - ih, iw, ih); r.setScissor(x0, Ht - y0 - ih, iw, ih); r.render(s, inset); r.setScissorTest(false)
      }
      const phase = t < 0 ? '持骰' : t < .38 * S.THROW_DUR ? '按 X · 抬手' : t < S.THROW_REL ? '前挥' : t < S.THROW_REL + .12 ? '松手 · 从手中出手' : !v.settled ? '滚动（结果已定·未出字）' : t < doneT ? `停下 · 图案浮现 ${Math.round(v.reveal * 100)}%` : '图案浮现完 → 结果生效'
      document.getElementById('dl')!.textContent = `命运之骰 · 第一人称 · t=${Math.max(0, t).toFixed(2)} s · ${phase}`
      document.getElementById('inb')!.style.display = thrown ? 'block' : 'none'
      const m = document.getElementById('msg')!; m.style.display = t >= doneT ? 'block' : 'none'; m.textContent = '白色的立方体在地上翻滚……停下了：「宝箱」。 你手里多了一样东西。远处，推车的轮子停了一下。'
      return true
    }
    ;(W.__frame as (i: number) => void)(0); W.__ready = true
  } else {
    // 骰子：三段（乌贼 / 旅馆 / 立在棱上），每段 3.6 s @ 12 fps
    const Wd = 360, Ht = 270, s = mkScene('#1c1210')
    const floorC = document.createElement('canvas'); floorC.width = floorC.height = 256; const fx = floorC.getContext('2d')!; fx.fillStyle = '#5e2620'; fx.fillRect(0, 0, 256, 256); fx.strokeStyle = '#c9a24a'; fx.lineWidth = 3; for (let i = 0; i < 4; i++) { fx.beginPath(); fx.arc(i % 2 * 256, Math.floor(i / 2) * 256, 90, 0, 7); fx.stroke() } fx.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 256; i += 4) { fx.beginPath(); fx.moveTo(i, 0); fx.lineTo(i, 256); fx.stroke() }
    const ft = new THREE.CanvasTexture(floorC); ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(6, 6); ft.colorSpace = THREE.SRGBColorSpace
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshStandardMaterial({ map: ft, roughness: .95 })); floor.rotation.x = -Math.PI / 2; s.add(floor)
    const clips = [{ face: 'squid', seed: 11, t: '结果：乌贼（别动 10 秒）' }, { face: 'hotel', seed: 23, t: '结果：旅馆' }, { face: 'edge', seed: 5, t: '结果：立在棱上（精确平衡）' }] as const
    const FPS = 12, CLIP = 3.6
    const sims = clips.map((c) => { const mode = c.face === 'edge' ? 'edge' as const : 'flat' as const; return simulateDieThrow({ seed: c.seed, topFace: RESULT_FACE[c.face], mode, yaw: 0, half: DIE_HALF }) })
    const clipLen = sims.map((d) => Math.min(4.6, Math.max(CLIP, d.settleT + 1.4)))
    const starts = clipLen.reduce<number[]>((a, _l, i) => (a.push(i ? a[i - 1] + Math.round(clipLen[i - 1] * FPS) : 0), a), [])
    const total = starts[starts.length - 1] + Math.round(clipLen[clipLen.length - 1] * FPS)
    const die = buildThrownDie(); s.add(die)
    const cam = new THREE.PerspectiveCamera(40, Wd / Ht, .01, 30); const look = new THREE.Vector3(.4, .3, 0)
    r.setSize(Wd, Ht); document.body.append(r.domElement)
    lab.innerHTML = '<div class="lb" id="dl" style="left:8px;top:6px;font-size:14px"></div><div class="lb" id="dt" style="left:8px;top:246px;font-size:12px;color:#c8b898"></div>'
    const icons = new Map<string, THREE.CanvasTexture>()
    W.__frames = total
    W.__frame = (i: number) => {
      let k = 0; while (k + 1 < starts.length && i >= starts[k + 1]) k++
      const c = clips[k], d = sims[k], t = (i - starts[k]) / FPS
      const v = dieVisual(d, c.face, t, { dieAlive: true })
      die.position.set(v.p[0], v.p[1], v.p[2]); die.quaternion.set(v.q[0], v.q[1], v.q[2], v.q[3])
      const dec = die.userData.decal as THREE.Mesh, m = dec.material as THREE.MeshBasicMaterial
      if (!icons.has(c.face)) { const cv = document.createElement('canvas'); cv.width = cv.height = 256; drawDieIcon(cv.getContext('2d')!, c.face, 256); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; icons.set(c.face, tx) }
      m.map = icons.get(c.face)!; m.needsUpdate = true
      const ax = new THREE.Vector3(...FACE_AXES[RESULT_FACE[c.face]]); dec.position.copy(ax).multiplyScalar(DIE_HALF + .0004); dec.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ax)
      dec.visible = v.reveal > 0 && c.face !== 'edge'; m.opacity = v.reveal * v.reveal * (3 - 2 * v.reveal); dec.scale.setScalar(.55 + .45 * Math.min(1, v.reveal * 1.4))
      const target = new THREE.Vector3(v.p[0], Math.max(.03, v.p[1] * .6), v.p[2]); look.lerp(target, i === starts[k] ? 1 : .35)
      const near = .9
      const ea = d.edgeAxis ?? [0, 0, 1], es = ea[2] < 0 ? -1 : 1
      if (v.settled && c.face === 'edge') cam.position.set(look.x + ea[0] * es * .3 + .03, look.y + .03, look.z + ea[2] * es * .3); else if (v.settled) cam.position.set(look.x - .06, look.y + .3, look.z + .22); else cam.position.set(look.x - .15 * near, look.y + .55 * near + .05, look.z + .9 * near)
      cam.lookAt(look)
      r.render(s, cam)
      document.getElementById('dl')!.textContent = `命运之骰 · ${c.t}`
      document.getElementById('dt')!.textContent = v.settled ? (c.face === 'edge' ? '停在棱上 · 重心高 h√2 · 静止' : `停下 · 图案浮现 ${Math.round(v.reveal * 100)}%`) : `t=${t.toFixed(2)} s · 抛物线 / 弹跳 / 滚动`
      return true
    }
    ;(W.__frame as (i: number) => void)(0); W.__ready = true
  }
}
main().catch((e) => { W.__err = String(e?.stack ?? e) })
