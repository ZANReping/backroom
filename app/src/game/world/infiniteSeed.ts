/** Pure placement identities shared by streamed content and bake workers.
 * Do not import the live world/entity registry into the architecture worker. */
export const RS=8
export function h32(...nums:number[]):number {
 let h=0x811c9dc5
 for(const n of nums){h^=n>>>0;h=Math.imul(h,0x01000193);h^=h>>>13;h=Math.imul(h,0x85ebca6b);h^=h>>>16}
 return h>>>0
}
export function regionHost(seed:number,rx:number,ry:number){
 return {cx:rx*RS+h32(seed,0xe11,rx,ry)%RS,cy:ry*RS+h32(seed,0xe12,rx,ry)%RS}
}
export function exitTarget(seed:number,cx:number,cy:number){
 return {x:6+h32(seed,0xe21,cx,cy)%20,y:6+h32(seed,0xe22,cx,cy)%20}
}
