// v14 验收脚本（标准 1-5 的代码/模型静态+运行时检查；标准 6 由 shell 跑 build/tsc；标准 7 见 shots.py）
// 运行：node_modules/.bin/esbuild verifier/v1/check.mts --bundle --format=esm --outfile=verifier/v1/.check.mjs && node verifier/v1/.check.mjs
import * as THREE from 'three'
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { buildEntityMesh, buildItemMesh } from '../../src/game/renderer/entitiesMesh'
import { ENTITIES } from '../../src/game/entities'
import { ITEMS } from '../../src/game/items'
import { LEVELS } from '../../src/game/levels'
import { generateLevel } from '../../src/game/mapgen'

let pass = 0, fail = 0
const fails: string[] = []
const ok = (cond: boolean, label: string, detail = '') => {
  if (cond) { pass++; console.log(`  PASS ${label}${detail ? ' — ' + detail : ''}`) }
  else { fail++; fails.push(label); console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`) }
}

const meshSrc = readFileSync('src/game/renderer/entitiesMesh.ts', 'utf8')
const rendererSrc = readFileSync('src/game/renderer/renderer.ts', 'utf8')
const hudSrc = readFileSync('src/components/HUD.tsx', 'utf8')

// ---------- 标准 1：每种实体专属模型分支 + 复杂度 ----------
console.log('[1] 实体模型分支与复杂度')
// 各实体动画部件最低期望（无缺失部件 = 动画不动部件为零）
const PARTS_EXPECT: Record<string, string[]> = {
  duller: ['torso', 'head', 'armL', 'armR', 'legL', 'legR'],
  skinstealer: ['torso', 'head', 'armL', 'armR', 'legL', 'legR'],
  faceling: ['torso', 'head', 'armL', 'armR', 'legL', 'legR'],
  insulator: ['torso', 'head', 'armL', 'armR', 'legL', 'legR'],
  copierwraith: ['torso', 'head', 'armL', 'armR', 'legL', 'legR'],
  bellhop: ['torso', 'head', 'armL', 'armR', 'legL', 'legR'],
  mirrorself: ['torso', 'head', 'armL', 'armR', 'legL', 'legR'],
  seated: ['torso', 'head', 'armL', 'armR'],
  smiler: ['torso', 'teeth'],
  arcwraith: ['core', 'shard0', 'shard1', 'shard2', 'shard3'],
  hound: ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'tail'],
  clump: ['torso', 'armL', 'armR', 't1', 't2', 't3'],
  deathmoth: ['torso', 'head', 'wingL', 'wingR'],
  carrier: ['torso', 'wheelFL', 'wheelFR', 'wheelBL', 'wheelBR', 'hlL', 'hlR'],
  pipeworm: ['seg0', 'seg1', 'seg2', 'seg3', 'seg4', 'seg5', 'mouth'],
}
for (const type of Object.keys(ENTITIES)) {
  const branch = new RegExp(`case '${type}'`).test(meshSrc)
  const g = buildEntityMesh(type)
  g.updateMatrixWorld(true)
  let meshes = 0, verts = 0
  g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { meshes++; verts += m.geometry.attributes.position.count } })
  ok(branch, `${type}: 专属模型分支`)
  ok(meshes > 5 || verts > 100, `${type}: 复杂度达标`, `meshes=${meshes} verts=${verts}`)
  // ---------- 标准 2：正面 = +X（面部特征质心在 +X 半球）----------
  const pts: THREE.Vector3[] = []
  g.traverse((o) => { if (o.userData.face) pts.push(o.getWorldPosition(new THREE.Vector3())) })
  ok(pts.length > 0, `${type}: 有面部特征标记 (${pts.length} 个)`)
  if (pts.length > 0) {
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length)
    ok(c.x > 0.02 && c.x > Math.abs(c.z), `${type}: 面部质心在 +X 半球`, `centroid=(${c.x.toFixed(3)},${c.y.toFixed(2)},${c.z.toFixed(3)})`)
  }
  // ---------- 标准 3：动画部件完整（无缺失/不动部件）----------
  const parts = (g.userData.parts ?? {}) as Record<string, THREE.Object3D>
  const missing = (PARTS_EXPECT[type] ?? []).filter((p) => !parts[p])
  ok(missing.length === 0, `${type}: 动画部件齐全`, missing.length ? `缺 ${missing.join(',')}` : `parts=${Object.keys(parts).length}`)
  // ---------- 标准 3b：注册部件必须真正挂在场景图内（v14 曾出现 tag 未 grp.add 导致躯干/底盘不可见）----------
  const detached = Object.entries(parts).filter(([, o]) => {
    let p: THREE.Object3D | null = o
    while (p) { if (p === g) return false; p = p.parent }
    return true
  }).map(([n]) => n)
  ok(detached.length === 0, `${type}: 部件已挂入场景图`, detached.length ? `未挂载 ${detached.join(',')}` : '全部挂载')
}
// 动画系统分支覆盖：攻击前摇/死亡差异化/步态在 renderer.ts 中有实体分支或通用骨骼动画
console.log('[3] 动画系统覆盖（renderer.ts 分支）')
const ATTACK_TYPES = ['hound', 'carrier', 'pipeworm', 'deathmoth', 'smiler', 'arcwraith', 'clump']
for (const tp of ATTACK_TYPES) ok(rendererSrc.includes(`et === '${tp}'`), `攻击/死亡含 ${tp} 分支`)
ok(rendererSrc.includes('双臂高举过头') || rendererSrc.includes('双足人形通用'), '人形通用攻击动画')
ok(rendererSrc.includes('人形通用：倒地') || rendererSrc.includes('倒地 + 下沉'), '人形通用死亡动画')
ok(rendererSrc.includes('四肢摆动') && rendererSrc.includes('对角步态'), '双足/四足步态')
ok(rendererSrc.includes('呼吸') && rendererSrc.includes('张望'), '待机呼吸/张望')
ok(rendererSrc.includes('消散') && rendererSrc.includes('螺旋坠地') && rendererSrc.includes('侧翻瘫倒') && rendererSrc.includes('瘫软摊开'), '死亡动画差异化（消散/坠地/侧翻/瘫软）')

// ---------- 标准 4：物品 3D 拾取模型 + 背包图标 ----------
console.log('[4] 物品模型与背包图标')
const ICON_DIR = 'public/textures/icons'
for (const type of Object.keys(ITEMS)) {
  const branch = new RegExp(`case '${type}'`).test(meshSrc)
  const g = buildItemMesh(type)
  let meshes = 0
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++ })
  ok(branch && meshes >= 2, `${type}: 3D 拾取模型`, `meshes=${meshes}`)
  const hasImg = existsSync(`${ICON_DIR}/${type}.png`)
  const glyph = ITEMS[type].glyph
  const hasSvg = new RegExp(`case '${glyph}'`).test(hudSrc)
  ok(hasImg || hasSvg, `${type}: 背包图标`, hasImg ? '贴图' : `SVG(${glyph})`)
}

// ---------- 标准 5：图标素材（≤128px、<64KB、来源记录）----------
console.log('[5] 图标素材合规')
const sources = existsSync(`${ICON_DIR}/SOURCES.md`) ? readFileSync(`${ICON_DIR}/SOURCES.md`, 'utf8') : ''
ok(sources.length > 0 && sources.includes('game-icons.net'), 'SOURCES.md 存在且记录来源')
const pngs = existsSync(ICON_DIR) ? readdirSync(ICON_DIR).filter((f) => f.endsWith('.png')) : []
ok(pngs.length >= 10, '贴图图标数量 ≥10', `${pngs.length} 张`)
for (const f of pngs) {
  const sz = statSync(`${ICON_DIR}/${f}`).size
  ok(sz < 64 * 1024, `${f} <64KB`, `${sz}B`)
  ok(sources.includes(f), `SOURCES.md 记录 ${f}`)
  const imgOk = hudSrc.includes(`textures/icons/${'${type}'}.png`) || hudSrc.includes(f.replace('.png', ''))
  ok(imgOk, `${f} 已接入 icons 渲染`)
}

// ---------- v17 标准：L0「教学关卡」新设定（无限生成 / 实体绝迹 / 唯一闪烁门出口）----------
console.log('[6] v17 L0 教学关卡设定')
{
  const L0 = LEVELS[0]
  ok(L0.name === '教学关卡', 'L0 显示名=教学关卡（内部 id 不变）', `id=${L0.id}`)
  ok(L0.infinite === true, 'L0 infinite=true（无边界无限 chunk 生成）')
  ok(L0.entities.length === 0, 'L0 实体绝迹（定义 entities=0，含通用/特殊池均不生成）')
  // v27：用户版新增罕见第二出口「向下的灰色阶梯」（仍 →L1），主出口闪烁门不变；断言放宽为「主出口=闪烁门→L1 且所有出口均 →L1」
  ok(L0.exits[0].kind === 'flickerdoor' && L0.exits[0].dest === 1 && L0.exits.every((e) => e.dest === 1), 'L0 主出口=闪烁门→L1（v27 起允许额外出口，均 →L1）')
  const m0 = generateLevel(L0, 20260726)
  ok(!!m0.inf, 'L0 运行时携带无限模式状态（inf）')
  ok(m0.entities.length === 0, 'L0 运行时实体数=0')
  ok(m0.inf!.chunks.size === 25, '初始窗口加载 5×5=25 chunk', `${m0.inf!.chunks.size}`)
}

// ---------- v25：新增物品（v23/v25）图标专属 SVG 分支 + 独特配色 ----------
console.log('[7] v25 新物品图标')
{
  const NEW_ITEMS = ['chalkstub', 'megfolder', 'rope', 'divemask', 'thingmeat', 'oddbook', 'cavingsuit', 'xenonmarble', 'driedfruit', 'uvlamp', 'stonekazoo', 'pockets', 'housekey', 'wheatgrain', 'nails', 'timber', 'presses', 'pamphlet', 'citywater', 'endnote']
  const gcBlock = hudSrc.slice(hudSrc.indexOf('const GLYPH_COLOR'), hudSrc.indexOf('const ICON_IMG'))
  const colorOf = new Map<string, string>()
  for (const mm of gcBlock.matchAll(/(\w+): '(#[0-9a-f]{6})'/g)) colorOf.set(mm[1], mm[2])
  for (const t of NEW_ITEMS) {
    const glyph = ITEMS[t].glyph
    ok(new RegExp(`case '${glyph}'`).test(hudSrc), `${t}: SVG 分支存在`, `glyph=${glyph}`)
    const c = colorOf.get(t)
    ok(!!c, `${t}: GLYPH_COLOR 配色存在`, c ?? '缺失')
    if (c) {
      const dup = [...colorOf.entries()].find(([k, v]) => v === c && k !== t)
      ok(!dup, `${t}: 配色全局唯一`, dup ? `与 ${dup[0]} 同色 ${c}` : c)
    }
  }
}

// ---------- v28：53 件原创像素画物品图标（pixel/item_<id>.png，128×128 RGBA，HUD 登记 + pixelated 渲染）----------
console.log('[8] v28 原创像素画图标')
{
  const PIXEL_DIR = `${ICON_DIR}/pixel`
  const itemIds = Object.keys(ITEMS).sort()
  ok(existsSync(PIXEL_DIR), 'pixel/ 目录存在')
  const pixelPngs = existsSync(PIXEL_DIR) ? readdirSync(PIXEL_DIR).filter((f) => f.startsWith('item_') && f.endsWith('.png')) : []
  ok(pixelPngs.length === itemIds.length, `像素贴图数量=${itemIds.length}（53 件全覆盖）`, `${pixelPngs.length} 张`)
  const pxBlock = hudSrc.slice(hudSrc.indexOf('const PIXEL_ICON'), hudSrc.indexOf('const ICON_IMG'))
  for (const id of itemIds) {
    const f = `${PIXEL_DIR}/item_${id}.png`
    ok(existsSync(f), `${id}: 像素贴图存在`)
    if (existsSync(f)) {
      const buf = readFileSync(f)
      const isPng = buf.length > 33 && buf[0] === 0x89 && buf[1] === 0x50
      const w = isPng ? buf.readUInt32BE(16) : 0
      const h = isPng ? buf.readUInt32BE(20) : 0
      const colorType = isPng ? buf[25] : 0
      ok(isPng && w === 128 && h === 128 && colorType === 6, `${id}: 128×128 RGBA`, isPng ? `${w}×${h} ct=${colorType} ${buf.length}B` : '非 PNG')
      ok(buf.length < 64 * 1024, `${id}: <64KB`, `${buf.length}B`)
    }
    ok(new RegExp(`\\b${id}: true`).test(pxBlock), `${id}: PIXEL_ICON 已登记`)
  }
  ok(hudSrc.includes('textures/icons/pixel/item_'), 'ItemGlyph 使用 pixel/ 路径')
  ok(hudSrc.includes('pixelErr'), '像素贴图 404 回退链（pixel→旧贴图→SVG）')
  ok(hudSrc.includes("imageRendering: 'pixelated'"), '图标 img pixelated 渲染')
  ok(sources.includes('v28') && sources.includes('原创像素画'), 'SOURCES.md 记录 v28 原创像素画来源说明')
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) { console.log('失败项：' + fails.join(' | ')); process.exit(1) }
