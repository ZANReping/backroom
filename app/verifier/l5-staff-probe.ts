import { ensureBellhop } from '../src/game/engine/bellhopAI'
import { ensureConcierge } from '../src/game/engine/conciergeAI'
import { ensureMaid } from '../src/game/engine/maidAI'
import { ensureSpokes, ensureWindup } from '../src/game/engine/spokesAI'
import { chefSiteAt } from '../src/game/content/chefLayout'
import { ensureChef, findChef } from '../src/game/engine/chefAI'
import { ensureJazz, findJazz } from '../src/game/engine/jazzAI'
import { beastDealView, beastPress, beastSave, ensureBeast, findBeast } from '../src/game/engine/beastAI'
import { l5TileReader, pageKeyOf, TC } from '../src/game/content/l5Map'
import { requestDevMapPreview } from '../src/game/engine/devMap'
import { makeEntity } from '../src/game/entities'
import { canOccupy } from '../src/game/core/player'
import { floorHeight } from '../src/game/world/mapgen'
import { look } from '../src/game/renderer/shared'

export function mount(api: any) {
  const e = api.engine, r = api.renderer()
  e.dev.frozenAI = true; e.dev.god = true; e.dev.statLock = true; e.introT = 0; e.handsStowed = true
  e.map.entities = []
  let beforeMaps: string[] = []
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  const mapImages = () => ['[data-l5-minimap]', '[data-l5-bigmap]'].map(q => (document.querySelector(q) as HTMLCanvasElement).toDataURL())
  const items = ['mahjongtile', 'key437', 'bagTag', 'roomtea', 'gentletter', 'spokesposter', 'spokesphoto', 'detbadge',
    'windupgear', 'chefpot', 'megcamera', 'megmic', 'megform', 'habanero', 'chefphoto', 'roomcard',
    'fatedie', 'brokendie', 'diereceipt', 'brokenrecord', 'silencejuice', 'mysteryegg']
  return {
    async moveToDining() {
      const seed = e.map.inf.seed
      const choices = []
      for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
        const site = chefSiteAt(seed, x, y)
        if (site) choices.push(site)
      }
      choices.sort((a, b) => Math.hypot(a.front.x, a.front.y) - Math.hypot(b.front.x, b.front.y))
      const site = choices[0]
      if (!site) throw Error('No dining site')
      e.map.entities = []
      const { ox, oy } = e.map.inf
      Object.assign(e.player, { x: site.front.x + 1 - ox, y: site.hall.y1 - 1.5 - oy, z: 0, vz: 0 })
      e.updateInfiniteWindow()
      for (let i = 0; i < 60 && (!findChef(e) || !findJazz(e).length); i++) await sleep(150)
      if (!findChef(e) || !findJazz(e).length) throw Error('Restaurant employees did not spawn')
      return { worldX: e.player.x + e.map.inf.ox, worldY: e.player.y + e.map.inf.oy }
    },
    async showIcons() {
      for (let i = 0; i < 7; i++) e.player.hotbar[i] = { type: items[i], count: 1 }
      const images = await Promise.all(items.map(async type => {
        const image = new Image()
        image.src = '/textures/icons/pixel/item_' + type + '.png'
        await image.decode()
        return image.naturalWidth === 128 && image.naturalHeight === 128
      }))
      await sleep(250)
      const hotbar = items.slice(0, 7).every(type => document.querySelector('img.pixel-icon[src$="item_' + type + '.png"]'))
      if (!hotbar || !images.every(Boolean)) throw Error('Missing pixel icon')
      return { decoded: images.length, hotbar }
    },
    async mapBefore() {
      await sleep(450)
      beforeMaps = mapImages()
      return true
    },
    async mapReveal() {
      const m = e.map, key = pageKeyOf(e)!
      const unexplored = e.explored.findIndex((v: number) => v === 0)
      if (unexplored < 0) throw Error('Expected unexplored tiles')
      const wx = m.inf.ox + unexplored % m.w, wy = m.inf.oy + Math.floor(unexplored / m.w)
      e.dev.mapReveal = true
      await sleep(600)
      const revealed = mapImages()
      const farX = m.inf.ox + m.w + 64, farY = m.inf.oy + 20
      const preview = await requestDevMapPreview(e, { x: farX, y: farY, span: 32, floor: 0 }, new AbortController().signal)
      const live = l5TileReader(e, key)(wx, wy), far = l5TileReader(e, key, preview.cells)(farX, farY)
      const other = l5TileReader(e, key === 'f1' ? 'f2' : 'f1', preview.cells)(farX, farY)
      e.dev.mapReveal = false
      await sleep(650)
      const restored = mapImages()
      const localUnknown = l5TileReader(e, key)(wx, wy)
      if (!revealed.every((value, i) => value !== beforeMaps[i]) || !restored.every((value, i) => value === beforeMaps[i]) ||
          live === TC.unknown || far === TC.unknown || other !== TC.unknown || localUnknown !== TC.unknown || e.explored[unexplored] !== 0 || e.map !== m) {
        throw Error('Map reveal or persistence failed')
      }
      return { largeAndMini: true, fogRestored: true, previewChunks: preview.cells.length, noExplorationWrites: true }
    },
    openDeal() {
      const b = findBeast(e)
      if (!b) throw Error('Office Beast missing')
      e.dev.frozenAI = false; e.dev.statLock = false; e.dev.god = false
      e.player.x = b.x + Math.cos(b.facing) * 1.55
      e.player.y = b.y + Math.sin(b.facing) * 1.55
      look.yaw = Math.PI / 2 - b.facing; look.pitch = 0
      e.specialPressed = true
      if (!beastPress(e)) throw Error('Cannot start normal deal')
      return true
    },
    beastState() {
      const sv = beastSave(e)
      return { sanity: e.player.sanity, attn: e.hotel.attn, strikes: sv.strikes, cut: sv.sanCut,
        phase: findBeast(e)?.bst?.mode, pending: sv.officeOffense, forced: !!sv.forced, deal: beastDealView(e)?.forced }
    },
    tryOfficeExit() {
      const def = e.map.exits.find((s: any) => s.def.dest === 'back')?.def
      if (!def) throw Error('Office exit missing')
      e.takeExit(def)
      return !!e.transition
    },
    async show(type: string) {
      const p = e.player, m = e.map
      const offsets = Array.from({ length: 32 }, (_, i) => i * Math.PI / 16)
      const at = offsets.map(a => ({ x: p.x + 3 * Math.cos(a), y: p.y + 3 * Math.sin(a), a }))
        .find(({ x, y }) => e.los(p.x, p.y, x, y) && canOccupy(m, x, y, .35, { z: p.z }))
      if (!at) throw Error('No clear spawn direction')
      look.yaw = -Math.PI / 2 - at.a; look.pitch = 0
      const natural = type === 'chef' ? findChef(e) : type === 'jazz' ? findJazz(e)[0] : undefined
      const entity = natural ?? makeEntity(type, at.x, at.y, floorHeight(m, at.x, at.y))
      Object.assign(entity, { x: at.x, y: at.y, z: floorHeight(m, at.x, at.y), facing: at.a + Math.PI })
      if (!natural) e.map.entities = [entity]
      const frames: number[] = []
      let time = performance.now()
      const start = time
      await new Promise<void>(resolve => {
        const tick = (now: number) => {
          frames.push(now - time); time = now
          const mesh = r.entityMeshes.get(entity.id)
          if (now - start > 22000 || (frames.length >= 45 && mesh?.visible && !entity.presentationPending)) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const grp = r.entityMeshes.get(entity.id)
      if (!grp?.visible || entity.presentationPending) throw Error('Unready staff ' + type)
      const clip = (() => {
        if (type === 'concierge') return Object.assign(ensureConcierge(entity), { clip: 'armWatch', modeT: 1.4 })
        if (type === 'bellhop') return Object.assign(ensureBellhop(entity), { clip: 'faceShift', modeT: .8, face: 2 })
        if (type === 'maid') return Object.assign(ensureMaid(entity), { clip: 'clean', modeT: 1.3 })
        if (type === 'greeter') return Object.assign(ensureSpokes(entity), { clip: 'bowInvite', modeT: 1.5 })
        if (type === 'windup') return Object.assign(ensureWindup(entity), { clip: 'rabbitHop', modeT: .4 })
        if (type === 'beast') return Object.assign(ensureBeast(entity), { mode: 'reveal', clip: 'reveal', modeT: 3.1 })
        if (type === 'jazz') return Object.assign(ensureJazz(entity), { clip: 'trumpetPlay', modeT: 1.5 })
        return Object.assign(ensureChef(entity), { clip: 'potSwing', modeT: 1.4, vis: 1 })
      })()
      clip.seq++
      if (type === 'concierge') {
        entity.x = p.x + Math.cos(at.a) * 1.1
        entity.y = p.y + Math.sin(at.a) * 1.1
        p.facing = at.a; e.handsStowed = false; e.attackCooldownT = 0
        p.hotbar[p.selected] = null
        e.attack()
        e.handsStowed = true
        if (!(entity.stunT > 0)) throw Error('Test punch did not hit concierge')
        await sleep(400)
        if (grp.rotation.z !== 0) throw Error('Generic hit wobble reached concierge')
      } else await sleep(460)
      let finite = true, meshes = 0
      grp?.traverseVisible((o: any) => {
        if (o.isMesh) meshes++
        finite &&= o.matrixWorld.elements.every(Number.isFinite)
      })
      return { type, clip: clip.clip, frames: frames.length, maxFrameMs: Math.max(...frames), visible: grp?.visible === true,
        meshes, finite, present: e.map.entities.includes(entity), pending: !!entity.presentationPending, draws: r.three.info.render.calls,
        programs: r.three.info.programs.length, contextLost: r.three.getContext().isContextLost() }
    },
  }
}
