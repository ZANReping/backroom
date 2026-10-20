import { DEFAULT_AVATAR, saveAvatar } from '../src/game/core/avatar'
import { ITEMS } from '../src/game/content/items'
import { updateItemUse } from '../src/game/engine/inventory'

/** Runs production Engine/Renderer objects in the isolated single-player QA page. */
export async function verifyHands(qa: any) {
  const e = qa.eng, r = qa.r, p = e.player
  let checks = 0
  const ok = (v: unknown, message: string) => { if (!v) throw Error(message); checks++ }
  const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  const settle = async () => { await frame(); await frame() }
  const hold = async (type: string) => {
    e.usingItem = null; e.attackAnimT = 0; e.attackCooldownT = 0; e.inspectHeld = false; e.gunCandyT = 0
    p.selected = 0; p.hotbar[0] = type ? { type, count: 2 } : null
    await settle()
  }
  e.paused = false; e.handsHidden = false
  saveAvatar({ ...DEFAULT_AVATAR, topStyle: 3 })
  await hold('crowbar')
  ok(r.vmParts.right.skin.geometry.attributes.position.count > 1000, 'Production right hand has segmented fingers')
  ok(r.vmParts.left.skin.geometry.attributes.position.count > 1000, 'Production left hand has segmented fingers')
  ok(r.vmFlash.visible, 'Equipped flashlight visible')
  const switches = []
  for (const type of ['', ...Object.keys(ITEMS), 'guncandy']) {
    const start = performance.now()
    if (type === 'guncandy') { e.gunCandyT = 30; await settle() } else await hold(type)
    const h = r.vmParts.right
    ok([...h.skin.geometry.attributes.position.array].every(Number.isFinite), type + ' finite hand geometry')
    ok([...h.group.position, ...h.group.quaternion].every(Number.isFinite), type + ' finite grip transform')
    ok(r.vmHeld === type, type + ' selected production viewmodel')
    switches.push({ type, milliseconds: performance.now() - start, triangles: h.skin.geometry.attributes.position.count / 3 + h.sleeve.geometry.attributes.position.count / 3 })
  }
  await hold('crowbar')
  const grip = r.vmParts.right.skin.geometry
  await hold('knife'); await hold('crowbar')
  ok(r.vmParts.right.skin.geometry === grip, 'Hotbar return reuses cached contact geometry')
  e.inspectHeld = true
  for (let i = 0; i < 30; i++) await frame()
  ok(r.inspectK > .3 && r.vmParts.right.group.quaternion.angleTo(r.vmHandQ) > .01, 'Inspection moves the hand')
  e.inspectHeld = false
  for (let i = 0; i < 150; i++) await frame()
  ok(r.vmParts.right.group.quaternion.angleTo(r.vmHandQ) < .01, 'Inspection returns to grip')
  await hold('almond')
  ok(e.useSlot('hotbar', 0), 'Drinking starts via production inventory')
  updateItemUse(e, e.usingItem.dur * .5); await settle()
  ok(e.usingItem.anim === 'bottleDrink' && r.vm.rotation.x > 1, 'Bottle drinking pose uses live timer')
  updateItemUse(e, e.usingItem.dur); await settle()
  ok(!e.usingItem && p.hotbar[0].count === 1, 'Drinking consumes once')
  await hold('glowstick'); const count = e.projectiles.length
  e.attack(); await settle()
  ok(e.attackAnimKind === 'throw' && e.projectiles.length === count + 1 && p.hotbar[0].count === 1, 'Throw still creates one projectile and spends one item')
  // Physics is frozen in this fixture; retire the tested projectile before
  // taking portraits so its near-camera glow does not cover the hands.
  e.projectiles = []; await settle()
  await hold('crowbar'); e.attack(); await settle()
  ok(e.attackAnimKind === 'swing' && r.vm.rotation.x !== 0, 'Weapon swing preserved')
  p.equip.gloves = { type: 'gloves', count: 1 }; p.equip.body = { type: 'suit', count: 1 }; e.syncPassives(); await settle()
  ok(r.vmParts.right.skin.material.color.getHexString() === 'b89a2e' && r.vmParts.left.skin.material.color.getHexString() === 'b89a2e', 'Gloves applied to both hands')
  ok(r.vmParts.right.sleeve.material.map === null && r.vmParts.right.sleeve.visible, 'Protective suit uses plain long sleeve')
  p.equip.gloves = null; p.equip.body = null; e.syncPassives()
  for (const topStyle of [0, 5, 3]) {
    saveAvatar({ ...DEFAULT_AVATAR, topStyle }); await settle()
    ok(r.vmParts.right.sleeve.visible === (topStyle === 3), 'Sleeve length follows avatar ' + topStyle)
  }
  p.equip.offhand = { type: 'lighter', count: 1 }; e.syncPassives(); await settle()
  ok(r.vmLighter.visible && !r.vmFlash.visible && r.vmLighterHand.skin.geometry.attributes.position.count > 1000, 'Lighter uses independent left-hand grip')
  e.handsHidden = true; await settle(); ok(!r.vm.visible && !r.vmLighter.visible, 'Immersive mode hides all hands'); e.handsHidden = false
  e.paused = true; await settle(); ok(!r.vm.visible, 'Pause hides hands'); e.paused = false
  p.equip.offhand = { type: 'flashlight', count: 1 }; e.syncPassives(); p.flashlight = true
  const cycles = []
  for (let round = 0; round < 4; round++) {
    for (const type of ['crowbar', 'knife', 'axe', 'wrench', 'almond', 'luckymilk', 'squirtgun', 'glowstick']) await hold(type)
    await settle(); cycles.push({ ...r.three.info.memory })
  }
  ok(cycles.slice(1).every(c => c.geometries === cycles[1].geometries && c.textures === cycles[1].textures), 'Repeated hotbar swaps stabilize GPU resources')
  for (const mode of ['classic', 'realistic']) {
    qa.mode(mode); await hold('crowbar'); await qa.warm()
    ok(r.vmParts.right.sleeve.material.map?.userData.retroShared && !r.vmParts.right.sleeve.material.map?.userData.loadError, mode + ' shared sleeve texture loaded')
  }
  const view = async (name: string) => {
    if (name === 'dark') { await qa.anchor('blackout'); e.paused = false; p.flashlight = true; await hold('crowbar'); await qa.warm(); return }
    saveAvatar({ ...DEFAULT_AVATAR, topStyle: name === 'short' ? 0 : 3 })
    p.equip.gloves = name === 'gloves' ? { type: 'gloves', count: 1 } : null
    p.equip.offhand = { type: name === 'lighter' ? 'lighter' : 'flashlight', count: 1 }
    e.syncPassives(); p.flashlight = name !== 'lighter'
    await hold(name === 'drink' ? 'almond' : name === 'squirtgun' ? name : name === 'inspect' ? 'axe' : 'crowbar')
    if (name === 'drink') { e.useSlot('hotbar', 0); updateItemUse(e, e.usingItem.dur * .5) }
    if (name === 'inspect') { e.inspectHeld = true; for (let i = 0; i < 90; i++) await frame() }
    await settle()
  }
  ;(window as any).handsView = view
  return { checks, switches, cycles, stats: qa.stats() }
}
