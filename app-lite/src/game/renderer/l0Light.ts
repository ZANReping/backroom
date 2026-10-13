import {L0_HEIGHT,type L0Layout} from '../world/l0Architecture'

/** Cosine emission and incidence with softened inverse-square falloff.
 * No cone, rectangular cutoff or painted light mask. The baker integrates
 * this over the actual luminaire area and wall visibility. */
export function l0FixtureLight(l:L0Layout['lamps'][number],x:number,z:number,h:number,nx:number,ny:number,nz:number){
 if(l.off)return 0
 const dx=l.x-x,dz=l.y-z,d2=dx*dx+dz*dz,fall=Math.max(0,L0_HEIGHT-.035-h)
 const r2=d2+fall*fall,d=Math.sqrt(Math.max(.01,r2))
 // Continuous finite support avoids floor steps when nearest-lamp ranks swap.
 const range=Math.max(0,1-(d2/100)**2)**2
 const bounce=(ny<-.5&&h>L0_HEIGHT-.08?.27:.085)/(1+d2/12)
 if(fall<.015||ny<-.5)return bounce*range
 const incidence=Math.max(0,(nx*dx+ny*fall+nz*dz)/d)
 return (bounce+2.05*(fall/d)*incidence/(1+r2*.42))*range
}
