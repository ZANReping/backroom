// v56：标准 MIDI 文件（SMF0/1）解析与加载——浏览器端直接播放 .mid 格式音频
// 解析出扁平化的音符事件列表（绝对秒 + 时长），供 audio.ts 的 WebAudio 合成器播放。
// 音色按 GM 音色号保留（prog），合成器侧再映射到 WebAudio 振荡器音色。
import { OUTPOSTS } from '../content/outposts'

export interface MidiNoteEv {
  t: number // 开始时间（秒，自循环起点）
  d: number // 时长（秒）
  p: number // 音高（0..127）
  v: number // 力度 0..1
  prog: number // GM 音色号（打击乐轨 = -1）
  ch: number
}

export interface MidiSongParsed {
  notes: MidiNoteEv[]
  duration: number // 总时长（秒），循环用
}

// 从 ArrayBuffer 解析标准 MIDI 文件
export function parseMidi(bytes: ArrayBuffer): MidiSongParsed {
  const u8 = new Uint8Array(bytes)
  const dv = new DataView(bytes)
  let p = 0
  const ascii = (n: number) => String.fromCharCode(...u8.subarray(p, p + n))
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v }
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v }
  const vlq = () => {
    let value = 0
    let b
    do { b = u8[p++]; value = (value << 7) | (b & 0x7f) } while (b & 0x80)
    return value
  }

  if (ascii(4) !== 'MThd') throw new Error('not a MIDI file')
  p += 4
  const hlen = u32()
  u16() // format
  const ntrks = u16()
  const division = u16()
  p = 8 + hlen
  const ticksPerBeat = division & 0x7fff
  if (ticksPerBeat <= 0) throw new Error('unsupported SMPTE division')

  const tempoEvents: { tick: number; uspq: number }[] = []
  const rawNotes: { tick: number; dur: number; p: number; v: number; prog: number; ch: number }[] = []
  const pending = new Map<string, { tick: number; vel: number }>()

  for (let t = 0; t < ntrks; t++) {
    if (ascii(4) !== 'MTrk') throw new Error('bad track header')
    p += 4
    const tlen = u32()
    const end = p + tlen
    let tick = 0
    let status = 0
    const prog: number[] = new Array(16).fill(0)
    while (p < end) {
      const delta = vlq()
      tick += delta
      let ev = u8[p++]
      if (ev < 0x80) {
        p--
        ev = status
      } else {
        status = ev
      }
      const type = ev & 0xf0
      const ch = ev & 0x0f
      if (type === 0x80 || type === 0x90) {
        const pitch = u8[p++]
        const vel = u8[p++]
        const key = `${ch}:${pitch}`
        if (type === 0x90 && vel > 0) {
          const prev = pending.get(key)
          if (prev) rawNotes.push({ tick: prev.tick, dur: tick - prev.tick, p: pitch, v: prev.vel / 127, prog: prog[ch], ch })
          pending.set(key, { tick, vel })
        } else {
          const prev = pending.get(key)
          if (prev) {
            rawNotes.push({ tick: prev.tick, dur: tick - prev.tick, p: pitch, v: prev.vel / 127, prog: prog[ch], ch })
            pending.delete(key)
          }
        }
      } else if (type === 0xc0) {
        prog[ch] = u8[p++]
      } else if (type === 0xb0 || type === 0xe0) {
        p += 2
      } else if (type === 0xd0) {
        p += 1
      } else if (ev === 0xff) {
        const meta = u8[p++]
        const len = vlq()
        if (meta === 0x51) {
          tempoEvents.push({ tick, uspq: (u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2] })
        }
        p += len
        if (meta === 0x2f) break
      } else if (ev === 0xf0 || ev === 0xf7) {
        p += vlq()
      } else {
        throw new Error(`unhandled MIDI event 0x${ev.toString(16)}`)
      }
    }
    p = end
  }

  tempoEvents.sort((a, b) => a.tick - b.tick)
  if (tempoEvents.length === 0) tempoEvents.push({ tick: 0, uspq: 500000 })
  const tickToSec = (tick: number): number => {
    let sec = 0
    let prevTick = 0
    let uspq = tempoEvents[0].uspq
    for (const te of tempoEvents) {
      if (te.tick > tick) break
      sec += ((te.tick - prevTick) * uspq) / 1000000 / ticksPerBeat
      uspq = te.uspq
      prevTick = te.tick
    }
    sec += ((tick - prevTick) * uspq) / 1000000 / ticksPerBeat
    return sec
  }

  let duration = 0
  const notes: MidiNoteEv[] = []
  for (const n of rawNotes) {
    const t = tickToSec(n.tick)
    const d = tickToSec(n.tick + n.dur) - t
    if (t + d > duration) duration = t + d
    notes.push({ t, d, p: n.p, v: n.v, prog: n.prog, ch: n.ch })
  }
  notes.sort((a, b) => a.t - b.t)
  return { notes, duration: Math.max(0.01, duration) }
}

const midiCache = new Map<string, Promise<MidiSongParsed>>()
export function loadMidi(url: string): Promise<MidiSongParsed> {
  let p = midiCache.get(url)
  if (!p) {
    p = fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`loadMidi ${url}: ${res.status}`)
      return parseMidi(await res.arrayBuffer())
    })
    midiCache.set(url, p)
  }
  return p
}

// 音乐文件 URL（部署子路径/无尾斜杠下仍可解析，惯例同 shared.ts textureUrl）
export function musicUrl(name: string): string {
  const file = `${name}.mid`
  try {
    const mod = import.meta.url
    if (mod.includes('/assets/')) return new URL(`../music/${file}`, mod).href
  } catch { /* dev/旧浏览器回退 */ }
  const base = ((import.meta.env?.BASE_URL as string | undefined) ?? '/').replace(/\/?$/, '/')
  return `${base}music/${file}`
}

// v56 三轮：乐手摇滚曲目为离线渲染的音频（FluidR3 GM 音色库，真实吉他/贝斯/鼓组）
export function musicAudioUrl(name: string): string {
  const file = `${name}.mp3`
  try {
    const mod = import.meta.url
    if (mod.includes('/assets/')) return new URL(`../music/${file}`, mod).href
  } catch { /* dev/旧浏览器回退 */ }
  const base = ((import.meta.env?.BASE_URL as string | undefined) ?? '/').replace(/\/?$/, '/')
  return `${base}music/${file}`
}

/** v56 三轮：是否为离线渲染音频曲目（rock_* 走 MP3，其余走 WebAudio 合成） */
export function isAudioSong(id: string): boolean {
  return id.startsWith('rock_')
}

// 层级/据点 → 默认曲目 id（层级 l0..l11/l601；据点按所属团体取对应曲；104=Tom 专属）
function factionOfLevel(level: number): string | null {
  for (const o of Object.values(OUTPOSTS)) if (o.levelId === level) return o.faction
  return null
}

export function defaultSongId(level: number): string {
  if (level >= 0 && level <= 11) return `l${level}`
  if (level === 12) return 'l601'
  // v56：Tom 的餐馆（104）为不属于任何团体的独立餐馆——专属曲，不走 wanderer 团体曲
  if (level === 104) return 'tom'
  const faction = factionOfLevel(level)
  if (faction) return faction
  return 'l0'
}

// ================= v56：电台（音乐库 + 电台配置） =================

export interface MusicEntry { id: string; name: string; cat: '层级' | '团体' | '乐手' | '世界' }

/** 音乐库：电台可选曲目（乐手曲目经收听解锁） */
export const MUSIC_LIBRARY: MusicEntry[] = [
  { id: 'l0', name: '大厅 · 无尽黄厅', cat: '层级' },
  { id: 'l1', name: '宜居区 · 雾中仓库', cat: '层级' },
  { id: 'l2', name: '管道之梦', cat: '层级' },
  { id: 'l3', name: '电气轰鸣', cat: '层级' },
  { id: 'l4', name: '无人办公', cat: '层级' },
  { id: 'l5', name: '空舞厅', cat: '层级' },
  { id: 'l6', name: '熄灭', cat: '层级' },
  { id: 'l7', name: '深海之下', cat: '层级' },
  { id: 'l8', name: '洞穴回响', cat: '层级' },
  { id: 'l9', name: '黄昏街道', cat: '层级' },
  { id: 'l10', name: '金色麦浪', cat: '层级' },
  { id: 'l11', name: '霓虹空城', cat: '层级' },
  { id: 'l601', name: '梦中的海', cat: '层级' },
  { id: 'meg', name: 'M.E.G. 灯塔', cat: '团体' },
  { id: 'bntg', name: 'B.N.T.G. 集市', cat: '团体' },
  { id: 'ariane', name: '阿丽亚娜 · 洁净', cat: '团体' },
  { id: 'brc', name: 'B.R.C. 施工', cat: '团体' },
  { id: 'wanderer', name: '流浪者 · 民谣', cat: '团体' },
  { id: 'jerry', name: '杰瑞的信众 · 诵咏', cat: '团体' },
  { id: 'homely', name: '家常酒店 · 门铃', cat: '团体' },
  { id: 'originals', name: '原住民 · 狐步', cat: '团体' },
  { id: 'tom', name: 'Tom 的餐馆 · 船歌', cat: '团体' },
  { id: 'rock_stones', name: '滚石风格摇滚', cat: '乐手' },
  { id: 'rock_beatles', name: '披头士风格摇滚', cat: '乐手' },
  { id: 'rock_floyd', name: '平克·弗洛伊德风格摇滚', cat: '乐手' },
  { id: 'rock_blues', name: '蓝调摇滚', cat: '乐手' },
  { id: 'rock_velvet', name: '地下丝绒风格摇滚', cat: '乐手' },
  { id: 'rock_garage', name: '车库摇滚', cat: '乐手' },
  { id: 'rock_postpunk', name: '后朋克摇滚', cat: '乐手' },
  // v56 六轮：L5 留声机 MIDI 版（近场收听后解锁）
  { id: 'phono', name: '留声机 · 诡异圆舞曲', cat: '世界' },
]

export function musicName(id: string): string {
  return MUSIC_LIBRARY.find((e) => e.id === id)?.name ?? id
}

/** 乐手摇滚曲目池（MIDI 曲风下每次随机一首） */
export const ROCK_SONG_IDS = ['rock_stones', 'rock_beatles', 'rock_floyd', 'rock_blues', 'rock_velvet', 'rock_garage', 'rock_postpunk']

export interface RadioCfg {
  mode: 'follow' | 'fixed' // 随层级变化 / 固定音乐
  fixed: string | null // 固定曲目 id
  perLevel: Record<number, string> // 单层覆盖：层 id → 曲目 id
}

let radioCfg: RadioCfg = { mode: 'follow', fixed: null, perLevel: {} }

/** 引擎同步电台配置（startBGM 解析曲目时读取） */
export function setRadioCfg(c: RadioCfg) {
  radioCfg = { mode: c.mode, fixed: c.fixed, perLevel: { ...c.perLevel } }
}

/** 按电台配置解析某层实际播放的曲目 id */
export function resolveMidiSong(level: number): string {
  if (radioCfg.mode === 'fixed' && radioCfg.fixed) return radioCfg.fixed
  const p = radioCfg.perLevel[level]
  if (p) return p
  return defaultSongId(level)
}
