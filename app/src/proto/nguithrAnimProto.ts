// 原型页的动画模式（proto-nguithr.html?anim=<片段>&t=<秒>[&view=...][&play=1]）。
// 截帧是确定性的：每次渲染都从 t=0 以 1/60s 步长重新模拟动画器（姿态量很轻，几千步也只要几毫秒），再摆骨骼、渲染。
// window.__render(t) 可在同一页面内重渲任意时刻（批量截帧 / 合成 gif 用）。
import * as THREE from 'three'
import { buildNguithrNest, nguithrNest } from '../game/renderer/nguithrMesh'
import {
  buildNguithrAnimated, NG_CLIPS, NG_CUT_POP_T, NguithrAnimator, nguithrClipPose, nguithrLoopSegment, nguithrMouthPoint, nguithrStepRoot, nguithrToMount, poseNguithr,
  type NguithrClip, type NguithrPose,
} from '../game/renderer/nguithrAnim'
import { QA_CPU_SKIN, syncSceneCpuSkins } from '../game/renderer/qaCpuSkin'

interface Ctx {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; W: number; H: number; Q: URLSearchParams; real: boolean; CEIL: number
  label: (x: number, y: number, txt: string) => void; ceiling: (size?: number) => void; floor: (color?: string) => void
  track: (g: THREE.Object3D) => THREE.Object3D
}

export function runAnimProto(c: Ctx) {
  const { renderer, scene, W, H, Q, CEIL } = c
  const clip = (Q.get('anim') ?? 'idle') as NguithrClip
  const info = NG_CLIPS[clip] ?? NG_CLIPS.idle
  const ceilMount = info.mount === 'ceiling'
  const view = Q.get('view') ?? (ceilMount ? (clip === 'descend' || clip === 'climb' || clip === 'loop' ? 'wide' : 'under') : 'side')
  const scale = +(Q.get('scale') ?? 1)
  scene.background = new THREE.Color(view === 'side' || view === 'front3q' || view === 'top' ? '#26262a' : '#0b0a09')
  scene.fog = new THREE.Fog(scene.background as THREE.Color, 6, 16)
  c.floor(view === 'side' || view === 'front3q' || view === 'top' ? '#5d594f' : view === 'wide' || view === 'follow' ? '#57524a' : '#2a2722')
  c.ceiling()
  const nestG = buildNguithrNest(4, 3); nestG.position.y = CEIL - 0.001; scene.add(nestG)
  const nest = nguithrNest(nestG)!
  if (!ceilMount && clip !== 'loop') nestG.visible = view === 'wide'

  const grp = buildNguithrAnimated(scale); scene.add(grp); c.track(grp)
  // 起始挂载
  const rotY = +(Q.get('rotY') ?? 0.12)
  const start = new THREE.Vector3(0, 0, 0)
  // 切丝：选最近的一个网囊，把它摆到身体左前方可够到的位置
  let reachTarget: THREE.Vector3 | undefined
  const cutSac = 0
  const setStart = () => {
    if (ceilMount) { grp.rotation.set(Math.PI, rotY, 0, 'YXZ'); grp.position.set(start.x, CEIL, start.z) }
    else { grp.rotation.set(0, rotY, 0); grp.position.set(start.x, 0, start.z) }
    grp.updateMatrixWorld(true)
  }
  if (clip === 'cut') {
    const s = nest.sacs[cutSac]
    const dir = new THREE.Vector2(s.center.x, s.center.z).normalize()
    start.set(dir.x * (Math.hypot(s.center.x, s.center.z) - 0.95), 0, dir.y * (Math.hypot(s.center.x, s.center.z) - 0.95))
    setStart(); poseNguithr(grp, nguithrClipPose('idle', 0), 0)
    // 网囊吊丝上段（天花板下 0.12m）
    reachTarget = nguithrToMount(grp, new THREE.Vector3(s.center.x, CEIL - 0.13, s.center.z))
    // 若目标在身后/右侧，转身让它落在左前方
    const ang = Math.atan2(reachTarget.x, reachTarget.z)
    const want = 0.55
    grp.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -(want - ang)) // 倒挂时世界 Y 旋转与模型偏航反号
    grp.updateMatrixWorld(true)
    reachTarget = nguithrToMount(grp, new THREE.Vector3(s.center.x, CEIL - 0.13, s.center.z))
    if (Math.abs(Math.atan2(reachTarget.x, reachTarget.z) - want) > 0.05) { // 符号猜反了就反过来转
      grp.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 2 * (want - ang)); grp.updateMatrixWorld(true)
      reachTarget = nguithrToMount(grp, new THREE.Vector3(s.center.x, CEIL - 0.13, s.center.z))
    }
    start.copy(grp.position)
  }
  // 进食演示：螯下一团猎物（灰褐小肉团），位置在第一次摆姿态后放到嘴下方的地面
  let prey: THREE.Mesh | null = null
  if (clip === 'feed') {
    const g = new THREE.IcosahedronGeometry(0.07, 2); const pp = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pp.count; i++) { const k = 1 + 0.25 * Math.sin(pp.getX(i) * 60) * Math.cos(pp.getZ(i) * 50); pp.setXYZ(i, pp.getX(i) * k * 1.4, pp.getY(i) * k * 0.6, pp.getZ(i) * k) }
    g.computeVertexNormals()
    prey = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#6b5a4c' })); scene.add(prey)
  }
  const startQuat = new THREE.Quaternion()
  if (clip !== 'cut') setStart()
  startQuat.copy(grp.quaternion); start.copy(grp.position)
  const opts = { ceil: CEIL, scale, reach: reachTarget }

  // 灯光
  const wideL = view === 'wide' || view === 'follow'
  const studio = view === 'side' || view === 'front3q' || view === 'top' || (view === 'follow' && !ceilMount)
  if (studio) {
    scene.add(new THREE.HemisphereLight('#efeae0', '#3a352e', 1.0))
    const sun = new THREE.DirectionalLight('#fff6e8', 1.6); sun.position.set(2, 4, 3); scene.add(sun)
    const fill = new THREE.DirectionalLight('#cfd8ff', 0.5); fill.position.set(-3, 1.5, -2); scene.add(fill)
  } else {
    const k = wideL ? 1.6 : 1.1
    const sp = new THREE.SpotLight('#fff8ec', 9 * k, 16, wideL ? 1.0 : 0.85, 0.7, 1.2)
    sp.position.set(wideL ? 1.8 : 0.3, wideL ? 1.3 : CEIL - 1.7, wideL ? 2.8 : 0.4); sp.target.position.set(0, wideL ? 1.4 : CEIL, 0)
    scene.add(sp, sp.target, new THREE.HemisphereLight('#d8d4ca', '#2a2620', wideL ? 0.45 : 0.25))
    if (wideL) { const fl = new THREE.SpotLight('#ffeedd', 6, 9, 0.7, 0.8, 1.2); fl.position.set(1.2, 2.2, 1.6); fl.target.position.set(0, 0, 0); scene.add(fl, fl.target) }
  }

  const cam = new THREE.PerspectiveCamera(view === 'under' ? 52 : view === 'wide' ? 46 : view === 'follow' ? 36 : 30, W / H, 0.03, 40)
  const bodyW = new THREE.Vector3()
  const placeCam = () => {
    const rig = grp.userData.nguithrRig as { bones: THREE.Bone[] }
    rig.bones[1].updateWorldMatrix(true, false); bodyW.setFromMatrixPosition(rig.bones[1].matrixWorld)
    if (view === 'under') {
      if (clip === 'cut') { const s = nest.sacs[cutSac].center; const mx = (start.x + s.x) / 2, mz = (start.z + s.z) / 2; cam.position.set(mx - 0.05, CEIL - 2.1, mz + 0.03); cam.up.set(1, 0, 0); cam.lookAt(mx, CEIL, mz) }
      else { cam.position.set(start.x - 0.05, CEIL - 1.6, start.z + 0.03); cam.up.set(1, 0, 0); cam.lookAt(start.x, CEIL, start.z) }
    }
    else if (view === 'wide') {
      const full = clip === 'descend' || clip === 'climb' || clip === 'loop' || !ceilMount // 需要同时看到天花板与地面
      if (full) { cam.position.set(start.x + 2.6, 1.2, start.z + 3.3); cam.lookAt(start.x, 1.38, start.z) }
      else { cam.position.set(start.x + 2.0, 1.25, start.z + 2.5); cam.lookAt(start.x, CEIL - 0.35, start.z) }
    }
    else if (view === 'side') { const fy = Math.max(0.16, bodyW.y); cam.position.set(bodyW.x, fy + 0.22, bodyW.z + 2.5); cam.lookAt(bodyW.x, fy, bodyW.z) }
    else if (view === 'front3q') { cam.position.set(bodyW.x + 1.9, bodyW.y + 0.8, bodyW.z + 1.15); cam.lookAt(bodyW.x + 0.18, bodyW.y - 0.04, bodyW.z) }
    else if (view === 'follow') { const o = (Q.get('cam') ?? '0.4,0.1,2.2').split(',').map(Number); cam.position.set(bodyW.x + o[0], bodyW.y + o[1], bodyW.z + o[2]); cam.lookAt(bodyW.x, bodyW.y - 0.05, bodyW.z) }
    else if (view === 'top') { cam.position.set(bodyW.x, bodyW.y + 3.2, bodyW.z + 0.001); cam.up.set(1, 0, 0); cam.lookAt(bodyW.x, 0, bodyW.z) }
  }

  const lbl = document.createElement('div'); lbl.className = 'l'; lbl.style.left = W / 2 + 'px'; lbl.style.top = H - 46 + 'px'; document.getElementById('lab')!.appendChild(lbl)
  const DT = 1 / 60
  let anim = new NguithrAnimator(scale)
  let simT = 0
  const clipAt = (tt: number) => nguithrClipPose(clip, tt, opts)
  const reset = () => {
    grp.position.copy(start); grp.quaternion.copy(startQuat)
    anim = new NguithrAnimator(scale, clipAt(0)); simT = 0
  }
  const advance = (to: number) => {
    while (simT + DT <= to + 1e-9) { simT += DT; anim.target = { ...clipAt(simT), gaitPhase: 0 }; anim.update(DT); nguithrStepRoot(grp, anim.pose, DT) }
  }
  const sacState = (tt: number) => {
    let popped = false
    if (clip === 'cut') popped = tt >= NG_CUT_POP_T
    if (clip === 'loop') { const s = nguithrLoopSegment(tt); popped = (s.clip === 'cut' && s.local >= NG_CUT_POP_T) || ['descend', 'crawl', 'spray', 'feed'].includes(s.clip) }
    const s = nest.sacs[cutSac]
    if (popped && s.state !== 'popped') s.pop(); else if (!popped && s.state !== 'intact') s.show()
  }
  const draw = (tt: number, p: NguithrPose) => {
    poseNguithr(grp, p, tt); sacState(tt)
    if (prey) { nguithrMouthPoint(grp, prey.position); prey.position.y = 0.035; prey.rotation.y = grp.rotation.y }
    placeCam()
    const seg = clip === 'loop' ? nguithrLoopSegment(tt) : null
    lbl.innerHTML = `${NG_CLIPS[seg ? seg.clip : clip].label}<br><span class="s">anim=${clip}${seg ? `（${seg.clip}）` : ''} · t=${tt.toFixed(2)}s · view=${view}${QA_CPU_SKIN ? ' · CPU 蒙皮' : ' · GPU 蒙皮'}</span>`
    if (QA_CPU_SKIN) syncSceneCpuSkins(scene)
    renderer.render(scene, cam)
  }
  const renderAt = (tt: number) => {
    if (tt < simT - 1e-9) reset()
    advance(tt)
    draw(tt, anim.pose)
    return { t: tt, pose: { ...anim.pose } }
  }
  reset()
  const t0 = +(Q.get('t') ?? 0)
  let retries = 0
  for (; retries < 6; retries++) {
    renderAt(t0)
    const bad = (renderer.info.programs ?? []).some((p) => (p as unknown as { diagnostics?: { runnable: boolean } }).diagnostics?.runnable === false)
    if (!bad) break
  }
  const w = window as unknown as Record<string, unknown>
  w.__render = (tt: number) => renderAt(tt)
  w.__retries = retries; w.__budget = { clip, view }; w.__nest = null; w.__ready = true
  if (Q.get('play') === '1') {
    let last = performance.now(), tt = t0
    const loopDur = clip === 'loop' ? Infinity : info.dur + 1.5
    const tick = () => {
      const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now
      tt += dt
      if (tt > loopDur) { tt = 0; reset() }
      renderAt(tt)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }
}
