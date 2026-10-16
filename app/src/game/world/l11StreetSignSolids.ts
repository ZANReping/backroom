import type {Structure} from '../core/types'
import {l11StreetSign} from '../content/l11Signs'
import {l11BoxSolid} from './l11Solid'

/** Printed plates project beyond the support pole. Keep their top/side
 * collision identical before and after rendering, including the Hope plate. */
export function l11StreetSignSolids(s:Structure){
  const id=String(s.data?.signId??'')
  if(s.kind==='l11_signal'&&id==='hope')return [l11BoxSolid(0,4.05,0,1.265,.455,.16)]
  if(s.kind!=='l11_street_name')return []
  const name=id||l11StreetSign(String(s.data?.instanceId??'design-road'))
  return [l11BoxSolid(0,2.4,0,1.635,name==='hope'?.585:.355,.1)]
}
