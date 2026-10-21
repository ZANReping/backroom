/* eslint-disable @typescript-eslint/no-explicit-any -- 验收脚本直接读写引擎内部状态 */
// 死亡飞蛾（Entity 4）重制第 3 阶段——无头机制验收（真实 Engine + 真实关卡生成 + 真实 step 循环）
// 运行：npm run check:deathmoth     结果同时写入 reports/deathmoth/mechanics-check.txt
import { mkdirSync, writeFileSync } from 'node:fs'
import { createCanvas } from '@napi-rs/canvas'

const memory = new Map<string, string>()
Object.assign(globalThis, { window: { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { createElement: (tag: string) => tag === 'canvas' ? createCanvas(256, 256) : ({ getContext: () => null, style: {} }), getElementById: () => null, addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } }, localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) } })
const { Engine } = await import('../src/game/engine')
const A = await import('../src/game/engine/mothAI')
const { audio } = await import('../src/game/core/audio')
const { makeEntity } = await import('../src/game/entities')
const { buildEntityMesh } = await import('../src/game/renderer/entitiesMesh')
const { animateMoth } = await import('../src/game/renderer/mothMeshes')
const Nests = await import('../src/game/world/mothNests')
const { l5NestLayout } = await import('../src/game/world/infiniteL5')
const { genL3ChunkRaw } = await import('../src/game/world/infiniteL3')
const { L3 } = await import('../src/game/levels/l3')
const { ceilingHeightAt, floorHeight, walkableAt } = await import('../src/game/world/mapgen')
const { WALL_H } = await import('../src/game/renderer/shared')
const { look } = await import('../src/game/core/renderer3d')
const { seatedEyeHeight } = await import('../src/game/engine/seating')
const Inventory = await import('../src/game/engine/inventory')

for (const k of ['aggro', 'hit', 'swing', 'hurt', 'pickup', 'uiTick', 'spark', 'searchTick', 'splash', 'scrape', 'setUnderwater', 'footstep', 'whisper'] as const) (audio as any)[k] = () => {}
const lines: string[] = []
let fails = 0, n = 0
const ok = (c: unknown, m: string) => { n++; const l = `${c ? '✔' : '✘'} ${m}`; console.log(l); lines.push(l); if (!c) fails++ }
const M = A.MOTH

function fresh(seed = 404, level = 1) {
  const e: any = new Engine(); e.seed = seed
  e.loadLevel(level, { mapSeed: seed, firstVisit: true }); e.introT = 0
  e.player.hp = 100; e.player.sanity = 100; e.player.thirst = 100; e.player.flashlight = false
  const msgs: string[] = []; const om = e.msg.bind(e); e.msg = (t: string, k: any) => { msgs.push(t); om(t, k) }
  e.dev.statLock = false
  return { e, msgs }
}
function openSpot(e: any, R = 4) {
  const m = e.map, p = e.player, wh = WALL_H[e.levelDef.gen] ?? 3
  for (let rad = 0; rad < 40; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue
    const cx = Math.floor(p.x) + dx + 0.5, cy = Math.floor(p.y) + dy + 0.5
    let good = true
    for (let yy = -R; yy <= R && good; yy += 0.5) for (let xx = -R; xx <= R && good; xx += 0.5) {
      if (xx * xx + yy * yy > R * R) continue
      const x = cx + xx, y = cy + yy
      if (x < 1 || y < 1 || x > m.w - 2 || y > m.h - 2 || !walkableAt(m, Math.floor(x), Math.floor(y), 0) || Math.abs(floorHeight(m, x, y, 0)) > 0.02) good = false
      else if (m.structures.some((s: any) => s.solid && x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h)) good = false
    }
    if (good && Number.isFinite(ceilingHeightAt(m, cx, cy, wh, 0))) return { x: cx, y: cy }
  }
  throw Error('找不到开阔地')
}
let nid = 90000
function moth(e: any, form: string, x: number, y: number, nest?: string) {
  const q: any = makeEntity('deathmoth', x, y, 0, form as any); q.id = nid++; q.testKeep = true; if (nest) q.mothNest = nest
  e.map.entities.push(q); return q
}
function place(e: any, x: number, y: number) { const p = e.player; p.x = x; p.y = y; p.z = 0; p.vz = 0 }
function run(e: any, secs: number, each?: (t: number) => void) {
  const dt = 1 / 30
  for (let t = 0; t < secs; t += dt) {
    each?.(t)
    e.map.entities = e.map.entities.filter((q: any) => q.testKeep)
    e.blackoutT = 0
    e.step(dt)
    if (e.over) return
  }
}
function setup(seed = 404) { const { e, msgs } = fresh(seed); const spot = openSpot(e); e.map.entities = []; place(e, spot.x + 3, spot.y); return { e, msgs, spot } }

// 1. 模型/动画接入
{
  for (const f of ['male', 'female', 'guard', 'larva']) {
    const g = buildEntityMesh('deathmoth', { mothForm: f as any })
    let sk = 0; g.traverse((o: any) => { if (o.isSkinnedMesh) sk++ })
    const q: any = makeEntity('deathmoth', 0, 0, 0, f as any)
    animateMoth(g, 1.2, 1 / 30, 1, 0, 0, q)
    ok(sk === 1 && !!g.userData.mothRig && g.userData.mothForm === f && typeof g.userData.mclip === 'string', `渲染：${f} 用重制蒙皮模型 + 片段动画（当前片段 ${g.userData.mclip}）`)
  }
}
// 2. 巢登记
{
  let L: any = null, hk = 0, hr = 0
  for (hk = -40; hk < 40 && !L; hk++) for (hr = -40; hr < 40 && !L; hr++) L = l5NestLayout(777, hk, hr)
  const d = L && Nests.mainNestDesc(777, L.id)
  const props = d ? Nests.nestProps(d) : []
  ok(!!d && d.kind === 'main' && props.some((p) => p.kind === 'pillar') && props.filter((p) => p.kind === 'coat').length === 3 && props.some((p) => p.kind === 'door') && props.filter((p) => p.kind === 'sac').length >= 3, `L5 主巢：三面覆层 + 门框增生 + 卵柱 + ${props.filter((p) => p.kind === 'sac').length} 个孵化囊`)
  let found = 0, tried = 0, valid = 0
  for (let cy = 0; cy < 30; cy++) for (let cx = 0; cx < 30; cx++) {
    tried++
    const raw: any = genL3ChunkRaw(L3 as any, 9, cx, cy)
    const s = Nests.findSatelliteNest(3, 9, cx, cy, raw.tiles, 32)
    if (!s) continue
    found++
    const lx = s.x0 - cx * 32, ly = s.y0 - cy * 32
    if (raw.tiles[ly * 32 + lx] === 1 && s.walls!.length === 2) valid++
  }
  ok(found > 0 && found / tried < 0.09 && valid === found, `L3 卫星巢稀有（${found}/${tried} 个 chunk），都落在两面墙夹出的墙角地板上`)
  const colony = Nests.satelliteColony({ id: 'sat:0,0', kind: 'sat', cx: 10.5, cy: 10.5, x0: 10, y0: 10, x1: 10, y1: 10, walls: ['w', 'n'], seed: 5 })
  ok(colony.some((c) => c.mothForm === 'female') && colony.some((c) => c.mothForm === 'larva') && colony.every((c) => c.mothNest === 'sat:0,0'), '卫星巢种群：雌性 + 幼虫 + 雄性，全部挂在巢 id 上')
}
// 2b. 巢外普通生成：一般大部分雄蛾，L3 大部分雌蛾
{
  const share = (lv: number) => { let f = 0; for (let i = 0; i < 2000; i++) if (Nests.wildMothForm(lv, 11, (i * 7.31) % 400, (i * 3.17) % 400) === 'female') f++; return f / 2000 }
  const s3 = share(3), s8 = share(8), s11 = share(11)
  ok(s3 > 0.6 && s3 < 0.8 && s8 > 0.12 && s8 < 0.28 && s11 === 0, `巢外雌蛾比例：L3 ${(s3 * 100).toFixed(0)}%、L8 ${(s8 * 100).toFixed(0)}%、L11 0%`)
}
// 3. 雄性：中立、扑灯耗电、吸食倒地者、驯化带路
{
  const { e, spot } = setup()
  const m = moth(e, 'male', spot.x, spot.y)
  const hp0 = e.player.hp
  run(e, 4)
  ok(e.player.hp === hp0, '雄性：不主动伤人（4 秒内未受伤）')
  e.player.flashlight = true; e.player.battery = 100
  run(e, 4)
  ok(e.player.battery < 100 - M.lampDrain * 1.5 && m.mt.clip === 'hover', `雄性：被手电吸引扑灯、耗电（电量 ${e.player.battery.toFixed(1)}）`)
  e.player.flashlight = false
  e.player.hp = 20; const th0 = e.player.thirst
  run(e, 5)
  ok(e.player.thirst < th0 - 1, `雄性：吸食倒地者（口渴 ${th0} → ${e.player.thirst.toFixed(1)}）`)
  e.player.hp = 100
  e.addItem('almond')
  const tamed = A.tameMoth(e, m)
  ok(tamed && m.mt.tamed && !e.hasItem('almond'), '杏仁水驯化雄性（消耗一瓶）')
  const ex = e.nearestExit()
  if (ex) { const d0 = Math.hypot(ex.x + 0.5 - m.x, ex.y + 0.5 - m.y); run(e, 6); const dm = Math.hypot(ex.x + 0.5 - m.x, ex.y + 0.5 - m.y); ok(dm < d0 - 0.5 && Math.hypot(m.x - e.player.x, m.y - e.player.y) < M.leadWait, `驯化雄性朝最近出口飞、不离开玩家（离出口 ${d0.toFixed(1)} → ${dm.toFixed(1)}m）`) }
  else ok(true, '驯化：本图无出口可指（跳过带路断言）')
}
// 4. 雌性：近身狩猎、轮流扑咬、失血、腐蚀液
{
  const { e, msgs, spot } = setup(405)
  const f1 = moth(e, 'female', spot.x, spot.y), f2 = moth(e, 'female', spot.x - 0.6, spot.y + 0.4), f3 = moth(e, 'female', spot.x - 0.6, spot.y - 0.4)
  place(e, spot.x + 1.8, spot.y)
  let maxLungers = 0
  run(e, 8, () => { maxLungers = Math.max(maxLungers, [f1, f2, f3].filter((q) => q.mt?.lunging).length); place(e, spot.x + 1.8, spot.y) })
  const fx = A.mothFx(e)
  ok(f1.mt.mode !== 'idle' && f1.provoked, '雌性：2.5m 内发现玩家 → 狩猎并释放信息素')
  ok(e.player.hp < 100 && maxLungers <= M.maxLungers, `雌性：集群轮流扑咬（同时扑咬最多 ${maxLungers} 只，生命 ${e.player.hp.toFixed(0)}）`)
  ok(fx.bleed > 0 || msgs.some((t) => /流血/.test(t)), `扑咬造成失血（层数 ${fx.bleed}）`)
  // 腐蚀液：拉到 4m
  const { e: e2, spot: s2 } = setup(406)
  const f = moth(e2, 'female', s2.x, s2.y); f.provoked = true; f.mt = undefined
  place(e2, s2.x + 4, s2.y)
  let pools = 0
  run(e2, 6, () => { place(e2, s2.x + 4, s2.y); pools = Math.max(pools, A.mothFx(e2).acid.length) })
  ok(pools > 0, '雌性：中距离喷腐蚀液，地上留下酸池')
}
// 5. 禁卫级：立起威吓 → 附肢穿刺麻痹；半血狂暴
{
  const { e, msgs, spot } = setup(407)
  const g = moth(e, 'guard', spot.x, spot.y); const fem = moth(e, 'female', spot.x - 3, spot.y)
  place(e, spot.x + 1.1, spot.y)
  let reared = false, para = 0
  run(e, 5, () => { if (g.mt?.mode === 'rear') reared = true; para = Math.max(para, e.webbedT); place(e, spot.x + 1.1, spot.y) })
  ok(reared && msgs.some((t) => /立了起来/.test(t)), '禁卫级：首次交战先立起威吓')
  ok(para >= M.stabPara - 0.1 && e.player.hp < 100, `禁卫级：附肢穿刺造成伤害 + 麻痹（${para.toFixed(1)}s）`)
  g.hp = g.def.hp * 0.4; e.killCheck(g)
  ok(g.mt.frenzyFired && (fem.mt?.frenzyT ?? 0) > 0 && fem.provoked, '禁卫级：半血释放狂暴信息素，附近雌性狂暴')
}
// 6. 幼虫：靠近蜷球；被打 → 刺毛反伤麻痹
{
  const { e, msgs, spot } = setup(408)
  const l = moth(e, 'larva', spot.x, spot.y)
  place(e, spot.x + 1, spot.y)
  run(e, 0.5)
  ok(l.mt.curlT > 0 && l.mt.clip === 'curl', '幼虫：玩家靠近 → 蜷成刺球')
  const hp0 = e.player.hp
  l.hp -= 1; e.killCheck(l)
  ok(e.player.hp < hp0 && e.webbedT >= M.spineCurled.para - 0.01 && msgs.some((t) => /刺/.test(t)), `幼虫：近战打刺球 → 刺毛反伤 + 麻痹 ${e.webbedT.toFixed(1)}s`)
}
// 7. 卵：挥击打破 → 惊巢；踩踏地面卵堆
{
  const { e, msgs, spot } = setup(409)
  const inf = e.map.inf, ox = inf?.ox ?? 0, oy = inf?.oy ?? 0
  const d = { id: 'sat:test', kind: 'sat' as const, cx: spot.x + ox, cy: spot.y + oy, x0: Math.floor(spot.x + ox), y0: Math.floor(spot.y + oy), x1: Math.floor(spot.x + ox), y1: Math.floor(spot.y + oy), walls: ['w', 'n'] as any, seed: 3 }
  if (inf) Nests.registerNest(inf, d)
  const f = moth(e, 'female', spot.x + 2, spot.y + 2, 'sat:test')
  const pr = Nests.nestProps(d).find((p) => p.kind === 'floor')!
  place(e, pr.x - ox - 1.2, pr.y - oy); e.player.facing = 0
  const broke = A.mothEggSwing(e)
  const total = Object.values(inf?.mothEggs ?? {}).reduce((a: number, b: any) => a + b, 0)
  ok(!!inf && broke && total >= M.eggSwing[0] && f.provoked && msgs.some((t) => /卵/.test(t)), `卵：挥击打破 ${total} 颗，同巢雌性被激怒`)
  const before = inf?.mothEggs?.['sat:test:floor'] ?? 0
  place(e, pr.x - ox, pr.y - oy); run(e, 1.2)
  ok((inf?.mothEggs?.['sat:test:floor'] ?? 0) > before, '卵：踩进地面卵堆也会踩碎卵')
}
// 8. 被蛾群杀死 → 胶状球
{
  const { e, spot } = setup(410)
  const f = moth(e, 'female', spot.x, spot.y); f.provoked = true
  place(e, spot.x + 0.6, spot.y); e.player.hp = 3
  run(e, 6, () => place(e, spot.x + 0.6, spot.y))
  run(e, 0.2)
  ok(e.over && A.mothFx(e).gels.length > 0, '被死亡飞蛾杀死：直接死亡，原地留下胶状球')
}

// Integration regressions discovered while exercising the actual running game.
{
  const {e,spot}=setup();place(e,spot.x,spot.y);e.handsStowed=false
  const m=moth(e,'male',spot.x+2.3,spot.y);m.z=1.1
  const dz=m.z-e.player.z-seatedEyeHeight(e),len=Math.hypot(2.3,dz)
  look.rayX=2.3/len;look.rayY=0;look.rayZ=dz/len
  ok(A.aimMothToTame(e)===m&&!e.canHit(m),'驯化准星：2.3m 外且超过近战高度的雄蛾仍可被对准喂食')
  e.player.hotbar[0]={type:'almond',count:2};const before=e.countItem('almond');m.x+=4
  ok(!A.tameMoth(e,m)&&e.countItem('almond')===before,'喂食完成前目标离开范围：不远程驯化、不额外消耗')
}
{
  const {e}=setup(),fx=A.mothFx(e);fx.bleed=2;fx.bleedT=6;e.player.hotbar[0]={type:'bandage',count:1};e.player.hp=60;e.dev.god=false
  e.useSlot('hotbar',0);A.updateMothWorld(e,.05)
  ok(fx.bleed===2,'刚开始包扎不会立刻止血')
  e.usingItem=null;A.updateMothWorld(e,.05);ok(fx.bleed===2&&e.countItem('bandage')===1,'中断包扎不会免费止血或消耗绷带')
  e.useSlot('hotbar',0);Inventory.updateItemUse(e,e.usingItem!.dur+.01)
  ok(fx.bleed===0&&e.countItem('bandage')===0,'真正完成包扎后止血，且只消耗一条绷带')
}
{
  const {e,spot}=setup();place(e,spot.x,spot.y);e.dev.god=false;const fx=A.mothFx(e),inf=e.map!.inf!
  fx.acid.push({x:e.player.x+inf.ox,y:e.player.y+inf.oy,z:e.player.z,r:.8,t:0,T:10});A.updateMothWorld(e,.1)
  const hp=e.player.hp;inf.ox+=32;e.player.x-=32;A.updateMothWorld(e,.1)
  ok(e.player.hp<hp,'酸池使用世界坐标：窗口平移后仍在原地点生效')
  e.map={...e.map!};ok(A.mothFx(e).acid.length===0&&A.mothFx(e)!==fx,'切换地图会清理旧酸池和胶状球状态')
}
{
  const {e,spot}=setup();place(e,spot.x+8,spot.y);const m=moth(e,'male',spot.x,spot.y)
  A.updateMoth(e,m,0,8,1);const it={id:.234567,type:'almond',x:m.x,y:m.y};e.map!.items.push(it)
  const c=[...e.map!.inf!.chunks.values()][0];c.items.push(it);m.mt!.mode='feed';m.mt!.modeT=9;m.mt!.clip='feed';m.mt!.feedItem=it.id
  A.updateMoth(e,m,0,8,1)
  ok(!e.map!.items.includes(it)&&!c.items.includes(it),'被雄蛾喝掉的地面杏仁水同时移出区块记录，不因窗口重缝合复活')
}

const report = process.env.ENTITY_IMPORT_REPORT ?? 'reports/moth-watch-import-20261021'
mkdirSync(report, { recursive: true })
writeFileSync(report + '/deathmoth-mechanics.txt', lines.join('\n') + `\n\ncheck:deathmoth ${n - fails}/${n}\n`)
console.log(`check:deathmoth ${n - fails}/${n}`)
if (fails) process.exit(1)
