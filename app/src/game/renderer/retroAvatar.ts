// 通用复古形象（v68）：AvatarCfg（玩家捏人 / 随机 NPC / 有名 NPC 的固定配置）→ retroNpc 的 RetroSpec + 共享贴图池。
// · 脸：生成照片脸池（性别×肤色 5 档×3 张），玩家固定用每组第 0 张、表情（平静/微笑/严肃/困倦）换整张脸贴图；
//   随机/有名 NPC 按种子取 3 张之一。贴图源与提示词见 art-source/npc-retro/manifest.json → pool。
// · 衣物：上衣 8 款、裤子 6 款的中性灰照片面料图集，运行时用顶点色染成配置色（一个 body 材质）；
// · 发型 16 款 = 发壳发际线参数 + 少量体块（发髻/马尾/脏辫/莫西干脊…），灰度发丝贴图 × 发色；
// · 兼容旧动画：grp.userData.parts 映射到骨骼（torso→spine、head→head、armL/armR→upperArm、legL/legR→thigh；
//   旧模型的 L 在 -X，故与骨骼左右互换），外部照旧改 rotation.x/z、scale.y 即可驱动；
//   NPC 配饰直接适配骨骼与衣物表面；少量旧实体附件仍调用 fitLegacyAttachments() 换算。
import * as THREE from 'three'
import type { AvatarCfg } from '../core/avatar'
import { SKIN_OPTIONS } from '../core/avatar'
import type { EquipVisual } from './playerModel'
import { retroTextureChanged } from './retroResources'
import {
  buildRetroFigure, buildRetroNpc, retroNpcSpec, RETRO_NPC_META, retroNpcTexturesSync, retroTexture, RETRO_NPC_IDS,
  type RetroHair, type RetroNpc, type RetroNpcId, type RetroNpcMeta, type RetroNpcTextures, type RetroSpec,
} from './retroNpc'

const BASE = '/textures/npc-retro'
/** 池内脸图统一构图（规范化脚本保证）：[眼线 v, 鼻尖 v, 嘴 v, 下巴 v, 左眼 u, 右眼 u] */
export const POOL_META: RetroNpcMeta = { landmarks: [0.368, 0.597, 0.775, 0.975, 0.295, 0.705], skinUV: [0.2, 0.47], faceFill: [0.92, 0.96] }
const EXPRS = ['neutral', 'smile', 'serious', 'sleepy'] as const

const HAIRS: RetroHair[] = ['none', 'short', 'buzz', 'slick', 'medium', 'twintails', 'bangs', 'messy', 'bun-top', 'side-bangs', 'dreads', 'long', 'curly', 'mohawk', 'double-buns', 'ponytail']
const hairTexName = (h: RetroHair) => (h === 'buzz' || h === 'mohawk' ? 'crop' : h === 'curly' || h === 'messy' ? 'curly' : h === 'dreads' ? 'dreads' : 'straight')
type TopDef = RetroSpec['top']
const TOPS: TopDef[] = [
  { hemY: 0.9, fit: 0.014, collar: 'crew', sleeves: 'short' }, // T恤
  { hemY: 0.88, fit: 0.016, collar: 'shirt', sleeves: 'long' }, // 衬衫
  { hemY: 0.86, fit: 0.026, collar: 'hood', sleeves: 'long' }, // 连帽衫
  { hemY: 0.87, fit: 0.022, collar: 'stand', sleeves: 'long' }, // 夹克
  { hemY: 0.86, fit: 0.024, collar: 'stand', sleeves: 'long' }, // 工装
  { hemY: 0.9, fit: 0.008, collar: 'scoop', sleeves: 'none' }, // 背心
  { hemY: 0.86, fit: 0.024, collar: 'crew', sleeves: 'long' }, // 毛衣
  { hemY: 0.56, fit: 0.026, collar: 'open', sleeves: 'long' }, // 风衣
]
const PANTS: RetroSpec['pants']['style'][] = ['long', 'shorts', 'cargo', 'long', 'sweat', 'wide']

const hexNum = (c: string) => parseInt(c.replace('#', ''), 16)
const lum = (c: string) => { const n = hexNum(c); return (0.3 * ((n >> 16) & 255) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255)) / 255 }
const shadeNum = (c: number, k: number) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k)), g = Math.min(255, Math.round(((c >> 8) & 255) * k)), b = Math.min(255, Math.round((c & 255) * k))
  return (r << 16) | (g << 8) | b
}
/** 配置肤色 → 肤色档（0 最浅 … 4 最深）：取 SKIN_OPTIONS 中 RGB 最近的一档（有名 NPC 的自定义肤色也能落档）。 */
export function skinTier(skin: string): number {
  const c = hexNum(skin)
  let best = 0, bd = Infinity
  SKIN_OPTIONS.forEach((o, i) => {
    const d = hexNum(o)
    const dist = (((c >> 16) & 255) - ((d >> 16) & 255)) ** 2 + (((c >> 8) & 255) - ((d >> 8) & 255)) ** 2 + ((c & 255) - (d & 255)) ** 2
    if (dist < bd) { bd = dist; best = i }
  })
  return best
}

const mulberry = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---------- 贴图池 ----------
const atlasCache = new Map<string, THREE.Texture>()
const imgCache = new Map<string, Promise<HTMLImageElement>>()
const loadImg = (url: string) => {
  let p = imgCache.get(url)
  if (!p) {
    p = new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url })
    imgCache.set(url, p)
  }
  return p
}
/** 上衣款式 × 裤款 → 128² 衣物图集（左上/右上/左下 = 上衣正面/背面/袖子，右下 = 裤腿），同步返回、图片到达后绘制。 */
function bodyAtlas(topStyle: number, pantsStyle: number): THREE.Texture {
  const key = `${topStyle}/${pantsStyle}`
  let t = atlasCache.get(key)
  if (t) return t
  if (typeof document === 'undefined') { t = retroTexture(`${BASE}/cloth/top-${topStyle}.png`); atlasCache.set(key, t); return t }
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const ct = new THREE.CanvasTexture(cv)
  const fallback = cv.getContext('2d')!
  fallback.fillStyle = '#bbbbbb'; fallback.fillRect(0, 0, 128, 128)
  ct.userData.retroShared = true
  ct.minFilter = ct.magFilter = THREE.NearestFilter
  ct.generateMipmaps = false
  ct.colorSpace = THREE.SRGBColorSpace
  ct.userData.ready = false
  Promise.all([loadImg(`${BASE}/cloth/top-${topStyle}.png`), loadImg(`${BASE}/cloth/pants-${pantsStyle}.png`)]).then(([top, pants]) => {
    const g = cv.getContext('2d')!
    g.imageSmoothingEnabled = false
    g.drawImage(top, 0, 0, 128, 128)
    g.drawImage(pants, 64, 64, 64, 64)
    ct.needsUpdate = true
    ct.userData.ready = true
    retroTextureChanged()
  }).catch(() => { ct.userData.ready = true; ct.userData.loadError = key; retroTextureChanged() })
  atlasCache.set(key, ct)
  return ct
}
const facePath = (g: 'm' | 'f', tier: number, v: number, expr: string) => `${BASE}/pool/${g}${tier}-${v}/${expr}.png`
function faceTextures(g: 'm' | 'f', tier: number, v: number, expr: number) {
  const e = v === 0 ? EXPRS[expr] ?? 'neutral' : 'neutral'
  return { face: retroTexture(facePath(g, tier, v, e)), faceBlink: retroTexture(facePath(g, tier, v, `${e}-blink`)) }
}

/** 空闲时预载整个形象贴图池（约 3MB 小 PNG），菜单里的档案肖像/预览打开时即可直接用。 */
export function preloadRetroAvatarTextures() {
  retroTexture('/textures/npc-gear/color.png')
  for (const g of ['m', 'f'] as const) for (let k = 0; k < 5; k++) for (let v = 0; v < 3; v++) faceTextures(g, k, v, 0)
  for (let s = 0; s < 8; s++) bodyAtlas(s, 0)
  for (let k = 0; k < 5; k++) retroTexture(`${BASE}/faceless/t${k}.png`)
  for (const h of ['straight', 'crop', 'curly', 'dreads']) retroTexture(`${BASE}/cloth/hair-${h}.png`)
  for (const id of RETRO_NPC_IDS) retroNpcTexturesSync(id)
}

/** 模型用到的贴图是否都已到位（离屏肖像据此决定能否缓存这一帧）。 */
export function retroModelReady(root: THREE.Object3D): boolean {
  let ok = true
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material
    if (!m) return
    for (const mat of Array.isArray(m) ? m : [m]) {
      const map = (mat as THREE.MeshLambertMaterial).map
      if (!map) continue
      if (map.userData.ready === false) ok = false
      const img = map.image as HTMLImageElement | undefined
      if (!img || (img as HTMLImageElement).complete === false || (img.width ?? 0) === 0) ok = false
    }
  })
  return ok
}

export interface RetroAvatarOpts {
  ev?: EquipVisual
  seed?: number // 有种子 = NPC：体型微调 + 脸从三张里挑；无 = 玩家标准体型 + 第 0 张脸（有表情）
  faceless?: boolean
  /** v73：L3 进化无面灵异常五官种子（配合 faceless） */
  faceAnomaly?: number
  badge?: string
  /** NPC-only native clothing, avoiding oversized accessory shells. */
  npcGloves?: number
  npcBoots?: boolean
  npcRobe?: boolean
  /** v77：窃皮者披着的人皮——略高、四肢略长、脖子略长、蜡黄、眼窝深陷 */
  stolen?: boolean
  /** 游戏内（默认）：四肢由外部动画驱动；预览/肖像传 false 走自带待机 */
  driven?: boolean
}

/** AvatarCfg → RetroSpec（纯数据，便于测试/对比）。 */
export function avatarSpec(cfg: AvatarCfg, opts: RetroAvatarOpts = {}): RetroSpec {
  const ev = opts.ev ?? {}
  const fem = cfg.gender === 1
  const r = opts.seed !== undefined ? mulberry((opts.seed * 2654435761) >>> 0) : () => 0.5
  const j = (amt: number) => 1 + (r() - 0.5) * 2 * amt
  const suited = ev.suit || ev.cavingsuit
  const topStyle = ev.suit ? 3 : ev.cavingsuit ? 4 : cfg.topStyle
  const top = { ...(TOPS[topStyle] ?? TOPS[0]) }
  if(opts.npcRobe){top.hemY=.53;top.drapedHem=true}
  const topTint = ev.suit ? 0x3a5a3a : ev.cavingsuit ? 0x8a7a5c : hexNum(cfg.top)
  if (topStyle === 7) top.belt = shadeNum(topTint, 0.8)
  const pantsTint = ev.suit ? 0x2e4a2e : ev.cavingsuit ? 0x7a6a4e : hexNum(cfg.pants)
  const shoeStyle = opts.npcBoots ? 'boot' : ev.suit ? 'loafer' : (['loafer', 'sneaker', 'boot'] as const)[cfg.shoes] ?? 'loafer'
  const shoeColor = opts.npcBoots ? 0x262a29 : ev.suit ? 0x243a24 : shoeStyle === 'boot' ? 0x4a3424 : 0x26262a
  const old = opts.seed !== undefined ? (opts.seed >>> 0) % 3 : 0
  return {
    name: 'avatar',
    fem,
    height: (fem ? 0.95 : 1.0) * j(0.025),
    shoulder: (fem ? 0.88 : 1.0) * j(0.05),
    waist: (fem ? 0.86 : 1.0) * j(0.08) + (old === 2 ? 0.04 : 0),
    hip: (fem ? 1.0 : 1.0) * j(0.04),
    limb: (fem ? 0.9 : 1.0) * j(0.04),
    head: [(fem ? 0.95 : 1.0) * j(0.025), (fem ? 0.99 : 1.0) * j(0.02), (fem ? 0.96 : 1.0) * j(0.02)],
    jaw: (fem ? 0.93 : 1.02) * j(0.04),
    nose: fem ? 0.55 : 0.68,
    belly: opts.seed !== undefined && !fem ? Math.max(0, (r() - 0.55) * 0.08) + (old === 2 ? 0.015 : 0) : 0,
    neckAdj: -0.012,
    hair: HAIRS[cfg.hair] ?? 'short',
    hairTint: hexNum(cfg.hairColor),
    top: { ...top, tint: topTint },
    pants: { style: suited ? 'long' : PANTS[cfg.pantsStyle] ?? 'long', tint: pantsTint },
    shoe: { color: shoeColor, style: shoeStyle },
    glasses: ev.divemask || ev.nightvision ? 0 : cfg.glasses,
    beard: fem ? 0 : cfg.beard,
    gloves: opts.npcGloves ?? (ev.gloves ? 0xb89a2e : ev.suit ? 0x2e4a2e : undefined),
    headgear: { divemask: ev.divemask, headlamp: ev.headlamp, nightvision: ev.nightvision },
    badge: opts.badge ? hexNum(opts.badge) : undefined,
    // 近黑皮肤（BRC 黑影等）：照片肤色整体压黑
    skinTint: lum(cfg.skin) < 0.16 ? shadeNum(hexNum(cfg.skin), 2.2) : undefined,
    faceless: opts.faceless,
    faceAnomaly: opts.faceless ? opts.faceAnomaly : undefined,
    pose: 'neutral',
    ...(opts.stolen ? stolenTweaks(fem, cfg.skin) : {}),
  }
}

/** v77：人皮伪装的破绽（附加在 avatarSpec 结果上）：比常人高约 8%，四肢再长一点，脖子被撑长，皮肤蜡黄发灰 */
function stolenTweaks(fem: boolean, skin: string): Partial<RetroSpec> {
  const dark = lum(skin) < 0.16
  return { height: (fem ? 0.95 : 1.0) * 1.08, limb: (fem ? 0.9 : 1.0) * 1.06, neckAdj: 0.012, skinTint: dark ? shadeNum(hexNum(skin), 2.2) : 0xe9e2bc, stolen: true }
}

/** 骨骼 → 旧部件名（旧模型的 L 在 -X，与骨骼的解剖左右相反）。 */
const PART_BONES = { torso: 'spine', head: 'head', armL: 'upperArmR', armR: 'upperArmL', legL: 'thighR', legR: 'thighL' } as const

function wrap(npc: RetroNpc, name: string): THREE.Group {
  const g = new THREE.Group()
  g.name = name
  g.add(npc.group)
  const parts: Record<string, THREE.Object3D> = {}
  for (const [k, b] of Object.entries(PART_BONES)) { parts[k] = npc.bones[b]; npc.bones[b].userData.legacyPart = k }
  g.userData.parts = parts
  g.userData.retro = npc
  g.userData.retroUpdate = (t: number) => npc.update(t)
  g.userData.headFrame = npc.headFrame
  return g
}

/** 通用形象（玩家 / 随机 NPC / 有名 NPC）。 */
export function buildAvatarModel(cfg: AvatarCfg, opts: RetroAvatarOpts = {}): THREE.Group {
  const spec = avatarSpec(cfg, opts)
  const g = spec.fem ? 'f' : 'm'
  const tier = skinTier(cfg.skin)
  const v = opts.seed !== undefined ? (opts.seed >>> 0) % 3 : 0
  const ft = faceTextures(g, tier, v, cfg.face)
  const topStyle = opts.ev?.suit ? 3 : opts.ev?.cavingsuit ? 4 : cfg.topStyle
  const tex: RetroNpcTextures = { ...ft, ...(opts.faceless ? { faceless: retroTexture(`${BASE}/faceless/t${tier}.png`) } : {}), body: bodyAtlas(topStyle, opts.ev?.suit || opts.ev?.cavingsuit ? 0 : cfg.pantsStyle), hair: retroTexture(`${BASE}/cloth/hair-${hairTexName(spec.hair)}.png`) }
  const npc = buildRetroFigure(spec, POOL_META, tex, { seed: opts.seed ?? 7, driven: opts.driven ?? true })
  return wrap(npc, 'RetroAvatar')
}

/** 四个手工示例 NPC 的专属复古模型（游戏内 / 档案共用）；其余 id 返回 null。 */
export function buildRetroNamedNpc(id: string, opts: { driven?: boolean; fittedGear?: boolean } = {}): THREE.Group | null {
  if (!(RETRO_NPC_IDS as string[]).includes(id)) return null
  const namedId=id as RetroNpcId, original=retroNpcSpec(namedId)
  const npc = opts.fittedGear
    ? buildRetroFigure({...original,glasses:0,props:original.props?.filter(p=>p==='sideburns')},RETRO_NPC_META[namedId],retroNpcTexturesSync(namedId),{driven:opts.driven??true})
    : buildRetroNpc(namedId, retroNpcTexturesSync(namedId), { driven: opts.driven ?? true })
  return wrap(npc, `RetroNpc:${id}`)
}

/**
 * 把按旧方块模型坐标挂到 parts 上的旧实体附件换算到新骨骼坐标：
 * 头（旧：下巴 y0、头顶 y0.26、脸前 z0.12、半宽 0.12）→ 新头骨局部；手臂/腿按新肢长拉伸；躯干（旧中心 y1.06）对齐上衣。
 * 已处理的子物体打 userData.legacyFit，可重复调用。
 */
export function fitLegacyAttachments(root: THREE.Object3D) {
  const parts = root.userData.parts as Record<string, THREE.Object3D> | undefined
  const hf = root.userData.headFrame as RetroNpc['headFrame'] | undefined
  if (!parts || !hf) return
  const map: Record<string, { s: [number, number, number]; o: [number, number, number] }> = {
    head: { s: [hf.halfW / 0.12, (hf.topY - hf.chinY) / 0.26, (hf.faceZ + 0.006) / 0.12], o: [0, hf.chinY, 0] },
    torso: { s: [0.84, 1, 1.12], o: [0, 0.07, 0] },
    armL: { s: [1, 1.12, 1], o: [0, 0, 0] }, armR: { s: [1, 1.12, 1], o: [0, 0, 0] },
    legL: { s: [1, 1.15, 1], o: [0, 0, 0] }, legR: { s: [1, 1.15, 1], o: [0, 0, 0] },
  }
  for (const [k, part] of Object.entries(parts)) {
    const m = map[k]
    if (!m || !part) continue
    for (const c of part.children) {
      if ((c as THREE.Bone).isBone || c.userData.legacyFit) continue
      c.userData.legacyFit = 1
      c.position.set(c.position.x * m.s[0] + m.o[0], c.position.y * m.s[1] + m.o[1], c.position.z * m.s[2] + m.o[2])
      c.scale.multiply(new THREE.Vector3(...m.s))
    }
  }
}

/** NPC id → 稳定种子（挑脸 / 体型微调；游戏内与档案肖像一致） */
export function npcSeed(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** 是否为新复古模型（调用方据此跳过旧的「摘面部件」等做法）。 */
export const isRetroModel = (o: THREE.Object3D) => !!o.userData.retro

/** v78：悲尸改造复用的衣物图集与图片缓存（wretchMesh.ts 在其上撕出破洞、泼上污渍） */
export { bodyAtlas as retroBodyAtlas, loadImg as loadRetroImg, wrap as wrapRetroFigure }
export const RETRO_BASE = BASE
