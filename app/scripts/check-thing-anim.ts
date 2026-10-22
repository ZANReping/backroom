// [thing] 七层之物阶段 2 动画无头验收：8 个片段各跑 10 秒，检查体节连续、无 NaN、头颈不脱节、各片段的特征量。运行：npm run check:thing-anim
import { createCanvas } from '@napi-rs/canvas'
Object.assign(globalThis, { document: { createElement: () => createCanvas(64, 64) } })
const THREE = await import('three')
const { buildThingMesh, THING, updateThingLod, thingVisibleTris } = await import('../src/game/renderer/thingMesh')
const { animateThing, makeThingAnimState, THING_CLIPS, THING_CLIP_LEN } = await import('../src/game/renderer/thingAnim')
let n = 0, fails = 0
const ok = (c: unknown, m: string) => { n++; console.log(`${c ? '✔' : '✘'} ${m}`); if (!c) fails++ }
const DT = 1 / 30
const g = buildThingMesh()
const parts = g.userData.parts as Record<string, any>
let tri = 0, meshes = 0; g.traverse((o: any) => { if (o.isMesh) { meshes++; tri += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 } })
ok(meshes < 420 && tri < 90000, `远景级：${meshes} 个网格、${Math.round(tri)} 个三角形`)
ok(THING.headLen + THING.segs * THING.spacing > 200 && THING.headLen + THING.segs * THING.spacing < 280, `可见长度 ${(THING.headLen + THING.segs * THING.spacing).toFixed(0)}m 在 200~280m`)
{
  // 头部尺寸：包围盒（远景级）≥ 一栋楼
  const hb = new THREE.Box3().setFromObject((g.userData.parts as any).head)
  const sz = hb.getSize(new THREE.Vector3())
  ok(sz.x > 15 && sz.y > 10, `头部包围盒 ${sz.x.toFixed(1)}×${sz.y.toFixed(1)}×${sz.z.toFixed(1)}m（长×高×宽，≥15×10）`)
  const nb = new THREE.Box3().setFromObject((g.userData.parts as any).seg0)
  ok(nb.getSize(new THREE.Vector3()).y > 9, `颈部体节直径 ${nb.getSize(new THREE.Vector3()).y.toFixed(1)}m（>9m）`)
  // 分部位 LOD：远处全是远景级；镜头贴近头部，每次只多建 1 个部位，由近到远
  const lg = buildThingMesh(); lg.updateMatrixWorld(true)
  const far = new THREE.Vector3(0, 0, 900), near = new THREE.Vector3(12, 2, 20)
  ok(updateThingLod(lg, far, 1) === 0 && thingVisibleTris(lg) < 90000, `900m 外：不建精细级，显示 ${thingVisibleTris(lg)} 个三角形`)
  const b1 = updateThingLod(lg, near, 1), t1 = thingVisibleTris(lg)
  for (let k = 0; k < 1500 && !lg.userData.thingLod[0].nodes.hi.length; k++) updateThingLod(lg, near, 1)
  const headHi = lg.userData.thingLod[0].nodes.hi.length > 0
  ok(b1 <= 1 && headHi, `贴近头部：分帧准备且先完成最近的头（${t1} 个三角形）`)
  let n2 = 0; for (let k = 0; k < 2400; k++) n2 += updateThingLod(lg, near, 1)
  const hiUnits = lg.userData.thingLod.filter((u: any) => u.hiOn).length, t2 = thingVisibleTris(lg)
  ok(hiUnits >= 3 && hiUnits <= 12, `稳定后 ${hiUnits} 个部位显示精细级（头 + 近处体节），共 ${t2} 个三角形`)
  const headT = (() => { let c = 0; for (const o of lg.userData.thingLod[0].nodes.hi) o.traverse((m: any) => { if (m.isMesh) c += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 }); return Math.round(c) })()
  const segT = (() => { let c = 0; for (const o of lg.userData.thingLod[1].nodes.hi) o.traverse((m: any) => { if (m.isMesh) c += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3 }); return Math.round(c) })()
  ok(headT > 150000 && segT > 15000, `精细级：头 ${headT} 个三角形，单节躯干 ${segT} 个`)
  updateThingLod(lg, far, 1)
  ok(lg.userData.thingLod.every((u: any) => !u.hiOn), '镜头远离后全部切回远景级（精细级保留不重建）')
}
ok(!!parts.jaw && !!parts.gillL && !!parts.gillR && !!parts.eyeL && !!parts.photoL, '头部部件齐全（下颌 / 鳃 / 眼 / 发光条）')
for (const clip of THING_CLIPS) {
  const st = makeThingAnimState()
  let t = 0, yaw = 0, x = 0, maxGap = 0, minGap = 99, nan = false, maxGape = 0, maxNeck = 0, maxLat = 0, lureMin = 9, recoilYaw = 0
  const len = THING_CLIP_LEN[clip] ?? 10
  for (let i = 0; i < 300; i++) {
    if (clip === 'circle') yaw += 0.27 / THING.S * DT
    x += Math.cos(yaw) * 4 * THING.S * DT
    g.position.set(x, 0, 0); g.rotation.y = yaw; g.updateMatrixWorld(true)
    animateThing(g, st, { t, dt: DT, clip, progress: THING_CLIP_LEN[clip] ? Math.min(1, i * DT / len) : undefined })
    g.updateMatrixWorld(true)
    t += DT
    if (i < (THING_CLIP_LEN[clip] ? 0 : 120)) continue
    const w = (o: any) => o.getWorldPosition(new THREE.Vector3())
    for (let s = 0; s < THING.segs - 1; s++) {
      const a = w(parts[`seg${s}`]), b = w(parts[`seg${s + 1}`])
      const d = a.distanceTo(b)
      if (!Number.isFinite(d)) nan = true
      maxGap = Math.max(maxGap, d); minGap = Math.min(minGap, d)
    }
    const hd = w(parts.head), s0 = w(parts.seg0)
    maxNeck = Math.max(maxNeck, hd.distanceTo(s0))
    maxGape = Math.max(maxGape, -parts.jaw.rotation.z)
    const tail = w(parts[`seg${THING.segs - 1}`])
    maxLat = Math.max(maxLat, Math.abs(tail.z))
    lureMin = Math.min(lureMin, g.userData.thingLureMat.emissiveIntensity)
    recoilYaw = Math.max(recoilYaw, parts.head.rotation.y)
  }
  ok(!nan && maxGap < THING.spacing * (clip === 'glitch' ? 1.45 : clip === 'flee' ? 1.35 : 1.3) && minGap > THING.spacing * 0.6, `${clip}：相邻体节间距 ${minGap.toFixed(2)}~${maxGap.toFixed(2)}m（节距 ${THING.spacing}）`)
  ok(maxNeck < 0.75 * THING.S + (clip === 'glitch' ? 0.6 * THING.S : 0), `${clip}：头颈最大间距 ${maxNeck.toFixed(2)}m（不脱节）`)
  if (clip === 'bite') ok(maxGape > 0.9, `bite：下颌最大张开 ${(maxGape * 57.3).toFixed(0)}°`)
  if (clip === 'drift') ok(maxGape < 0.3, `drift：装死时嘴只微张（${(maxGape * 57.3).toFixed(0)}°）`)
  if (clip === 'flinch') ok(recoilYaw > 0.4 && lureMin < 0.3, `flinch：头偏开 ${(recoilYaw * 57.3).toFixed(0)}°，饵球压暗到 ${lureMin.toFixed(2)}`)
  if (clip === 'dash' || clip === 'flee') ok(maxLat > 1.2 * THING.S, `${clip}：尾段摆幅 ${maxLat.toFixed(1)}m`)
}
console.log(`check:thing-anim ${n - fails}/${n}${fails ? '' : ' 全部通过'}`)
if (fails) process.exit(1)
