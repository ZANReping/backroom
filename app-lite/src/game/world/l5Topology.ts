import type { GameMap } from './mapgen'

/** Read the generated stairwell, never infer a direction from its own solid rails. */
export function l5StairWallDirection(m: GameMap, e: {x:number;y:number}): [number,number] | null {
  const x=Math.floor(e.x),y=Math.floor(e.y)
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
    let valid=true
    for(let n=1;n<=3;n++){
      const xx=x+dx*n,yy=y+dy*n
      if(xx<0||yy<0||xx>=m.w||yy>=m.h||m.elev[yy*m.w+xx]!==4){valid=false;break}
    }
    if(valid)return[-dx,-dy]
  }
  return null
}
