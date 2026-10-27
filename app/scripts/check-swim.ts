/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接拨动引擎内部字段 */
// [swim] 游泳重制 阶段 1——控制器与物理无头验收（真实 Engine.step + 手搭水域地图）。运行：npm run check:swim
import { createCanvas } from '@napi-rs/canvas'
import { readFileSync } from 'node:fs'

const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => createCanvas(256, 256) },
  window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { look } = await import('../src/game/core/renderer3d')
const { audio } = await import('../src/game/core/audio')
const SW = await import('../src/game/engine/swim')
const ARMS = await import('../src/game/renderer/swimArms')
const { SWIM } = SW
const calls: Record<string, number> = {}
for (const k of Object.keys(audio)) if (typeof (audio as any)[k] === 'function') (audio as any)[k] = () => { calls[k] = (calls[k] ?? 0) + 1 }
for (const k of Object.getOwnPropertyNames(Object.getPrototypeOf(audio))) if (k !== 'constructor' && typeof (audio as any)[k] === 'function') (audio as any)[k] = () => { calls[k] = (calls[k] ?? 0) + 1 }

let fails = 0, n = 0
const ok = (c: unknown, m: string, dbg?: unknown) => { n++; console.log(`${c ? '✔' : '✘'} ${m}${!c && dbg !== undefined ? ' ⟵ ' + JSON.stringify(dbg) : ''}`); if (!c) fails++ }
const DT = 1 / 30
const f2 = (v: number) => v.toFixed(2)

/**
 * 手搭水域：S×S，四周墙。level=7 时整片深海（海床 depth）；其他层是一个深水池，
 * 池外一圈高 1.2m 的台面（elev 2），用来测撑上岸。
 */
function world(level: number, opts: { depth?: number; S?: number } = {}) {
  const S = opts.S ?? 80, N = S * S, zero = () => new Uint8Array(N)
  const eng: any = new Engine()
  eng.player.level = level
  const depth = opts.depth ?? (level === 7 ? 150 : 1.7)
  eng.map = { w: S, h: S, tiles: zero().fill(1), structures: [], items: [], lights: [], exits: [], entities: [], spawn: { x: 20, y: 20 },
    wet: zero(), elev: zero(), outdoor: zero(), step: zero(), crawl: zero(), ceiling: zero(), up: zero(), upWall: zero(), up2: zero(), upWall2: zero(), stair: new Int32Array(N),
    liquid: zero().fill(1), seaFloor: new Float32Array(N).fill(depth), floors: 1, dn: zero(), dnWall: zero(), tint: zero() }
  const m = eng.map
  for (let i = 0; i < S; i++) { m.tiles[i] = 0; m.tiles[(S - 1) * S + i] = 0; m.tiles[i * S] = 0; m.tiles[i * S + S - 1] = 0 }
  if (level !== 7) {
    // 池：x,y ∈ [10, S-10)；外圈台面 elev 2（+1.2m）
    for (let y = 1; y < S - 1; y++) for (let x = 1; x < S - 1; x++) {
      const i = y * S + x
      const pool = x >= 10 && x < S - 10 && y >= 10 && y < S - 10
      m.liquid[i] = pool ? 1 : 0
      m.elev[i] = pool ? 0 : 2
    }
  }
  eng.explored = new Uint8Array(N)
  const p = eng.player
  Object.assign(p, { level, x: S / 2 + 0.5, y: S / 2 + 0.5, z: level === 7 ? -40 : -0.8, vz: 0, floor: 0, hp: 100, sanity: 100, hunger: 100, thirst: 100, facing: 0, flashlight: false, battery: 100, stamina: 100 })
  eng.inLiquid = 1; eng.submerged = level === 7
  look.yaw = 0; look.pitch = 0
  eng.emit = () => {}; eng.persist = () => {}
  eng.dev.god = true // 不测溺水/水压
  eng.dev.statLock = false
  eng.swimMode = 'view'
  const inp = eng.input
  const clear = () => { inp.mx = 0; inp.my = 0; inp.jump = false; inp.crouch = false; inp.sprint = false }
  /** 本地按键 → 世界系输入（与 renderer.applyView 一致：W = my0 -1） */
  const keys = (k: { w?: number; d?: number; jump?: boolean; crouch?: boolean; sprint?: boolean }) => {
    const mx0 = k.d ?? 0, my0 = -(k.w ?? 0)
    const s = Math.sin(look.yaw), c = Math.cos(look.yaw)
    inp.mx = c * mx0 + s * my0; inp.my = -s * mx0 + c * my0
    inp.jump = !!k.jump; inp.crouch = !!k.crouch; inp.sprint = !!k.sprint
  }
  const step = () => { eng.step(DT) }
  const run = (secs: number, each?: () => void) => { for (let t = 0; t < secs - 1e-9 && !eng.over; t += DT) { each?.(); step() } }
  const hs = () => Math.hypot(eng.swim.vx, eng.swim.vy)
  const sp3 = () => Math.hypot(eng.swim.vx, eng.swim.vy, eng.swim.vz)
  return { eng, m, p, inp, clear, keys, step, run, hs, sp3, S }
}

const L7MAX = 3.4 * 0.72, POOLMAX = 3.4 * 0.56

// ===== 1. 惯性：起步要加速，不再瞬间满速 =====
{
  const w = world(7)
  w.keys({ w: 1 }); w.run(0.1)
  const v01 = w.hs()
  w.run(0.7)
  const v08 = w.hs()
  w.run(1.2)
  const vTop = w.hs()
  ok(v01 < L7MAX * 0.5 && v01 > 0.1, `起步 0.1s 速度 ${f2(v01)} < 一半最高速（${f2(L7MAX / 2)}）——不再瞬间满速`)
  ok(v08 > L7MAX * 0.9, `0.8s 内达到 90% 最高速（${f2(v08)} / ${f2(L7MAX)}）`)
  ok(Math.abs(vTop - L7MAX) < 0.05, `L7 稳态游速 ${f2(vTop)} ≈ ${f2(L7MAX)} m/s（与旧版一致）`)
  // 2. 松手滑行
  const x0 = w.p.x, y0 = w.p.y
  w.clear(); w.run(0.5)
  const v05 = w.hs()
  w.run(2.5)
  const v3 = w.hs()
  ok(v05 > vTop * 0.35 && v05 < vTop * 0.75, `松手 0.5s 还剩 ${Math.round(v05 / vTop * 100)}% 速度——有滑行`)
  ok(v3 < vTop * 0.05, `松手 3s 基本停下（${f2(v3)} m/s）`)
  const glide = Math.hypot(w.p.x - x0, w.p.y - y0)
  ok(glide > 0.8 && glide < 3, `松手后滑行距离 ${f2(glide)} m（0.8–3m）`)
  // 3. 反向刹车比顺向加速快
  w.keys({ w: 1 }); w.run(2)
  w.keys({ w: -1 }); let tStop = 0
  for (; tStop < 2 && w.eng.swim.vy < 0; tStop += DT) w.step()
  ok(tStop < 0.45, `全速时按后退 ${f2(tStop)}s 内停住（有刹车，不会漂一大圈）`)
}

// ===== 4. 方向：view 沿视线、flat 水平 =====
{
  const w = world(7)
  look.pitch = -0.6
  w.keys({ w: 1 }); w.run(2)
  const vz = w.eng.swim.vz, h = w.hs()
  ok(vz < -L7MAX * Math.sin(0.6) * 0.9 && Math.abs(Math.atan2(vz, h) + 0.6) < 0.05, `view：低头 34° 按前进，沿视线向下游（vz ${f2(vz)}，俯角 ${f2(Math.atan2(vz, h))}）`)
  look.pitch = 0.5; w.run(2)
  ok(w.eng.swim.vz > L7MAX * Math.sin(0.5) * 0.9, `view：抬头按前进，向上游（vz ${f2(w.eng.swim.vz)}）`)
  const w2 = world(7); w2.eng.swimMode = 'flat'
  look.pitch = -0.6
  const z0 = w2.p.z
  w2.keys({ w: 1 }); w2.run(2)
  ok(Math.abs(w2.p.z - z0) < 0.05 && Math.abs(w2.hs() - L7MAX) < 0.05, `flat：同样低头按前进只水平游（Δz ${f2(w2.p.z - z0)}，水平 ${f2(w2.hs())}）`)
  w2.keys({ crouch: true }); w2.run(2)
  ok(w2.eng.swim.vz < -L7MAX * 0.9, `flat：下蹲下潜（vz ${f2(w2.eng.swim.vz)}）`)
  w2.keys({ jump: true }); w2.run(2)
  ok(w2.eng.swim.vz > L7MAX * 0.9, `flat：跳跃上浮（vz ${f2(w2.eng.swim.vz)}）`)
  look.pitch = 0
  // view：前进 + 跳跃 = 斜上（垂直键与视线方向叠加）
  const w3 = world(7)
  w3.keys({ w: 1, jump: true }); w3.run(2)
  ok(w3.eng.swim.vz > 1 && w3.hs() > 1, `view：前进 + 跳跃斜向上游（vz ${f2(w3.eng.swim.vz)}，水平 ${f2(w3.hs())}）`)
}

// ===== 5. 冲刺划水：节奏推进、可侧移、按划水扣体力 =====
{
  const w = world(7)
  w.p.stamina = 100
  const speeds: number[] = []
  w.keys({ w: 1, sprint: true })
  const s0 = w.eng.swim.strokes
  w.run(3.1, () => speeds.push(w.sp3()))
  const strokes = w.eng.swim.strokes - s0
  const late = speeds.slice(45)
  const mean = late.reduce((a, b) => a + b, 0) / late.length
  const amp = Math.max(...late) - Math.min(...late)
  const SPR = 6 * 0.72
  ok(strokes >= 5 && strokes <= 6, `冲刺 3.1s 划水 ${strokes} 下（周期 ${SWIM.STROKE_T}s）`)
  ok(mean > L7MAX * 1.35 && mean < SPR * 1.15, `冲刺平均速度 ${f2(mean)} m/s（普通 ${f2(L7MAX)}，冲刺上限 ${f2(SPR)}）`)
  ok(amp > 0.4, `速度一冲一滑（波动 ${f2(amp)} m/s）——有划水节奏`)
  ok(Math.abs(100 - w.p.stamina - strokes * SWIM.STROKE_STAMINA) < 1, `体力按划水扣：${strokes} 下扣 ${f2(100 - w.p.stamina)}（每下 ${SWIM.STROKE_STAMINA}）`)
  // 冲刺侧移：以前冲刺强制朝准星，现在 A/D 生效
  const w2 = world(7)
  const x0 = w2.p.x, y0 = w2.p.y
  w2.keys({ d: 1, sprint: true }); w2.run(2)
  // yaw=0：前方 (0,-1)，右方 (1,0)
  ok(w2.p.x - x0 > 3 && Math.abs(w2.p.y - y0) < 0.3, `冲刺 + 右移确实往右划（Δx ${f2(w2.p.x - x0)}，Δy ${f2(w2.p.y - y0)}）——冲刺不再锁死准星方向`)
  // 体力耗尽不再划水
  const w3 = world(7); w3.p.stamina = 0.5
  const st0 = w3.eng.swim.strokes
  w3.keys({ w: 1, sprint: true }); w3.run(1, () => { w3.p.stamina = 0.5 })
  ok(w3.eng.swim.strokes === st0 && w3.hs() < L7MAX + 0.05, '体力耗尽时不能划水冲刺')
}

// ===== 6. 浮力：浅处上浮、中层中性、深处缓慢下沉 =====
{
  const w = world(7); w.p.z = -1.5; w.clear()
  let t = 0
  for (; t < 8 && w.p.z < -0.15; t += DT) w.step()
  ok(t < 6, `水面下 1.5m 不动，${f2(t)}s 内浮回水面`)
  const w2 = world(7); w2.p.z = -15; w2.clear(); w2.run(5)
  ok(Math.abs(w2.p.z + 15) < 0.05, `15m 深处不动 5s 基本不漂（Δz ${f2(w2.p.z + 15)}）`)
  const w3 = world(7); w3.p.z = -90; w3.clear(); w3.run(10)
  ok(w3.p.z < -90.8 && w3.p.z > -97, `90m 深处不动 10s 缓慢下沉 ${f2(-90 - w3.p.z)} m（肺被压缩）`)
  ok(SW.buoyancy(1) > 0 && SW.buoyancy(10) === 0 && SW.buoyancy(120) < 0, '浮力曲线：浅处正、中层零、深处负')
}

// ===== 7. 水面：低头小角度不往下钻；大角度/下蹲翻身入水 =====
{
  const w = world(7); w.p.z = 0.05
  look.pitch = -0.25
  w.keys({ w: 1 }); w.run(3)
  ok(w.p.z > -0.25, `水面上低头 14° 前进 3s 仍在水面（z ${f2(w.p.z)}）`)
  look.pitch = -0.7; w.run(2)
  ok(w.p.z < -1.5, `低头 40° 前进就潜下去（z ${f2(w.p.z)}）`)
  look.pitch = 0
  const w2 = world(7); w2.p.z = 0.05; w2.clear(); w2.run(0.5)
  w2.inp.crouch = true; w2.step(); w2.inp.crouch = false
  let t = 0, minZ = 0
  for (; t < 1.5; t += DT) { w2.step(); minZ = Math.min(minZ, w2.p.z) }
  ok(minZ < -0.9, `水面点一下下蹲：翻身入水，最深到 ${f2(minZ)} m`)
}

// ===== 8. 贴墙滑行：撞墙不硬停、不积速度 =====
{
  const w = world(7, { S: 60 })
  // 玩家贴近北墙（y=1 那一行墙，墙面 y=1）
  w.p.x = 30.5; w.p.y = 1.6
  look.yaw = 0 // 前方 (0,-1) 正对墙
  // 斜 45° 朝墙前进
  const x0 = w.p.x
  w.keys({ w: 1, d: 1 }); w.run(2)
  ok(w.p.x - x0 > 2, `斜着撞墙仍沿墙滑动（Δx ${f2(w.p.x - x0)} m）`)
  ok(Math.abs(w.eng.swim.vy) < 0.5, `朝墙方向的速度被墙吃掉，不会越积越多（vy ${f2(w.eng.swim.vy)}）`)
  w.clear(); const y1 = w.p.y; w.run(0.5)
  ok(Math.abs(w.p.y - y1) < 0.1, '松手后不会被积攒的速度弹走')
}

// ===== 9. 传送不带惯性 =====
{
  const w = world(7)
  w.keys({ w: 1 }); w.run(2)
  w.clear(); w.p.x += 20; w.step()
  ok(w.hs() < 0.05, `位置突变（传送）后清掉惯性（${f2(w.hs())}）`)
}

// ===== 10. 水池（非 L7）：可冲刺、撑上岸 =====
{
  const w = world(0)
  w.keys({ w: 1 }); w.run(2)
  ok(Math.abs(w.hs() - POOLMAX) < 0.05, `水池游速 ${f2(w.hs())} ≈ ${f2(POOLMAX)}（旧版 1.70）`)
  const st = w.eng.swim.strokes
  w.keys({ w: 1, sprint: true }); w.run(1.5)
  ok(w.eng.swim.strokes > st, '水池里也能冲刺划水（以前只有 L7 能）')
  // 撑上岸：浮在水面，面朝北边台面（池边 y=10，台面 +1.2m）
  const w2 = world(0)
  w2.p.x = 40.5; w2.p.y = 10.45; w2.p.z = 0.1; look.yaw = 0
  w2.clear(); w2.run(0.3)
  const info = w2.eng.swimInfo()
  ok(info?.edge === true, 'HUD：面朝够得着的台面时提示「撑上岸」', info)
  w2.keys({ w: 1, jump: true }); w2.step()
  w2.clear()
  let t = 0
  for (; t < 1.5 && (w2.eng.swim.out || w2.eng.inLiquid === 1); t += DT) w2.step()
  ok(w2.eng.inLiquid === 0 && Math.abs(w2.p.z - 1.2) < 0.1 && w2.p.y < 10, `按跳跃 ${f2(t)}s 撑上 1.2m 台面（z ${f2(w2.p.z)}，y ${f2(w2.p.y)}）`)
  w2.run(1)
  ok(w2.eng.inLiquid === 0 && Math.abs(w2.p.z - 1.2) < 0.1, '上岸后稳稳站在台面上')
  // 潜在水底时按跳跃不会瞬移上岸
  const w3 = world(0)
  w3.p.x = 40.5; w3.p.y = 10.45; w3.p.z = -1.6; look.yaw = 0
  w3.keys({ w: 1, jump: true }); w3.step()
  ok(!w3.eng.swim.out, '潜在池底时按跳跃不会直接撑上岸（先要浮到水面）')
  // 台面太高（深水池边 +2.4m 的墙）撑不上去
  const w4 = world(0)
  w4.p.x = 40.5; w4.p.y = 10.45; w4.p.z = 0.1; look.yaw = 0
  for (let x = 0; x < w4.S; x++) w4.m.tiles[9 * w4.S + x] = 0
  w4.keys({ w: 1, jump: true }); w4.run(0.5)
  ok(!w4.eng.swim.out && w4.eng.inLiquid === 1, '前面是墙（够不着）就不会撑上去')
}

// ===== 11. 体力：水下恢复慢、水面正常 =====
{
  const w = world(7); w.p.stamina = 20; w.p.z = -20; w.clear()
  w.run(2)
  const subGain = w.p.stamina - 20
  const w2 = world(7); w2.p.stamina = 20; w2.p.z = 0.05; w2.clear()
  w2.run(2)
  const surfGain = w2.p.stamina - 20
  ok(subGain > 0 && Math.abs(subGain / surfGain - SWIM.SUB_STAMINA_REGEN) < 0.08, `水下体力恢复是水面的 ${f2(subGain / surfGain)} 倍（目标 ${SWIM.SUB_STAMINA_REGEN}）`)
}

// ===== 11b. 修复：普通游戏里氧气会掉（以前 statLock 默认开导致永远满氧） =====
{
  const w = world(7); w.p.z = -20; w.clear()
  w.eng.dev.god = false; w.eng.dev.statLock = true // 普通开局的默认值
  w.eng.breathT = 0; w.run(2)
  ok(Math.abs(w.eng.breathT - 1.4) < 0.1, `非开发者模式下水下静止 2s，屏气计时 ${f2(w.eng.breathT)}s（以前恒为 0）`)
  const w2 = world(7); w2.p.z = -20; w2.clear()
  w2.eng.dev.god = true; w2.eng.dev.statLock = true
  w2.run(2)
  ok(w2.eng.breathT === 0, '开发者无敌 + 状态锁定时仍然满氧')
}

// ===== 阶段 2：耗氧、屏气三段、出水恢复、入水、手臂 =====
{
  const real = (w: any) => { w.eng.dev.god = false; w.eng.dev.statLock = true; w.p.hp = 100 }
  const w = world(7); real(w); w.p.z = -20; w.eng.breathT = 0; w.clear(); w.run(2)
  const idle = w.eng.breathT
  const w2 = world(7); real(w2); w2.p.z = -20; w2.eng.breathT = 0; w2.keys({ w: 1 }); w2.run(2)
  const swim = w2.eng.breathT
  const w3 = world(7); real(w3); w3.p.z = -20; w3.eng.breathT = 0; w3.keys({ w: 1, sprint: true }); w3.run(2)
  const spr = w3.eng.breathT
  ok(Math.abs(idle - 1.4) < 0.1 && Math.abs(swim - 2) < 0.1 && spr > 3.3 && spr < 3.7, `耗氧：静止 2s 用 ${f2(idle)}s、游 ${f2(swim)}s、冲刺划水 ${f2(spr)}s（×0.7 / ×1 / ×1.8）`)

  // 屏气三段
  const L = 35
  const a = world(7); real(a); a.p.z = -20; a.clear(); a.eng.breathT = L * 0.5; a.step()
  ok(a.eng.swim.stage === 0, '一半氧气以内：正常（阶段 0）')
  const b0 = calls.breathBeat ?? 0
  a.eng.breathT = L * 0.7; a.run(3)
  ok(a.eng.swim.stage === 1 && (calls.breathBeat ?? 0) - b0 >= 2, `用掉 60% 后进入憋气感：3s 心跳 ${(calls.breathBeat ?? 0) - b0} 声`)
  const c0 = calls.bubbleBurst ?? 0
  a.eng.breathT = L * 0.86; a.run(4.5)
  ok(a.eng.swim.stage === 2 && (calls.bubbleBurst ?? 0) - c0 >= 2, `用掉 85% 后胸口抽动：4.5s 抽 ${(calls.bubbleBurst ?? 0) - c0} 下（吐气泡 + 镜头抖）`)
  a.eng.breathT = L + 0.01; const hp0 = a.p.hp; a.run(3)
  ok(a.eng.swim.stage === 3 && Math.abs(a.eng.swim.blackK - 0.5) < 0.06, `缺氧：3s 黑屏到 ${f2(a.eng.swim.blackK)}（6s 全黑）`)
  ok(hp0 - a.p.hp > 5, `缺氧扣血（3s 扣 ${f2(hp0 - a.p.hp)}）`)
  // 出水：前 2s 快速恢复，之后变慢；大口吸气
  const g0 = calls.gasp ?? 0
  const before = a.eng.breathT
  a.p.z = 0.05; a.run(2)
  const after2 = a.eng.breathT
  a.run(2)
  const after4 = a.eng.breathT
  ok((calls.gasp ?? 0) > g0, '憋到缺氧再浮出水面：大口吸气')
  ok(Math.abs(before - after2 - 12) < 1.2 && Math.abs(after2 - after4 - 6) < 0.6, `出水恢复：前 2s 回 ${f2(before - after2)}s 氧（×6），之后 2s 回 ${f2(after2 - after4)}s（×3）`)
  ok(a.eng.swim.blackK < 0.1, `出水后黑屏很快退去（${f2(a.eng.swim.blackK)}）`)
  // 水池（上限 8s）上岸后氧气不再瞬间回满，而是同样按曲线恢复
  const p = world(0); real(p)
  p.p.x = 40.5; p.p.y = 10.45; p.p.z = 0.1; look.yaw = 0
  p.eng.breathT = 7
  p.keys({ w: 1, jump: true }); p.step(); p.clear()
  for (let t = 0; t < 1.5 && (p.eng.swim.out || p.eng.inLiquid === 1); t += DT) p.step()
  ok(p.eng.inLiquid === 0 && p.eng.breathT > 0.5 && p.eng.breathT < 6.5, `上岸后氧气按曲线恢复，不是瞬间回满（还差 ${f2(p.eng.breathT)}s）`)
  p.run(3)
  ok(p.eng.breathT === 0, '上岸 3s 后完全恢复')
}
{
  // 入水：从高处落水会带着惯性扎进去，镜头有入水冲击
  const w = world(7); w.eng.inLiquid = 0; w.eng.submerged = false
  w.p.z = 0.6; w.p.vz = -8; w.eng.l7fx.wallFall = true
  let minZ = 1
  w.clear()
  w.run(1.5, () => { minZ = Math.min(minZ, w.p.z) })
  ok(minZ < -0.8, `高处落水扎进水里 ${f2(-minZ)}m 才浮回`)
}
{
  const p0 = ARMS.strokePose(0), p1 = ARMS.strokePose(0.9999)
  ok(Math.abs(p0.px - p1.px) + Math.abs(p0.py - p1.py) + Math.abs(p0.pz - p1.pz) < 0.01, '手臂划水循环首尾相接（不跳帧）')
  ok(ARMS.strokePose(0.2).px > 0.3 && ARMS.strokePose(0.4).py < -0.33 && ARMS.strokePose(0.65).pz > -0.36, '划水关键帧：0.2 外划、0.4 往身下拨水、0.65 收到胸前')
  let maxJump = 0
  for (let i = 0; i < 400; i++) { const a = ARMS.strokePose(i / 400), b = ARMS.strokePose((i + 1) / 400); maxJump = Math.max(maxJump, Math.hypot(a.px - b.px, a.py - b.py, a.pz - b.pz)) }
  ok(maxJump < 0.008, `手臂轨迹连续（每 1/400 周期最大位移 ${maxJump.toFixed(4)}）`)
  const st = { phase: 0, k: 0 }
  const r = ARMS.advanceArms(st, 1 / 30, { swimming: true, busy: false, speed: 4, maxSpeed: 2.45, sprintStroke: true, sinceStroke: 0.124, strokeT: 0.62, moving: true })
  ok(Math.abs(r.phase - 0.2) < 1e-6, '冲刺时手臂相位和划水冲量同步（发力 0.12s = 外划关键帧）')
  for (let i = 0; i < 30; i++) ARMS.advanceArms(st, 1 / 30, { swimming: true, busy: true, speed: 0, maxSpeed: 2.45, sprintStroke: false, sinceStroke: 9, strokeT: 0.62, moving: false })
  ok(st.k < 0.05, '使用物品 / 攻击时手臂让位（权重回到 0）')
  const rs = readFileSync('src/game/renderer/renderer.ts', 'utf8')
  ok(/advanceArms\(/.test(rs) && /strokeFov/.test(rs) && /swimCamK/.test(rs) && /engine\.inLiquid !== 1 \? 5 : 0|const on = engine\.inLiquid !== 1 &&/.test(rs) /* [movefeel] 冲刺 FOV 改为渐入，水里仍不吃 */, '渲染层接入：蛙泳手臂、划水 FOV、游泳镜头，且水里不吃冲刺 FOV')
  const hud = readFileSync('src/components/HUD.tsx', 'utf8')
  const finish = readFileSync('src/game/renderer/photoPass.ts', 'utf8')
  ok(/swimBreathVisuals/.test(rs) && /swimBreath/.test(finish) && !/anim-o2Pulse/.test(hud) && /▲ 上浮/.test(hud), '渲染与 HUD 接入：屏气效果只作用游戏画面，升降指示与深度计保持可读')
}

// ===== 阶段 3：噪音分级 =====
{
  const spy = (w: any) => { const ev: { r: number; s: boolean }[] = []; w.eng.noiseEvent = (_x: number, _y: number, r: number, sp: boolean) => ev.push({ r, s: sp }); return ev }
  const w = world(7); w.p.z = -20; const ev = spy(w); w.clear(); w.run(3)
  ok(ev.length === 0, `水下悬停 3s：没有噪音（${ev.length} 次）`)
  const w2 = world(7); w2.p.z = -20; const ev2 = spy(w2); w2.keys({ w: 1 }); w2.run(4)
  ok(ev2.length >= 5 && ev2.every((e) => e.r === SWIM.NOISE_SWIM_SUB && !e.s), `水下普通游：${ev2.length} 次轻响，半径 ${SWIM.NOISE_SWIM_SUB}m，不算明显响动`, ev2.slice(0, 3))
  const w3 = world(7); w3.p.z = 0.1; w3.eng.submerged = false; const ev3 = spy(w3); look.pitch = 0; w3.keys({ w: 1 }); w3.run(4)
  ok(ev3.length >= 5 && ev3.every((e) => e.r === SWIM.NOISE_SWIM_SURF && !e.s), `水面普通游：半径 ${SWIM.NOISE_SWIM_SURF}m（比水下响）`, ev3.slice(0, 3))
  const w4 = world(7); w4.p.z = -20; const ev4 = spy(w4); w4.keys({ w: 1, sprint: true }); w4.run(3.1)
  ok(ev4.length === w4.eng.swim.strokes && ev4.every((e) => e.r === SWIM.NOISE_STROKE_SUB && e.s), `水下冲刺：每划一下一次明显响动（${ev4.length} 下，半径 ${SWIM.NOISE_STROKE_SUB}m）`, ev4.slice(0, 3))
  const w5 = world(7); w5.p.z = 0.1; w5.eng.submerged = false; const ev5 = spy(w5); w5.keys({ w: 1, sprint: true }); w5.run(2)
  ok(ev5.length > 0 && ev5.every((e) => e.r === SWIM.NOISE_STROKE_SURF && e.s), `水面冲刺拍水：半径 ${SWIM.NOISE_STROKE_SURF}m`, ev5.slice(0, 3))
}
// ===== 阶段 3：水下战斗 =====
{
  const w = world(7); w.p.z = -20; w.step()
  w.p.hotbar[w.p.selected] = null; w.eng.attackCooldownT = 0; w.eng.attack()
  const sub = w.eng.attackCooldownDur
  const w2 = world(0); w2.p.z = -0.5; w2.eng.submerged = false; w2.eng.inLiquid = 0
  w2.p.hotbar[w2.p.selected] = null; w2.eng.attackCooldownT = 0; w2.eng.attack()
  const dry = w2.eng.attackCooldownDur
  ok(Math.abs(sub / dry - 1.3) < 1e-6, `水下徒手攻击间隔 ${f2(sub)}s = 岸上 ${f2(dry)}s × 1.3`)
  const w3 = world(7); w3.p.z = -20; w3.step()
  w3.p.hotbar[w3.p.selected] = { type: 'squirtgun', count: 1 }; w3.eng.squirtAmmo = 5; w3.eng.squirtTank = 'water'; w3.eng.attackCooldownT = 0
  const msgs: string[] = []; const om = w3.eng.msg.bind(w3.eng); w3.eng.msg = (t: string, k?: any) => { msgs.push(t); return om(t, k) }
  w3.eng.attack()
  ok(w3.eng.squirtAmmo === 5 && w3.eng.attackCooldownT === 0 && msgs.some((t) => t.includes('开不了枪')), '水下滋水枪扣不响：不耗弹、不进冷却、提示')
  w3.eng.gunCandyT = 5; w3.p.hotbar[w3.p.selected] = null; const pj = w3.eng.projectiles.length; w3.eng.chocoCd = 0; w3.eng.shootChocolate()
  ok(w3.eng.projectiles.length === pj && w3.eng.chocoCd === 0, '水下枪糖也开不了枪')
  w3.p.z = 0.1; w3.eng.submerged = false; w3.eng.squirtAmmo = 5; w3.eng.gunCandyT = 0; w3.p.hotbar[w3.p.selected] = { type: 'squirtgun', count: 1 }; w3.eng.attackCooldownT = 0
  w3.eng.attack()
  ok(w3.eng.squirtAmmo === 4, '头露出水面就能开枪')
  // 投掷射程：同样水平掷出，比较落点距离
  const range = (water: boolean) => {
    const e = world(7).eng; e.player.z = -20
    e.projectiles = [{ id: 1, type: 'gas', x: 40, y: 40, z: -18.45, floorZ: -20, vx: 9 * (water ? SWIM.THROW_SPEED : 1), vy: 0, vz: 0, ...(water ? { water: true } : {}) }]
    let land = NaN; e.landProjectile = (pr: any) => { land = pr.x }
    for (let i = 0; i < 300 && e.projectiles.length; i++) e.updateProjectiles(DT)
    return land - 40
  }
  const rAir = range(false), rWater = range(true)
  ok(Math.abs(rWater / rAir - 0.5) < 0.08, `水下投掷射程 ${f2(rWater)}m ≈ 岸上 ${f2(rAir)}m 的一半（${f2(rWater / rAir)}）`)
  const cs = readFileSync('src/game/engine/combat.ts', 'utf8')
  ok(/water \? \{ water: true \}/.test(cs) && /underwater\(eng\)/.test(cs), '投掷接入：头在水下才按水下弹道')
}
// ===== 阶段 3：L7 水流 =====
{
  const w = world(7); w.p.z = 0.05; w.clear()
  const x0 = w.p.x
  w.run(2, () => SW.surgePush(w.eng, w.eng.swim, DT, 1, 1, 0))
  const xPush = w.p.x - x0
  w.run(4)
  const xAfter = w.p.x - x0 - xPush
  ok(xPush > 1.5 && xAfter > 1.2, `1m 浪峰推 2s：被推开 ${f2(xPush)}m，浪过后还漂了 ${f2(xAfter)}m（有惯性）`)
  const d = world(7); d.p.z = -8; d.clear()
  const dx0 = d.p.x
  d.run(2, () => SW.surgePush(d.eng, d.eng.swim, DT, 1, 1, 0))
  ok((d.p.x - dx0) < xPush * 0.2, `水下 8m 涌浪推力弱很多（${f2(d.p.x - dx0)}m）`)
  const s = SW.newSwimState(); SW.wallPull(s, 1, 1, 0, 2)
  ok(Math.abs(s.cx + 2.4) < 1e-6, '水墙：朝墙体中面的水流加速度')
  const ev = readFileSync('src/game/engine/l7Events.ts', 'utf8'), mv = readFileSync('src/game/engine/movement.ts', 'utf8')
  ok(/surgePush\(eng, eng\.swim/.test(ev) && !/push = Math\.max\(0, fx\.surgeH\) \* 1\.5/.test(ev) && /wallPull\(sw/.test(mv), '涌浪/水墙改成水流加速度（不再直接挪位置）')
}
// ===== 阶段 3：水压提示 + 减压病 =====
{
  const w = world(7); w.eng.dev.god = false; w.p.z = -10
  const msgs: string[] = []; const om = w.eng.msg.bind(w.eng); w.eng.msg = (t: string, k?: any) => { msgs.push(t); return om(t, k) }
  const at = (z: number) => { w.p.z = z; w.eng.swim.lz = z; w.clear(); w.step() }
  at(-31); at(-32); at(-61)
  ok(msgs.filter((t) => t.includes('30 米')).length === 1 && msgs.some((t) => t.includes('60')), '下潜越过 30m、60m 各提示一次')
  at(-15); at(-31)
  ok(msgs.filter((t) => t.includes('30 米')).length === 2, '回浅 10m 以上再下去会再次提示')
}
{
  // 从 60m 用上浮键直冲上来：约 2.45m/s，累计远超 25m → 发作
  const w = world(7); w.eng.dev.god = false; w.eng.swimMode = 'flat'
  w.p.z = -60; w.eng.swim.lz = -60; w.clear(); w.step()
  const msgs: string[] = []; const om = w.eng.msg.bind(w.eng); w.eng.msg = (t: string, k?: any) => { msgs.push(t); return om(t, k) }
  w.keys({ jump: true })
  for (let t = 0; t < 40 && w.p.z < -7.5; t += DT) { w.eng.breathT = 0; w.step()}
  w.clear(); w.step()
  ok(msgs.some((t) => t.includes('上浮得太快')), '快速上浮途中提醒一次')
  ok(w.eng.swim.bendsT > 30 && w.eng.swim.bendsSev > 0.3, `60m 直冲上来：减压病 ${f2(w.eng.swim.bendsT)}s，严重度 ${f2(w.eng.swim.bendsSev)}`)
  const hp0 = w.p.hp; w.p.stamina = 50
  w.run(10, () => { w.eng.breathT = 0 })
  const lost = hp0 - w.p.hp
  ok(lost > 2 && lost < 6, `发作中关节痛轻微扣血（10s 扣 ${f2(lost)}）`)
  ok(w.p.stamina < 50 + 12 * 10 * 0.6, `发作中体力恢复减半（10s 回到 ${f2(w.p.stamina)}）`)
  // 再加压：潜回 15m 以下消退快 3 倍
  const t0 = w.eng.swim.bendsT
  w.p.z = -20; w.eng.swim.lz = -20; w.clear()
  w.run(3, () => { w.eng.breathT = 0 })
  ok(Math.abs((t0 - w.eng.swim.bendsT) - 9) < 0.5, `潜回 20m：3s 消退 ${f2(t0 - w.eng.swim.bendsT)}s（×3）`)
  const worst = (SWIM.BENDS_DMG0 + SWIM.BENDS_DMG1) * (SWIM.BENDS_BASE_T + SWIM.BENDS_EXTRA_T)
  ok(worst <= 25, `最重一次总共最多扣 ${f2(worst)} 血（轻度）`)
}
{
  // 斜着慢慢游上来（沿视线、仰角 33°，垂直约 1.3m/s）：不发作
  const w = world(7); w.eng.dev.god = false
  w.p.z = -60; w.eng.swim.lz = -60; w.clear(); w.step()
  look.pitch = 0.58
  for (let t = 0; t < 80 && w.p.z < -7.5; t += DT) { look.yaw += 0.03; w.keys({ w: 1 }); w.eng.breathT = 0; w.step() } // 绕圈游，免得撞墙
  w.clear(); w.step(); look.pitch = 0; look.yaw = 0
  ok(w.eng.swim.bendsT === 0 && w.p.z > -8, `仰角 33° 慢慢游上来不发作（快速上浮累计 ${f2(w.eng.swim.fastUp)}m）`)
  // 只潜到 30m 就直冲上来：不发作
  const s = world(7); s.eng.dev.god = false; s.eng.swimMode = 'flat'
  s.p.z = -30; s.eng.swim.lz = -30; s.clear(); s.step()
  s.keys({ jump: true })
  for (let t = 0; t < 30 && s.p.z < -7.5; t += DT) s.step()
  s.clear(); s.step()
  ok(s.eng.swim.bendsT === 0, '只潜到 30m 再快速上浮：不发作')
  // 水池没有减压病
  const pl = world(0); pl.eng.dev.god = false; pl.eng.swim.fastUp = 99; pl.eng.swim.deepMax = 99; pl.run(1)
  ok(pl.eng.swim.bendsT === 0, '水池 / 运河没有水压和减压病')
  const hud = readFileSync('src/components/HUD.tsx', 'utf8'), rs = readFileSync('src/game/renderer/renderer.ts', 'utf8')
  ok(/减压病 \{/.test(hud) && /swim\.bendsT > 0/.test(rs), 'HUD 显示减压病剩余时间；镜头随关节痛轻晃')
}

// ===== 12. 设置 =====
{
  const src = readFileSync('src/components/SettingsModal.tsx', 'utf8')
  ok(/swimMode: 'view'/.test(src) && /沿视线游/.test(src) && /水平游 \+ 按键升降/.test(src), '设置 → 操作：游泳方向（沿视线游 / 水平游 + 按键升降），默认沿视线')
  const app = readFileSync('src/App.tsx', 'utf8')
  ok(/engine\.swimMode = settings\.swimMode/.test(app), 'App 把设置同步到引擎')
  const mv = readFileSync('src/game/engine/movement.ts', 'utf8')
  ok(!/fastSwim/.test(mv) && !/upMax|sinkMax|waterG/.test(mv), '旧的「冲刺锁准星 / 松键即停」游泳代码已移除')
}

console.log(`\n${n - fails}/${n} 通过`)
if (fails) process.exit(1)
