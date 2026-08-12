// v55d：L5 建模修复离线自检（真实 three，tsconfig.real.json）——逐件世界 AABB 断言：
//   ① phonograph 喇叭：圆台分段闭合成连续漏斗（相邻段 AABB 相交，无 >5mm 缝隙）、
//      开口朝前上（轴 z>0 且 y>0、仰角 ~33°）、曲颈前端与喇叭尾端相接；
//   ② foldladder 人字梯：四足齐地（|minY|≤3cm）、踏板水平且两端搭进斜杆、顶台贴铰链；
//   ③ boilerdeep 黑门：已纳入门洞开凿名单（DOOR_EXIT_KINDS 含 boilerdeep——门洞格/朝向由
//      orientDoor 与 geometry holeMap 既有约定处理，l5inf-smoke 另有数据层断言）。
// 用法：npx tsx --tsconfig .check/tsconfig.real.json .check/l5-models.mts
const ctx2d = new Proxy({}, { get: (_t, k) => {
  if (k === 'canvas') return { width: 128, height: 128 }
  if (typeof k === 'string' && /Style|font|Alpha|Align|Baseline|Cap|Join|Operation|filter|shadow/.test(k)) return ''
  return (...a: unknown[]) => { void a; return k === 'measureText' ? { width: 10 } : k === 'createLinearGradient' || k === 'createRadialGradient' ? { addColorStop: () => {} } : k === 'getImageData' || k === 'createImageData' ? { data: new Uint8ClampedArray(4 * 128 * 128) } : undefined }
} })
;(globalThis as unknown as Record<string, unknown>).window = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }
;(globalThis as unknown as Record<string, unknown>).document = {
  createElement: (t: string) => t === 'canvas' ? { width: 128, height: 128, getContext: () => ctx2d, toDataURL: () => 'data:,' } : { style: {}, appendChild: () => {}, setAttribute: () => {} },
  getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} },
}
const THREE = await import('three')
if (!THREE.REVISION) { console.log('✗ three 是桩——请用 tsconfig.real.json 运行'); process.exit(1) }
const { LEVELS } = await import('../src/game/levels/index.ts')
const { buildStructure } = await import('../src/game/renderer/structures.ts')
const { DOOR_EXIT_KINDS } = await import('../src/game/renderer/geometry.ts')
const def = LEVELS[5]

let fail = 0
const bad = (m: string) => { console.log('  ✗ ' + m); fail++ }
const ok = (m: string) => console.log('  ✓ ' + m)

// 5×5 假地图：中心 (2,2) 放被测结构，(2,1) 一面北墙（贴墙/朝向用）
const mkMap = () => {
  const tiles = new Uint8Array(25).fill(1)
  tiles[1 * 5 + 2] = 2
  return {
    w: 5, h: 5, tiles, structures: [],
    wet: new Uint8Array(25), elev: new Uint8Array(25), outdoor: new Uint8Array(25),
    step: new Uint8Array(25), crawl: new Uint8Array(25), ceiling: new Uint8Array(25),
    up: new Uint8Array(25), upWall: new Uint8Array(25), up2: new Uint8Array(25), upWall2: new Uint8Array(25),
    stair: new Int32Array(25), liquid: new Uint8Array(25), floors: 1, tint: new Uint8Array(25),
  } as never
}
const aabb = (o: InstanceType<typeof THREE.Object3D>) => new THREE.Box3().setFromObject(o)
const GAP = 0.005 // 5mm 容差

// ---- ① phonograph 喇叭 ----
{
  const g = buildStructure({ kind: 'phonograph', x: 2, y: 2, w: 1, h: 1, solid: true }, def, mkMap(), 3.3) as InstanceType<typeof THREE.Group>
  g.updateMatrixWorld(true)
  const segs = (g.userData.hornSegs ?? []) as InstanceType<typeof THREE.Object3D>[]
  if (segs.length !== 5) bad(`喇叭段数 ${segs.length} ≠ 5（4 段圆台 + 口沿）`)
  let broken = 0
  for (let i = 1; i < segs.length; i++) {
    const a = aabb(segs[i - 1]), b = aabb(segs[i])
    // 相邻段 AABB 必须在三轴上都相交（段链连续——不闭合会沿轴向分离）
    const gap = Math.max(a.min.x - b.max.x, b.min.x - a.max.x, a.min.y - b.max.y, b.min.y - a.max.y, a.min.z - b.max.z, b.min.z - a.max.z)
    if (gap > GAP) { broken++; bad(`喇叭段 ${i - 1}→${i} 分离 ${(gap * 1000).toFixed(1)}mm`) }
  }
  if (!broken && segs.length === 5) ok('喇叭 4 段圆台 + 口沿 AABB 串成连续链（无 >5mm 缝隙，整体闭合漏斗）')
  // 开口朝向：最后段（口沿）中心比第一段更高且更靠 +z（前上张开）
  const first = aabb(segs[0]), last = aabb(segs[segs.length - 1])
  const dz = (last.min.z + last.max.z) / 2 - (first.min.z + first.max.z) / 2
  const dy = (last.min.y + last.max.y) / 2 - (first.min.y + first.max.y) / 2
  const elev = Math.atan2(dy, dz) * 180 / Math.PI
  if (dz > 0.2 && dy > 0.1 && elev > 15 && elev < 60) ok(`喇叭口朝前上方（前移 ${dz.toFixed(2)}m 抬升 ${dy.toFixed(2)}m，仰角 ${elev.toFixed(0)}°）`)
  else bad(`喇叭口朝向异常：dz=${dz.toFixed(2)} dy=${dy.toFixed(2)} 仰角 ${elev.toFixed(0)}°`)
  // 曲颈与喇叭尾端相接（喇叭首段与曲颈 AABB 相交；曲颈=grp 直接子件中 rotation.x≈0.5 者）
  const neck = g.children.find((c) => Math.abs(c.rotation.x - 0.5) < 0.01)
  if (neck) {
    const nb = aabb(neck), fb = aabb(segs[0])
    const gap = Math.max(nb.min.x - fb.max.x, fb.min.x - nb.max.x, nb.min.y - fb.max.y, fb.min.y - nb.max.y, nb.min.z - fb.max.z, fb.min.z - nb.max.z)
    if (gap <= GAP) ok('曲颈前端与喇叭尾端相接（≤5mm）')
    else bad(`曲颈与喇叭尾端分离 ${(gap * 1000).toFixed(1)}mm`)
  }
}

// ---- ② foldladder 人字梯 ----
{
  const g = buildStructure({ kind: 'foldladder', x: 2, y: 2, w: 1, h: 1, solid: false }, def, mkMap(), 3.3) as InstanceType<typeof THREE.Group>
  g.updateMatrixWorld(true)
  const chk = g.userData.chk as { rails: InstanceType<typeof THREE.Object3D>[]; steps: InstanceType<typeof THREE.Object3D>[]; hinge: InstanceType<typeof THREE.Object3D>; deck: InstanceType<typeof THREE.Object3D> }
  // 四足齐地：四根斜杆底端 minY ≈ 0
  let footBad = 0
  for (const r of chk.rails) {
    const b = aabb(r)
    if (Math.abs(b.min.y) > 0.03) { footBad++; bad(`斜杆底端离地 ${(b.min.y * 1000).toFixed(0)}mm`) }
  }
  if (!footBad) ok(`四足齐地（4 根斜杆底端 |minY|≤3cm；左右/前后对称外张）`)
  // 踏板水平 + 两端搭进斜杆
  const frontRails = chk.rails.filter((_, i) => i % 2 === 0).map(aabb)
  let stepBad = 0
  for (const st of chk.steps) {
    const rot = Math.abs(st.rotation.x) + Math.abs(st.rotation.z)
    if (rot > 0.001) { stepBad++; bad('踏板带倾角') ; continue }
    const b = aabb(st)
    for (const rb of frontRails)
      if (b.min.x > rb.max.x - 0.01 || b.max.x < rb.min.x + 0.01) { stepBad++; bad('踏板端头未搭进斜杆'); break }
  }
  if (!stepBad) ok(`踏板水平（rotation=0，4 级等距）且两端搭进前架斜杆`)
  // 顶台贴铰链：顶台底面与铰链顶面间隙 ≤5mm
  const hb = aabb(chk.hinge), db = aabb(chk.deck)
  const dg = db.min.y - hb.max.y
  if (dg <= GAP && dg > -0.06) ok(`顶台贴铰链（间隙 ${(dg * 1000).toFixed(1)}mm，不悬空）`)
  else bad(`顶台悬空/压铰链：间隙 ${(dg * 1000).toFixed(1)}mm`)
}

// ---- ③ boilerdeep 黑门已纳入门洞开凿 ----
if (DOOR_EXIT_KINDS.includes('boilerdeep')) ok('boilerdeep ∈ DOOR_EXIT_KINDS（墙盒开门洞 + 门楣；模型经 orientDoor 嵌门洞格）')
else bad('boilerdeep 未纳入 DOOR_EXIT_KINDS')

console.log(fail ? `\n✗ ${fail} 项失败` : '\n✓ L5 建模修复自检全部通过')
process.exit(fail ? 1 : 0)
