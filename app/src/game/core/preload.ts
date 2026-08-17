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
  const groups: { name: string; assets: Asset[] }[] = [
    { name: '通用资源', assets: commonAssets() },
    { name: `Level ${req.targetLevel}`, assets: levelCoreAssets(req.targetLevel) },
  ]
  const next = req.targetLevel === 0 ? 1 : req.targetLevel === 11 ? 601 : req.targetLevel === 601 ? -1 : req.targetLevel + 1
  if (next >= 0) groups.push({ name: `Level ${next} 预载`, assets: levelCoreAssets(next) })
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
