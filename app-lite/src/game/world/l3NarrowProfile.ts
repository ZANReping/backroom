// One clear metre at the floor; the curved wall bulges into the masonry instead
// of narrowing the player's feet. The same crown defines rendering and headroom.
export const L3_NARROW_HALF_WIDTH=.62
export const L3_NARROW_SPRING=1.25
export const L3_NARROW_RISE=1.28
export function l3NarrowRoof(offset:number){
  return L3_NARROW_SPRING+L3_NARROW_RISE*Math.sqrt(Math.max(0,1-(offset/L3_NARROW_HALF_WIDTH)**2))
}
export function l3NarrowProfile():number[][]{
  const points:number[][]=[]
  // Smooth lower sides terminate exactly at ground level, not above the floor.
  for(let i=0;i<=12;i++){
    const y=L3_NARROW_SPRING*i/12
    points.push([-(.5+.12*Math.sin(i/12*Math.PI/2)),y])
  }
  for(let i=1;i<=36;i++){
    const t=-Math.PI/2+i/36*Math.PI
    points.push([Math.sin(t)*L3_NARROW_HALF_WIDTH,L3_NARROW_SPRING+Math.cos(t)*L3_NARROW_RISE])
  }
  for(let i=11;i>=0;i--)points.push([.5+.12*Math.sin(i/12*Math.PI/2),L3_NARROW_SPRING*i/12])
  return points
}
