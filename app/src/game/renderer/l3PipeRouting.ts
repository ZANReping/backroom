/** A wall corner is shared by two runs. Both straights stop at tangent points;
 * only the X run emits the quarter-circle, including at streamed chunk seams. */
export function l3PipeTurn(
  axis:'x'|'z', wall:number, end:number, inward:number, side:number,
  usable:(x:number,z:number)=>boolean,
):{concave:boolean;otherSide:number;otherInward:number}|null {
  const x=Math.round(axis==='x'?end:wall),z=Math.round(axis==='x'?wall:end)
  const cells=[[-1,-1],[0,-1],[-1,0],[0,0]]
  const count=cells.filter(([dx,dz])=>usable(x+dx,z+dz)).length
  if(count!==1&&count!==3)return null
  const concave=count===1
  const otherSide=concave?-inward:inward,otherInward=concave?-side:side
  // The perpendicular run must have an actual walkable mounting face.
  const px=axis==='x'?x-otherSide*.5:x+otherInward*.5
  const pz=axis==='x'?z+otherInward*.5:z-otherSide*.5
  if(!usable(Math.floor(px),Math.floor(pz)))return null
  return {concave,otherSide,otherInward}
}

export function l3PipeElbow(axis:'x'|'z',wall:number,end:number,inward:number,side:number,
  turn:NonNullable<ReturnType<typeof l3PipeTurn>>,inset:number,y:number){
  const d=.015+inset,radius=turn.concave?.12:d+.06
  const trim=(turn.concave?d:-d)+radius
  const ix=axis==='x'?end-turn.otherSide*d:wall-side*d
  const iz=axis==='x'?wall-side*d:end-turn.otherSide*d
  const u=axis==='x'?[inward,0]:[0,inward]
  const v=axis==='x'?[0,turn.otherInward]:[turn.otherInward,0]
  const cx=ix+(u[0]+v[0])*radius,cz=iz+(u[1]+v[1])*radius
  const points:number[][]=[]
  for(let i=0;i<=8;i++){
    const a=i/8*Math.PI/2
    points.push([cx-radius*(v[0]*Math.cos(a)+u[0]*Math.sin(a)),y,cz-radius*(v[1]*Math.cos(a)+u[1]*Math.sin(a))])
  }
  return {trim,points}
}
