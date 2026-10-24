import assert from 'node:assert/strict'
const memory = new Map<string, string>()
Object.assign(globalThis, {
  document: { createElement: () => ({ getContext: () => null }), createElementNS: () => ({ addEventListener() {}, removeEventListener() {} }) },
  window: { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout, matchMedia: () => ({ matches: false }) },
  localStorage: { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => memory.set(k, v), removeItem: (k: string) => memory.delete(k) },
})
const { Engine } = await import('../src/game/engine')
const { newPhoneState, updatePhone, takePhoto, togglePhoneTorch } = await import('../src/game/engine/phone')
let checks = 0
const eq = (a: unknown, b: unknown, s: string) => { assert.equal(a, b, s); checks++ }
const ok = (v: unknown, s: string) => { assert(v, s); checks++ }
const fresh = () => { const e = new Engine(); e.newRun(20261024, 'normal', 'slot1', true, 0); e.player.phone = newPhoneState(); e.player.equip.offhand = { type: 'phone', count: 1 }; return e }

const e = fresh(); e.devEnabled = true; e.dev.statLock = true; e.player.phone!.docked = false; e.player.phone!.battery = 0; e.player.phone!.torch = true; e.phoneScreenOn = true
updatePhone(e, 10); eq(e.player.phone!.battery, 100, 'locked update restores empty battery'); eq(e.player.phone!.torch, true, 'locked keeps in-hand torch'); eq(e.phoneScreenOn, true, 'locked keeps screen')
e.player.phone!.docked = true; e.player.phone!.torch = true; updatePhone(e, 1); eq(e.player.phone!.battery, 100, 'locked docked full'); eq(e.player.phone!.torch, false, 'docked still turns torch off')
e.player.phone!.docked = false; e.player.equip.offhand = { type: 'flashlight', count: 1 }; e.player.phone!.torch = true; updatePhone(e, 1); eq(e.player.phone!.torch, false, 'not in hand still turns torch off'); eq(e.player.phone!.battery, 100, 'locked nonhand full')
e.player.equip.offhand = { type: 'phone', count: 1 }; e.player.phone!.battery = 0; const p0 = e.player.phone!.photos; ok(takePhoto(e) !== null, 'locked photo succeeds'); eq(e.player.phone!.battery, 100, 'locked photo no drain'); eq(e.player.phone!.photos, p0 + 1, 'locked photo records')
e.player.phone!.battery = 0; ok(togglePhoneTorch(e), 'locked torch toggle succeeds'); eq(e.player.phone!.battery, 100, 'locked toggle restores battery')
e.dev.statLock = false; e.player.phone!.battery = 50; updatePhone(e, 10); ok(e.player.phone!.battery < 50, 'disabling lock restores drain')
e.dev.statLock = true; e.devEnabled = false; e.player.phone!.battery = 50; updatePhone(e, 10); ok(e.player.phone!.battery < 50, 'dev disabled does not lock battery')
const absent = new Engine(); absent.newRun(9, 'normal', 'slot1', true, 0); absent.player.phone = undefined; const before = absent.player.phone; eq(togglePhoneTorch(absent), false, 'no phone torch rejected'); eq(takePhoto(absent), null, 'no phone photo rejected'); eq(absent.player.phone, before, 'no phone is not created')
const dead = fresh(); dead.devEnabled = false; dead.player.phone!.docked = false; dead.player.phone!.battery = 0; dead.player.phone!.torch = true; dead.phoneScreenOn = true; updatePhone(dead, 1); eq(dead.player.phone!.battery, 0, 'normal empty battery stays empty'); eq(dead.player.phone!.torch, false, 'normal empty battery turns torch off'); eq(dead.phoneScreenOn, false, 'normal empty battery turns screen off')
console.log(JSON.stringify({ ok: true, checks }))
