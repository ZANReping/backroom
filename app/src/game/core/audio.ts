// WebAudio 程序合成音频：荧光灯嗡鸣/脚步/受击/拾取/出口/低语/UI + 每层梦核BGM
import { isAudioSong, loadMidi, musicAudioUrl, musicUrl, resolveMidiSong, type MidiNoteEv, type MidiSongParsed } from './midi'
interface BgmLayer {
  level: number
  gain: GainNode
  echo: DelayNode | null
  drones: AudioNode[]
  step: number
  nextT: number
  stepDur: number
  steps: number
  dead: boolean
}
// v56：MIDI 播放层（.mid 文件解析出的音符事件 + 循环步进）
type MidiVoice = 'piano' | 'epiano' | 'bell' | 'bass' | 'strings' | 'choir' | 'brass' | 'flute' | 'lead' | 'pad' | 'guitar'
// 危险层级（Class 3+ / 高实体密度 / 极端环境）保留较锐利的原音色；其余层级改用舒缓音色
const HARSH_LEVELS = new Set([2, 3, 6, 7, 8, 9])
function isHarshLevel(level: number): boolean { return HARSH_LEVELS.has(level) }
interface MidiLayer {
  level: number
  gain: GainNode
  echo: DelayNode | null
  song: MidiSongParsed
  noteIdx: number
  loopStart: number
  harsh: boolean
  oneshot?: boolean // v56：乐手演奏的一次性曲目（播完恢复 BGM，不循环）
  dead: boolean
}
// v56：乐手程序化摇滚层（鼓/贝斯/强力和弦步进序列，播完恢复 BGM）
interface RockLayer {
  gain: GainNode
  echo: DelayNode | null
  harsh: boolean
  step: number
  nextT: number
  stepDur: number
  total: number
  dead: boolean
}

export class GameAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private ambient: GainNode | null = null
  private sfx: GainNode | null = null
  private humOsc: OscillatorNode[] = []
  private whisperTimer = 0
  private heartTimer: ReturnType<typeof setInterval> | null = null
  private bgmBus: GainNode | null = null
  private bgmFilter: BiquadFilterNode | null = null
  private bgmLayer: BgmLayer | null = null
  private bgmTimer: ReturnType<typeof setInterval> | null = null
  private melIdx = 2 // 据点曲旋律随机漫步位置（五声音阶音级 0..4）
  // v56：MIDI BGM（可切换曲风——以音符事件序列播放，与随机程序化 BGM 并存）
  private bgmStyle: 'procedural' | 'midi' = 'procedural'
  private bgmLevel = -1 // 当前 BGM 层级（切换曲风时用它重开）
  private midiLayer: MidiLayer | null = null
  private midiTimer: ReturnType<typeof setInterval> | null = null
  private midiSongId = '' // 当前 MIDI BGM 曲目 id（电台收听记录用）
  // v56：乐手演奏（一次性曲目，播完恢复 BGM）
  private oneshot: MidiLayer | null = null
  private rockLayer: RockLayer | null = null
  // v56 三轮：离线渲染音频曲目（rock_*.mp3，FluidR3 真实音色）——循环 BGM 层与一次性演奏层
  // v56 八轮：bufLayer 支持暂停/续播（电台播放时暂停原 BGM，停止后从暂停处续播）
  private bufLayer: { gain: GainNode; src: AudioBufferSourceNode; buf: AudioBuffer; songId: string; startAt: number; offset: number; paused: boolean; dead: boolean } | null = null
  private oneshotBuf: { gain: GainNode; src: AudioBufferSourceNode; dead: boolean } | null = null
  private songBufCache = new Map<string, AudioBuffer>()
  // v56 四轮：电台试听层（电台管理页预览曲目——循环/单次播放，支持暂停恢复；试听期间暂停 BGM）
  private preview: {
    songId: string
    gain: GainNode
    src: AudioBufferSourceNode | null
    midi: MidiLayer | null
    buf: AudioBuffer | null
    loop: boolean
    startAt: number
    offset: number
    paused: boolean
    dead: boolean
  } | null = null
  // v56 八轮：电台播放期间被暂停的合成 BGM 层（缓冲层走 bufLayer.paused；合成层记增益静音）
  private radioPausedSynth: { g: GainNode; v: number }[] = []
  /** v56：曲目开始播放回调（引擎标记「已收听」→ 电台解锁；id 如 'l0'/'meg'/'rock_stones'） */
  onSongPlayed: ((id: string) => void) | null = null

  /** v56：当前 MIDI 曲风是否启用（暂停页电台管理按钮显示条件） */
  get midiEnabled(): boolean { return this.bgmStyle === 'midi' }
  /** v56：当前正在播放的曲目 id（乐手随机摇滚时避免重上一首） */
  get currentSong(): string { return this.midiSongId }
  private distort = 0 // 理智扭曲 0..1
  private uwFilter: BiquadFilterNode | null = null // v13：水下低通（全局闷化）
  private underwater = false
  // v51：L3 配电箱电流嗡鸣（定位音频：引擎按距离逐帧调音量；节点链懒创建常驻）
  private elecHumGain: GainNode | null = null
  muted = false
  volume = 0.8
  // v54：分项音量（0..1 系数，乘在各路总线的基础增益上；设置面板音频区四个滑杆）
  private ambVol = 0.5 // 环境音总线（荧光灯嗡鸣 + L4 雨声）
  private sfxVol = 0.9 // 音效总线（攻击/拾取/UI/实体叫声/电流嗡鸣/低语等全部单发音效）
  private bgmVol = 1 // 音乐总线（每层梦核 BGM）

  ensure() {
    if (this.ctx) return
    try {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      // v13：master → 水下低通 → destination（入水后所有声音闷化）
      this.uwFilter = this.ctx.createBiquadFilter()
      this.uwFilter.type = 'lowpass'
      this.uwFilter.frequency.value = 19000
      this.uwFilter.Q.value = 0.4
      this.master.connect(this.uwFilter)
      this.uwFilter.connect(this.ctx.destination)
      this.ambient = this.ctx.createGain()
      this.ambient.gain.value = 0.5 * this.ambVol
      this.ambient.connect(this.master)
      this.sfx = this.ctx.createGain()
      this.sfx.gain.value = 0.9 * this.sfxVol
      this.sfx.connect(this.master)
      // BGM 总线（经低通滤波，低理智时闷化）
      this.bgmFilter = this.ctx.createBiquadFilter()
      this.bgmFilter.type = 'lowpass'
      this.bgmFilter.frequency.value = 16000
      this.bgmBus = this.ctx.createGain()
      this.bgmBus.gain.value = 0.55 * this.bgmVol
      this.bgmBus.connect(this.bgmFilter).connect(this.master)
    } catch {
      /* 无音频环境 */
    }
  }

  resume() {
    this.ensure()
    if (this.ctx?.state === 'suspended') void this.ctx.resume()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : this.volume
  }
  setVolume(v: number) {
    this.volume = v
    if (this.master && !this.muted) this.master.gain.value = v
  }
  // v54：分项音量（v=0..1；总线基础增益 × 系数——100 = 既有默认响度）
  setAmbVolume(v: number) { this.ambVol = v; if (this.ambient) this.ambient.gain.value = 0.5 * v }
  setSfxVolume(v: number) { this.sfxVol = v; if (this.sfx) this.sfx.gain.value = 0.9 * v }
  setBgmVolume(v: number) { this.bgmVol = v; if (this.bgmBus) this.bgmBus.gain.value = 0.55 * v }

  // v56：BGM 曲风切换（procedural=随机程序化 / midi=音符序列）——切换即重开当前层级 BGM
  setBgmStyle(style: 'procedural' | 'midi') {
    if (style === this.bgmStyle) return
    this.bgmStyle = style
    if (this.bgmLevel >= 0) this.startBGM(this.bgmLevel)
  }

  // 荧光灯嗡鸣（每层音高不同）
  startHum(levelId: number) {
    this.ensure()
    if (!this.ctx || !this.ambient) return
    this.stopHum()
    const base = levelId >= 100 ? 56 : 50 + levelId * 6 // v36：据点 id≥100——别让 id 直接乘出刺耳高频哼声
    for (const [mult, gain] of [[1, 0.035], [2, 0.018], [3, 0.008]] as const) {
      const o = this.ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = base * mult
      const g = this.ctx.createGain()
      g.gain.value = gain
      o.connect(g).connect(this.ambient)
      o.start()
      this.humOsc.push(o)
    }
    // 电流噪声
    const noise = this.noiseSrc()
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = base * 4; bp.Q.value = 6
    const ng = this.ctx.createGain(); ng.gain.value = 0.012
    noise.connect(bp).connect(ng).connect(this.ambient)
    noise.start()
    this.humOsc.push(noise as unknown as OscillatorNode)
  }
  stopHum() {
    for (const o of this.humOsc) { try { o.stop() } catch { /* */ } }
    this.humOsc = []
  }

  // v54：L4 常驻雨声（永不止歇的大雨；惯例同 startHum——loadLevel 按 id===4 驱动，离层 stopRain）：
  // 低通褐噪=雨幕底噪 + 带通白噪=雨打密响（慢 LFO 起伏）+ 高通嘶声，全程序合成
  private rainNodes: (OscillatorNode | AudioBufferSourceNode)[] = []
  startRain() {
    this.ensure()
    if (!this.ctx || !this.ambient) return
    this.stopRain()
    // 雨幕底噪（低通 500Hz，沉闷连绵）
    const n1 = this.noiseSrc()
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500
    const g1 = this.ctx.createGain(); g1.gain.value = 0.05
    n1.connect(lp).connect(g1).connect(this.ambient); n1.start()
    // 雨打密响（带通 2.4kHz，LFO 0.09Hz 慢起伏——雨势忽大忽小）
    const n2 = this.noiseSrc()
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6
    const g2 = this.ctx.createGain(); g2.gain.value = 0.028
    const lfo = this.ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.09
    const lg = this.ctx.createGain(); lg.gain.value = 0.012
    lfo.connect(lg).connect(g2.gain); lfo.start()
    n2.connect(bp).connect(g2).connect(this.ambient); n2.start()
    // 雨尖嘶声（高通 5kHz，极轻——雨点打在窗玻璃上的高频质感）
    const n3 = this.noiseSrc()
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000
    const g3 = this.ctx.createGain(); g3.gain.value = 0.008
    n3.connect(hp).connect(g3).connect(this.ambient); n3.start()
    this.rainNodes = [n1, n2, n3, lfo]
  }
  stopRain() {
    for (const n of this.rainNodes) { try { n.stop() } catch { /* */ } }
    this.rainNodes = []
  }

  // v51：配电箱电流嗡鸣（L3 定位音频惯例——无定位音频系统，引擎按距离逐帧 setElecHum(vol)）
  // vol 0=静默；节点链（100Hz 正弦 + 200Hz 谐波 + ~3kHz 带通电流噪）懒创建后常驻，只调音量
  setElecHum(vol: number) {
    if (!this.ctx || !this.sfx) return // AudioContext 未解锁前安全空转
    if (!this.elecHumGain) {
      const g = this.ctx.createGain()
      g.gain.value = 0
      g.connect(this.sfx)
      const o1 = this.ctx.createOscillator()
      o1.type = 'sine'; o1.frequency.value = 100
      const g1 = this.ctx.createGain(); g1.gain.value = 1
      o1.connect(g1).connect(g); o1.start()
      const o2 = this.ctx.createOscillator() // 二次谐波（更弱的电气泛音）
      o2.type = 'sine'; o2.frequency.value = 200
      const g2 = this.ctx.createGain(); g2.gain.value = 0.35
      o2.connect(g2).connect(g); o2.start()
      const n = this.noiseSrc() // 电流噼啪（带通噪声）
      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = 3000; bp.Q.value = 4
      const gn = this.ctx.createGain(); gn.gain.value = 0.18
      n.connect(bp).connect(gn).connect(g); n.start()
      this.elecHumGain = g // 振荡器/噪声节点由音频图持有常驻，只调增益
    }
    this.elecHumGain.gain.setTargetAtTime(Math.min(1, vol) * 0.13, this.ctx.currentTime, 0.1)
  }

  // v55：留声机诡异古典乐（L5 休息室——八音盒音色小调圆舞曲，略失谐 = 老旧唱机走调；
  // 惯例同 setElecHum：无定位音频系统，引擎按最近播放中留声机距离逐帧 setPhono(vol)；
  // 近场淡入留声机并压低 BGM（闪避），远场/离层恢复——节点链懒创建后常驻，只调增益与调度）
  private phonoGain: GainNode | null = null
  private phonoTimer: ReturnType<typeof setInterval> | null = null
  private phonoNext = 0
  private phonoStep = 0
  // v56 六轮：MIDI 曲风下留声机播放渲染版圆舞曲（phono.mp3 循环，距离衰减）
  private phonoBuf: { src: AudioBufferSourceNode; gain: GainNode } | null = null
  setPhono(vol: number) {
    if (!this.ctx || !this.bgmBus) return
    if (this.midiEnabled) {
      this.setPhonoBuf(vol)
      return
    }
    if (!this.phonoGain) {
      const g = this.ctx.createGain()
      g.gain.value = 0
      g.connect(this.bgmBus)
      // 老旧唱片底噪（带通噪声细沙声，常驻）
      const n = this.noiseSrc()
      const bp = this.ctx.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.8
      const gn = this.ctx.createGain(); gn.gain.value = 0.05
      n.connect(bp).connect(gn).connect(g); n.start()
      this.phonoGain = g
      this.phonoNext = this.ctx.currentTime + 0.1
      if (!this.phonoTimer) this.phonoTimer = setInterval(() => this.schedulePhono(), 110)
    }
    this.phonoGain.gain.setTargetAtTime(Math.min(1, vol) * 0.42, this.ctx.currentTime, 0.12)
    this.duckBgm(vol)
  }

  /** v56 六轮：渲染版留声机圆舞曲（MIDI 曲风）——近场开始播放即记收听（存入电台） */
  private setPhonoBuf(vol: number) {
    if (!this.ctx || !this.bgmBus) return
    if (vol > 0.02 && !this.phonoBuf) {
      void this.loadSongBuf('phono').then((buf) => {
        if (!this.ctx || !this.bgmBus) return
        const src = this.ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        const g = this.ctx.createGain()
        g.gain.setValueAtTime(0, this.ctx.currentTime)
        g.gain.setTargetAtTime(0.42, this.ctx.currentTime, 0.5)
        src.connect(g)
        g.connect(this.bgmBus)
        src.start()
        this.phonoBuf = { src, gain: g }
        this.onSongPlayed?.('phono') // v56 六轮：收听留声机 MIDI 版 → 电台解锁
      })
      return
    }
    if (this.phonoBuf) {
      if (vol <= 0.02) {
        const pb = this.phonoBuf
        this.phonoBuf = null
        pb.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4)
        try { pb.src.stop(this.ctx.currentTime + 1.6) } catch { /* */ }
      } else {
        this.phonoBuf.gain.gain.setTargetAtTime(Math.min(1, vol) * 0.42, this.ctx.currentTime, 0.12)
      }
    }
    this.duckBgm(vol)
  }

  // v56 六轮：留声机近场闪避 BGM（vol=0 即恢复；两种留声机共用）
  private duckBgm(vol: number) {
    if (!this.ctx) return
    const ctk = this.ctx.currentTime
    const duck = (g: GainNode | null) => { if (g) g.gain.setTargetAtTime(0.9 * (1 - Math.min(1, vol) * 0.75), ctk, 0.3) }
    if (this.bgmLayer && !this.bgmLayer.dead) duck(this.bgmLayer.gain)
    if (this.midiLayer && !this.midiLayer.dead) duck(this.midiLayer.gain)
    if (this.bufLayer && !this.bufLayer.dead) duck(this.bufLayer.gain)
  }
  // 小调圆舞曲旋律（A 小调 3/4；每步一个八分音符，lookahead 调度；失谐量按步微漂=走调唱机）
  private schedulePhono() {
    const ctx = this.ctx
    if (!ctx || !this.phonoGain) return
    // A 小调圆舞曲：低音-和声-和声的 3/4 摆动 + 阴森旋律线（半音倚音 + 颤音感失谐）
    const BASS = [110.0, 110.0, 98.0, 110.0, 87.31, 98.0] // A2 A2 G2 A2 F2 G2
    const MEL = [440, 523.25, 493.88, 440, 415.3, 440, 659.25, 523.25, 493.88, 466.16, 440, 392] // A4 C5 B4 A4 G#4 A4 E5 C5 B4 A#4(!) A4 G4
    while (this.phonoNext < ctx.currentTime + 0.35) {
      const i = this.phonoStep % 12, bar = Math.floor(this.phonoStep / 12) % 6
      const detune = (Math.sin(this.phonoStep * 0.7) * 14) + 9 // 持续偏快 ~9 音分 + 摆动（老旧唱机）
      const t = this.phonoNext
      const note = (f: number, d: number, g: number, type: OscillatorType) => {
        const o = ctx.createOscillator()
        o.type = type; o.frequency.value = f; o.detune.value = detune
        const gn = ctx.createGain()
        gn.gain.setValueAtTime(0, t)
        gn.gain.linearRampToValueAtTime(g, t + 0.012)
        gn.gain.exponentialRampToValueAtTime(0.0004, t + d) // 八音盒短衰减
        o.connect(gn).connect(this.phonoGain!)
        o.start(t); o.stop(t + d + 0.05)
      }
      if (i % 4 === 0) note(BASS[bar], 0.5, 0.5, 'triangle') // 低音节拍（3/4 的第一拍感）
      note(MEL[i], 0.62, i % 4 === 0 ? 0.34 : 0.22, 'sine') // 旋律
      note(MEL[i] * 2.003, 0.4, 0.05, 'sine') // 高八度泛音（八音盒钢片感，微失谐）
      this.phonoNext += 0.21
      this.phonoStep++
    }
  }

  private noiseBuf(): AudioBuffer {
    const ctx = this.ctx!
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return buf
  }
  private noiseSrc(): AudioBufferSourceNode {
    const s = this.ctx!.createBufferSource()
    s.buffer = this.noiseBuf()
    s.loop = true
    return s
  }

  // 脚步声（按地面类型滤波）
  footstep(floor: 'carpet' | 'concrete' | 'metal') {
    if (!this.ctx || !this.sfx) return
    const n = this.noiseSrc()
    const f = this.ctx.createBiquadFilter()
    const g = this.ctx.createGain()
    if (floor === 'carpet') { f.type = 'lowpass'; f.frequency.value = 400 }
    else if (floor === 'concrete') { f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2 }
    else { f.type = 'highpass'; f.frequency.value = 1800 }
    g.gain.setValueAtTime(0.12, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09)
    n.connect(f).connect(g).connect(this.sfx)
    n.start(); n.stop(this.ctx.currentTime + 0.1)
  }

  hurt() {
    if (!this.ctx || !this.sfx) return
    const o = this.ctx.createOscillator()
    o.type = 'sine'; o.frequency.setValueAtTime(120, this.ctx.currentTime)
    o.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.25)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.35, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3)
    o.connect(g).connect(this.sfx); o.start(); o.stop(this.ctx.currentTime + 0.32)
  }

  // ---- v13：液体音效 ----
  // 入水扑通：低频噪声轰 + 高频水花嘶声
  splash(intensity = 1) {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const n = this.noiseSrc()
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.4 * intensity, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
    n.connect(lp).connect(g).connect(this.sfx); n.start(); n.stop(t + 0.38)
    const n2 = this.noiseSrc()
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400
    const g2 = this.ctx.createGain()
    g2.gain.setValueAtTime(0.12 * intensity, t + 0.02)
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.28)
    n2.connect(hp).connect(g2).connect(this.sfx); n2.start(); n2.stop(t + 0.3)
  }

  // 划水：短促的中频水花搅动
  swim() {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const n = this.noiseSrc()
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.2
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.1, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22)
    n.connect(bp).connect(g).connect(this.sfx); n.start(); n.stop(t + 0.24)
  }

  // 水下环境低通滤波（全局闷化；出水恢复）
  setUnderwater(on: boolean) {
    if (on === this.underwater) return
    this.underwater = on
    if (!this.ctx || !this.uwFilter) return
    this.uwFilter.frequency.setTargetAtTime(on ? 620 : 19000, this.ctx.currentTime, 0.08)
  }

  pickup(isTape = false) {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    o.type = 'triangle'
    o.frequency.setValueAtTime(isTape ? 440 : 520, t)
    o.frequency.setValueAtTime(isTape ? 660 : 700, t + 0.07)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.14, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
    o.connect(g).connect(this.sfx); o.start(); o.stop(t + 0.2)
    if (isTape) {
      const n = this.noiseSrc()
      const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000
      const ng = this.ctx.createGain()
      ng.gain.setValueAtTime(0.05, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
      n.connect(hp).connect(ng).connect(this.sfx); n.start(); n.stop(t + 0.42)
    }
  }

  aggro() {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    for (const fq of [220, 233, 311]) {
      const o = this.ctx.createOscillator()
      o.type = 'sawtooth'; o.frequency.value = fq
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(0.05, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
      o.connect(g).connect(this.sfx); o.start(); o.stop(t + 0.42)
    }
  }

  // 双音钟声（一次性，用于据点抵达切入等过场；旧的「每 2.2s 出口提示音」循环播放已删除——太刺耳）
  exitChime(dist: number) {
    if (!this.ctx || !this.sfx || dist > 8) return
    const t = this.ctx.currentTime
    const vol = Math.max(0.005, 0.08 * (1 - dist / 8))
    for (const fq of [523.25, 659.25]) {
      const o = this.ctx.createOscillator()
      o.type = 'sine'; o.frequency.value = fq
      const g = this.ctx.createGain()
      g.gain.setValueAtTime(vol, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5)
      o.connect(g).connect(this.sfx); o.start(); o.stop(t + 0.52)
    }
  }

  whisper(vol = 1) {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const n = this.noiseSrc()
    const bp = this.ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.Q.value = 8
    bp.frequency.setValueAtTime(600 + Math.random() * 800, t)
    bp.frequency.exponentialRampToValueAtTime(300, t + 0.7)
    const pan = this.ctx.createStereoPanner()
    pan.pan.value = Math.random() * 2 - 1
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.05 * vol, t + 0.3)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.8)
    n.connect(bp).connect(pan).connect(g).connect(this.sfx)
    n.start(); n.stop(t + 0.85)
  }

  /** L6 苔原的低概率幻听：极远风声或两三声无法定位的鸟鸣。 */
  tundraHallucination(bird = false) {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const pan = this.ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.8 - 0.9
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t)
    if (bird) {
      g.gain.exponentialRampToValueAtTime(0.012, t + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8)
      for (const [i, fq] of [1480, 1820, 1320].entries()) {
        const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(fq, t + i * 0.42); o.frequency.exponentialRampToValueAtTime(fq * 1.18, t + i * 0.42 + 0.16)
        o.connect(pan); o.start(t + i * 0.42); o.stop(t + i * 0.42 + 0.24)
      }
      pan.connect(g).connect(this.sfx)
    } else {
      const n = this.noiseSrc(), lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 430
      g.gain.exponentialRampToValueAtTime(0.018, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2)
      n.connect(lp).connect(pan).connect(g).connect(this.sfx); n.start(t); n.stop(t + 4.3)
    }
  }

  swing() {
    if (!this.ctx || !this.sfx) return
    const n = this.noiseSrc()
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'; f.Q.value = 1.5
    f.frequency.setValueAtTime(300, this.ctx.currentTime)
    f.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.12)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.08, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.14)
    n.connect(f).connect(g).connect(this.sfx)
    n.start(); n.stop(this.ctx.currentTime + 0.15)
  }

  hit() {
    if (!this.ctx || !this.sfx) return
    const o = this.ctx.createOscillator()
    o.type = 'square'; o.frequency.value = 90
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.2, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12)
    o.connect(g).connect(this.sfx); o.start(); o.stop(this.ctx.currentTime + 0.13)
  }

  // 胃部咕噜声（饥饿）
  stomach() {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const o = this.ctx.createOscillator()
    o.type = 'sine'
    o.frequency.setValueAtTime(70, t)
    o.frequency.linearRampToValueAtTime(45, t + 0.35)
    o.frequency.linearRampToValueAtTime(60, t + 0.5)
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.1)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
    o.connect(g).connect(this.sfx); o.start(); o.stop(t + 0.6)
  }

  // 电火花（电弧体脉冲）
  spark() {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const n = this.noiseSrc()
    const f = this.ctx.createBiquadFilter()
    f.type = 'highpass'; f.frequency.value = 3500
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    n.connect(f).connect(g).connect(this.sfx)
    n.start(); n.stop(t + 0.22)
    const o = this.ctx.createOscillator()
    o.type = 'sawtooth'; o.frequency.setValueAtTime(1800, t)
    o.frequency.exponentialRampToValueAtTime(200, t + 0.18)
    const og = this.ctx.createGain()
    og.gain.setValueAtTime(0.08, t)
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
    o.connect(og).connect(this.sfx); o.start(); o.stop(t + 0.22)
  }

  // 容器搜索翻找声（单次刮擦）
  searchTick() {
    if (!this.ctx || !this.sfx) return
    const t = this.ctx.currentTime
    const n = this.noiseSrc()
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.value = 400 + Math.random() * 900; f.Q.value = 1.2
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.07, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    n.connect(f).connect(g).connect(this.sfx)
    n.start(); n.stop(t + 0.13)
  }
  searchStart() { this.searchTick(); this.searchTick() }
  searchDone() { this.pickup(false) }

  // 穿墙实体的刺耳沙沙声（钝人行动；vol 按距离衰减）
  scrape(vol: number) {
    if (!this.ctx || !this.sfx || vol <= 0.01) return
    const t = this.ctx.currentTime
    const n = this.noiseSrc()
    const f = this.ctx.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.setValueAtTime(900 + Math.random() * 600, t)
    f.frequency.linearRampToValueAtTime(500 + Math.random() * 300, t + 0.5)
    f.Q.value = 2.5
    const g = this.ctx.createGain()
    const v = 0.1 * vol
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(v, t + 0.08)
    g.gain.setValueAtTime(v, t + 0.3)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.55)
    // 颤动：让沙沙声有「刮擦-停顿-刮擦」的不规则节奏
    const lfo = this.ctx.createOscillator()
    lfo.type = 'square'; lfo.frequency.value = 7 + Math.random() * 4
    const lg = this.ctx.createGain(); lg.gain.value = v * 0.6
    lfo.connect(lg).connect(g.gain)
    n.connect(f).connect(g).connect(this.sfx)
    n.start(); n.stop(t + 0.6)
    lfo.start(); lfo.stop(t + 0.6)
  }

  uiTick() {
    if (!this.ctx || !this.sfx) return
    const o = this.ctx.createOscillator()
    o.type = 'square'; o.frequency.value = 1200
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.03, this.ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.03)
    o.connect(g).connect(this.sfx); o.start(); o.stop(this.ctx.currentTime + 0.04)
  }

  // 心跳（HP<30）
  setHeartbeat(on: boolean, rate: number) {
    if (on && !this.heartTimer) {
      const beat = () => {
        this.hurt()
        this.heartTimer = setTimeout(beat, rate)
      }
      this.heartTimer = setTimeout(beat, rate)
    } else if (!on && this.heartTimer) {
      clearTimeout(this.heartTimer)
      this.heartTimer = null
    }
  }
  updateHeartbeat(hp: number) {
    if (hp < 30 && hp > 0) this.setHeartbeat(true, 400 + (hp / 30) * 500)
    else this.setHeartbeat(false, 0)
  }

  // 低理智低语调度（≤20 更频繁更响）
  updateWhispers(dt: number, sanity: number) {
    if (sanity >= 40) return
    this.whisperTimer -= dt
    if (this.whisperTimer <= 0) {
      this.whisper(sanity <= 20 ? 2.2 : 1)
      this.whisperTimer = (sanity <= 20 ? 1.2 : 2) + Math.random() * 4
    }
  }

  // ================= 每层梦核 BGM（lookahead 调度 + 交叉淡入淡出）=================

  setSanityDistort(sanity: number) {
    this.distort = Math.max(0, 1 - sanity / 55)
    if (this.bgmFilter && this.ctx) {
      this.bgmFilter.frequency.setTargetAtTime(16000 - this.distort * 13500, this.ctx.currentTime, 0.4)
    }
  }

  startBGM(level: number) {
    this.ensure()
    if (!this.ctx || !this.bgmBus) return
    this.bgmLevel = level
    this.killOneshot() // v56：切层/换曲时终止乐手演奏（引擎清除演奏标记）
    // v56：MIDI 曲风——直接加载播放 .mid 文件（与程序化层互斥，切换时先淡出对方）
    if (this.bgmStyle === 'midi') {
      this.startMidiBGM(level)
      return
    }
    // 程序化曲风：淡出 MIDI 层后走 drone 随机层
    this.fadeMidiLayer(this.ctx.currentTime, 0.8, 3200)
    this.startProcedural(level)
  }

  stopBGM() {
    const t = this.ctx ? this.ctx.currentTime : 0
    this.bgmLevel = -1
    if (this.bgmLayer && this.ctx) {
      const old = this.bgmLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, t, 0.5)
      setTimeout(() => { for (const n of old.drones) { try { (n as OscillatorNode).stop() } catch { /* */ } } }, 2200)
      this.bgmLayer = null
    }
    // v56：同时停止 MIDI 层
    this.fadeMidiLayer(t, 0.5, 2200)
    this.midiLayer = null
    // v56 八轮：停掉渲染音频 BGM 层与乐手演奏/电台试听（退回标题不再有残留音乐）
    if (this.bufLayer) {
      const bl = this.bufLayer
      bl.dead = true
      bl.gain.gain.setTargetAtTime(0, t, 0.5)
      try { bl.src.stop(t + 2.0) } catch { /* */ }
      this.bufLayer = null
    }
    this.stopPreview(false)
    this.radioPausedSynth = []
    if (this.oneshotBuf) {
      const ob = this.oneshotBuf
      ob.dead = true
      ob.gain.gain.setTargetAtTime(0, t, 0.4)
      try { ob.src.stop(t + 1.2) } catch { /* */ }
      this.oneshotBuf = null
    }
    if (this.oneshot) {
      const o = this.oneshot
      o.dead = true
      o.gain.gain.setTargetAtTime(0, t, 0.4)
      setTimeout(() => { o.gain.disconnect() }, 1200)
      this.oneshot = null
    }
  }

  // ================= v56：MIDI BGM 播放器（音符事件序列合成） =================

  private startMidiBGM(level: number) {
    if (!this.ctx || !this.bgmBus) return
    // v56：电台配置解析（随层级/单层覆盖/固定曲目）
    const songId = resolveMidiSong(level)
    // v56 五轮：全部曲目优先走渲染音频（FluidR3 真实音色）；加载失败回退 WebAudio 合成
    this.startBufferBGM(songId, level)
  }

  /** v56 三轮：加载并解码渲染音频（MP3 → AudioBuffer，模块级缓存） */
  private loadSongBuf(songId: string): Promise<AudioBuffer> {
    const cached = this.songBufCache.get(songId)
    if (cached) return Promise.resolve(cached)
    return fetch(musicAudioUrl(songId)).then((res) => {
      if (!res.ok) throw new Error(`loadSongBuf ${songId}: ${res.status}`)
      return res.arrayBuffer()
    }).then((ab) => {
      if (!this.ctx) throw new Error('no audio context')
      return this.ctx.decodeAudioData(ab)
    }).then((buf) => {
      this.songBufCache.set(songId, buf)
      return buf
    })
  }

  /** v56 五轮：渲染音频循环 BGM（全部曲目；加载失败回退合成器） */
  private startBufferBGM(songId: string, level: number) {
    if (!this.ctx || !this.bgmBus) return
    if (this.bufLayer && this.bufLayer.songId === songId && !this.bufLayer.dead) return
    void this.loadSongBuf(songId).then((buf) => {
      if (!this.ctx || !this.bgmBus || this.bgmStyle !== 'midi') return
      if (this.bufLayer && this.bufLayer.songId === songId && !this.bufLayer.dead) return
      const t = this.ctx.currentTime
      // 淡出其他层（程序化 / MIDI 合成 / 旧音频层）
      if (this.bufLayer && !this.bufLayer.dead) {
        const old = this.bufLayer
        old.dead = true
        old.gain.gain.setTargetAtTime(0, t, 0.6)
        try { old.src.stop(t + 2.6) } catch { /* */ }
      }
      if (this.bgmLayer && !this.bgmLayer.dead) {
        const old = this.bgmLayer
        old.dead = true
        old.gain.gain.setTargetAtTime(0, t, 0.8)
        setTimeout(() => { for (const n of old.drones) { try { (n as OscillatorNode).stop() } catch { /* */ } } }, 3200)
      }
      this.fadeMidiLayer(t, 0.8, 3200)
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.setTargetAtTime(0.9, t, 1.0)
      src.connect(gain)
      gain.connect(this.bgmBus)
      src.start()
      this.bufLayer = { gain, src, buf, songId, startAt: t, offset: 0, paused: false, dead: false }
      this.midiSongId = songId
      this.onSongPlayed?.(songId)
    }).catch((e) => {
      console.warn(`[audio] 加载渲染音频失败: ${songId}，回退 WebAudio 合成`, e)
      if (this.bgmStyle === 'midi') this.startMidiSynth(songId, level)
    })
  }

  /** WebAudio 合成 MIDI 播放（渲染音频缺失时的回退） */
  private startMidiSynth(songId: string, level: number) {
    if (!this.ctx || !this.bgmBus) return
    if (this.midiLayer && this.midiLayer.level === level && !this.midiLayer.dead && this.midiSongId === songId) return
    const url = musicUrl(songId)
    void loadMidi(url).then((song) => {
      if (this.bgmStyle !== 'midi' || this.bgmLevel !== level) return // 曲风/层级已切换，丢弃
      this.playMidiLayer(song, level, songId)
    }).catch(() => {
      // .mid 加载失败回退程序化 BGM（保持可玩）
      if (this.bgmStyle === 'midi' && this.bgmLevel === level) {
        console.warn(`[audio] 加载 ${url} 失败，回退程序化 BGM`)
        this.startProcedural(level)
      }
    })
  }

  /** v56 三轮：渲染音频一次性播放（乐手演奏；播完恢复 BGM） */
  private playBufferOnce(songId: string) {
    if (!this.ctx || !this.bgmBus) return
    this.stopBgmLayersForOneshot()
    void this.loadSongBuf(songId).then((buf) => {
      if (!this.ctx || !this.bgmBus) return
      const t = this.ctx.currentTime
      if (this.oneshotBuf && !this.oneshotBuf.dead) {
        const old = this.oneshotBuf
        old.dead = true
        old.gain.gain.setTargetAtTime(0, t, 0.4)
        try { old.src.stop(t + 1.2) } catch { /* */ }
      }
      if (this.oneshot && !this.oneshot.dead) {
        const old = this.oneshot
        old.dead = true
        old.gain.gain.setTargetAtTime(0, t, 0.4)
        setTimeout(() => { old.gain.disconnect() }, 1200)
      }
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = false
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.setTargetAtTime(0.95, t, 0.4)
      src.connect(gain)
      gain.connect(this.bgmBus)
      src.onended = () => {
        if (this.oneshotBuf?.src === src) this.oneshotBuf = null
        this.finishMusician()
      }
      src.start()
      this.oneshotBuf = { gain, src, dead: false }
      this.onSongPlayed?.(songId) // v56：收听记录 → 电台解锁
    }).catch(() => {
      console.warn(`[audio] 乐手曲目加载失败: ${songId}`)
      this.finishMusician()
    })
  }

  private playMidiLayer(song: MidiSongParsed, level: number, songId: string) {
    if (!this.ctx || !this.bgmBus) return
    const t = this.ctx.currentTime
    // 淡出程序化层（若正在播）
    if (this.bgmLayer && !this.bgmLayer.dead) {
      const old = this.bgmLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, t, 0.8)
      setTimeout(() => { for (const n of old.drones) { try { (n as OscillatorNode).stop() } catch { /* */ } } }, 3200)
    }
    this.fadeMidiLayer(t, 0.8, 3200)
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.setTargetAtTime(0.9, t, 1.0)
    gain.connect(this.bgmBus)
    const echo = this.ctx.createDelay(1)
    echo.delayTime.value = 0.28
    const fb = this.ctx.createGain(); fb.gain.value = 0.32
    const wet = this.ctx.createGain(); wet.gain.value = 0.42
    echo.connect(fb).connect(echo)
    echo.connect(wet).connect(gain)
    this.midiLayer = { level, gain, echo, song, noteIdx: 0, loopStart: t + 0.15, harsh: isHarshLevel(level), dead: false }
    this.midiSongId = songId
    this.onSongPlayed?.(songId) // v56：电台收听记录
    if (!this.midiTimer) this.midiTimer = setInterval(() => this.scheduleMidi(), 80)
  }

  private fadeMidiLayer(t: number, tau: number, delay: number) {
    if (this.midiLayer && !this.midiLayer.dead) {
      const old = this.midiLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, t, tau)
      setTimeout(() => { old.gain.disconnect() }, delay)
    }
  }

  // 程序化 BGM 启动（供 MIDI 加载失败回退复用——不分支曲风）
  private startProcedural(level: number) {
    this.ensure()
    if (!this.ctx || !this.bgmBus) return
    if (this.bgmLayer && this.bgmLayer.level === level && !this.bgmLayer.dead) return
    const t = this.ctx.currentTime
    // 旧层淡出 2.5s
    if (this.bgmLayer && !this.bgmLayer.dead) {
      const old = this.bgmLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, t, 0.8)
      setTimeout(() => { for (const n of old.drones) { try { (n as OscillatorNode).stop() } catch { /* */ } } }, 3200)
    }
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.setTargetAtTime(0.9, t, 1.0)
    gain.connect(this.bgmBus)
    const echo = this.ctx.createDelay(1)
    echo.delayTime.value = 0.31
    const fb = this.ctx.createGain(); fb.gain.value = 0.35
    const wet = this.ctx.createGain(); wet.gain.value = 0.4
    echo.connect(fb).connect(echo)
    echo.connect(wet).connect(gain)
    const layer: BgmLayer = {
      level, gain, echo,
      drones: [], step: 0,
      nextT: t + 0.1,
      stepDur: level >= 100 ? 0.62 : [0.5, 0.6, 0.42, 0.24, 0.7, 0.62][level] ?? 0.5,
      steps: [16, 16, 16, 16, 12, 12][level] ?? 16,
      dead: false,
    }
    this.buildDrones(layer)
    this.bgmLayer = layer
    if (!this.bgmTimer) this.bgmTimer = setInterval(() => this.scheduleBGM(), 90)
  }

  private scheduleMidi() {
    if (!this.ctx) return
    const ahead = this.ctx.currentTime + 0.6
    // 主 BGM 层 / 一次性演奏层 / 电台试听层
    for (const L of [this.midiLayer, this.oneshot, this.preview?.midi ?? null]) {
      if (!L || L.dead || L.song.notes.length === 0) continue
      let guard = 0
      while (guard++ < 256) {
        const n = L.song.notes[L.noteIdx]
        const at = L.loopStart + n.t
        if (at >= ahead) break
        if (at + 0.001 >= this.ctx.currentTime) this.playMidiNote(n, at, L)
        L.noteIdx++
        if (L.noteIdx >= L.song.notes.length) {
          if (L.oneshot) {
            // v56：一次性演奏完毕——淡出并恢复 BGM
            L.dead = true
            L.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.9)
            setTimeout(() => { L.gain.disconnect(); if (this.oneshot === L) this.oneshot = null }, 2200)
            this.finishMusician()
            break
          }
          L.noteIdx = 0
          L.loopStart += L.song.duration
        }
      }
    }
    // 乐手程序化摇滚层
    const R = this.rockLayer
    if (R && !R.dead) {
      let guard = 0
      while (R.nextT < ahead && guard++ < 256) {
        this.tickRock(R, R.step, R.nextT)
        R.step++
        R.nextT += R.stepDur
        if (R.step >= R.total) {
          R.dead = true
          R.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.9)
          setTimeout(() => { R.gain.disconnect(); if (this.rockLayer === R) this.rockLayer = null }, 2200)
          this.finishMusician()
          break
        }
      }
    }
  }

  // v56：乐手演奏结束——恢复背景音乐 + 通知引擎（清除演奏标记）
  private finishMusician() {
    this.onOneshotEnd?.()
    this.resumeBgm()
  }

  // v56：乐手演奏结束——恢复背景音乐
  private resumeBgm() {
    const lv = this.bgmLevel
    if (lv >= 0) this.startBGM(lv)
  }

  // ================= v56：乐手演奏（一次性曲目，播完恢复 BGM） =================

  /** v56：演奏结束/被停止回调（引擎清除 joeyPlaying 标记） */
  onOneshotEnd: (() => void) | null = null

  /** v56：停止乐手演奏（玩家对话要求停下）——淡出一次性曲目并恢复 BGM */
  stopMusician() {
    if (!this.ctx) { this.onOneshotEnd?.(); return }
    const t = this.ctx.currentTime
    const fade = (L: { gain: GainNode; dead: boolean } | null, clear: () => void) => {
      if (L && !L.dead) {
        L.dead = true
        L.gain.gain.setTargetAtTime(0, t, 0.35)
        setTimeout(() => { L.gain.disconnect(); clear() }, 1000)
      }
    }
    fade(this.oneshot, () => { if (this.oneshot) this.oneshot = null })
    fade(this.rockLayer, () => { if (this.rockLayer) this.rockLayer = null })
    // v56 三轮：渲染音频一次性演奏层
    if (this.oneshotBuf && !this.oneshotBuf.dead) {
      const ob = this.oneshotBuf
      ob.dead = true
      ob.gain.gain.setTargetAtTime(0, t, 0.3)
      try { ob.src.stop(t + 0.9) } catch { /* */ }
      this.oneshotBuf = null
    }
    this.finishMusician()
  }

  /** v56：切层/停止 BGM 时静默终止乐手演奏（不恢复 BGM——调用方正在起新的） */
  private killOneshot() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    const fade = (L: { gain: GainNode; dead: boolean } | null, clear: () => void) => {
      if (L && !L.dead) {
        L.dead = true
        L.gain.gain.setTargetAtTime(0, t, 0.35)
        setTimeout(() => { L.gain.disconnect(); clear() }, 1000)
      }
    }
    fade(this.oneshot, () => { if (this.oneshot) this.oneshot = null })
    fade(this.rockLayer, () => { if (this.rockLayer) this.rockLayer = null })
    if (this.oneshotBuf && !this.oneshotBuf.dead) {
      const ob = this.oneshotBuf
      ob.dead = true
      ob.gain.gain.setTargetAtTime(0, t, 0.3)
      try { ob.src.stop(t + 0.9) } catch { /* */ }
      this.oneshotBuf = null
    }
    // v56 三轮：渲染音频循环 BGM 层（rock_* 固定音乐）随切层终止
    if (this.bufLayer && !this.bufLayer.dead) {
      const bl = this.bufLayer
      bl.dead = true
      bl.gain.gain.setTargetAtTime(0, t, 0.4)
      try { bl.src.stop(t + 1.4) } catch { /* */ }
      this.bufLayer = null
    }
    // v56 四轮：电台试听层随切层/停止 BGM 终止（不回听，BGM 层正被换新）
    if (this.preview && !this.preview.dead) {
      const pv = this.preview
      pv.dead = true
      pv.gain.gain.setTargetAtTime(0, t, 0.3)
      if (pv.src) { try { pv.src.stop(t + 1.0) } catch { /* */ } }
      setTimeout(() => { pv.gain.disconnect(); if (this.preview === pv) this.preview = null }, 1100)
    }
    this.radioPausedSynth = [] // v56 八轮：切层即丢弃电台暂停记录（BGM 层正被换新）
    this.onOneshotEnd?.()
  }

  /** v56：暂停游戏时挂起全部音频（乐手演奏/BGM/环境音一起暂停） */
  suspendAll() {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend()
  }
  /** v56：恢复暂停的音频 */
  resumeAll() {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume()
  }

  // ================= v56 四轮：电台试听 / 六轮：电台播放器 =================

  /** v56 六轮：试听结束回调（非循环播放自然播完——电台播放器顺序/随机模式自动切下一首） */
  onPreviewEnd: (() => void) | null = null

  /** 电台试听：播放一首曲目（loop=true 循环试听 / false 播一遍；v56 八轮：播放期间暂停原 BGM） */
  previewPlay(songId: string, loop = true) {
    if (!this.ctx || !this.bgmBus) return
    this.stopPreview(false) // 停旧试听（不恢复 BGM——马上接着播）
    this.pauseBgmForRadio() // v56 八轮：暂停原 BGM（缓冲层记位停止/合成层静音）
    void this.loadSongBuf(songId).then((buf) => {
      if (!this.ctx || !this.bgmBus) return
      const t2 = this.ctx.currentTime
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, t2)
      gain.gain.setTargetAtTime(0.9, t2, 0.4)
      gain.connect(this.bgmBus)
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = loop
      src.connect(gain)
      src.onended = () => {
        if (this.preview && this.preview.src === src && !this.preview.paused && !this.preview.dead && !loop) {
          this.preview.dead = true
          this.onPreviewEnd?.()
        }
      }
      src.start()
      this.preview = { songId, gain, src, midi: null, buf, loop, startAt: t2, offset: 0, paused: false, dead: false }
    }).catch(() => this.previewSynth(songId, loop))
  }

  /** 试听暂停（缓冲路径：记下已播秒数停源；恢复时接着播） */
  previewPause() {
    if (!this.ctx || !this.preview || this.preview.dead) return
    const p = this.preview
    if (p.paused) return
    if (p.src) {
      p.offset = Math.min(p.offset + (this.ctx.currentTime - p.startAt), p.buf ? p.buf.duration : 0)
      try { p.src.stop() } catch { /* */ }
      p.paused = true
    } else {
      // 合成回退不支持暂停——直接停止
      p.dead = true
      p.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3)
      setTimeout(() => { p.gain.disconnect(); if (this.preview === p) this.preview = null }, 1100)
    }
  }

  /** 试听恢复（从暂停处接着播） */
  previewResume() {
    if (!this.ctx || !this.bgmBus || !this.preview || this.preview.dead) return
    const p = this.preview
    if (!p.paused) return
    if (p.src && p.buf) {
      const src = this.ctx.createBufferSource()
      src.buffer = p.buf
      src.loop = p.loop
      src.connect(p.gain)
      src.onended = () => {
        if (this.preview === p && !p.paused && !p.dead && !p.loop) {
          p.dead = true
          this.onPreviewEnd?.()
        }
      }
      src.start(0, p.offset % p.buf.duration)
      p.src = src
      p.startAt = this.ctx.currentTime
      p.paused = false
    } else {
      this.previewPlay(p.songId, p.loop) // 合成回退：从头重播
    }
  }

  /** v56 六轮：试听进度（id/已播秒数/总秒数/是否暂停）——电台播放器进度条 */
  previewInfo(): { id: string; pos: number; dur: number; paused: boolean } | null {
    if (!this.ctx || !this.preview || this.preview.dead) return null
    const p = this.preview
    if (p.buf) {
      const dur = p.buf.duration
      let pos = p.paused ? p.offset : p.offset + (this.ctx.currentTime - p.startAt)
      if (p.loop) pos = pos % dur
      else pos = Math.min(pos, dur)
      return { id: p.songId, pos, dur, paused: p.paused }
    }
    if (p.midi) {
      const dur = p.midi.song.duration
      const pos = ((this.ctx.currentTime - p.midi.loopStart) % dur + dur) % dur
      return { id: p.songId, pos, dur, paused: false }
    }
    return null
  }

  /** 试听回退：WebAudio 合成播放（不支持暂停/单次——始终循环） */
  private previewSynth(songId: string, _loop: boolean) {
    if (!this.ctx || !this.bgmBus) return
    void loadMidi(musicUrl(songId)).then((song) => {
      if (!this.ctx || !this.bgmBus) return
      const t2 = this.ctx.currentTime
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, t2)
      gain.gain.setTargetAtTime(0.9, t2, 0.5)
      gain.connect(this.bgmBus)
      const echo = this.ctx.createDelay(1)
      echo.delayTime.value = 0.28
      const fb = this.ctx.createGain(); fb.gain.value = 0.32
      const wet = this.ctx.createGain(); wet.gain.value = 0.42
      echo.connect(fb).connect(echo)
      echo.connect(wet).connect(gain)
      const midi: MidiLayer = { level: -1, gain, echo, song, noteIdx: 0, loopStart: t2 + 0.15, harsh: false, dead: false }
      this.preview = { songId, gain, src: null, midi, buf: null, loop: true, startAt: t2, offset: 0, paused: false, dead: false }
      if (!this.midiTimer) this.midiTimer = setInterval(() => this.scheduleMidi(), 80)
    }).catch(() => this.resumeBgmForRadio())
  }

  /** 停止试听（restore=true 时恢复 BGM 播放） */
  stopPreview(restore = true) {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    if (this.preview && !this.preview.dead) {
      const p = this.preview
      p.dead = true
      p.gain.gain.setTargetAtTime(0, t, 0.3)
      if (p.src) { try { p.src.stop(t + 1.0) } catch { /* */ } }
      setTimeout(() => { p.gain.disconnect(); if (this.preview === p) this.preview = null }, 1100)
    }
    if (restore) this.resumeBgmForRadio()
  }

  // ================= v56 八轮：电台播放暂停/恢复原 BGM =================

  /** 电台开始播放：暂停原 BGM（缓冲层记位停止；合成层静音） */
  private pauseBgmForRadio() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    if (this.bufLayer && !this.bufLayer.dead && !this.bufLayer.paused) {
      const L = this.bufLayer
      L.offset = (L.offset + (t - L.startAt)) % L.buf.duration
      try { L.src.stop() } catch { /* */ }
      L.paused = true
    }
    // 合成层（程序化 / 合成回退）：静音（无法真暂停，恢复时拉回音量）
    this.radioPausedSynth = []
    for (const L of [this.bgmLayer, this.midiLayer]) {
      if (L && !L.dead) {
        this.radioPausedSynth.push({ g: L.gain, v: 0.9 })
        L.gain.gain.setTargetAtTime(0.001, t, 0.4)
      }
    }
  }

  /** 电台停止播放：从暂停处恢复原 BGM */
  private resumeBgmForRadio() {
    if (!this.ctx || !this.bgmBus) return
    const t = this.ctx.currentTime
    if (this.bufLayer && !this.bufLayer.dead && this.bufLayer.paused) {
      const L = this.bufLayer
      const src = this.ctx.createBufferSource()
      src.buffer = L.buf
      src.loop = true
      src.connect(L.gain)
      src.start(0, L.offset)
      L.src = src
      L.startAt = t
      L.paused = false
    }
    for (const { g, v } of this.radioPausedSynth) g.gain.setTargetAtTime(v, t, 0.8)
    this.radioPausedSynth = []
  }

  private stopBgmLayersForOneshot() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    if (this.bgmLayer && !this.bgmLayer.dead) {
      const old = this.bgmLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, t, 0.6)
      setTimeout(() => { for (const n of old.drones) { try { (n as OscillatorNode).stop() } catch { /* */ } } }, 2600)
    }
    this.fadeMidiLayer(t, 0.6, 2600)
    if (this.bufLayer && !this.bufLayer.dead) {
      const old = this.bufLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, t, 0.6)
      try { old.src.stop(t + 2.6) } catch { /* */ }
    }
  }

  /** 乐手演奏（一次性；v56 三轮：rock_* 走离线渲染音频真实音色，播完自动恢复 BGM） */
  playMusicianSong(songId: string) {
    if (!this.ctx || !this.bgmBus) return
    if (isAudioSong(songId)) {
      this.playBufferOnce(songId)
      return
    }
    this.stopBgmLayersForOneshot()
    void loadMidi(musicUrl(songId)).then((song) => {
      if (!this.ctx || !this.bgmBus) return
      const t = this.ctx.currentTime
      if (this.oneshot && !this.oneshot.dead) {
        const old = this.oneshot
        old.dead = true
        old.gain.gain.setTargetAtTime(0, t, 0.5)
        setTimeout(() => { old.gain.disconnect() }, 1600)
      }
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.setTargetAtTime(0.95, t, 0.5)
      gain.connect(this.bgmBus)
      const echo = this.ctx.createDelay(1)
      echo.delayTime.value = 0.24
      const fb = this.ctx.createGain(); fb.gain.value = 0.28
      const wet = this.ctx.createGain(); wet.gain.value = 0.34
      echo.connect(fb).connect(echo)
      echo.connect(wet).connect(gain)
      // 乐手摇滚：锐利音色（sawtooth），不受层级音色分级影响
      this.oneshot = { level: -1, gain, echo, song, noteIdx: 0, loopStart: t + 0.12, harsh: true, oneshot: true, dead: false }
      this.onSongPlayed?.(songId) // v56：收听记录 → 电台解锁
      if (!this.midiTimer) this.midiTimer = setInterval(() => this.scheduleMidi(), 80)
    }).catch(() => {
      console.warn(`[audio] 乐手曲目加载失败: ${songId}`)
      this.resumeBgm()
    })
  }

  /** 乐手演奏程序化摇滚（普通摇滚——v56 三轮：直接播放离线渲染的 rock_generic 音频；
   *  加载失败回退旧的实时合成摇滚） */
  playProceduralRock() {
    if (!this.ctx || !this.bgmBus) return
    this.stopBgmLayersForOneshot()
    void this.loadSongBuf('rock_generic').then((buf) => {
      if (!this.ctx || !this.bgmBus) return
      const t = this.ctx.currentTime
      if (this.oneshotBuf && !this.oneshotBuf.dead) {
        const old = this.oneshotBuf
        old.dead = true
        old.gain.gain.setTargetAtTime(0, t, 0.4)
        try { old.src.stop(t + 1.2) } catch { /* */ }
      }
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.loop = false
      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, t)
      gain.gain.setTargetAtTime(0.92, t, 0.4)
      src.connect(gain)
      gain.connect(this.bgmBus)
      src.onended = () => {
        if (this.oneshotBuf?.src === src) this.oneshotBuf = null
        this.finishMusician()
      }
      src.start()
      this.oneshotBuf = { gain, src, dead: false }
    }).catch(() => {
      // 回退：旧实时合成摇滚
      console.warn('[audio] rock_generic 加载失败，回退实时合成摇滚')
      this.startRockSynth()
    })
  }

  /** 旧实时合成摇滚（rock_generic 音频不可用时的回退） */
  private startRockSynth() {
    if (!this.ctx || !this.bgmBus) return
    if (this.rockLayer && !this.rockLayer.dead) {
      const old = this.rockLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5)
      setTimeout(() => { old.gain.disconnect() }, 1600)
    }
    const t = this.ctx.currentTime
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.setTargetAtTime(0.9, t, 0.4)
    gain.connect(this.bgmBus)
    const echo = this.ctx.createDelay(1)
    echo.delayTime.value = 0.2
    const fb = this.ctx.createGain(); fb.gain.value = 0.25
    const wet = this.ctx.createGain(); wet.gain.value = 0.3
    echo.connect(fb).connect(echo)
    echo.connect(wet).connect(gain)
    this.rockLayer = { gain, echo, harsh: true, step: 0, nextT: t + 0.1, stepDur: 60 / 130 / 4, total: 8 * 16, dead: false }
    if (!this.midiTimer) this.midiTimer = setInterval(() => this.scheduleMidi(), 80)
  }

  // 程序化摇滚单步（16 分音符步进；130 BPM 8 小节：鼓 + 贝斯 + 强力和弦）
  private tickRock(R: RockLayer, step: number, t: number) {
    const stepDur = R.stepDur
    const bar = Math.floor(step / 16)
    const s16 = step % 16
    const ROOTS = [45, 45, 41, 43, 45, 45, 38, 40] // A A F G A A D E
    const r = ROOTS[bar % 8]
    // 鼓组（底鼓 1/3 拍、军鼓 2/4 拍、8 分踩镲）
    if (s16 === 0 || s16 === 8) this.drum(36, t, 0.52, R)
    if (s16 === 4 || s16 === 12) this.drum(38, t, 0.46, R)
    if (s16 % 2 === 0) this.drum(42, t, 0.2, R)
    if (s16 === 14) this.drum(36, t, 0.4, R) // 加花底鼓
    // 贝斯 8 分
    if (s16 % 2 === 0) {
      const f = 440 * Math.pow(2, ((s16 % 8 === 6 ? r + 7 : r) - 69) / 12)
      this.midiVoice('bass', f, t, stepDur * 1.7, 0.16, R, 0)
    }
    // 吉他强力和弦（每小节开始，根音+五度+八度——KS 拨弦扫弦：三根弦依次拨响）
    if (s16 === 0) {
      for (const [i, n] of [r + 12, r + 19, r + 24].entries()) {
        const f = 440 * Math.pow(2, (n - 69) / 12)
        this.midiVoice('guitar', f, t + i * 0.016, stepDur * 14, 0.1, R, 0)
      }
    }
    // 吉他 riff 点缀（小节末）
    if (s16 === 10) {
      const f = 440 * Math.pow(2, (r + 24 - 69) / 12)
      this.midiVoice('guitar', f, t, stepDur * 3, 0.08, R, 0)
    }
  }

  private playMidiNote(n: MidiNoteEv, t: number, L: MidiLayer) {
    const drift = (Math.random() - 0.5) * this.distort * 60
    const peak = Math.max(0.004, Math.min(0.42, n.v * 0.55))
    if (n.ch === 9) { this.drum(n.p, t, peak, L); return }
    const freq = 440 * Math.pow(2, (n.p - 69) / 12)
    this.midiVoice(this.progVoice(n.prog), freq, t, n.d, peak, L, drift)
  }

  // GM 音色号 → 合成音色族
  private progVoice(prog: number): MidiVoice {
    if (prog <= 3) return 'piano'
    if (prog <= 7) return 'epiano'
    if (prog <= 15) return 'bell'
    if (prog >= 16 && prog <= 23) return 'pad' // 风琴类 → pad（持续）
    if (prog >= 24 && prog <= 31) return 'guitar' // 吉他类（含 30 失真吉他）→ Karplus-Strong 拨弦（乐手摇滚用）
    if (prog >= 32 && prog <= 39) return 'bass'
    if (prog >= 48 && prog <= 51) return 'strings'
    if (prog >= 52 && prog <= 55) return 'choir'
    if (prog >= 56 && prog <= 63) return 'brass'
    if (prog >= 72 && prog <= 79) return 'flute'
    if (prog >= 80 && prog <= 87) return 'lead'
    if (prog >= 88 && prog <= 103) return 'pad'
    return 'piano'
  }

  // 合成音色（GM 音色族 → 振荡器 + 包络；走层 gain 与空间回声）
  private midiVoice(inst: MidiVoice, freq: number, t: number, dur: number, peak: number, L: { gain: GainNode; echo: DelayNode | null; harsh: boolean }, drift: number) {
    const ctx = this.ctx!
    const osc = (type: OscillatorType, mult = 1, det = 0) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq * mult
      o.detune.value = det + drift
      return o
    }
    const env = (o: OscillatorNode, attack: number, mult = 1) => {
      const gn = ctx.createGain()
      gn.gain.setValueAtTime(0.0001, t)
      gn.gain.exponentialRampToValueAtTime(peak * mult, t + attack)
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(gn)
      gn.connect(L.gain)
      if (L.echo) gn.connect(L.echo)
      o.start(t); o.stop(t + dur + 0.08)
    }
    const filtered = (o: OscillatorNode, freqCut: number, attack: number, mult = 1, release = dur) => {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freqCut
      const gn = ctx.createGain()
      gn.gain.setValueAtTime(0.0001, t)
      gn.gain.exponentialRampToValueAtTime(peak * mult, t + attack)
      gn.gain.exponentialRampToValueAtTime(0.0001, t + release)
      o.connect(lp).connect(gn).connect(L.gain)
      if (L.echo) gn.connect(L.echo)
      o.start(t); o.stop(t + release + 0.1)
    }
    switch (inst) {
      case 'piano':
        env(osc('triangle', 1, 6), 0.02, 0.85)
        env(osc('triangle', 1.004, -6), 0.02, 0.55)
        break
      case 'epiano':
        env(osc('sine', 1, 3), 0.015, 0.75)
        env(osc('sine', 2, 2), 0.015, 0.2)
        break
      case 'bell':
        env(osc('sine', 1), 0.006, 0.7)
        env(osc('sine', 2, 4), 0.006, 0.24)
        env(osc('sine', 3, -3), 0.006, 0.1)
        break
      case 'bass':
        // 贝斯：基波 + 二次谐波（更接近真实电贝斯质感）
        env(osc('sine', 1), 0.02, 0.9)
        env(osc('sine', 2), 0.02, 0.24)
        break
      case 'guitar':
        // v56：Karplus-Strong 物理拨弦 + 软削波失真（真实电吉他音色）
        this.ksPluck(freq * Math.pow(2, drift / 1200), t, dur, peak, L)
        break
      case 'strings':
        if (L.harsh) {
          filtered(osc('sawtooth', 1, 3), 1300, Math.min(0.3, dur * 0.3), 0.7)
          filtered(osc('sawtooth', 1.003, -3), 1300, Math.min(0.3, dur * 0.3), 0.4)
        } else {
          filtered(osc('triangle', 1, 3), 1000, Math.min(0.35, dur * 0.35), 0.7)
          filtered(osc('triangle', 1.004, -3), 1000, Math.min(0.35, dur * 0.35), 0.4)
        }
        break
      case 'choir':
        filtered(osc('triangle', 1, 4), 1000, Math.min(0.4, dur * 0.35), 0.7)
        filtered(osc('triangle', 1.005, -4), 1000, Math.min(0.4, dur * 0.35), 0.4)
        break
      case 'brass':
        if (L.harsh) {
          filtered(osc('sawtooth', 1, 2), 1800, 0.08, 0.7)
          filtered(osc('sawtooth', 1.002, -2), 1800, 0.08, 0.35)
        } else {
          filtered(osc('triangle', 1, 2), 1200, 0.1, 0.65)
          filtered(osc('triangle', 1.003, -2), 1200, 0.1, 0.3)
        }
        break
      case 'flute':
        env(osc('sine', 1, 2), 0.05, 0.7)
        env(osc('sine', 2, 3), 0.05, 0.16)
        break
      case 'lead':
        if (L.harsh) {
          filtered(osc('sawtooth', 1, 4), 2400, 0.03, 0.6)
        } else {
          filtered(osc('triangle', 1, 3), 1600, 0.03, 0.55)
        }
        break
      case 'pad':
        filtered(osc('triangle', 1, 2), 1100, Math.min(0.5, dur * 0.4), 0.75)
        break
    }
  }

  // v56：Karplus-Strong 拨弦合成（物理建模吉他）——噪声激励 → 延迟线反馈（弦振动）→
  // 阻尼低通（按弦长）→ 软削波失真 + 音色低通。比锯齿波更接近真实电吉他。
  private guitarShaperCurve: Float32Array<ArrayBuffer> | null = null
  private ksPluck(freq: number, t: number, dur: number, peak: number, L: { gain: GainNode; echo: DelayNode | null }) {
    const ctx = this.ctx!
    const f = Math.max(40, Math.min(2000, freq))
    // 激励：短促噪声爆发（模拟拨片刮弦）
    const excLen = Math.max(2, Math.min(Math.floor(ctx.sampleRate * 0.05), Math.floor((ctx.sampleRate / f) * 1.5)))
    const exc = ctx.createBuffer(1, excLen, ctx.sampleRate)
    const ed = exc.getChannelData(0)
    for (let i = 0; i < excLen; i++) ed[i] = (Math.random() * 2 - 1) * (1 - i / excLen)
    const src = ctx.createBufferSource()
    src.buffer = exc
    // 延迟线 = 弦长；反馈 + 阻尼 = 弦振动衰减
    const delay = ctx.createDelay(1)
    delay.delayTime.value = 1 / f
    const damp = ctx.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = Math.min(6500, Math.max(900, f * 7))
    const fb = ctx.createGain()
    fb.gain.value = 0.985 - Math.min(0.1, f / 5000) // 高音弦衰减更快（更真实）
    src.connect(delay)
    delay.connect(damp)
    damp.connect(fb)
    fb.connect(delay)
    // 包络（拨弦自然衰减 + 上限截断）
    const env = ctx.createGain()
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(Math.min(0.6, peak * 0.9), t + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(dur, 2.6))
    damp.connect(env)
    // 软削波失真（tanh 曲线）+ 失真后音色低通
    if (!this.guitarShaperCurve) {
      const c = new Float32Array(512)
      for (let i = 0; i < 512; i++) {
        const x = (i / 255.5) - 1
        c[i] = Math.tanh(x * 4.5) / Math.tanh(4.5)
      }
      this.guitarShaperCurve = c
    }
    const shaper = ctx.createWaveShaper()
    shaper.curve = this.guitarShaperCurve
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 3400
    env.connect(shaper)
    shaper.connect(tone)
    tone.connect(L.gain)
    if (L.echo) env.connect(L.echo)
    src.start(t)
    src.stop(t + dur + 0.12)
  }

  private drum(pitch: number, t: number, vel: number, L: { gain: GainNode }) {
    const ctx = this.ctx!
    const out = L.gain
    if (pitch === 35 || pitch === 36) { // 底鼓：低频扫频 + 鼓皮冲击
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(140, t)
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12)
      const g = ctx.createGain()
      g.gain.setValueAtTime(vel * 0.9, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      o.connect(g).connect(out); o.start(t); o.stop(t + 0.2)
      const c = ctx.createOscillator()
      c.type = 'sine'
      c.frequency.setValueAtTime(2400, t)
      c.frequency.exponentialRampToValueAtTime(320, t + 0.022)
      const cg = ctx.createGain()
      cg.gain.setValueAtTime(vel * 0.22, t)
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.028)
      c.connect(cg).connect(out); c.start(t); c.stop(t + 0.03)
    } else if (pitch === 38 || pitch === 40) { // 军鼓：噪声 + 鼓身音（双要素更真实）
      const n = this.noiseSrc()
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7
      const g = ctx.createGain()
      g.gain.setValueAtTime(vel * 0.5, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16)
      n.connect(bp).connect(g).connect(out); n.start(t); n.stop(t + 0.18)
      const o = ctx.createOscillator() // 鼓身音（190→120Hz 短三角）
      o.type = 'triangle'
      o.frequency.setValueAtTime(190, t)
      o.frequency.exponentialRampToValueAtTime(120, t + 0.08)
      const og = ctx.createGain()
      og.gain.setValueAtTime(vel * 0.42, t)
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
      o.connect(og).connect(out); o.start(t); o.stop(t + 0.12)
    } else if (pitch === 42 || pitch === 44 || pitch === 46) { // 踩镲：高频噪声 + 金属共鸣带（双带通更像真镲）
      const n = this.noiseSrc()
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000
      const g = ctx.createGain()
      g.gain.setValueAtTime(vel * 0.22, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
      n.connect(hp).connect(g).connect(out); n.start(t); n.stop(t + 0.06)
      const n2 = this.noiseSrc()
      const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 11000; bp2.Q.value = 1.2
      const g2 = ctx.createGain()
      g2.gain.setValueAtTime(vel * 0.1, t)
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
      n2.connect(bp2).connect(g2).connect(out); n2.start(t); n2.stop(t + 0.05)
    } else { // 镲片/其他
      const n = this.noiseSrc()
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000
      const g = ctx.createGain()
      g.gain.setValueAtTime(vel * 0.3, t)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      n.connect(hp).connect(g).connect(out); n.start(t); n.stop(t + 0.52)
    }
  }

  // 持续 drone 声部
  private buildDrones(L: BgmLayer) {
    const ctx = this.ctx!
    const drone = (freq: number, type: OscillatorType, g: number, lfoRate = 0, lfoDepth = 0) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      const gn = ctx.createGain()
      gn.gain.value = g
      o.connect(gn).connect(L.gain)
      if (lfoRate > 0) {
        const lfo = ctx.createOscillator()
        lfo.frequency.value = lfoRate
        const lg = ctx.createGain(); lg.gain.value = lfoDepth
        lfo.connect(lg).connect(o.detune)
        lfo.start()
        L.drones.push(lfo)
      }
      o.start()
      L.drones.push(o)
    }
    switch (L.level) {
      case 0: drone(50, 'sine', 0.10); drone(100, 'sine', 0.04); drone(150.7, 'sine', 0.015, 0.13, 30); break // 荧光灯嗡鸣
      case 1: drone(41.2, 'sawtooth', 0.05, 0.07, 12); drone(82.4, 'sine', 0.05); drone(55, 'triangle', 0.03, 0.05, 20); break // 车库 drone
      case 2: drone(38, 'sawtooth', 0.06, 0.09, 15); drone(76.5, 'square', 0.02); drone(19, 'sine', 0.09); break // 工业低频
      case 3: drone(60, 'sawtooth', 0.045, 0.4, 40); drone(120.8, 'sine', 0.03, 0.23, 25); break // 电压嗡鸣
      case 4: drone(65.4, 'sine', 0.03, 0.11, 18); drone(98, 'triangle', 0.02, 0.17, 22); break // 残迹 pad
      case 5: drone(55, 'sine', 0.04, 0.06, 10); drone(110.3, 'sine', 0.025, 0.09, 14); break // 空灵底
      // v23：Level 6–11 与结局层
      case 6: drone(31, 'sine', 0.02, 0, 0); break // L6「Lights Out」：近乎消音室——只留一层极低的地板噪
      case 7: drone(34, 'sine', 0.07, 0.05, 26); drone(68.2, 'sine', 0.035, 0.08, 34); drone(23.5, 'sine', 0.05, 0.12, 45); break // L7 深海：缓慢起伏的水压低频
      case 8: drone(44, 'sawtooth', 0.035, 0.14, 19); drone(88.6, 'sine', 0.02, 0.21, 27); drone(29.3, 'triangle', 0.045, 0.09, 38); break // L8 洞穴：巨大空间的回响底噪
      case 9: drone(48.6, 'sine', 0.03, 0.1, 16); drone(97.9, 'triangle', 0.018, 0.15, 21); drone(24.3, 'sine', 0.055, 0.07, 31); break // L9 午夜郊区：远处的风与电流
      case 10: drone(72, 'sine', 0.022, 0.05, 12); drone(108.4, 'sine', 0.014, 0.08, 17); break // L10 麦田：阴天下的开阔静默
      case 11: drone(58, 'triangle', 0.032, 0.06, 13); drone(116.5, 'sine', 0.02, 0.1, 18); drone(87.3, 'sine', 0.012, 0.14, 24); break // L11 城市：整座城市的空转嗡鸣
      case 12: drone(63, 'sine', 0.03, 0.05, 11); drone(126.4, 'sine', 0.018, 0.09, 15); drone(94.6, 'triangle', 0.012, 0.13, 20); break // L601 图书馆：纸与灰尘的高频静电
      // v36：据点（温暖软垫和声底，旋律走 tickLayer——与外部层级的阴冷 drone 形成「到家了」的对照）
      case 101: drone(130.8, 'sine', 0.02, 0.06, 7); drone(196, 'sine', 0.013, 0.09, 9); drone(65.4, 'sine', 0.018, 0.04, 5); break // Alpha 基地：C 大三和弦软垫
      case 102: drone(146.8, 'sine', 0.018, 0.07, 8); drone(220, 'sine', 0.011, 0.1, 10); drone(73.4, 'triangle', 0.014, 0.05, 6); break // 商人之家：D 暖商场软垫
      case 103: drone(164.8, 'sine', 0.016, 0.06, 8); drone(246.9, 'sine', 0.01, 0.09, 11); drone(82.4, 'sine', 0.013, 0.04, 6); break // 希波克拉底 - 1：E 安静病房软垫
      case 104: drone(174.6, 'sine', 0.018, 0.07, 8); drone(261.6, 'sine', 0.011, 0.1, 10); drone(87.3, 'triangle', 0.015, 0.05, 6); break // Tom 的餐馆：F 大三和弦暖垫
    }
  }

  // lookahead 调度器
  private scheduleBGM() {
    const L = this.bgmLayer
    if (!L || L.dead || !this.ctx) return
    const ahead = this.ctx.currentTime + 0.3
    let guard = 0
    while (L.nextT < ahead && guard++ < 32) {
      this.tickLayer(L, L.step, L.nextT)
      L.step = (L.step + 1) % L.steps
      L.nextT += L.stepDur
    }
  }

  // 单步发音
  private tickLayer(L: BgmLayer, step: number, t: number) {
    const ctx = this.ctx!
    const d = this.distort
    // 扭曲：音高漂移 / 偶尔「倒放感」（包络反转的扫频）
    const det = () => (Math.random() - 0.5) * d * 120
    const note = (freq: number, dur: number, g: number, type: OscillatorType = 'sine', useEcho = true, detune = 0) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = freq
      o.detune.value = detune + det()
      const gn = ctx.createGain()
      gn.gain.setValueAtTime(0.0001, t)
      gn.gain.exponentialRampToValueAtTime(g, t + 0.02)
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(gn)
      gn.connect(L.gain)
      if (useEcho && L.echo) gn.connect(L.echo)
      o.start(t); o.stop(t + dur + 0.05)
    }
    const hiss = (dur: number, g: number, fType: BiquadFilterType, freq: number, Q = 1, useEcho = true) => {
      const n = this.noiseSrc()
      const f = ctx.createBiquadFilter()
      f.type = fType; f.frequency.value = freq; f.Q.value = Q
      const gn = ctx.createGain()
      gn.gain.setValueAtTime(g, t)
      gn.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      n.connect(f).connect(gn)
      gn.connect(L.gain)
      if (useEcho && L.echo) gn.connect(L.echo)
      n.start(t); n.stop(t + dur + 0.05)
    }
    const rnd = Math.random
    switch (L.level) {
      case 0: {
        // L0 走调钢琴 / 稀疏怀旧音符（midwest emo 空旷感）
        const scale = [220, 246.9, 261.6, 293.7, 329.6, 196]
        if (step % 4 === 0 && rnd() < 0.75) {
          const f = scale[Math.floor(rnd() * scale.length)] * (rnd() < 0.3 ? 2 : 1)
          note(f, 2.4, 0.055, 'triangle', true, 8)
          note(f * 1.005, 2.2, 0.03, 'sine', true, -6) // 失谐双音
        }
        if (step % 8 === 6 && rnd() < 0.4) note(110, 3.5, 0.04, 'sine', true)
        break
      }
      case 1: {
        // L1 空旷车库：远处金属撞击残响 + 偶发低鸣
        if (step === 0 && rnd() < 0.8) note(55, 4.5, 0.05, 'sine', true)
        if (rnd() < 0.1) {
          hiss(1.4, 0.05, 'bandpass', 700 + rnd() * 1400, 7) // 金属撞击
          note(180 + rnd() * 120, 1.8, 0.02, 'sine', true)
        }
        if (step % 8 === 4 && rnd() < 0.3) note(82.4, 3, 0.035, 'triangle', true, -10)
        break
      }
      case 2: {
        // L2 蒸汽嘶声节奏 + 管道金属共鸣
        if (step % 2 === 0) hiss(0.18, 0.045, 'highpass', 5500, 1, false) // 嘶
        if (step % 8 === 3) hiss(1.2, 0.06, 'bandpass', 2600, 4)
        if (rnd() < 0.12) note(96 + rnd() * 40, 2.6, 0.05, 'triangle', true, 15) // 管道共鸣
        if (step === 0 && rnd() < 0.5) note(48, 3.5, 0.06, 'sine', false)
        break
      }
      case 3: {
        // L3 电流脉冲 arpeggio + 电火花
        const arp = [220, 330, 264, 396, 220, 352, 264, 440]
        if (step % 2 === 0) note(arp[(step / 2) % 8] * (rnd() < d * 0.5 ? 0.5 : 1), 0.16, 0.035, 'square', false)
        if (rnd() < 0.06 + d * 0.1) hiss(0.08, 0.09, 'highpass', 7000, 1, false) // 火花
        if (step === 0 && rnd() < 0.6) note(60 * (rnd() < 0.3 ? 1.06 : 1), 2.2, 0.05, 'sawtooth', true)
        break
      }
      case 4: {
        // L4 走调八音盒 / 电梯音乐残迹（wow & flutter）
        const melody = [523.3, 587.3, 659.3, 783.9, 659.3, 587.3, 523.3, 392, 440, 523.3, 0, 493.9]
        const f = melody[step]
        if (f > 0 && rnd() < 0.85) {
          note(f, 1.1, 0.05, 'sine', true, (rnd() - 0.5) * 50) // 音高漂移
          note(f * 2, 0.5, 0.015, 'sine', true, (rnd() - 0.5) * 70)
        }
        if (rnd() < 0.15) hiss(0.5, 0.012, 'bandpass', 4000, 2, false) // 磁带底噪
        break
      }
      case 5: {
        // L5 老式唱机爵士：3/4 摇摆行走低音 + 七和弦 + 唱机刷片声（远处舞厅）
        // Cm7 → B♭maj7 → F7 → C7 的酒店舞厅和声
        const chords = [
          [130.8, 196.0, 233.1, 311.1],
          [123.5, 185.0, 220.0, 293.7],
          [146.8, 220.0, 261.6, 349.2],
          [130.8, 196.0, 246.9, 329.6],
        ]
        const bar = Math.floor(step / 3), beat = step % 3
        const ch = chords[bar % 4]
        // 行走低音（带摇摆错拍）
        if (beat === 0) note(ch[0], 1.7, 0.055, 'triangle', true, (rnd() - 0.5) * 20)
        else note(ch[0] * (beat === 1 ? 1.5 : 2), 0.85, 0.038, 'triangle', true, (rnd() - 0.5) * 25)
        // 七和弦长音（高八度、失谐，像旧唱机喇叭）
        if (beat !== 0 && rnd() < 0.8)
          for (let i = 1; i < 4; i++) note(ch[i] * 2, 1.0, 0.015, 'sine', true, (rnd() - 0.5) * 45)
        // 唱机底噪/刷片
        if (rnd() < 0.5) hiss(0.22, 0.012, 'highpass', 6000, 1, false)
        if (step === 0 && rnd() < 0.4) hiss(1.8, 0.02, 'bandpass', 3200, 2) // 远处派对喧闹残响
        break
      }
      case 101: case 102: case 103: case 104: {
        // 据点：舒缓轻松的安全区小曲——C 大调五声音阶随机漫步分解（软三角音+回声）+ 暖低音 + 偶发音乐盒泛音
        const PENT = [261.6, 293.7, 329.6, 392, 440] // C4 D4 E4 G4 A4
        const BASS = [130.8, 98, 110, 87.3] // C3 G2 A2 F2（I→V→vi→IV 慢和声）
        if (step % 4 === 0) note(BASS[(step / 4) % 4], 3.4, 0.034, 'sine', true)
        if (step % 2 === 1 && rnd() < 0.6) {
          this.melIdx = Math.max(0, Math.min(4, this.melIdx + (rnd() < 0.5 ? -1 : 1)))
          const f = PENT[this.melIdx] * (rnd() < 0.18 ? 2 : 1)
          note(f, 2.4, 0.04, 'triangle', true, 6)
          note(f * 2, 1.7, 0.011, 'sine', true) // 泛音微光
        }
        if (step % 8 === 6 && rnd() < 0.3) {
          const f = PENT[Math.floor(rnd() * 5)] * 2
          note(f, 0.9, 0.015, 'sine', true)
          note(f * 1.5, 0.7, 0.009, 'sine', true) // 音乐盒双音
        }
        break
      }
    }
    // 低理智「倒放感」：偶发反向扫频
    if (d > 0.35 && rnd() < d * 0.12) {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.setValueAtTime(900 + rnd() * 600, t)
      o.frequency.exponentialRampToValueAtTime(150, t + 0.7)
      const gn = ctx.createGain()
      gn.gain.setValueAtTime(0.0001, t)
      gn.gain.exponentialRampToValueAtTime(0.04 * d, t + 0.55)
      gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.75)
      o.connect(gn).connect(L.gain)
      o.start(t); o.stop(t + 0.8)
    }
  }
}

export const audio = new GameAudio()
