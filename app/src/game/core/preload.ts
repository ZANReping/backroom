// 开始游戏前的资源预加载：用真实网络请求 + 图像解码暖热浏览器缓存，
// 并按资源粒度回报进度。所有失败都降级为「继续进入游戏」——兜底贴图/程序化资源仍在。
import { texLevelId, textureUrl } from '../renderer/shared'
import { musicAudioUrl, resolveMidiSong } from './midi'

export interface PreloadUpdate {
  /** 0–100（本模块只负责 0–88，剩余进度由世界初始化步骤填充） */
  progress: number
  label: string
  detail: string
  log?: string
}

export interface PreloadRequest {
  targetLevel: number
  bgmStyle: 'procedural' | 'midi'
  allLevels?: boolean
}

interface Asset {
  url: string
  label: string
  detail: string
  weight?: number
}

const T = (name: string, label: string, detail: string, weight = 1): Asset =>
  ({ url: textureUrl(name), label, detail, weight })

function levelCoreAssets(level: number): Asset[] {
  const id = texLevelId(level)
  if (id === 0) {
    return [
      T('l0_wall_classic_v2.png', '出生层级', 'Level 0 · 淡黄单色墙纸'),
      T('l0_floor_classic_v2.png', '出生层级', 'Level 0 · 潮湿的工业地毯'),
      T('l0_ceil_classic_v2.png', '出生层级', 'Level 0 · 荧光灯吊顶'),
      T('l0_decal_carpet_stain_v2.png', '出生层级', 'Level 0 · 地毯污渍贴花'),
      T('l0_decal_wall_peel_v2.png', '出生层级', 'Level 0 · 墙纸剥落贴花'),
      T('l0_decal_fake_door_v2.png', '出生层级', 'Level 0 · 假门贴花'),
    ]
  }
  const out = [
    T(`l${id}_wall`, `Level ${level}`, `Level ${level} · 墙面材质`),
    T(`l${id}_floor`, `Level ${level}`, `Level ${level} · 地面材质`),
    T(`l${id}_ceil`, `Level ${level}`, `Level ${level} · 天花板材质`),
  ]
  if (id === 3) {
    out.push(T('l3_wall_normal.jpg', `Level ${level}`, 'Level 3 · 砖墙法线'))
    out.push(T('l3_wall_roughness.jpg', `Level ${level}`, 'Level 3 · 砖墙粗糙度'))
    out.push(T('l3_marble', `Level ${level}`, 'Level 3 · 圣所大理石'))
  } else if (id === 5) {
    out.push(T('l5_carpet.jpg', `Level ${level}`, 'Level 5 · 金红地毯'))
    out.push(T('l5_tile.png', `Level ${level}`, 'Level 5 · 泳池瓷砖'))
  } else if (id === 6) {
    out.push(T('l6_dn_wall', `Level ${level}`, 'Level 6 · 地下墙面'))
    out.push(T('l6_dn_floor', `Level ${level}`, 'Level 6 · 地下地面'))
    out.push(T('l6_dn_wall_normal.jpg', `Level ${level}`, 'Level 6 · 地下墙法线'))
    out.push(T('l6_dn_floor_normal.jpg', `Level ${level}`, 'Level 6 · 地下地法线'))
  } else if (id === 7) {
    out.push(T('l7_cabin_metal.jpg', `Level ${level}`, 'Level 7 · 舱体船壳钢板'))
    out.push(T('l7_carpet.jpg', `Level ${level}`, 'Level 7 · 入口房间湿毯'))
    out.push(T('l7_cabin_wood.jpg', `Level ${level}`, 'Level 7 · 入口房间漆木墙板'))
    out.push(T('l7_cabin_ceil.jpg', `Level ${level}`, 'Level 7 · 入口房间吊顶木板'))
    out.push(T('l7_seabed_sand_gravel.png', `Level ${level}`, 'Level 7 · 沙质细砾海床', 2))
    out.push(T('l7_seabed_rock_gravel.png', `Level ${level}`, 'Level 7 · 石质粗砾海床', 2))
  } else if (id === 8) {
    out.push(T('l8_wall_normal.jpg', `Level ${level}`, 'Level 8 · 岩壁法线'))
    out.push(T('l8_wall_roughness.jpg', `Level ${level}`, 'Level 8 · 岩壁粗糙度'))
    out.push(T('l8_floor_normal.jpg', `Level ${level}`, 'Level 8 · 洞底法线'))
    out.push(T('l8_floor_roughness.jpg', `Level ${level}`, 'Level 8 · 洞底粗糙度'))
    out.push(T('l8_ceil_normal.jpg', `Level ${level}`, 'Level 8 · 洞顶法线'))
    out.push(T('l8_ceil_roughness.jpg', `Level ${level}`, 'Level 8 · 洞顶粗糙度'))
    out.push(T('l8_movile_fungalmat.png', `Level ${level}`, 'Level 8 · 新莫维勒菌毯', 2))
    out.push(T('l8_rottnest_moss.png', `Level ${level}`, 'Level 8 · 罗特尼斯苔藓湿土', 2))
  } else if (id === 9) {
    for (const [base, label] of [
      ['l9_asphalt', '道路沥青'], ['l9_sidewalk', '人行道'], ['l9_grass', '草坪'],
      ['l9_driveway', '车道'], ['l9_path', '土径'], ['l9_pool_deck', '泳池岸砖'],
      ['l9_wood_floor', '住宅木地板'], ['l9_plaster', '粉刷墙'], ['l9_siding', '外墙挂板'],
      ['l9_brick', '外墙砖'], ['l9_roof_slate', '板岩屋顶'], ['l9_roof_tile', '瓦片屋顶'],
      ['l9_furniture_wood', '住宅家具木材'],
    ] as const) {
      out.push(T(`${base}_diff.jpg`, `Level ${level}`, `Level 9 · ${label}颜色`))
      out.push(T(`${base}_normal.jpg`, `Level ${level}`, `Level 9 · ${label}法线`))
      out.push(T(`${base}_rough.jpg`, `Level ${level}`, `Level 9 · ${label}粗糙度`))
    }
  } else if (id === 10) {
    for (const [base, label] of [
      ['l10_dry_soil', '干燥土壤'], ['l10_wet_rut', '湿车辙'], ['l10_grass', '草地'],
      ['l10_packed_dirt', '夯实泥土'], ['l10_damp_shore', '潮湿湖岸'], ['l10_wood', '木材'],
      ['l10_metal', '金属'], ['l10_wheat', '小麦'], ['l10_hedge', '树篱'],
      ['l10_foliage', '树篱与树冠叶片'], ['l10_hay', '压缩干草块'],
    ] as const) {
      out.push(T(`${base}_diff.jpg`, `Level ${level}`, `Level 10 · ${label}颜色`))
      out.push(T(`${base}_normal.jpg`, `Level ${level}`, `Level 10 · ${label}法线`))
      out.push(T(`${base}_rough.jpg`, `Level ${level}`, `Level 10 · ${label}粗糙度`))
    }
    out.push(T('l10_wheat_clump.png', `Level ${level}`, 'Level 10 · 近中景透明小麦簇', 2))
    out.push(T('l10_barley_clump.png', `Level ${level}`, 'Level 10 · 近中景透明大麦簇', 2))
  }
  return out
}

function commonAssets(): Asset[] {
  return [
    T('crate_wood.jpg', '通用物件', '板条箱木材'),
    T('barrel_wood.jpg', '通用物件', '杏仁水木桶板材'),
    T('manila_wallpaper.png', '通用物件', '马尼拉室墙纸'),
    T('manila_floor_dark_v2.png', '通用物件', '马尼拉室木地板'),
    T('exit_sign_v1.png', '通用物件', '出口指示牌'),
    T('flashlight_uv_atlas.png', '装备与补给', '手电筒材质图集'),
    T('item_almond_thermos_uv.png', '装备与补给', '杏仁水保温壶贴图'),
    T('item_canned_label_uv.png', '装备与补给', '罐头食品标签'),
    T('item_bandage_gauze_uv.png', '装备与补给', '绷带纱布贴图'),
    T('item_firesalt_crystal_uv.png', '装备与补给', '火盐结晶 UV 贴图'),
  ]
}

/** 下载并解码一张图片（失败静默——正式渲染仍有程序化兜底） */
function warmImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.decoding = 'async'
    img.src = url
  })
}

/** 预下载渲染音频文件（仅 MIDI 曲风使用；失败回退程序化 BGM） */
function warmAudio(url: string): Promise<void> {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.arrayBuffer()
  }).then(() => undefined).catch(() => undefined)
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export async function preloadGameResources(req: PreloadRequest, onUpdate: (u: PreloadUpdate) => void): Promise<void> {
  const groups: { name: string; assets: Asset[] }[] = [{ name: '通用资源', assets: commonAssets() }]
  if (req.allLevels !== false) {
    // 常规层、结局层和全部据点层统一预载；相同 URL 去重，避免据点材质别名重复请求。
    const ids = [...Array.from({ length: 12 }, (_, i) => i), 601, ...Array.from({ length: 14 }, (_, i) => 101 + i), 274]
    const seen = new Set<string>()
    const assets = ids.flatMap(levelCoreAssets).filter((a) => !seen.has(a.url) && !!seen.add(a.url))
    groups.push({ name: '全部层级资产', assets })
  } else {
    groups.push({ name: `Level ${req.targetLevel}`, assets: levelCoreAssets(req.targetLevel) })
  }
  groups.push({ name: '音频资源', assets: req.bgmStyle === 'midi' ? [{
    url: musicAudioUrl(resolveMidiSong(req.targetLevel)),
    label: '音频资源',
    detail: `Level ${req.targetLevel} · 背景音乐`,
    weight: 2,
  }] : [] })

  const total = groups.reduce((s, g) => s + g.assets.reduce((a, b) => a + (b.weight ?? 1), 0), 0)
  let done = 0
  const emit = (label: string, detail: string, log?: string) => {
    onUpdate({ progress: Math.min(88, Math.round((done / Math.max(1, total)) * 88)), label, detail, log })
  }

  for (const g of groups) {
    if (!g.assets.length) {
      onUpdate({ progress: Math.min(88, Math.round((done / Math.max(1, total)) * 88)), label: g.name, detail: '程序化合成 · 无需网络预载' })
      continue
    }
    for (const a of g.assets) {
      onUpdate({ progress: Math.min(88, Math.round((done / Math.max(1, total)) * 88)), label: g.name, detail: a.detail, log: `预载 ${a.label}：${a.detail}` })
      if (g.name === '音频资源') await warmAudio(a.url)
      else await warmImage(a.url)
      done += a.weight ?? 1
      await pause(8) // 让进度条/内容行有时间渲染，避免缓存命中时一闪而过
    }
  }
  emit('资源预载完成', '所有请求均已处理（失败项已自动跳过）', '预载流程结束')
}
