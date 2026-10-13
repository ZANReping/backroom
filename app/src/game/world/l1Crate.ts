import type {Structure} from '../core/types'
// A stack is one persistent shipping consignment/inventory. Adding a visible
// upper case never allocates another loot identity or regenerates its contents.
export const L1_CRATE={width:1.28,depth:.71,height:.68}
export function l1CrateCount(s:Structure){return Number(s.data?.l1Stack)===2?2:1}
