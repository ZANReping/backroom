// 电台管理（v56）：MIDI 曲风下暂停页入口——随层级变化 / 固定音乐 + 单层曲目配置。
// 可选曲目 = 音乐库中已收听的曲目（层级曲目随到访解锁、团体曲目随据点解锁、
// 乐手摇滚曲目经 Tom 餐馆驻店乐手演奏解锁、留声机圆舞曲经 L5 近场收听解锁）。
// v56 六轮：内置真实音乐播放器——▶/⏸ 暂停恢复、⏮/⏭ 切曲、顺序/单曲循环/随机模式、
// 进度条与时间显示；关页面自动停止并恢复 BGM。
import { useEffect, useRef, useState } from 'react'
import { engine } from '@/game/engine'
import { audio } from '@/game/core/audio'
import { defaultSongId, MUSIC_LIBRARY, musicName } from '@/game/core/midi'
import { levelDefOf, levelLabel } from '@/game/levels'

const CATS: ('层级' | '团体' | '乐手' | '世界')[] = ['层级', '团体', '乐手', '世界']
const CAT_COLOR: Record<string, string> = { 层级: 'var(--text-dim)', 团体: 'var(--amber)', 乐手: 'var(--exit)', 世界: 'var(--exit)' }
type PlayerMode = 'seq' | 'one' | 'shuf'
const MODE_LABEL: Record<PlayerMode, string> = { seq: '顺序播放', one: '单曲循环', shuf: '随机播放' }
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default function RadioOverlay({ onClose }: { onClose: () => void }) {
  const [, tick] = useState(0)
  const refresh = () => tick((x) => x + 1)
  const heard = new Set(engine.heardSongs)
  const radio = engine.radio
  // v56 六轮：播放器状态（顺序/单曲循环/随机 + 暂停 + 进度）
  const [mode, setMode] = useState<PlayerMode>('seq')
  const [idx, setIdx] = useState(-1)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState<{ pos: number; dur: number } | null>(null)

  // 播放列表 = 已收听曲目（按音乐库顺序）
  const playlist = MUSIC_LIBRARY.filter((e) => heard.has(e.id))
  const currentId = idx >= 0 && idx < playlist.length ? playlist[idx].id : null

  // 播放一首（记录曲目并刷新播放器）
  const playAt = (i: number) => {
    const id = playlist[i]?.id
    if (!id) return
    setIdx(i)
    setPaused(false)
    audio.previewPlay(id, mode === 'one')
    audio.uiTick()
  }
  // 列表 ▶ 点击：切到该曲（按当前模式）
  const playFromList = (id: string) => {
    const i = playlist.findIndex((e) => e.id === id)
    if (i >= 0) playAt(i)
  }
  const next = () => {
    if (!playlist.length) return
    if (mode === 'shuf') {
      let n = Math.floor(Math.random() * playlist.length)
      if (n === idx && playlist.length > 1) n = (n + 1) % playlist.length
      playAt(n)
    } else {
      playAt((idx + 1) % playlist.length)
    }
  }
  const prev = () => {
    if (!playlist.length) return
    playAt((idx - 1 + playlist.length) % playlist.length)
  }
  const togglePause = () => {
    if (paused) {
      audio.previewResume()
      setPaused(false)
    } else {
      audio.previewPause()
      setPaused(true)
    }
    audio.uiTick()
  }
  const stopPlayer = () => {
    audio.stopPreview()
    setIdx(-1)
    setPaused(false)
    setProgress(null)
    audio.uiTick()
  }
  const cycleMode = () => {
    const m: PlayerMode = mode === 'seq' ? 'one' : mode === 'one' ? 'shuf' : 'seq'
    setMode(m)
    if (currentId) audio.previewPlay(currentId, m === 'one') // 换模式立即重开当前曲（调整循环）
    audio.uiTick()
  }

  // 试听自然结束 → 顺序/随机自动切下一首（单曲循环不会触发）
  const playerState = useRef({ mode, idx, playlist })
  playerState.current = { mode, idx, playlist }
  useEffect(() => {
    audio.onPreviewEnd = () => {
      const { mode: m, idx: i, playlist: pl } = playerState.current
      if (m === 'one' || !pl.length) return
      // 延迟切曲（避免在 audio 回调栈内操作播放层）
      setTimeout(() => {
        let k: number
        if (m === 'shuf') {
          k = Math.floor(Math.random() * pl.length)
          if (k === i && pl.length > 1) k = (k + 1) % pl.length
        } else {
          k = (i + 1) % pl.length
        }
        const id = pl[k]?.id
        if (id) { setIdx(k); setPaused(false); audio.previewPlay(id, false) }
      }, 60)
    }
    return () => { audio.onPreviewEnd = null }
  }, [])

  // 进度条（500ms 轮询）
  useEffect(() => {
    const t = setInterval(() => {
      const info = audio.previewInfo()
      setProgress(info ? { pos: info.pos, dur: info.dur } : null)
    }, 500)
    return () => clearInterval(t)
  }, [])

  // 层级清单：13 个主层 + 已访问据点
  const levelRows: number[] = []
  for (let i = 0; i <= 12; i++) levelRows.push(i)
  for (const id of [...engine.visitedLevels].sort((a, b) => a - b)) {
    if (id >= 100 && !levelRows.includes(id)) levelRows.push(id)
  }

  const setRadioMode = (m: 'follow' | 'fixed') => {
    engine.setRadio({ mode: m, fixed: radio.fixed, perLevel: radio.perLevel })
    audio.uiTick(); refresh()
  }
  const setFixed = (id: string | null) => {
    engine.setRadio({ mode: radio.mode, fixed: id, perLevel: radio.perLevel })
    audio.uiTick(); refresh()
  }
  const setLevelSong = (level: number, id: string) => {
    const perLevel = { ...radio.perLevel }
    if (id === '') delete perLevel[level]
    else perLevel[level] = id
    engine.setRadio({ mode: radio.mode, fixed: radio.fixed, perLevel })
    audio.uiTick(); refresh()
  }

  const close = () => {
    audio.stopPreview() // 关页面停试听并恢复 BGM
    audio.uiTick()
    onClose()
  }

  const heardOptions = () => MUSIC_LIBRARY.filter((e) => heard.has(e.id))

  // 列表行内播放按钮
  const playBtn = (id: string, compact = false) => {
    const isCur = currentId === id
    return (
      <button
        className={`${compact ? 'w-[28px]' : 'w-[30px]'} shrink-0 border px-0 py-1 text-center text-[12px]`}
        style={{ borderColor: isCur ? 'var(--exit)' : 'var(--panel-edge)', color: isCur ? 'var(--exit)' : 'var(--text-dim)' }}
        onClick={() => playFromList(id)}
        title="播放"
      >
        ▶
      </button>
    )
  }

  const pct = progress && progress.dur > 0 ? Math.min(100, (progress.pos / progress.dur) * 100) : 0

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div
        className="anim-slideUp hud-panel flex w-full max-w-[560px] flex-col p-5"
        style={{ background: 'var(--panel)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-title text-[20px]" style={{ color: 'var(--amber)' }}>电台管理</h2>
          <button className="font-mono2 border px-3 py-1 text-[13px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={close}>关闭</button>
        </div>

        {/* 模式切换 */}
        <div className="mb-2 flex gap-2">
          {([['follow', '随层级变化'], ['fixed', '固定音乐']] as const).map(([v, l]) => (
            <button
              key={v}
              className="flex-1 border px-3 py-2 text-[14px]"
              style={{ borderColor: radio.mode === v ? 'var(--amber)' : 'var(--panel-edge)', color: radio.mode === v ? 'var(--amber)' : 'var(--text-dim)', background: 'var(--panel)' }}
              onClick={() => setRadioMode(v)}
            >
              {l}
            </button>
          ))}
        </div>

        {radio.mode === 'fixed' ? (
          <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: '44dvh' }}>
            <div className="py-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
              固定播放同一首曲目（仅可选已收听；点 ▶ 播放试听）：{radio.fixed ? `当前：${musicName(radio.fixed)}` : '当前：未设置（按默认）'}
            </div>
            <button
              className="menu-btn mb-1 w-full px-3 py-1.5 text-left text-[13px]"
              style={!radio.fixed ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : undefined}
              onClick={() => setFixed(null)}
            >跟随层级默认</button>
            {CATS.map((cat) => {
              const opts = MUSIC_LIBRARY.filter((e) => e.cat === cat)
              return (
                <div key={cat}>
                  <div className="py-1 font-mono2 text-[11px]" style={{ color: CAT_COLOR[cat] }}>{cat}曲目</div>
                  {opts.map((e) => {
                    const locked = !heard.has(e.id)
                    const active = radio.fixed === e.id
                    return (
                      <div key={e.id} className="mb-0.5 flex items-center gap-1">
                        {locked ? (
                          <div className="w-[30px] shrink-0 text-center text-[12px]" style={{ color: 'var(--panel-edge)' }}>·</div>
                        ) : playBtn(e.id)}
                        <button
                          className="menu-btn w-full px-3 py-1.5 text-left text-[13px]"
                          style={active ? { borderColor: 'var(--amber)', color: 'var(--amber)' } : locked ? { opacity: 0.4 } : undefined}
                          disabled={locked}
                          onClick={() => setFixed(e.id)}
                        >
                          {e.name}{locked ? '（未收听）' : ''}{active ? ' ●' : ''}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-1" style={{ maxHeight: '44dvh' }}>
            <div className="py-1 text-[12px]" style={{ color: 'var(--text-dim)' }}>
              默认随层级播放对应曲目；可为每一层单独指定曲目（仅可选已收听）。点 ▶ 在下方播放器中收听。
            </div>
            <div className="flex flex-col gap-1">
              {levelRows.map((lv) => {
                const name = levelDefOf(lv)?.name ?? `Level ${lv}`
                const defId = defaultSongId(lv)
                const curId = radio.perLevel[lv] ?? defId
                return (
                  <div key={lv} className="flex items-center gap-2 border-b py-1" style={{ borderColor: 'var(--panel-edge)' }}>
                    {playBtn(curId, true)}
                    <div className="w-[130px] shrink-0 font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                      {lv <= 12 ? levelLabel(lv) : `${levelLabel(lv)}（${name}）`}
                    </div>
                    <select
                      className="min-w-0 flex-1 border px-2 py-1 text-[12px]"
                      style={{ borderColor: 'var(--panel-edge)', color: 'var(--text)', background: 'rgba(0,0,0,0.3)' }}
                      value={radio.perLevel[lv] ?? ''}
                      onChange={(e) => setLevelSong(lv, e.target.value)}
                    >
                      <option value="">默认（{musicName(defId)}）</option>
                      {heardOptions().filter((e) => e.id !== defId).map((e) => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                      {radio.perLevel[lv] && !heard.has(radio.perLevel[lv]) && (
                        <option value={radio.perLevel[lv]}>{musicName(radio.perLevel[lv])}</option>
                      )}
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* v56 六轮：播放器条 */}
        <div className="mt-2 border-t pt-2" style={{ borderColor: 'var(--panel-edge)' }}>
          <div className="flex items-center gap-2">
            <button className="w-[34px] border px-0 py-1 text-center text-[13px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={prev} disabled={!playlist.length} title="上一首">⏮</button>
            <button className="w-[34px] border px-0 py-1 text-center text-[13px]" style={{ borderColor: 'var(--exit)', color: 'var(--exit)' }} onClick={currentId ? togglePause : () => playAt(0)} disabled={!playlist.length} title={paused ? '继续' : '暂停'}>
              {paused ? '▶' : currentId ? '⏸' : '▶'}
            </button>
            <button className="w-[34px] border px-0 py-1 text-center text-[13px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={next} disabled={!playlist.length} title="下一首">⏭</button>
            <button className="w-[34px] border px-0 py-1 text-center text-[13px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--text-dim)' }} onClick={stopPlayer} disabled={!currentId && !paused} title="停止">■</button>
            <button className="border px-2 py-1 text-[11px]" style={{ borderColor: 'var(--panel-edge)', color: 'var(--amber)' }} onClick={cycleMode} title="播放模式">{MODE_LABEL[mode]}</button>
            <div className="min-w-0 flex-1 truncate text-right font-mono2 text-[11px]" style={{ color: 'var(--text)' }}>
              {currentId ? musicName(currentId) : '未在播放'}
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>{progress ? fmt(progress.pos) : '0:00'}</span>
            <div className="h-[4px] flex-1 overflow-hidden border" style={{ borderColor: 'var(--panel-edge)' }}>
              <div className="h-full" style={{ width: `${pct}%`, background: 'var(--exit)', transition: 'width 0.4s linear' }} />
            </div>
            <span className="font-mono2 text-[10px]" style={{ color: 'var(--text-dim)' }}>{progress ? fmt(progress.dur) : '0:00'}</span>
          </div>
        </div>

        <div className="pt-2 font-mono2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
          未收听的曲目不可选——前往对应层级/据点收听，让 Tom 餐馆的乐手演奏新曲目解锁摇滚乐，或近身聆听 L5 留声机解锁圆舞曲。播放器播放时会压低背景音乐，停止后恢复。
        </div>
      </div>
    </div>
  )
}
