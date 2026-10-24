/** Bounded, terrain-only L7 chart retention. No live world objects are retained. */
export type L7ChartCell={cx:number;cy:number;seaFloor:Float32Array;liquid:Uint8Array;elev:Uint8Array}
const cells=new Map<string,L7ChartCell>(),LIMIT=384
const key=(seed:number,cx:number,cy:number)=>`${seed}:${cx},${cy}`
export function rememberL7ChartCell(seed:number,cell:L7ChartCell){
 const k=key(seed,cell.cx,cell.cy),old=cells.get(k)
 // A seed's seabed is immutable. Prefer the already retained arrays so loading
 // the same chunk again does not invalidate its derived contour geometry.
 const value=old??{cx:cell.cx,cy:cell.cy,seaFloor:cell.seaFloor,liquid:cell.liquid,elev:cell.elev}
 cells.delete(k);cells.set(k,value);while(cells.size>LIMIT)cells.delete(cells.keys().next().value!)
 return value
}
export function recalledL7ChartCell(seed:number,cx:number,cy:number){const k=key(seed,cx,cy),v=cells.get(k);if(v){cells.delete(k);cells.set(k,v)}return v}
export function l7ChartRetentionStats(){return{cells:cells.size,limit:LIMIT}}
export function clearL7ChartRetention(){cells.clear()}
