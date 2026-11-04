/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [l5tails] L5 第一期小尾巴无头验收（真实 Engine + 真实无限 L5 地图）。运行：npm run check:l5tails
// ① 低理智肖像换章鱼头 ② 墙纸人脸 ③ 走廊肖像 / 各层陈设 ④ 管道下水洼 ⑤ 邀请函 → 原住民 ⑥ B1 黑门
// ⑦ 大堂门只在不被注视时出现 ⑧ 闪烁连灯罩自发光一起压暗
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), devicePixelRatio: 1 },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const H = await import('../src/game/engine/l5Hotel')
const T = await import('../src/game/engine/l5Tails')
const IL5 = await import('../src/game/world/infiniteL5')
const P = await import('../src/game/renderer/l5Portrait')
const RT = await import('../src/game/renderer/l5Tails')
const { snapshot } = await import('../src/game/engine/save')
const { audio } = await import('../src/game/core/audio')
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => {}

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${dbg !== undefined ? '  ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const src = (p: string) => readFileSync(new URL('../src/game/' + p, import.meta.url), 'utf8')

const mk = (floor: number, sd: number) => {
  const e: any = new Engine(); e.seed = sd * 313; e.emit = () => {}
  e.hotel.floor = floor
  e.loadLevel(5, { mapSeed: sd * 313 + floor, firstVisit: true }); e.introT = 0
  e.map.entities = []
  Object.assign(e.player, { hp: 100, sanity: 80, hunger: 100, thirst: 100, stamina: 100 })
  return e
}
const tally = (floor: number, seeds = 6) => {
  const c: Record<string, number> = { corrPortrait: 0, hallPortrait: 0, corrShelf: 0, luggage: 0, puddle: 0, boilerdeep: 0, corrLamp: 0, faces: 0, puddleBadPipe: 0, shelfBlocksDoor: 0 }
  const faces = new Set<number>()
  for (let sd = 1; sd <= seeds; sd++) {
    const e = mk(floor, sd), m = e.map
    for (const s of m.structures) {
      if (s.kind === 'bigpainting' && s.data?.gaze) { (s.data?.corridor ? c.corrPortrait++ : c.hallPortrait++); faces.add(Number(s.data.face)) }
      if (s.kind === 'libshelf' && s.data?.corridor) c.corrShelf++
      if (s.kind === 'l5luggage') c.luggage++
      if (s.kind === 'lightgrid' && s.data?.axis) c.corrLamp++
      if (s.kind === 'l5puddle') {
        c.puddle++
        if (!m.structures.some((q: any) => q.kind === 'pipes' && Math.abs(q.x - s.x) === 1 && q.y === s.y)) c.puddleBadPipe++
      }
    }
    c.boilerdeep += (m.exits ?? []).filter((x: any) => x.def?.kind === 'boilerdeep').length
  }
  c.faces = faces.size
  return c
}

// ---------------------------------------------------------------------------
console.log('— ① 低理智：肖像换章鱼头 —')
{
  let st = { octo: false, seenF: 0 }, sw = 0, trials = 0
  for (let k = 0; k < 200000; k++) { const nst = T.octoStep({ octo: false, seenF: 0 }, true, false, Math.random(), 1); trials++; if (nst.octo) sw++; st = nst }
  const perMin = 1 - Math.pow(1 - sw / trials, 60)
  ok(Math.abs(perMin - T.TT.octoPerMin) < 0.006, `理智 < ${T.TT.octoSan}、视线外：每分钟换脸概率 ≈ ${(perMin * 100).toFixed(2)}%（设计 2%）`)
  let none = 0; for (let k = 0; k < 20000; k++) if (T.octoStep({ octo: false, seenF: 0 }, false, false, 0, 1).octo) none++
  ok(none === 0, '理智正常：从不换脸（u = 0 也不换）')
  let seen = 0; for (let k = 0; k < 20000; k++) if (T.octoStep({ octo: false, seenF: 0 }, true, true, 0, 1).octo) seen++
  ok(seen === 0, '正被看着的画不会当面换脸')
  st = { octo: true, seenF: 0 }
  const f1 = T.octoStep(st, true, true, 0.9, 1 / 60), f2 = T.octoStep(f1, true, true, 0.9, 1 / 60)
  ok(f1.octo && !f2.octo, '被看到：第 1 帧仍是章鱼头，第 2 帧恢复（「回头 1 帧后恢复」）', [f1, f2])
  ok(T.octoStep({ octo: true, seenF: 0 }, false, false, 0.9, 1).octo, '视线外保持章鱼头（理智回升后也要等被看到才恢复）')
  const e = mk(1, 1)
  e.player.sanity = 39; ok(T.hotelLowSanity(e), '理智 39 → 低理智')
  e.player.sanity = 40; ok(!T.hotelLowSanity(e), '理智 40 → 不算低')
  const tex = P.paintOcto(3), g = P.buildL5Portrait(3, 1.12, 1.4, false)
  ok(tex && (tex as any).image, '章鱼头画布贴图生成（沿用该画的衣着 / 背景）')
  const mat = ((g.userData.portrait.front.children[0]) as any).material, human = mat.map
  P.setPortraitOcto(g, true); const isOcto = mat.map === tex
  P.setPortraitOcto(g, false)
  ok(isOcto && mat.map === human && g.userData.face === 3, '换上 / 换回：只换画布贴图，3D 眼睛位置不变')
  const r = src('renderer/renderer.ts')
  ok(/octoStep\(/.test(r) && /setPortraitOcto\(/.test(r) && /isPortraitInView\(this\.camera,por\)/.test(r) && /!por\.userData\.beastFace/.test(r), '渲染层逐帧接线：视野判定 isPortraitInView、野兽脸优先')
}

console.log('— ② 墙纸人脸 —')
{
  const e = mk(1, 2)
  e.player.sanity = 20
  let spot: any = null
  for (let k = 0; k < 64 && !spot; k++) { e.player.facing = (k / 64) * Math.PI * 2; spot = T.pickWallFaceSpot(e, () => 0.5) }
  ok(!!spot, '找到余光里的墙面', spot)
  if (spot) {
    const D = [[1, 0], [0, 1], [-1, 0], [0, -1]][spot.wall], p = e.player
    const fx = spot.x + 0.5 + D[0] * 0.5, fy = spot.y + 0.5 + D[1] * 0.5, d = Math.hypot(fx - p.x, fy - p.y)
    let a = Math.atan2(fy - p.y, fx - p.x) - p.facing; a = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)))
    ok(d >= T.TT.faceMin && d <= T.TT.faceMax && a >= T.TT.faceConeMin && a <= T.TT.faceConeMax, `距离 ${d.toFixed(2)} m（≤ 4 m）、偏离视线 ${a.toFixed(2)} rad（余光）`)
    ok(e.map.tiles[(spot.y + D[1]) * e.map.w + spot.x + D[0]] !== 1 && e.map.tiles[spot.y * e.map.w + spot.x] === 1, '贴在实墙上、站位是地板')
    let f: any = T.hotelForceWallFace(e, spot, 0)
    for (let k = 0; k < 60; k++) f = T.wallFaceStep(f, false, 1 / 60)
    ok(f && f.a > 0.5 && f.a < 1, `没人看：慢慢浮现（1 s 后 a = ${f?.a.toFixed(2)}，${T.TT.faceIn} s 浮满）`)
    for (let k = 0; k < 120; k++) f = T.wallFaceStep(f, false, 1 / 60)
    ok(f && f.a === 1, '浮现完全')
    let gone = -1
    for (let k = 0; k < 60 && f; k++) { f = T.wallFaceStep(f, true, 1 / 60); if (!f) gone = k + 1 }
    ok(gone > 0 && gone <= Math.ceil(T.TT.faceOut * 60) + 1, `被注视：${gone} 帧内消失（≤ ${T.TT.faceOut} s）`)
    f = T.hotelForceWallFace(e, spot, 1)
    e.player.facing = Math.atan2(fy - p.y, fx - p.x)
    ok(T.wallFaceWatched(e, f), '准星对着它 = 被注视')
    let life = 0; f = { ...f, a: 1 }; while (f && life < 2000) { f = T.wallFaceStep(f, false, 1 / 60); life++ }
    ok(life / 60 <= T.TT.faceLife + T.TT.faceOut + 0.05, `最长停留 ${T.TT.faceLife} s 后自己淡出（${(life / 60).toFixed(2)} s）`)
  }
  // 频率：理智 20 时一段时间内会出现；理智 80 时从不出现
  const cnt = (san: number) => {
    const e2 = mk(1, 2); let shown = 0, was = false
    for (let k = 0; k < 600 * 10; k++) {
      e2.player.sanity = san; e2.player.facing = (k * 0.013) % (Math.PI * 2)
      T.stepTails(e2, 0.1)
      const f = T.hotelWallFace(e2); if (f && !was) shown++; was = !!f
    }
    return shown
  }
  const lo = cnt(20), hi = cnt(80)
  ok(lo >= 3 && hi === 0, `10 分钟：理智 20 浮现 ${lo} 次、理智 80 浮现 ${hi} 次`)
  const r = src('renderer/renderer.ts')
  ok(/syncWallFace\(this\.scene, def\.id === 5 \? hotelWallFace\(engine\)/.test(r) && !!RT.wallFaceTexture(1), '渲染层：墙面浮雕脸贴图 + 透明度跟引擎')
}

console.log('— ③ 走廊肖像 / 各层陈设 —')
const F1 = tally(1), F7 = tally(7), F9 = tally(9), F10 = tally(10), B1 = tally(0)
{
  ok(P.PORTRAIT_FACES === IL5.L5_PORTRAIT_FACE_COUNT && P.PORTRAIT_FACES === 9, `肖像面孔 6 → ${P.PORTRAIT_FACES} 张，生成器同值`)
  for (let i = 0; i < 9; i++) if (!P.portraitName(i)) ok(false, '面孔 ' + i + ' 缺名字')
  ok(F1.corrPortrait > 0 && F1.faces >= 8, `1F 走廊肖像 ${F1.corrPortrait} 幅（6 图），出现过 ${F1.faces} 种面孔`, F1)
  ok(F7.corrShelf > 20 && F7.corrPortrait === 0, `7F 藏书层：走廊书架 ${F7.corrShelf}、走廊肖像 ${F7.corrPortrait}`)
  ok(F1.corrShelf === 0 && F10.corrShelf === 0, '其他楼层走廊不放书架')
  ok(F10.luggage > 5 && F1.luggage === 0, `10F 行李层：行李堆 ${F10.luggage}；1F ${F1.luggage}`)
  ok(F9.corrLamp > 0 && F9.corrLamp <= F1.corrLamp * 0.62, `9F 飞蛾层：走廊灯 ${F9.corrLamp}（1F ${F1.corrLamp}，×${(F9.corrLamp / F1.corrLamp).toFixed(2)}）`)
  // 走廊陈设不挡路：书架 / 行李堆外侧是实墙，且自己那格以外的走廊仍可通行（竖廊 3 宽，至少留 2 格）
  const e = mk(7, 1), m = e.map
  let bad = 0
  for (const s of m.structures) if ((s.kind === 'libshelf' && s.data?.corridor) || s.kind === 'l5luggage') {
    const lx = s.x, ly = s.y
    const D = s.data.wall === 0 ? 1 : -1
    if (m.tiles[ly * m.w + lx + D] === 1) bad++ // 外侧必须是墙
    if (m.tiles[ly * m.w + lx - D] !== 1) bad++ // 内侧必须是地板
  }
  ok(bad === 0, '书架 / 行李堆都贴实墙、内侧留通道', bad)
}

console.log('— ④ 管道下水洼 —')
{
  ok(B1.puddle + F1.puddle > 0 && B1.puddleBadPipe + F1.puddleBadPipe === 0, `锅炉房水洼 B1 ${B1.puddle} / 1F ${F1.puddle}，全部紧挨管段`)
  let e: any = null, s: any = null
  for (let sd = 1; sd < 30 && !s; sd++) { e = mk(0, sd); s = e.map.structures.find((q: any) => q.kind === 'l5puddle') }
  ok(!!s, '找到一个水洼')
  if (s) {
    e.player.sanity = 50
    const r1 = T.hotelDrinkPuddle(e, s), s1 = e.player.sanity
    const r2 = T.hotelDrinkPuddle(e, s), s2 = e.player.sanity
    ok(r1 && s1 === 50 + T.TT.puddleSan && !r2 && s2 === s1, `喝一次理智 +${T.TT.puddleSan}，同一洼不能再喝`, [s1, s2])
    const snap: any = snapshot(e)
    const back = H.restoreHotel(JSON.parse(JSON.stringify(snap.hotel)))
    ok(back.tails?.puddles?.includes(T.puddleKey(e, s)), '喝过的水洼进存档')
    const keep = e.hotel; e.hotel = back
    const s0 = { ...s, data: { l5: 1 } }
    ok(T.puddleDrunk(e, s0), '读档后同一洼仍算喝过（结构上的 drunk 标记清掉也认）')
    e.hotel = keep
    const it = src('engine/interact.ts')
    ok(/'l5puddle'\) consider\('puddle'/.test(it) && /case 'puddle'/.test(it), 'X 交互接线')
  }
}

console.log('— ⑤ 贝弗莉邀请函 → 原住民 —')
{
  let e: any = null, door: any = null
  for (let sd = 1; sd < 60 && !door; sd++) { e = mk(4, sd); door = e.map.structures.find((q: any) => q.kind === 'l5walldoor' && q.data?.go) }
  ok(!!door, '找到能推开的贝弗莉墙门')
  if (door) {
    const x0 = e.player.x
    H.hotelBevDoor(e, door)
    ok(!e.transition && e.player.x !== x0, '没读过邀请函：照旧传送到同楼层')
    ok(T.hotelReadInvite(e) && !T.hotelReadInvite(e) && T.hotelHasInvite(e), '读邀请函记一次（第二次不重复提示）')
    H.hotelBevDoor(e, door)
    ok(e.transition?.dest === 112, '持邀请函：门后是原住民据点（level 112）', e.transition)
    const back = H.restoreHotel(JSON.parse(JSON.stringify((snapshot(e) as any).hotel)))
    ok(back.tails?.invite === 1, '邀请函进存档')
    const it = src('engine/interact.ts')
    ok(/if \(s\.kind === 'invitation'\) hotelReadInvite\(eng\)/.test(it), '阅读邀请函（地标卡链路）时记住')
  }
}

console.log('— ⑥ B1 专属黑门 —')
{
  ok(B1.boilerdeep > 0, `B1 锅炉层黑门 ${B1.boilerdeep} 扇（6 张图）`)
  const others = [F1, F7, F9, F10].reduce((a, c) => a + c.boilerdeep, 0)
  ok(others === 0, `其他楼层黑门 ${others} 扇`)
}

console.log('— ⑦ 大堂门只在不被注视时出现 —')
{
  let e: any = null, s: any = null
  for (let sd = 1; sd < 400 && !s; sd++) { e = mk(1, sd); s = e.map.structures.find((q: any) => q.kind === 'l5pocketdoor' && q.data?.pocket === 'lobby' && !q.data?.event) }
  ok(!!s, '找到一扇大堂门')
  if (s) {
    const p = e.player, cx = s.x + 0.5, cy = s.y + 0.5
    // 站到门前 3 m 的可走格
    let placed = false
    for (let r = 2; r < 6 && !placed; r++) for (let k = 0; k < 16 && !placed; k++) { const a = (k / 16) * Math.PI * 2, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (e.map.tiles[Math.floor(y) * e.map.w + Math.floor(x)] === 1 && e.los(x, y, cx, cy)) { p.x = x; p.y = y; placed = true } }
    p.facing = Math.atan2(cy - p.y, cx - p.x)
    for (let k = 0; k < 300; k++) H.updateHotel(e, 1 / 60)
    ok(placed && !H.hotelLobbyShown(e, s), '一直盯着那面墙 5 s：门不出现')
    p.facing += Math.PI
    for (let k = 0; k < 120; k++) H.updateHotel(e, 1 / 60)
    ok(H.hotelLobbyShown(e, s), '转身 2 s（不被注视）：门出现了')
  }
}

console.log('— ⑧ 闪烁连灯罩一起压暗 —')
{
  const e = mk(1, 3)
  e.hotelFlicker = { x: e.player.x, y: e.player.y, t: 3 }
  const seq = new Set<number>(); for (let k = 0; k < 90; k++) { e.hotelFlicker.t = 3 - k / 30; seq.add(H.flickerMul(e, e.player.x, e.player.y)) }
  ok(seq.has(0.08) && seq.has(1), '闪烁方波 0.08 / 1')
  const r = src('renderer/renderer.ts')
  const lamp = /f\.mat\.color\.copy\(f\.mat\.userData\.base[^\n]*flickerMul\(engine, *f\.src\.x, *f\.src\.y\)/.test(r)
  const power = /power=[^\n]*flickerMul\(engine,f\.src\.x,f\.src\.y\)/.test(r)
  ok(lamp && power, '灯具自发光（灯罩）与点光共用 flickerMul（渲染层）')
}

{
  const { scanInteract } = await import('../src/game/engine/interact')
  const { look } = await import('../src/game/renderer/shared')
  const e = mk(1, 17)
  e.loadLevel(117)
  const m = e.map
  m.structures = []; m.items = []; m.entities = []; m.exits = []; e.npcs = []
  m.tiles.fill(1); m.elev.fill(0); m.liquid.fill(0); m.stair.fill(0)
  Object.assign(e.player, { x: 4.5, y: 4.5, z: 0, floor: 0, facing: 0 })
  look.yaw = -Math.PI / 2; look.pitch = 0; look.visualHit = null
  const prop = { id: 4321, kind: 'bigpainting', x: 5.65, y: 4.25, w: .2, h: .5, solid: false, data: {} }
  const events: string[] = []
  e.emit = (event: { kind: string }) => { events.push(event.kind) }
  m.structures.push(prop)
  for (const level of [3, 5, 4]) {
    e.player.level = level; e.interactTarget = null; events.length = 0
    scanInteract(e); e.doInteract()
    ok(events.includes('doc') === (level === 3), '大幅画作 L' + level + ' 可读文档符合层级规则')
    if (level === 5) ok(e.interactTarget?.kind === 'bigpainting' && events.includes('msg'), 'L5 画作保留现场文字说明')
  }
  prop.kind = 'frontdesk'; e.player.level = 5; e.interactTarget = null
  scanInteract(e)
  ok(!e.interactTarget, '装饰前台不会成为交互目标')
}

console.log(`\n通过 ${n - fails} / ${n}`)
process.exit(fails ? 1 : 0)
