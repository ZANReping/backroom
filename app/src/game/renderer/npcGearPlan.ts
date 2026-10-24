import type { NpcDef } from '../content/npcs'

export type NpcGearSpec = {
  kind: NpcGearKind
  variant?: string
  color?: string
  side?: 'left' | 'right'
  slot?: 'head' | 'chest' | 'waist'
}

export type NpcGearKind =
  | 'hat' | 'band' | 'goggles' | 'glasses' | 'headset' | 'feather' | 'necklace'
  | 'scarf' | 'collar' | 'mask' | 'apron' | 'strap' | 'belt' | 'pouch' | 'badge'
  | 'epaulette' | 'keys' | 'pen' | 'towel' | 'book' | 'clipboard' | 'tool' | 'cup'
  | 'tray' | 'abacus' | 'guitar' | 'bird' | 'jar' | 'scale' | 'bow' | 'gloves'
  | 'boots' | 'cigar' | 'pocket' | 'radio'

const g = (kind: NpcGearKind, variant?: string, extra: Partial<NpcGearSpec> = {}): NpcGearSpec => ({ kind, ...(variant ? { variant } : {}), ...extra })
let namedCache: Record<string, NpcGearSpec[]> | undefined

/** Pure, deterministic accessory data. Geometry and fitting live in npcGearModels. */
export function npcGearPlan(id: string, def?: NpcDef): NpcGearSpec[] {
  const out: NpcGearSpec[] = []
  const add = (...items: NpcGearSpec[]) => out.push(...items)
  if(def?.uniform?.badge&&!id.startsWith('brc_'))add(g('badge','uniform',{color:def.uniform.badge,slot:'chest'}))
  const community = def?.communityGear
  if (community === 'satchel') add(g('strap', 'satchel'), g('pouch', 'satchel', { side: 'right', slot: 'waist' }))
  if (community === 'clipboard') add(g('clipboard', undefined, { side: 'left' }))
  if (community === 'headphones') add(g('headset', 'headphones'))
  if (community === 'radio') add(g('headset', 'radio'))
  if (community === 'apron') add(g('apron'))
  if (community === 'tools') add(g('belt', 'tools', { slot: 'waist' }), g('pouch', 'tools', { slot: 'waist' }))
  if (community === 'book') add(g('book', undefined, { side: 'left' }))
  if (community === 'medic') add(g('pouch', 'medic', { slot: 'waist' }), g('badge', 'medic', { slot: 'chest' }))
  if (community === 'hardhat') add(g('hat', 'hardhat', { slot: 'head' }))

  // BRC staff: preserve the old early-return branch and work-loop tool semantics.
  if (id.startsWith('brc_')) {
    add(g('hat', 'beret'), g('badge', 'uniform', { slot: 'chest', color: def?.uniform?.badge }), g('epaulette', 'armor'), g('apron', 'uniform'), g('belt', 'uniform', { slot: 'waist' }), g('boots', 'uniform'))
    const wl = def?.workLoop
    if (wl === 'hammer' || wl === 'saw' || wl === 'paint' || wl === 'mop') add(g('tool', wl, { side: 'right' }))
    if (wl === 'paint') add(g('pouch', 'paint', { side: 'left' }))
    return out
  }
  // 重制杰瑞：肩头不再挂静态小鹦鹉——讲道时真正的鹉主（Entity 7 实体）会站上青鸟神父的肩头
  if (id === 'bluebird') return [...out, g('apron', 'robe'), g('hat', 'crown'), g('badge', 'medallion', { slot: 'chest' })]
  if (id === 'sinclair') return [...out, g('feather', 'blue', { slot: 'chest' }), g('badge', 'blue', { slot: 'chest' }), g('book', 'diary', { side: 'left' })]
  if (id.startsWith('jerry_') || def?.faction === 'jerry') return [...out, g('band', 'blue'), g('feather', 'blue'), g('badge', 'jerry', { slot: 'chest' })]
  if (id === 'joey') return [...out, g('guitar', 'electric'), g('glasses', 'sunglasses'), g('pen', 'pick', { side: 'right' })]

  // The registry is populated once, then shared by all NPC instances.
  if (!namedCache) namedCache = {
    barclay: [g('book', 'register', { side: 'left' })],
    petra: [g('keys', undefined, { slot: 'waist' }), g('clipboard', undefined, { side: 'right' })],
    otis: [g('belt', 'tools', { slot: 'waist' }), g('pouch', 'tools', { slot: 'waist' }), g('tool', 'wrench', { side: 'right' })],
    vivian: [g('band', 'headband'), g('badge', 'id', { slot: 'chest' })],
    margot: [g('tray', undefined, { side: 'right' }), g('cup', undefined, { side: 'right' })],
    harold: [g('glasses', 'round'), g('book', 'old', { side: 'left' })],
    amelia: [g('hat', 'flight'), g('goggles', 'pushed')],
    dorothy: [g('hat', 'formal'), g('necklace', 'pearls')],
    astor: [g('necklace', 'watch'), g('pocket', 'square', { slot: 'chest' })],
    smith: [g('hat', 'captain')],
    hoffa: [g('cigar'), g('scarf', 'lapel')],
    white: [g('collar', 'tudor'), g('necklace', 'chain')],
    northup: [g('book', 'notebook', { side: 'left' }), g('scarf', 'neck')],
    tiny: [g('hat', 'tar'), g('badge', 'tiny'), g('tool', 'spear', { side: 'right' })],
    kat: [g('clipboard', undefined, { side: 'left' })],
    justin: [g('cup', 'coffee', { side: 'right' })],
    nightingale: [g('headset', 'radio')],
    river: [g('glasses'), g('book', 'stack', { side: 'left' })],
    faust: [g('glasses'), g('gloves')],
    suanpan: [g('abacus', undefined, { side: 'left' })],
    tom: [g('hat', 'chef'), g('apron'),g('scarf','lapel')],
    aiko: [g('bow'), g('apron'), g('tool', 'axe', { side: 'right' })],
    martin: [g('hat', 'nurse'), g('badge', 'nurse', { slot: 'chest' })],
    dupont: [g('necklace', 'stethoscope')],
    lefevre: [g('goggles', 'pushed'), g('band', 'headband')],
    morel: [g('hat', 'surgical'), g('mask')],
    lecomte: [g('headset', 'single'), g('radio', undefined, { slot: 'chest' })],
    muller: [g('tool', 'net', { side: 'right' })],
    lan: [g('band', 'headscarf'), g('scarf', 'tails')],
    laozhangfang: [g('glasses', 'low'), g('book', 'ledger', { side: 'left' })],
    shen: [g('tool', 'magnifier', { side: 'left' })],
    tang: [g('abacus', 'waist', { slot: 'waist' })],
    kui: [g('strap', 'shoulder'), g('tool', 'baton', { slot: 'waist' })],
    candyman: [g('jar', 'candy', { side: 'right' })],
    // 北排主题小店（2026-10-23）
    mkt_blankenship: [g('pen', undefined), g('keys', undefined, { slot: 'waist' })],
    mkt_grant: [g('goggles', 'pushed'), g('gloves', undefined, { slot: 'waist' })],
    mkt_pinkney: [g('pen', 'gold', { slot: 'chest' }), g('pocket', 'square', { slot: 'chest' })],
    mkt_jorgensen: [g('hat', 'beret', { color: '#7a2a24', slot: 'head' }), g('scarf', 'neck')],
    shop_lyle: [g('pen', 'marker')],
    shop_dex: [g('gloves', undefined, { slot: 'waist' })],
    shop_benny: [g('hat', 'captain', { color: '#c6538a', slot: 'head' })],
    shop_mavis: [g('necklace', 'pearls')],
    shop_ingrid: [g('band', 'headband')],
    mccauley: [g('clipboard', undefined, { side: 'left' }), g('pen', 'whistle', { slot: 'chest' })],
    vesper: [g('scale', undefined, { side: 'left' }), g('pouch', 'money', { slot: 'waist' })],
    pidge: [g('tool', 'tapegun', { side: 'right' }), g('pen', 'marker', { slot: 'chest' })],
    boone: [g('towel', undefined, { slot: 'chest' }), g('gloves', undefined, { slot: 'waist' })],
    whitfield: [g('headset', 'single'), g('clipboard', undefined, { side: 'left' })],
    kowalski: [g('glasses', 'round'), g('tool', 'calculator', { side: 'left' })],
    dorian: [g('book', 'register', { side: 'left' }), g('pen', 'whistle', { slot: 'chest' })],
    gunter: [g('strap', 'shoulder'), g('tool', 'baton', { slot: 'waist' })],
    pippa: [g('clipboard', undefined, { side: 'left' }), g('pen', 'marker')],
    brandt: [g('clipboard', 'ration', { side: 'left' }), g('keys', undefined, { slot: 'waist' })],
    meilin: [g('book', 'notebook', { side: 'right' }), g('pen', undefined, { slot: 'chest' })],
    harper: [g('book', 'folder', { side: 'left' }), g('epaulette', 'director')],
    mateo: [g('cup', 'enamel', { side: 'right' })],
    isaac: [g('glasses'), g('clipboard', undefined, { side: 'left' })],
    aurora: [g('book', 'bluebinder', { side: 'left' })],
    whitaker: [g('clipboard', undefined, { side: 'left' }), g('pen', 'gold', { slot: 'chest' })],
    irene: [g('glasses'), g('jar', 'indexcards', { side: 'left' })],
    grove: [g('headset', 'headphones'), g('tool', 'screwdriver', { side: 'right' })],
    hobbs: [g('clipboard', undefined, { side: 'left' }), g('tool', 'tape', { slot: 'waist' })],
    saira: [g('badge', 'cross', { slot: 'chest' }), g('book', 'medical', { side: 'left' })],
    voss: [g('strap', 'shoulder'), g('badge', 'register', { slot: 'waist' })],
  }
  return [...out, ...(namedCache[id] ?? [])]
}

