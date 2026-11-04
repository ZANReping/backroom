/** Small procedural toilet gag sound.  No external asset or AudioContext is created here. */

export interface ToiletAudioNodes {
  ctx: AudioContext
  sfx: GainNode
}

/**
 * Render a short, deliberately cartoonish low rumble with three soft air pulses.
 * The seed only changes the fine noise and a tiny pitch offset, so repeated
 * interactions remain recognisable without sounding identical.
 */
export function fartSamples(sampleRate: number, seed = 1): Float32Array {
  const rate = Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 44100
  const length = Math.max(1, Math.round(rate * 0.70))
  const out = new Float32Array(length)
  let state = (seed | 0) ^ 0x6d2b79f5
  const random = () => {
    state = Math.imul(state ^ (state >>> 15), state | 1)
    state ^= state + Math.imul(state ^ (state >>> 7), state | 61)
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296
  }
  const pitch = 1 + (((seed | 0) % 9) - 4) * 0.006
  let smoothNoise = 0
  for (let i = 0; i < length; i++) {
    const t = i / rate
    const u = i / Math.max(1, length - 1)
    const edge = Math.min(1, u / 0.035, (1 - u) / 0.055)
    const fade = Math.max(0, edge)

    // Three overlapping pulses, each with a soft attack/release.
    let pulse = 0
    for (const [at, width, gain] of [[0.055, 0.16, 1], [0.265, 0.18, 0.78], [0.485, 0.15, 0.58]] as const) {
      const q = (t - at) / width
      if (q >= 0 && q <= 1) pulse += Math.sin(Math.PI * q) ** 0.72 * gain
    }
    const phase = 2 * Math.PI * (70 * t - 20 * t * t) * pitch
    const rumble = Math.sin(phase) * 0.28 + Math.sin(phase * 2.03 + 0.3) * 0.09
    const rawNoise = random() * 2 - 1
    smoothNoise += (rawNoise - smoothNoise) * 0.16
    const air = smoothNoise * 0.18 + rawNoise * 0.025
    const value = (rumble * pulse * 0.78 + air * pulse * 0.52) * fade
    out[i] = Math.max(-0.5, Math.min(0.5, Number.isFinite(value) ? value : 0))
  }
  return out
}

/** Play through the already-unlocked game SFX bus. Returns false if unavailable. */
export function playToiletFart(nodes: ToiletAudioNodes | null, seed = Date.now()): boolean {
  if (!nodes || !nodes.ctx || !nodes.sfx || nodes.ctx.state !== 'running') return false
  const { ctx, sfx } = nodes
  const samples = fartSamples(ctx.sampleRate, seed)
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate)
  buffer.getChannelData(0).set(samples)
  const source = ctx.createBufferSource()
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.62, ctx.currentTime)
  source.buffer = buffer
  source.connect(gain).connect(sfx)
  source.onended = () => {
    source.disconnect()
    gain.disconnect()
  }
  source.start()
  source.stop(ctx.currentTime + samples.length / ctx.sampleRate + 0.01)
  return true
}
