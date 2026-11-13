// The same ballast and tube noise for the RealityBreak finale and its in-world sources.
export function createFluorescentHum(
  ctx: AudioContext,
  destination: AudioNode,
  hiss: AudioBufferSourceNode,
) {
  const output = ctx.createGain()
  output.gain.value = 0
  output.connect(destination)
  const nodes: AudioNode[] = [output, hiss]
  const sources: AudioScheduledSourceNode[] = [hiss]
  for (const [frequency, amplitude, type] of [[60, .5, 'sine'], [120, .35, 'sawtooth'], [180, .12, 'square']] as const) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.value = frequency
    gain.gain.value = amplitude * .18
    osc.connect(gain).connect(output)
    osc.start()
    sources.push(osc)
    nodes.push(osc, gain)
  }

  const hp = ctx.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 6000
  const hissGain = ctx.createGain()
  hissGain.gain.value = .02
  hiss.connect(hp).connect(hissGain).connect(output)
  hiss.start()
  nodes.push(hp, hissGain)

  let stopped = false
  let target = 0
  return {
    setLevel(level: number, tau = .4) {
      if (stopped || level === target || (level > 0 && Math.abs(level - target) < .001)) return
      target = level
      output.gain.setTargetAtTime(.9 * level, ctx.currentTime, tau)
    },
    stop(fade = .25) {
      if (stopped) return
      stopped = true
      const now = ctx.currentTime
      const end = now + fade
      if (fade > 0) output.gain.setTargetAtTime(0, now, fade / 4)
      hiss.onended = () => { for (const node of nodes) node.disconnect() }
      for (const source of sources) source.stop(end)
    },
  }
}
