import atlas from './l11SignAtlas.json'
import type { L11Archetype } from './l11Buildings'
import { L11_INSPECTED_SIGNS } from './l11ReferenceSigns'

/** Complete generated sign faces, not additional prop/model archetypes. */
export const L11_SIGNS = atlas.faces
export const L11_SIGN_IDS = new Set([...L11_SIGNS,...L11_INSPECTED_SIGNS].map(s => s.id))
export const L11_BUILDING_SIGNS: Record<L11Archetype, readonly string[]> = {
  slab: ['ginkgo', 'residence'], balcony: ['ginkgo', 'residence'], courtyard: ['residence', 'ginkgo'],
  'corner-home': ['residence', 'ginkgo'], townhouse: ['residence'], detached: ['residence'],
  'curtain-tower': ['business', 'offices'], 'ribbon-office': ['offices', 'business'], 'fin-office': ['business', 'offices'],
  'setback-office': ['business'], 'rounded-office': ['offices'], 'twin-office': ['offices', 'business'],
  'strip-shops': ['bakery', 'cafe', 'produce', 'books', 'store'],
  'corner-shops': ['cafe', 'books', 'bakery', 'store', 'produce'],
  'court-shops': ['books', 'cafe', 'store', 'bakery'], supermarket: ['supermarket'], parking: ['parking'], hotel: ['hotel'],
  sawtooth: ['workshop'], 'brick-factory': ['workshop'], warehouse: ['warehouse'], workshop: ['repair'],
  substation: ['civic'], 'pump-house': ['waterworks'], archive: ['archive'], school: ['school'], museum: ['museum'],
  'sports-hall': ['sports'], 'transit-station': ['bus'], municipal: ['civic'],
  'unfinished-frame': ['workshop'], 'barred-brick': ['repair'],
}

export function l11SignHash(id: string): number {
  let n = 2166136261
  for (let i = 0; i < id.length; i++) n = Math.imul(n ^ id.charCodeAt(i), 16777619)
  return n >>> 0
}

export function l11BuildingSign(archetype: L11Archetype, seed: number): string {
  const choices = L11_BUILDING_SIGNS[archetype]
  return choices[l11SignHash(`${seed}:sign`) % choices.length]
}

export function l11StreetSign(instanceId: string): string {
  // All fixtures belonging to one planned road keep the same name, including
  // opposite sides, macroregion overlap and revisited decorative revisions.
  const roadId = instanceId.split(':street:')[0].split(':junction:')[0]
  return ['canal-road', 'ginkgo-street', 'archive-road', 'ring-road', 'hope'][l11SignHash(roadId) % 5]
}
