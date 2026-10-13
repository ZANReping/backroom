import type {L0Layout} from '../world/l0Architecture'
import {l0LightBlocked} from './l0LightingBake'
export const l0FlickerTime={value:0}
/** Animated irradiance basis: actual wall UVs, wall normals and occlusion.
 * Computed once per vertex; no transparent overlay or additional light pass. */
export function createL0FlickerSampler(layouts:L0Layout[]){
 const sources=layouts.flatMap(a=>a.flickers??[]).map(s=>({...s,lx:s.x+s.nx*.10,ly:s.y+s.ny*.10,walls:layouts.flatMap(a=>a.walls).filter(w=>w.x<s.x+5&&w.x+w.w>s.x-5&&w.y<s.y+5&&w.y+w.h>s.y-5)}))
 return(x:number,z:number,h:number,nx:number,ny:number,nz:number):[number,number,number,number]=>{
  let strength=0,phase=0,alongWall=1000,onWall=0,best=Infinity
  for(const s of sources){
   if(Math.abs(x-s.x)>5||Math.abs(z-s.y)>5)continue
   const facing=nx*s.nx+nz*s.ny,plane=(x-s.x)*s.nx+(z-s.y)*s.ny,along=(x-s.x)*s.ny-(z-s.y)*s.nx
   let v=0
   const dx=s.lx-x,dz=s.ly-z,dh=1.18-h,d2=dx*dx+dz*dz+dh*dh,d=Math.sqrt(Math.max(.01,d2))
   if(plane>0&&d<5&&!s.walls.some(w=>l0LightBlocked(w,x+nx*.015,z+nz*.015,s.lx,s.ly,h+ny*.015,1.18))){
    const incidence=Math.max(0,(nx*dx+ny*dh+nz*dz)/d),emission=Math.max(0,(-dx*s.nx-dz*s.ny)/d)
    v+=1.3*incidence*emission*(1-d/5)**2/(.5+d2*.7)
   }
   if(d2<best){best=d2;strength=v;phase=s.phase;alongWall=along;onWall=facing>.9&&Math.abs(plane)<.015?1:0}
  }
  return[strength,phase,alongWall,onWall]
 }
}
