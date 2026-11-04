// [l5items 收尾] O666 命运之骰「转 5 min」嗡鸣：WebAudio 程序合成（经 audio.fxNodes() 的音效总线）。
//   低频嗡鸣（sine 52–70 Hz + 微弱 LFO 颤动）+ 随转速的谐波（triangle，频率 = 每秒掠过的面数 ×1 / ×2，经低通）；
//   gain / 低通截止随听者距离衰减（fateDieSim.dieHumTarget）；离开房间 / 作废 / 停下时 0.35 s 淡出后停振荡器；
//   裂开时一声脆响（高通噪声短促爆裂 + 两个高频衰减正弦）。
// 纯类：构造时注入 AudioContext + 输出节点，无头检查用 mock AudioContext 验证节点启停与状态同步。
import type { HumTarget } from '../engine/fateDieSim'

type Ctx = Pick<AudioContext, 'currentTime' | 'createOscillator' | 'createGain' | 'createBiquadFilter' | 'createBuffer' | 'createBufferSource' | 'sampleRate'>
export const HUM_FADE = .35

export class FateDieHum {
  /** 振荡器是否在运行（含淡出中） */
  running = false
  /** 淡出中：到该 ctx 时刻停振荡器 */
  stopAt = 0
  cracks = 0
  private nodes: { base: OscillatorNode; h1: OscillatorNode; h2: OscillatorNode; lfo: OscillatorNode; lfoG: GainNode; hg: GainNode; lp: BiquadFilterNode; out: GainNode } | null = null
  private ctx: Ctx
  private dest: AudioNode
  constructor(ctx: Ctx, dest: AudioNode) { this.ctx = ctx; this.dest = dest }
  /** 每帧：按目标状态启停 / 调参。返回当前是否在发声（含淡出） */
  update(tg: HumTarget): boolean {
    const c = this.ctx, t = c.currentTime
    if (tg.on) {
      if (!this.nodes) this.start()
      const n = this.nodes!
      this.stopAt = 0
      n.out.gain.setTargetAtTime(tg.gain, t, .08)
      n.base.frequency.setTargetAtTime(tg.base, t, .15)
      n.h1.frequency.setTargetAtTime(Math.max(20, tg.harm), t, .1)
      n.h2.frequency.setTargetAtTime(Math.max(40, tg.harm * 2), t, .1)
      n.hg.gain.setTargetAtTime(Math.min(.55, tg.harm / 60), t, .1)
      n.lp.frequency.setTargetAtTime(tg.cutoff, t, .1)
    } else if (this.nodes) {
      if (!this.stopAt) { this.stopAt = t + HUM_FADE; const g = this.nodes.out.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + HUM_FADE) }
      else if (t >= this.stopAt) this.stop()
    }
    return this.running
  }
  private start() {
    const c = this.ctx
    const out = c.createGain(); out.gain.value = 0
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = .7
    const base = c.createOscillator(); base.type = 'sine'; base.frequency.value = 52
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 5.3
    const lfoG = c.createGain(); lfoG.gain.value = 1.6 // 颤动 ±1.6 Hz
    lfo.connect(lfoG).connect(base.frequency)
    const h1 = c.createOscillator(); h1.type = 'triangle'; h1.frequency.value = 24
    const h2 = c.createOscillator(); h2.type = 'triangle'; h2.frequency.value = 48
    const hg = c.createGain(); hg.gain.value = 0
    h1.connect(hg); h2.connect(hg); hg.connect(lp); base.connect(lp); lp.connect(out); out.connect(this.dest)
    for (const o of [base, h1, h2, lfo]) o.start()
    this.nodes = { base, h1, h2, lfo, lfoG, hg, lp, out }; this.running = true; this.stopAt = 0
  }
  stop() {
    const n = this.nodes; if (!n) return
    for (const o of [n.base, n.h1, n.h2, n.lfo]) { try { o.stop() } catch { /* 已停 */ } o.disconnect() }
    n.out.disconnect(); this.nodes = null; this.running = false; this.stopAt = 0
  }
  /** 裂开：一声脆响（dist 衰减） */
  crack(dist: number) {
    const c = this.ctx, t = c.currentTime, att = 1 / (1 + (dist / 1.6) ** 2)
    const len = Math.floor(c.sampleRate * .12), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * .12))
    const src = c.createBufferSource(); src.buffer = buf
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600
    const g = c.createGain(); g.gain.setValueAtTime(.5 * att, t); g.gain.exponentialRampToValueAtTime(.001, t + .12)
    src.connect(hp).connect(g).connect(this.dest); src.start(t); src.stop(t + .13)
    for (const [f, a] of [[3150, .18], [4870, .1]] as const) {
      const o = c.createOscillator(), og = c.createGain(); o.type = 'sine'; o.frequency.value = f
      og.gain.setValueAtTime(a * att, t); og.gain.exponentialRampToValueAtTime(.001, t + .09)
      o.connect(og).connect(this.dest); o.start(t); o.stop(t + .1)
    }
    this.cracks++
  }
}
