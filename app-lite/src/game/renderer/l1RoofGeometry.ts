import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { GameMap } from '../world/mapgen'
import { l1RoofAt, l1StyleAt, l1VaultAt } from '../world/l1Architecture'
import type { TerrainRange } from './geometry'

/** Roof backs and bulkheads belong to terrain, including maintenance and split transition ranges. */
export function buildL1RoofClosure(m:GameMap,range:TerrainRange,fallback:number):THREE.BufferGeometry|null {
  const geos:THREE.BufferGeometry[]=[]
  for(let z=range.y0;z<range.y1;z++)for(let x=range.x0;x<range.x1;x++){
    const i=z*m.w+x
    if(m.tiles[i]!==1||m.outdoor[i]===1||m.up[i]===1||m.up2[i]===1)continue
    const h=l1RoofAt(m,x+.5,z+.5,fallback),style=l1StyleAt(m,x+.5,z+.5)
    const skylight=style==='garden'&&m.lights.some(l=>l.keep===1&&Math.abs(l.x-x-.5)<1.35&&Math.abs(l.y-z-.5)<1.75)
    if(!skylight){
      const cap=new THREE.PlaneGeometry(1,1)
      cap.rotateX(-Math.PI/2);cap.translate(x+.5,h+.12,z+.5);geos.push(cap)
    }
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,nz=z+dz
      if(nx<0||nz<0||nx>=m.w||nz>=m.h)continue
      const nh=l1RoofAt(m,nx+.5,nz+.5,fallback)
      if(h<=nh+.05)continue // Higher side owns the only bulkhead, even beside a maintenance wall.
      const ex=x+.5+dx*.5,ez=z+.5+dz*.5
      let bottom=nh
      if(style==='gothic'||l1StyleAt(m,nx+.5,nz+.5)==='gothic'){
        for(const t of [-.5,0,.5])bottom=Math.min(bottom,l1VaultAt(m,ex+(dz?t:0),ez+(dx?t:0)))
      }
      const top=h+.14,lo=bottom-.02
      const fascia=new THREE.BoxGeometry(dx?.14:1.02,top-lo,dz?.14:1.02)
      fascia.translate(ex,(top+lo)/2,ez);geos.push(fascia)
    }
  }
  if(!geos.length)return null
  const result=mergeGeometries(geos)
  for(const geo of geos)geo.dispose()
  return result
}
