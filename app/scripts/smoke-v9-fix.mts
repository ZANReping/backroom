/**
 * v9-fix 冒烟断言
 * 任务1：出口指引箭头角度——构造玩家位置/yaw/出口位置多组用例，
 *        箭头指示角（CSS rotate 应用于默认朝右的 ➤ 字形）与出口相对视线实际方位误差 <5°
 * 任务4：门朝向——所有可交互门（hoteldoor/rollerdoor/glassdoor）门板平面与所在墙线平行
 *        （水平墙线→面朝南北不旋转；垂直墙线→旋转 90°；含双开门）
 */
import { readFileSync } from 'node:fs'
import { exitArrowRotation } from '../src/game/guide'
import { doorNeedsRotate, generateLevel, type GameMap } from '../src/game/mapgen'
import { LEVELS } from '../src/game/levels'

let fail = 0
const assert = (c: boolean, s: string) => { if (!c) { fail++; console.error('✗', s) } else console.log('✓', s) }
const wrap = (a: number) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }
const DEG = 180 / Math.PI

// ---------- 任务1：箭头角度 ----------
{
  // 第一人称前向（与 renderer3d 相机一致）：fwd = (-sin yaw, -cos yaw)，右向 = (cos yaw, -sin yaw)
  const check = (px: number, py: number, yaw: number, ex: number, ey: number, tag: string) => {
    const rot = exitArrowRotation(px, py, yaw, ex, ey)
    // 箭头（默认朝右 (1,0)，CSS rotate 顺时针）在屏幕系指向：
    const ax = Math.cos(rot), ay = Math.sin(rot)
    // 期望屏幕方向：出口在视线右方→+x，前方→-y（屏幕上方）
    const fx = -Math.sin(yaw), fy = -Math.cos(yaw)
    const rx = Math.cos(yaw), ry = -Math.sin(yaw)
    const dx = ex - px, dy = ey - py
    const len = Math.hypot(dx, dy)
    const wantX = (dx * rx + dy * ry) / len   // 右向分量
    const wantY = -(dx * fx + dy * fy) / len  // 前向分量 → 屏幕上
    const err = Math.abs(wrap(Math.atan2(ay, ax) - Math.atan2(wantY, wantX))) * DEG
    assert(err < 5, `箭头角度 ${tag}: 误差 ${err.toFixed(2)}° < 5°`)
    return rot
  }
  // 固定用例：正前/正右/正后/正左（yaw=0 面向北）
  const r0 = check(10, 10, 0, 10, 4, '出口正前方')      // → 箭头应朝上
  assert(Math.abs(wrap(r0 + Math.PI / 2)) < 0.01, '正前方出口 → 箭头朝上(-π/2)')
  const r1 = check(10, 10, 0, 16, 10, '出口正右方')      // → 箭头应朝右
  assert(Math.abs(wrap(r1)) < 0.01, '正右方出口 → 箭头朝右(0)')
  const r2 = check(10, 10, 0, 10, 16, '出口正后方')      // → 箭头应朝下
  assert(Math.abs(wrap(r2 - Math.PI / 2)) < 0.01, '正后方出口 → 箭头朝下(+π/2)')
  const r3 = check(10, 10, 0, 4, 10, '出口正左方')       // → 箭头应朝左
  assert(Math.abs(Math.abs(wrap(r3)) - Math.PI) < 0.01, '正左方出口 → 箭头朝左(±π)')
  // 多 yaw × 多方位模糊测试
  let sd = 12345
  const rnd = () => ((sd = (sd * 1664525 + 1013904223) >>> 0) / 4294967296)
  let ok = true
  for (let i = 0; i < 400; i++) {
    const px = rnd() * 60, py = rnd() * 60, yaw = (rnd() * 2 - 1) * Math.PI
    const ang = rnd() * Math.PI * 2, dist = 1 + rnd() * 19
    const ex = px + Math.cos(ang) * dist, ey = py + Math.sin(ang) * dist
    const rot = exitArrowRotation(px, py, yaw, ex, ey)
    const fx = -Math.sin(yaw), fy = -Math.cos(yaw)
    const rx = Math.cos(yaw), ry = -Math.sin(yaw)
    const dx = ex - px, dy = ey - py, len = Math.hypot(dx, dy)
    const wantX = (dx * rx + dy * ry) / len, wantY = -(dx * fx + dy * fy) / len
    const err = Math.abs(wrap(Math.atan2(Math.sin(rot), Math.cos(rot)) - Math.atan2(wantY, wantX))) * DEG
    if (err >= 5) { ok = false; console.error(`  fuzz#${i} 误差 ${err.toFixed(2)}° yaw=${yaw.toFixed(2)}`) }
  }
  assert(ok, '400 组随机 位置/yaw/出口 用例误差均 <5°')
}

// ---------- 任务3：3D 渲染与探索状态解耦（静态回归断言） ----------
// 结论：全部几何（墙/地/顶/室外/结构/装饰）在建层时一次性构建，战争迷雾只作用于小地图。
// 此处锁定：渲染器不得读取 engine.explored / engine.visible。
{
  // v13-refactor：renderer3d.ts 已模块化为 renderer/ 目录，断言覆盖全部渲染模块源码
  const src = [
    '../src/game/renderer/renderer.ts',
    '../src/game/renderer/geometry.ts',
    '../src/game/renderer/liquidsSky.ts',
    '../src/game/renderer/structures.ts',
    '../src/game/renderer/decorations.ts',
    '../src/game/renderer/entitiesMesh.ts',
    '../src/game/renderer/viewmodel.ts',
  ].map((p) => readFileSync(new URL(p, import.meta.url), 'utf8')).join('\n')
  const usesFogState = /engine\s*\.\s*(explored|visible)\b|\.\s*(explored|visible)\s*\[/.test(src)
  assert(!usesFogState, 'renderer3d 不读取 engine.explored/visible（3D 几何与探索状态解耦，迷雾只影响小地图）')
  // 灯光池渐隐（消除灯光进出池的硬切换 pop-in）：池容量 > 7 且存在 rankFade
  assert(/for \(let i = 0; i < 10; i\+\+\)/.test(src) && /rankFade/.test(src), '灯光池 10 盏 + 末位渐隐（灯光无开关式 pop-in）')
}

// ---------- 任务4：门朝向 ----------
// 约定：门板平面与所在墙线平行（法线与墙线垂直）。
// 水平墙线（W/E 邻为墙，东西走向）→ 不旋转（门板跨 X，法线沿 Z）；
// 垂直墙线（N/S 邻为墙，南北走向）→ 旋转 π/2（门板跨 Z，法线沿 X）。
{
  const idx = (m: GameMap, x: number, y: number) => y * m.w + x
  const isFl = (m: GameMap, x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.tiles[idx(m, x, y)] === 1
  const DOORS = ['hoteldoor', 'rollerdoor', 'glassdoor']
  let total = 0, hCount = 0, vCount = 0, dblChecked = 0, bad = 0
  for (const seed of [42, 7, 1234, 999, 555, 31337, 2024, 88]) {
    for (let lvl = 0; lvl <= 5; lvl++) {
      const m = generateLevel(LEVELS[lvl], seed)
      for (const s of m.structures) {
        if (!DOORS.includes(s.kind)) continue
        total++
        const ax = Math.floor(s.x + s.w / 2), ay = Math.floor(s.y + s.h / 2)
        const doorAt = (x: number, y: number) =>
          m.structures.some((o) => o !== s && DOORS.includes(o.kind) && Math.floor(o.x + o.w / 2) === x && Math.floor(o.y + o.h / 2) === y)
        const wallish = (x: number, y: number) => !isFl(m, x, y) || doorAt(x, y)
        const we = wallish(ax - 1, ay) && wallish(ax + 1, ay)
        const ns = wallish(ax, ay - 1) && wallish(ax, ay + 1)
        if (!we && !ns) continue // 开阔门洞（无明确墙线），跳过
        const rot = doorNeedsRotate(m, s)
        const dbl = s.data?.dbl ? '（双开门）' : ''
        if (s.data?.dbl) dblChecked++
        // 门板法线 = (sin rot, 0, cos rot)。水平墙线方向 (1,0,0)：法线须沿 Z ⇒ rot=0；
        // 垂直墙线方向 (0,0,1)：法线须沿 X ⇒ rot=π/2
        if (we && !ns) {
          hCount++
          if (rot !== 0) { bad++; console.error(`  ✗ L${lvl} seed${seed} ${s.kind}@(${ax},${ay})${dbl} 水平墙线却旋转 ${rot}`) }
        } else if (ns && !we) {
          vCount++
          if (Math.abs(rot - Math.PI / 2) > 1e-6) { bad++; console.error(`  ✗ L${lvl} seed${seed} ${s.kind}@(${ax},${ay})${dbl} 垂直墙线却未旋转 (rot=${rot})`) }
        }
      }
    }
  }
  assert(bad === 0, `门朝向全部与墙线平行（共 ${total} 扇：水平墙线 ${hCount}、垂直墙线 ${vCount}、双开门 ${dblChecked}）`)
  assert(hCount > 0 && vCount > 0 && dblChecked > 0, `水平/垂直墙线及双开门均被覆盖（h=${hCount} v=${vCount} dbl=${dblChecked}）`)
}

console.log(fail ? `\n${fail} 项失败` : '\nv9-fix 冒烟全部通过')
process.exit(fail ? 1 : 0)
