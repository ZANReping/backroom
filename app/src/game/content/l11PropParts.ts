import { l11DecorDef } from './l11Decor'
import { L11PropBuilder, type L11PropPart } from './l11PropKit'
import { l11MunicipalParts } from './l11MunicipalParts'
import { l11CommerceParts } from './l11CommerceParts'
import { l11WaterfrontParts } from './l11WaterfrontParts'
import { l11ServiceParts } from './l11ServiceParts'
import { l11InteriorParts } from './l11InteriorParts'
import { l11VerticalSignParts } from './l11VerticalSignParts'
import { l11RetailParts } from './l11RetailParts'
const cache=new Map<string,L11PropPart[]>()
export function l11PropParts(id:string):readonly L11PropPart[]{
  const hit=cache.get(id);if(hit)return hit
  const def=l11DecorDef(id);if(!def)return []
  const b=new L11PropBuilder(def),key=id.slice(4)
  if(![l11MunicipalParts,l11CommerceParts,l11WaterfrontParts,l11ServiceParts,l11InteriorParts,l11VerticalSignParts,l11RetailParts].some(build=>build(key,b)))throw Error(`Missing registered L11 model: ${id}`)
  if(!def.solid)for(const p of b.parts)p.solid=false
  cache.set(id,b.parts);return b.parts
}
