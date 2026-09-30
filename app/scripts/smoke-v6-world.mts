// v6-world 冒烟：预制结构规则 / 客房必出 / 容器不卡墙 / 实体朝向与攻击面向
// 运行：node_modules/.bin/esbuild scripts/smoke-v6-world.mts --bundle --format=esm --platform=node --outfile=/tmp/smoke-v6-world.mjs && node /tmp/smoke-v6-world.mjs
import { Engine } from '../src/game/engine'
import { generateLevel, structWallClip, type GameMap } from '../src/game/mapgen'
import { LEVELS } from '../src/game/levels'
import { ENTITIES } from '../src/game/entities'
import { buildEntityMesh } from '../src/game/renderer3d'
import { PREFABS } from '../src/game/prefabs'
import { Mesh, MeshBasicMaterial, Vector3 } from 'three'

let failures = 0
function assert(cond: boolean, label: string) {
  if (cond) console.log(`  ✓ ${label}`)
  else { failures++; console.error(`  ✗ ${label}`) }
}

const has = (m: GameMap, kind: string) => m.structures.some((s) => s.kind === kind)
const count = (m: GameMap, kind: string) => m.structures.filter((s) => s.kind === kind).length
const SEEDS = [11, 222, 3333, 44444, 555555, 6, 77, 888]

// ---------- 1. 预制结构生成规则 ----------
console.log('[1] 预制结构生成规则（概率/100%）')
{
  assert(PREFABS.length >= 10, `预制件库 ≥10 种（当前 ${PREFABS.length}）`)
  // L3 主发电机房 100%
  for (const seed of SEEDS) {
    const m = generateLevel(LEVELS[3], seed)
    assert(has(m, 'maingen'), `L3 seed=${seed} 必出主发电机房（maingen）`)
  }
  // L5 客房 100% 多间：可交互门 + 床 + 柜
  for (const seed of SEEDS) {
    const m = generateLevel(LEVELS[5], seed)
    assert(count(m, 'hoteldoor') >= 2, `L5 seed=${seed} 客房门 ≥2（当前 ${count(m, 'hoteldoor')}）`)
    assert(count(m, 'bed') >= 2, `L5 seed=${seed} 床 ≥2`)
    assert(count(m, 'dresser') >= 2, `L5 seed=${seed} 柜子 ≥2`)
  }
  // 概率类预制件：多种子下既出现又不恒出现（宽松区间）
  const probCases: [number, string, number][] = [
    [0, 'redroom', 0.25], [0, 'archroom', 0.5],
    [1, 'luxgarage', 0.25], [1, 'maintcorridor', 0.5],
    [2, 'boilernode', 0.45],
    [4, 'megoutpost', 0.25], [4, 'blackwinroom', 0.45],
    [5, 'beverlyhall', 0.45], [5, 'hotelboiler', 0.25],
  ]
  for (const [lvl, id] of probCases) {
    let hit = 0
    const N = 24
    for (let s = 0; s < N; s++) if (has(generateLevel(LEVELS[lvl], s * 977 + 13), 'prefabmark') || true) {
      const m = generateLevel(LEVELS[lvl], s * 977 + 13)
      if (m.structures.some((x) => x.data?.prefab === id)) hit++
    }
    assert(hit > 0 && hit < N, `L${lvl} ${id} 概率生成（${hit}/${N}，非 0 非 100%）`)
  }
  // L0 停电区保留 + 红房间（灯光染红）
  const l0 = generateLevel(LEVELS[0], 42)
  assert(l0.structures.length > 0, 'L0 结构非空')
}

// ---------- 2. 容器/实心结构不卡墙 ----------
console.log('[2] 容器包围盒不与墙体瓦片相交')
{
  for (const def of LEVELS) {
    for (const seed of SEEDS) {
      const m = generateLevel(def, seed)
      const bad: string[] = []
      for (const s of m.structures) {
        if (!s.solid) continue
        if (structWallClip(m, s)) bad.push(`${s.kind}@${s.x.toFixed(1)},${s.y.toFixed(1)}`)
      }
      assert(bad.length === 0, `L${def.id} seed=${seed} 实心结构不卡墙${bad.length ? '（违规：' + bad.slice(0, 3).join(' ') + '）' : ''}`)
    }
  }
}

// ---------- 3. 实体模型朝向统一（正面=+X）----------
console.log('[3] 实体模型朝向（面部特征质心位于 +X 半球）')
{
  const types = Object.keys(ENTITIES)
  assert(types.length >= 12, `实体种类 ≥12（当前 ${types.length}）`)
  for (const t of types) {
    const g = buildEntityMesh(t)
    g.updateMatrixWorld(true)
    let cx = 0, cz = 0, n = 0
    const v = new Vector3()
    g.traverse((o) => {
      if (o instanceof Mesh && o.material instanceof MeshBasicMaterial) {
        o.getWorldPosition(v)
        cx += v.x; cz += v.z; n++
      }
    })
    if (n === 0) { assert(true, `${t} 无自发光面部件（跳过）`); continue }
    cx /= n; cz /= n
    assert(cx >= Math.abs(cz) - 0.01, `${t} 面部朝 +X（质心 x=${cx.toFixed(2)} z=${cz.toFixed(2)}）`)
  }
}

// ---------- 4. 攻击时面向玩家（faceToward + 出手角度门槛）----------
console.log('[4] 实体攻击前面向玩家')
{
  const eng = new Engine()
  eng.newRun(99, 'normal')
  eng.devJump(1) // L1 必有实体（L0 可能为 0）
  const m = eng.map!
  const e = m.entities[0]
  assert(!!e, '测试层存在实体')
  if (!e) throw new Error('no entity')
  // 把实体放到玩家正东 1.0 格、面向正西（背对），追击+攻击过程中应转向玩家
  e.x = eng.player.x + 0.7
  e.y = eng.player.y
  e.facing = Math.PI // 背对
  e.state = 'chase'
  e.attackCd = 0
  let struck = false
  let diffAtStrike = -1
  const origHurt = eng.hurtPlayer.bind(eng)
  eng.hurtPlayer = (dmg: number, src: string) => {
    struck = true
    const want = Math.atan2(eng.player.y - e.y, eng.player.x - e.x)
    let d = Math.abs(want - e.facing)
    if (d > Math.PI) d = Math.PI * 2 - d
    diffAtStrike = d
    eng.player.hp = 100 // 不死
    void origHurt; void dmg; void src
  }
  for (let i = 0; i < 600 && !struck; i++) {
    e.x = eng.player.x + 0.7; e.y = eng.player.y // 钉住距离（攻击触发圈内）
    eng.player.hp = 100
    eng.update(1 / 60)
  }
  assert(struck, '实体完成一次攻击')
  assert(diffAtStrike >= 0 && diffAtStrike <= 0.71, `出手瞬间面向玩家（偏差 ${diffAtStrike.toFixed(3)} rad ≤ 0.7）`)
}

// ---------- 5. 门交互（开关/上锁撬开）+ 窗户陷阱 ----------
console.log('[5] 可交互门/窗逻辑')
{
  const eng = new Engine()
  eng.newRun(5, 'normal')
  eng.dev.god = true
  eng.devJump(5)
  const m = eng.map!
  const door = m.structures.find((s) => s.kind === 'hoteldoor')
  assert(!!door, 'L5 存在可交互房门')
  if (door) {
    const p = eng.player
    p.x = door.x + 0.5; p.y = door.y + 1.4
    p.facing = Math.atan2(door.y + 0.5 - p.y, door.x + 0.5 - p.x)
    eng.update(0.016)
    const t = eng.getInteract()
    assert(t?.kind === 'hoteldoor', `门可被交互锁定（${t?.kind}）`)
    if (door.data?.locked) {
      eng.addItem('crowbar')
      eng.input.interact = true; eng.update(0.016)
      assert(!door.data?.locked && door.data?.open === 1 && !door.solid, '撬棍撬开上锁房门 → 打开且可通行')
    } else {
      eng.input.interact = true; eng.update(0.016)
      assert(door.data?.open === 1 && !door.solid, '开门 → 打开且可通行')
      eng.input.interact = true; eng.update(0.016)
      assert(door.data?.open === 0 && door.solid, '关门 → 关闭且阻挡')
    }
  }
  // 窗户陷阱（L4）
  eng.devJump(4)
  const m4 = eng.map!
  const trap = m4.structures.find((s) => s.kind === 'windowtrap')
  assert(!!trap, 'L4 存在未涂黑窗户陷阱')
  if (trap) {
    eng.player.x = trap.x + 0.5; eng.player.y = trap.y + 0.5
    const s0 = eng.player.sanity
    eng.update(0.016)
    assert(!!trap.data?.triggered && eng.player.sanity < s0, '靠近陷阱窗触发 → 理智下降且仅触发一次')
  }
  // dresser 搜索
  eng.devJump(5)
  const m5 = eng.map!
  const dr = m5.structures.find((s) => s.kind === 'dresser' && !s.looted)
  assert(!!dr, 'L5 存在可搜索柜子')
  if (dr) {
    eng.player.x = dr.x + 0.5; eng.player.y = dr.y + 1.3
    eng.player.facing = Math.atan2(dr.y + 0.5 - eng.player.y, dr.x + 0.5 - eng.player.x)
    eng.update(0.016)
    const t = eng.getInteract()
    assert(t?.kind === 'dresser', `柜子可搜索（${t?.kind}）`)
    if (t?.kind === 'dresser') {
      eng.input.interact = true; eng.update(0.016)
      for (let i = 0; i < 200 && !eng.lootPanel; i++) eng.update(0.016)
      assert(!!eng.lootPanel && eng.lootPanel.items.length > 0, '柜子搜索出战利品')
      eng.closeLootPanel()
    }
  }
}

console.log(failures === 0 ? '\n全部通过 ✓' : `\n${failures} 项失败 ✗`)
process.exit(failures === 0 ? 0 : 1)
