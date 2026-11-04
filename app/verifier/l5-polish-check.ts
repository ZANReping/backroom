
import type { Engine } from '../src/game/engine'
import { audio } from '../src/game/core/audio'
import { canOccupy } from '../src/game/core/player'
import { floorHeight } from '../src/game/world/mapgen'
import { look } from '../src/game/renderer/shared'
import { beastSpawnPeripheral } from '../src/game/engine/beastAI'
import { hotelEnterPocket } from '../src/game/engine/l5Hotel'
import { ensureSpokes, findSpokes, findWindups } from '../src/game/engine/spokesAI'
import { findJazz, jazzDebug, jazzQaClock, jazzSite } from '../src/game/engine/jazzAI'
import { SPOKES_LOBBY } from '../src/game/content/spokesLayout'
import { OUTPOSTS } from '../src/game/content/outposts'
import { factionPanelOrder } from '../src/game/content/factionTerritory'
import { mapHeadingFromLookYaw } from '../src/game/content/l5Map'
import { mount as staffProbe } from './l5-staff-probe'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
function expect(value: unknown, label: string): asserts value { if (!value) throw Error(label) }
async function wait(check: () => unknown, label: string) {
  for (let i = 0; i < 280; i++) { if (check()) return; await sleep(100) }
  throw Error('Timeout ' + label)
}

export function mount(api: any) {
  const e = api.engine as Engine, r = api.renderer(), probe = staffProbe(api)
  const a = audio as any
  const aim = (x: number, y: number, pitch = 0) => {
    look.yaw = Math.atan2(e.player.x - x, e.player.y - y); look.pitch = pitch
  }
  const move = (x: number, y: number) => {
    const m = e.map!
    expect(canOccupy(m, x, y, .34, { z: floorHeight(m, x, y) }), 'Unsafe QA viewpoint')
    Object.assign(e.player, { x, y, z: floorHeight(m, x, y), vz: 0 })
  }
  const visible = (entity: { id: number; presentationPending?: boolean }) =>
    r.entityMeshes.get(entity.id)?.visible && !entity.presentationPending

  async function watch(trigger: () => void, ready: () => boolean, duration: number) {
    const canvas = document.createElement('canvas'); canvas.width = 48; canvas.height = 27
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const original = r.render
    let frames = 0, samples = 0, black = 0, min = 255, maxGapMs = 0, last = 0, lastSample = 0
    r.render = function (...args: unknown[]) {
      const result = original.apply(this, args)
      const now = performance.now()
      if (last) maxGapMs = Math.max(maxGapMs, now - last)
      last = now; frames++
      if (now - lastSample < 95) return result
      lastSample = now; samples++
      ctx.drawImage(r.three.domElement, 0, 0, 48, 27)
      const px = ctx.getImageData(0, 0, 48, 27).data
      let peak = 0
      for (let i = 0; i < px.length; i += 4) peak = Math.max(peak, px[i], px[i + 1], px[i + 2])
      min = Math.min(min, peak); if (peak <= 3) black++
      return result
    }
    try {
      await sleep(200)
      trigger()
      await wait(ready, 'visible entity')
      await sleep(duration)
    } finally { r.render = original }
    const result = { frames, samples, black, minPeak: min, maxGapMs: Math.round(maxGapMs), contextLost: r.three.getContext().isContextLost() }
    expect(samples >= 5 && !black && !result.contextLost, JSON.stringify(result))
    return result
  }
  return {
    icons: probe.showIcons,
    async beast() {
      const p = e.player
      const at = Array.from({ length: 32 }, (_, i) => i * Math.PI / 16).map(f => ({ x: p.x + 3 * Math.cos(f), y: p.y + 3 * Math.sin(f) }))
        .find(({ x, y }) => canOccupy(e.map!, x, y, .36, { z: p.z }) && e.los(p.x, p.y, x, y))
      expect(at, 'No corridor viewpoint')
      aim(at.x, at.y)
      let beast: ReturnType<typeof beastSpawnPeripheral>
      return watch(() => { beast = beastSpawnPeripheral(e, at); expect(beast, 'Peripheral Beast was not spawned') },
        () => !!beast && !!visible(beast) && beast.bst?.mode === 'peri', 1600)
    },
    async jazz() {
      await probe.moveToDining()
      const site = jazzSite(e), m = e.map!
      expect(site && m.inf, 'Restaurant not found')
      const x = site.audC.x - m.inf.ox, y = site.audC.y - m.inf.oy
      for (const [dx, dy] of [[0, 0], [0, .7], [0, -.7], [1, 0], [-1, 0]]) {
        if (canOccupy(m, x + dx, y + dy, .34, { z: 0 })) { move(x + dx, y + dy); break }
      }
      aim(site.stageC.x - m.inf.ox, site.stageC.y - m.inf.oy)
      e.dev.frozenAI = false
      const result = await watch(() => jazzQaClock(e, 0, 35),
        () => jazzDebug(e).phase === 'set' && findJazz(e).length === 4 && findJazz(e).every(entity => visible(entity) && entity.jz?.mode === 'play'), 1900)
      const clips = findJazz(e).map(entity => entity.jz?.clip)
      e.dev.frozenAI = true
      return { ...result, clips }
    },
    enterLobby() { expect(hotelEnterPocket(e, 'lobby'), 'Lobby transition unavailable'); return true },
    async rabbit() {
      const greeter = findSpokes(e)
      expect(greeter && e.player.level === 118, 'Lobby greeter missing')
      expect(a.bgmLevel === 118 && !a.jz && !a.phonoBuf && !a.phonoTimer, 'Hotel music leaked into the lobby')
      const spot = SPOKES_LOBBY.wind
      const point = [[0, 2.6], [-1.4, 2.1], [1.4, 2.1]].find(([dx, dy]) => canOccupy(e.map!, spot.x + dx, spot.y + dy, .34, { z: 0 }))
      expect(point, 'No rabbit release viewpoint')
      move(spot.x + point[0], spot.y + point[1]); aim(spot.x, spot.y, -.20)
      Object.assign(greeter, { x: spot.x, y: spot.y, z: floorHeight(e.map!, spot.x, spot.y), facing: spot.f })
      const state = ensureSpokes(greeter)
      const result = await watch(() => {
        Object.assign(state, { mode: 'wind', clip: 'windRabbit', modeT: 4.5, seq: state.seq + 1, applied: false })
        e.dev.frozenAI = false
      }, () => findWindups(e).some(visible), 1200)
      e.dev.frozenAI = true
      return { ...result, rabbits: findWindups(e).length }
    },
    uiOrder() {
      const defaultOrder = factionPanelOrder({ player: { level: 7 } } as Engine)
      const hotelOrder = factionPanelOrder(e)
      expect(hotelOrder[0] === 'terrorhotel', 'Hotel not pinned')
      expect(defaultOrder.indexOf('terrorhotel') === defaultOrder.indexOf('jerry') + 1 &&
        defaultOrder.indexOf('homely') === defaultOrder.indexOf('terrorhotel') + 1 &&
        !defaultOrder.includes('capital'), 'Default faction order')
      for (const site of Object.values(OUTPOSTS)) expect(factionPanelOrder({ player: { level: site.levelId } } as Engine)[0] === site.faction, 'Outpost pin ' + site.levelId)
      for (const [yaw, x, y] of [[0, 0, -1], [-Math.PI / 2, 1, 0], [Math.PI, 0, 1], [Math.PI / 2, -1, 0]]) {
        const heading = mapHeadingFromLookYaw(yaw)
        expect(Math.abs(Math.cos(heading) - x) < 1e-6 && Math.abs(Math.sin(heading) - y) < 1e-6, 'Map arrow heading')
      }
      return { defaultOrder, active: hotelOrder[0], outposts: Object.keys(OUTPOSTS).length, compassDirections: 4 }
    },
    async audio() {
      a.ensure(); await a.ctx.resume()
      a.setMuted(false); a.startBGM(5); a.setPhono(0)
      const load = a.loadSongBuf.bind(a)
      let calls = 0, resolveBuffer: (value: AudioBuffer) => void = () => {}
      const pending = new Promise<AudioBuffer>(resolve => { resolveBuffer = resolve })
      a.loadSongBuf = (id: string) => { if (id !== 'phono') return load(id); calls++; return pending }
      try {
        a.setBgmStyle('midi'); a.phonoO18 = false; a.phonoDecodeFailed = false
        for (let i = 0; i < 12; i++) a.setPhono(.98)
        expect(calls === 1, 'Duplicate phono decode requests')
        a.setPhono(.24)
        const part = { g: .65, pan: 0 }
        a.jazzBand({ song: 0, mode: 'set', solo: null, real: false, duck: .95,
          parts: { leader: part, sax: part, bass: part, drum: part, piano: part } })
        a.hotelMusic('play', -1, 0)
        expect(a.hotelFocus === 'jazz' && a.jz?.live && a.hotelWant === 0 && !a.phonoBuf, 'Band focus did not mute the other music')
        a.jazzBand(null)
        expect(a.hotelFocus === 'phono' && !a.jz.live && calls === 1, 'Phonograph did not regain focus')
        a.startBGM(1)
        resolveBuffer(a.ctx.createBuffer(1, 4410, a.ctx.sampleRate))
        await sleep(180)
        expect(!a.phonoBuf && !a.phonoGain && !a.phonoNoise && !a.phonoTimer && !a.jz, 'Late hotel sound after exit')
        const offline = new OfflineAudioContext(1, 44100, 44100)
        const telephone = new a.constructor()
        telephone.ctx = offline; telephone.sfx = offline.createGain()
        telephone.sfx.connect(offline.destination)
        telephone.conciergePhone(.6)
        const samples = (await offline.startRendering()).getChannelData(0)
        const ringPeak = samples.reduce((p, v) => Math.max(p, Math.abs(v)), 0)
        expect(ringPeak > .004 && ringPeak < .07, 'Concierge telephone volume')
        return { calls, focusSwitch: true, afterExit: a.hotelFocus, context: a.ctx.state, ringPeak }
      } finally { a.loadSongBuf = load; a.setMuted(true); a.startBGM(e.player.level) }
    },
  }
}

