import assert from 'node:assert/strict'
import { ENTITIES, ENTITY_FORMS, entityForm, entityForms, makeEntity } from '../src/game/entities'
import { initHound } from '../src/game/engine/houndAI'
import { initDuller } from '../src/game/engine/dullerAI'
import { initSkinStealer } from '../src/game/engine/skinStealerAI'
import { initClump } from '../src/game/engine/clumpAI'
import { initWretch, WRETCH_STATS, wretchLook, wretchKind, type WretchKind } from '../src/game/engine/wretchAI'

let checks = 0
const ok = (v: unknown, msg: string) => { assert.ok(v, msg); checks++ }
const eq = (a: unknown, b: unknown, msg: string) => { assert.deepEqual(a, b, msg); checks++ }

const parents = Object.keys(ENTITY_FORMS)
const forms = parents.flatMap(type => entityForms(type).map(form => ({ type, form })))
eq(forms.length, 33, 'forms registry has 33 entries')
eq(parents.length, 9, 'forms registry has 9 parent entities')
eq(entityForms('duller').length, 0, 'duller has no registered subforms')
eq(entityForms('clump').length, 2, 'clump has common and intelligent subforms')
eq(entityForms('faceling').length, 2, 'faceling has common and hostile subforms')
ok(!entityForm('duller', 'duller-empty'), 'removed duller form is not queryable')
ok(!entityForm('clump', 'clump-fasting'), 'removed clump fasting form is not queryable')
ok(!entityForm('faceling', 'faceling-tool'), 'removed faceling tool form is not queryable')
eq(new Set(forms.map(v => v.form.id)).size, forms.length, 'form IDs are globally unique')
for (const [type, list] of Object.entries(ENTITY_FORMS)) for (const f of list) {
  const e = makeEntity(type, 0, 0, 0, f.id)
  const formKey = type === 'deathmoth' ? 'mothForm' : type === 'smiler' ? 'smilerKind' : 'entityForm'
  eq((e.def as any)[formKey], f.id, `${f.id} records parent form`)
  for (const [key, value] of Object.entries(f.traits ?? {})) eq((e.def as any)[key], value, `${f.id} applies ${key}`)
  eq(e.hp, e.def.hp, `${f.id} initializes max hp`)
}
ok(!entityForm('hound', 'wretch-shambler'), 'wrong parent form does not match')
ok(!entityForm('wretch', 'hound-hostile'), 'wrong parent form does not match')
const baseline = JSON.stringify(ENTITIES)
makeEntity('wretch', 1, 1, 0, 'wretch-mutant')
makeEntity('clump', 1, 1, 0, 'clump-brick')
eq(JSON.stringify(ENTITIES), baseline, 'makeEntity does not mutate ENTITIES definitions')
const ids = forms.map(({ type, form }) => makeEntity(type, 0, 0, 0, form.id).id)
eq(new Set(ids).size, ids.length, 'form instances keep unique IDs')
const randomWretch = makeEntity('wretch', 0, 0)
ok(!randomWretch.def.entityForm && randomWretch.def.wretchKind === undefined, 'implicit form keeps natural wretch default')
const randomClump = makeEntity('clump', 0, 0)
ok(!randomClump.def.entityForm && randomClump.def.clumpWeapon === undefined, 'implicit form keeps natural clump default')

const engine = (level: number) => ({ levelDef: { id: level }, map: { inf: { ox: 0, oy: 0 }, entities: [] }, player: { x: 0, y: 0, z: 0 } } as any)
const hn = makeEntity('hound', 0, 0, 0, 'hound-neutral'); initHound(engine(3), hn); eq(hn.hd?.neutral, true, 'explicit neutral hound stays neutral on L3')
const hh = makeEntity('hound', 0, 0, 0, 'hound-hostile'); initHound(engine(11), hh); eq(hh.hd?.neutral, false, 'explicit hostile hound stays hostile on L11')
const he = makeEntity('hound', 0, 0, 0, 'hound-ambusher'); initHound(engine(3), he); eq(he.def.houndKind, 'ambusher', 'hound form writes kind')
const de = makeEntity('duller', 0, 0); de.def.dullerCarry = false; initDuller(engine(1), de); eq(de.dl?.carry, undefined, 'empty duller carries nothing')
const dc = makeEntity('duller', 0, 0); dc.def.dullerCarry = true; initDuller(engine(1), dc); ok(!!dc.dl?.carry, 'carrying duller receives an item')
const ss = makeEntity('skinstealer', 0, 0, 0, 'skinstealer-docile'); initSkinStealer(engine(1), ss); eq(ss.ss?.phase, 'docile', 'skin phase form is initial state')
const cb = makeEntity('clump', 0, 0); cb.def.l3clump = true; cb.def.clumpWeapon = 'brick'; cb.def.clumpFasting = false; initClump(engine(1), cb); eq(cb.cl?.weapon, 'brick', 'clump weapon debug state is initial state')
const injured = makeEntity('wretch', 0, 0, 0, 'wretch-mutant'); injured.hp = 1; initWretch(engine(1), injured); eq(injured.wr?.kind, 'mutant', 'wretch form selects AI kind'); eq(injured.hp, 1, 'wretch init preserves injured hp')
for (const kind of ['shambler', 'sprinter', 'smart', 'mutant'] as WretchKind[]) {
  const e = makeEntity('wretch', 0, 0, 0, `wretch-${kind}`), id = e.id
  initWretch(engine(1), e)
  eq(e.def.hp, WRETCH_STATS[kind].hp, `${kind} form stats match`)
  eq(wretchLook(id, kind).kind, e.wr?.kind, `${kind} look and AI agree`)
  eq(e.id, id, `${kind} initialization preserves identity`)
}
for (let n=0;n<30;n++) {
  const e = makeEntity('wretch',0,0), expected = wretchKind(e.id)
  initWretch(engine(1),e)
  eq(e.wr?.kind,expected,'unselected wretch retains deterministic natural kind')
}
console.log(`entity forms checks: ${checks} passed; ${forms.length} forms / ${parents.length} parents`)
