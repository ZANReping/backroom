// Continuous office building. Region classification matches the active planner.
import type {GameMap} from './mapgen'
export type L4Variant='officehall'|'open'|'smallrooms'|'hall'
export const L4_HEIGHT=2.9
export const L4_TINT:Record<L4Variant,number>={officehall:51,open:52,smallrooms:54,hall:55}
/** The old void field remains false for terrain callers; no separate window region exists. */
export const l4VoidAt=(_seed:number,_x:number,_y:number)=>false
export function l4StyleAt(m:GameMap,x:number,y:number):L4Variant{
 const t=m.tint[Math.floor(y)*m.w+Math.floor(x)]
 return t===52?'open':t===54?'smallrooms':t===55?'hall':'officehall'
}
