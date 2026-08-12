// WebAudio 程序合成音频：荧光灯嗡鸣/脚步/受击/拾取/出口/低语/UI + 每层梦核BGM
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
  setPhono(vol: number) {
    if (!this.ctx || !this.bgmBus) return
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
    // BGM 闪避（近场压低 75%；vol=0 即恢复）
    if (this.bgmLayer && !this.bgmLayer.dead)
      this.bgmLayer.gain.gain.setTargetAtTime(0.9 * (1 - Math.min(1, vol) * 0.75), this.ctx.currentTime, 0.3)
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
    if (this.bgmLayer && this.bgmLayer.level === level && !this.bgmLayer.dead) return
    const t = this.ctx.currentTime
    // 旧层淡出 2.5s
    if (this.bgmLayer && !this.bgmLayer.dead) {
      const old = this.bgmLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, t, 0.8)
      setTimeout(() => { for (const n of old.drones) { try { (n as OscillatorNode).stop() } catch { /* */ } } }, 3200)
    }
    // 新层
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(0, t)
    gain.gain.setTargetAtTime(0.9, t, 1.0) // 淡入 ~2.5s
    gain.connect(this.bgmBus)
    // 空间回声总线
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
      stepDur: level >= 100 ? 0.62 : [0.5, 0.6, 0.42, 0.24, 0.7, 0.62][level] ?? 0.5, // 据点曲放慢（16 步 ≈ 10s 一轮）
      steps: [16, 16, 16, 16, 12, 12][level] ?? 16,
      dead: false,
    }
    this.buildDrones(layer)
    this.bgmLayer = layer
    if (!this.bgmTimer) this.bgmTimer = setInterval(() => this.scheduleBGM(), 90)
  }

  stopBGM() {
    if (this.bgmLayer && this.ctx) {
      const old = this.bgmLayer
      old.dead = true
      old.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5)
      setTimeout(() => { for (const n of old.drones) { try { (n as OscillatorNode).stop() } catch { /* */ } } }, 2200)
      this.bgmLayer = null
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
