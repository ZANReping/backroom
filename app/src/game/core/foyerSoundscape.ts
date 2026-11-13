import { createFluorescentHum } from './fluorescentHum'

export interface FoyerAudioMix {
  home: number
  traffic: number
  hum: number
  humPan: number
  x: number
  y: number
  yaw: number
}

const CHORDS = [
  [50, 57, 61, 64, 66], // Dmaj9
  [47, 54, 57, 61, 66], // Bm9
  [43, 55, 59, 62, 66], // Gmaj7
  [45, 52, 57, 62, 64], // Asus4
] as const
const MELODY = [69, 0, 73, 71, 66, 0, 69, 0, 67, 0, 71, 69, 64, 0, 66, 0, 73, 0, 76, 74, 73, 0, 69, 0, 71, 0, 74, 73, 69, 0, 64, 0]
const ROAD_Y = 53
const CAR_SPEED = 12
const CAR_DURATION = 5

interface Car {
  start: number
  x: number
  direction: number
  noise: AudioBufferSourceNode
  gain: GainNode
  pan: StereoPannerNode
  engine: OscillatorNode
  enginePitch: number
}

function stereoPan(dx: number, dy: number, yaw: number, distance: number) {
  return (dx * Math.cos(yaw) - dy * Math.sin(yaw)) / Math.max(4, distance)
}

export class FoyerSoundscape {
  private readonly home: GainNode
  private readonly alleyPan: StereoPannerNode
  private readonly notes = new Set<OscillatorNode>()
  private alleyHum: ReturnType<typeof createFluorescentHum> | null = null
  private homeLevel = 0
  private nextBeat = 0
  private beat = 0
  private car: Car | null = null
  private nextCar = 0
  private direction = 1

  private readonly ctx: AudioContext
  private readonly ambient: AudioNode
  private readonly noiseSource: () => AudioBufferSourceNode

  constructor(ctx: AudioContext, music: AudioNode, ambient: AudioNode, noiseSource: () => AudioBufferSourceNode) {
    this.ctx = ctx
    this.ambient = ambient
    this.noiseSource = noiseSource
    this.home = ctx.createGain()
    this.home.gain.value = 0
    this.home.connect(music)
    this.alleyPan = ctx.createStereoPanner()
    this.alleyPan.connect(ambient)
  }

  update(mix: FoyerAudioMix) {
    const time = this.ctx.currentTime
    if (mix.home !== this.homeLevel) {
      this.homeLevel = mix.home
      this.home.gain.setTargetAtTime(mix.home, time, .28)
    }
    if (mix.home > 0 && time >= this.nextBeat) {
      this.playBedroomBeat(time)
      this.nextBeat = time + 1.06
    }

    if (mix.hum > 0) {
      this.alleyHum ??= createFluorescentHum(this.ctx, this.alleyPan, this.noiseSource())
      this.alleyPan.pan.setTargetAtTime(mix.humPan, time, .1)
    }
    this.alleyHum?.setLevel(mix.hum, .24)

    if (mix.traffic <= 0) {
      if (this.car) this.fadeCar(this.car, time)
      this.nextCar = time
      return
    }
    if (!this.car && time >= this.nextCar) this.startCar(time, mix.x)
    const car = this.car
    if (!car) return
    const elapsed = time - car.start
    const dx = car.x + car.direction * CAR_SPEED * (elapsed - CAR_DURATION / 2) - mix.x
    const dy = ROAD_Y + car.direction * 1.5 - mix.y
    const distance = Math.hypot(dx, dy)
    const pitch = car.enginePitch * (1 - .065 * car.direction * dx / Math.max(1, distance))
    const edge = Math.max(0, Math.min(elapsed * 2.5, (CAR_DURATION - elapsed) * 2.5, 1))
    car.engine.frequency.setTargetAtTime(pitch, time, .09)
    car.pan.pan.setTargetAtTime(stereoPan(dx, dy, mix.yaw, distance), time, .1)
    car.gain.gain.setTargetAtTime(mix.traffic * edge / (1 + distance * distance / 36), time, .085)
  }

  stop() {
    this.home.disconnect()
    for (const note of this.notes) note.stop()
    this.alleyHum?.stop(0)
    this.alleyPan.disconnect()
    if (this.car) this.fadeCar(this.car, this.ctx.currentTime)
  }

  private playBedroomBeat(time: number) {
    const beat = this.beat++ % MELODY.length
    if (beat % 4 === 0) {
      const chord = CHORDS[Math.floor(beat / 4) % CHORDS.length]
      chord.forEach((note, i) => this.playNote(note, time + i * .08, i === 0 ? .027 : .013, 4.3, .55))
    }
    if (MELODY[beat]) this.playNote(MELODY[beat], time + .14, .033, 2.6, .085)
  }

  private playNote(note: number, time: number, volume: number, duration: number, attack: number) {
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = attack > .1 ? 'sine' : 'triangle'
    osc.frequency.value = 440 * 2 ** ((note - 69) / 12)
    gain.gain.setValueAtTime(.0001, time)
    gain.gain.exponentialRampToValueAtTime(volume, time + attack)
    gain.gain.exponentialRampToValueAtTime(.0001, time + duration)
    osc.connect(gain).connect(this.home)
    this.notes.add(osc)
    osc.onended = () => { this.notes.delete(osc); osc.disconnect(); gain.disconnect() }
    osc.start(time)
    osc.stop(time + duration)
  }

  private startCar(time: number, x: number) {
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.value = 0
    const pan = ctx.createStereoPanner()
    gain.connect(pan).connect(this.ambient)

    const noise = this.noiseSource()
    const tire = ctx.createBiquadFilter()
    tire.type = 'bandpass'
    tire.frequency.value = 460 + Math.random() * 220
    tire.Q.value = .55
    const tireGain = ctx.createGain()
    tireGain.gain.value = .33
    noise.connect(tire).connect(tireGain).connect(gain)

    const engine = ctx.createOscillator()
    const enginePitch = 48 + Math.random() * 22
    engine.type = 'sawtooth'
    engine.frequency.value = enginePitch
    const muffler = ctx.createBiquadFilter()
    muffler.type = 'lowpass'
    muffler.frequency.value = 190
    const engineGain = ctx.createGain()
    engineGain.gain.value = .12
    engine.connect(muffler).connect(engineGain).connect(gain)

    const car = { start: time, x: Math.max(30, Math.min(x, 150)), direction: this.direction, noise, gain, pan, engine, enginePitch }
    this.car = car
    this.direction *= -1
    this.nextCar = time + 6.4 + Math.random() * 4
    noise.onended = () => {
      for (const node of [noise, tire, tireGain, engine, muffler, engineGain, gain, pan]) node.disconnect()
      if (this.car === car) this.car = null
    }
    noise.start(time)
    engine.start(time)
    noise.stop(time + CAR_DURATION)
    engine.stop(time + CAR_DURATION)
  }

  private fadeCar(car: Car, time: number) {
    car.gain.gain.setTargetAtTime(0, time, .075)
    // Do not extend the pass if it was already about to end.
    const end = Math.min(time + .33, car.start + CAR_DURATION)
    car.noise.stop(end)
    car.engine.stop(end)
    this.car = null
  }
}
