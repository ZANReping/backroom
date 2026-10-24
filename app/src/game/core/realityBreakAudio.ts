// RealityBreak 过场（前厅 → Level 0）专用合成音效：碎裂声、现实失真低鸣、坠落风声、撞击、黑场荧光灯嗡鸣。
// 全部为 WebAudio 运行时合成，挂在 GameAudio 的音效 / 环境总线上（受静音与分项音量控制）。
import { audio } from './audio'

export interface BreakAudio {
  crack(strength?: number): void
  /** 现实失真：持续低鸣（随 k 0..1 加深失真与下坠音高）。 */
  distort(k: number): void
  /** 坠落风声（k 0..1）。 */
  wind(k: number): void
  impact(): void
  /** 黑场嗡鸣（k 0..1）。 */
  hum(k: number): void
  stop(fade?: number): void
}

const SILENT: BreakAudio = { crack() {}, distort() {}, wind() {}, impact() {}, hum() {}, stop() {} }

function noiseBuffer(ctx: AudioContext, sec: number): AudioBuffer {
  const b = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * sec)), ctx.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function shaperCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 1024, c = new Float32Array(new ArrayBuffer(n * 4)), k = amount
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)) }
  return c
}

export function createBreakAudio(): BreakAudio {
  const nodes = audio.muted ? null : audio.fxNodes()
  if (!nodes) return SILENT
  const { ctx, sfx, amb } = nodes
  const now = () => ctx.currentTime
  const noise = noiseBuffer(ctx, 2)
  const live: AudioNode[] = []
  const keep = <T extends AudioNode>(n: T) => { live.push(n); return n }

  // 失真低鸣：两只失谐锯齿 → 波形整形 → 低通
  const dGain = keep(ctx.createGain()); dGain.gain.value = 0
  const dShape = keep(ctx.createWaveShaper()); dShape.curve = shaperCurve(4)
  const dLp = keep(ctx.createBiquadFilter()); dLp.type = 'lowpass'; dLp.frequency.value = 900
  const o1 = keep(ctx.createOscillator()); o1.type = 'sawtooth'; o1.frequency.value = 110
  const o2 = keep(ctx.createOscillator()); o2.type = 'sawtooth'; o2.frequency.value = 113.5
  o1.connect(dShape); o2.connect(dShape); dShape.connect(dLp).connect(dGain).connect(sfx)
  o1.start(); o2.start()

  // 风声：循环噪声 → 带通
  const wSrc = keep(ctx.createBufferSource()); wSrc.buffer = noise; wSrc.loop = true
  const wBp = keep(ctx.createBiquadFilter()); wBp.type = 'bandpass'; wBp.frequency.value = 500; wBp.Q.value = 0.7
  const wGain = keep(ctx.createGain()); wGain.gain.value = 0
  wSrc.connect(wBp).connect(wGain).connect(sfx); wSrc.start()

  // 荧光灯嗡鸣：60/120/180 Hz + 轻微高频嘶声（走环境总线）
  const hGain = keep(ctx.createGain()); hGain.gain.value = 0
  hGain.connect(amb)
  for (const [f, v, t] of [[60, 0.5, 'sine'], [120, 0.35, 'sawtooth'], [180, 0.12, 'square']] as const) {
    const o = keep(ctx.createOscillator()); o.type = t; o.frequency.value = f
    const g = keep(ctx.createGain()); g.gain.value = v * 0.18
    o.connect(g).connect(hGain); o.start()
  }
  const hissSrc = keep(ctx.createBufferSource()); hissSrc.buffer = noise; hissSrc.loop = true
  const hissHp = keep(ctx.createBiquadFilter()); hissHp.type = 'highpass'; hissHp.frequency.value = 6000
  const hissG = keep(ctx.createGain()); hissG.gain.value = 0.02
  hissSrc.connect(hissHp).connect(hissG).connect(hGain); hissSrc.start()

  let stopped = false
  const ramp = (p: AudioParam, v: number, tc = 0.08) => { if (!stopped) p.setTargetAtTime(v, now(), tc) }

  return {
    crack(strength = 1) {
      if (stopped) return
      const t = now()
      for (let i = 0; i < 3 + Math.round(strength * 3); i++) {
        const s = ctx.createBufferSource(); s.buffer = noise
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2200 + Math.random() * 3000
        const g = ctx.createGain()
        const at = t + i * (0.025 + Math.random() * 0.05)
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.32 * strength, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, at + 0.12 + Math.random() * 0.1)
        s.connect(hp).connect(g).connect(sfx)
        s.start(at, Math.random() * 1.5, 0.3); s.stop(at + 0.35)
      }
      // 低频断裂闷响
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5)
      const og = ctx.createGain(); og.gain.setValueAtTime(0.4 * strength, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
      o.connect(og).connect(sfx); o.start(t); o.stop(t + 0.65)
    },
    distort(k) {
      ramp(dGain.gain, 0.16 * k)
      ramp(o1.frequency, 110 - 75 * k, 0.3); ramp(o2.frequency, 113.5 - 70 * k + Math.sin(now() * 7) * 4 * k, 0.3)
      ramp(dLp.frequency, 900 - 500 * k, 0.3)
    },
    wind(k) { ramp(wGain.gain, 0.5 * k, 0.15); ramp(wBp.frequency, 380 + 1400 * k, 0.2) },
    impact() {
      if (stopped) return
      const t = now()
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.45)
      const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7)
      o.connect(g).connect(sfx); o.start(t); o.stop(t + 0.75)
      const s = ctx.createBufferSource(); s.buffer = noise
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.6, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
      s.connect(lp).connect(ng).connect(sfx); s.start(t, 0, 0.4)
      ramp(dGain.gain, 0, 0.03); ramp(wGain.gain, 0, 0.03)
    },
    hum(k) { ramp(hGain.gain, 0.9 * k, 0.4) },
    stop(fade = 0.6) {
      if (stopped) return
      for (const g of [dGain, wGain, hGain]) g.gain.setTargetAtTime(0, now(), fade / 3)
      stopped = true
      window.setTimeout(() => {
        for (const n of live) { try { (n as AudioScheduledSourceNode).stop?.() } catch { /* 已停止 */ } try { n.disconnect() } catch { /* */ } }
      }, fade * 1000 + 200)
    },
  }
}
