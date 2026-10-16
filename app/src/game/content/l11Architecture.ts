import type { L11Archetype } from './l11Buildings'
import type { L11Volume } from '../world/l11Types'
import type { L11FacadeProfile } from '../world/l11ReferenceDistrict'
import { l11QuayWing } from '../world/l11QuayWing'
import { l11Twins } from '../world/l11Twins'

/** Reusable building programs. Showcase coordinates never enter this catalog. */
export type L11Architecture='pier-retail'|'stone-terrace'|'glazed-terrace'|'canal-portico'|'quay-service-wing'|'ribbon-twins'|'brick-housing'|'blue-retail'|'service-loft'
export const L11_ARCHITECTURE:Record<L11Architecture,{profile:L11FacadeProfile;archetypes:readonly L11Archetype[]}>={
  'pier-retail':{profile:'civic-piers',archetypes:['fin-office','ribbon-office']},
  'stone-terrace':{profile:'sandstone-grid',archetypes:['setback-office','hotel','municipal']},
  'glazed-terrace':{profile:'bronze-curtain',archetypes:['fin-office','curtain-tower','rounded-office']},
  'canal-portico':{profile:'green-curtain',archetypes:['curtain-tower']},
  'quay-service-wing':{profile:'service-wall',archetypes:['ribbon-office']},
  'ribbon-twins':{profile:'white-ribbon',archetypes:['twin-office','ribbon-office']},
  'brick-housing':{profile:'brick-apartments',archetypes:['slab','balcony']},
  'blue-retail':{profile:'white-ribbon',archetypes:['strip-shops','corner-shops','court-shops','supermarket']},
  'service-loft':{profile:'sandstone-grid',archetypes:['workshop','brick-factory']},
}
export function l11ArchitectureFor(archetype:L11Archetype,seed:number):L11Architecture|undefined{
  const list=(Object.keys(L11_ARCHITECTURE) as L11Architecture[]).filter(k=>L11_ARCHITECTURE[k].archetypes.includes(archetype))
  return seed%4===0?undefined:list[(seed>>>4)%list.length]
}
export function l11ArchitectureVolumes(recipe:L11Architecture,w:number,d:number,floors:number,front:'n'|'s'|'e'|'w'='e'):L11Volume[]{
  const H=floors*3
  if(recipe==='quay-service-wing'){
    const q=l11QuayWing(w,d,front)
    return [{...q.rect(0,q.projection,q.span,q.depth-q.projection,0,H),facadeProfile:'service-wall'},
      {...q.rect(0,0,q.wing,q.projection,0,H),facadeProfile:'green-curtain'}]
  }
  if(recipe==='ribbon-twins'){
    // Two real slabs, blue inward-facing elevations and air between them.
    // Only the low shared podium and the rooftop passage cross the courtyard.
    const q=l11Twins(w,d,front)
    return [
      {x:0,y:0,w,d,lo:0,hi:6},
      {...q.rect(0,0,q.start,q.depth,6,H),faceProfiles:{[q.inwardFirst]:'glazed-core'}},
      {...q.rect(q.end,0,q.span-q.end,q.depth,6,H),faceProfiles:{[q.inwardSecond]:'glazed-core'}},
      {...q.rect(q.start,0,q.gap,q.linkDepth,H-3,H),soffit:true},
    ]
  }
  if(recipe==='blue-retail')return [{x:0,y:0,w,d,lo:0,hi:9},{x:w*.08,y:d*.15,w:w*.84,d:d*.85,lo:9,hi:Math.max(12,H)}]
  return [{x:0,y:0,w,d,lo:0,hi:H}]
}
